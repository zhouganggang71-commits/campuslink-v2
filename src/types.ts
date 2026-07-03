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

// 课程颜色（前后端共用）
export const COURSE_COLORS = [
  'bg-course-blue text-white',
  'bg-course-green text-white',
  'bg-course-yellow text-on-surface',
  'bg-course-orange text-white',
  'bg-course-purple text-white',
  'bg-course-red text-white',
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
  status: 'active' | 'sold' | 'pending' | 'rejected' | 'closed';
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
  schoolYear?: string | null; // 学年起始年，如 "2026"(代表2026-2027学年)
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
}

export interface Message {
  id: string;
  title: string;
  content: string;
  timeText: string;
  category: 'approval' | 'official' | 'registration';
  status: 'approved' | 'rejected' | 'update' | 'event';
  isRead: boolean;
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
}

export interface ChatMessage {
  id: number;
  conversationId: number;
  senderId: number;
  content: string;
  imageUrl?: string | null;
  isRead: boolean;
  createdAt: string;
}
