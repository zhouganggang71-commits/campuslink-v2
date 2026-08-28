/**
 * 内容运营静态配置（R12 Phase 1，对标竞品链千校）
 *
 * 宫格项 = 前端静态配置表：sub_category → 中文标签 + lucide 图标名（Icon.tsx 注册）+ course 色盘
 * 设计决策：运营换图标/文案是低频需求，静态映射零依赖零接口；
 * 要自定义时再升级为后台上传（本期不做，避免过度设计）。
 */

export interface ServiceItem {
  /** contents.sub_category */
  sub: string;
  label: string;
  /** Icon.tsx 注册的图标名 */
  icon: string;
  /** course 十二色盘 token 类（bg-xxx/10 + text-xxx） */
  color: string;
}

/** 首页分类宫格（对标链千校宫格：紧凑、入口多、一目了然） */
export const SERVICE_ITEMS: ServiceItem[] = [
  { sub: 'life', label: '生活服务', icon: 'shopping_bag', color: 'bg-course-blue/10 text-course-blue' },
  { sub: 'transfer', label: '转专业', icon: 'file_text', color: 'bg-course-green/10 text-course-green' },
  { sub: 'contest', label: '竞赛证书', icon: 'award', color: 'bg-course-orange/10 text-course-orange' },
  { sub: 'study', label: '日常学业', icon: 'book_open', color: 'bg-course-purple/10 text-course-purple' },
  { sub: 'love', label: '恋爱社交', icon: 'favorite', color: 'bg-course-red/10 text-course-red' },
  { sub: 'scholarship', label: '奖助学金', icon: 'verified', color: 'bg-course-gold/10 text-course-gold' },
  { sub: 'phone', label: '部门电话', icon: 'contact_phone', color: 'bg-course-cyan/10 text-course-cyan' },
];

/** 「更多」箭头下拉展开的更多服务入口（对标链千校"更多服务"区） */
export const SERVICE_EXTRA_ITEMS: { key: string; label: string; icon: string; color: string }[] = [
  { key: 'calendar', label: '校历查询', icon: 'calendar', color: 'bg-course-indigo/10 text-course-indigo' },
  { key: 'schedule', label: '课表查询', icon: 'schedule', color: 'bg-course-magenta/10 text-course-magenta' },
  { key: 'all', label: '全部文章', icon: 'apps', color: 'bg-course-brown/10 text-course-brown' },
];

/** contents.category 中文标签 */
export const CONTENT_CATEGORY_LABELS: Record<string, string> = {
  newcomer: '新生必看',
  campus_intro: '校园介绍',
  services: '生活服务',
  calendar: '校历',
};

/** sub_category 中文标签（列表页副标题/更多服务宫格） */
export const SUB_CATEGORY_LABELS: Record<string, string> = {
  // newcomer
  dorm: '宿舍生活',
  checklist: '必备清单',
  route: '到校路线',
  network: '校园网络',
  food: '餐饮美食',
  report: '报道流程',
  exam: '入学考试',
  club: '社团部门',
  military: '军训攻略',
  wall: '校园表白墙',
  // campus_intro
  scenery: '校园风光',
  major: '学院专业',
  // services
  life: '生活服务',
  transfer: '转专业',
  contest: '竞赛证书',
  study: '日常学业',
  love: '恋爱社交',
  scholarship: '奖助学金',
  phone: '部门电话',
  banner: '轮播',
  // calendar
  term: '学期校历',
};
