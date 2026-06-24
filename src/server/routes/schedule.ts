/**
 * 课表导入：PDF 解析 + HTML 粘贴解析
 */
import { Request, Response, NextFunction } from "express";
import fs from 'fs';
import path from 'path';
import { logger } from '../../utils/logger';
import { auth } from '../middleware/auth';
import { limiter } from '../middleware/limiter';
import { ErrorCode } from '../errors';
import { ok, fail } from '../response';

const WEEKDAY_MAP: Record<string, number> = {
  '一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'日':7,
  '1':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,
};

function getWeekday(s: string): number {
  return WEEKDAY_MAP[s.replace(/[^一二三四五六日\d]/g,'').slice(0,1)] || 0;
}

function parseTimeRange(raw: string): { start: number; span: number } | null {
  const m = raw.match(/(\d+)\s*[-~至到]\s*(\d+)/);
  if (!m) return null;
  const a = parseInt(m[1]), b = parseInt(m[2]);
  if (a < 1 || b > 14 || a >= b) return null;
  return { start: a, span: b - a + 1 };
}

function parseWeeks(raw: string): { weekStart: number; weekEnd: number; weekType: string } {
  const wk = raw.replace(/[^0-9,\-~\s单双全周]/g,'').trim();
  let type = 'all';
  if (/单/.test(raw)) type = 'odd';
  if (/双/.test(raw)) type = 'even';
  const m = wk.match(/(\d+)\s*[-~]\s*(\d+)/);
  if (m) return { weekStart: parseInt(m[1]), weekEnd: parseInt(m[2]), weekType: type || 'all' };
  const s = wk.match(/\d+/g);
  if (s && s.length === 2) return { weekStart: parseInt(s[0]), weekEnd: parseInt(s[1]), weekType: type || 'all' };
  return { weekStart: 1, weekEnd: 18, weekType: type || 'all' };
}

function parseScheduleText(text: string) {
  const lines = text.split(/[\r\n]+/).filter(Boolean);
  const courses: any[] = [];
  const seen = new Set<string>();

  // 尝试多种分隔策略
  for (const strategy of [
    // 策略1: 制表符/Tab 分隔
    (line: string) => line.split('\t').filter(Boolean),
    // 策略2: 2个以上空格/逗号/竖线分隔
    (line: string) => line.split(/[|,，\s]{2,}/).filter(Boolean),
    // 策略3: 单个空格分隔 (最后兜底，只取5个以上字段的行)
    (line: string) => {
      const parts = line.split(/\s+/).filter(Boolean);
      return parts.length >= 5 ? parts : [];
    },
  ]) {
    for (const line of lines) {
      const parts = strategy(line);
      if (parts.length < 3) continue;

      // 尝试定位字段：查找含课程名、教师、时间信息的字段
      let nameIdx = 0;
      let weekdayIdx = -1;
      let timeIdx = -1;
      let roomIdx = -1;

      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        // 周几：含中文数字一~日
        if (weekdayIdx < 0 && /[一二三四五六日]/.test(p) && p.length <= 6) {
          weekdayIdx = i;
        }
        // 节次：含数字-数字
        if (timeIdx < 0 && /\d{1,2}\s*[-~至到]\s*\d{1,2}/.test(p)) {
          timeIdx = i;
        }
        // 教室：含字母+数字
        if (roomIdx < 0 && /[A-Za-z]\d/.test(p)) {
          roomIdx = i;
        }
      }

      // 如果没找到时间信息，跳过
      if (timeIdx < 0) continue;

      // 课程名在 weekday 之前
      if (weekdayIdx >= 0) nameIdx = weekdayIdx - 1;
      if (nameIdx < 0) nameIdx = 0;

      const name = parts[nameIdx]?.trim();
      const weekdayStr = weekdayIdx >= 0 ? parts[weekdayIdx].trim() : '';
      const weekday = getWeekday(weekdayStr);
      if (!weekday || weekday > 7 || !name) continue;

      const timeInfo = parseTimeRange(parts[timeIdx].trim());
      if (!timeInfo) continue;

      // 教师：名字含2-3个中文字且不在已定位位置
      let teacher = '';
      for (let i = 0; i < parts.length; i++) {
        if (i !== nameIdx && i !== weekdayIdx && i !== timeIdx && i !== roomIdx) {
          const t = parts[i].trim();
          if (/^[\u4e00-\u9fff]{2,4}$/.test(t) && !/\d/.test(t)) {
            teacher = t;
            break;
          }
        }
      }

      const classroom = roomIdx >= 0 ? parts[roomIdx].trim() : '';
      const weeks = parseWeeks(parts[parts.length - 1] || '');
      const key = `${name}|${weekday}|${timeInfo.start}|${classroom}`;
      if (seen.has(key)) continue;
      seen.add(key);

      courses.push({
        name,
        teacher,
        classroom,
        weekday,
        startPeriod: timeInfo.start,
        periodSpan: timeInfo.span,
        weekStart: weeks.weekStart,
        weekEnd: weeks.weekEnd,
        weekType: weeks.weekType,
        courseType: 'theory' as const,
        colorClass: 'bg-course-blue text-white',
      });
    }

    if (courses.length > 0) break; // 找到课程就不再尝试后续策略
  }

  return courses;
}

