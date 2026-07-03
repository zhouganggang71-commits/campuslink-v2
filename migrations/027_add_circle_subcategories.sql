-- 校园圈细分：从"学业互助"拆出考证考试，从"约球约饭"拆出美食探店，从"毕业就业"拆出专升本
-- 纯新增，不改动/不迁移现有帖子的 circle_id，老数据不受影响
INSERT IGNORE INTO circles (id, name, description, icon, sort_order) VALUES
  ('exam', '考证考试', '会计证/教资/计算机等级/四六级，备考经验互助', 'edit_document', 7),
  ('food', '美食探店', '食堂天梯榜、周边探店安利、拼单薅羊毛', 'restaurant', 8),
  ('upgrade', '专升本', '专升本备考择校、真题资料、上岸经验', 'graduation_cap', 9);

-- "约球约饭"改名聚焦运动搭子，饭局内容移到新的"美食探店"
UPDATE circles SET description = '找搭子打球跑步健身' WHERE id = 'sports';
