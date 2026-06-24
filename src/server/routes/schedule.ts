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

/** 移除 JSON 不安全的控制字符 */
function sanitize(s: string): string {
  return s.replace(/[\x00-\x1F\x7F-\x9F]/g, '').replace(/\u200B/g, '');
}

/** 清洗课程数组中所有字符串字段 */
function sanitizeCourses(courses: any[]): any[] {
  for (const c of courses) {
    for (const k of Object.keys(c)) {
      if (typeof c[k] === 'string') c[k] = sanitize(c[k]);
    }
  }
  return courses;
}

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

/** 常见中文姓氏 + 职称，用于识别教师名称 */
const TEACHER_SUFFIX = '(教授|老师|讲师|助教)';
const COMMON_SURNAMES = '[张李王刘陈孙赵周吴郑冯蒋沈韩杨朱秦许何吕施任姜邹苏潘葛范彭韦马苗花方俞袁柳酆鲍史唐费廉岑薛贺倪汤滕殷罗毕郝邬安常乐于时傅皮下齐康伍余元卜顾孟黄穆萧尹姚邵汪毛禹狄米贝臧计伏成戴谈宋茅熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田樊胡凌霍虞万支柯管卢莫房裘缪干解应宗丁宣贲邓郁单杭洪包诸左石崔吉钮龚程嵇邢滑裴陆荣翁荀羊於惠甄曲封芮羿储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘钭厉戎祖武符刘景詹束龙叶幸韶郜黎蓟薄印宿白怀蒲邰从索咸籍赖卓蔺屠蒙池乔阴郁胥苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍卻璩桑桂濮牛寿通边扈燕冀郏浦尚农温别庄晏柴瞿阎充慕连茹习宦艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东欧殳沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶空曾毋沙乜养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公]';

/**
 * 解析"课程索引"区域 — 支持两种格式：
 * A) 多行: 每门课跨4行(课程名/教师/教室/时间)
 * B) 紧凑单行: "1高等数学 A张教授教1-201周一 第1-2节"
 */
function parseIndexSection(text: string) {
  // ── 策略A: 紧凑单行（先试，因为更常见）──
  const compactRe = new RegExp(
    `(\\d{1,2})\\s*` +                                    // 序号
    `(.+?)` +                                              // 课程名
    `(${COMMON_SURNAMES})${TEACHER_SUFFIX}` +             // 教师
    `([A-Za-z0-9\\u4e00-\\u9fff\\-]+?)` +                 // 教室
    `周([一二三四五六日])\\s*第(\\d+)[-~至](\\d+)节`,    // 周X 第N-M节
    'g'
  );
  const courses: any[] = [];
  const seen = new Set<string>();

  let m;
  while ((m = compactRe.exec(text)) !== null) {
    const name = m[2].trim();
    const teacher = m[3] + m[4];
    const room = m[5].trim();
    const wd = getWeekday(m[6]);
    const sp = parseInt(m[7]);
    const ep = parseInt(m[8]);
    if (!wd || !name || sp < 1) continue;
    const key = `${name}|${wd}|${sp}`;
    if (seen.has(key)) continue;
    seen.add(key);
    courses.push({
      name, teacher, classroom: room, weekday: wd,
      startPeriod: sp, periodSpan: ep - sp + 1,
      weekStart: 1, weekEnd: 18, weekType: 'all' as const,
      courseType: 'theory' as const,
      colorClass: 'bg-course-blue text-white',
    });
  }
  if (courses.length > 0) return courses;

  // ── 策略B: 多行格式 ──
  const allLines = text.split(/[\r\n]+/).filter(Boolean);
  const courseRe = /^(\d{1,2})\s+(?:<b>)?(.+?)(?:<\/b>)?$/;
  const teacherRe = new RegExp(`^(${COMMON_SURNAMES})${TEACHER_SUFFIX}$`);
  const roomRe = /^[A-Za-z0-9\u4e00-\u9fff]+[-\u4e00-\u9fff]*\d+[A-Za-z\u4e00-\u9fff\-]*$/;
  const schedRe = /周([一二三四五六日])\s*第(\d+)[-~至](\d+)节/;

  for (let i = 0; i < allLines.length; i++) {
    const cm = allLines[i].match(courseRe);
    if (!cm) continue;
    const name = cm[2].trim().replace(/<[^>]+>/g, '');
    let teacher = '', room = '', wd = 0, sp = 0, ep = 0;
    for (let j = 1; j <= 4 && i + j < allLines.length; j++) {
      const ln = allLines[i + j].trim();
      const tm = ln.match(teacherRe);
      if (!teacher && tm) { teacher = tm[1] + tm[2]; continue; }
      if (!room && roomRe.test(ln) && !/^第\d+节/.test(ln)) { room = ln; continue; }
      const sm = ln.match(schedRe);
      if (sm) { wd = getWeekday(sm[1]); sp = parseInt(sm[2]); ep = parseInt(sm[3]); i += j; break; }
    }
    if (!wd || !name || sp < 1) continue;
    const key = `${name}|${wd}|${sp}`;
    if (seen.has(key)) continue;
    seen.add(key);
    courses.push({
      name, teacher, classroom: room, weekday: wd,
      startPeriod: sp, periodSpan: ep - sp + 1,
      weekStart: 1, weekEnd: 18, weekType: 'all' as const,
      courseType: 'theory' as const,
      colorClass: 'bg-course-blue text-white',
    });
  }

  return courses;
}

