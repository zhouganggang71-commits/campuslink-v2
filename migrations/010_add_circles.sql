-- 校园圈：圈子 + 帖子 + 评论
-- 010_add_circles.sql

-- 圈子元数据
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

-- 种子数据（幂等，迁移重跑不炸）
INSERT IGNORE INTO circles (id, name, description, icon, sort_order) VALUES
  ('trending', '今天发生', '全校闲聊广场，发现身边新鲜事', 'trending_up', 1),
  ('study', '学业互助', '选课考研考证，笔记组队共享', 'school', 2),
  ('sports', '约球约饭', '找搭子打球跑步约食堂', 'directions_car', 3),
  ('hobby', '兴趣社团', '摄影乐队电竞二次元同好', 'celebration', 4),
  ('treehole', '匿名树洞', '心事吐槽情感诉说释放', 'chat', 5),
  ('career', '毕业就业', '实习内推专升本面试经验', 'work', 6);

-- 圈子帖子
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
  INDEX idx_cp_hot (circle_id, status, like_count DESC, created_at DESC),
  CONSTRAINT fk_cp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cp_circle FOREIGN KEY (circle_id) REFERENCES circles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 点赞（幂等：同一用户+同一帖子唯一条目）
CREATE TABLE IF NOT EXISTS circle_likes (
  user_id INT NOT NULL,
  post_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, post_id),
  INDEX idx_likes_post (post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
