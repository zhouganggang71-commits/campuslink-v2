-- 私信支持图片消息：新增 image_url 列，content 允许为空（纯图片消息）
ALTER TABLE chat_messages ADD COLUMN image_url VARCHAR(500) DEFAULT NULL AFTER content;
ALTER TABLE chat_messages MODIFY content TEXT NULL;

-- 用户最近活跃时间（用于私信在线状态展示）
ALTER TABLE users ADD COLUMN last_active TIMESTAMP NULL DEFAULT NULL;
