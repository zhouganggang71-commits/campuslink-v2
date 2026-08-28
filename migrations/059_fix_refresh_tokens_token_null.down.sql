-- 回滚 059：token 列恢复 NOT NULL（仅当存量数据全部迁移到 token_hash 后才可回滚）
ALTER TABLE refresh_tokens MODIFY token VARCHAR(500) NOT NULL;
