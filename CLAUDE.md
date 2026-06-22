# CampusLink — 四川财经职业学院校园信息平台

## 核心原则

1. **长期主义**：所有代码为长期发展服务。不写一次性代码、不留技术债、不抄近路。注重健壮性和稳定性，宁可多写十行稳的，不写一行巧的。
2. **企业级设计**：每个功能要有完整的业务闭环（前端→后端→数据库→日志→恢复）。SOP 闭环：正常路径能走通、异常路径有兜底、出问题能追溯、数据能恢复。
3. **全链路埋点**：每个操作必有日志、每个错误必有堆栈、每个请求必有 trace。日志是后续测试、审计、排障的唯一依据——没日志等于没做。
4. **模块隔离**：后端每个模块独立注册、独立失败、互不传染。改课程模块不能崩帖子，加报名功能不能影响登录。模块间通过明确的接口交互，不共享可变状态，不搞隐式耦合。本质就是代码健壮——改一处不会其他地方炸。
5. **治本不治标**：遇到问题找根因，不凑合、不糊弄、不图省事。代码能跑不等于代码对。一个 bug 出现了，先问"为什么会产生"，再问"怎么彻底解决"，最后才写代码。随手改了将就用——这是技术债的起点，后面要花十倍时间还。

## 技术栈

| 层 | 选型 |
|----|------|
| 前端 | React 19 + TypeScript 6.0 + Vite 8 + TailwindCSS 4 |
| 后端 | Express 5 + esbuild 单文件 CJS 打包 |
| 数据库 | MySQL 8（mysql2 驱动，127.0.0.1:3306） |
| 认证 | JWT（jsonwebtoken 标准库，1h access + 30d refresh）+ bcrypt |
| 入参 | Zod 4 strict mode |
| OCR | RapidOCR（本地 Python 脚本，ONNX Runtime，Tesseract.js 7 降级） |
| AI | MiMo v2.5 Vision（仅学生证识图，接入 CircuitBreaker 熔断器） |
| 主题 | TailwindCSS 4 暗色模式（ThemeContext + localStorage 持久化） |
| 国际化 | i18n Context（zh/en 双语文件，t() 插值，逐步迁移组件字符串） |

## 部署

- 开发：Mac `npm run dev`（前端 proxy 到公网 API）
- 生产：N100 Ubuntu `PM2`，`/home/ubuntu/app/campuslink/`
- 公网：`https://jhcaishui.cn:8443/campus/`（阿里云 nginx→FRP→N100）
- 部署：`bash deploy.sh`（构建→上传→备份→装依赖→重启→验证）
- CI：GitHub Actions（push 自动 build + tsc）

## 架构规则

1. **路由模块化（强制）**：server.ts 只有入口+中间件+迁移。每个路由模块独立注册（`safeRegister`），自己的错误自己吞、自己的状态自己管。一个模块初始化失败只记日志不拖垮整站。新增功能必须走独立模块，禁止往已有模块里堆逻辑——那是耦合的起点。
2. **无服务层**：路由直接写 SQL。体量小，不搞三层架构。
3. **统一响应**：所有 API 返回 `{code, message, data, trace_id}`。用 `ok(res,data)` / `fail(res,status,msg)`，别手写 `res.json`。错误必须带 `trace_id` 方便定位。
4. **入参必校验**：所有 POST/PUT 用 Zod schema + `validate(res, schema, body)`，别手写 `if(!title)`。
5. **服务端验证**：前端做了的检查（敏感词、权限），服务端也必须做。不信前端。
6. **SOP 闭环**：每个功能要覆盖正常流程、异常降级、日志审计、数据恢复四条路径。改一个功能先想清楚这四条路径怎么走。
7. **只改需要的**：不加没用过的依赖，不加"将来可能用到"的抽象。代码要能跑、能查、能恢复，不要花活。

## 安全铁律

- 密钥全部 `.env`，不上传 GitHub
- 密码 bcrypt 哈希，不存明文
- 新用户注册 → `auth_status = 'pending'` → 管理员审核通过才能发帖
- 管理员是唯一用户（学号 202330140113），普通用户看不到管理后台
- 管理后台入口：`?admin` 参数，前端打开后自动 API 验身份
- 所有写接口有限流，敏感词服务端拦截
- 数据库备份加密（AES-256），手机号/联系方式入库加密

