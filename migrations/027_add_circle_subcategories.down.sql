-- 回滚 027: 删除新增的圈子子分类
DELETE FROM circles WHERE id IN ('exam', 'food', 'upgrade');
-- 恢复"约球约饭"描述
UPDATE circles SET description = '找搭子打球跑步约食堂' WHERE id = 'sports';
