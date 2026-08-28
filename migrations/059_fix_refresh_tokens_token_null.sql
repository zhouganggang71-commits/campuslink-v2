-- 059: refresh_tokens.token 列允许 NULL
-- 背景：027 迁移加了 token_hash 列后，代码只写 token_hash 不再写 token，
-- 但 token 列仍是 NOT NULL 且无默认值 → INSERT 报 "Field 'token' doesn't have a default value"。
-- 旧 token 数据已无意义（027 注释：旧 token 30 天自然过期后 token 列可删除），
-- 这里先改成可空以兼容存量数据，后续可择机 DROP COLUMN。
ALTER TABLE refresh_tokens MODIFY token VARCHAR(500) NULL;
