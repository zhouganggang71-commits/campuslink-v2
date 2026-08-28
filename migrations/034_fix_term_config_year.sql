-- 学年语义修正：xnm = 学期开始所在自然年（2026-07-04 果果真实数据核对）
-- 2026年春季学期的 xnm 是 2026（不是学年起始年 2025），
-- 033 的种子行按旧口径写成了 (2025, 12)，与课表同步数据的 (2026, 12) 对不上，
-- 导致 /config/term 返回的当前学期匹配不到前端选择器里的学期。
UPDATE IGNORE term_config SET school_year = '2026'
WHERE school_year = '2025' AND school_term = '12';
