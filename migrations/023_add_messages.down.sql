-- 回滚 023: 删除私信表和会话表的级联外键，再删表
DROP TABLE IF EXISTS chat_messages;
DROP TABLE IF EXISTS conversations;
