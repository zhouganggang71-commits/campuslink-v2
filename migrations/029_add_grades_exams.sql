-- 成绩与考试信息：扫码登录时顺带从教务系统抓取存库，避免学生再登录"老年教务系统"查询
-- 结构参照 courses：按 user_id 归属，每次扫码登录覆盖式重同步（DELETE + INSERT）

-- ── grades（成绩） ──
CREATE TABLE IF NOT EXISTS grades (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  school_year VARCHAR(16) DEFAULT NULL,
  school_term VARCHAR(16) DEFAULT NULL,
  course_name VARCHAR(128) NOT NULL,
  teacher VARCHAR(32) DEFAULT NULL,
  credit VARCHAR(16) DEFAULT NULL,
  grade VARCHAR(16) DEFAULT NULL,
  grade_point VARCHAR(16) DEFAULT NULL,
  exam_nature VARCHAR(16) DEFAULT NULL,
  course_nature VARCHAR(32) DEFAULT NULL,
  course_category VARCHAR(32) DEFAULT NULL,
  course_attribution VARCHAR(32) DEFAULT NULL,
  open_college VARCHAR(64) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_grades_user (user_id),
  CONSTRAINT fk_grades_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── exams（考试安排） ──
CREATE TABLE IF NOT EXISTS exams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  school_year VARCHAR(16) DEFAULT NULL,
  school_term VARCHAR(16) DEFAULT NULL,
  course_name VARCHAR(128) NOT NULL,
  teacher VARCHAR(32) DEFAULT NULL,
  exam_name VARCHAR(64) DEFAULT NULL,
  exam_time VARCHAR(64) DEFAULT NULL,
  exam_location VARCHAR(64) DEFAULT NULL,
  campus VARCHAR(32) DEFAULT NULL,
  seat_number VARCHAR(16) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_exams_user (user_id),
  CONSTRAINT fk_exams_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
