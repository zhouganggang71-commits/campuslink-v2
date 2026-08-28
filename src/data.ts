import { Listing, Course, Message, StudentProfile, Notice } from './types';

export const INITIAL_PROFILE: StudentProfile = {
  fullName: '游客',
  studentId: '',
  department: '财税学院',
  orgLevel: '院级',
  orgName: '',
  position: '',
  avatarUrl: '',
  coverUrl: '',
  bio: '',
  isVerified: false,
  isAdmin: false,
  postsCount: 0,
  savedCount: 0,
  gender: null,
  genderVisible: false,
};

// 假通知全部清零：首页通知条现在是动态个人化内容（考试倒计时/今日课程/圈子热帖），
// 真官方公告等接 notices 表（管理后台发布）时再回填这里的渲染入口
export const INITIAL_NOTICES: Notice[] = [];

export const INITIAL_LISTINGS: Listing[] = [];

export const INITIAL_COURSES: Course[] = [];

export const INITIAL_MESSAGES: Message[] = [];

export const POST_TYPE_CHANNELS: { key: Listing['postType'] | 'all' | 'saved'; label: string; icon: string }[] = [
  { key: 'all', label: '全部', icon: 'apps' },
  { key: 'sell', label: '二手', icon: 'shopping_bag' },
  { key: 'lost', label: '失物', icon: 'search' },
  { key: 'found', label: '招领', icon: 'volunteer_activism' },
  { key: 'carpool', label: '拼车', icon: 'directions_car' },
  { key: 'job', label: '兼职', icon: 'work' },
  { key: 'activity', label: '活动', icon: 'celebration' },
  { key: 'study', label: '学习', icon: 'school' },
  { key: 'saved', label: '收藏', icon: 'bookmark' },
];
