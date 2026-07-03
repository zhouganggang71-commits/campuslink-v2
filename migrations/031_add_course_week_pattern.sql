-- 教务系统"周次"文本(zcd)格式远比"起始周-结束周"复杂：逗号分隔多段范围(如"3-4周,6-11周,13-19周")、
-- 每段可能带"(单)"/"(双)"限定该段内只有单/双周有课、单周不带括弧(如"17周")。
-- 现有 week_start/week_end/week_type(all/odd/even) 这套简单模型装不下这种"多段+逐段单双周"的组合，
-- 加两个字段：week_pattern 存原始文本(展示用，跟官网一模一样)，active_weeks 存解析出的具体周次数组
-- (筛选用，判断"第N周是否有这门课"直接查数组，不用再猜起止周+单双周)。
-- 手动添加/OCR导入的课程没有这个粒度，两个字段留空，前端按现有 week_start/week_end/week_type 逻辑兜底。
ALTER TABLE courses ADD COLUMN week_pattern VARCHAR(255) DEFAULT NULL;
ALTER TABLE courses ADD COLUMN active_weeks JSON DEFAULT NULL;
