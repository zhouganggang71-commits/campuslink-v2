-- 回滚 028: 删除用户性别相关列
ALTER TABLE users DROP COLUMN gender_visible;
ALTER TABLE users DROP COLUMN gender;
