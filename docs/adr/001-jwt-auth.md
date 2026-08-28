# ADR 001: JWT 双 Token 认证体系

**状态**: 已采纳  
**日期**: 2026-06  
**决策者**: 周鉦罡

## 背景

校园平台需要同时支持两种认证方式：学号+密码登录，以及企业微信扫码登录。需要统一的 token 体系。

## 决策

采用 **JWT access token + refresh token 双 token 体系**：

- **Access Token**: 1 小时过期，JWT 签名，含 `{uid, admin, amr, type:'access'}`，用于 API 鉴权
- **Refresh Token**: 30 天过期，JWT 签名，含 `{uid, type:'refresh'}`，**数据库存 SHA-256 哈希**，用于无感续期
- **Rotation**: 每次 refresh 后旧 token 立即作废（DELETE + INSERT 原子操作）
- **amr 字段**: 记录认证方式（password / scan），扫码登录的会话可免旧密码重设密码

## 替代方案

| 方案 | 优点 | 缺点 |
|------|------|------|
| 纯 access token（无 refresh） | 实现简单 | 需要频繁重新登录 |
| Session + Redis | 服务端可控 | 需要额外基础设施 |
| OAuth 2.0 完整实现 | 标准化 | 过度工程，校园场景不需要 |

## 后果

- Token 泄露风险由 30 天缩短为 1 小时（access token），refresh token 哈希存储防止数据库泄露后伪造
- 需要前后端配合实现 token 过期自动刷新逻辑
