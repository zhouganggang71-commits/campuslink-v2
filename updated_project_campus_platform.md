---
name: 校园信息聚合平台项目
description: CampusLink v2.0 — React+Express+MySQL，N100部署，12路由模块，AI识图，私信+扫码登录，全链路日志，企业级安全
type: project
---

# CampusLink 校园信息平台 v2.0

**定位：** 四川财经职业学院官方平台，实名认证+院系分类+活动报名+课表AI导入+校园圈+私信
**代码：** `/Users/zhenggangzhou/Desktop/campuslink-v2/`（旧 campuslink-ui 已弃用）
**仓库：** `git@github.com:zhouganggang71-commits/campuslink-ui.git`
**公网：** `https://jhcaishui.cn:8443/campus/`
**管理后台：** `https://jhcaishui.cn:8443/campus/admin`

## N100 信息

- **内网 IP：** `192.168.1.10`
- **Tailscale IP：** `100.117.221.27`
- **SSH：** `ssh ubuntu@192.168.1.10`（内网）/ `ssh ubuntu@100.117.221.27`（远程）
- **SSH 密钥：** `~/.ssh/id_ed25519`
- **sudo 密码：** `123`
- **项目路径：** `/home/ubuntu/app/campuslink/`
- **PM2：** `campuslink`（--cwd /home/ubuntu/app/campuslink）
- **端口：** 3002（内网）

## 密钥和密码

| 用途 | 值 |
|------|-----|
| JWT 签名 | `9e36985bbcf2634a81915278ef6f68b882b4039df087bd1b71260a541eb6763d` |
| 管理员密钥（ADMIN_KEY） | `c87df2090573add1fbc1382eb9d95b3f` |
| MySQL 密码 | `yWw6qIvI6QCsA7IRRNnF` |
| 数据加密密钥 | `3fb2dd3e525a9258de7a28c9ca092da5` |
| 管理员账号（你） | 学号 `202330140113`，密码自己设的 |
| MiMo API Key | `sk-cbc4807hwmbmeeuwxjefdwdcdhe44wtio6vjmad3bssu8p0b` |

## 数据库

- MySQL：`campuslink` / `yWw6qIvI6QCsA7IRRNnF`，`127.0.0.1:3306`
- Navicat 连接：常规主机 `127.0.0.1`，端口 `3307`（隧道），用户名 `campuslink`
- 隧道脚本：`bash /Users/zhenggangzhou/Desktop/campuslink-v2/scripts/tunnel.sh`
- 18 张表：users, refresh_tokens, posts, favorites, registrations, courses, categories, ads, notices, feedbacks, circles, circle_posts, circle_likes, circle_comments, circle_favorites, conversations, chat_messages, _migrations（迁移到 030：courses 表加 school_year/school_term/source/active_weeks 等 12 列支持多学期 + grades/exams 表）
- **注意**：正方 xnm=学年起始年（如 xnm=2025=2025-2026学年），formatSchoolTerm 用 `${y}-${y+1}学年`，学期编码 3=秋 12=春
- 加密字段：posts.contact_info, registrations.phone, registrations.registrant_name, registrations.student_id

## 部署

```bash
bash deploy.sh  # 自动检测 Tailscale/内网，构建→上传→备份加密→装依赖→重启→验证
```

## 当前架构（2026-07-03）

- 前端：React 19 + TS strict + Vite 8 + TailwindCSS 4，三层拆分（useAppData/useAppActions/App.tsx），5 Tab + CircleTab/ListingDetail/SearchPage
- 后端：Express 5 + MySQL + JWT + bcrypt + Zod，12 路由模块 safeRegister（新增 messages 私信、auth-wechat 教务扫码登录）
- 私信：conversations/chat_messages，发图片/表情/在线状态/未读数，匿名帖不吐 user_id
- 扫码登录：Playwright 代理教务 jw.scpcfe.cn CAS，抓学号/姓名/院系 → 自动注册+多学期全量同步课表（fetchAllSchedules 遍历近3年+当前学年 × 秋/春 共8个组合）
- 安全：全接口限流、服务端敏感词、AES-256 加密备份、安全头、密码哈希、密钥 env
- 日志：7 类分文件（access/error/business/slow/security/health/client），trace_id 全链路
- 审核：新用户 pending → 管理后台审批 → verified，帖子同理
- 管理后台：独立静态页 admin.html，自动登录（sessionStorage），7 标签页全表查询
- **⚠️ 关键坑：正方教务系统 xnm = 学年结束年**（如 xnm=2026 → 2025-2026学年），formatSchoolTerm/getCurrentSchoolTerm/getSemestersToTry 均已按此修正
- 学期编码：3=秋季学期，12=春季学期（course.schoolTerm）
- 课表来源：manual/ocr/scan_sync 三种，扫码同步只清空自己那部分
- 远程：Tailscale VPN，Mac + N100 互通，tunnel.sh 自动选路
