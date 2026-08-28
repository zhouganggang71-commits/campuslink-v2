-- 回滚 060：school_cookie 恢复 VARCHAR(2000)（仅当无超长 cookie 数据后可回滚）
ALTER TABLE users MODIFY school_cookie VARCHAR(2000) DEFAULT NULL COMMENT '加密的教务系统会话Cookie';
