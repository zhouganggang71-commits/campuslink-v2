/**
 * 课程周次命中判断 — 全局唯一口径（ScheduleTab 周过滤 / 首页今日课程 chip / 未来上课提醒共用）
 * 有 activeWeeks（扫码同步、来自 zcd 精确解析）时以它为准；
 * 手动/OCR 课程没有这个粒度，退回起止周 + 单双周逻辑。
 */
export function isCourseInWeek(
  c: { activeWeeks?: number[] | null; weekStart: number; weekEnd: number; weekType: string },
  week: number,
): boolean {
  if (c.activeWeeks && c.activeWeeks.length > 0) {
    return c.activeWeeks.includes(week);
  }
  if (c.weekStart > week || c.weekEnd < week) return false;
  if (c.weekType === 'odd' && week % 2 === 0) return false;
  if (c.weekType === 'even' && week % 2 === 1) return false;
  return true;
}
