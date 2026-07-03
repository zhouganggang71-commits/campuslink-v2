-- 课表多学期改造：courses 表支持"哪年哪学期"归类 + 来源区分 + 对齐教务系统官网信息量
-- school_year/school_term 对应教务系统 xnm/xqm（如 xnm=2025 xqm=3 表示 2025-2026 学年秋季学期）
-- source 区分录入来源，扫码同步只清空/覆盖自己那部分，不动手动添加和 OCR 导入的课程
ALTER TABLE courses ADD COLUMN school_year VARCHAR(9) DEFAULT NULL AFTER user_id;
ALTER TABLE courses ADD COLUMN school_term VARCHAR(4) DEFAULT NULL AFTER school_year;
ALTER TABLE courses ADD COLUMN source ENUM('manual','ocr','scan_sync') NOT NULL DEFAULT 'manual' AFTER school_term;
ALTER TABLE courses ADD COLUMN campus VARCHAR(50) DEFAULT NULL;
ALTER TABLE courses ADD COLUMN class_group VARCHAR(100) DEFAULT NULL;
ALTER TABLE courses ADD COLUMN class_composition VARCHAR(100) DEFAULT NULL;
ALTER TABLE courses ADD COLUMN exam_method VARCHAR(30) DEFAULT NULL;
ALTER TABLE courses ADD COLUMN elective_note VARCHAR(255) DEFAULT NULL;
ALTER TABLE courses ADD COLUMN hours_breakdown VARCHAR(100) DEFAULT NULL;
ALTER TABLE courses ADD COLUMN weekly_hours VARCHAR(20) DEFAULT NULL;
ALTER TABLE courses ADD COLUMN total_hours VARCHAR(20) DEFAULT NULL;
ALTER TABLE courses ADD COLUMN credit VARCHAR(10) DEFAULT NULL;
ALTER TABLE courses ADD INDEX idx_courses_term (user_id, school_year, school_term);

-- 存量数据（迁移前已有的手动/OCR课程）没有学年学期，一次性回填成迁移执行时的"当前学期"，
-- 跟 getSemestersToTry() 的当前学期猜测口径保持一致（2-8月=春季xqm12，9-次年1月=秋季xqm3）
-- 这是按迁移落地时间点(2026年7月)算的一次性值，以后新增的课程都由应用代码自己打标签，不依赖这行
UPDATE courses SET school_year = '2025', school_term = '12' WHERE school_year IS NULL;
