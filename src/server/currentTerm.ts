/**
 * 计算"当前学期"的 school_year(学年起始年)/school_term(学期编码)，用于手动添加/OCR导入课程时
 * 自动打标签——这样这些课也能归入学年学期选择器，不用用户自己选。
 * 编码约定跟扫码同步一致（正方教务系统这个部署的实测值）：秋季学期=3，春季学期=12。
 * 注意：正方 xnm = 学年起始年（如 xnm=2025 表示 2025-2026学年）。
 * 9月-12月=秋季学期；1月也归入秋季(期末考试/课程设计延续到1月下旬，正方系统此时仍属秋季编码3)；2-8月=春季学期。
 */
export function getCurrentSchoolTerm(): { schoolYear: string; schoolTerm: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 9) return { schoolYear: String(year), schoolTerm: '3' };
  if (month === 1) return { schoolYear: String(year - 1), schoolTerm: '3' };
  return { schoolYear: String(year - 1), schoolTerm: '12' };
}
