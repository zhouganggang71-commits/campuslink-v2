-- 存储教务系统会话 Cookie 用于一键刷新课表/成绩/考试
-- 每次扫码登录时更新，加密存储
ALTER TABLE users ADD COLUMN school_cookie VARCHAR(2000) DEFAULT NULL COMMENT '加密的教务系统会话Cookie' AFTER last_login;
