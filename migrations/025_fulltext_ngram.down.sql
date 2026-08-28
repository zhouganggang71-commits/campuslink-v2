-- 回滚 025: 恢复默认全文索引（无 ngram parser）
ALTER TABLE posts DROP INDEX ft_posts_search;
ALTER TABLE posts ADD FULLTEXT INDEX ft_posts_search (title, description);
