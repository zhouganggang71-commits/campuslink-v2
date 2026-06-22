import { NextFunction, Request, Response } from "express";
/**
 * 课表导入：PDF 解析 / OCR 识别（PaddleOCR 优先，Tesseract 降级）
 */
import fs from 'fs';
import { execFile } from 'child_process';
import path from 'path';
import { logger } from '../../utils/logger';
import { auth } from '../middleware/auth';
import { limiter } from '../middleware/limiter';
import { ErrorCode } from '../errors';
import { CircuitBreaker } from '../circuitBreaker';
import { ok, fail } from '../response';
import { COURSE_COLORS } from '../../types';

const WEEKDAY_NAMES = [
  '周一',
  '周二',
  '周三',
  '周四',
  '周五',
  '周六',
  '周日',
  '星期一',
  '星期二',
  '星期三',
  '星期四',
  '星期五',
  '星期六',
  '星期日',
];

// ── OCR 并发控制（单机 N100，限制同时处理数）──
let ocrRunning = 0;
const MAX_OCR = 2;
const ocrQueue: Array<() => void> = [];

// 外部 AI 识图 API 熔断器
const aiApiBreaker = new CircuitBreaker({ name: 'MiMo-Vision', failureThreshold: 3, resetTimeout: 30000 });

function ocrSlot(): Promise<void> {
  return new Promise((resolve) => {
    if (ocrRunning < MAX_OCR) {
      ocrRunning++;
      resolve();
    } else {
      ocrQueue.push(() => {
        ocrRunning++;
        resolve();
      });
    }
  });
}
function ocrDone() {
  ocrRunning--;
  const next = ocrQueue.shift();
  if (next) next();
}

// ── 异步任务存储 ──
const ocrTasks = new Map<
  string,
  { status: 'processing' | 'done' | 'error'; courses?: any[]; rawText?: string; error?: string }
>();

