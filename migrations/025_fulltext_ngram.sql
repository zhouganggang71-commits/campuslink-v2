-- 修复中文全文搜索：默认 parser 按空格分词，中文标题整句一个 token，
-- MATCH AGAINST 基本搜不到。重建索引使用 ngram parser（默认 bigram）。
-- 注意：DROP 旧索引在索引不存在时会报错，迁移 runner 会跳过继续（幂等容错）。
ALTER TABLE posts DROP INDEX ft_posts_search;
ALTER TABLE posts ADD FULLTEXT INDEX ft_posts_search (title, description) WITH PARSER ngram;
