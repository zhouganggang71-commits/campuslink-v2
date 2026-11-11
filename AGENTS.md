# CampusLink 智能体入口

开工前依次读取：

1. 用户级规则 `~/.codex/AGENTS.md`；桌面总入口存在时也先读取。
2. 本文件与 `docs/项目记忆.md`。
3. `docs/agent/QUICKSTART.md` 与 `docs/agent/ARCHITECTURE.md`。

当前仓库路径是 `/Users/zhenggangzhou/Desktop/04_CampusLink/campuslink-v2/`。旧文档中的 `/Users/zhenggangzhou/campuslink-ui/` 已失效，任何部署、备份或恢复命令执行前都要换成当前路径并核对目标。

## 当前规则

- 坚持长期主义、SOP 闭环、全链路日志、模块隔离和根因修复。
- 前端 React + TypeScript，后端 Express，数据库 MySQL；接口与表结构以实际代码、迁移和在线验证为准。
- 入参使用 Zod，写接口做鉴权和限流，敏感字段加密，密钥只放 `.env`。
- 改动后至少运行 `npx tsc --noEmit`、`npx vitest run`；涉及构建时再运行 `npm run build`。
- 数据库迁移必须幂等、可回滚；部署或改表前先备份并验证备份。
- 生产入口为 `https://jhcaishui.cn/campus/`。健康检查路径若文档不一致，先从当前路由代码确认再执行。

`CLAUDE.md` 和 `docs/agent/CHANGELOG.md` 含历史迭代记录，只用于背景；当前执行规则以本文件和实际代码为准。
