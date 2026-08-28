# CampusLink R12 前端详细设计：链千校功能复刻

> 日期：2026-08-14 ｜ 状态：待评审 ｜ 配套：`docs/plan-r12-竞品对齐.md`（总设计）
> 本文是前端部分的组件级设计，基于现有代码模式（App.tsx 状态驱动 + useAppData 全局状态 + 覆盖层 + lucide-react 图标 + Tailwind tokens），可直接照着开发。
> **风格铁律（果果 2026-08-14 确认）：复刻链千校的【功能】和【信息架构】，视觉风格一律沿用 CampusLink 现有设计体系，不模仿链千校的视觉。** 见 §2。

---

## 1. 前端现状（已核实）

- **路由**：无 React Router，`App.tsx` 状态驱动。`useAppData()` 返回全局状态 + actions；Tab 用 `display:none` 保活；覆盖层模式：`d.selectedListing` 非空 → 渲染 `ListingDetail`（App.tsx:198），`d.isSearchOpen` → 渲染 `SearchPage`（:371）。
- **数据层**：`useAppData.ts` 内 `useState + loadFromStorage`（localStorage 持久化）+ API 拉取；actions 如 `openListingDetails(l)`。
- **首页 HomeTab.tsx 当前结构**：下拉刷新 → 搜索栏 → 活动海报横滑 → 分类 icon dock → 信息流。
- **图标**：`Icon.tsx` 封装 lucide-react（Home/Calendar/ShoppingBag/Handshake/LayoutGrid/PhoneCall/FileText/CalendarDays/MapPinned 等大量图标已导入）→ **宫格图标用 lucide 组件静态映射，零新依赖**。
- **管理后台**：`public/admin.html` 单页 + `admin.ts`，`TAB_LABELS` 数组驱动 tab（admin.html:121）。

---

## 2. 设计规范（视觉风格：与 CampusLink 现有体系完全一致）

**原则：新组件 = 现有设计语言的拼装，不引入任何新视觉元素。** 复刻的是"功能入口和信息结构"，不是链千校的皮肤。

### 2.1 必须沿用的 CampusLink 设计体系（src/index.css 已核实）

| 维度 | 规范 | 来源 |
|------|------|------|
| 主色 | `primary` #2f6fe0 / `secondary` #0ea472，不引入链千校的蓝绿营销色 | index.css @theme |
| 分类色 | **course 十二色盘**（course-red/volcano/orange/gold/lime/green/cyan/blue/indigo/purple/magenta）——宫格图标、标签、Banner 角标全部用这盘 | index.css 课程配色注释 |
| 卡片 | `shadow-card` 柔和阴影悬浮卡（无边框），hover 用 `shadow-card-hover`；圆角 `rounded-2xl`(16px)，小元素 `rounded-xl`/`rounded-lg` | index.css 设计体系注释 |
| 背景 | 页面 `background/surface` token，区块间用 `bg-on-surface/8` 或 `outline-variant` 分隔，不画硬边框线 | 全站惯例 |
| 字号 | 10-11px 标签 / xs(12) 辅助 / sm(14) 正文 / base(16) 标题；宫格文字用 text-xs + 小号标签（对齐 HomeTab 分类 dock 的 text-[9px]/[10px]） | HomeTab.tsx:160-177 |
| 暗色模式 | class-based `.dark`，所有新组件必须用 tokens（`bg-on-surface/8`、`text-on-surface-variant` 等），禁止写死颜色 | theme.tsx + index.css .dark 映射 |
| 图标 | lucide-react（Icon.tsx 封装），宫格图标映射 lucide 组件，**不引入任何图标库** | Icon.tsx |
| 动效 | `animate-fade-in` 覆盖层过渡、`active:scale-[0.98]` 点击反馈、`transition-colors`（全站既有手感） | 全站惯例 |

### 2.2 明确不模仿链千校的视觉点

