# CampusLink R12 设计：复刻链千校功能（竞品对齐）

> 日期：2026-08-14 ｜ 状态：待评审 ｜ 范围：设计文档，不含代码
> 背景：微信小程序「链千校」（运营方"白小菜团队"）是 CampusLink 的直接竞品。
> **果果决策（2026-08-14）**：
> 1. **当前重点是复刻链千校的软件功能**，做得更全面更好，挤压其生存空间；
> 2. **扩校（多校 SaaS）是后期工作**，目前只做低成本初步准备，不马上完成；
> 3. **问一问暂时不做**，但预留设计。
> 关联：`docs/agent/QUICKSTART.md`、`docs/agent/DATABASE.md`、`docs/agent/API.md`、`docs/agent/CHANGELOG.md`、`docs/plan-2026H2.md`

---

## 0. 竞品对标结论（已核实）

链千校两屏截图（四川财经职业学院实例）能力 vs CampusLink 现状（代码 grep/阅读核实）：

| # | 链千校能力 | 截图证据 | CampusLink 现状 | 本轮动作 |
|---|-----------|---------|----------------|---------|
| 1 | **内容运营体系**：新生必看 15 项（宿舍生活/必备清单/到校路线/校园网络/餐饮美食/报道流程/入学考试/社团部门/军训攻略/表白墙）、校园介绍（校园风光/学院专业） | 截图2 | ❌ 无文章表无内容页（`INITIAL_NOTICES=[]` data.ts:23） | **Phase 1 全量复刻** |
| 2 | **服务分类宫格**：生活服务/转专业/竞赛证书/日常学业/恋爱社交 + 更多服务 5 项（奖助学金/部门电话/校历/课表/意见反馈） | 截图1、2 | ❌ 无宫格（HomeTab 是通知条+信息流） | **Phase 1 复刻** |
| 3 | **校内寻伴**：填学院→找同专业伙伴→去匹配 | 截图2 中部卡片 | ❌ 无匹配；但 `users.department` 已有（019 迁移，扫码自动写 auth-wechat.ts:879-880） | **Phase 2 复刻 + 真实数据升级** |
| 4 | **问一问**：悬浮问答入口 | 截图1、2 右下 | ❌ 无 | **预留设计，不实现** |
| 5 | 校历查询、部门电话 | 截图1 更多服务 | ❌ 仅 classTime.ts 静态常量 | Phase 1 归入内容体系 |
| 6 | 多校 SaaS（"如何免费创建新学校"） | 底部 | ❌ 30 表无 school_id | **后期，本轮只做预留** |

**CampusLink 护城河（链千校没有，保留）**：真实课表（OCR/教务扫码）、成绩/考试、学号实名、UGC 信息广场、圈子、私信、审核流、Web Push、举报/申诉。

**差异化打法**：链千校的功能**全部复刻**（内容/宫格/寻伴/校历），同时用 CampusLink 已有的真实数据能力做升级——寻伴是**系统认证院系匹配**（链千校只能用户自填），课表/成绩是**真功能**（链千校只是静态文章入口）。复刻 + 升级 = 更全面更好。

---

## 1. 设计原则

1. **复用优先**：私信/通知/审核/上传/管理后台/埋点全部复用，新增功能不重复造轮子。
2. **内容与 UGC 分离**：运营内容走新 `contents` 表（校管理员后台发布），UGC 帖子继续 `posts`/`circle_posts`，互不污染。
3. **模块隔离**：新增 `contents` 路由独立 `safeRegister`（server.ts:289 模式），改一处不炸其他地方。
4. **数据驱动运营**：首页运营区（Banner/宫格/新生必看）全部由 `contents` 表 + 分类配置驱动，后台改即生效，不发版。
5. **多校预留（低成本）**：本轮新建表**直接带 `school_id` 字段**（一行成本），未来扩校时新表零迁移；不做学校管理/分发/双层权限等任何扩校功能——那是后期立项的工作。
6. **埋点/安全不降级**：内容 CRUD 全量 business 日志 + 管理员权限 + Zod 校验 + 浏览量防刷。

---

## 2. 数据模型

