export const DEPARTMENTS = [
  '会计学院',
  '财税学院',
  '金融学院',
  '信息学院',
  '通识与人文教育学院',
  '马克思主义学院',
  '继续教育学院',
] as const;

export type Department = (typeof DEPARTMENTS)[number];

// 校级 + 院级学生会
export const ORGANIZATIONS = [
  '校学生会',
  '会计学院学生会',
  '财税学院学生会',
  '金融学院学生会',
  '信息学院学生会',
] as const;

export type Organization = (typeof ORGANIZATIONS)[number];

// 学生干部职位
export const POSITIONS = ['主席', '副主席', '部长', '副部长', '干事', '成员'] as const;

export type Position = (typeof POSITIONS)[number];

// 校院级别
export const ORG_LEVELS = ['校级', '院级'] as const;
export type OrgLevel = (typeof ORG_LEVELS)[number];

// 课程颜色（前后端共用）— 十二色盘循环分配，导入课表时颜色更丰富、区分度更高
export const COURSE_COLORS = [
  'bg-course-blue text-white',
  'bg-course-magenta text-white',
  'bg-course-green text-white',
  'bg-course-orange text-white',
  'bg-course-indigo text-white',
  'bg-course-gold text-on-surface',
  'bg-course-purple text-white',
  'bg-course-cyan text-white',
  'bg-course-red text-white',
  'bg-course-lime text-on-surface',
  'bg-course-volcano text-white',
  'bg-course-yellow text-on-surface',
  'bg-course-grey text-white',
] as const;

export interface Listing {
  id: string;
  title: string;
  price?: number;
  originalPrice?: number;
  description: string;
  imageUrls: string[];
  category: string;
  postType: 'sell' | 'lost' | 'found' | 'carpool' | 'job' | 'activity' | 'study';
  publisherId: number;
  publisherName: string;
  publisherAvatar: string;
  /** 发帖人性别 — 仅当对方主动公开时才有值，默认不展示 */
  publisherGender?: 'male' | 'female' | null;
  isVerifiedStudent: boolean;
  isOfficialOrg: boolean;
  orgName?: string;
  department?: Department;
  publisherOrgLevel?: string;
  publisherPosition?: string;
  publishedTimeText: string;
  views: number;
  favorites: number;
  contactInfo?: string;
  // under_review：因被多人举报自动/人工软隐藏，作者本人可见并可申诉（见 ReportAppealModal）
  status: 'active' | 'sold' | 'pending' | 'rejected' | 'closed' | 'under_review';
}

/** 内容运营（contents 表，R12 Phase 1）— 后端返回 snake_case 行，前端用 toContent() 转 camelCase */
export interface Content {
  id: number;
  category: 'newcomer' | 'campus_intro' | 'services' | 'calendar';
  subCategory: string;
  title: string;
  summary: string;
  coverUrl: string | null;
  resourceUrl: string | null;
  resourceName: string;
  body: string;
  bodyType: 'html' | 'calendar_json';
  sortOrder: number;
  status: 'draft' | 'published' | 'archived';
  viewCount: number;
  createdAt: string;
  updatedAt: string;
}

/** 校历结构化 JSON（body_type=calendar_json 的正文） */
export interface CalendarJson {
  termName: string;
  startDate: string;
  endDate: string;
  holidays: { name: string; start: string; end: string }[];
  examWeeks: { name: string; weekStart: number; weekEnd: number }[];
  /** 重要安排备注（报到/军训/考试等文字说明） */
  notes?: string;
}

/** 面交交易（R12 Phase 2） */
export interface Transaction {
  id: number;
  postId: number;
  sellerId: number;
  buyerId: number;
  status: 'pending' | 'code_issued' | 'completed' | 'cancelled' | 'disputed';
  faceCode: string | null;
  codeExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  // 联表信息
  postTitle: string;
  postPrice: number | null;
  postImages: string[] | null;
  otherName: string;
  otherAvatar: string | null;
  myRole: 'seller' | 'buyer';
}

/** 用户信誉（R12 Phase 2） */
export interface Reputation {
  userId: number;
  nickname: string;
  reputationScore: number;
  reviewCount: number;
  reviews: { rating: number; comment: string; createdAt: string; reviewerName: string }[];
}

