> **统一入口**：先完整读取本目录 `AGENTS.md`。它定义当前路径、规则优先级和验证要求；下方内容包含历史记录，冲突时以 `AGENTS.md` 和实际代码为准。

# CampusLink — 四川财经职业学院校园信息平台

一站式校园生活服务平台：课表管理、二手交易、活动报名、失物招领、拼车出行。

**生产环境**：`https://jhcaishui.cn/campus/`
**管理后台**：`https://jhcaishui.cn/campus/admin`

---

## 文档索引

| 文档 | 说明 | 适合谁读 |
|------|------|----------|
| [QUICKSTART](docs/agent/QUICKSTART.md) | 核心原则 + 技术栈 + 快速开始 + 部署 | **新 AI 必读** |
| [ARCHITECTURE](docs/agent/ARCHITECTURE.md) | 架构规则 + 安全铁律 + 前端/后端架构 | 需要了解设计约束时 |
| [API](docs/agent/API.md) | 完整 API 路由表（含管理后台） | 查接口时 |
| [DATABASE](docs/agent/DATABASE.md) | 21 张表 + 加密说明 | 查数据表时 |
| [CHANGELOG](docs/agent/CHANGELOG.md) | 完整迭代日志（R1→最新） | 了解项目演进和根因分析时 |
| [RUNBOOK](docs/runbook.md) | 运维手册（故障排查/回滚/恢复） | 服务出问题时 |
| [ADR 001](docs/adr/001-jwt-auth.md) | JWT 双 Token 认证决策 | 了解 auth 设计 |
| [ADR 002](docs/adr/002-warm-browser.md) | 预热浏览器 vs 每次 launch | 了解扫码登录设计 |

## 快速参考

```bash
npm run dev            # 开发
npm run build          # 构建
npx vitest run         # 测试
bash deploy.sh         # 一键部署到生产
npx tsc --noEmit       # TypeScript 类型检查
```

> **5 条铁律**：长期主义 / SOP 闭环 / 全链路埋点 / 模块隔离 / 治本不治标

---

## 迭代 R10（2026-07-08）：企业级加固 + Sentry 接入

### 安全修复
- refresh_token 数据库存 SHA-256 哈希，不再明文
- CSP `unsafe-inline` → nonce 机制（每次请求动态 nonce）
- decrypt() 解密失败返回 null 而非原文
- 扫码 Chromium 并发满时 FIFO 等待 30s，不立即 503
- 文件上传每用户每日 20 张 / 100MB 配额
- API 文档和健康检查详情生产环境关闭

### 部署 & 配置
- Zod 启动时校验全部环境变量（fail-fast）
- CI 三道门禁：tsc + lint + test 硬性失败
- husky pre-commit 启用 lint-staged
- nginx HSTS 头（归档参考）
- 10 个迁移补齐 down.sql

### 可观测性
- Sentry 前后端接入（`@sentry/node` + `@sentry/react`）
- DSN 在 `.env` 中配置

### 基础设施
- 连接池 `queueLimit: 0` → `100`
- `withTransaction()` 事务封装
- `useAuth` / `useListings` 域 hooks 拆分模式
- Modal/Icon/BottomNav 基础 ARIA 可访问性

### 测试
- 从 8 文件 66 用例 → 10 文件 110 用例
- 新增 validators.test.ts (24) + middleware.test.ts (10)

### 成绩展示按学期分组 + 轻量刷新修复教务过期检测（2026-07-08）
- 前端 GradesExamsModal 成绩/考试列表改为按学期分组，每组带学期标题（如"2026-2027学年 春季学期"），使用`formatSchoolTerm`+`termChronoKey`排序（最新的在最上）
- POST /grades/refresh 增加 `sessionInvalid` 检测——之前 `sessionInvalid` 声明为 false 后从未被赋值，导致教务 Cookie 过期后轻量刷新永远不报错，前端轮询一直显示过时数据；现在 `fetchGradesHttp` 返回空时发一个快速探测请求确认会话是否失效，失效则清 cookie + 返回错误提示
- tsc + vitest 110/110 过

### 去掉自动轮询 + 去掉一键刷新按钮，改为"重新扫码"提示（2026-07-08）
- 删除每60s自动轮询（`doLightRefresh` + `useEffect` 定时器）——只爬一次就够了
- 删除「一键刷新」按钮（`academicApi.refresh()`），只保留「重新扫码」按钮
- 删除 `lastRefreshTime`/`termLabel` 等不再需要的状态和展示行
- 弹窗副标题改为"扫码登录时同步，重新扫码可获取最新数据"
- 空数据提示改为"扫码登录时同步，重新扫码可获取最新数据"
- tsc + vitest 110/110 过；前端 chunk 从 10.91kB 缩到 8.88kB
