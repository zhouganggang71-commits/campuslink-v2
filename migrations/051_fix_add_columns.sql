-- 修复 048/049：ADD COLUMN IF NOT EXISTS 是 MariaDB 语法，MySQL 8 不支持，
-- 原迁移被 runner 跳过（列未加但迁移已标记）。用标准 ALTER 补列。
ALTER TABLE users ADD COLUMN major VARCHAR(128) DEFAULT '' AFTER department;
ALTER TABLE contents ADD COLUMN resource_url VARCHAR(500) DEFAULT NULL AFTER cover_url;
ALTER TABLE contents ADD COLUMN resource_name VARCHAR(200) DEFAULT '' AFTER resource_url;
