/**
 * Zod 入参校验 —— 替代手写 if 检查
 * 每个接口输入都有 schema，非法参数自动拒绝并返回详情
 */
import { z } from 'zod';

// ── 登录 ──
export const loginSchema = z.object({
  studentId: z.string().min(1, '学号不能为空').max(30),
  fullName: z.string().min(1, '姓名不能为空').max(20),
  password: z.string().min(6, '密码至少6位').max(100),
  department: z.string().max(128).optional(),
  orgLevel: z.enum(['校级', '院级', '']).optional(),
  orgName: z.string().max(100).optional(),
  position: z.string().max(20).optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
});

export const setPasswordSchema = z.object({
  password: z.string().min(6, '密码至少6位').max(100),
  oldPassword: z.string().max(100).optional(),
});

// ── 帖子 ──
const POST_TYPES = ['sell', 'lost', 'found', 'carpool', 'job', 'activity', 'study'] as const;

export const createPostSchema = z.object({
  title: z.string().min(1, '标题不能为空').max(100, '标题不超过100字'),
  description: z.string().max(2000).default(''),
  price: z.number().nullable().optional(),
  originalPrice: z.number().nullable().optional(),
  category: z.string().min(1, '分类不能为空'),
  postType: z.enum(POST_TYPES),
  imageUrls: z.array(z.string()).max(9, '最多9张图片').default([]),
  contactInfo: z.string().max(100).nullable().optional(),
  idempotencyKey: z.string().max(64).optional(),
});

export const updatePostStatusSchema = z.object({
  status: z.enum(['active', 'sold', 'closed', 'pending', 'rejected']),
  rejectReason: z.string().max(500).nullable().optional(),
});

// ── 管理端：校园圈帖子状态（active/hidden/deleted，跟 posts 的状态枚举不是一回事，不能复用上面那个）──
export const updateCirclePostStatusSchema = z.object({
  status: z.enum(['active', 'hidden', 'deleted']),
});

// ── 管理端：校园圈评论状态（跟帖子同一套枚举，单独建一个 schema 保持"一种资源一个 schema"的既有风格）──
export const updateCircleCommentStatusSchema = z.object({
  status: z.enum(['active', 'hidden', 'deleted']),
});

// ── 用户审核 ──
export const updateUserStatusSchema = z.object({
  auth_status: z.enum(['verified', 'pending', 'rejected']),
});

// ── 课程 ──
export const createCourseSchema = z.object({
  name: z.string().min(1, '课程名不能为空').max(50),
  classroom: z.string().max(50).default(''),
  teacher: z.string().max(30).default(''),
  weekday: z.coerce.number().int().min(1).max(7),
  startPeriod: z.coerce.number().int().min(1).max(14),
  periodSpan: z.coerce.number().int().min(1).max(6).default(2),
  weekStart: z.coerce.number().int().min(1).max(20).default(1),
  weekEnd: z.coerce.number().int().min(1).max(20).default(18),
  weekType: z.enum(['all', 'odd', 'even']).default('all'),
  courseType: z.enum(['theory', 'lab', 'elective']).default('theory'),
  colorClass: z.string().optional(),
});

// ── 报名 ──
export const registrationSchema = z.object({
  listingId: z.string().min(1),
  listingTitle: z.string().min(1, '活动标题不能为空').max(100),
  registrantName: z.string().min(1, '姓名不能为空').max(20),
  studentId: z.string().max(30).optional(),
  department: z.string().max(50).optional(),
  phone: z.string().min(1, '电话不能为空').max(20),
  idempotencyKey: z.string().max(64).optional(),
});

// ── 类型推导 ──
export type LoginInput = z.infer<typeof loginSchema>;
export type CreatePostInput = z.infer<typeof createPostSchema>;
export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type RegistrationInput = z.infer<typeof registrationSchema>;

// ── 校园圈 ──
const CIRCLE_IDS = ['trending', 'study', 'sports', 'hobby', 'treehole', 'career'] as const;

export const createCirclePostSchema = z.object({
  circle_id: z.enum(CIRCLE_IDS),
  content: z.string().min(1, '内容不能为空').max(500, '内容不超过500字'),
  images: z.array(z.string()).max(9, '最多9张图片').default([]),
  tags: z.array(z.string().max(20)).max(5, '最多5个标签').default([]),
  is_anonymous: z.boolean().default(false),
});

export const createCircleCommentSchema = z.object({
  content: z.string().min(1, '评论不能为空').max(500, '评论不超过500字'),
  parent_id: z.number().int().nullable().optional(),
  image_url: z.string().max(500).optional(),
});

