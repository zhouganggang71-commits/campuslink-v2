-- 060: users.school_cookie 加长到 MEDIUMTEXT
-- 背景：加密后的教务 Cookie（全量 cookies 拼接）超过 VARCHAR(2000) 上限，
-- 触发 "Data too long for column 'school_cookie'" → 一键刷新课表/成绩/考试功能失效。
ALTER TABLE users MODIFY school_cookie MEDIUMTEXT DEFAULT NULL COMMENT '加密的教务系统会话Cookie';
