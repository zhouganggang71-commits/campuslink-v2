-- 幂等保障：registrations 表加 idempotency_key 唯一索引
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(64) NULL UNIQUE;

-- posts 表加标题哈希以便去重
ALTER TABLE posts ADD COLUMN IF NOT EXISTS title_hash VARCHAR(64) NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS created_date DATE NULL;
UPDATE posts SET created_date = DATE(created_at) WHERE created_date IS NULL;