### 迁移 045：`add_contents.sql` — 内容运营表（唯一新建表）

```sql
CREATE TABLE IF NOT EXISTS contents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_id INT NOT NULL DEFAULT 1,       -- 多校预留：本轮恒为 1（川财），扩校时零迁移
  category VARCHAR(32) NOT NULL,          -- newcomer / campus_intro / services / calendar
  sub_category VARCHAR(32) NOT NULL DEFAULT '',
  title VARCHAR(120) NOT NULL,
  summary VARCHAR(200) DEFAULT '',
  cover_url VARCHAR(500) DEFAULT NULL,    -- 封面图，复用现有 upload 配额
  body MEDIUMTEXT NOT NULL,
  body_type ENUM('html','calendar_json') NOT NULL DEFAULT 'html',  -- calendar 分类存结构化校历
  sort_order INT NOT NULL DEFAULT 0,      -- 同分类内排序
  status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  view_count INT NOT NULL DEFAULT 0,
  created_by INT NOT NULL,                -- 管理员 users.id
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_school_cat (school_id, category, status, sort_order),
  INDEX idx_sub_category (school_id, sub_category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**分类枚举（与链千校宫格一一对应）：**

| category | sub_category 示例 | 对应链千校 |
|----------|------------------|-----------|
| `newcomer` 新生必看 | dorm 宿舍生活 / checklist 必备清单 / route 到校路线 / network 校园网络 / food 餐饮美食 / report 报道流程 / exam 入学考试 / club 社团部门 / military 军训攻略 / wall 校园表白墙 | 新生必看 15 项 |
| `campus_intro` 校园介绍 | scenery 校园风光 / major 学院专业 | 校园介绍 |
| `services` 生活服务 | life 生活服务 / transfer 转专业 / contest 竞赛证书 / study 日常学业 / love 恋爱社交 / scholarship 奖助学金 / phone 部门电话 | 生活服务/更多服务 |
| `calendar` 校历 | term 学期校历（body_type=calendar_json） | 校历查询 |
| `services` 子类 `banner` | 首页轮播图（每条 content 一张图 + 标题） | Banner 运营位 |

**迁移 046（Phase 2 用）：`add_users_major.sql`**
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS major VARCHAR(128) DEFAULT '' AFTER department;
```
来源：教务扫码班名解析（扩展 auth-wechat.ts:956-957 班名处理）> 用户自填 > 后台维护；为空时匹配降级院系级。

> **不做**：schools 表、其他表 school_id 迁移、双层权限——全部留到后期扩校立项（文档附录 A 已备好设计，见 §10）。

---

## 3. 后端 API 设计（新增 `contents.ts`，模块隔离）

### 3.1 用户端（公开，限流）

```
GET /api/v1/contents?category=newcomer&page=1&pageSize=20
→ { list: [{id, category, subCategory, title, summary, coverUrl, sortOrder, viewCount, updatedAt}], total }
```
- 仅 `status='published'`，按 `sort_order ASC, id DESC`；列表不含 body。
- `GET /contents/banner` → category=services + sub_category=banner 的已发布内容（首页轮播源）。
- `GET /contents/calendar` → category=calendar 的 `calendar_json` 结构化校历（学期起止/节假日数组）。
- `GET /contents/:id` → 详情含 body；非 published/archived 返回 404；`view_count+1` 同 IP 5 分钟窗口去重（防刷）。

### 3.2 管理端（adminAuth，校管理员，复用现有 ADMIN_KEY）

```
POST   /admin/contents          # 新建（Zod 校验；created_by=当前管理员；school_id=1）
PUT    /admin/contents/:id      # 编辑（含 status：draft↔published↔archived）
DELETE /admin/contents/:id      # 删除（物理删 + business 日志）
GET    /admin/contents?category=&status=   # 列表（含草稿）
```
- 全部记 `logger.business`（操作人/目标/动作/变更摘要）。
- body 入库不做清洗（保留运营自由度），**渲染端 DOMPurify 白名单**兜底（§5）。

### 3.3 匹配（Phase 2，新增 `peers` 逻辑，建议并入 users 路由）

