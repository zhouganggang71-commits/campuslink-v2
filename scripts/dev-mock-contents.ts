/**
 * dev-only 内容运营 mock（本地预览用）
 *
 * 背景：本地 `npm run dev` 的 API 代理到生产 jhcaishui.cn，而生产尚未部署
 * contents 路由（迁移 045/046 未跑），导致本地看不到首页运营区数据。
 * 此 mock 在 vite dev server 拦截 /campus/api/v1/contents* 返回与
 * migrations/046_seed_contents.sql 一致的数据，让果果本地直接看效果。
 *
 * ⚠️ 注意：
 *   1. 仅 vite dev 生效，生产 build 产物完全不含此文件
 *   2. 字段格式 = 后端 contents 表行（snake_case），前端 toContent() 转换
 *   3. 改内容请同步 migrations/046_seed_contents.sql（上线以 seed 为准）
 */
export const MOCK_CONTENTS: any[] = [
  // ── 新生必看 newcomer ──
  { id: 1, category: 'newcomer', sub_category: 'dorm', title: '宿舍生活指南', summary: '入住须知、作息与安全', cover_url: '/campus/dev-img/cover-campus.jpg', body: '<h2>入住流程</h2><p>报到后凭入住单到宿舍楼领取钥匙/门禁卡，按床位入住。具体安排以学校迎新系统通知为准。</p><h2>宿舍分布</h2><p>校内主要宿舍：德馨苑、蕙兰苑、弘毅苑、博学苑（详见校内地图）。</p><h2>作息与安全</h2><p>宿舍有统一熄灯/门禁时间，请留意楼栋公告。严禁使用大功率违禁电器，注意用电安全。</p>', body_type: 'html', sort_order: 1, status: 'published', view_count: 128, updated_at: '2026-08-14 22:00:00' },
  { id: 2, category: 'newcomer', sub_category: 'checklist', title: '新生必备清单', summary: '报到要带什么，看这一篇', cover_url: '/campus/dev-img/cover-food.jpg', body: '<h2>证件类</h2><p>录取通知书、身份证及复印件、证件照（一寸/两寸各备几张）、团员/党员档案材料。</p><h2>生活类</h2><p>床上用品（学校或自备）、洗漱用品、换洗衣物、常用药品、充电器充电宝。</p>', body_type: 'html', sort_order: 2, status: 'published', view_count: 96, updated_at: '2026-08-14 22:00:00' },
  { id: 3, category: 'newcomer', sub_category: 'route', title: '到校路线与校内导航', summary: '怎么来学校 + 校内地标地图', cover_url: '/campus/dev-img/cover-map.png', body: '<h2>交通建议</h2><p>具体交通路线（地铁/公交/自驾）请以学校官方迎新指南为准，报到期间学校通常会在地铁站/车站设迎新点。</p><h2>报到当天</h2><p>尽量选择上午到校，预留排队办理时间。行李多可以提前邮寄到学校。</p><h2>校内主要地标</h2><p>大门：北门、南门</p><p>宿舍：德馨苑、蕙兰苑、弘毅苑、博学苑</p><p>食堂：聚香苑、沁香苑</p><p>教学楼：至诚楼、明德楼、知行楼、致能楼</p><p>场馆：图书馆、阳光体育馆、田径场、足球场、篮球场、排球场、网球场、乒乓球场</p><p>广场：风华广场、精算广场、博雅广场、悦动广场、经世广场</p>', body_type: 'html', sort_order: 3, status: 'published', view_count: 85, updated_at: '2026-08-14 22:00:00' },
  { id: 4, category: 'newcomer', sub_category: 'network', title: '校园网络', summary: '校园网/上网怎么开通', cover_url: '/campus/dev-img/cover-campus.jpg', body: '<h2>校园网开通</h2><p>报到时可在服务点办理校园网，或咨询信息化部门开通流程。具体资费和覆盖范围以学校官方通知为准。</p><h2>校园服务</h2><p>教务系统、课表查询、成绩查询等校内服务，登录校园网后即可访问。CampusLink 扫码登录可自动同步课表/成绩。</p>', body_type: 'html', sort_order: 4, status: 'published', view_count: 62, updated_at: '2026-08-14 22:00:00' },
  { id: 5, category: 'newcomer', sub_category: 'food', title: '食堂餐饮指南', summary: '食堂分布与价格参考', cover_url: '/campus/dev-img/cover-food.jpg', body: '<h2>食堂分布</h2><p>校内主要食堂：聚香苑、沁香苑；另有青年食堂等就餐点（详见校内地图）。</p><h2>早餐参考价</h2><p>营养粥 2.5 元、煎饺 3.5 元、油条 0.6 元/根、卤蛋 1.5 元、韭菜盒子 2.5 元、酸奶麻花 4 元、肉饼 4 元、双椒鸡蛋饼 3.5 元、南瓜饼 1.5 元/个。</p><h2>正餐参考</h2><p>自选小炒 1.98 元/两（大厨现炒、新鲜美味）；青年食堂卤肉饭；还有饺子、冰粉等小吃。</p><p>价格仅供参考，以食堂窗口实际为准。用餐高峰期（11:30-12:30）建议错峰。</p>', body_type: 'html', sort_order: 5, status: 'published', view_count: 71, updated_at: '2026-08-14 22:00:00' },
  { id: 6, category: 'newcomer', sub_category: 'report', title: '新生报到流程', summary: '从校门到宿舍的全流程', cover_url: '/campus/dev-img/cover-campus.jpg', body: '<h2>报到流程</h2><p>①按迎新系统提示到指定报到点 → ②出示录取通知书核验身份 → ③领取入住单/校园卡 → ④办理宿舍入住 → ⑤参加班级/院系入学教育。</p><p>具体环节以学校官方通知为准，遇到问题找现场志愿者（学长学姐）最快。</p>', body_type: 'html', sort_order: 6, status: 'published', view_count: 153, updated_at: '2026-08-14 22:00:00' },
  { id: 7, category: 'newcomer', sub_category: 'exam', title: '入学考试与摸底', summary: '入学后要考试吗', cover_url: '/campus/dev-img/cover-fund.png', body: '<p>部分专业/班级入学后可能有英语或专业课摸底测试，用于分班参考，具体以院系通知为准。</p><p>不用紧张，摸底测试一般不影响毕业，认真对待即可。后续期末考试的安排可以在 CampusLink 的成绩/考试模块查看。</p>', body_type: 'html', sort_order: 7, status: 'published', view_count: 44, updated_at: '2026-08-14 22:00:00' },
  { id: 8, category: 'newcomer', sub_category: 'club', title: '社团与部门', summary: '学生会、社团怎么加入', cover_url: '/campus/dev-img/cover-campus.jpg', body: '<h2>学生组织</h2><p>学校有校学生会及会计学院、财税学院、金融学院、信息学院等院级学生会，招新通常在开学后集中进行。</p><h2>加入建议</h2><p>关注班级群和校园公告，报名参加宣讲会。选择 1-2 个真正感兴趣的组织，避免贪多影响学业。</p>', body_type: 'html', sort_order: 8, status: 'published', view_count: 58, updated_at: '2026-08-14 22:00:00' },
  { id: 9, category: 'newcomer', sub_category: 'military', title: '军训攻略', summary: '军训要准备什么', cover_url: '/campus/dev-img/cover-map.png', body: '<h2>军训时间</h2><p>一般在开学后安排，具体时间和时长以学校通知为准。</p><h2>必备物品</h2><p>防晒霜、水壶、舒适的鞋垫、纸巾。军训期间注意补水，身体不适及时向教官/辅导员报告，不要硬撑。</p>', body_type: 'html', sort_order: 9, status: 'published', view_count: 112, updated_at: '2026-08-14 22:00:00' },
  { id: 10, category: 'newcomer', sub_category: 'wall', title: '校园表白墙', summary: '想说什么，来这里', cover_url: '/campus/dev-img/cover-transfer.png', body: '<p>表白墙是大家表达心声、分享校园生活的地方——表白、祝福、吐槽、寻物都欢迎。</p><p>请遵守社区规则：不攻击他人、不泄露隐私、不刷屏。CampusLink 匿名树洞圈子也支持匿名发言哦。</p>', body_type: 'html', sort_order: 10, status: 'published', view_count: 39, updated_at: '2026-08-14 22:00:00' },
  // ── 校园介绍 campus_intro ──
  { id: 11, category: 'campus_intro', sub_category: 'scenery', title: '校园风光', summary: '遇见校园，从这里开始', cover_url: '/campus/dev-img/cover-campus.jpg', body: '<h2>校园印象</h2><p>本学院是一所以财经商贸类专业为主的高职院校，校园环境优美，教学楼、图书馆、实训中心一应俱全。</p><h2>校训</h2><p><strong>理财至诚 精业致能</strong></p><h2>主要地标</h2><p>图书馆、阳光体育馆、至诚楼、明德楼、知行楼、致能楼、风华广场、精算广场、田径场等。</p><p>更多校园实景照片，欢迎在 CampusLink 圈子里分享你拍的校园。</p>', body_type: 'html', sort_order: 1, status: 'published', view_count: 67, updated_at: '2026-08-14 22:00:00' },
  { id: 12, category: 'campus_intro', sub_category: 'major', title: '学院与专业', summary: '探索专业世界', body: '<h2>二级学院</h2><p>学校设有会计学院、财税学院、金融学院、信息学院、通识与人文教育学院、马克思主义学院、继续教育学院。</p><h2>专业方向</h2><p>以会计、财务、税务、金融等财经商贸类专业为主，具体招生专业以当年学校招生简章为准。</p><p>想了解某个专业的课程/就业情况，可以在圈子"学业互助"发帖问学长学姐。</p>', body_type: 'html', sort_order: 2, status: 'published', view_count: 89, updated_at: '2026-08-14 22:00:00' },
  // ── 生活服务 services ──
  { id: 13, category: 'services', sub_category: 'life', title: '生活服务', summary: '校园生活一站式指引', body: '<h2>常用服务</h2><p>校园卡充值、宿舍报修、快递代收、打印复印等生活服务，具体办理地点和方式以校内指引为准。</p><h2>校园互助</h2><p>失物招领、拼车出行、二手交易都可以在 CampusLink 信息广场发布，大家互帮互助。</p>', body_type: 'html', sort_order: 1, status: 'published', view_count: 53, updated_at: '2026-08-14 22:00:00' },
  { id: 14, category: 'services', sub_category: 'transfer', title: '转专业指南', summary: '转专业实施办法要点', cover_url: '/campus/dev-img/cover-transfer.png', body: '<h2>基本原则</h2><p>依据《学生转专业实施办法（试行）》（〔2025〕73号）：</p><ul><li>公开公平：公开条件、程序、结果，公平考核录取</li><li>促进发展：为有专业基础和兴趣特长的学生提供发展机会</li><li><strong>控制总量：各专业转出/接收人数原则上控制在专业本年级总人数的 10% 以内</strong></li><li>择优录取：申请转入人数超过接收名额时，考核择优录取</li></ul><h2>大致流程</h2><p>①教务处发布转专业整体方案 → ②二级学院发布本学院实施细则（拟接收人数/考核方式/时间/咨询电话）→ ③学生申请 → ④考核 → ⑤公示 → ⑥学校发文、学籍调整、学信网同步。</p><p>具体时间窗口、申请条件和考核内容以教务处/二级学院当年通知为准。</p>', body_type: 'html', sort_order: 2, status: 'published', view_count: 76, updated_at: '2026-08-14 22:00:00' },
  { id: 15, category: 'services', sub_category: 'contest', title: '竞赛与证书', summary: '证书竞赛学分抵免指南', cover_url: '/campus/dev-img/cover-transfer.png', body: '<h2>证书抵免学分</h2><p>依据《课程学分抵免管理办法》（〔2024〕86号）：考取与专业相关的职业资格证书、1+X 证书等，可申请抵免相应课程学分。<strong>每项证书最多抵免 2 门课、不超过 8 学分</strong>，成绩以 80 分计。</p><h2>四六级成绩换算</h2><p>通过英语四级/六级可抵免相应课程学分：四级按 80 + (分数/710×100-60)×1.2，六级按 80 + (分数/710×100-60)×1.5（不超过 100 分）。</p><h2>竞赛获奖</h2><p>国家级职业技能大赛等获奖可申请抵免相关课程学分，成绩按 85 分计（课程考核低于 85 分可申请按 85 计）；省级比赛累计抵免不超过 4 学分，按 70 分计。</p><h2>论文与成果</h2><p>以第一作者发表专业论文/作品，可申请免修相关专业课或抵免学分，第一参与人抵免 6 学分，累计不超过 10 学分。</p><h2>入伍经历</h2><p>退伍复（入）学后可获得 25 个奖励学分，用于抵免一学期课程学分或任意不合格课程学分。</p><p>详细认定以创新创业学院细则为准。</p>', body_type: 'html', sort_order: 3, status: 'published', view_count: 94, updated_at: '2026-08-14 22:00:00' },
  { id: 16, category: 'services', sub_category: 'study', title: '日常学业', summary: '学分抵免与创新创业学分', cover_url: '/campus/dev-img/cover-fund.png', body: '<h2>学分抵免制度</h2><p>本校实行课程学分抵免：考取证书、竞赛获奖、发表论文、创新创业成果、入伍经历等都可以申请抵免学分（详见"竞赛证书"栏目）。</p><h2>创新创业成果学分</h2><p>依据《创新创业成果学分认定细则》：</p><ul><li>发明专利（第一作者）计满 5 分</li><li>计算机软件著作权、公开发表论文、大创项目结项等可获相应学分</li><li>同一项目不累加，只记最高分值；集体与个人奖项重复取最高</li></ul><h2>认定流程</h2><p>学生申请 → 二级学院初审 → 创新创业学院认定 → 教务处核查。材料须真实，弄虚作假取消所得学分。</p><h2>课表与成绩</h2><p>CampusLink 扫码登录教务系统后，课表、成绩、考试安排自动同步，不用再手动录入。</p>', body_type: 'html', sort_order: 4, status: 'published', view_count: 45, updated_at: '2026-08-14 22:00:00' },
  { id: 17, category: 'services', sub_category: 'love', title: '恋爱社交', summary: '校园社交指南', body: '<h2>认识新朋友</h2><p>新生入学是社交的黄金期——同专业伙伴、社团活动、校园活动都是认识朋友的好机会。</p><h2>校内寻伴</h2><p>在 CampusLink 可以按院系/专业找到同专业伙伴，拓展你的校园社交圈。</p>', body_type: 'html', sort_order: 5, status: 'published', view_count: 33, updated_at: '2026-08-14 22:00:00' },
  { id: 18, category: 'services', sub_category: 'scholarship', title: '奖助学金政策', summary: '资助政策一览', cover_url: '/campus/dev-img/cover-fund.png', body: '<h2>校内奖学金</h2><p>一等奖学金 400 元（综合素质测评前 4%）、二等奖学金 300 元（前 30%）、三等奖学金 200 元，获奖比例约 20%。</p><h2>临时困难补助</h2><p>遭遇意外伤害、突发急重病、父母亡故、自然灾害影响等，可申请 4000 元/人或 2000 元/人的临时困难补助。</p><h2>勤工助学</h2><p>每小时 12 元，每生每月不超过 480 元，全校约 260 个岗位，需本人生活俭朴、学习刻苦。</p><h2>其他资助</h2><ul><li>自强之星奖学金：500 元/人（励志典型，全校 10 人）</li><li>绿色通道：家庭特别困难新生可先办理入学手续再缓缴学费住宿费</li><li>帮困金：本人突发重大疾病或家庭变故 2000 元/人</li><li>就业资助：家庭经济困难毕业生一次性 600 元/人</li></ul><p>具体条件和申请时间以学校最新文件为准，材料提前准备。</p>', body_type: 'html', sort_order: 6, status: 'published', view_count: 81, updated_at: '2026-08-14 22:00:00' },
  { id: 19, category: 'services', sub_category: 'phone', title: '部门电话', summary: '常用联系方式', body: '<h2>校内联系方式</h2><p>各学院办公室、教务处、学生处、后勤等部门的官方联系方式，请通过学校官网"机构设置"栏目或新生手册查询，以官方公布为准。</p><p>紧急情况：校内保卫处电话请存好；校外报警 110、急救 120。</p>', body_type: 'html', sort_order: 7, status: 'published', view_count: 27, updated_at: '2026-08-14 22:00:00' },
  // ── 首页 Banner services/banner ──
  { id: 20, category: 'services', sub_category: 'banner', title: '欢迎新同学', summary: '新学期 · 新起点 · 新未来', cover_url: '/campus/dev-img/cover-campus.jpg', body: '<p>欢迎来到本学院，CampusLink 陪你度过校园时光。</p>', body_type: 'html', sort_order: 1, status: 'published', view_count: 0, updated_at: '2026-08-14 22:00:00' },
  { id: 21, category: 'services', sub_category: 'banner', title: '课表成绩扫码同步', summary: '扫码登录，课表成绩自动同步', cover_url: '/campus/dev-img/cover-campus.jpg', body: '<p>再也不用手动录入课表，扫码登录教务系统一步到位。</p>', body_type: 'html', sort_order: 2, status: 'published', view_count: 0, updated_at: '2026-08-14 22:00:00' },
  { id: 22, category: 'services', sub_category: 'banner', title: '新生必看', summary: '宿舍、报到、军训全攻略', cover_url: '/campus/dev-img/cover-map.png', body: '<p>新生入学指南合集，点击首页"新生必看"查看全部。</p>', body_type: 'html', sort_order: 3, status: 'published', view_count: 0, updated_at: '2026-08-14 22:00:00' },
  // ── 校历 calendar ──
  { id: 23, category: 'calendar', sub_category: 'term', title: '2026-2027学年 第一学期校历', summary: '正式校历：报到/行课/考试/军训安排', body: '{"termName":"2026-2027学年 第一学期","startDate":"2026-08-31","endDate":"2027-01-17","holidays":[{"name":"中秋节","start":"2026-09-25","end":"2026-09-25"},{"name":"国庆节","start":"2026-10-01","end":"2026-10-07"},{"name":"元旦","start":"2027-01-01","end":"2027-01-03"}],"examWeeks":[{"name":"新生期末统考","weekStart":18,"weekEnd":18},{"name":"老生期末统考","weekStart":19,"weekEnd":19}],"notes":"新生报到8/29-8/30；老生报到8/30；8/31正式行课；补考9/5-9/6；自主重修考试11/14-11/15；大学英语四六级12/12；新生军训1/4-1/17。节假日以党政办通知为准，2027除夕2/5、元宵2/20"}', body_type: 'calendar_json', sort_order: 1, status: 'published', view_count: 0, updated_at: '2026-08-14 22:00:00' },
];

