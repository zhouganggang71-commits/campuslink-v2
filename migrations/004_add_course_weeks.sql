-- 添加课表的周次字段
SET @col1 = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='campuslink' AND TABLE_NAME='courses' AND COLUMN_NAME='week_start');
SET @col2 = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='campuslink' AND TABLE_NAME='courses' AND COLUMN_NAME='week_end');

SET @sql = IF(@col1 = 0, 'ALTER TABLE courses ADD COLUMN week_start TINYINT DEFAULT 1', 'SELECT "week_start exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(@col2 = 0, 'ALTER TABLE courses ADD COLUMN week_end TINYINT DEFAULT 18', 'SELECT "week_end exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
