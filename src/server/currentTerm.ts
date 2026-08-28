/**
 * 计算"当前学期"的 school_year/school_term，用于手动添加/OCR导入课程时
 * 自动打标签——这样这些课也能归入学年学期选择器，不用用户自己选。
 *
 * 编码约定跟扫码同步一致（果果 2026-07-04 用真实同步数据核对）：
 *   **xnm = 学期开始所在的自然年**，xqm：秋=3，春=12
 *   秋季(9月开学)：xnm=当年 → 2025年9月 = (2025, 3) = 2025-2026学年秋季
 *   春季(3月开学)：xnm=上学年 → 2026年3月 = (2025, 12) = 2026-2027学年春季
 *   春、秋统一用 "xnm-(xnm+1)" 显示学年标签。
 * 月份归属：9-12月=秋季(当年)；1月仍属秋季(期末延续，xnm=去年)；2-8月=春季(当年)
 */
export function getCurrentSchoolTerm(): { schoolYear: string; schoolTerm: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 9) return { schoolYear: String(year), schoolTerm: '3' };
  if (month === 1) return { schoolYear: String(year - 1), schoolTerm: '3' };
  // 2-8月 = 春季，xnm 是上学年的学年起始年（即 year-1）
  return { schoolYear: String(year - 1), schoolTerm: '12' };
}
