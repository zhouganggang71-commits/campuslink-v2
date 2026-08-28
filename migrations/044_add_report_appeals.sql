-- 举报申诉工单：内容因被多人举报自动/人工软隐藏后，作者本人可以申诉，管理员审核通过/驳回。
-- 只覆盖 post/circle_post/circle_comment 三种"会被软隐藏"的目标类型——chat_message 举报走的是
-- 拉黑流程，没有内容隐藏这一步，不存在"申诉恢复可见"的场景。
CREATE TABLE IF NOT EXISTS report_appeals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  target_type ENUM('post', 'circle_post', 'circle_comment') NOT NULL,
  target_id INT NOT NULL,
  user_id INT NOT NULL COMMENT '申诉人，必须是内容作者本人（服务端校验）',
  appeal_text VARCHAR(500) NOT NULL,
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  admin_note VARCHAR(500) DEFAULT NULL,
  resolved_by INT DEFAULT NULL,
  resolved_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- 一个内容同一时间只挂一条申诉记录：被驳回后可以重新提交，走 UPSERT 覆盖回 pending，
  -- 不留历史多条造成状态歧义（申诉文本/驳回理由本身已经能说明这是第几次）
  UNIQUE KEY uk_appeal_target (target_type, target_id),
  INDEX idx_appeal_status (status),
  CONSTRAINT fk_appeal_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
