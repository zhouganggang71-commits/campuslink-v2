-- 单次调课：老师口头调课是常态（教务数据不反映），学生自己改"某一周的某一节课"
-- 语义（果果 2026-07-04 定）：一次只动一节——本周停课，或挪到 (目标周, 星期, 节次[, 教室])
-- 同周调 = to_week 等于原 week；不做单双周批量调（真实场景不存在）
CREATE TABLE IF NOT EXISTS course_overrides (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  course_id INT NOT NULL,
  week INT NOT NULL COMMENT '被调整的原周次',
  action ENUM('cancel', 'move') NOT NULL,
  to_week INT DEFAULT NULL COMMENT 'move 目标周（同周调=原周）',
  to_weekday TINYINT DEFAULT NULL COMMENT 'move 目标星期 1-7',
  to_start_period TINYINT DEFAULT NULL COMMENT 'move 目标起始节',
  to_period_span TINYINT DEFAULT NULL COMMENT '目标节数，空=沿用原课',
  to_classroom VARCHAR(64) DEFAULT NULL COMMENT '目标教室，空=沿用原课',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_course_week (course_id, week),
  INDEX idx_overrides_user (user_id),
  CONSTRAINT fk_overrides_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_overrides_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
