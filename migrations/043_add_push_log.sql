-- 推送去重日志：上课提醒/考试提醒是"全局 tick 批量扫描"模式，同一条提醒可能因 pm2 重启后
-- 补跑、tick 抖动等原因被重复算出来——用这张表的唯一键兜底，同一用户同一类型同一 dedup_key 只发一次。
-- 私信推送是同步触发（发一条消息推一次），天然不重复，不需要这张表。
CREATE TABLE IF NOT EXISTS push_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  push_type ENUM('class_reminder', 'exam_reminder', 'broadcast') NOT NULL,
  -- class_reminder: "${courseId}-${YYYY-MM-DD}"；exam_reminder: "${examId}-T7" / "${examId}-T1"
  dedup_key VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_push_log_dedup (user_id, push_type, dedup_key),
  INDEX idx_push_log_created (created_at),
  CONSTRAINT fk_push_log_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