- ❌ 不做链千校那种纯白底 + 大色块渐变营销皮肤；Banner 复用现有"活动海报"卡片风格（圆角 16 + 底部渐变压暗 + 标题叠图，HomeTab.tsx:143-165 同款）。
- ❌ 不引入链千校的字体/圆角尺度/阴影风格；一律用 Inter/Hanken Grotesk + 现有圆角 tokens。
- ✅ 但**信息结构照搬**：宫格入口、新生必看横滑、寻伴卡片文案区、问一问 FAB 位置——这些是"功能点"不是"皮肤"，全部保留（见 §4 各区块）。

### 2.3 视觉一致性检查（开发完成后逐项过）

- [ ] 新组件在明/暗两种模式下都读得清（截图验证）
- [ ] 无任何 hex 写死颜色（grep 检查），全部走 tokens
- [ ] 卡片阴影/圆角/字号与相邻现有组件（PostCard、活动海报）肉眼一致
- [ ] 图标风格统一（lucide outline 系，不混 fill）

---

## 3. 新增页面/组件清单

| 文件 | 类型 | 说明 |
|------|------|------|
| `src/components/page/ContentListPage.tsx` | 覆盖层页面 | 内容分类列表（新生必看/校园介绍/生活服务/校历） |
| `src/components/page/ContentDetailPage.tsx` | 覆盖层页面 | 文章详情（标题/封面/正文/浏览量） |
| `src/components/page/PeerMatchPage.tsx` | 覆盖层页面（Phase 2） | 校内寻伴 |
| `src/components/home/HomeBanner.tsx` | 首页区块 | 运营 Banner 轮播（≤5 张） |
| `src/components/home/ServiceGrid.tsx` | 首页区块 | 分类宫格（生活服务等） |
| `src/components/home/NewcomerGrid.tsx` | 首页区块 | 新生必看横滑宫格 |
| `src/components/home/PeerCard.tsx` | 首页区块（Phase 2） | 寻伴入口卡片 |
| `src/components/modal/ContentEditModal.tsx` | 管理端（admin.html 内联亦可） | 内容编辑表单 |

> 首页区块放 `components/home/` 新目录（对齐现有 `page/`、`modal/`、`ui/`、`layout/` 分层），HomeTab 保持容器角色只做拼装。

---

## 4. 首页改版（对标链千校信息架构，视觉走 §2 规范）

### 4.1 HomeTab.tsx 区块顺序（新 → 旧，从上到下）

```
┌─ Header（现有，标题显示学校简称，可运营配置）──────────┐
├─ 搜索栏（现有，不动）──────────────────────────┤
├─ [新增] HomeBanner 运营轮播 ──────────────────┤
├─ [新增] ServiceGrid 分类宫格 ──────────────────┤
├─ [新增] NewcomerGrid 新生必看（横向滑动）──────────┤
├─ [新增] PeerCard 校内寻伴入口（Phase 2）──────────┤
├─ 活动海报横滑（现有，保留）────────────────────┤
├─ 分类 icon dock（现有，保留）──────────────────┤
├─ 信息流（现有，下移，不动逻辑）──────────────────┤
└─ 问一问 FAB（Phase 3 预留，右下角悬浮）──────────┘
```

**关键决策**：运营区插在搜索栏与活动海报之间；活动海报/分类 dock/信息流全部原样保留（它们是 UGC 留存入口，运营区是拉新入口，共存）。

### 4.2 HomeBanner.tsx

```
props: { items: Content[]; onOpen: (c: Content) => void }
```
- 数据：`contents` 表 `category=services & sub_category=banner`，已 published，按 sort_order。
- 视觉：`w-[92vw] h-40 rounded-2xl overflow-hidden`，左滑切换 + 指示点（复用活动海报的 `snap-x snap-mandatory` 模式，HomeTab.tsx:143-165 同款）。
- 加载中：`Skeleton` 同款骨架（`rounded-2xl h-40`）。
- 空态：不渲染该区块（运营没配 Banner 时首页照常）。

