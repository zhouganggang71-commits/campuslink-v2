-- 学期配置：全系统唯一的"业务时间"权威源（当前学期 + 第几周都从这算）
-- 背景：开学日期此前存在前端 localStorage（campuslink_semester_start），
-- 每个客户端各算各的周数；服务端推送调度（上课/考试提醒）也需要权威周数。
-- 管理员每学期配一行（一年两次），教务系统无开学日期接口，只能人工。
CREATE TABLE IF NOT EXISTS term_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_year VARCHAR(16) NOT NULL COMMENT '学年起始年，正方 xnm 口径：2025 = 2025-2026学年',
  school_term VARCHAR(16) NOT NULL COMMENT '正方 xqm 编码：3=秋季，12=春季',
  start_date DATE NOT NULL COMMENT '开学日期（第1周周一）',
  weeks INT NOT NULL DEFAULT 20 COMMENT '教学周总数',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_term (school_year, school_term)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 种子：2025-2026学年春季学期，沿用前端旧默认值 2026-03-02，保持行为连续
-- xnm 语义 = 学期开始所在自然年（2026春 → xnm=2026），已应用环境由 034 修正
INSERT IGNORE INTO term_config (school_year, school_term, start_date, weeks)
VALUES ('2026', '12', '2026-03-02', 20);
