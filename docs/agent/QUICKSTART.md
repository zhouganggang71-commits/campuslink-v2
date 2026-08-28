# CampusLink 快速开始（新 AI 必读）

> **开工前先读**：`/Users/zhenggangzhou/Desktop/memory_backup/记忆库-核心.md`（果果的全局记忆：身份/团队/服务器/密钥/规则）+ `/Users/zhenggangzhou/Desktop/memory_backup/记忆库-CampusLink项目.md`（本项目细节）

## 核心原则

1. **长期主义**，不写一次性代码、不留技术债
2. **企业级 SOP 闭环**：正常/异常/追溯/恢复四条路径
3. **全链路埋点**：每个操作有日志、每个错误有堆栈、每个请求有 trace
4. **模块隔离**：后端独立注册互不影响；改一处不炸其他地方
5. **治本不治标**：代码能跑≠代码对，找根因彻底解决

## 技术栈

| 层 | 选型 |
|----|------|
| 前端 | React 19 + TypeScript 6 + Vite 8 + TailwindCSS 4 |
| 后端 | Express 5 + esbuild 单文件打包 |
| 数据库 | MySQL 8（mysql2 驱动） |
| 认证 | JWT（1h access + 30d refresh）+ bcrypt 密码哈希 |
| 入参校验 | Zod 4 strict mode |
| OCR | RapidOCR（Python）+ Tesseract.js 降级 |
| AI 识图 | MiMo v2.5 Vision（学生证识别） |

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入数据库密码、JWT 密钥等

# 3. 启动开发服务器（前端 + 后端代理）
npm run dev
# 前端 http://localhost:3000/campus/
# dev 模式前端通过 Vite proxy 调远程 API

# 4. 构建生产版本
npm run build
# 输出：dist/（前端静态文件）+ dist/server.cjs（服务端）

# 5. 启动服务
node dist/server.cjs
# 或 PM2：pm2 start ecosystem.config.js
```

## 一键部署

```bash
bash deploy.sh
```

步骤：构建 → scp 上传 → npm install → 数据库备份 → pm2 restart → 验证

> N100 通过 Tailscale SSH 连接（`100.117.221.27`），如需认证先访问 `login.tailscale.com`

deploy.sh 失败时可用 tar 手工部署：
```bash
tar czf /tmp/campuslink-dist.tar.gz dist/
scp /tmp/campuslink-dist.tar.gz ubuntu@100.117.221.27:/home/ubuntu/app/campuslink/
ssh ubuntu@100.117.221.27 "cd /home/ubuntu/app/campuslink && rm -rf dist && tar xzf campuslink-dist.tar.gz && pm2 restart campuslink"
```

## 项目结构

```
├── server.ts               # 后端入口（中间件 + 路由注册 + 迁移）
├── src/
│   ├── main.tsx             # 前端入口
│   ├── App.tsx              # 路由分发（无 React Router，状态驱动）
│   ├── types.ts             # 共享类型定义
│   ├── hooks/               # 数据层
│   │   ├── useAppData.ts    # 全局状态 + localStorage 持久化
│   │   ├── useAppActions.ts # 业务操作（乐观更新）
│   │   └── useOptimistic.ts # 操作回滚工具（并发安全）
│   ├── components/
│   │   ├── ui/              # 复用组件（Modal、Button、Icon、Toast 等）
│   │   ├── layout/          # 布局（Header、BottomNav）
│   │   ├── page/            # 页面（HomeTab、ScheduleTab、PublishTab 等）
│   │   └── modal/           # 弹窗（AuthModal、AddCourseModal 等）
│   ├── utils/               # 工具
│   │   ├── api.ts           # HTTP 客户端（自动 JWT 刷新）
│   │   ├── logger.ts        # 服务端日志（7 类文件）
│   │   ├── i18n.ts          # 中英双语
│   │   └── theme.tsx        # 暗色模式
│   └── server/              # 后端
│       ├── routes/          # 7 个独立路由模块
│       ├── middleware/      # auth + limiter
│       ├── db.ts            # MySQL 连接池 + 查询追踪
│       ├── jwt.ts           # JWT 签名/验证
│       ├── crypto.ts        # AES-256-GCM 加密
│       ├── errors.ts        # 结构化错误码
│       ├── response.ts      # 统一响应格式
│       └── validators.ts    # Zod schema
├── migrations/              # 数据库迁移（幂等、可回滚）
├── ecosystem.config.js      # PM2 配置
└── nginx.conf               # Nginx 反代模板
```

## 更多文档

| 文档 | 说明 |
|------|------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | 架构规则、安全铁律、日志&迁移、前端架构 |
| [API.md](API.md) | 完整 API 路由表 |
| [DATABASE.md](DATABASE.md) | 数据库 18 张表 + 加密说明 |
| [CHANGELOG.md](CHANGELOG.md) | 完整迭代日志 |
