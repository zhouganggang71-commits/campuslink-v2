-- 学年语义修正：春季 xnm 改回学年起始年（2025），匹配课程数据的 (2025,12)
-- formatSchoolTerm 会按 (y+1)-(y+2) 显示为 "2026-2027学年 春季学期"
-- 034 当初把 xnm 从 2025 改成了 2026，现在课程数据仍然是 (2025,12)，
-- 所以在显示层用 (y+1)-(y+2) 公式后，DB 也应改回 (2025,12) 保持一致。
UPDATE IGNORE term_config SET school_year = '2025'
WHERE school_year = '2026' AND school_term = '12';
