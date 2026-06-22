-- 密码系统
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'campuslink' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'password_hash');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) DEFAULT NULL',
  'SELECT "password_hash column already exists" AS message');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