/**
 * 解析 HTML table 中的课表（从 <tr>/<td> 结构）
 */
function parseTableSection(text: string) {
  const lines = text.split(/[\r\n]+/).filter(Boolean);
  const courses: any[] = [];
  const seen = new Set<string>();

  for (const strategy of [
    (line: string) => line.split('\t').filter(Boolean),
    (line: string) => line.split(/[|,，\s]{2,}/).filter(Boolean),
  ]) {
    for (const line of lines) {
      const parts = strategy(line);
      if (parts.length < 3) continue;

      let weekdayIdx = -1, timeIdx = -1, roomIdx = -1;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (weekdayIdx < 0 && /[一二三四五六日]/.test(p) && p.length <= 6) weekdayIdx = i;
        if (timeIdx < 0 && /\d{1,2}\s*[-~至到]\s*\d{1,2}/.test(p)) timeIdx = i;
        if (roomIdx < 0 && /[A-Za-z]\d/.test(p)) roomIdx = i;
      }
      if (timeIdx < 0) continue;

      const nameIdx = weekdayIdx >= 0 ? weekdayIdx - 1 : 0;
      if (nameIdx < 0) continue;
      const name = parts[nameIdx]?.trim();
      const weekday = getWeekday(weekdayIdx >= 0 ? parts[weekdayIdx].trim() : '');
      if (!weekday || !name) continue;
      const timeInfo = parseTimeRange(parts[timeIdx].trim());
      if (!timeInfo) continue;

      let teacher = '';
      for (let i = 0; i < parts.length; i++) {
        if (i !== nameIdx && i !== weekdayIdx && i !== timeIdx && i !== roomIdx) {
          const t = parts[i].trim();
          if (/^[\u4e00-\u9fff]{2,4}$/.test(t) && !/\d/.test(t)) { teacher = t; break; }
        }
      }
      const classroom = roomIdx >= 0 ? parts[roomIdx].trim() : '';
      const key = `${name}|${weekday}|${timeInfo.start}|${classroom}`;
      if (seen.has(key)) continue;
      seen.add(key);

      courses.push({
        name, teacher, classroom, weekday,
        startPeriod: timeInfo.start,
        periodSpan: timeInfo.span,
        weekStart: 1, weekEnd: 18, weekType: 'all' as const,
        courseType: 'theory' as const,
        colorClass: 'bg-course-blue text-white',
      });
    }
    if (courses.length > 0) break;
  }
  return courses;
}

/**
 * 解析 <b>课程名</b>\n教师\n教室 格式的 PDF 课表表格
 * 布局: 周一~周日为列, 第N节为行(大学标准: 1-2/3-4/5-6/7-8/9-10节合并)
 */
