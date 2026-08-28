# CampusLink 迭代日志

### R12 Phase 3：交易闭环 + 校内寻伴 + 资料库（2026-08-15）
- **交易通知**：买家发起/卖家生成码/核销完成/取消 四场景写 notices（category='transaction'），补上交易系统的体验断点
- **交易管理后台**：admin 新增「交易」tab——全量列表（商品/买卖家/码/状态）+ 完成/取消处理，纠纷状态可人工裁定
- **校内寻伴**：迁移 048 users.major + `/users/peers` 接口（同专业>同院系排序、排除自己/拉黑/未认证、不吐学号）；前端 PeerMatchPage（范围切换/认证门控/打招呼直接开私信）+ 首页寻伴入口卡片。**差异化：院系/专业来自教务扫码认证，链千校只能用户自填**
- **新生资料库**：迁移 049 contents 加 resource_url/name + 050/052 资料内容 seed；详情页「下载资料」按钮（正规化，对标链千校"私信领资料"引流）；管理后台内容表单加资料字段
- **内容埋点**：管理后台内容 tab 支持按浏览量排序（运营看内容效果）
- **坑记录**：`ADD COLUMN IF NOT EXISTS` 是 MariaDB 语法，MySQL 8 会报错；迁移 runner catch 后跳过继续、迁移名照记 → 列没加但迁移已标记。修复：051 用标准 ALTER 补列 + 052 补插 seed（050 因引用不存在列而失败）
- BUILD → 20260815183000
### R12 Phase 2：面交交易 + 信誉系统（2026-08-15）
- **背景**：二手交易此前只能手动标"已售"，无交易闭环、无信誉。本轮加入面交码核销 + 互评信誉。
- **数据库**：迁移 047 transactions（买家发起 pending → 卖家生成 6 位码 code_issued(30min) → 核销 completed → post 自动标 sold；verify_attempts 防爆破）+ reviews（唯一键 (transaction_id, reviewer_id) 防重复评）+ users 信誉列（reputation_score 平均分 + review_count）
- **后端**：transactions.ts 七接口：发起/我的交易/同意生成码/核销/取消/评价/信誉查询；validators 三个 schema；规则：只有交易双方可操作、一个帖子同时仅一个进行中交易、码过期/5 次失败作废
- **前端**：帖子详情（sell 非本人显示「面交购买」主按钮 + 复制副按钮；卖家信誉 ★ 金色徽标）；TransactionsPage 我的交易（pending 卖家同意生成码/买家等待、code_issued 大字码+倒计时+卖家核销输入、completed 评价按钮、取消）；ReviewModal 1-5 星+文字；ProfileTab「我的交易」入口
- **测试**：transactions.test.ts 18 用例 → 全量 142/142 过
- BUILD → 20260815180000

### R12 竞品对齐 Phase 1：内容运营体系（2026-08-14）
- **背景**：竞品「链千校」小程序（SaaS 模板平台）的新生必看/服务宫格/校历等能力，CampusLink 此前完全没有（无文章表无内容页）。本轮全量复刻其功能，视觉沿用 CampusLink 现有设计体系（果果决策：复刻功能与信息架构，不模仿竞品皮肤）。
- **数据库**：迁移 045 `contents` 表（school_id 多校预留恒为 1、category/sub_category/body_type/status 枚举、sort_order 排序、view_count 浏览量）
- **后端**：新增 `contents.ts` 路由模块（safeRegister 隔离）：用户端列表（仅 published 不泄草稿）/banner（services/banner 约定，须在 :id 前注册）/详情（同 IP 5 分钟浏览量去重）；管理端 CRUD + 上下架 + 排序，全量 business 日志；validators 新增 createContentSchema
- **管理后台**：admin.html 新增「内容管理」tab（TABS/TAB_LABELS 数组驱动）：分类/状态筛选、新建/编辑表单（分类联动子分类、正文 HTML、校历分类切 JSON 编辑器）、删除
- **前端**：
  - 数据层：useAppData 新增 contentsByCat/bannerItems/contentList/selectedContent 状态 + fetchContents（缓存守卫）/openContentList/openContent/refreshContents actions + 挂载拉取 + toContent 转换
  - 首页运营区（HomeTab）：Banner 轮播 + 分类宫格（services.ts 静态配置 + lucide 图标 + course 色盘）+ 新生必看横滑，插在活动海报前；信息流原样保留
  - 覆盖层：ContentListPage（分类列表卡片）+ ContentDetailPage（DOMPurify 白名单清洗正文 + CalendarView 校历结构化视图），Header/BottomNav 联动隐藏
  - 依赖：新增 `dompurify`（正文渲染 XSS 兜底，唯一新增前端依赖）
