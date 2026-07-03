# 记忆库精简版

## 用户 & 风格
- **果果 / Salon，自贡富顺，Asia/Shanghai，大一会计（三年制），双料老板。
- **目标**：暑假跑通 AI 财税系统 → 比赛拿奖免试专升本 → 帮企业接 AI。
- **原则**：一切为长期发展；React 组件化=标准；不重复造轮子（SaaS 能覆盖就不自建）。
- **交流**：直接、有个性、萌系猫娘风，不说套话；先动脑（读文件/查上下文）再问；对外操作（发邮件等）先确认；私密永远私密；每次对话结束把关键内容写入记忆。

## 团队 & 公司
- **璟禾财税（甲方）** 91510322MAK6T28N1U，法人赵和勤，富顺，<10 人。团队：黄亮（管理员/会计+销售+外勤）、邹鎔羽（销售+外勤）、刘秀蓉/刘文月（销售）、李灵丹（会计+外勤）、果果（老板）。18 家服务中客户，月费总额约 2.79 万。
- **云智星科技（乙方）** 91510322MAKGP4EQ7K，法人周鉦罡（身份证 510322200610240038，邮储 510322195404067322）。为璟禾提供软件技术服务（服务器/框架/维护/同步）；合同 2026.6.30~2027.6.30，首月 ¥1,500 + 后续 ¥299/月，每月 15 日前付款。
- **定时任务**：记忆维护 03:00 / 每日同步 07:30(daily_sync.py) / 巡检简报 08:00(risk.py) / 财税新闻爬虫 08:00。

## AI 架构（两套独立，禁混用）
- **CRM → OpenClaw → MiMo**：Key `sk-cbc4807hwmbmeeuwxjefdwdcdhe44wtio6vjmad3bssu8p0b`，`https://api.xiaomimimo.com/v1`，模型 `xiaomi/mimo-v2.5`（含 Vision），agent `xiaolongxia`。
- **Claude Code（我） → DeepSeek**：Key `sk-9e0c507cc8b8494ca8049eb2fd3d4ca4`，`https://api.deepseek.com`，模型 `deepseek-v4-pro`。
- Key/Endpoint/模型全不同，CRM 不走 DeepSeek，CC 不走 MiMo。

## 基础设施
- **N100**：内网 `192.168.1.10`(网线)/`192.168.1.11`(WiFi)，Tailscale `100.117.221.27`，密钥 `~/.ssh/id_ed25519`，sudo 密码 `123`。安全：ufw 仅放行必要端口、SSH 仅密钥禁 root、fail2ban、APT 自动更新、数据 AES 加密。
- **阿里云 ECS**（成都）`8.156.64.189`，`root`，密码 `Qazplm1290`。跑 WordPress(Apache:8081) + nginx 80/443 反代 + frps(7000/8080)。SSL Let's Encrypt(jhcaishui.cn)，到期 2026-08-17。
- **架构**：`jhcaishui.cn` → `/` WordPress官网，`/crm/` React CRM(FRP→N100:3000)，`/campus/` CampusLink(N100:3002/8443)。

## 项目

### 璟禾 CRM
- React+Express，N100 部署，PM2 `jinghe-pro` 跑 `dist/server.cjs`，路径 `/home/ubuntu/app/jinghe/`，公网 `https://jhcaishui.cn:8443/crm/`。
- **定位**：销售 + 外勤 + 合同管理；做账/报税走外部 SaaS 不自建（AccountingWorkbench 等为空壳占位）。
- **数据**：SQLite 关系型表（2026-07-02 清理，仅保留 18 家服务中客户），加密委托 `cryptoHelper.cjs`，加密密钥在 `.env`。
- **AI**：`/api/chat` → openclaw CLI(agent xiaolongxia) → MiMo v2.5。2026-07-02 修复 spawnSync→spawn 异步（解决阻塞事件循环导致代理超时断连），加三道防线防崩溃。`/api/chat/stream` 已不在当前版本。
- **电子合同**：外勤选模板→填变量(18个)→生成→手机双签(甲方签字+乙方盖章)→服务端 pdfkit+simhei.ttf 生成 PDF→客户转「服务中」+生成会计任务。公章用 PIL/Pillow 生成。
- **销售三栏闭环**：客户池→拨打→已拨打→有意向→意向库→推送(分配外勤)→外勤签约；无意向回公池。
- **安全**：⚠️ 重构后安全中间件（限流/安全头/注入防护）被移除，需恢复。
- **官网集成**：CF7 表单(ID 506) → `functions.php: jinghe_cf7_to_crm()` → `/api/leads` → 公海池。
- **架构模块化**：前端 store 拆成 api/salesOps/fieldOps/taskOps/clientOps + 编排器；后端路由拆到 `src/server/routes/`。`npm run build:server` 秒级部署（仅改后端时用），全量 build 需 11min(N100)。

