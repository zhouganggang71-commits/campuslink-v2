-- 用户头像
-- 011_add_user_avatar.sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500) DEFAULT NULL AFTER nickname;