- **测试**：新增 contents.test.ts 14 用例（列表只吐 published/banner 限定/详情 404/管理端 CRUD/school_id 断言/schema 边界）→ 全量 124/124 过
- BUILD → 20260814220000

### R1 发布+消息（2026-06）
- 图片本地上传 FormData / 发布草稿 2s debounce localStorage 恢复
- 消息真实推送：审核/报名写入 notices 表，前端 syncMessages 替换 Mock

### R2 刷新+收藏（2026-06）
- 下拉刷新 60px 阈值 touch 手势 / 首页分页触底 200px 预加载 / CardSkeleton 骨架屏
- 收藏列表取消收藏 / Tab 全部 display:none 保活不丢状态

### R3 课表+编辑+互动（2026-06）
- 课程冲突四维检测/编辑入口 badge 始终可见/回到顶部 FAB scroll>500px/广告关闭 24h localStorage/浏览收藏数展示

### R4 搜索+导出（2026-06）
- 圈子服务端搜索 SQL LIKE keyword / 课表文字导出按天分组→剪贴板

### R5 离线+搜索+骨架屏（2026-06）
- Modal ESC 关闭+body 锁定 / OfflineBanner 离线横幅 / SearchPage 服务端搜索 300ms 防抖 / CircleTab 初始骨架屏

### 修复部署（2026-06）
- 默认图→空数组 / 无图隐藏 aspect-square / 审核→发帖即上线 / 广告移动端始终可见 / deploy.sh chunk 归类 / notices 1054 降级 / 违禁词前端拦截 / Canvas 内存泄漏

### R6 UI打磨（2026-06）
- PostCard 有图帖子 60px 左缩略图 flex 布局 / ListingDetail 轮播手势滑动 50px 阈值跟手回弹

### R7 私信+扫码登录（2026-07-01）
- 私信系统：conversations/chat_messages（迁移 023/024），发图片/表情/在线状态/未读数，ChatView/ConversationList/useDirectMessages，个人主页覆盖层，匿名帖后端不吐 user_id
- 教务扫码登录：auth-wechat.ts，Playwright 代理 jw.scpcfe.cn CAS 扫码 → 学号从课表 API xskbList[0].xh 权威取值 → 自动注册+同步课表；每 session 独立 chromium.launch + closeSession()
- 安全审查已过；遗留：①扫码登录自动 verified 绕过审批（待定是否有意）②chromium 每 session ~150-250MB，缺全局并发上限
- iOS 修复：聊天覆盖层 inset-0 解决 dvh 键盘失焦

### 安全修复（2026-07-02）
- 移除客户端 confidence 自动认证：dev-login 新用户一律 pending，伪造 confidence=high 记安全日志（自动认证只走教务扫码）
- contact_info 门槛：新增 optionalAuth 中间件，帖子列表/详情/收藏的联系方式仅 verified/管理员/作者本人可见，匿名返回 null
- posts?userId 泄露修复：非本人只能看 active/sold；详情页 pending/rejected/closed 非作者返回 404
- 已知未修：学号+姓名可占号设密码（待定方案）、迁移 runner split(';') 隐患、限流按 IP 校园 NAT 误伤