function parseBoldTable(text: string) {
  const courses: any[] = [];
  const seen = new Set<string>();

  // 找表头确定列→星期映射
  const headerMatch = text.match(/周一.*?周[一二三四五六日]/);
  if (!headerMatch) return courses;
  const weekdays = (headerMatch[0].match(/周[一二三四五六日]/g) || []).map(w => getWeekday(w));

  // 解析"注"行获取节次分组(如 第1-2节, 第3-4节...)
  const periodSpanMap = new Map<number, number>();
  const noteMatch = text.match(/注[：:]\s*([\s\S]+?)(?:\n|$)/);
  if (noteMatch) {
    const spans = noteMatch[1].match(/第(\d+)-(\d+)节/g);
    if (spans) {
      for (const s of spans) {
        const m = s.match(/第(\d+)-(\d+)节/);
        if (m) { const a = parseInt(m[1]), b = parseInt(m[2]); periodSpanMap.set(a, b - a + 1); }
      }
    }
  }
  // 默认: 双数节（2/4/6/8/10）为空，课程实际占2节
  if (periodSpanMap.size === 0) {
    for (let p = 1; p <= 10; p += 2) periodSpanMap.set(p, 2);
  }

  // 找所有时段块: "第N节\nHH:MM-HH:MM\n课程数据"
  const periods: { start: number; span: number; cells: string[] }[] = [];
  const periodRe = /第(\d+)节\n[\d:]+-[\d:]+\n([\s\S]*?)(?=\n第\d+节\n|\n注|\n课程索引|$)/g;
  let pm;
  while ((pm = periodRe.exec(text)) !== null) {
    const start = parseInt(pm[1]);
    const cellBlock = pm[2];
    const cells = cellBlock.split(/(?=\n<b>)/).filter(Boolean);
    if (cells.length === 0) continue; // 空行(如第2/4/6节)跳过
    const span = periodSpanMap.get(start) || 1;
    periods.push({ start, span, cells });
  }

  for (const p of periods) {
    for (let col = 0; col < Math.min(weekdays.length, 7); col++) {
      if (col >= p.cells.length) continue;
      const bm = p.cells[col].match(/<b>(.+?)<\/b>\n(.+?)\n([^\n<]+)/);
      if (!bm) continue;
      const name = bm[1].trim();
      const teacher = bm[2].trim();
      const room = bm[3].trim();
      if (!name || !teacher) continue;
      const wd = weekdays[col] || 0;
      if (!wd) continue;
      const key = `${name}|${wd}|${p.start}`;
      if (seen.has(key)) continue;
      seen.add(key);

      courses.push({
        name, teacher, classroom: room, weekday: wd,
        startPeriod: p.start, periodSpan: p.span,
        weekStart: 1, weekEnd: 18, weekType: 'all' as const,
        courseType: 'theory' as const,
        colorClass: 'bg-course-blue text-white',
      });
    }
  }

  return courses;
}

function parseScheduleText(text: string) {
  // 策略1: 课程索引（如果存在）
  const idxStart = text.indexOf('课程索引');
  if (idxStart >= 0) {
    const indexSection = text.substring(idxStart);
    const courses = parseIndexSection(indexSection);
    if (courses.length > 0) return courses;
  }

  // 策略2: <b>标记的表格格式（最常见）
  if (text.includes('<b>')) {
    const courses = parseBoldTable(text);
    if (courses.length > 0) return courses;
  }

  // 策略3: 制表符/空格分隔的表格
  return parseTableSection(text);
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
          name, teacher, classroom, weekday,
          startPeriod: timeInfo.start,
          periodSpan: timeInfo.span,
          weekStart: 1, weekEnd: 18, weekType: 'all' as const,
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
        ok(res, { name: '', studentId: '', department: '', confidence: 'medium' });
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
      const validExt = ext === 'pdf';
      const validMime = req.file.mimetype === 'application/pdf' || req.file.mimetype === 'application/octet-stream';
      if (!validExt || !validMime) {
        return fail(res, 400, `仅支持 PDF 格式（当前类型：${req.file.mimetype}）`);
      }

      try {
        const pdfParse = require('pdf-parse');
        const parseFn = typeof pdfParse === 'function' ? pdfParse : (pdfParse.default || pdfParse);
        let data: any;
        try { data = await parseFn(req.file.buffer); } catch {
          try { data = await new (parseFn as any)(req.file.buffer); } catch {
            return fail(res, 500, 'PDF 解析引擎异常');
          }
        }
        const text = (data?.text || '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ''); // 清洗JSON不安全字符
        if (!text || text.length < 20) {
          return fail(res, 400, 'PDF 无法识别（可能是扫描件或图片型 PDF）。请尝试：1) 从教务系统导出时选择"文字型 PDF"；2) 切换到「粘贴 HTML」标签，复制课表网页内容直接粘贴解析');
        }

        const courses = parseScheduleText(text);
        logger.business('PDF解析', { pages: data.numpages, textLen: text.length, courses: courses.length, trace_id: req._traceId });
        if (courses.length === 0) {
          return ok(res, { courses: [], rawText: sanitize(text).substring(0, 3000), hint: '解析到文本但未识别出课程格式。请尝试切换到「粘贴 HTML」标签' });
        }
        ok(res, { courses: sanitizeCourses(courses), rawText: sanitize(text).substring(0, 2000) });
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
