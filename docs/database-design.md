# CampusLink 完整数据库设计文档

## 一、设计原则

| 原则 | 说明 |
|------|------|
| **学生即用户** | 不搞邮箱/手机注册，学号是唯一标识。账号由管理员预置或学生自助注册后审核。 |
| **内容双轨** | 信息广场（功能型帖子：二手/失物/拼车）和校园圈（社交型帖子：闲聊/树洞）两种内容体系独立运行。 |
| **安全基线** | 密码 bcrypt 哈希、联系方式 AES 加密、全链路日志、所有写操作有限流。 |
| **数据主权** | 用户注销时所有数据级联删除（ON DELETE CASCADE），不留孤儿记录。 |
| **体量不超前** | 不搞读写分离、不分库分表、不加 Redis。单台 N100 MySQL 直连够用到 10 万用户。 |

---

## 二、对象-数据库映射（完整 16 张表）

### 1. 用户 (users)

```
users
├── id              INT PK       — 自增主键
├── student_id      VARCHAR(32)  — 学号，唯一标识，登录凭据之一
├── nickname        VARCHAR(64)  — 显示名称（可不同于真实姓名）
├── avatar_url      VARCHAR(500) — 头像路径 /uploads/avatars/xxx.jpg
├── bio             VARCHAR(80)  — 个性签名
├── password_hash   VARCHAR(255) — bcrypt 哈希，禁止明文
├── auth_status     ENUM         — pending(待审核)/verified(已认证)/rejected(已拒绝)
├── is_admin        BOOLEAN      — 管理员标记（唯一管理员：学号 202330140113）
├── last_login      TIMESTAMP    — 最后登录时间（安全审计）
├── ip_address      VARCHAR(45)  — 最后登录 IP（安全审计，支持 IPv6）
├── created_at      TIMESTAMP
└── updated_at      TIMESTAMP
```

**建立原因**：用户是一切操作的主体。`auth_status` 控制权限分级（待审核只能浏览），`last_login`+`ip_address` 满足安全审计 SOP——异常登录可追溯。`bio`+`avatar_url` 支撑社交化个人主页。

**SOP 闭环**：
- 正常：学号+密码 → bcrypt 校验 → JWT 签发 → 记录 login 时间和 IP
- 异常：密码错误 5 次触发限流 → 安全日志记录 → 返回 401
- 追溯：`logs/security-*.log` + `users.last_login` + `users.ip_address` 三向定位
- 恢复：密码通过管理员重置（`PUT /api/v1/auth/password`）

---

### 2. JWT 刷新令牌 (refresh_tokens)

```
refresh_tokens
├── id         INT PK
├── user_id    INT FK → users(id) ON DELETE CASCADE
├── token      VARCHAR(500) UNIQUE
├── expires_at TIMESTAMP
└── created_at TIMESTAMP
```

**建立原因**：JWT access token 1h 过期，refresh token 30d 免密续期。独立表存储而非存在 users 表上——一人多设备登录时多个 refresh token 互不覆盖。

**SOP**：用户注销 → DELETE FROM refresh_tokens WHERE user_id = ? → 所有设备同时下线。

---

### 3. 信息广场帖子 (posts)

```
posts
├── id              INT PK
├── user_id         INT FK → users(id) ON DELETE CASCADE
├── title           VARCHAR(100)  — 标题
├── description     TEXT          — 正文
├── price           DECIMAL(10,2) — 售价（二手交易）
├── original_price  DECIMAL(10,2) — 原价（对比用）
├── category        VARCHAR(32)   — 分类字符串（过渡期保留）
├── category_id     INT FK → categories(id) ON DELETE SET NULL — 分类 ID
├── post_type       VARCHAR(16)   — sell/lost/found/carpool/job/activity/study
├── image_urls      JSON          — 图片 URL 数组
├── contact_info    VARCHAR(512)  — 联系方式（AES-256 加密存储）
├── status          ENUM          — active/sold/pending/rejected/closed
├── is_official     BOOLEAN       — 是否官方发布
├── reject_reason   VARCHAR(256)  — 驳回原因
├── views           INT UNSIGNED  — 浏览数
├── title_hash      VARCHAR(64)   — 标题哈希（同用户同日去重）
├── created_date    DATE          — 创建日期（去重用）
├── created_at      TIMESTAMP
└── updated_at      TIMESTAMP
索引：FULLTEXT (title, description) — 全文搜索
索引：(category_id, status)         — 分类筛选
索引：(status, created_at DESC)     — 首页帖子流
```

**建立原因**：平台核心内容载体。`post_type` 区分信息类型（二手/失物/活动等）。`category` 提供内容分类。`title_hash`+`created_date` 实现同日同人去重——防止误发重复帖。`contact_info` 加密存储满足隐私合规。`FULLTEXT` 索引支撑关键词搜索。