### R8 搜索修复+拉黑+密码找回（2026-07-02）
- 中文搜索修复：025 迁移重建 ft_posts_search `WITH PARSER ngram`；搜索词中文用 `+"短语"`、英文 `+词*`、单个中文字退化 LIKE
- 私信拉黑：026 迁移 user_blocks 表；POST/DELETE /users/:id/block + GET /users/blocked；创建会话/发消息双向拦截（不暴露方向）；会话列表和未读数过滤已拉黑用户；ChatView 顶栏拉黑按钮+红色横幅；user_blocks 未迁移时优雅降级
- 会话创建竞态修复：并发撞 uk_user_pair 捕获 1062 重查，不再 500
- 密码找回：JWT 加 amr（password/scan），扫码登录签发 amr=scan（1h 有效），PUT /auth/password 在 amr=scan 时免旧密码；改密后吊销全部 refresh_tokens；ProfileTab 新增「修改密码」入口+弹窗，登录页加忘记密码提示；amr 在 refresh 后回落为 password（有意设计）
- 登录态恢复：新增 GET /auth/me；App 启动时（及扫码登录后）用 token 拉 /auth/me 重建 profile——根因是 index.html BUILD 清缓存脚本每次发版清掉 campuslink_profile，token 在但 UI 显示游客；campuslink_profile 已加入清理白名单双保险；顺带修复扫码登录 profile 缺姓名/学号
- BUILD → 20260702000001

### 扫码登录 429/卡死修复（2026-07-02）
- 限流器按接口隔离计数桶：旧实现全接口共享同一按-IP 计数器，登录后背景轮询（私信 3s/会话 15s）把配额吃光，wechat-qr/poll 误判 429
- poll 限流 5/30 → 5/60；前端轮询 1s → 2s（30次/分留一倍余量）
- done 结果幂等缓存：原来返回 token 前先 closeSession，唯一一次响应被 429/网络丢失 → 下次 poll 404 → 前端死循环"处理中"。现在 result 缓存在 session（只释放浏览器），poll 可幂等重取，5 分钟清理器回收
- 提取锁 extracting：scanned 阶段 goto 15s vs 轮询 2s，并发 poll 会互相打断同一 page 导航导致 500+closeSession
- 前端 429 → rate_limited 本轮跳过；404 → expired 停止轮询提示重新扫码（原来 catch 只 warn 傻轮询到 120 次）
- BUILD → 20260702000002

### 代码审查修复（2026-07-02）
- result 占位改合法响应 `{status:'scanned'}`：原空对象占位若构建报错，并发 poll 拿到无 status 空对象静默死循环；现在并发拿「处理中」，构建失败 closeSession → 404 → expired
- 浏览器及时释放：done 结果缓存后立即 releaseBrowser（原来只在 closeSession 调用，成功登录的 chromium 白占 ~200MB 等 5 分钟清理器）
- 全局浏览器并发上限 MAX_CONCURRENT_BROWSERS=5：限流只按 IP，多 IP 同扫仍可能耗尽内存；超限 wechat-qr 返 503 并记安全日志
- 扫码日志脱敏：onlineInfo/课表 API 原始响应体（含姓名学号 PII）不再落日志，只记字段结构与有无
- 拉黑闭环补全：ChatView 打开时用 blockedList 查真实拉黑状态（原初始恒 false）；ProfileTab 新增「拉黑管理」弹窗——会话列表过滤已拉黑用户，这是唯一的解除入口
- BUILD → 20260702000003

### 成绩/考试自动同步（2026-07-02）
- 新增 grades/exams 表（迁移 029）+ /api/v1/grades /api/v1/exams（academic.ts）；扫码登录同一 Playwright session 顺带抓取课表/成绩/考试，DELETE+INSERT 事务写库，登录响应带 sync 汇总
- gnmkdm 通过用户手动核对菜单链接确认：课表 N2151、学业情况(成绩) N105515、考试安排 N358105
- captureDefaultModuleQuery：拦截页面自己发出的默认查询拿真实 xnm/xqm，比自己猜学期准；课表/成绩/考试三处 fetch 函数都优先走这条路，失败再退回手动猜学期列表
- 成绩/考试改乐观单学期读取：候选学期按顺序试，第一个非空就返回，不再跨学期合并导致新旧数据混杂
- 前端 GradesExamsModal：成绩/考试 tab、学期标签提示条、刷新按钮（重新走一次扫码同步）；ProfileTab 菜单入口
- 顺带修复两个真实生产 bug：① server.ts SPA fallback 把不存在的静态资源也兜底成 index.html，导致 MIME 类型错误——加 STATIC_ASSET_EXT 判断，命中静态资源扩展名就返回 404 而不是 index.html；② deploy.sh 旧版先把 assets 平铺传到 dist/ 根目录再靠远程 mv 归位，mv 失败被 2>/dev/null 吞掉且没有 set -e，导致 index.html 引用的新哈希文件实际没进 assets/——改成直接传到 dist/assets/，去掉 mv 归位步骤
- BUILD → 20260702000004