### CampusLink v2.0（校园信息平台）
- 四川财经职业学院平台：实名认证 + 院系分类 + 活动报名 + 课表 AI 导入 + 校园圈 + 私信。
- 代码 `/Users/zhenggangzhou/Desktop/campuslink-v2/`（旧路径 campuslink-ui 已弃用），仓库 `github.com/zhouganggang71-commits/campuslink-ui`，公网 `https://jhcaishui.cn:8443/campus/`(+/admin)，PM2 `campuslink`，端口 3002。
- React 19 + TS strict + Vite 8 + Tailwind 4 / Express 5 + MySQL 8 + JWT + bcrypt + Zod，12 路由模块(auth/auth-wechat/posts/courses/schedule/upload/registrations/circles/messages/notices/feedback/admin)。
- MySQL `campuslink`/`yWw6qIvI6QCsA7IRRNnF`，18 张表(users/refresh_tokens/posts/favorites/registrations/courses/categories/ads/notices/feedbacks/circles/circle_posts/circle_likes/circle_comments/circle_favorites/conversations/chat_messages/_migrations)，迁移到 030（courses 表加 school_year/school_term/source/active_weeks 等 12 列支持多学期 + grades/exams 表），敏感字段 AES-256-CBC。Navicat 走隧道端口 3307。
- 日志 7 类分文件 + trace_id 全链路；新用户/帖子 pending→审批→verified；`bash deploy.sh` 一键部署；`index.html` 里 BUILD 时间戳控缓存（当前 20260701000013）。
- **密钥**：JWT `9e36985bbcf2634a81915278ef6f68b882b4039df087bd1b71260a541eb6763d`，ADMIN_KEY `c87df2090573add1fbc1382eb9d95b3f`，数据加密 `3fb2dd3e525a9258de7a28c9ca092da5`，MySQL 密码同上，MiMo Key 同 CRM。管理员学号 `202330140113`（前记 20255301040113 有误，已从 001_add_admin.sql 核实）。
- **已上线（2026-07-01 提交，迭代 R1~R6 + 私信/扫码）**：①私信系统（`messages.ts`，conversations/chat_messages 两表，023/024 迁移，发图片/表情/在线状态/未读数，前端 ChatView/ConversationList/useDirectMessages + 个人主页覆盖层，匿名帖后端不吐 user_id）；②微信/教务扫码登录（`auth-wechat.ts`，Playwright 无头浏览器代理教务 `jw.scpcfe.cn` CAS 扫码 → 抓学号/姓名/院系 → 自动注册+同步课表，`/auth/wechat-qr`+`/auth/wechat-poll`）。
- **审查结论（已过，2026-07）**：私信模块干净（全参数化/鉴权+归属校验/限流/zod/敏感词/优雅降级）。登录模块已修 6 项：creds 进 .gitignore、删敏感调试日志(Cookie值/页面文本)、学号改从课表 API `xskbList[0].xh` 权威取值(页面正则仅作 fallback 且日志标 `source`)、`/wechat-qr`+`/wechat-poll` 加限流、学期用 `getSemestersToTry()` 动态推算+多学期试探、浏览器改每 session 独立 `chromium.launch` + 统一 `closeSession()`（删掉全局池，杜绝并发泄漏）。
- **仍开着的点**：①微信登录自动 `auth_status='verified'`，绕过 pending→审批 流程（是否有意为之待定）；②每 session 起整个 chromium（~150-250MB），`limiter` 只卡单 IP，缺全局并发上限，开学高峰多 IP 同扫可能吃内存，考虑加在跑 session 计数阈值。
- **安全修复（2026-07-02，未提交）**：①砍掉客户端 confidence 自动认证（新用户一律 pending）；②新增 optionalAuth，contact_info 仅 verified/管理员/作者可见；③posts?userId 非本人只回 active/sold，隐藏帖详情 404。
- **R8（2026-07-02，未提交）**：④中文搜索修复（025 迁移 ngram 索引 + 搜索词适配）；⑤私信拉黑（026 user_blocks 表 + 双向拦截 + ChatView 按钮）；⑥会话创建 1062 竞态修复；⑦密码找回（JWT amr=scan 免旧密码重设 + ProfileTab 修改密码弹窗 + 改密吊销全部 refresh_tokens）；⑧登录态恢复（GET /auth/me + App 启动拉取重建 profile；根因：BUILD 清缓存脚本每次发版清掉 campuslink_profile，已加白名单）；⑨扫码登录 429/卡死修复（限流桶按接口隔离——旧实现全接口共享按-IP 计数器；poll 限流 5/60 + 前端轮询 2s；done 结果幂等缓存防唯一响应丢失后 404 死循环；scanned 阶段加 extracting 提取锁防并发 goto 互断）。BUILD→20260702000002。
- **R9（2026-07-03，已部署）**：⑩课表多学期同步 + 周视图车道算法 + 日视图已过课程灰色标记 + 下一堂课指示器修复（晚上无课显示"今天没课啦"）；⑪默认学期起始日改为 2026-03-02（当前第 18 周）。BUILD→20260703000011。
- **R9b（2026-07-03，已部署）**：修正 xnm 编码理解——正方教务系统 xnm=学年起始年（如 xnm=2025=2025-2026学年），formatSchoolTerm `${y}-${y+1}学年`/getCurrentSchoolTerm/getSemestersToTry 均按起始年回滚正确版本。用户 2025年9月入学，学期对应：2025-3=大一上，2025-12=大一下（当前），2026-3=大二上（即将），2026-12=大二下。
- **已知未修**：学号+姓名占号设密码、迁移 runner split(';') 跳错标已应用、限流按 IP 校园 NAT 会误伤。