### 4.3 ServiceGrid.tsx — 分类宫格（对标"生活服务/转专业/竞赛证书/日常学业/恋爱社交"）

```
props: { onOpenCategory: (subCategory: string) => void }
```
- **宫格项 = 静态配置表**（前端硬编码，图标用 lucide）：

```ts
// src/constants/services.ts
export const SERVICE_ITEMS: { sub: string; label: string; icon: string; color: string }[] = [
  { sub: 'life',      label: '生活服务', icon: 'shopping-bag',  color: 'bg-course-blue/10 text-course-blue' },
  { sub: 'transfer',  label: '转专业',   icon: 'file-edit',     color: 'bg-course-green/10 text-course-green' },
  { sub: 'contest',   label: '竞赛证书', icon: 'award',         color: 'bg-course-orange/10 text-course-orange' },
  { sub: 'study',     label: '日常学业', icon: 'book-open',     color: 'bg-course-purple/10 text-course-purple' },
  { sub: 'love',      label: '恋爱社交', icon: 'heart',         color: 'bg-course-red/10 text-course-red' },
];
// + 「更多」项 → 打开 services 全部分类列表页
```
- 宫格项点击 → `onOpenCategory(sub)` → 打开 `ContentListPage`（category=services&sub_category=sub），**跳到对应子分类的文章列表**；若该分类无文章 → 空态"运营建设中"。
- 样式：`grid grid-cols-4 gap-3`，每项圆形 icon 底（`w-12 h-12 rounded-2xl flex items-center justify-center shadow-card`）+ 文字标签（text-xs）——**信息结构对标链千校宫格，视觉用 course 色盘 + 现有卡片语言**。

> 为什么静态配置：运营要换分类图标/文案是低频需求，前端静态映射零依赖零接口；要自定义时再升级为后台上传（预留 `contents` 的 icon 字段不建，避免过度设计）。

### 4.4 NewcomerGrid.tsx — 新生必看横滑（对标 15 项宫格）

```
props: { items: Content[]; onOpen: (c: Content) => void }
```
- 数据：`category=newcomer` 已 published 列表。
- 视觉：横向滚动 `overflow-x-auto hide-scrollbar snap-x`，每项 `w-24 shrink-0` 卡片（cover 小图 `h-16 rounded-xl` + 标题 text-xs line-clamp-2），对标截图 2。
- 区块头：「新生必看」标题 + 右侧「查看全部 >」→ `ContentListPage(category=newcomer)`。
- 空态：区块不渲染（未配置内容时不占位）。

### 4.5 PeerCard.tsx（Phase 2）

```
props: { profile: StudentProfile; onOpenMatch: () => void }
```
- 对标截图 2 中部卡片：左侧两行文案（"点击这里找同专业朋友啦～校内寻伴" + "填写学院，寻找同专业伙伴"），右侧「去匹配 >」按钮。
- 未登录/未认证：卡片文案改为"扫码登录后开启认证匹配"→ 点击弹 AuthModal/WechatLoginModal。
- 已登录：点击 → `openPeerMatch()` 打开 PeerMatchPage。

### 4.6 问一问 FAB（Phase 3 预留，本期不渲染）

- 定位 `fixed bottom-24 right-4 z-40`（避开 BottomNav），圆形 `primary` 底 + 白字 `message-circle` 图标 + "问一问"小字，`shadow-card` 悬浮（CampusLink 风格，不用链千校的渐变大按钮）。
- 本期：组件文件不建，仅在 App.tsx 留注释占位。

---

## 5. 内容列表页 + 详情页（覆盖层）

### 5.1 ContentListPage.tsx