```
GET /api/v1/users/peers?scope=major|department&limit=20
```
- 仅登录（JWT）；排除自己/已拉黑（复用 user_blocks）/未认证（authStatus != verified）。
- 排序：同专业 > 同院系 > 最近活跃；`scope=department` 兜底。
- **只吐昵称/头像/院系/专业，不吐学号/手机号/contact_info**。
- 建立会话复用现有 `POST /conversations`（陌生人 pending 门槛已有）。

### 3.4 问一问（预留设计，本期不实现）

轻量版方案（二期落地）：复用 `posts` 学习分类发提问帖 + 校管理员回答结帖，不加新表；AI 版（MiMo）三期评估。本期只在 §10 附录 B 留设计，不动代码。

---

## 4. 前端设计

### 4.1 首页改版（HomeTab.tsx，对标链千校首页）

当前：通知条（考试倒计时/今日课程/热帖）→ 信息流。改版后：

```
Header（现有）
├─ 运营 Banner 轮播（≤5 张，左右滑动+指示点，复用 ListingDetail 手势经验）
├─ 分类宫格（生活服务/转专业/竞赛证书/日常学业/恋爱社交 → 更多）
├─ 新生必看 宫格（横向滑动，cover 小图）
├─ 校内寻伴 卡片（Phase 2）
├─ 通知条（现有，下移）
└─ 信息流（现有，下移）
```
- 宫格 icon：前端静态映射表（subCategory → SVG），不依赖后台上传，保持轻量。
- 骨架屏：运营区加载期间用 CardSkeleton 同款。
- 数据源：App 启动 `GET /contents/banner` + `GET /contents?category=services` + `GET /contents?category=newcomer`，并入 `useAppData` 全局状态 + localStorage 缓存（离线降级）。

### 4.2 文章列表页 + 详情页（覆盖层，复用 ListingDetail 模式）

- `ContentListPage`：按 category 渲染卡片（封面/标题/摘要/浏览量），触底分页。
- `ContentDetailPage`：title/cover/body/浏览量/更新时间。
- 深链：首页宫格/新生必看点入 → `openContent(category|id)`，状态驱动不改路由。

### 4.3 校内寻伴页（Phase 2）

入口：首页卡片 + ProfileTab 菜单项。显示我的院系/专业（读 profile）→ 选范围（同专业/同院系）→ 推荐列表 → "打招呼"直接开私信（复用 ChatView）。空态引导扫码登录（真实数据匹配 = 差异化卖点）。

### 4.4 管理后台（admin.html + admin.ts 扩展）

- 新增 tab「内容管理」：`TAB_LABELS` 数组加一项（admin.html:121 数组驱动，照抄现有模式）。
- 功能：列表（分类/状态筛选）、新建/编辑（标题/摘要/封面上传复用现有 upload/正文 textarea HTML）、上下架（status）、排序（sort_order 上下移）、删除。
- 校历编辑：`calendar` 分类用结构化 JSON 编辑器（学期起止/节假日），渲染端出校历视图。

---

## 5. 安全与埋点

- 内容 CRUD：`logger.business`；浏览量：access 日志。
- 管理接口：adminAuth + 按接口隔离限流桶（对齐 429 修复经验）。
- **正文渲染：新增依赖 `dompurify`（前端白名单清洗后 dangerouslySetInnerHTML）**，防运营后台被入侵后存储型 XSS——`npm install dompurify` 评审确认。
- 匹配接口：JWT 必须 + 响应脱敏。
- 图片：复用现有上传配额（每用户每日 20 张/100MB）。

---

## 6. 测试规划（对齐现有 110 用例风格）

| 文件 | 方向 |
|------|------|
| `contents.test.ts`（新增） | 列表只吐 published；详情 404 草稿；浏览量去重；Zod 校验；adminAuth 无 key 403 |
| `matches.test.ts`（新增，Phase 2） | 排除自己/拉黑/未认证；major 空降级 department；不吐 student_id |
| 存量回归 | 现有 110 用例全过（HomeTab 改版不能破坏任何断言） |

**验收门槛**：`tsc --noEmit` + `vitest run` + `npm run build` + `deploy.sh` + 线上 curl 验证新接口 + BUILD 版本号 bump（记忆规则 7）。

