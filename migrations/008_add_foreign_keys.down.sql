-- Down: 外键约束（MySQL 8.0 不支持 DROP ... IF EXISTS，需逐个执行）
ALTER TABLE posts DROP FOREIGN KEY fk_posts_user;
ALTER TABLE courses DROP FOREIGN KEY fk_courses_user;
ALTER TABLE registrations DROP FOREIGN KEY fk_registrations_user;
ALTER TABLE registrations DROP FOREIGN KEY fk_registrations_listing;
ALTER TABLE favorites DROP FOREIGN KEY fk_favorites_user;
ALTER TABLE favorites DROP FOREIGN KEY fk_favorites_post;
ALTER TABLE refresh_tokens DROP FOREIGN KEY fk_refresh_tokens_user;
