-- 回滚 040: 删除互动消息 target 字段
ALTER TABLE notices DROP INDEX idx_notices_category;
ALTER TABLE notices DROP COLUMN target_id;
ALTER TABLE notices DROP COLUMN target_type;