## 数据流 & 全链路埋点

- 前端请求 → `api.ts`（自动带 JWT + trace_id + session_id）→ Express 路由
- 每次请求必经：Zod 校验 → 业务日志（关键操作）→ SQL（慢查询自动记录）→ 统一响应（带 trace_id）
- 日志分 7 类：`logs/{access,error,business,slow,security,health,client}-日期.log`
- 新增功能必须同步打点：access 层的请求日志、business 层的业务事件、error 层的异常。没日志等于白做。
- 数据库迁移自动执行：`migrations/` 目录 SQL 文件按序执行，幂等
- 前端崩溃自动上报 `POST /api/log/client-error` → `client-*.log`

## 代码习惯

- 每次改完：`npm run check`（tsc + eslint + prettier），全部过才算过
- 单独检查：`npm run lint`（类型+代码质量）、`npm run format`（自动格式化）
- 构建验证：`npm run build`（vite + esbuild），两个都过才算过
- 日志先行：新功能先想打什么 log、异常怎么兜底、数据怎么恢复，再写逻辑
- 为长期负责：写下去的代码可能用三年，不给后人（和自己）埋坑
- 0 容忍新 TypeScript 错误，strict 模式不松
- 不要 emoji、不要过度注释、不要提前抽象

## Navicat 管理数据库

- 审核操作 → 前端管理面板（`?admin`）
- 数据查询/统计/改表 → Navicat 直连 MySQL
- Navicat 连接配置：

| 标签页 | 字段 | 值 |
|--------|------|-----|
| 常规 | 主机 | `192.168.1.10` |
| 常规 | 端口 | `3306` |
| 常规 | 用户名 | `campuslink` |
| 常规 | 密码 | （从 .env 读取 CAMPUSLINK_DB_PW） |
| SSH | 使用 SSH | ✅ |
| SSH | 主机 | `192.168.1.10` |
| SSH | 端口 | `22` |
| SSH | 用户 | `ubuntu` |
| SSH | 验证 | 私钥 `~/.ssh/id_ed25519` |

## 数据库表

| 表 | 用途 | 敏感字段 |
|----|------|----------|
| `users` | 用户 | password_hash |
| `posts` | 帖子 | contact_info（加密） |
| `courses` | 课表 | - |
| `favorites` | 收藏 | - |
| `registrations` | 报名 | phone, registrant_name, student_id（加密） |
| `refresh_tokens` | 登录态 | token |
| `ads` | 广告 | - |
| `_migrations` | 迁移记录 | - |

## 已确认不做的

- 不搞做账报税（外部 SaaS 负责）
- 不搞分布式/集群（单台 N100 够用）
- 不接 Claude/DeepSeek（那是 CRM 项目的）
- 不用 ORM（raw SQL 够用了）
- 不装 Swagger（对接小程序时再说）
- 不做微信登录（学号+密码就够了）
- 服务层拆分暂缓（体量不匹配）

## 前端架构

### 入口与路由

```
main.tsx
  ├── StrictMode
  ├── ErrorBoundary        — 崩溃捕获 + 自动上报 /api/log/client-error
  └── RegistrationProvider  — 活动报名 Context
       └── App.tsx          — 纯路由分发（142行），无业务逻辑
            ├── Header / BottomNav
            └── 5 个 Tab：HomeTab / ScheduleTab / PublishTab / MessagesTab / ProfileTab
```

### 数据层（Hooks 模式，无 Redux/Zustand）

| 文件 | 行数 | 职责 |
|------|------|------|
| `useAppData.ts` | 248 | 所有 state + localStorage 持久化 + 服务端数据拉取 |
| `useAppActions.ts` | 330 | 所有业务操作函数（发帖/收藏/导入课表/认证） |
| `useScheduleData.ts` | 53 | 课表数据独立 hook |
| `useOptimistic.ts` | 90 | 乐观更新工具（操作回滚替代快照回滚，并发安全） |
| `useScheduleOCR.ts` | 152 | OCR 课表导入 hook（文件上传 + 轮询 + 结果选择） |