### 璟禾官网 + AI 搜索可见度
- WordPress `jhcaishui.cn`，后台 `http://8.156.64.189/wp-admin/`(admin / `Jinghe@2026!`)。Astra 主题 + Elementor，插件 CF7 / Yoast SEO / SureRank / jinghe-seo(JSON-LD) / jh-wecom-push。
- **目标**：让国内 AI(DeepSeek/Kimi/元宝/通义/豆包) 联网搜索排名璟禾，**不改原 UI**。
- 已做：Yoast、自定义 JSON-LD、FAQ 页(15 问)、6 篇 Blog、知乎 12 条/搜狐 6 篇/百度百科草稿(本地待发)。
- 待办(等用户)：百度百科/站长(实名审核中)、知乎/搜狐发稿、榜单上榜、百度知道、天眼查完善。竞对：中盈税务、皓和财务、财税通、慧算账、启冠易立；璟禾目前零收录。

## 记忆同步
- `cc-sync` Git 私有仓库为唯一真理源，含 `memory/*.md` + `settings.json` + sync/upload 脚本。
- 流程：改完 → `upload`(收集+push) → 换机 `git pull` → `sync`(分发到各 CC 项目)。
- 5 实例：Windows CC Desktop、Windows 微信 IM Adapter、Mac CC Desktop、N100 CC CLI、N100 CC(jinghe)。仓库 Windows `C:\Users\Admin\cc-sync\`、Mac `~/cc-sync/`。
- N100 无 git，用 scp 从 Windows 推 memory/*.md 到两个项目目录。
- 触发：重大变更/修 bug/重要对话结束/果果说"更新记忆"。
- 注意：仓库必须私有(含 API key)；Gitee 国内快；Mac 首次 `chmod +x`。

## 经验教训（Feedback）
1. **企业级代码纪律**：SOP 闭环、全操作可审计日志、生产不跑构建、部署前验数据完整性、PM2 自恢复、全局异常捕获、原子操作、类型安全、不造轮子。
2. **部署检查清单**：scp `server.cjs` 后验 `wc -c`；clients.json 部署前 `json.load` 验证；不覆盖 N100 的 contracts.json；改 nginx/Apache 后 reload+curl 验 200；重启后查 frpc 自启；vite build 后查 hash；pm2 restart 等 2s 再 curl。
3. **esbuild crypto bug**：esbuild tree-shake 掉 `.ts` 里的 crypto→加密失效。把加解密逻辑抽到 `.cjs`(esbuild 不处理其内部)供 TS import。
4. **不确定先问，禁止编造**：Key/密码/IP/数据必须从实际文件读，不猜；不同系统别混谈；文档基于真实代码；拿不准直接问。
5. **服务器加固顺序**：ufw 先 `allow 22` 再开墙；SSH 先备份配置、用 `reload` 不 `restart`、开新连接测试后再关旧 session；fail2ban 白名单含内网。核心：别把自己锁在外面。
6. **工具缺失就装不跳过验证**：缺 node/npm 就自行下载安装(Mac arm64 用 nodejs.org 便携包)，每次改动后必须 `npm run build` 验证通过再部署。
7. **BUILD 缓存版本号必须随每次发版 bump**：`index.html` 里有 `var BUILD = '...'`，客户端靠它判断是否有新版本、触发清缓存。如果加了新功能/修了 bug 但 BUILD 没变，浏览器可能继续跑旧 JS，导致"部署了新代码还是旧样子"。每次 `npm run build` 前，把 BUILD 值更新为当前时间戳（如 `20260701000001`），部署后确认手机端强制刷新能看到新行为。
8. **沙箱里别对 Mac Git 仓库做写操作**：Cowork 沙箱能 `git add`/`git commit` 成功，但 `.git/` 锁文件删不掉（无 Mac 文件系统写权限），会在 `.git/` 留下 `index.lock`/`HEAD.lock`，挡住后续 git 操作。Git 写操作只在你 Mac 本地跑，沙箱里只改文件 + 拟提交信息。
