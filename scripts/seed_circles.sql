INSERT INTO circle_posts (user_id, circle_id, content, images, tags, is_anonymous, like_count, comment_count, status, created_at)
SELECT 2, 'trending', '今天食堂二楼的麻辣香锅居然加了虾滑！好吃到哭 强烈推荐大家都去试试！', '[]', '["食堂","美食"]', 0, 23, 5, 'active', DATE_SUB(NOW(), INTERVAL 1 HOUR)
WHERE NOT EXISTS (SELECT 1 FROM circle_posts WHERE user_id=2 AND content LIKE '%食堂二楼的麻辣香锅%');

INSERT INTO circle_posts (user_id, circle_id, content, images, tags, is_anonymous, like_count, comment_count, status, created_at)
SELECT 2, 'study', '求问高数补考的范围和去年一样吗？有知道的同学麻烦踢我一下，在线等挺急的', '[]', '["高数","补考"]', 0, 15, 8, 'active', DATE_SUB(NOW(), INTERVAL 3 HOUR)
WHERE NOT EXISTS (SELECT 1 FROM circle_posts WHERE user_id=2 AND content LIKE '%高数补考的范围%');

INSERT INTO circle_posts (user_id, circle_id, content, images, tags, is_anonymous, like_count, comment_count, status, created_at)
SELECT 2, 'sports', '有没有人想组个羽毛球小分队？每周三周五下午4点体育馆，新手老手都欢迎！', '[]', '["羽毛球","组队"]', 0, 18, 12, 'active', DATE_SUB(NOW(), INTERVAL 5 HOUR)
WHERE NOT EXISTS (SELECT 1 FROM circle_posts WHERE user_id=2 AND content LIKE '%羽毛球小分队%');

INSERT INTO circle_posts (user_id, circle_id, content, images, tags, is_anonymous, like_count, comment_count, status, created_at)
SELECT 2, 'career', '大二结束才意识到应该早点实习，有没有学长学姐分享下大三的时间规划？感觉好迷茫', '[]', '["实习","大三","规划"]', 0, 42, 18, 'active', DATE_SUB(NOW(), INTERVAL 2 HOUR)
WHERE NOT EXISTS (SELECT 1 FROM circle_posts WHERE user_id=2 AND content LIKE '%大三的时间规划%');

INSERT INTO circle_posts (user_id, circle_id, content, images, tags, is_anonymous, like_count, comment_count, status, created_at)
SELECT 2, 'treehole', '偷偷说，其实我觉得图书馆四楼靠窗那个位置是整个学校最舒服的地方，每次去都有种莫名的安心感', '[]', '["图书馆","碎碎念"]', 1, 67, 3, 'active', DATE_SUB(NOW(), INTERVAL 30 MINUTE)
WHERE NOT EXISTS (SELECT 1 FROM circle_posts WHERE user_id=2 AND content LIKE '%图书馆四楼靠窗%');

INSERT INTO circle_posts (user_id, circle_id, content, images, tags, is_anonymous, like_count, comment_count, status, created_at)
SELECT 2, 'hobby', '有人玩原神吗？想问问抽芙宁娜值得吗，攒了80抽舍不得用', '[]', '["原神","游戏"]', 0, 31, 22, 'active', DATE_SUB(NOW(), INTERVAL 6 HOUR)
WHERE NOT EXISTS (SELECT 1 FROM circle_posts WHERE user_id=2 AND content LIKE '%原神%芙宁娜%');

INSERT INTO circle_posts (user_id, circle_id, content, images, tags, is_anonymous, like_count, comment_count, status, created_at)
SELECT 2, 'trending', '朋友圈全是五一出游的照片 只有我在图书馆卷复试 谁懂啊', '[]', '["考研","图书馆"]', 0, 56, 9, 'active', DATE_SUB(NOW(), INTERVAL 45 MINUTE)
WHERE NOT EXISTS (SELECT 1 FROM circle_posts WHERE user_id=2 AND content LIKE '%卷复试%');

INSERT INTO circle_posts (user_id, circle_id, content, images, tags, is_anonymous, like_count, comment_count, status, created_at)
SELECT 2, 'treehole', '说实话 虽然这个学校不是985211 但是遇到的老师和同学都蛮好的 突然有点感慨', '[]', '["感慨","校园"]', 1, 89, 15, 'active', DATE_SUB(NOW(), INTERVAL 1 HOUR)
WHERE NOT EXISTS (SELECT 1 FROM circle_posts WHERE user_id=2 AND content LIKE '%不是985211%');

UPDATE circles c SET post_count = (SELECT COUNT(*) FROM circle_posts WHERE circle_id = c.id AND status = 'active');
