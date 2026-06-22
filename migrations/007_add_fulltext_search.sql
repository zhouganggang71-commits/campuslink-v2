-- 帖子全文搜索索引
ALTER TABLE posts ADD FULLTEXT INDEX ft_posts_search (title, description);