```
props: { category: string; subCategory?: string; onBack: () => void; onOpen: (c: Content) => void }
```
- 顶部：Header 变体（返回箭头 + 分类标题，如"新生必看"/"生活服务·转专业"）。
- 列表：`PostCard` 同款卡片风格改造——封面左缩略图 + 标题 + 摘要 + 浏览量（复用 PostCard 的 60px 左缩略图 flex 布局经验）。
- 分页：触底加载（复用首页 listPage/listHasMore 模式）；下拉刷新复用 HomeTab 手势。
- 数据：`useAppData` 按 category 缓存（见 §6）。

### 5.2 ContentDetailPage.tsx

```
props: { content: Content; onBack: () => void }
```
- 布局：封面大图（如有）→ 标题（text-lg font-bold）→ 元信息（浏览量 · 更新时间）→ 正文。
- **正文渲染（安全关键）**：`DOMPurify.sanitize(body)` 白名单清洗后 `dangerouslySetInnerHTML`；CSS 用 `prose` 风格类（`[&_img]:rounded-xl [&_img]:max-w-full` 等 Tailwind 任意值）控制排版。
- 校历内容（`body_type=calendar_json`）：不渲染 HTML，渲染专用校历视图（学期起止/节假日列表/倒计时，见 §7）。
- 返回：覆盖层关闭（复用 ListingDetail 的 onBack 模式）。

---

## 6. 数据层扩展（useAppData.ts）

### 6.1 新增状态

```ts
// 内容缓存：按 category 维度缓存列表，避免切 Tab 重复请求
const [contentsByCat, setContentsByCat] = useState<Record<string, Content[]>>(() =>
  loadFromStorage('contents_by_cat', {}));
const [contentsLoading, setContentsLoading] = useState(false);
const [bannerItems, setBannerItems] = useState<Content[]>(() => loadFromStorage('banner_items', []));
// 覆盖层状态
const [contentList, setContentList] = useState<{ category: string; subCategory?: string } | null>(null);
const [selectedContent, setSelectedContent] = useState<Content | null>(null);
// Phase 2
const [isPeerMatchOpen, setIsPeerMatchOpen] = useState(false);
```

### 6.2 新增 actions（对齐 openListingDetails 模式）

```ts
openContentList(category: string, subCategory?: string)  // 打开列表覆盖层 + 首次拉取
openContent(c: Content)                                  // 打开详情覆盖层 + 浏览量+1（乐观）
refreshContents()                                        // 下拉刷新：重拉 banner + services + newcomer + calendar
```

### 6.3 数据获取

- App 启动（useEffect，对齐现有 listings 拉取位置）：`GET /contents/banner` + `GET /contents?category=services` + `GET /contents?category=newcomer` + `GET /contents?category=calendar` 并行拉取，写入 state + localStorage。
- 缓存策略：`loadFromStorage` 兜底离线展示，网络成功覆盖；切 Tab 不重拉（contentsByCat 已缓存），下拉刷新才重拉。
- 浏览量：`openContent` 乐观 +1，后端去重兜底。

---

## 7. 校历视图（calendar 分类）

- 数据：`GET /contents/calendar` → `body_type=calendar_json`，结构：

```json
{ "termName": "2026-2027学年 秋季学期",
  "startDate": "2026-09-01", "endDate": "2027-01-15",
  "holidays": [{"name":"国庆节","start":"2026-10-01","end":"2026-10-07"}],
  "examWeeks": [{"name":"考试周","weekStart":18,"weekEnd":19}] }
```

- 渲染：`CalendarView.tsx`（列表式：学期信息卡片 + 节假日时间线 + 距开学/放假倒计时），后台「内容管理」里 calendar 分类用 JSON 编辑器维护。
- 入口：ServiceGrid「更多服务」宫格内（奖助学金/部门电话/校历/课表/反馈），校历点入 → `ContentListPage(category=calendar)` → 详情直接渲染 CalendarView。

---

## 8. 管理后台「内容管理」tab（admin.html + admin.ts）