export const circlePostListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(30).default(20),
});

export type CreateCirclePostInput = z.infer<typeof createCirclePostSchema>;
// ── 反馈 ──
export const createFeedbackSchema = z.object({
  content: z.string().min(2, '反馈内容至少2个字').max(2000),
  contact: z.string().max(200).default(''),
});

export type CreateCircleCommentInput = z.infer<typeof createCircleCommentSchema>;

// ── Web Push 订阅 ──
export const pushSubscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(255),
    auth: z.string().min(1).max(64),
  }),
});

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
});

// ── 单次调课 ──
export const courseOverrideSchema = z
  .object({
    week: z.number().int().min(1).max(30),
    action: z.enum(['cancel', 'move']),
    toWeek: z.number().int().min(1).max(30).optional(),
    toWeekday: z.number().int().min(1).max(7).optional(),
    toStartPeriod: z.number().int().min(1).max(10).optional(),
    toPeriodSpan: z.number().int().min(1).max(6).optional(),
    toClassroom: z.string().max(64).optional(),
  })
  .refine(
    (v) =>
      v.action === 'cancel' || (v.toWeek !== undefined && v.toWeekday !== undefined && v.toStartPeriod !== undefined),
    {
      message: '调课必须提供目标周/星期/节次',
    },
  );

// ── 学期配置 ──
export const termConfigSchema = z.object({
  schoolYear: z.string().regex(/^20\d{2}$/, '学年为4位年份（学年起始年）'),
  schoolTerm: z.enum(['3', '12'], { message: '学期编码：3=秋季，12=春季' }),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '开学日期格式 YYYY-MM-DD'),
  weeks: z.number().int().min(1).max(30).default(20),
});

// ── 内容举报（帖子/圈子帖子/圈子评论/私信通用） ──
const REPORT_REASONS = ['骚扰', '色情低俗', '诈骗', '人身攻击', '虚假信息', '其他'] as const;
export const createReportSchema = z.object({
  targetType: z.enum(['post', 'circle_post', 'circle_comment', 'chat_message']),
  targetId: z.number().int().positive('目标ID无效'),
  reason: z.enum(REPORT_REASONS, { message: '举报理由无效' }),
  reasonDetail: z.string().max(500).optional(),
});

export const resolveReportSchema = z.object({
  status: z.enum(['upheld', 'dismissed']),
  resolutionNote: z.string().max(500).optional(),
});

// ── 举报申诉（chat_message 不在申诉范围内——举报走拉黑流程，没有"内容被隐藏"这一步）──
export const createAppealSchema = z.object({
  targetType: z.enum(['post', 'circle_post', 'circle_comment']),
  targetId: z.number().int().positive('目标ID无效'),
  appealText: z.string().min(1, '申诉内容不能为空').max(500, '申诉内容最多500字'),
});

export const resolveAppealSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  adminNote: z.string().max(500).optional(),
});

// ── 内容运营（contents 表，R12 Phase 1）──
export const CONTENT_CATEGORIES = ['newcomer', 'campus_intro', 'services', 'calendar'] as const;
export const CONTENT_STATUSES = ['draft', 'published', 'archived'] as const;

export const createContentSchema = z.object({
  category: z.enum(CONTENT_CATEGORIES, { message: '分类无效' }),
  subCategory: z.string().max(32, '子分类不超过32字符').default(''),
  title: z.string().min(1, '标题不能为空').max(120, '标题不超过120字'),
  summary: z.string().max(200, '摘要不超过200字').default(''),
  coverUrl: z.string().max(500).optional().nullable(),
  resourceUrl: z.string().max(500).optional().nullable(),
  resourceName: z.string().max(200).default(''),
  body: z.string().min(1, '正文不能为空'),
  bodyType: z.enum(['html', 'calendar_json']).default('html'),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  status: z.enum(CONTENT_STATUSES).default('draft'),
});
export type CreateContentInput = z.infer<typeof createContentSchema>;

// ── 面交交易（R12 Phase 2）──
export const createTransactionSchema = z.object({
  postId: z.number().int().positive('帖子ID无效'),
});
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

export const verifyCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, '面交码为 6 位数字'),
});

export const reviewSchema = z.object({
  rating: z.number().int().min(1, '请选择评分').max(5, '评分最高 5 星'),
  comment: z.string().max(200, '评价不超过200字').default(''),
});
export type ReviewInput = z.infer<typeof reviewSchema>;
