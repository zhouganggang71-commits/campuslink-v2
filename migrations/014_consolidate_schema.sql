-- ============================================================
-- CampusLink v2.1 完整数据库规范 — 幂等执行
-- 设计原则：
--   1. 所有表 utf8mb4 + InnoDB
--   2. 所有外键 ON DELETE CASCADE（用户注销数据级联清理）
--   3. 敏感字段由应用层加密（contact_info, phone, registrant_name, student_id）
--   4. JSON 字段用于 images / tags
--   5. 幂等：全部 CREATE IF NOT EXISTS / ALTER ADD IF NOT EXISTS
-- ============================================================

-- ── 1. users（用户） ──
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(32) NOT NULL,
  nickname VARCHAR(64) NOT NULL,
  avatar_url VARCHAR(500) DEFAULT NULL,
  bio VARCHAR(80) DEFAULT NULL,
  password_hash VARCHAR(255) DEFAULT NULL,
  auth_status ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_student_id (student_id),
  INDEX idx_auth_status (auth_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 修复存量：auth_status 枚举对齐
ALTER TABLE users MODIFY COLUMN auth_status ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending';
-- 将旧的 unverified/org 映射到 pending/verified
UPDATE users SET auth_status = 'pending' WHERE auth_status = 'unverified';
UPDATE users SET auth_status = 'verified' WHERE auth_status = 'org';

-- 清理废弃列（使用存储过程避免列不存在报错）
SET @drop_openid = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='campuslink' AND TABLE_NAME='users' AND COLUMN_NAME='openid');
SET @sql = IF(@drop_openid > 0, 'ALTER TABLE users DROP COLUMN openid', 'SELECT "no openid column"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @drop_rname = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='campuslink' AND TABLE_NAME='users' AND COLUMN_NAME='real_name');
SET @sql = IF(@drop_rname > 0, 'ALTER TABLE users DROP COLUMN real_name', 'SELECT "no real_name column"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @drop_role = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='campuslink' AND TABLE_NAME='users' AND COLUMN_NAME='role');
SET @sql = IF(@drop_role > 0, 'ALTER TABLE users DROP COLUMN role', 'SELECT "no role column"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @drop_dept = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='campuslink' AND TABLE_NAME='users' AND COLUMN_NAME='department');
SET @sql = IF(@drop_dept > 0, 'ALTER TABLE users DROP COLUMN department', 'SELECT "no department column"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 2. refresh_tokens（JWT 刷新令牌） ──
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token VARCHAR(500) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 3. posts（信息广场帖子） ──
CREATE TABLE IF NOT EXISTS posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(100) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) DEFAULT NULL,
  original_price DECIMAL(10,2) DEFAULT NULL,
  category VARCHAR(32) DEFAULT NULL,
  post_type VARCHAR(16) NOT NULL,
  image_urls JSON DEFAULT NULL,
  contact_info VARCHAR(512) DEFAULT NULL COMMENT '加密存储',
  status ENUM('active','sold','pending','rejected','closed') NOT NULL DEFAULT 'pending',
  is_official BOOLEAN NOT NULL DEFAULT FALSE,
  reject_reason VARCHAR(256) DEFAULT NULL,
  views INT UNSIGNED NOT NULL DEFAULT 1,
  title_hash VARCHAR(64) DEFAULT NULL,
  created_date DATE DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_posts_user (user_id),
  INDEX idx_posts_status_time (status, created_at DESC),
  INDEX idx_posts_type (post_type, status),
  FULLTEXT INDEX ft_posts_search (title, description),
  CONSTRAINT fk_posts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 修复存量：已存在的帖子更新 created_date
UPDATE posts SET created_date = DATE(created_at) WHERE created_date IS NULL;

-- ── 4. favorites（信息广场收藏） ──
CREATE TABLE IF NOT EXISTS favorites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  post_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_fav_user_post (user_id, post_id),
  INDEX idx_fav_post (post_id),
  CONSTRAINT fk_fav_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_fav_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 5. registrations（活动报名） ──
CREATE TABLE IF NOT EXISTS registrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  listing_id INT NOT NULL,
  listing_title VARCHAR(200) DEFAULT NULL,
  registrant_name VARCHAR(200) DEFAULT NULL COMMENT '加密存储',
  student_id VARCHAR(100) DEFAULT NULL COMMENT '加密存储',
  department VARCHAR(50) DEFAULT NULL,
  phone VARCHAR(100) DEFAULT NULL COMMENT '加密存储',
  user_id INT NOT NULL,
  idempotency_key VARCHAR(64) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_idempotency (idempotency_key),
  INDEX idx_reg_listing (listing_id),
  INDEX idx_reg_user (user_id),
  CONSTRAINT fk_reg_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_reg_post FOREIGN KEY (listing_id) REFERENCES posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 修复存量：listing_id 如果是 VARCHAR 需要转换（有数据就先跳过）
-- ALTER TABLE registrations MODIFY COLUMN listing_id INT NOT NULL; -- 手动执行

-- ── 6. courses（课表） ──
CREATE TABLE IF NOT EXISTS courses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(64) NOT NULL,
  teacher VARCHAR(32) DEFAULT NULL,
  classroom VARCHAR(64) DEFAULT NULL,
  weekday TINYINT NOT NULL,
  start_period TINYINT NOT NULL,
  period_span TINYINT NOT NULL DEFAULT 2,
  week_start TINYINT NOT NULL DEFAULT 1,
  week_end TINYINT NOT NULL DEFAULT 18,
  week_type ENUM('all','odd','even') NOT NULL DEFAULT 'all',
  course_type ENUM('theory','lab','elective') NOT NULL DEFAULT 'theory',
  color_class VARCHAR(64) NOT NULL DEFAULT 'bg-course-blue text-white',
  is_finished BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_courses_user (user_id),
  CONSTRAINT fk_courses_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 7. ads（广告） ──
CREATE TABLE IF NOT EXISTS ads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  image_url VARCHAR(500) DEFAULT NULL,
  link_url VARCHAR(500) DEFAULT NULL,
  position VARCHAR(20) NOT NULL DEFAULT 'banner',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  priority INT NOT NULL DEFAULT 0,
  start_date DATE DEFAULT NULL,
  end_date DATE DEFAULT NULL,
  views INT UNSIGNED NOT NULL DEFAULT 0,
  clicks INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 8. notices（通知） ──
CREATE TABLE IF NOT EXISTS notices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  content TEXT,
  source VARCHAR(64) DEFAULT NULL,
  is_official BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 9. feedbacks（用户反馈） ──
CREATE TABLE IF NOT EXISTS feedbacks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  user_name VARCHAR(100) NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  contact VARCHAR(200) NOT NULL DEFAULT '',
  status ENUM('pending','resolved') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME DEFAULT NULL,
  INDEX idx_fb_status (status),
  INDEX idx_fb_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 10. circles（校园圈 — 圈子元数据） ──
CREATE TABLE IF NOT EXISTS circles (
  id VARCHAR(30) PRIMARY KEY,
  name VARCHAR(30) NOT NULL,
  description VARCHAR(200) NOT NULL DEFAULT '',
  icon VARCHAR(30) NOT NULL DEFAULT 'chat',
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  post_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO circles (id, name, description, icon, sort_order) VALUES
  ('trending','今天发生','全校闲聊广场，发现身边新鲜事','trending_up',1),
  ('study','学业互助','选课考研考证，笔记组队共享','school',2),
  ('sports','约球约饭','找搭子打球跑步约食堂','directions_car',3),
  ('hobby','兴趣社团','摄影乐队电竞二次元同好','celebration',4),
  ('treehole','匿名树洞','心事吐槽情感诉说释放','chat',5),
  ('career','毕业就业','实习内推专升本面试经验','work',6);

-- ── 11. circle_posts（校园圈帖子） ──
CREATE TABLE IF NOT EXISTS circle_posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  circle_id VARCHAR(30) NOT NULL,
  content TEXT NOT NULL,
  images JSON DEFAULT NULL,
  tags JSON DEFAULT NULL,
  is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
  like_count INT UNSIGNED NOT NULL DEFAULT 0,
  comment_count INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('active','hidden','deleted') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cp_circle_time (circle_id, status, created_at DESC),
  INDEX idx_cp_user (user_id),
  INDEX idx_cp_hot (status, like_count DESC, created_at DESC),
  CONSTRAINT fk_cp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cp_circle FOREIGN KEY (circle_id) REFERENCES circles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 12. circle_likes（校园圈点赞） ──
CREATE TABLE IF NOT EXISTS circle_likes (
  user_id INT NOT NULL,
  post_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, post_id),
  INDEX idx_cl_post (post_id),
  CONSTRAINT fk_cl_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cl_post FOREIGN KEY (post_id) REFERENCES circle_posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 13. circle_comments（校园圈评论） ──
CREATE TABLE IF NOT EXISTS circle_comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  post_id INT NOT NULL,
  user_id INT NOT NULL,
  parent_id INT DEFAULT NULL,
  content VARCHAR(500) NOT NULL,
  status ENUM('active','hidden','deleted') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cc_post (post_id, status, created_at),
  INDEX idx_cc_user (user_id),
  CONSTRAINT fk_cc_post FOREIGN KEY (post_id) REFERENCES circle_posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_cc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 14. circle_favorites（校园圈收藏） ──
CREATE TABLE IF NOT EXISTS circle_favorites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  post_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_cfav_user_post (user_id, post_id),
  INDEX idx_cfav_user (user_id),
  CONSTRAINT fk_cfav_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cfav_post FOREIGN KEY (post_id) REFERENCES circle_posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 15. _migrations（迁移记录） ──
CREATE TABLE IF NOT EXISTS _migrations (
  name VARCHAR(255) PRIMARY KEY,
  batch INT NOT NULL DEFAULT 1,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 兼容旧表：补充 batch 列
SET @batch_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='campuslink' AND TABLE_NAME='_migrations' AND COLUMN_NAME='batch');
SET @sql = IF(@batch_exists = 0, 'ALTER TABLE _migrations ADD COLUMN batch INT NOT NULL DEFAULT 1', 'SELECT "batch exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
