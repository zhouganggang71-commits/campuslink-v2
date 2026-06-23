-- ============================================================
-- CampusLink 数据库补充：安全审计 + 分类体系
-- 015_add_audit_and_categories.sql
-- ============================================================

-- ── 1. users 表补充 last_login / ip_address ──
SET @col_ll = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='campuslink' AND TABLE_NAME='users' AND COLUMN_NAME='last_login');
SET @sql = IF(@col_ll = 0, 'ALTER TABLE users ADD COLUMN last_login TIMESTAMP NULL AFTER password_hash', 'SELECT "last_login exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_ip = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='campuslink' AND TABLE_NAME='users' AND COLUMN_NAME='ip_address');
SET @sql = IF(@col_ip = 0, 'ALTER TABLE users ADD COLUMN ip_address VARCHAR(45) NULL AFTER last_login', 'SELECT "ip_address exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 2. 分类表（自关联支持层级） ──
CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(32) NOT NULL,
  parent_id INT DEFAULT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_cat_name_parent (name, parent_id),
  INDEX idx_cat_parent (parent_id),
  CONSTRAINT fk_cat_parent FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 种子数据（幂等）
INSERT IGNORE INTO categories (id, name, parent_id, sort_order) VALUES
  (1, '数码电器', NULL, 1),
  (2, '图书教材', NULL, 2),
  (3, '失物招领', NULL, 3),
  (4, '拼车出行', NULL, 4),
  (5, '社团活动', NULL, 5),
  (6, '兼职实习', NULL, 6),
  (7, '学习互助', NULL, 7);

-- ── 3. posts 表添加 category_id 外键 ──
SET @col_cid = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='campuslink' AND TABLE_NAME='posts' AND COLUMN_NAME='category_id');
SET @sql = IF(@col_cid = 0, 'ALTER TABLE posts ADD COLUMN category_id INT NULL AFTER category', 'SELECT "category_id exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 添加外键（幂等：先查是否存在）
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA='campuslink' AND TABLE_NAME='posts' AND CONSTRAINT_NAME='fk_posts_category');
SET @sql = IF(@fk_exists = 0, 'ALTER TABLE posts ADD CONSTRAINT fk_posts_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL', 'SELECT "fk_posts_category exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 4. 存量数据迁移：根据 category 字符串匹配 category_id ──
UPDATE posts p
JOIN categories c ON p.category = c.name
SET p.category_id = c.id
WHERE p.category_id IS NULL AND p.category IS NOT NULL;

-- ── 5. 索引 ──
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='campuslink' AND TABLE_NAME='posts' AND INDEX_NAME='idx_posts_category_id_status');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE posts ADD INDEX idx_posts_category_id_status (category_id, status)', 'SELECT "idx_posts_category_id_status exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
