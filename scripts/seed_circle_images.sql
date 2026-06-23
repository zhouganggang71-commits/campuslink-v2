INSERT INTO circle_posts (user_id, circle_id, content, images, tags, is_anonymous, like_count, comment_count, status, created_at)
SELECT 2, 'trending', '分享一下今天的校园日落🌅 操场角度绝了！', '["https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800","https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800"]', '["日落","校园","摄影"]', 0, 34, 7, 'active', DATE_SUB(NOW(), INTERVAL 30 MINUTE)
WHERE NOT EXISTS (SELECT 1 FROM circle_posts WHERE user_id=2 AND content LIKE '%校园日落%');

INSERT INTO circle_posts (user_id, circle_id, content, images, tags, is_anonymous, like_count, comment_count, status, created_at)
SELECT 2, 'hobby', '第一次尝试画水彩 虽然很菜但是过程好解压', '["https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=800"]', '["水彩","绘画","第一次"]', 0, 12, 3, 'active', DATE_SUB(NOW(), INTERVAL 2 HOUR)
WHERE NOT EXISTS (SELECT 1 FROM circle_posts WHERE user_id=2 AND content LIKE '%画水彩%');
