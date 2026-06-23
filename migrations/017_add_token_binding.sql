-- 017: 为 refresh_tokens 添加设备绑定字段
SET @col_device = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'refresh_tokens' AND COLUMN_NAME = 'device_info');
SET @sql_device = IF(@col_device = 0, 'ALTER TABLE refresh_tokens ADD COLUMN device_info VARCHAR(200) DEFAULT NULL COMMENT ''设备指纹（User-Agent 摘要）''', 'SELECT ''device_info exists''');
PREPARE stmt FROM @sql_device;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_ip = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'refresh_tokens' AND COLUMN_NAME = 'ip_address');
SET @sql_ip = IF(@col_ip = 0, 'ALTER TABLE refresh_tokens ADD COLUMN ip_address VARCHAR(50) DEFAULT NULL COMMENT ''签发时的客户端IP''', 'SELECT ''ip_address exists''');
PREPARE stmt FROM @sql_ip;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_lu = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'refresh_tokens' AND COLUMN_NAME = 'last_used_at');
SET @sql_lu = IF(@col_lu = 0, 'ALTER TABLE refresh_tokens ADD COLUMN last_used_at TIMESTAMP NULL DEFAULT NULL COMMENT ''最近一次使用时间''', 'SELECT ''last_used_at exists''');
PREPARE stmt FROM @sql_lu;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_uc = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'refresh_tokens' AND COLUMN_NAME = 'use_count');
SET @sql_uc = IF(@col_uc = 0, 'ALTER TABLE refresh_tokens ADD COLUMN use_count INT DEFAULT 0 COMMENT ''使用次数''', 'SELECT ''use_count exists''');
PREPARE stmt FROM @sql_uc;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
