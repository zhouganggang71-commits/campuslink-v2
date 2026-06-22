-- 外键约束：保障数据完整性，防止孤立记录
-- 注意：MySQL 8 要求外键列和被引用列类型/字符集完全一致

-- posts → users
ALTER TABLE posts ADD CONSTRAINT fk_posts_user
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- courses → users
ALTER TABLE courses ADD CONSTRAINT fk_courses_user
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- registrations → users + posts
ALTER TABLE registrations ADD CONSTRAINT fk_registrations_user
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE registrations ADD CONSTRAINT fk_registrations_listing
  FOREIGN KEY (listing_id) REFERENCES posts(id) ON DELETE CASCADE;

-- favorites → users + posts
ALTER TABLE favorites ADD CONSTRAINT fk_favorites_user
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE favorites ADD CONSTRAINT fk_favorites_post
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;

-- refresh_tokens → users
ALTER TABLE refresh_tokens ADD CONSTRAINT fk_refresh_tokens_user
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
