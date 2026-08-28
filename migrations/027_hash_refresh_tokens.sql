-- 027: refresh_tokens 哈希存储
-- token 列保留兼容旧数据，新增 token_hash 列存 SHA-256 哈希
-- 旧 token 30 天自然过期后 token 列可删除

ALTER TABLE refresh_tokens ADD COLUMN token_hash VARCHAR(64) AFTER token;
CREATE INDEX idx_token_hash ON refresh_tokens (token_hash);