### 学期编码修正（2026-07-03）
- 根因定位：getSemestersToTry 一直用 xqm=1/2 猜学期，这两个值从来都不是这个学校教务系统的合法编号——后端对无效 xqm 很宽容，返回"结构合法但空"的数据，看着跟"这学期真没数据"一样，才会一直误判
- 证据链：考试模块 captureDefaultModuleQuery 侦察到页面自己默认查询用 xqm=12，查到当前学期 2 条真实数据；早先猜的 xqm=3（当时以为是"暑假学期"）意外查到 5 条，事后证实是上学期(秋季)数据——反过来证明 3 就是秋季合法编号，不是巧合。改为正方系统经典编码：秋=3，春=12
- captureDefaultModuleQuery 加固：原来只取第一个命中 matchPath 的请求就返回，可能被同名的无关请求打断（考试模块疑似遇到过）；改成等完整窗口、收集所有命中，优先选 xqm 落在合法集合(3/12)内的
- 成绩接口切换：AJAX 侦察已确认真实查询接口是 xsxyqk_cxJxzxjhxfyqKcxx.html?gnmkdm=N105515&sf_request_type=ajax（分页结构），改为优先试这个，老的 cjcx_cxDgXscj.html?gnmkdm=N305005 降级为兜底；新增 itemKeys 日志，等真查到数据了核对字段名映射对不对
- BUILD → 20260703000001

### 学期编码修正验证+课表侦察诊断加固（2026-07-03）
- 3/12 编码修正实测生效：成绩改回旧接口 cjcx+xqm=3 查到 14 条（itemKeys 已能看到 kcmc/cj/jd/jsxm 等真实字段名），考试 xqm=12 查到 2 条，均验证通过
- 唯独课表模块的 captureDefaultModuleQuery 仍然完全没命中过（跟考试模块行为不一样），手动猜的 xqm=12/3 也都是 items=0——在没有更多证据前不猜测原因（比如"暑假没课"），先加诊断：命中窗口内没匹配到目标请求时，把这段时间里见到的所有 POST 请求 URL 打出来（命中一个都没有也会单独打一条"没见到任何POST"），下次测试直接看日志就知道是页面根本没自动发起查询、还是查询用了不同的文件名
- 顺带清理了 fetchStudentIdAndSchedule/fetchExams 里跟新诊断重复的旧"回退到手动猜学期"日志行
- BUILD → 20260703000002

### 课表参数缺失修复（2026-07-03）
- 根因：kbcx 手动猜学期查询的请求体只发了 `xnm=&xqm=`，比成绩/考试接口少了 `queryModel.*` 分页参数；而 xqm=3(上学期) 的成绩已经查到 14 门课，证明那学期真的有排课，课表却返回 0 items——因为正方系统课程列表接口需要分页参数（一页默认 20 条），缺了就认成"非法请求"返回空
- 修复：kbcx 的请求体补上 `queryModel.showType` 等分页参数（照抄其他接口的分页值），不需要改伪代码逻辑；加日志区分"查到真实空课表"和"接口返回非法空"两种空结果
- BUILD → 20260703000003