function parseHtmlTable(html: string) {
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi);
  if (!rows || rows.length < 2) return [];
  const courses: any[] = [];
  const seen = new Set<string>();

  for (const row of rows.slice(1)) {
    const cells = row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi);
    if (!cells || cells.length < 5) continue;
    const vals = cells.map((c) => c.replace(/<[^>]+>/g, '').trim());
    const weekday = getWeekday(vals[0] || '');
    if (!weekday) continue;

    for (let i = 1; i < vals.length; i++) {
      const cell = vals[i];
      if (!cell || cell === '—' || cell === '-') continue;
      const lines = cell.split(/[\r\n]+/).filter(Boolean);
      for (const line of lines) {
        const parts = line.split(/[\t|,，\s]{2,}/);
        if (parts.length < 3) continue;
        const name = parts[0].trim();
        const timeInfo = parseTimeRange(parts.length > 1 ? parts[1] : `${i + 2}-${i + 3}`);
        if (!timeInfo) continue;

        let teacher = '';
        let classroom = '';
        for (const p of parts.slice(1)) {
          if (/老师|教授|讲师/.test(p)) teacher = p.trim();
          if (/[A-Za-z]/.test(p) && /\d/.test(p)) classroom = p.trim();
        }
        if (!teacher) teacher = parts[1]?.trim() || '';
        if (!classroom) classroom = parts[2]?.trim() || '';

        const key = `${name}|${weekday}|${timeInfo.start}`;
        if (seen.has(key)) continue;
        seen.add(key);

        courses.push({
          name,
          teacher,
          classroom,
          weekday,
          startPeriod: timeInfo.start,
          periodSpan: timeInfo.span,
          weekStart: 1,
          weekEnd: 18,
          weekType: 'all' as const,
          courseType: 'theory' as const,
          colorClass: 'bg-course-blue text-white',
        });
      }
    }
  }
  return courses;
}

export function registerScheduleRoutes(app: any, pdfUpload: any, imageUpload: any) {
  // ── 学生证 OCR 识别 ──
  app.post('/api/v1/ocr-student-id', limiter(5),
    (req: Request, res: Response, next: NextFunction) => {
      imageUpload.single('file')(req, res, (err: any) => {
        if (err) return fail(res, 400, err.code === 'LIMIT_FILE_SIZE' ? '图片不能超过10MB' : '上传失败');
        next();
      });
    },
    async (req: Request, res: Response) => {
      if (!req.file) return fail(res, 400, '请上传学生证图片');
      const filePath = (req.file as any).path;
      try {
        // 基础版：返回中等置信度，用户自行核对填写。后续可接 Tesseract/云 OCR 增强。
        ok(res, { name: '', studentId: '', department: '', confidence: 'medium' });
        // 异步清理临时文件
        if (filePath) {
          setTimeout(() => {
            try { fs.unlinkSync(filePath); } catch {}
          }, 60000);
        }
      } catch (err: any) {
        logger.error('学生证OCR失败', { error: err.message, trace_id: req._traceId });
        fail(res, 500, '识别失败');
      }
    },
  );

  // ── PDF 解析 ──
  app.post('/api/v1/parse-schedule', auth, limiter(5),
    (req: Request, res: Response, next: NextFunction) => {
      pdfUpload.single('file')(req, res, (err: any) => {
        if (err) return fail(res, 400, err.code === 'LIMIT_FILE_SIZE' ? '文件不能超过5MB' : '上传失败');
        next();
      });
    },
    async (req: Request, res: Response) => {
      if (!req.file) return fail(res, 400, '请上传 PDF 文件');
      const ext = (req.file.originalname || '').toLowerCase().split('.').pop();
      // 放宽 MIME 校验：部分浏览器/系统对 PDF 上报 application/octet-stream
      const validExt = ext === 'pdf';
      const validMime = req.file.mimetype === 'application/pdf' || req.file.mimetype === 'application/octet-stream';
      if (!validExt || !validMime) {
        return fail(res, 400, `仅支持 PDF 格式（当前类型：${req.file.mimetype}）`);
      }

      try {
        const mod = await import('pdf-parse');
        const PDFParse = mod.default || mod.PDFParse || mod;
        let data: any;
        try { data = await PDFParse(req.file.buffer); } catch {
          data = await new (PDFParse as any)(req.file.buffer);
        }
        const text = data.text;
        if (!text || text.length < 20) {
          return fail(res, 400, 'PDF 无法识别（可能是扫描件或图片型 PDF）。请尝试：1) 从教务系统导出时选择"文字型 PDF"；2) 切换到「粘贴 HTML」标签，复制课表网页内容直接粘贴解析');
        }

        const courses = parseScheduleText(text);
        logger.business('PDF解析', { pages: data.numpages, textLen: text.length, courses: courses.length, trace_id: req._traceId });
        if (courses.length === 0) {
          return ok(res, { courses: [], rawText: text.substring(0, 3000), hint: '解析到文本但未识别出课程。请检查文本格式，或切换到「粘贴 HTML」标签' });
        }
        ok(res, { courses, rawText: text.substring(0, 2000) });
      } catch (err: any) {
        logger.error('PDF解析失败', { error: err.message, trace_id: req._traceId });
        fail(res, 500, '解析失败，请检查文件格式是否正确');
      }
    },
  );

  // ── HTML 粘贴解析 ──
  app.post('/api/v1/parse-schedule-html', auth, limiter(10), async (req: Request, res: Response) => {
    try {
      const html = req.body?.html || '';
      if (!html || html.length < 50) return fail(res, 400, '请粘贴完整的 HTML 表格');
      const courses = parseHtmlTable(html);
      if (!courses.length) return fail(res, 400, '未识别到课程，请检查格式');
      logger.business('HTML解析', { courses: courses.length, trace_id: req._traceId });
      ok(res, { courses });
    } catch (err: any) {
      logger.error('HTML解析失败', { error: err.message, trace_id: req._traceId });
      fail(res, 500, '解析失败');
    }
  });
}
