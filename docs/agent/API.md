# CampusLink API 路由（/api/v1/）

| 模块 | 端点 | 方法 | 认证 | 限流 |
|------|------|------|------|------|
| auth | /auth/dev-login | POST | — | 5 |
| auth | /auth/refresh | POST | — | 10 |
| auth | /auth/logout | POST | auth | 10 |
| auth | /auth/avatar | POST | auth | 5 |
| auth | /auth/profile | PUT | auth | 10 |
| auth | /auth/password | PUT | auth | 3 |
| auth | /auth/me | GET | auth | 30 |
| auth | /auth/wechat-qr | POST | — | 3/30 |
| auth | /auth/wechat-poll | POST | — | 5/60 |
| auth | /auth/wechat-cancel | POST | — | 10/30 |
| posts | /posts | GET/POST | 写需auth | 3 |
| posts | /posts/:id | GET/DELETE | 删需auth | 5 |
| posts | /posts/:id/sold | PUT | auth | 5 |
| posts | /favorites/:postId | POST | auth | 10 |
| posts | /favorites | GET | auth | — |
| posts | /categories | GET | — | — |
| courses | /courses | GET/POST | auth | 50 |
| courses | /courses/terms | GET | auth | — |
| courses | /courses/batch | PUT | auth | 50 |
| courses | /courses/:id | DELETE | auth | 10 |
| schedule | /parse-schedule /ocr-* | POST/GET | auth | 各不同 |
| upload | /upload | POST | auth | 10 |
| registrations | /registrations | GET/POST | auth | 3 |
| circles | /circles /circles/trending | GET | — | — |
| circles | /circles/:id/posts | GET/POST | 写需auth | 3 |
| circles | /circles/:id/posts/:id | DELETE | auth | 10 |
| circles | /circle-posts/:id/like | POST | auth | 20 |
| circles | /circle-posts/:id/comment | POST | auth | 10 |
| circles | /circle-posts/:id/comments | GET | — | — |
| circles | /circle-posts/:id/favorite | POST | auth | 15 |
| circles | /circle-favorites | GET | auth | — |
| messages | /conversations | GET/POST | auth | 30/10 |
| messages | /conversations/unread-count | GET | auth | 60 |
| messages | /conversations/:id/messages | GET/POST | auth | 30/10 |
| messages | /conversations/:id/read | PUT | auth | 20 |
| messages | /users/:id/block | POST/DELETE | auth | 5 |
| messages | /users/blocked | GET | auth | 10 |
| ads | /ads /ads/:id/click | GET/POST | — | — |
| feedback | /feedback | POST | — | 5 |
| health | /health | GET | — | — |
| admin | /admin/* | 全部 | adminAuth | 各不同 |
| notices | /notices | GET/PUT | auth | — |

## 管理后台 API

| 端点 | 方法 | 说明 |
|------|------|------|
| /admin/reports | GET | 举报列表（支持 `?sort=priority`） |
| /admin/reports/:id | PUT | 处理举报 |
| /admin/report-appeals/:id | PUT | 处理申诉 |
| /admin/circle-posts | GET | 校园圈帖子列表 |
| /admin/circle-posts/:id | PUT | 更新校园圈帖子状态 |
| /admin/circle-comments | GET | 校园圈评论列表 |
| /admin/circle-comments/:id | PUT | 更新校园圈评论状态 |
| /admin/push/broadcast | POST | 全量推送广播 |
| /admin/push/test-user | POST | 单用户测试推送 |

## 举报 & 申诉 API

| 端点 | 方法 | 认证 | 说明 |
|------|------|------|------|
| /report-appeals | POST | auth | 提交申诉 |
| /report-appeals/mine | GET | auth | 查询我的申诉状态 |