---

## 7. 分阶段实施计划

| 阶段 | 内容 | 交付物 | 部署 |
|------|------|--------|------|
| **Phase 1 内容体系**（本轮主线） | 迁移 045 + contents 路由 + 管理后台「内容管理」tab + 首页运营区/Banner/宫格/新生必看 + 文章列表/详情页 + 校历页 + 测试 | 链千校核心能力全量复刻 | 一次部署 |
| **Phase 2 校内寻伴** | 迁移 046 + peers 接口 + 寻伴页 + 班名解析专业 + 后台匹配维护 | 匹配功能（真实数据升级） | 一次部署 |
| **Phase 3 问一问** | 预留设计落地（轻量问答） | 二期 | 视需求 |
| **后期 扩校** | 附录 A 设计落地（schools 表/分发/双层权限/教务适配器） | 独立立项 | 后期 |

> Phase 1 内顺序：迁移 → contents.ts → admin.ts 扩展 → 前端（数据层 → 首页改版 → 列表/详情页）→ 测试 → 部署回归。

---

## 8. 决策记录

**果果已确认：**
1. ✅ 当前重点复刻链千校功能（更全面更好、挤压竞品）
2. ✅ 扩校后期做，本轮只做低成本预留（新表带 school_id）
3. ✅ 问一问暂不做，预留设计

**技术决策（推荐，可驳回）：**
4. 只新建 `contents` 一张表；schools 表/其他表 school_id 迁移全留到扩校立项（避免为不做的事付维护成本）。
5. 首页运营区在上、信息流下移，共存不删除（运营区拉新、信息流留存）。
6. 宫格 icon 前端静态映射（轻量可控），Banner 用 `services/banner` 约定不加字段。
7. 正文 HTML + 前端 DOMPurify；匹配首版 department 为主、major 增强。

---

## 9. 对齐检查单（验收逐项打勾）

- [ ] 新生必看宫格（宿舍/清单/路线/网络/餐饮/报道/考试/社团/军训/表白墙…）可发文章、首页可点
- [ ] 校园介绍（风光/学院专业）可发文章
- [ ] 服务宫格（生活/转专业/竞赛/学业/恋爱 + 更多：奖助学金/部门电话/校历/课表/反馈）分类入口齐全
- [ ] 首页 Banner 轮播可运营配置
- [ ] 校历查询页（学期起止/节假日，后台结构化维护）
- [ ] 校内寻伴：同专业/同院系匹配 + 一键私信（认证数据）
- [ ] 管理后台「内容管理」tab：CRUD/排序/上下架
- [ ] 意见反馈已有 ✅（不动）
- [ ] 问一问：设计预留（附录 B）
- [ ] 扩校：新表带 school_id，其余留后期（附录 A）
- [ ] 川财现有功能（课表/成绩/扫码/私信/推送）零回归

---

## 10. 附录

### 附录 A：扩校预留设计（后期立项用，本期不实现）

- `schools` 表：slug/name/logo/status/features(JSON 能力开关)/config(教务适配配置)，种子行川财（slug=scpcfe, features 全开）。
- 存量表分批加 `school_id DEFAULT 1`（第一批通用/社区/社交表，第二批教务强相关表随适配器）。
- `resolveSchool` 中间件 + 路径分发 `/campus/{slug}/`（省 DNS/证书，nginx 几乎不动）。
- 双层管理员：平台管理员（建校/任命/开关能力）+ 校管理员（本校内容/审核）。
- 教务适配器 provider 模式：抽离 auth-wechat.ts 正方专有逻辑为 `providers/zhengfang.ts`（host/gnmkdm/学期编码配置化），新学校按配置接入。
- 前端"学校未入驻"引导页 → 入驻申请（对标链千校"如何免费创建新学校"）。

### 附录 B：问一问预留设计（二期落地）

- 轻量版：复用 `posts` 学习分类提问帖 + 校管理员回答结帖，不加新表。
- AI 版（三期）：接 MiMo，需评估对话链路复杂度与成本。
- 悬浮入口：首页右下 FAB（对标链千校"问一问"）。
