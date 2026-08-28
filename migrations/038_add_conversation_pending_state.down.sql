-- 回滚 038: 删除陌生人会话门槛相关列
ALTER TABLE conversations DROP INDEX idx_conversations_status;
ALTER TABLE conversations DROP COLUMN initiator_id;
ALTER TABLE conversations DROP COLUMN status;
