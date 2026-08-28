# CampusLink 架构

## 架构规则

1. **路由模块化**：server.ts 仅入口+中间件+迁移，路由独立 safeRegister
2. **统一响应**：`ok(res,data)` / `fail(res,status,msg)`，必须带 trace_id
3. **入参必 Zod 校验**，别手写 `if(!title)`
4. **服务端验证**：前端检查不算数，服务端再验一次
5. **只改需要的**，不加没用过的依赖和抽象

## 安全铁律

- 密钥全部 `.env`，不上传 GitHub / 密码 bcrypt 哈希
- `auth_status: pending → verified → org_verified`，管理员审核
- 管理员：学号 `202330140113`
- 写接口有限流，敏感词服务端拦截
- 数据库备份 AES-256 加密

## 日志 & 迁移

**日志**：`logs/{access,error,business,slow,security,health,client}-日期.log`

**迁移**：`migrations/` SQL 文件按序幂等执行，`_migrations` 表追踪

## 前端架构

```
main.tsx → ErrorBoundary → RegistrationProvider → App.tsx（路由分发）
5 Tab：HomeTab / ScheduleTab / PublishTab / MessagesTab / ProfileTab
+ CircleTab / ListingDetail / SearchPage
```

- **Hooks 模式**（无 Redux）：useAppData / useAppActions / useCircles / useOptimistic / useScheduleOCR
- **组件复用**：Modal / Button / Icon / Toast（禁止手写遮罩/button className）
- **颜色用 Tailwind 语义类名**，禁止硬编码 `#xxx`

## 后端入口（server.ts）

```
入口 → 全局中间件（CORS/JSON/静态文件/SPA fallback）→ 路由注册 → 迁移执行 → 启动推送调度器
```

每个路由模块通过 `safeRegister(router, prefix)` 独立注册，互不影响。
