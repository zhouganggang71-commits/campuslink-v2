-- 面交交易 + 信誉系统（二手交易闭环，R12 Phase 2）
-- 设计：
--   1. transactions 交易单：买家发起 → 卖家同意生成 6 位面交码 → 面交核销 → completed（post 自动标 sold）→ 互评
--   2. face_code 一次性短时效（30 分钟），明文存储可接受（无账号体系外的攻击面），核销后状态流转
--   3. reviews 互评：1-5 星 + 文字，唯一键 (transaction_id, reviewer_id) 保证一个订单每人只评一次
--   4. users 加信誉列：reputation_score 平均分 + review_count 评价数，只展示不限制发布
-- 注意：迁移 runner 按分号切分，本文件语句内不含分号
CREATE TABLE IF NOT EXISTS transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  post_id INT NOT NULL,
  seller_id INT NOT NULL,
  buyer_id INT NOT NULL,
  status ENUM('pending', 'code_issued', 'completed', 'cancelled', 'disputed') NOT NULL DEFAULT 'pending',
  face_code VARCHAR(8) DEFAULT NULL COMMENT '6位数字面交码，一次性短时效',
  code_expires_at TIMESTAMP NULL DEFAULT NULL COMMENT '面交码过期时间',
  verify_attempts INT NOT NULL DEFAULT 0 COMMENT '核销失败次数，防爆破',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  INDEX idx_tx_post (post_id),
  INDEX idx_tx_seller (seller_id, status),
  INDEX idx_tx_buyer (buyer_id, status),
  CONSTRAINT fk_tx_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_tx_seller FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_tx_buyer FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  transaction_id INT NOT NULL,
  post_id INT NOT NULL,
  reviewer_id INT NOT NULL,
  reviewee_id INT NOT NULL,
  rating TINYINT NOT NULL COMMENT '1-5 星',
  comment VARCHAR(200) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_review_tx_user (transaction_id, reviewer_id),
  INDEX idx_reviewee (reviewee_id, created_at),
  CONSTRAINT fk_rev_tx FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
  CONSTRAINT fk_rev_reviewer FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_rev_reviewee FOREIGN KEY (reviewee_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 用户信誉列（只展示不限制发布）
ALTER TABLE users ADD COLUMN IF NOT EXISTS reputation_score DECIMAL(4,1) NOT NULL DEFAULT 5.0 COMMENT '信誉平均分 1-5';
ALTER TABLE users ADD COLUMN IF NOT EXISTS review_count INT NOT NULL DEFAULT 0 COMMENT '收到评价数';
