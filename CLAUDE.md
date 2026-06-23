# CampusLink — 四川财经职业学院校园信息平台

## 核心原则
1. 长期主义，不写一次性代码、不留技术债
2. 企业级 SOP 闭环：正常/异常/追溯/恢复四条路径
3. 全链路埋点，每个操作有日志、每个错误有堆栈、每个请求有 trace
4. 模块隔离，后端独立注册互不影响；改一处不炸其他地方
5. 治本不治标，代码能跑≠代码对，找根因彻底解决

## 技术栈
React 19 + TypeScript + Vite 8 + TailwindCSS 4 / Express 5 + esbuild CJS / MySQL 8 + mysql2 / JWT + bcrypt / Zod 4 strict

## 部署
- 开发：`npm run dev` / 生产：N100 Ubuntu PM2（`campuslink`），`/home/ubuntu/app/campuslink/`
- 公网：`https://jhcaishui.cn:8443/campus/` / 后台：`https://jhcaishui.cn:8443/campus/admin`
- 构建：`npm run build`（tsc + vite + esbuild）/ 测试：`npx vitest run`
- **一键部署**：`bash deploy.sh`
  - 步骤：构建 → scp 上传 → npm install → 数据库备份 → pm2 restart → 验证
  - 注意：N100 通过 Tailscale SSH 连接（100.117.221.27），如需认证先访问 login.tailscale.com
  - deploy.sh 失败时可用 tar 手工部署：
    ```
    tar czf /tmp/campuslink-dist.tar.gz dist/
    scp /tmp/campuslink-dist.tar.gz ubuntu@100.117.221.27:/home/ubuntu/app/campuslink/
    ssh ubuntu@100.117.221.27 "cd /home/ubuntu/app/campuslink && rm -rf dist && tar xzf campuslink-dist.tar.gz && pm2 restart campuslink"
    ```

## 架构规则
1. 路由模块化：server.ts 仅入口+中间件+迁移，路由独立 safeRegister
2. 统一响应：`ok(res,data)` / `fail(res,status,msg)`，必须带 trace_id
3. 入参必 Zod 校验，别手写 if(!title)
4. 服务端验证：前端检查不算数，服务端再验一次
5. 只改需要的，不加没用过的依赖和抽象

## 安全铁律
- 密钥全部 .env，不上传 GitHub / 密码 bcrypt 哈希
- auth_status: pending→verified→org_verified，管理员审核
- 管理员：学号 202330140113 / 后台：`https://jhcaishui.cn:8443/campus/admin`
- 写接口有限流，敏感词服务端拦截
- 数据库备份 AES-256 加密

## 日志 & 迁移
日志：`logs/{access,error,business,slow,security,health,client}-日期.log`
迁移：`migrations/` SQL 文件按序幂等执行，`_migrations` 表追踪

## 数据库（16 张表）
users / refresh_tokens / posts / favorites / registrations / courses / categories / ads / notices / feedbacks / circles / circle_posts / circle_likes / circle_comments / circle_favorites / _migrations

加密：AES-256-CBC（posts.contact_info、registrations.{registrant_name,student_id,phone}），密钥 ENCRYPTION_KEY，应用层 crypto.ts 加解密

## 前端架构
```
main.tsx → ErrorBoundary → RegistrationProvider → App.tsx（路由分发）
5 Tab：HomeTab / ScheduleTab / PublishTab / MessagesTab / ProfileTab
+ CircleTab / ListingDetail / SearchPage
```
Hooks 模式（无 Redux）：useAppData / useAppActions / useCircles / useOptimistic / useScheduleOCR
组件复用：Modal / Button / Icon / Toast（禁止手写遮罩/button className）
颜色用 Tailwind 语义类名，禁止硬编码 #xxx

## API 路由（/api/v1/）

| 模块 | 端点 | 方法 | 认证 | 限流 |
|------|------|------|------|------|
| auth | /auth/dev-login | POST | — | 5 |
| auth | /auth/refresh | POST | — | 10 |
| auth | /auth/logout | POST | auth | 10 |
| auth | /auth/avatar | POST | auth | 5 |
| auth | /auth/profile | PUT | auth | 10 |
| auth | /auth/password | PUT | auth | 3 |
| posts | /posts | GET/POST | 写需auth | 3 |
| posts | /posts/:id | GET/DELETE | 删需auth | 5 |
| posts | /posts/:id/sold | PUT | auth | 5 |
| posts | /favorites/:postId | POST | auth | 10 |
| posts | /favorites | GET | auth | — |
| posts | /categories | GET | — | — |
| courses | /courses | GET/POST | auth | 50 |
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
| ads | /ads /ads/:id/click | GET/POST | — | — |
| feedback | /feedback | POST | — | 5 |
| health | /health | GET | — | — |
| admin | /admin/* | 全部 | adminAuth | 各不同 |
