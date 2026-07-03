> **开工前必读**：先读 `/Users/zhenggangzhou/Desktop/memory_backup/记忆库精简版.md`（果果的全局记忆：身份/团队/服务器/密钥/项目/规则），再动手。

# CampusLink — 四川财经职业学院校园信息平台

## 核心原则
1. 长期主义，不写一次性代码、不留技术债
2. 企业级 SOP 闭环：正常/异常/追溯/恢复四条路径
3. 全链路埋点，每个操作有日志、每个错误有堆栈、每个请求有 trace
4. 模块隔离，后端独立注册互不影响；改一处不炸其他地方
5. 治本不治标，代码能跑≠代码对，找根因彻底解决

## 技术栈
React 19 + TypeScript + Vite 8 + TailwindCSS 4 / Express 5 + esbuild CJS / MySQL 8 + mysql2 / JWT + bcrypt / Zod 4 strict

## 部署
- 开发：`npm run dev` / 生产：N100 Ubuntu PM2（`campuslink`），`/home/ubuntu/app/campuslink/`
- 公网：`https://jhcaishui.cn:8443/campus/` / 后台：`https://jhcaishui.cn:8443/campus/admin`
- 构建：`npm run build`（tsc + vite + esbuild）/ 测试：`npx vitest run`
- **一键部署**：`bash deploy.sh`
  - 步骤：构建 → scp 上传 → npm install → 数据库备份 → pm2 restart → 验证
  - 注意：N100 通过 Tailscale SSH 连接（100.117.221.27），如需认证先访问 login.tailscale.com
  - deploy.sh 失败时可用 tar 手工部署：
    ```
    tar czf /tmp/campuslink-dist.tar.gz dist/
    scp /tmp/campuslink-dist.tar.gz ubuntu@100.117.221.27:/home/ubuntu/app/campuslink/
    ssh ubuntu@100.117.221.27 "cd /home/ubuntu/app/campuslink && rm -rf dist && tar xzf campuslink-dist.tar.gz && pm2 restart campuslink"
    ```

## 架构规则
1. 路由模块化：server.ts 仅入口+中间件+迁移，路由独立 safeRegister
2. 统一响应：`ok(res,data)` / `fail(res,status,msg)`，必须带 trace_id
3. 入参必 Zod 校验，别手写 if(!title)
4. 服务端验证：前端检查不算数，服务端再验一次
5. 只改需要的，不加没用过的依赖和抽象

## 安全铁律
- 密钥全部 .env，不上传 GitHub / 密码 bcrypt 哈希
- auth_status: pending→verified→org_verified，管理员审核
- 管理员：学号 202330140113 / 后台：`https://jhcaishui.cn:8443/campus/admin`
- 写接口有限流，敏感词服务端拦截
- 数据库备份 AES-256 加密

## 日志 & 迁移
日志：`logs/{access,error,business,slow,security,health,client}-日期.log`
迁移：`migrations/` SQL 文件按序幂等执行，`_migrations` 表追踪

## 数据库（18 张表）
users / refresh_tokens / posts / favorites / registrations / courses / categories / ads / notices / feedbacks / circles / circle_posts / circle_likes / circle_comments / circle_favorites / conversations / chat_messages / grades / exams / user_blocks / _migrations（迁移到 030）

加密：AES-256-CBC（posts.contact_info、registrations.{registrant_name,student_id,phone}），密钥 ENCRYPTION_KEY，应用层 crypto.ts 加解密

## 前端架构
```
main.tsx → ErrorBoundary → RegistrationProvider → App.tsx（路由分发）
5 Tab：HomeTab / ScheduleTab / PublishTab / MessagesTab / ProfileTab
+ CircleTab / ListingDetail / SearchPage
```
Hooks 模式（无 Redux）：useAppData / useAppActions / useCircles / useOptimistic / useScheduleOCR
组件复用：Modal / Button / Icon / Toast（禁止手写遮罩/button className）
颜色用 Tailwind 语义类名，禁止硬编码 #xxx

## API 路由（/api/v1/）