export function registerScheduleRoutes(app: any, pdfUpload: any, imageUpload: any) {
  // ── PDF 课表导入 ──
  app.post('/api/v1/parse-schedule', auth, limiter(5), pdfUpload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) return fail(res, 400, '请上传课表文件');
      const ext = req.file.originalname?.toLowerCase().split('.').pop();
      if (ext !== 'pdf' || req.file.mimetype !== 'application/pdf') return fail(res, 400, '仅支持 PDF 格式');

      let PDFParse: any;
      try {
        const mod = await import('pdf-parse');
        PDFParse = mod.PDFParse || mod.default;
      } catch {
        return fail(res, 503, 'PDF 解析服务暂不可用', ErrorCode.SERVICE_UNAVAILABLE);
      }

      const data = await PDFParse(req.file.buffer);
      const text = data.text;
      if (!text || text.length < 20) {
        return fail(res, 400, 'PDF 未提取到文本，可能是扫描件，请使用拍照导入');
      }

      const courses = parsePdfSchedule(text);
      logger.business('PDF解析完成', {
        pages: data.numpages,
        textLen: text.length,
        courses: courses.length,
        trace_id: req._traceId,
      });
      ok(res, { courses, rawText: text.substring(0, 3000) });
    } catch (err: any) {
      logger.error('PDF解析失败', { error: err.message, stack: err.stack, trace_id: req._traceId});
      fail(res, 500, '解析失败，请确认是教务系统导出的 PDF 文件');
    }
  });

  // ── OCR 图片识别（异步）──
  app.post(
    '/api/v1/ocr-schedule',
    auth,
    limiter(10),
    (req: Request, res: Response, next: NextFunction) => {
      imageUpload.single('file')(req, res, (err: any) => {
        if (err) {
          logger.error('OCR 文件上传失败', { message: err.message, code: err.code, trace_id: req._traceId});
          return fail(res, 400, err.code === 'LIMIT_FILE_SIZE' ? '图片不能超过10MB' : '上传失败');
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      if (!req.file) return fail(res, 400, '请上传课表图片');

      const taskId = `ocr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      ocrTasks.set(taskId, { status: 'processing' });

      logger.business('OCR任务创建', { taskId, file: req.file.originalname, size: req.file.size, trace_id: req._traceId });

      // 异步处理
      processOCR(taskId, req.file.path);

      ok(res, { taskId });
    },
  );

  // ── OCR 结果轮询 ──
  app.get('/api/v1/ocr-schedule/:taskId', auth, (req: Request, res: Response) => {
    const task = ocrTasks.get(String(req.params.taskId));
    if (!task) return fail(res, 404, '任务不存在或已过期');
    ok(res, task);
    // 完成后 5 分钟清理
    if (task.status === 'done' || task.status === 'error') {
      setTimeout(() => ocrTasks.delete(String(req.params.taskId)), 300000);
    }
  });

  // 每 10 分钟清理超过 15 分钟的 stale 任务，防止内存泄漏
  setInterval(() => {
    const now = Date.now();
    for (const [id] of ocrTasks) {
      const ts = parseInt(id.split('-')[1], 36);
      if (now - ts > 900000) ocrTasks.delete(id);
    }
  }, 600000);

  // ── 学生证识图 ──
  app.post(
    '/api/v1/ocr-student-id',
    auth,
    limiter(2),
    (req: Request, res: Response, next: NextFunction) => {
      imageUpload.single('file')(req, res, (err: any) => {
        if (err) return fail(res, 400, '上传失败');
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        if (!req.file) return fail(res, 400, '请上传学生证照片');

        const imageBuffer = await fs.promises.readFile(req.file.path);
        const imageBase64 = imageBuffer.toString('base64');
        const mime = req.file.originalname?.toLowerCase().endsWith('png') ? 'image/png' : 'image/jpeg';

        const apiKey = process.env.MIMO_API_KEY;
        if (!apiKey) return fail(res, 503, '识图服务未配置');

        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 15000);
        let resp: any;
        try {
          resp = await aiApiBreaker.exec(async () => {
            return fetch('https://api.xiaomimimo.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: 'xiaomi/mimo-v2.5',
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'image_url', image_url: { url: `data:${mime};base64,${imageBase64}` } },
                    {
                      type: 'text',
                      text: '识别学生证照片，返回JSON：{"name":"姓名","studentId":"学号","department":"院系","confidence":"high|medium|low"}。只有完整清晰的学生证正面是high，模糊/遮挡/非学生证为low',
                    },
                  ],
                },
              ],
              max_tokens: 500,
            }),
            signal: ctrl.signal,
          });
        });
      } finally {
          clearTimeout(timer);
        }

        if (!resp.ok) {
          const errText = await resp.text().catch(() => '');
          logger.error('学生证识图 API 异常', { status: resp.status, body: errText.slice(0, 300), trace_id: req._traceId});
          return fail(res, 502, '识图服务异常');
        }

        const body = await resp.json();
        const raw = body.choices?.[0]?.message?.content || '';
        let result = { name: '', studentId: '', department: '', confidence: 'low' as string };
        try {
          const m = raw.match(/\{[\s\S]*\}/);
          if (m) result = { ...result, ...JSON.parse(m[0]) };
        } catch {
          logger.warn('学生证 JSON 解析失败', { raw: raw.slice(0, 200) });
        }

        logger.business('学生证识图', { user_id: req.userId, confidence: result.confidence, trace_id: req._traceId });
        ok(res, { ...result, verified: result.confidence === 'high' });
      } catch (err: any) {
        logger.error('学生证识图失败', { error: err.message, stack: err.stack, trace_id: req._traceId});
        fail(res, 500, '识别失败');
      } finally {
        if (req.file?.path)
          fs.unlink(req.file!.path, (e) => {
            if (e) logger.warn('学生证文件清理失败', { path: req.file!.path, err: e.message });
          });
      }
    },
  );
}

/** 调用 PaddleOCR Python 脚本 */
function runPaddleOCR(imagePath: string): Promise<{ courses: any[]; rawText: string }> {
  return new Promise((resolve, reject) => {
    const scriptDir = path.join(process.cwd(), 'scripts');
    const script = path.join(scriptDir, 'ocr_schedule.py');
    const python = path.join(scriptDir, 'venv', 'bin', 'python3');
    const pythonBin = fs.existsSync(python) ? python : 'python3';

    if (!fs.existsSync(script)) return reject(new Error('PaddleOCR 脚本不存在'));

    execFile(
      pythonBin,
      [script, imagePath],
      {
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, LD_LIBRARY_PATH: path.join(scriptDir, 'venv', 'lib'), OMP_NUM_THREADS: '2' },
      },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr || err.message));
          return;
        }
        try {
          const result = JSON.parse(stdout.trim());
          if (result.error) return reject(new Error(result.error));
          resolve({ courses: result.courses || [], rawText: result.rawText || '' });
        } catch {
          reject(new Error('PaddleOCR JSON 解析失败'));
        }
      },
    );
  });
}

/** Tesseract 降级 OCR */
async function runTesseractOCR(imagePath: string): Promise<{ courses: any[]; rawText: string }> {
  let Tesseract: any, sharp: any;
  try {
    Tesseract = (await import('tesseract.js')).default;
    sharp = (await import('sharp')).default;
  } catch {
    throw new Error('Tesseract 服务暂不可用');
  }

  const processed = await sharp(imagePath)
    .resize(3000, 3000, { fit: 'inside', withoutEnlargement: true })
    .greyscale()
    .median(3)
    .normalize()
    .sharpen({ sigma: 1.5, m2: 0.5 })
    .toBuffer();

  const { data: ocrData } = await Tesseract.recognize(processed, 'chi_sim+eng', {
    tessedit_pageseg_mode: '6',
  });

  const rawText = ocrData.text;
  const courses = parseScheduleText(rawText);
  return { courses, rawText };
}

/** OCR 后台处理 */
async function processOCR(taskId: string, imagePath: string) {
  await ocrSlot();
  const startTime = Date.now();
  try {
    let courses: any[] = [];
    let rawText = '';
    try {
      const result = await runPaddleOCR(imagePath);
      courses = result.courses || [];
      rawText = result.rawText || '';
      if (courses.length > 0) {
        logger.business('PaddleOCR识别成功', { taskId, count: courses.length, duration: `${Date.now() - startTime}ms` });
      }
    } catch (paddleErr: any) {
      logger.warn('PaddleOCR 不可用，降级 Tesseract', { taskId, error: paddleErr.message });
      try {
        const tesseractResult = await runTesseractOCR(imagePath);
        courses = tesseractResult.courses;
        rawText = tesseractResult.rawText;
        logger.business('Tesseract OCR 识别成功', {
          taskId,
          count: courses.length,
          duration: `${Date.now() - startTime}ms`,
        });
      } catch (tessErr: any) {
        logger.error('Tesseract 也无法识别', { taskId, error: tessErr.message });
        ocrTasks.set(taskId, { status: 'error', error: 'OCR 识别失败' });
        return;
      }
    }
    ocrTasks.set(taskId, { status: 'done', courses, rawText });
  } catch (err: any) {
    logger.error('OCR后台处理异常', { taskId, error: err.message });
    ocrTasks.set(taskId, { status: 'error', error: err.message });
  } finally {
    ocrDone();
    fs.unlink(imagePath, (e) => {
      if (e) logger.warn('OCR 文件清理失败', { path: imagePath, err: e.message });
    });
  }
}

/** 从 PDF 文本解析课程 */
function parsePdfSchedule(text: string) {
  const courses: any[] = [];
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const pattern = new RegExp(
    `(.{2,20}?)\\s+` +
      `([^\\s]{2,10}(?:老师|教授|教练|导师)?)\\s+` +
      `([^\\s]{2,20})\\s+` +
      `(周[一二三四五六日])\\s*` +
      `(\\d+)[-~](\\d+)节\\s*` +
      `([单双]周)?\\s*` +
      `(?:(\\d+)[-~](\\d+)周)?`,
  );

  let matched = false;
  for (const line of lines) {
    const m = line.match(pattern);
    if (m) {
      matched = true;
      const name = (m[1] || '').trim();
      const teacher = (m[2] || '').replace(/(老师|教授|教练|导师)$/, '');
      const classroom = (m[3] || '').trim();
      const weekdayIdx = WEEKDAY_NAMES.indexOf(m[4]);
      let weekType: string = 'all';
      if (m[7]) weekType = m[7] === '单周' ? 'odd' : 'even';
      courses.push({
        name,
        teacher,
        classroom,
        weekday: weekdayIdx >= 0 ? (weekdayIdx % 7) + 1 : 1,
        startPeriod: parseInt(m[5]) || 1,
        periodSpan: Math.max(1, (parseInt(m[6]) || 2) - (parseInt(m[5]) || 1) + 1),
        weekStart: parseInt(m[8]) || 1,
        weekEnd: parseInt(m[9]) || 18,
        weekType,
        courseType: 'theory',
        colorClass: COURSE_COLORS[courses.length % COURSE_COLORS.length],
      });
    }
  }

  if (!matched) {
    const loose = /(.{2,20}?)\s+周([一二三四五六日])\s+(\d+)[-~](\d+)/;
    for (const line of lines) {
      const m = line.match(loose);
      if (m) {
        const weekdayIdx = WEEKDAY_NAMES.indexOf(`周${m[2]}`);
        courses.push({
          name: (m[1] || '').trim(),
          teacher: '',
          classroom: '',
          weekday: weekdayIdx >= 0 ? (weekdayIdx % 7) + 1 : 1,
          startPeriod: parseInt(m[3]) || 1,
          periodSpan: Math.max(1, (parseInt(m[4]) || 2) - (parseInt(m[3]) || 1) + 1),
          weekStart: 1,
          weekEnd: 18,
          weekType: 'all',
          courseType: 'theory',
          colorClass: COURSE_COLORS[courses.length % COURSE_COLORS.length],
        });
      }
    }
  }
  return courses;
}

/** 从 OCR 文本解析课程 */
function parseScheduleText(text: string) {
  const courses: any[] = [];
  // 预处理：修复 OCR 常见错误
  const cleaned = text
    .replace(/周\s*一/g, '周一')
    .replace(/周\s*二/g, '周二')
    .replace(/周\s*三/g, '周三')
    .replace(/周\s*四/g, '周四')
    .replace(/周\s*五/g, '周五')
    .replace(/周\s*六/g, '周六')
    .replace(/周\s*日/g, '周日')
    .replace(/星期\s*一/g, '星期一')
    .replace(/星期\s*二/g, '星期二')
    .replace(/星期\s*三/g, '星期三')
    .replace(/星期\s*四/g, '星期四')
    .replace(/星期\s*五/g, '星期五')
    .replace(/星期\s*六/g, '星期六')
    .replace(/星期\s*日/g, '星期日')
    .replace(/周—/g, '周一')
    .replace(/周二二/g, '周二')
    .replace(/周王/g, '周五')
    .replace(/[\t,，;；]/g, ' ')
    .replace(/\s+/g, ' ');

  const lines = cleaned
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const weekdayMap: Record<string, number> = {
    周一: 1,
    周二: 2,
    周三: 3,
    周四: 4,
    周五: 5,
    周六: 6,
    周日: 7,
    星期一: 1,
    星期二: 2,
    星期三: 3,
    星期四: 4,
    星期五: 5,
    星期六: 6,
    星期日: 7,
  };

  for (const line of lines) {
    const m1 = line.match(
      /(.{1,30}?)\s+([^\s]{2,10}(?:老师|教授|教练|导师))\s+([^\s]{1,30})\s+周([一二三四五六日])\s+(\d+)[-~](\d+)节?/,
    );
    const m2 = line.match(/(.{1,30}?)\s+([^\s]{1,10})\s+周([一二三四五六日])\s+(\d+)[-~](\d+)/);
    const m3 = line.match(/(.{1,30}?)\s+(周[一二三四五六日]|星期[一二三四五六日])\s+(\d+)[-~](\d+)/);
    const m = m1 || m2 || m3;
    if (m) {
      let name: string, teacher: string, classroom: string, weekday: number, startPeriod: number, periodSpan: number;
      if (m1) {
        name = m1[1].trim();
        teacher = m1[2].replace(/(老师|教授|教练|导师)$/, '').trim();
        classroom = m1[3].trim();
        weekday = weekdayMap[`周${m1[4]}`] || 1;
        startPeriod = parseInt(m1[5]) || 1;
        periodSpan = Math.max(1, (parseInt(m1[6]) || 2) - (parseInt(m1[5]) || 1) + 1);
      } else if (m2) {
        name = m2[1].trim();
        teacher = m2[2].trim();
        classroom = '未知教室';
        weekday = weekdayMap[`周${m2[3]}`] || 1;
        startPeriod = parseInt(m2[4]) || 1;
        periodSpan = Math.max(1, (parseInt(m2[5]) || 2) - (parseInt(m2[4]) || 1) + 1);
      } else {
        // m3: 最简格式
        name = (m3 as RegExpMatchArray)[1].trim();
        teacher = '';
        classroom = '未知教室';
        weekday = weekdayMap[(m3 as RegExpMatchArray)[2]] || 1;
        startPeriod = parseInt((m3 as RegExpMatchArray)[3]) || 1;
        periodSpan = Math.max(
          1,
          (parseInt((m3 as RegExpMatchArray)[4]) || 2) - (parseInt((m3 as RegExpMatchArray)[3]) || 1) + 1,
        );
      }
      courses.push({
        name,
        teacher,
        classroom,
        weekday,
        startPeriod,
        periodSpan,
        weekStart: 1,
        weekEnd: 18,
        weekType: 'all',
        courseType: 'theory',
        colorClass: COURSE_COLORS[courses.length % COURSE_COLORS.length],
      });
    }
  }
  return courses;
}