模式：乐观更新 → API 调用 → .then 成功提示 / .catch 回滚 + 错误提示

### 目录结构

```
src/
  components/
    ui/          — 复用组件（Modal, Button, Input, Select, Icon, Toast, Skeleton, ErrorBoundary）
    layout/      — 布局组件（Header, BottomNav）
    page/        — 页面组件（HomeTab, ScheduleTab, PublishTab, MessagesTab, ProfileTab, SearchPage, ListingDetail, RegisterPanel）
    modal/       — 弹窗组件（AuthModal, AddCourseModal, ShareScheduleModal, ContactModal）
  hooks/         — 数据层（useAppData, useAppActions, useScheduleData, useOptimistic, useScheduleOCR）
  utils/         — 工具（api, logger, sensitiveFilter, regContext, theme, i18nContext, i18n）
  server/        — 后端（Express 路由 + 中间件 + 数据库）
```

| 组件 | 行数 | 类型 | 说明 |
|------|------|------|------|
| `HomeTab` | 270 | 页面 | 帖子流 + 分类筛选 + 通知栏 |
| `ScheduleTab` | 290 | 页面 | 课表（周/日视图 + OCR 导入 hook + 详情弹窗） |
| `PublishTab` | 425 | 页面 | 发布帖子（表单 + 图片上传 + 敏感词检测） |
| `ProfileTab` | 286 | 页面 | 个人主页 + 我的帖子/收藏/认证 |
| `MessagesTab` | — | 页面 | 系统消息列表 |
| `ListingDetail` | 172 | 页面 | 帖子详情（轮播图 + 联系 + 举报） |
| `SearchPage` | 94 | 覆盖层 | 全屏搜索 |
| `AuthModal` | 191 | 弹窗 | 登录/注册 + 学生证 OCR |
| `AddCourseModal` | — | 弹窗 | 手动添加课程表单 |
| `ShareScheduleModal` | — | 弹窗 | 课表分享卡 |
| `Modal` | — | 复用 | **通用弹窗**（遮罩/标题/footer） |
| `Button` | — | 复用 | **通用按钮**（4 variant × 2 size） |
| `Icon` | — | 复用 | 图标统一接口（映射 lucide-react） |
| `Toast` | — | 复用 | 轻提示 |
| `Skeleton` | — | 复用 | 加载骨架屏 |
| `ErrorBoundary` | — | 复用 | 崩溃兜底 |
| `BottomNav` | — | 布局 | 底部导航栏 |
| `Header` | — | 布局 | 顶部标题栏 |

### 设计系统

颜色体系定义在 `src/index.css` 的 `@theme` 块中。禁止在组件中使用硬编码颜色值（`#xxx`），必须使用 Tailwind 语义类名。

**字号层级**：
| 类名 | 大小 | 用途 |
|------|------|------|
| `text-[10px]` | 10px | 超小标签 |
| `text-xs` | 12px | 正文辅助 |
| `text-sm` | 14px | 正文 |
| `text-base` | 16px | 标题 |
| `text-lg` | 18px+ | 大标题 |

**间距体系**：`p-1`(4px) `p-2`(8px) `p-3`(12px) `p-4`(16px) `p-6`(24px)

**圆角体系**：`rounded-lg`(8px) `rounded-xl`(12px) `rounded-2xl`(16px)

### 复用组件规范

**Modal**：弹窗出现超过 2 次 → 必须用 `<Modal isOpen onClose title subtitle footer>` 封装。禁止手写遮罩层。

**Button**：按钮使用 `<Button variant="primary|secondary|danger|ghost" size="sm|md" block>`，禁止手写 button className。

## API 路由速查（全部已升级为 /api/v1/ 前缀，旧 /api/ 路径自动转发）

