/**
 * 学年学期 显示/排序 — 全局唯一口径（前后端共享）
 *
 * 语义（果果 2026-07-04 用真实同步数据核对）：**xnm = 学期开始所在的自然年**
 *   秋季（xqm=3）：xnm=Y → Y-(Y+1)学年 秋季（当年 9 月开学）
 *   春季（xqm=12）：xnm=Y → (Y+1)-(Y+2)学年 春季（当年 3 月开学）
 * 即春季显示为下一学年的春季：xnm=2025 → 2026-2027学年 春季。
 */

export function formatSchoolTerm(schoolYear: string, schoolTerm: string): string {
  const y = parseInt(schoolYear, 10);
  if (isNaN(y)) return schoolTerm ? `${schoolYear} 第${schoolTerm}学期` : String(schoolYear);
  if (schoolTerm === '3') return `${y}-${y + 1}学年 秋季学期`;
  if (schoolTerm === '12') return `${y + 1}-${y + 2}学年 春季学期`;
  return schoolTerm ? `${y}学年 第${schoolTerm}学期` : `${y}学年`;
}

/**
 * 时间序键（越大越晚）：春=(y+1)年3月、秋=y年9月。
 * 春季按 xnm+1 算日历月，使 (2025,12)=2026年3月 排在 (2025,3)=2025年9月 之后。
 */
export function termChronoKey(schoolYear: string, schoolTerm: string): number {
  const y = parseInt(schoolYear, 10);
  if (isNaN(y)) return 0;
  const base = schoolTerm === '12' ? y + 1 : y;
  return base * 12 + (schoolTerm === '3' ? 9 : schoolTerm === '12' ? 3 : 0);
}

/**
 * 默认学期选择的兜底：在"精确匹配当前学期"失败时用（比如某个学期数据没同步到本地）。
 * 之前的兜底是简单粗暴地选 chrono 最晚的学期——学校经常提前发布下学期课表，这样一来
 * "当前学期没匹配上"就会直接跳到一个还没开始的未来学期（表现为"课表默认显示下学期第
 * 18周"这种自相矛盾的画面：一个没开始的学期哪来的第18周）。
 * 改成：优先选"已经开始"（chrono 序 ≤ 当前月份）的学期里最晚的一个，即最贴近"现在"
 * 的已知数据；只有当全部可选学期都还没开始（比如刚同步到的全是提前发布的未来学期，
 * 一条过去/当前数据都没有）时，才退而求其次选其中最早（最快开始）的一个。
 */
export function pickCurrentOrPastTerm<T extends { schoolYear: string; schoolTerm: string }>(
  terms: T[],
  now: Date = new Date(),
): T | null {
  if (!terms.length) return null;
  const nowKey = now.getFullYear() * 12 + (now.getMonth() + 1);
  const started = terms.filter((t) => termChronoKey(t.schoolYear, t.schoolTerm) <= nowKey);
  const pool = started.length ? started : terms;
  const pickLatest = started.length; // 已开始的学期里选最晚(最接近现在)；全是未来学期则选最早(最快开始)
  return pool.reduce((best, t) => {
    const better = pickLatest
      ? termChronoKey(t.schoolYear, t.schoolTerm) > termChronoKey(best.schoolYear, best.schoolTerm)
      : termChronoKey(t.schoolYear, t.schoolTerm) < termChronoKey(best.schoolYear, best.schoolTerm);
    return better ? t : best;
  }, pool[0]);
}