**SOP**：
- 正常：发帖 → Zod 校验 → 敏感词检测 → 每日限额检查 → 去重检查 → INSERT → 业务日志
- 异常：敏感词命中 → 安全日志 → 400 返回命中词 → 数据不入库
- 追溯：`logs/business-*.log` 记录 post_id+user_id+title
- 恢复：管理员可驳回/恢复状态（`?admin` 面板 + Navicat 直连）

---

### 4. 信息广场收藏 (favorites)

```
favorites
├── id         INT PK
├── user_id    INT FK → users(id)
├── post_id    INT FK → posts(id)
├── UNIQUE(user_id, post_id)
└── created_at TIMESTAMP
```

**建立原因**：独立关联表而非在 posts 上存收藏数。UNIQUE 约束保证一人一帖只收藏一次，幂等切换（收藏↔取消）。前端乐观更新 + 服务端同步。

---

### 5. 活动报名 (registrations)

```
registrations
├── id               INT PK
├── listing_id       INT FK → posts(id)
├── listing_title    VARCHAR(200)  — 冗余活动标题（报名记录可脱离帖子查看）
├── registrant_name  VARCHAR(200)  — 报名人姓名（加密）
├── student_id       VARCHAR(100)  — 报名人学号（加密）
├── department       VARCHAR(50)   — 院系
├── phone            VARCHAR(100)  — 电话（加密）
├── user_id          INT FK → users(id)
├── idempotency_key  VARCHAR(64) UNIQUE — 幂等键
└── created_at       TIMESTAMP
```

**建立原因**：活动帖子的报名记录。`idempotency_key` 防止重复提交（前端生成 UUID，相同 key 的重复请求直接返回成功不重复插入）。姓名/学号/电话加密存储，API 返回时解密。

---

### 6. 课表 (courses)

```
courses
├── id           INT PK
├── user_id      INT FK → users(id)
├── name         VARCHAR(64)   — 课程名
├── teacher      VARCHAR(32)   — 教师
├── classroom    VARCHAR(64)   — 教室
├── weekday      TINYINT       — 星期几 (1-7)
├── start_period TINYINT       — 开始节次
├── period_span  TINYINT       — 持续节数
├── week_start   TINYINT       — 起始周
├── week_end     TINYINT       — 结束周
├── week_type    ENUM(all/odd/even) — 单双周
├── course_type  ENUM(theory/lab/elective)
├── color_class  VARCHAR(64)   — 课表显示颜色
├── is_finished  BOOLEAN       — 是否结课
└── created_at   TIMESTAMP
```

**建立原因**：课表独立存储，每个用户可有多门课程。支持单双周、起止周等教务系统特性。OCR 导入时批量写入（事务保证原子性）。

---

### 7-8. 分类体系 (categories)

```
categories
├── id         INT PK
├── name       VARCHAR(32)   — 分类名
├── parent_id  INT FK → categories(id) — 父分类（自关联支持层级）
├── sort_order INT           — 排序
├── is_active  BOOLEAN       — 是否启用
├── created_at TIMESTAMP
└── updated_at TIMESTAMP
UNIQUE(name, parent_id)
```

**建立原因**：替代 posts.category 的硬编码字符串。自关联 parent_id 支持二级分类（如"数码电器→手机"）。管理员可通过后台增删改分类，无需改代码。

当前种子数据（7 个一级分类）：数码电器、图书教材、失物招领、拼车出行、社团活动、兼职实习、学习互助。

---

### 9. 广告 (ads)

```
ads — id / title / image_url / link_url / position / is_active / priority
      / start_date / end_date / views / clicks / created_at / updated_at
```

**建立原因**：预留商业接口。不依赖第三方广告 SDK，自建轻量表。

---

### 10. 系统通知 (notices)

```
notices — id / title / content / source / is_official / created_at
```

**建立原因**：首页通知栏数据源。与 posts 独立——通知是单向推送，帖子是双向交互。

---

### 11. 用户反馈 (feedbacks)

```
feedbacks — id / user_id / user_name / content / contact / status / created_at / resolved_at
```

**建立原因**：用户反馈→管理员处理→闭环。status 从 pending→resolved。

---

### 12. 校园圈 — 圈子 (circles)

```
circles
├── id          VARCHAR(30) PK — trending/study/sports/hobby/treehole/career
├── name        VARCHAR(30)    — 圈子名称
├── description VARCHAR(200)   — 描述
├── icon        VARCHAR(30)    — 图标名
├── sort_order  INT            — 排序
├── is_active   BOOLEAN
├── post_count  INT UNSIGNED   — 帖子数（冗余计数器，发布/删除时 +1/-1）
└── created_at  TIMESTAMP
```

