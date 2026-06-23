-- 016: 扩展 notices 表支持用户级消息通知
-- 原有 notices 表是全局广播通知（user_id=NULL），新增字段支持定向推送
-- 幂等：迁移 runner 逐条 try-catch，列已存在则跳过

ALTER TABLE notices ADD COLUMN user_id INT DEFAULT NULL;
ALTER TABLE notices ADD COLUMN is_read BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE notices ADD COLUMN category VARCHAR(20) NOT NULL DEFAULT 'official';

-- 为 user_id 添加索引（加速用户消息查询）
-- 忽略索引已存在的错误
CREATE INDEX idx_notices_user_id ON notices(user_id);
CREATE INDEX idx_notices_user_read ON notices(user_id, is_read);
