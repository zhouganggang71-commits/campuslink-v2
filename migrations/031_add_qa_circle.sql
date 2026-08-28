-- 校园圈新增"答疑解惑"板块
-- 纯新增，不改动/不迁移现有帖子，老数据不受影响
INSERT IGNORE INTO circles (id, name, description, icon, sort_order) VALUES
  ('qa', '答疑解惑', '学习疑问互答，学长学姐帮你解答', 'question_answer', 10);
