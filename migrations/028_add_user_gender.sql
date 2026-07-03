-- 用户性别（可选填，默认不公开，用户自己在个人资料里开启才会在帖子/主页展示）
ALTER TABLE users ADD COLUMN gender ENUM('male','female') DEFAULT NULL AFTER avatar_url;
ALTER TABLE users ADD COLUMN gender_visible BOOLEAN NOT NULL DEFAULT FALSE AFTER gender;