/** 举报申诉状态（GET /report-appeals/mine 返回，仅内容作者本人能查到自己的） */
export interface ReportAppeal {
  status: 'pending' | 'approved' | 'rejected';
  appealText: string;
  adminNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface Course {
  id: string;
  name: string;
  teacher: string;
  classroom: string;
  weekday: number;
  startPeriod: number;
  periodSpan: number;
  weekStart: number; // 起始周，如 1
  weekEnd: number; // 结束周，如 18
  weekType: 'all' | 'odd' | 'even';
  courseType: 'theory' | 'lab' | 'elective';
  colorClass: string;
  note?: string;
  isFinished?: boolean;
  // ── 学年学期归类 + 对齐教务系统官网信息量（都是可选字段，手动添加的老数据可能没有）──
  schoolYear?: string | null; // 正方 xnm：学期开始所在自然年（秋=2026→2026-2027学年；春=2026→2025-2026学年，学年标签减一，见 utils/schoolTerm.ts）
  schoolTerm?: string | null; // 学期编码：3=秋季学期 12=春季学期
  source?: 'manual' | 'ocr' | 'scan_sync';
  campus?: string | null;
  classGroup?: string | null; // 教学班
  classComposition?: string | null; // 教学班组成
  examMethod?: string | null; // 考核方式
  electiveNote?: string | null; // 选课备注
  hoursBreakdown?: string | null; // 课程学时组成
  weeklyHours?: string | null; // 周学时
  totalHours?: string | null; // 总学时
  credit?: string | null; // 学分
  // zcd 原始格式远比"起始周-结束周"复杂（逗号分隔多段+逐段单双周），weekStart/weekEnd/weekType 装不下，
  // 有 activeWeeks 时以它为准判断"第N周是否有课"，weekPattern 是官网原文本用于展示
  weekPattern?: string | null; // 原始周次文本，如 "3-4周,6-11周,13-19周"
  activeWeeks?: number[] | null; // 解析出的具体周次数组
  /** 渲染期临时标记（applyOverrides 填充，不入库）：本节课是被调进来的 */
  overrideMoved?: boolean;
}

/** 单次调课记录：某课程某一周的一节课 → 停课 或 挪到目标时间 */
export interface CourseOverride {
  id: number;
  courseId: string;
  week: number;
  action: 'cancel' | 'move';
  toWeek?: number | null;
  toWeekday?: number | null;
  toStartPeriod?: number | null;
  toPeriodSpan?: number | null;
  toClassroom?: string | null;
}

export interface Message {
  id: string;
  title: string;
  content: string;
  timeText: string;
  category: 'approval' | 'official' | 'registration' | 'circle_like' | 'circle_comment' | 'circle_reply';
  status: 'approved' | 'rejected' | 'update' | 'event';
  isRead: boolean;
  targetType?: 'circle_post' | 'circle_comment' | null;
  targetId?: number | null;
}

/** 互动消息分类（点赞/评论/回复），跟其他通知区分开单独展示 */
export const INTERACTION_CATEGORIES = ['circle_like', 'circle_comment', 'circle_reply'] as const;

export interface ReportInput {
  targetType: 'post' | 'circle_post' | 'circle_comment' | 'chat_message';
  targetId: number;
  reason: '骚扰' | '色情低俗' | '诈骗' | '人身攻击' | '虚假信息' | '其他';
  reasonDetail?: string;
}

export interface StudentProfile {
  fullName: string;
  studentId: string;
  department: string;
  orgLevel: OrgLevel;
  orgName: string;
  position: Position | '';
  avatarUrl: string;
  coverUrl: string;
  bio: string;
  isVerified: boolean;
  isAdmin: boolean;
  postsCount: number;
  savedCount: number;
  gender: 'male' | 'female' | null;
  genderVisible: boolean;
}

export interface Notice {
  id: string;
  title: string;
  source: string;
  isOfficial: boolean;
  link?: string;
}

export interface Registration {
  id: string;
  listingId: string;
  listingTitle: string;
  registrantName: string;
  studentId: string;
  department: string;
  phone: string;
  registeredAt: string;
}

export interface Conversation {
  id: number;
  otherUser: {
    id: number;
    nickname: string;
    avatarUrl: string;
    lastActive?: string | null;
  };
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  /** 'pending' = 陌生人首次会话待接受，'active' = 已正常聊天。旧数据/未迁移时缺省为 active */
  status?: 'pending' | 'active';
  /** 当前登录用户是否是这条会话的发起人（决定 pending 态下前端渲染哪种 UI） */
  isInitiator?: boolean;
}

/** 陌生人消息（我是接收方、对方发起、还未接受）—— 独立于正常会话列表 */
export interface PendingConversation {
  id: number;
  otherUser: { id: number; nickname: string; avatarUrl: string };
  lastMessage: string | null;
  lastMessageAt: string | null;
}

export interface ChatMessage {
  id: number;
  conversationId: number;
  senderId: number;
  content: string;
  imageUrl?: string | null;
  isRead: boolean;
  recalledAt?: string | null;
  replyToId?: number | null;
  createdAt: string;
}
