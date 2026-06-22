-- 管理员权限
-- 执行: mysql -u campuslink -pcampuslink123 campuslink < migrations/001_add_admin.sql
-- 幂等：重复执行不报错

-- 添加 is_admin 列
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'campuslink' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'is_admin');

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE',
  'SELECT "is_admin column already exists" AS message');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 设置 周鉦罡 为管理员（学号 202330140113）
UPDATE users SET is_admin = TRUE WHERE student_id = '202330140113';
