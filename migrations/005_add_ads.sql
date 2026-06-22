-- 广告系统
SET @tbl = (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='campuslink' AND TABLE_NAME='ads');
SET @sql = IF(@tbl = 0,
  'CREATE TABLE ads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    image_url VARCHAR(500),
    link_url VARCHAR(500),
    position VARCHAR(20) DEFAULT ''banner'',
    is_active BOOLEAN DEFAULT TRUE,
    priority INT DEFAULT 0,
    start_date DATE,
    end_date DATE,
    views INT DEFAULT 0,
    clicks INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )',
  'SELECT "ads table exists" AS message'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
