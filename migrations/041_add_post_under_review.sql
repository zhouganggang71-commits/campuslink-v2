-- 举报达到阈值时软隐藏帖子用：posts.status 加 under_review
-- circle_posts/circle_comments 已有 'hidden' 状态可以直接复用，不需要迁移
ALTER TABLE posts MODIFY COLUMN status ENUM('active','sold','pending','rejected','closed','under_review') NOT NULL DEFAULT 'pending';
