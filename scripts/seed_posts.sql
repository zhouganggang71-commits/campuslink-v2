INSERT INTO posts (user_id, title, description, price, original_price, category, category_id, post_type, image_urls, contact_info, status, is_official, views, title_hash, created_date, created_at)
SELECT 2, '出闲置iPad Air5 64G 星空色', '买了半年基本没用过，电池循环不到50次，配件齐全。仅限校内面交。', 2800, 4399, '数码电器', 1, 'sell', '["https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=600"]', '微信 campus_helper', 'active', 0, 156, MD5(CONCAT(2, 'ipad-air5', CURDATE())), CURDATE(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM posts WHERE user_id=2 AND title='出闲置iPad Air5 64G 星空色' AND created_date=CURDATE());

INSERT INTO posts (user_id, title, description, price, original_price, category, category_id, post_type, image_urls, contact_info, status, is_official, views, title_hash, created_date, created_at)
SELECT 2, '周末春熙路拼车 还有3个位', '周六上午9点出发，学校南门集合。油费AA人均15块。', NULL, NULL, '拼车出行', 4, 'carpool', '[]', 'QQ群 87342156', 'active', 0, 89, MD5(CONCAT(2, 'chunxi-road', CURDATE())), CURDATE(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM posts WHERE user_id=2 AND title='周末春熙路拼车 还有3个位' AND created_date=CURDATE());

INSERT INTO posts (user_id, title, description, price, original_price, category, category_id, post_type, image_urls, contact_info, status, is_official, views, title_hash, created_date, created_at)
SELECT 2, '求购二手高等数学同济第七版', '考研需要，上下册都要，笔记多也没关系。', 25, 78, '图书教材', 2, 'sell', '[]', '微信 xuezhang2026', 'active', 0, 203, MD5(CONCAT(2, 'gaoshu-tongji', CURDATE())), CURDATE(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM posts WHERE user_id=2 AND title='求购二手高等数学同济第七版' AND created_date=CURDATE());

INSERT INTO posts (user_id, title, description, price, original_price, category, category_id, post_type, image_urls, contact_info, status, is_official, views, title_hash, created_date, created_at)
SELECT 2, '校园卡遗失 昨天在二食堂附近', '蓝色卡套上面贴着皮卡丘贴纸，捡到的同学麻烦联系我！', NULL, NULL, '失物招领', 3, 'lost', '[]', '电话 18227733797', 'active', 0, 312, MD5(CONCAT(2, 'xiaoyuanka', CURDATE())), CURDATE(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM posts WHERE user_id=2 AND title='校园卡遗失 昨天在二食堂附近' AND created_date=CURDATE());

INSERT INTO posts (user_id, title, description, price, original_price, category, category_id, post_type, image_urls, contact_info, status, is_official, views, title_hash, created_date, created_at)
SELECT 2, '五一假期三天兼职 发传单', '学校附近新开奶茶店需要发传单，100/天包午饭。', NULL, NULL, '兼职实习', 6, 'job', '[]', '微信 campus_helper', 'active', 0, 178, MD5(CONCAT(2, 'wuyi-jianzhi', CURDATE())), CURDATE(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM posts WHERE user_id=2 AND title='五一假期三天兼职 发传单' AND created_date=CURDATE());
