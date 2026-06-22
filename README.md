# CampusLink — 四川财经职业学院校园信息平台

一站式校园生活服务平台：课表管理、二手交易、活动报名、失物招领、拼车出行。

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

## API 文档

启动服务后访问 `/api-docs` 查看交互式 API 文档（Scalar UI）。

所有 API 返回统一格式：`{ code, message, data, trace_id }`

## 部署

```bash
# 一键部署
bash deploy.sh

# 数据库迁移（自动执行，也可手动）
npm run migrate    # 执行未应用的迁移
npm run rollback   # 回滚最后一批次

# PM2 管理
pm2 start ecosystem.config.js
pm2 restart campuslink
pm2 logs campuslink
```

## 架构原则

参见 [CLAUDE.md](./CLAUDE.md) — 包含完整的架构规则、安全铁律、开发路线图。

## 开发

```bash
npm run check    # tsc + eslint + prettier
npm run test     # vitest 单元测试
npm run build    # 生产构建
```

## 许可证

四川财经职业学院