### 扫码登录浏览器预热+断线重连（2026-07-05）
- 慢的根本原因不是 Playwright 慢，是 N100 单核 2.2GHz Celeron 启动 Chromium 要 3-5 秒，用户扫码后要等这 3-5 秒才开始导航到学校 CAS——在用户感知里就是"扫码后转圈好久没反应"
- 修复：①进程启动时就主动预热浏览器（不等第一个真实请求触发），发版重启后浏览器在收到第一个真实请求前大概率已经启动完成；②浏览器意外断开（被系统OOM杀掉等）时通过 `disconnected` 事件主动立即重新拉起，而不是被动等下一个请求触发懒加载；③并发去重——多个请求同时发现浏览器没了，只真正 launch 一次，其余等同一个 promise，避免重复启动
- 诚实说明未解决的部分：navigate 到学校 CAS 登录页本身的网络耗时（学校服务器响应速度、我们服务器到学校的网络路径）不受我们控制，这部分延迟改不掉；上一轮修复新增的"截图体积过小重试最多3次"逻辑在真的遇到慢网络时也会让总耗时变长（这是为了正确性做的取舍，不是本次要解决的对象）
- 还有一个更激进但没做的选项：把 /wechat-qr 里 `browser.newContext()`+`context.newPage()` 也挪到响应之后异步做（目前只有 doCaptureQr 内部的导航截图是异步的，这两步创建仍在响应前同步执行）。这两步创建通常很快（几十到一百多毫秒），不是当前"慢"的主因，而要这么做需要把 ScanSession.context/page 从必填改成可能为空，牵涉后面提取用户信息等一大段依赖 page 非空的逻辑，改动面和回归风险明显更大——权衡后这次没做，如果本次的预热修复验证后还不够快，再考虑

### 加桌面引导重做：安卓补全+顶部横幅+详细教程（2026-07-06）
- 果果反馈两个问题：①目前的引导只做了苹果，安卓没做；②感觉只在首页弹，别的页面看不到
- 根因①：安卓分支完全依赖 `beforeinstallprompt` 事件，但国产安卓浏览器（UC/小米/华为/vivo/oppo/QQ浏览器/夸克/百度等）大多不支持这个事件——等不到就永远不弹，这部分安卓用户实际上从来没收到过任何引导，不是"没做"而是"做了但等不到事件就哑火"
- 根因②：横幅原来贴底部 `bottom-20 z-40`，跟 `BottomNav`（`bottom-0 z-40`）同一 z-index——绘制顺序让 BottomNav 在大多数 Tab 上把横幅压在下面，只是碰巧在首页视觉上没被完全挡住，并非代码里真的做了"只在首页显示"的限制（横幅其实是挂在 App 根节点，不受 Tab 影响）
- 修复：横幅挪到顶部 `top-16`（Header 下方），跟 BottomNav/ScrollToTop 悬浮按钮彻底分开空间，`z-50` 高于两者，不再受绘制顺序影响，所有 Tab 都稳定展示
- 安卓新增 5 秒兜底：监听 `beforeinstallprompt` 的同时起一个兜底计时器，等不到事件就退回手动图文教程（`installMode: manual`）；若之后事件真的迟到才触发，静默升级成原生一键安装按钮，不冲突
- 新增 `getAndroidGuide()` 按 UA 识别当前浏览器（小米/华为/vivo/oppo/QQ浏览器/UC/夸克/三星/百度/其他），给出对应浏览器真实菜单路径的图文步骤，不再是一刀切的通用说法
- iOS 教程也顺带加固：识别非 Safari 的 iOS 浏览器（Chrome/Firefox/Edge/Opera for iOS，UA 含 CriOS/FxiOS/EdgiOS/OPiOS），额外提示"这些浏览器加桌面后仍在原浏览器里开，不是独立 App 体验，建议先用 Safari 打开"——这是 iOS 平台本身的限制，不是我们能修的 bug，但用户应该被提前告知而不是加完桌面发现体验不对
- 保留原有的 14 天关闭静默、standalone 检测、微信/QQ 内置浏览器不打扰这几条抑制规则不变，只改了触发时机、覆盖范围（安卓兜底）和内容详细度
- BUILD → 20260705000002

