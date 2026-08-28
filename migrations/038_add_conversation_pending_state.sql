-- 陌生人私信门槛：首次会话进入 pending，接收方须显式「继续聊天」才转 active
-- status 默认 active 是关键：存量会话（这条迁移执行前就存在的）不受影响，只有新建会话才走 pending
-- initiator_id 记录真正发起人（user1_id/user2_id 只是按 id 大小排序，不代表谁先发起）
ALTER TABLE conversations ADD COLUMN status ENUM('pending', 'active') NOT NULL DEFAULT 'active';
ALTER TABLE conversations ADD COLUMN initiator_id INT DEFAULT NULL;

-- 存量数据回填：initiator_id 用该会话最早一条消息的 sender_id 兜底
-- （连消息都没有的空会话理论上不存在，回填不到的极端情况就保持 NULL，后端按 NULL = 不限制处理，不影响老会话）
UPDATE conversations c
SET initiator_id = (
  SELECT sender_id FROM chat_messages m
  WHERE m.conversation_id = c.id
  ORDER BY m.created_at ASC, m.id ASC
  LIMIT 1
)
WHERE c.initiator_id IS NULL;

CREATE INDEX idx_conversations_status ON conversations(status);
