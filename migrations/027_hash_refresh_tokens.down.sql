-- 回滚 027: 删除 token_hash 列和索引
ALTER TABLE refresh_tokens DROP INDEX idx_token_hash;
ALTER TABLE refresh_tokens DROP COLUMN token_hash;
