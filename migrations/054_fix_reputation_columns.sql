-- 修复 047：users 信誉列（ADD COLUMN IF NOT EXISTS 在 MySQL8 失败被 runner 跳过）
ALTER TABLE users ADD COLUMN reputation_score DECIMAL(4,1) NOT NULL DEFAULT 5.0 COMMENT '信誉平均分 1-5';
ALTER TABLE users ADD COLUMN review_count INT NOT NULL DEFAULT 0 COMMENT '收到评价数';
