-- Down: 006 幂等保障
ALTER TABLE registrations DROP COLUMN IF EXISTS idempotency_key;
ALTER TABLE posts DROP COLUMN IF EXISTS title_hash;
ALTER TABLE posts DROP COLUMN IF EXISTS created_date;
