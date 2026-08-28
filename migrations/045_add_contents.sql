-- 内容运营表：新生必看/校园介绍/生活服务/校历（对标竞品链千校，R12 Phase 1）
-- 设计要点：
--   1. school_id 多校预留：本轮恒为 1（川财），扩校时新表零迁移
--   2. 内容与 UGC 分离：运营内容走本表，UGC 帖子继续 posts/circle_posts
--   3. body_type 区分富文本 HTML 与结构化校历 JSON（calendar 分类专用）
--   4. 分类枚举：newcomer(新生必看)/campus_intro(校园介绍)/services(生活服务+宫格+Banner)/calendar(校历)
CREATE TABLE IF NOT EXISTS contents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_id INT NOT NULL DEFAULT 1 COMMENT '多校预留：本轮恒为1(川财)，扩校时零迁移',
  category ENUM('newcomer', 'campus_intro', 'services', 'calendar') NOT NULL,
  sub_category VARCHAR(32) NOT NULL DEFAULT '' COMMENT '二级分类/宫格项 key，如 dorm/checklist/banner',
  title VARCHAR(120) NOT NULL,
  summary VARCHAR(200) NOT NULL DEFAULT '',
  cover_url VARCHAR(500) DEFAULT NULL,
  body MEDIUMTEXT NOT NULL COMMENT '正文：body_type=html 存 HTML；calendar_json 存结构化校历',
  body_type ENUM('html', 'calendar_json') NOT NULL DEFAULT 'html',
  sort_order INT NOT NULL DEFAULT 0 COMMENT '同分类内排序，越小越靠前',
  status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
  view_count INT NOT NULL DEFAULT 0,
  created_by INT NOT NULL COMMENT '管理员 users.id',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_school_cat (school_id, category, status, sort_order),
  INDEX idx_sub_category (school_id, sub_category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
