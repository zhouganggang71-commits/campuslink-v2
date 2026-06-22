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
  publisherName: string;
  publisherAvatar: string;
  isVerifiedStudent: boolean;
  isOfficialOrg: boolean;
  orgName?: string;
  department?: Department;
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
}

export interface Message {
  id: string;
  title: string;
  content: string;
  timeText: string;
  category: 'approval' | 'official';
  status: 'approved' | 'rejected' | 'update' | 'event';
  isRead: boolean;
}

export interface StudentProfile {
  fullName: string;
  studentId: string;
  department: string;
  orgLevel: OrgLevel;
  position: Position | '';
  avatarUrl: string;
  isVerified: boolean;
  isAdmin: boolean;
  postsCount: number;
  savedCount: number;
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