### R11 通知闭环：私信/上课/考试/出分四场景推送（2026-07-06）
- 果果要求"全部四个一起设计"，对应 Phase 4 通知闭环。推送基建（VAPID/订阅表/发送封装/前端订阅开关）R9.5 已完成，本轮补的是"谁在什么时候调用 sendPushToUser"这四条触发链路
- **通知权限主动引导**：新增 `NotificationPrompt.tsx`，跟 InstallPrompt 同款顶部横幅套路——不能进页面就直接弹浏览器原生权限框（会被判定"低接受率"进而被 Chrome 等浏览器降级/静默未来所有请求），改成先出我们自己的横幅当"预告"，用户点「开启」才真正调用 `Notification.requestPermission()`。iOS 未加桌面（非 standalone）时不显示，交给 InstallPrompt 那条转化路径；已 denied/已 granted/微信QQ内置浏览器/14天内关闭过：不显示。跟加桌面横幅共享"顶部横幅"这一位置：`InstallPrompt.tsx` 新增导出 `isA2hsResolved()`，判断加桌面横幅是否已经/将要占用第一档位置，本横幅据此让位到 `top-32`，不重叠。ProfileTab「消息通知」菜单行新增"已开启/未开启"状态标签（原来只有一个无状态反馈的开关按钮）
- **私信新消息推送**：POST /conversations/:id/messages 插入成功后，异步（不 await）查发送者昵称，调用 `sendPushToUser` 给接收方推送，`tag=dm-${conversationId}` 同会话多条消息互相覆盖不刷屏。私信本身不匿名，标题用昵称没有泄露问题。不用 push_log（同步触发天然不重复）
- **上课提醒 + 考试提醒共用一个全局每分钟 tick**（`src/server/pushScheduler.ts`，server.ts 在 initPush 之后启动，未配置 VAPID 时不启动）：查询先用 `courses/exams JOIN push_subscriptions` 把候选收窄到"订阅了推送的用户"；上课提醒用 termConfig 判断当前学期/周（`source!=='config'` 时不触发——猜出来的学期没有可信周数），**关键设计点**：不能提前按今天星期几过滤课程原始行，因为"从别的星期调到今天"的课在原始行上 weekday 对不上会被漏查，所以是"拉该用户整学期课程 + 本周调课记录 → `applyOverrides` 算出这周实际课表 → 再按今天星期几+时间窗口过滤"，复用已有的 `applyOverrides`/`classTime.periodStartMin` 而不是重新写一遍这套逻辑；命中"距上课还有 19-21 分钟"就推送。考试提醒复用 `examTime.daysUntilExam`，只在 `hour===8&&minute===0` 那一分钟真正跑（省资源），T-7/T-1 各推一次
- **迁移043 push_log 表**：唯一键 `(user_id, push_type, dedup_key)` 防重推——pm2 重启错过整点/tick 抖动导致的补跑重跑，靠这张表的唯一约束兜底而不是靠时间精确对齐；上课提醒 dedup_key=`courseId-日期`，考试提醒=`examId-T7`/`T1`；写入异常时保守跳过（不发），避免异常语义不明时重复轰炸
- **出分提醒**：按计划文档"受限方案"落地——不存教务凭据没法后台自动判定"是否已出分"，做成管理后台手动触发的全量广播（`POST /admin/push/broadcast`，admin.html 新增"推送广播"tab，发送前 `confirm()` 二次确认，注明"不可撤回"）。`push.ts` 新增 `broadcastPush()`，直接查全部 `push_subscriptions` 行发送，不复用按用户查询的 `sendPushToUser`（广播场景没有"单个用户"概念）
- **顺带**：App.tsx 新增极简的推送点击深链——sw.js `notificationclick` 本来就会 `client.navigate(url)`，但前端从来没读过 URL query，点通知永远落回首页。现在启动时解析 `?tab=xxx` 并 `setActiveTab`，处理完立即 `history.replaceState` 清掉避免刷新重复跳转。只做到 Tab 级（落到消息页），没有做到精确定位某条会话——那需要先按会话 id 查详情才能拿到 `openChat` 需要的对方信息，范围更大，先解决"点了通知却落回首页"这个更明显的问题
- BUILD → 20260705000003