**建立原因**：校园圈内容按圈子分流。"今天发生"是全校热门流，其余 5 个是主题圈子。`post_count` 冗余计数器避免 COUNT(*) 查询。

种子数据：trending/study/sports/hobby/treehole/career。

---

### 13. 校园圈帖子 (circle_posts)

```
circle_posts
├── id            INT PK
├── user_id       INT FK → users(id)
├── circle_id     VARCHAR(30) FK → circles(id)
├── content       TEXT          — 帖子内容
├── images        JSON          — 图片数组
├── tags          JSON          — 标签数组
├── is_anonymous  BOOLEAN       — 匿名发布
├── like_count    INT UNSIGNED  — 点赞数（从 circle_likes 同步）
├── comment_count INT UNSIGNED  — 评论数（从 circle_comments 同步）
├── status        ENUM(active/hidden/deleted)
├── created_at    TIMESTAMP
└── updated_at    TIMESTAMP
```

**建立原因**：校园圈社交内容。与 posts 独立——posts 是功能型（交易/报名），circle_posts 是社交型（分享/闲聊）。`like_count`/`comment_count` 是反范式冗余字段，点赞/评论时同步更新，避免 JOIN COUNT。

---

### 14-16. 校园圈子表

| 表 | 结构 | 说明 |
|----|------|------|
| `circle_likes` | user_id + post_id (复合PK) | 点赞幂等（INSERT IGNORE），一人一帖一条 |
| `circle_comments` | id / post_id / user_id / parent_id / content / status | 支持嵌套回复（parent_id 自关联），树形组装在前端 |
| `circle_favorites` | id / user_id / post_id UNIQUE | 收藏功能，与广场收藏同模式 |

---

### 附：迁移记录 (_migrations)

```
_migrations — name VARCHAR PK / batch INT / applied_at TIMESTAMP
```

记录已执行的迁移文件名和批次，支持幂等重复执行和回滚追踪。

---

## 三、ER 关系图（文字描述）

```
users (1) ──< posts (N)            — 一个用户发多个帖子
users (1) ──< favorites (N)        — 一个用户收藏多个帖子
posts (1) ──< favorites (N)        — 一个帖子被多人收藏
users (1) ──< registrations (N)    — 一个用户报名多个活动
posts (1) ──< registrations (N)    — 一个活动被多人报名
users (1) ──< courses (N)          — 一个用户有多门课
categories (1) ──< posts (N)       — 一个分类下有多个帖子
categories (1) ──< categories (N)  — 分类自关联（父→子）

users (1) ──< circle_posts (N)     — 校园圈发帖
circles (1) ──< circle_posts (N)   — 圈子包含帖子
users (1) ──< circle_likes (N)     — 点赞
circle_posts (1) ──< circle_likes (N)
users (1) ──< circle_comments (N)  — 评论
circle_posts (1) ──< circle_comments (N)
circle_comments (1) ──< circle_comments (N) — 回复嵌套
users (1) ──< circle_favorites (N)
circle_posts (1) ──< circle_favorites (N)

独立表：ads / notices / feedbacks / refresh_tokens / _migrations
```

## 四、加密策略

| 表 | 字段 | 算法 | 密钥来源 |
|----|------|------|----------|
| users | password_hash | bcrypt(10) | 无需密钥（自带盐） |
| posts | contact_info | AES-256-CBC | .env ENCRYPTION_KEY |
| registrations | registrant_name, student_id, phone | AES-256-CBC | .env ENCRYPTION_KEY |

加密在应用层（`src/server/crypto.ts`）进行，数据库存储 base64 密文。备份文件（mysqldump）再用 AES-256 二次加密。

## 五、SOP 闭环检查清单

| 流程 | 正常 | 异常 | 追溯 | 恢复 |
|------|------|------|------|------|
| 登录 | bcrypt→JWT→记录 IP | 限流→安全日志 | security log + last_login + ip | 管理员重置密码 |
| 发帖 | Zod→敏感词→限流→INSERT | 命中→400→不入库 | business log(post_id) | 管理员驳回/恢复 |
| 报名 | Zod→幂等→加密→INSERT | 重复 key→返回成功 | business log | 活动创建者查看 |
| 收藏 | 乐观更新→API→同步 | 失败→回滚本地 | business log | — |
| 点赞 | INSERT IGNORE→更新计数 | — | business log | 重算 like_count |
| OCR | 上传→Python→解析→入库 | 失败→降级 Tesseract | slow log | 手动导入 |
| 备份 | mysqldump + AES 加密 | — | — | openssl 解密 + mysql restore |
