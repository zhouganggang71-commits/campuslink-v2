-- 统一内容举报表：帖子/圈子帖子/圈子评论/私信共用同一张表，用 target_type+target_id 区分
-- 举报人必须登录（不允许匿名举报），否则举报被滥用时无法追责/反制协同诬告
-- 唯一约束防同一人对同一目标反复点举报刷计数，伪装成多人举报
CREATE TABLE IF NOT EXISTS reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reporter_id INT NOT NULL,
  target_type ENUM('post', 'circle_post', 'circle_comment', 'chat_message') NOT NULL,
  target_id INT NOT NULL,
  reason VARCHAR(50) NOT NULL COMMENT '骚扰/色情低俗/诈骗/人身攻击/虚假信息/其他',
  reason_detail VARCHAR(500) DEFAULT NULL,
  status ENUM('pending', 'reviewing', 'upheld', 'dismissed') NOT NULL DEFAULT 'pending',
  resolved_by INT DEFAULT NULL COMMENT '处理的管理员 user_id',
  resolution_note VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL DEFAULT NULL,
  UNIQUE KEY uk_report_once (reporter_id, target_type, target_id),
  INDEX idx_reports_target (target_type, target_id),
  INDEX idx_reports_status (status),
  CONSTRAINT fk_reports_reporter FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