### 上课提醒暂缓 + 考前3小时提醒（2026-07-06）
- 果果决定：现在只有十几个用户开了推送订阅（试用阶段），上课提醒先不启动，资源和验证精力先集中在"考试前3小时提醒"这一条上
- `pushScheduler.ts` 新增 `CLASS_REMINDER_ENABLED = false` 常量，`tick()` 里判断这个常量决定要不要跑 `classReminderTick`——代码原样保留不删，以后要开只改这一行
- 新增 `examReminder3hTick`：跟 T-7/T-1 那条"只在每天8点跑一次"不同，考前3小时是分钟级精度，必须每个 60 秒 tick 都检查才能准确捕捉到"还有3小时"这个时刻，所以直接挂在主 `tick()` 里无条件跑（不像上课提醒需要复杂候选收窄——exams 表数据量小，全表扫一次开销可忽略）。用 `examTime.parseExamStart` 精确到分钟算距开考还有多少分钟，命中 180±5 分钟窗口就推送，dedup_key=`examId-T3h`，复用已有的 push_log 防重推。T-7/T-1 两条每日提醒原样保留，没有删除，三档提醒同时生效

### 管理后台：单用户测试推送（2026-07-06）
- 果果要验证推送链路，需要按学号定位一个具体用户单独发一条测试推送——之前只有"广播给全部订阅设备"，没有"只发给一个人"的手段，验证时会打扰到其他试用用户
- 新增 `POST /admin/push/test-user`（adminAuth，学号定位 + 自定义标题/内容），查不到用户返回404、该用户没开通知返回明确提示、发送成功返回实际到达的设备数
- 记 `logger.security`（区别于广播走 business 日志）：定向推送到具体某个人，比广播更适合归到安全审计一类
- **真机验证通过**：果果已在本地提交+deploy.sh部署，推送链路全部成功

### 举报队列可视化排序 + 用户申诉工单（2026-07-06）
- 果果选定 Phase 3 当时留的两个尾巴：举报队列优先级可视化、误判申诉入口
- 迁移044 新建 `report_appeals` 表，唯一键 `(target_type, target_id)` 保证一条内容同时只有一份申诉记录
- `POST /report-appeals`：校验申诉人必须是内容 owner 且内容当前确实处于隐藏状态
- `PUT /admin/report-appeals/:id`：通过=恢复内容可见+批量驳回该内容的 pending/upheld 举报记录
- 优先级可视化：`GET /admin/reports` 每行加 `reportCount`（举报人数）和 `hasPendingAppeal` 信号，支持 `?sort=priority`
- admin.html：举报 tab 加排序切换 + 举报数/申诉中标签；新增「举报申诉」tab
- 前端 ProfileTab「我的发布」StatusBadge 加 under_review + 申诉按钮 + ReportAppealModal
- **circle_post/circle_comment 侧本轮没做**——circles.ts 硬编码 `status = 'active'`，连作者本人都查不到隐藏内容，需先加 owner 查询路径
- BUILD → 20260706000001

### 管理后台补齐：校园圈帖子查看+管理tab（2026-07-06）
- 果果反馈"后台看不到新帖子"——admin.html 的"帖子"tab 只查 `posts` 表，`circle_posts` 是盲区
- 新增 `GET /admin/circle-posts`（JOIN users/circles，管理员不做匿名脱敏）
- 新增 `PUT /admin/circle-posts/:id`（active/hidden/deleted，下架/恢复写 notices 通知作者）
- admin.html 新增「校园圈」tab（内容预览、作者、赞/评论数、状态筛选、下架/恢复）

### 管理后台补齐（续）：校园圈评论查看+管理（2026-07-06）
- 补齐上面遗留的缺口：`circle_comments` 完全照搬 `circle_posts` 模式
- admin.html「校园圈」tab 内加视图切换按钮（帖子/评论），不新增顶层 tab

### 成绩同步修复：不冲掉旧学期真实分数（2026-07-06）
- 根因：`fetchGradesHttp()` 之前只返回第一个命中学期的数据就提前 return；而扫码登录同步执行 `DELETE FROM grades WHERE user_id = ?` 把全部旧成绩抹掉
- 修复：改为 `Map<学期-课程名>` 收集所有学期数据；所有 `DELETE` 改为按学期删除

### getSemestersToTry 春季 xnm 少一年修复（2026-07-06）
- 根因：三个分支的春季学期 xnm 全部少算了一年（春季开始 xnm=当前年，但用了 year-1）
- 修复：month>=9 分支春从 year-1→year；month=1 分支春从 year-2→year-1；2-8月分支春从 year-1→year