- `TAB_LABELS` 数组加 `'contents': '内容管理'`（admin.html:121 数组驱动，照抄现有）。
- tab 面板：
  - 顶部：分类筛选（全部/新生必看/校园介绍/生活服务/校历）+ 状态筛选（草稿/已发布/已归档）+ 「新建内容」按钮。
  - 列表表格：标题 / 分类 / 子分类 / 状态 badge / 浏览量 / 更新时间 / 排序 / 操作（编辑、上架↓、下架、删除）。
  - 新建/编辑弹窗：标题、分类 select、子分类 select（按分类联动）、摘要、封面上传（复用现有 upload 接口）、正文 textarea（HTML，备注"支持 <img>/<h2>/<p> 等标签"）、排序号。
  - calendar 分类：正文编辑切换为 JSON 编辑器（textarea + 校验提示）。
- `admin.ts` 新增：`listContents`/`createContent`/`updateContent`/`deleteContent`，全部走 `/admin/contents` 系列接口 + `logger.business`。

---

## 9. 交互/体验细节（对齐现有手感）

- 骨架屏：运营区用 `Skeleton`（`ui/Skeleton.tsx`）同款脉冲。
- 横滑：`hide-scrollbar snap-x snap-mandatory`（HomeTab 活动海报同款），避免自造手势。
- 覆盖层动画：`animate-fade-in`（现有全局动画），详情页内容懒加载（`lazy + Suspense`，对齐 ListingDetail 的 lazy 模式 App.tsx:34）。
- 深色模式：沿用 `isDark` 全局，新组件全部用 tokens（`bg-on-surface/8`、`text-on-surface-variant` 等）不写死颜色。
- 返回手势：覆盖层返回键 + ESC（对齐 R5 Modal ESC 关闭经验）。

---

## 10. 依赖变更

- `npm install dompurify`（+ `@types/dompurify`）——唯一新增前端依赖，正文渲染安全兜底。评审确认。
- 其余全部复用（lucide 图标、Skeleton、Modal、Toast、api.ts、logger 等）。

---

## 11. 实施顺序（Phase 1 前端部分）

1. `src/constants/services.ts`（宫格静态配置 + icon 映射）
2. `useAppData.ts` 扩展（状态 + actions + 启动拉取）
3. `components/home/` 四个区块组件（Banner → ServiceGrid → NewcomerGrid）
4. `HomeTab.tsx` 拼装（区块插入 + props 透传）
5. `ContentListPage` + `ContentDetailPage` + `CalendarView`（覆盖层注册进 App.tsx，对齐 selectedListing 模式）
6. admin.html/admin.ts「内容管理」tab
7. `tsc --noEmit` + `vitest run` + `build` → 部署 → curl 验证 + BUILD bump

---

## 12. 与链千校截图逐块对照

| 链千校截图元素 | 我们的实现 | 差异/升级 |
|---------------|-----------|----------|
| 顶部学校名横幅 | Header 显示学校简称 | 运营可配 |
| Banner 轮播 | HomeBanner（活动海报卡片风格，§4.2） | 同款信息架构，CampusLink 皮肤 |
| 生活服务/转专业/竞赛/学业/恋爱 宫格 | ServiceGrid（course 色盘 + lucide 图标 5 项 + 更多） | 同款入口，CampusLink 卡片风格 |
| 新生必看 15 项横滑 | NewcomerGrid | 同款，后台可增删到任意项数 |
| 校内寻伴卡片 + 去匹配 | PeerCard + PeerMatchPage | **升级：系统认证院系/专业匹配（链千校自填）** |
| 问一问悬浮按钮 | FAB（Phase 3 预留） | 二期 |
| 更多服务（奖助学金/部门电话/校历/课表/反馈） | 内容体系 + 校历 JSON 视图；课表/反馈走现有真功能 | **升级：课表是真实课表非文章** |
| 底部"如何免费创建新学校" | 扩校预留（附录 A，后期） | 后期 |