/** 按后端 contents 路由的返回结构构造响应 */
export function mockContentsResponse(url: string): { status: number; body: any } | null {
  // /campus/api/v1/contents/banner
  if (url.endsWith('/contents/banner')) {
    const rows = MOCK_CONTENTS.filter((c) => c.category === 'services' && c.sub_category === 'banner' && c.status === 'published')
      .sort((a, b) => a.sort_order - b.sort_order)
      .slice(0, 5);
    return { status: 200, body: { code: 0, message: 'ok', data: rows } };
  }
  // /campus/api/v1/contents/:id
  const idMatch = url.match(/\/contents\/(\d+)$/);
  if (idMatch) {
    const row = MOCK_CONTENTS.find((c) => c.id === Number(idMatch[1]) && c.status === 'published');
    return row
      ? { status: 200, body: { code: 0, message: 'ok', data: row } }
      : { status: 404, body: { code: -1, message: '内容不存在', data: null } };
  }
  // /campus/api/v1/contents?category=...
  if (url.includes('/contents')) {
    const u = new URL(url, 'http://localhost');
    const category = u.searchParams.get('category') || '';
    const pageSize = Number(u.searchParams.get('pageSize') || 20);
    const rows = MOCK_CONTENTS.filter((c) => (!category || c.category === category) && c.status === 'published' && c.sub_category !== 'banner')
      .sort((a, b) => a.sort_order - b.sort_order)
      .slice(0, pageSize);
    return { status: 200, body: { code: 0, message: 'ok', data: { list: rows, total: rows.length, page: 1, pageSize } } };
  }
  return null;
}
