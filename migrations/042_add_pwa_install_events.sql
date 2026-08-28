-- PWA 安装引导埋点事件表
-- 记录用户看到/安装/关闭安装提示的行为，用于管理后台查看转化率
CREATE TABLE IF NOT EXISTS pwa_install_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_type VARCHAR(30) NOT NULL COMMENT 'shown|native_clicked|native_accepted|native_dismissed|manual_opened|manual_guide_viewed|dismissed',
  env VARCHAR(10) NOT NULL DEFAULT '' COMMENT 'ios|android',
  user_agent VARCHAR(500) NOT NULL DEFAULT '',
  ip_address VARCHAR(45) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pie_created (created_at),
  INDEX idx_pie_type (event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
