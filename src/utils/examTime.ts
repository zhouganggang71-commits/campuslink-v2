/**
 * 考试时间文本解析 — 前后端共享的唯一解析器
 *
 * 输入是教务系统 kssj 原始文本（exams.exam_time 原样存储，不落解析列——
 * 动态计算保证解析器修 bug 后立刻对存量数据生效，且原文是唯一事实源）。
 *
 * ⚠️ 真实格式还没见过非空样本核对（库里已有 2 条真实数据待确认）。
 * 按正方系统常见格式写主路径，宽容兜底：
 *   "2026-06-30 09:00~11:00" / "2026-06-30(09:00-11:00)" / "2026-06-30 09:00-11:00"
 * 策略：先找日期 YYYY-MM-DD，再找其后第一个时刻 HH:MM；缺时刻按 00:00（当天仍可倒计时）。
 * 解析失败返回 null——调用方负责"不算数但展示原文"。
 */

const DATE_RE = /(20\d{2})[-/年](\d{1,2})[-/月](\d{1,2})/;
const TIME_RE = /(\d{1,2}):(\d{2})/;

export function parseExamStart(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const dateMatch = raw.match(DATE_RE);
  if (!dateMatch) return null;

  const year = parseInt(dateMatch[1], 10);
  const month = parseInt(dateMatch[2], 10);
  const day = parseInt(dateMatch[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // 时刻只在日期之后找，避免把日期前的周次数字误当时间
  const after = raw.slice((dateMatch.index ?? 0) + dateMatch[0].length);
  const timeMatch = after.match(TIME_RE);
  let hour = 0;
  let minute = 0;
  if (timeMatch) {
    const h = parseInt(timeMatch[1], 10);
    const m = parseInt(timeMatch[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      hour = h;
      minute = m;
    }
  }

  const d = new Date(year, month - 1, day, hour, minute);
  return isNaN(d.getTime()) ? null : d;
}

/** 距考试开始还有几天：今天=0，明天=1；已开始/解析失败返回 null */
export function daysUntilExam(raw: string | null | undefined, now: Date = new Date()): number | null {
  const start = parseExamStart(raw);
  if (!start || start.getTime() < now.getTime()) return null;
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((startDay.getTime() - nowDay.getTime()) / 86400000);
}
