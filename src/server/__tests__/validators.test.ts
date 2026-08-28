/**
 * Zod 入参校验测试 — 覆盖所有 schema 的边界情况
 */
import { describe, it, expect } from 'vitest';
import {
  loginSchema,
  setPasswordSchema,
  createPostSchema,
  createCourseSchema,
  registrationSchema,
  createCirclePostSchema,
  createCircleCommentSchema,
  createReportSchema,
  createAppealSchema,
} from '../validators';

describe('loginSchema', () => {
  it('合法登录数据应通过', () => {
    const r = loginSchema.safeParse({ studentId: '202330140113', fullName: '周鉦罡', password: '123456' });
    expect(r.success).toBe(true);
  });

  it('学号为空应拒绝', () => {
    const r = loginSchema.safeParse({ studentId: '', fullName: '测试', password: '123456' });
    expect(r.success).toBe(false);
  });

  it('密码不足6位应拒绝', () => {
    const r = loginSchema.safeParse({ studentId: '202330140113', fullName: '测试', password: '12345' });
    expect(r.success).toBe(false);
  });

  it('姓名为空应拒绝', () => {
    const r = loginSchema.safeParse({ studentId: '202330140113', fullName: '', password: '123456' });
    expect(r.success).toBe(false);
  });
});

describe('setPasswordSchema', () => {
  it('新密码合法应通过', () => {
    const r = setPasswordSchema.safeParse({ password: 'newpassword123' });
    expect(r.success).toBe(true);
  });

  it('密码不足6位应拒绝', () => {
    const r = setPasswordSchema.safeParse({ password: '12345' });
    expect(r.success).toBe(false);
  });

  it('带旧密码应通过', () => {
    const r = setPasswordSchema.safeParse({ password: 'newpassword123', oldPassword: 'oldpassword' });
    expect(r.success).toBe(true);
  });
});

describe('createPostSchema', () => {
  const validPost = {
    title: '二手教材出售',
    description: '会计学基础，九成新',
    category: '教材',
    postType: 'sell' as const,
    imageUrls: [],
  };

  it('合法帖子应通过', () => {
    const r = createPostSchema.safeParse(validPost);
    expect(r.success).toBe(true);
  });

  it('标题为空应拒绝', () => {
    const r = createPostSchema.safeParse({ ...validPost, title: '' });
    expect(r.success).toBe(false);
  });

  it('标题超过100字应拒绝', () => {
    const r = createPostSchema.safeParse({ ...validPost, title: 'x'.repeat(101) });
    expect(r.success).toBe(false);
  });

  it('图片超过9张应拒绝', () => {
    const r = createPostSchema.safeParse({ ...validPost, imageUrls: Array(10).fill('http://example.com/img.jpg') });
    expect(r.success).toBe(false);
  });

  it('非法 postType 应拒绝', () => {
    const r = createPostSchema.safeParse({ ...validPost, postType: 'invalid' });
    expect(r.success).toBe(false);
  });

  it('默认值应正确填充', () => {
    const r = createPostSchema.safeParse(validPost);
    if (r.success) {
      expect(r.data.description).toBe('会计学基础，九成新');
      expect(r.data.imageUrls).toEqual([]);
    }
  });
});

describe('createCourseSchema', () => {
  const validCourse = {
    name: '会计学基础',
    weekday: '1',
    startPeriod: '1',
    periodSpan: '2',
  };

  it('合法课程应通过（coerce 数字）', () => {
    const r = createCourseSchema.safeParse(validCourse);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(typeof r.data.weekday).toBe('number');
      expect(r.data.weekday).toBe(1);
    }
  });

  it('weekday 超出范围应拒绝', () => {
    const r = createCourseSchema.safeParse({ ...validCourse, weekday: '8' });
    expect(r.success).toBe(false);
  });

  it('weekday=0 应拒绝', () => {
    const r = createCourseSchema.safeParse({ ...validCourse, weekday: '0' });
    expect(r.success).toBe(false);
  });

  it('periodSpan 超过6应拒绝', () => {
    const r = createCourseSchema.safeParse({ ...validCourse, periodSpan: '7' });
    expect(r.success).toBe(false);
  });
});

