-- 回滚 007: 删除全文搜索索引
ALTER TABLE posts DROP INDEX ft_posts_search;
