-- 个性签名
-- 012_add_user_bio.sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio VARCHAR(80) DEFAULT NULL AFTER avatar_url;
