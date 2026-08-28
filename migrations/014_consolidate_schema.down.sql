-- 回滚 014: 该迁移创建了所有核心表（users/posts/courses/circles 等）
-- 在生产环境中执行 DROP TABLE 是灾难性的，此文件仅作记录用途，
-- 实际回滚应通过数据库备份恢复，而非执行此脚本。
-- 如果确定要回滚，取消注释以下语句：
-- DROP TABLE IF EXISTS circle_favorites, circle_comments, circle_likes, circle_posts, circles;
-- DROP TABLE IF EXISTS feedbacks, notices, ads, courses, registrations, favorites, posts, refresh_tokens, users, _migrations;
SELECT '014 回滚需要从备份恢复，此脚本已跳过' AS message;
