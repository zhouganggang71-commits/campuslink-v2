-- 互动消息（点赞/评论/回复）复用 notices 表，而不是另起新表
-- 原有 notices 只有 title/content 纯文本，点击无法跳转到具体帖子/评论——加 target 字段支持深链
ALTER TABLE notices ADD COLUMN target_type VARCHAR(20) DEFAULT NULL COMMENT 'circle_post/circle_comment，点击跳转用';
ALTER TABLE notices ADD COLUMN target_id INT DEFAULT NULL;

CREATE INDEX idx_notices_category ON notices(category);
