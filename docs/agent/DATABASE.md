# CampusLink 数据库

MySQL 8，共 **21 张表**（含迁移追踪表）。

## 表清单

| 表 | 说明 |
|----|------|
| users | 用户（实名认证） |
| refresh_tokens | JWT 刷新令牌 |
| posts | 二手/兼职/拼车/活动等帖子 |
| favorites | 收藏 |
| registrations | 活动报名 |
| courses | 课表 |
| categories | 分类 |
| ads | 广告 |
| notices | 通知 |
| feedbacks | 反馈 |
| circles | 校园圈 |
| circle_posts | 校园圈帖子 |
| circle_likes | 校园圈点赞 |
| circle_comments | 校园圈评论 |
| circle_favorites | 校园圈收藏 |
| conversations | 私信会话 |
| chat_messages | 私信消息 |
| grades | 成绩 |
| exams | 考试安排 |
| user_blocks | 用户拉黑 |
| _migrations | 迁移追踪 |

## 加密

**AES-256-CBC** 加密以下字段（密钥 `ENCRYPTION_KEY`，应用层 `crypto.ts` 加解密）：

- `posts.contact_info`
- `registrations.registrant_name`, `registrations.student_id`, `registrations.phone`

## 推送相关

| 表 | 说明 |
|----|------|
| push_subscriptions | Web Push 订阅 |
| push_log | 推送日志（防重推，唯一键 `(user_id, push_type, dedup_key)`） |

## 举报 & 申诉

| 表 | 说明 |
|----|------|
| reports | 举报记录 |
| report_appeals | 申诉记录（唯一键 `(target_type, target_id)`） |

> 详细建表 SQL 见 `migrations/` 目录，按编号幂等执行。