| 模块 | 端点 | 方法 | 认证 | 限流 |
|------|------|------|------|------|
| auth | /auth/dev-login | POST | — | 5 |
| auth | /auth/refresh | POST | — | 10 |
| auth | /auth/logout | POST | auth | 10 |
| auth | /auth/avatar | POST | auth | 5 |
| auth | /auth/profile | PUT | auth | 10 |
| auth | /auth/password | PUT | auth | 3 |
| auth | /auth/me | GET | auth | 30 |
| auth | /auth/wechat-qr | POST | — | 3/30 |
| auth | /auth/wechat-poll | POST | — | 5/60 |
| posts | /posts | GET/POST | 写需auth | 3 |
| posts | /posts/:id | GET/DELETE | 删需auth | 5 |
| posts | /posts/:id/sold | PUT | auth | 5 |
| posts | /favorites/:postId | POST | auth | 10 |
| posts | /favorites | GET | auth | — |
| posts | /categories | GET | — | — |
| courses | /courses | GET/POST | auth | 50 |
| courses | /courses/terms | GET | auth | — |
| courses | /courses/batch | PUT | auth | 50 |
| courses | /courses/:id | DELETE | auth | 10 |
| schedule | /parse-schedule /ocr-* | POST/GET | auth | 各不同 |
| upload | /upload | POST | auth | 10 |
| registrations | /registrations | GET/POST | auth | 3 |
| circles | /circles /circles/trending | GET | — | — |
| circles | /circles/:id/posts | GET/POST | 写需auth | 3 |
| circles | /circles/:id/posts/:id | DELETE | auth | 10 |
| circles | /circle-posts/:id/like | POST | auth | 20 |
| circles | /circle-posts/:id/comment | POST | auth | 10 |
| circles | /circle-posts/:id/comments | GET | — | — |
| circles | /circle-posts/:id/favorite | POST | auth | 15 |
| circles | /circle-favorites | GET | auth | — |
| messages | /conversations | GET/POST | auth | 30/10 |
| messages | /conversations/unread-count | GET | auth | 60 |
| messages | /conversations/:id/messages | GET/POST | auth | 30/10 |
| messages | /conversations/:id/read | PUT | auth | 20 |
| messages | /users/:id/block | POST/DELETE | auth | 5 |
| messages | /users/blocked | GET | auth | 10 |
| ads | /ads /ads/:id/click | GET/POST | — | — |
| feedback | /feedback | POST | — | 5 |
| health | /health | GET | — | — |
| admin | /admin/* | 全部 | adminAuth | 各不同 |
| notices | /notices | GET/PUT | auth | — |

## 迭代日志

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
- 根因定位：getSemestersToTry 一直用 xqm=1/2 猜学期，这两个值从来都不是这个学校教务系统的合法编号——后端对无效 xqm 很宽容，返回"结构合法但空"的数据，看着跟"这学期真没数据"一模一样，才会一直误判
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
- 根因：kbcx 手动猜学期查询的请求体只发了 `xnm=&xqm=`，比成绩/考试接口少了 `queryModel.*` 分页参数；而 xqm=3(上学期) 的成绩已经查到 14 门课，证明那学期真的有排课，课表却返回空——不是"没课"，是漏了必需参数导致查询没真正执行
- 补齐跟成绩/考试一致的 `_search=false&queryModel.showCount=200&queryModel.currentPage=1&queryModel.sortName=&queryModel.sortOrder=asc&time=0`
- 顺带确认：captureDefaultModuleQuery 对 kbcx 不命中是页面本身设计（渲染学期选择器，等用户点"查询"才发请求，不像考试模块会自动查），不是代码 bug，维持现状（手动猜学期兜底已覆盖）
- BUILD → 20260703000003

### 课表真实接口修正（2026-07-03）
- 根因找到：课表侦察一直没命中是因为 matchPath 猜错了文件名——课表页面真实发出的默认查询是 `xskbcx_cxXsgrkb.html`（学生个人课表），不是之前假设的 `xskbcx_cxXsKb.html`；后者可能根本不是查个人课表的接口，怪不得加了 queryModel 参数也没用
- matchPath 和手动兜底查询 URL 都改成 `xskbcx_cxXsgrkb.html`
- 新接口的真实响应字段名还没见过非空数据验证，`xskbList`/`xsxx` 暂时沿用旧接口的猜测；新增 `describeArrayFields` 工具函数，把响应里所有数组字段的 key 和长度都打出来（不是猜一个字段名对不对，而是列出全部候选），下次真查到课表就能立刻确认字段名对不对，不用再猜一轮
- BUILD → 20260703000004

### 课表字段名+条数排查（2026-07-03）
- 果果已实测确认真实数组字段是 `kbList`（不是猜测的 `xskbList`），课表已经能同步出真实课程；用户手动截图对比学校官网 2026-2027学年第1学期，官网 3 门课，同步进来 2 门，且周次节次显示都变成"第1节"——星期能对上，说明 kbList 里学生/星期字段名猜对了，节次(ksxz/jsz)字段名猜错了
- describeArrayFields 升级：原来只打数组长度，现在把第一项的字段名列表也打出来，一次日志就能看到 kbList 的真实字段名，不用再猜节次字段该叫什么
- 待下一轮真实日志验证：节次字段真实名称、以及为什么 3 门课只同步进 2 门（是查询本身只返回了2条，还是有1条在解析时被跳过）
- 顺带排除一个干扰项：ScheduleTab 界面显示的"2024-2025学年 春季学期/第12周"是页面自己独立算的学期显示（跟这次课表同步无关，是另一套按配置的开学日期算的展示逻辑），不是本次同步链路的问题
- BUILD → 20260703000005

### 课表模块重新设计（2026-07-03）
- 果果的产品决策：课表页仿照教务系统官网做"先选学年+学期，再看课表"的交互，前后端一起重新设计（而不是继续打补丁修字段名）
- 技术落地关键约束：扫码登录的 Playwright 会话结束后没法保持实时连教务系统查询，所以"官网同款筛选"只能是——登录时把近3年+当前学年(⚠️ 注意：正方系统 xnm=学年结束年，xnm=2026 表示 2025-2026学年，formatSchoolTerm 显示为 `${y-1}-${y}学年`)、秋(xqm=3)/春(xqm=12)两个合法编码的全部组合一次性抓完存库，前端选择器筛的是本地已存数据，不是每次都实时查
- 迁移030：courses 表加 school_year/school_term(学期归类) + source(manual/ocr/scan_sync，区分录入来源) + 9个对齐官网信息量的可空字段(campus/class_group/class_composition/exam_method/elective_note/hours_breakdown/weekly_hours/total_hours/credit)；存量数据一次性回填成迁移落地时的"当前学期"
- 后端：fetchStudentIdAndSchedule 整体替换成 fetchAllSchedules，不再是"猜一个学期就够"的乐观策略，改成遍历近3年+下一学年 x 秋/春 共8个组合全部查询存库；DB 同步从"整表清空重灌"改成"只清空/覆盖 source='scan_sync' 的记录"，不再误删手动添加/OCR导入的课程
- 手动添加(POST /courses)和OCR导入(PUT /courses/batch)现在也自动打上 school_year/school_term(新增 currentTerm.ts 算当前学期) + source 标签，才能正确出现在学年学期选择器里；OCR批量导入的清空范围也收窄成只清 source='ocr'
- 新增 GET /courses/terms 返回该用户已同步的学年学期组合（不同年级学生数据不同，选择器选项不能写死）
- 前端 ScheduleTab 加学年+学期下拉选择器（复用已有的周选择器交互风格），课程详情弹窗新增校区/教学班/考核方式/学分等字段的条件展示（只有扫码同步来的课程才有值）；原来靠 localStorage 开学日期猜"学年学期"的展示逻辑被选择器取代，顺带解决了之前"显示2024-2025学年"跟实际不符的问题
- kbList 每项的节次(ksxz/jsz)、新增富字段(xqmc/jxbmc/jxbzc/khfsmc/xkbz/kcxszc/zxs/zzxs/xf)字段名都还是猜测，等真实非空数据验证——describeArrayFields 已经打了完整字段名日志，下次同步到真数据就能核对
- BUILD → 20260703000006

### 课表字段映射确认+落地（2026-07-03）
- 果果用官网真实课程(职业礼仪: 星期三/第5-6节/C103/教学班职业礼仪-0001/1-16周)交叉验证出了 kbList 真实字段：day(0=周日惯例的星期几数字)/jc·jcor·jcs(三个等价的"5-6"节次范围文本)/cdmc(上课地点)/jxbmc(教学班)/kcmc(课程名)，全部改成真实映射，day 需要转换成本项目"1=周一...7=周日"的惯例
- 确认两个真实限制而不是继续猜：①这个批量排课接口不返回教师姓名，sjkList 兜底覆盖率太低(3/43)不足以依赖，教师字段留空好过显示错的；②"对齐官网信息量"的9个字段(校区/教学班组成/考核方式/选课备注/课程学时组成/周学时/总学时/学分)在这个接口的顶层key里完全不存在，官网详情面板是另一个独立查询，扫码会话结束后拿不到，这9个字段暂时留空，数据库字段保留等以后有别的数据源再填
- 清理掉之前"临时"加的调试用日志块，换成一行确认 jxbzc(教学班周次)原始文本格式的permanent诊断（这是唯一还没见过真实值的字段，用宽松正则容错解析）
- BUILD → 20260703000007

### 课表前端加官网同款列表视图（2026-07-03）
- 果果的产品决策：彩色周网格(超级课程表风格)保留为主视图，另加一个仿教务系统官网的"列表"视图，二选一切换，不是二选一替换
- 周视图/日视图/列表 三态切换；列表视图不按周筛选，直接展示选中学年学期的完整课表，按星期分组，每门课卡片内联展示周数/上课地点/教师/校区/教学班/教学班组成/考核方式/选课备注/课程学时组成/周学时/总学时/学分——没有值的字段自动不显示（当前扫码同步的课程只有周数/地点/教学班有值，其余字段等以后有数据源了自动出现）
- 列表视图下隐藏周选择器/回本周/导出按钮（这些是"按周查看"的概念，列表视图看的是整学期，不适用）
- BUILD → 20260703000008

### 课表去重+周视图重写（2026-07-03）
- 果果查库实锤：kbList 接口本身返回重复行，不是我们扫描了两次——同一门课同一时段(星期/节次/周次完全相同)在 2025-12 学期最多重复5条("演讲与口才")，2025-12 膨胀比~2x，2025-3 ~1.7x。入库前按"课程+星期+节次+周次+地点+教学班"组合去重，同组合只留第一条
- 周视图整体重写：节次行数改成按实际课程动态算(不再写死11节，避免超出的课程被压缩/错位)；行高改用 gridTemplateRows 显式声明，隐式行也保证跟其他行一样高；同一天同一时段真的有多门课(非重复，是真冲突)时用"车道"算法横向平分显示，不再简单堆叠互相遮挡
- 去重是入库前处理，已经同步进库的旧重复数据不用单独清理——下次扫码登录时 DELETE+INSERT 会自动用新去重逻辑覆盖
- BUILD → 20260703000009

### 课表字段映射重大修正（2026-07-03）
- 用户截图发现周视图整体错乱(几十门课挤在同一天)，倒查出之前"day=真实星期几"的结论是误判——用职业礼仪(周三)/会计信息系统应用(周五)两门已知不同星期的真实课程交叉对比，发现两者 day 值完全相同，day 其实是"查询当天的日期号"，跟星期几无关，之前只用一个样本验证就下结论，这次两个不同星期的样本才把误判揪出来
- 完整字段确认：`xqj`=真实星期几(1=周一...跟本项目惯例一致，不用转换)、`xm`=教师姓名(之前 describeArrayFields 只列前25个key，刚好把xm截没了误判成"接口不返回教师")、`zcd`=真实周次文本(取代之前误用的jxbzc，jxbzc其实是教学班相关文本不是周次)
- 顺带配齐大部分官网富字段：`xqmc`=校区、`khfsmc`=考核方式、`kcxszc`=课程学时组成、`zhxs`=周学时、`zxs`=总学时、`xf`=学分；教学班组成/选课备注这两个还没找到对应字段，暂时留空
- describeArrayFields 的 key 截断上限从25提到45，避免同样的"字段存在但被截断误判成不存在"再犯
- 去重逻辑同步改用 xqj/zcd 这两个真正正确的字段做去重键（之前用 day/jxbzc 能凑巧去重成功，是因为对同一批真重复行这两个字段碰巧保持一致，不是本质正确）
- BUILD → 20260703000010

### zcd 周次多段解析修正（2026-07-03）
- 用户自查根因：xqj 星期映射本身没问题，问题是 zcd 原文格式远比"起始周-结束周"复杂——逗号分隔多段范围(如"3-4周,6-11周,13-19周")、每段可选"(单)/(双)"限定该段内只走单/双周、单周不带括弧(如"17周")；旧正则 `zcText.match(/(\d+)[-~](\d+)/)` 只取第一段起止，后面的段和单双周信息全部丢失，导致"周视图课程挤在一起(以为冲突)"和"周次范围显示错误"这两个症状，本质是同一个 bug
- 新增 `parseWeekPattern()`：按逗号切分每一段，段内识别"单/双"字样只对该段生效，展开成具体周次数字集合（Set 去重+排序），不再假设整体只有一种单双周规则
- 迁移031：courses 表新增 week_pattern(原始文本，展示用，跟官网一模一样) + active_weeks(JSON 数组，解析出的具体周次，筛选用) 两个字段；旧的 week_start/week_end/week_type(all/odd/even) 保留兜底给手动/OCR录入的课程（没有这个粒度）
- 前端 Course 类型加 weekPattern/activeWeeks；ScheduleTab 周过滤逻辑改为优先用 `activeWeeks.includes(selectedWeek)` 判断"这周有没有这门课"，没有 activeWeeks 时才退回旧的起止周比较；列表视图和详情弹窗的周次展示改成优先显示 weekPattern 原文，笼统的"单周/双周"标签在有 weekPattern 时隐藏（避免跟分段单双周信息矛盾）
- BUILD → 20260703000011
