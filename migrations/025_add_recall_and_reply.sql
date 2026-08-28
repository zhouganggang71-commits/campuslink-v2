-- 私信撤回功能：添加 recalled_at 和 reply_to_id 列
ALTER TABLE chat_messages 
  ADD COLUMN recalled_at TIMESTAMP NULL DEFAULT NULL AFTER is_read,
  ADD COLUMN reply_to_id INT NULL DEFAULT NULL AFTER recalled_at,
  ADD INDEX idx_recall (recalled_at);

-- reply_to_id 外键（指向同一表的消息）
ALTER TABLE chat_messages
  ADD CONSTRAINT fk_msg_reply_to FOREIGN KEY (reply_to_id) REFERENCES chat_messages(id) ON DELETE SET NULL;