describe('registrationSchema', () => {
  it('合法报名应通过', () => {
    const r = registrationSchema.safeParse({
      listingId: '123',
      listingTitle: '会计讲座',
      registrantName: '张三',
      phone: '13800138000',
    });
    expect(r.success).toBe(true);
  });

  it('姓名为空应拒绝', () => {
    const r = registrationSchema.safeParse({
      listingId: '123',
      listingTitle: '活动',
      registrantName: '',
      phone: '13800138000',
    });
    expect(r.success).toBe(false);
  });

  it('电话为空应拒绝', () => {
    const r = registrationSchema.safeParse({
      listingId: '123',
      listingTitle: '活动',
      registrantName: '张三',
      phone: '',
    });
    expect(r.success).toBe(false);
  });
});

describe('createCirclePostSchema', () => {
  const validCP = { circle_id: 'trending' as const, content: '今天天气真好' };

  it('合法圈子帖子应通过', () => {
    const r = createCirclePostSchema.safeParse(validCP);
    expect(r.success).toBe(true);
  });

  it('内容为空应拒绝', () => {
    const r = createCirclePostSchema.safeParse({ ...validCP, content: '' });
    expect(r.success).toBe(false);
  });

  it('内容超过500字应拒绝', () => {
    const r = createCirclePostSchema.safeParse({ ...validCP, content: 'x'.repeat(501) });
    expect(r.success).toBe(false);
  });

  it('非法 circle_id 应拒绝', () => {
    const r = createCirclePostSchema.safeParse({ ...validCP, circle_id: 'invalid' });
    expect(r.success).toBe(false);
  });

  it('标签超过5个应拒绝', () => {
    const r = createCirclePostSchema.safeParse({ ...validCP, tags: ['a', 'b', 'c', 'd', 'e', 'f'] });
    expect(r.success).toBe(false);
  });
});

describe('createCircleCommentSchema', () => {
  it('合法评论应通过', () => {
    const r = createCircleCommentSchema.safeParse({ content: '说得好' });
    expect(r.success).toBe(true);
  });

  it('评论为空应拒绝', () => {
    const r = createCircleCommentSchema.safeParse({ content: '' });
    expect(r.success).toBe(false);
  });

  it('带 parent_id 的回复应通过', () => {
    const r = createCircleCommentSchema.safeParse({ content: '回复', parent_id: 1 });
    expect(r.success).toBe(true);
  });
});

describe('createReportSchema', () => {
  it('合法举报应通过', () => {
    const r = createReportSchema.safeParse({ targetType: 'post', targetId: 1, reason: '骚扰' });
    expect(r.success).toBe(true);
  });

  it('非法 targetType 应拒绝', () => {
    const r = createReportSchema.safeParse({ targetType: 'user', targetId: 1, reason: '骚扰' });
    expect(r.success).toBe(false);
  });

  it('非法 reason 应拒绝', () => {
    const r = createReportSchema.safeParse({ targetType: 'post', targetId: 1, reason: '违法' });
    expect(r.success).toBe(false);
  });
});

describe('createAppealSchema', () => {
  it('合法申诉应通过', () => {
    const r = createAppealSchema.safeParse({
      targetType: 'post',
      targetId: 1,
      appealText: '这是我的原创内容，请审核恢复',
    });
    expect(r.success).toBe(true);
  });

  it('申诉内容为空应拒绝', () => {
    const r = createAppealSchema.safeParse({ targetType: 'post', targetId: 1, appealText: '' });
    expect(r.success).toBe(false);
  });

  it('chat_message 类型应拒绝（不在申诉范围内）', () => {
    const r = createAppealSchema.safeParse({ targetType: 'chat_message', targetId: 1, appealText: '申诉' });
    expect(r.success).toBe(false);
  });
});
