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
  imageUrls: z.array(z.string().url()).max(9, '最多9张图片').default([]),
  contactInfo: z.string().max(100).nullable().optional(),
  idempotencyKey: z.string().max(64).optional(),
});

export const updatePostStatusSchema = z.object({
  status: z.enum(['active', 'sold', 'closed', 'pending', 'rejected']),
  rejectReason: z.string().max(500).nullable().optional(),
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
  weekday: z.number().int().min(1).max(7),
  startPeriod: z.number().int().min(1).max(14),
  periodSpan: z.number().int().min(1).max(6).default(2),
  weekStart: z.number().int().min(1).max(20).default(1),
  weekEnd: z.number().int().min(1).max(20).default(18),
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