| 模块 | 端点 | 方法 | 认证 | 限流 |
|------|------|------|------|------|
| auth | `/api/v1/auth/dev-login` | POST | — | 5 |
| auth | `/api/v1/auth/refresh` | POST | — | 10 |
| auth | `/api/v1/auth/logout` | POST | auth | 10 |
| auth | `/api/v1/auth/password` | PUT | auth | 3 |
| posts | `/api/v1/posts` | GET | — | — |
| posts | `/api/v1/posts` | POST | auth | 3 |
| posts | `/api/v1/posts/:id` | GET | — | — |
| posts | `/api/v1/posts/:id` | DELETE | auth | 5 |
| posts | `/api/v1/posts/:id/sold` | PUT | auth | 5 |
| posts | `/api/v1/favorites/:postId` | POST | auth | 10 |
| posts | `/api/v1/favorites` | GET | auth | — |
| courses | `/api/v1/courses` | GET | auth | — |
| courses | `/api/v1/courses` | POST | auth | 50 |
| courses | `/api/v1/courses/batch` | PUT | auth | 50 |
| courses | `/api/v1/courses/:id` | DELETE | auth | 10 |
| schedule | `/api/v1/parse-schedule` | POST | auth | 5 |
| schedule | `/api/v1/ocr-schedule` | POST | auth | 10 |
| schedule | `/api/v1/ocr-schedule/:taskId` | GET | auth | — |
| schedule | `/api/v1/ocr-student-id` | POST | auth | 2 |
| upload | `/api/v1/upload` | POST | auth | 10 |
| registrations | `/api/v1/registrations` | GET/POST | auth | 3 |
| admin | `/api/v1/admin/*` | 全部 | adminAuth | 各不同 |
| ads | `/api/v1/ads` | GET | — | — |
| ads | `/api/v1/ads/:id/click` | POST | — | — |
| health | `/api/v1/health` | GET | — | — |
| 文档 | `/api/v1/openapi.json` | GET | — | — |
| 文档 UI | `/api-docs` | GET | — | — |

## 开发路线图

### 已完成
- [x] 用户认证（学号+密码+JWT+学生证 OCR）
- [x] 帖子 CRUD + 收藏 + 敏感词过滤
- [x] 课表 OCR 导入（RapidOCR，异步处理）
- [x] 管理后台（用户审核/帖子审核/数据查表）
- [x] 广告系统（DB 表 + 管理 API + 公开接口）
- [x] 全链路日志 + PM2 内存保护 + OCR 并发控制
- [x] 设计 Token 文档化 + Modal/Button 复用组件
- [x] 免责声明与用户协议
- [x] 安全加固（硬编码密钥消除、jsonwebtoken 标准库、CSP、CORS、幂等保障）
- [x] 依赖升级（TypeScript 6.0、Vite 8、Express 5、esbuild 0.28）
- [x] 企业级能力（结构化错误码、熔断器、优雅关闭、事务覆盖、外键约束、API 版本 v1）
- [x] API 文档（OpenAPI 3.1 + Scalar UI）
- [x] 集成测试（vitest + supertest，28 测试）
- [x] 乐观更新并发安全（useOptimistic hook，操作回滚替代快照回滚）
- [x] 所有 setter 类型化（DataLayer 消除 any）
- [x] ScheduleTab 拆分（644→290 行，OCR 逻辑独立为 useScheduleOCR hook）
- [x] PM2 + Nginx 配置版本化
- [x] 迁移可回滚（down.sql + batch 追踪 + rollback CLI）

### 第二阶段：体验提升
- [ ] 其余弹窗替换为 Modal 组件（ShareScheduleModal、AuthModal、课程详情）
- [ ] 全站逐步替换为 Button 组件
- [ ] PWA 支持（添加到桌面、离线缓存）
- [ ] 消息推送（审核结果、系统通知）
- [ ] 课表分享图片导出（canvas 截图）

### 第三阶段：增长与商业化
- [ ] 前端广告位接入（首页 Banner）
- [ ] 微信小程序端（课表查看 + 帖子浏览）
- [ ] 用户反馈/工单系统
- [ ] 数据看板图表（活跃用户、发帖趋势）

### 长期
- [ ] 微服务拆分（用户/内容/课表）
- [ ] AI 课表校验（自动对比教务系统）
- [ ] 多校扩展（适配其他学校教务系统格式）
