/**
 * 面交交易路由测试（R12 Phase 2）— 发起/同意生成码/核销/取消/评价/信誉
 * 模式对齐 contents.test.ts：mock auth/limiter/logger，pool 以 mock 对象传入
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// 当前登录用户（mock auth 注入）
let CURRENT_UID = 1;
const CURRENT_ADMIN = false;
vi.mock('../middleware/auth', () => ({
  auth: (req: any, _res: any, next: () => void) => {
    req.userId = CURRENT_UID;
    req.isAdmin = CURRENT_ADMIN;
    next();
  },
  optionalAuth: (req: any, _res: any, next: () => void) => {
    req.userId = CURRENT_UID;
    next();
  },
}));
vi.mock('../middleware/limiter', () => ({
  limiter: () => (_req: any, _res: any, next: () => void) => next(),
}));
vi.mock('../../utils/logger', () => ({
  logger: { error: vi.fn(), business: vi.fn(), security: vi.fn(), info: vi.fn() },
}));

import { registerTransactionRoutes } from '../routes/transactions';
import { createTransactionSchema, verifyCodeSchema, reviewSchema } from '../validators';

function makePool() {
  const queries: { sql: string; params?: any[] }[] = [];
  const txRow = {
    id: 1,
    post_id: 10,
    seller_id: 2,
    buyer_id: 1,
    status: 'pending',
    face_code: null,
    code_expires_at: null,
    verify_attempts: 0,
  };
  const queryImpl = async (sql: string, params?: any[]) => {
    queries.push({ sql, params });
    if (sql.includes('INSERT INTO transactions')) return [{ insertId: 1, affectedRows: 1 }, []];
    if (sql.includes('INSERT INTO reviews')) return [{ insertId: 1 }, []];
    if (sql.includes('FROM posts')) {
      // 发起时查帖子：post 10 = sell/active/卖家2；post 11 = 非 sell；post 99 = 不存在
      const pid = params?.[0];
      if (pid === 99) return [[], []];
      if (pid === 11) return [[{ id: 11, user_id: 2, title: '拼车', status: 'active', post_type: 'carpool' }], []];
      return [[{ id: 10, user_id: 2, title: '二手书', status: 'active', post_type: 'sell' }], []];
    }
    if (sql.includes('FROM transactions') && sql.includes('status IN')) return [[], []];
    if (sql.includes('SELECT t.*')) return [[txRow], []];
    if (sql.includes('SELECT * FROM transactions WHERE id')) {
      const id = params?.[0];
      if (id === 404) return [[], []];
      return [[{ ...txRow }], []];
    }
    if (sql.includes('UPDATE transactions SET status = ?')) return [{ affectedRows: 1 }, []];
    if (sql.includes("SET status = 'completed'")) return [{ affectedRows: 1 }, []];
    if (sql.includes("SET status = 'cancelled'")) return [{ affectedRows: 1 }, []];
    if (sql.includes('verify_attempts = verify_attempts + 1')) return [{ affectedRows: 1 }, []];
    if (sql.includes('UPDATE posts SET status')) return [{ affectedRows: 1 }, []];
    if (sql.includes('UPDATE users u SET')) return [{ affectedRows: 1 }, []];
    if (sql.includes('FROM users WHERE id')) {
      return [[{ nickname: '测试用户', reputation_score: 5.0, review_count: 0 }], []];
    }
    if (sql.includes('FROM reviews r')) return [[[]], []];
    return [[], []];
  };
  const pool = {
    query: vi.fn(queryImpl),
    getConnection: vi.fn(async () => ({
      query: queryImpl,
      beginTransaction: vi.fn(async () => {}),
      commit: vi.fn(async () => {}),
      rollback: vi.fn(async () => {}),
      release: vi.fn(() => {}),
    })),
  };
  return { pool, queries };
}

function makeApp(pool: any) {
  const app = express();
  app.use(express.json());
  registerTransactionRoutes(app, pool);
  return app;
}

describe('面交交易：发起', () => {
  let pool: ReturnType<typeof makePool>;
  beforeEach(() => {
    CURRENT_UID = 1;
    pool = makePool();
    vi.clearAllMocks();
  });

  it('买家成功发起面交申请', async () => {
    const res = await request(makeApp(pool.pool)).post('/api/v1/transactions').send({ postId: 10 });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('pending');
  });

  it('非 sell 类型帖子拒绝', async () => {
    const res = await request(makeApp(pool.pool)).post('/api/v1/transactions').send({ postId: 11 });
    expect(res.status).toBe(400);
  });

  it('帖子不存在返回 404', async () => {
    const res = await request(makeApp(pool.pool)).post('/api/v1/transactions').send({ postId: 99 });
    expect(res.status).toBe(404);
  });

  it('不能购买自己的商品', async () => {
    CURRENT_UID = 2; // 卖家本人
    const res = await request(makeApp(pool.pool)).post('/api/v1/transactions').send({ postId: 10 });
    expect(res.status).toBe(400);
  });

  it('postId 非法返回 400', async () => {
    const res = await request(makeApp(pool.pool)).post('/api/v1/transactions').send({ postId: 'abc' });
    expect(res.status).toBe(400);
  });
});

describe('面交交易：卖家同意生成码 + 核销', () => {
  let pool: ReturnType<typeof makePool>;
  beforeEach(() => {
    CURRENT_UID = 2; // 卖家
    pool = makePool();
    vi.clearAllMocks();
  });

  it('卖家同意生成 6 位数字面交码', async () => {
    const res = await request(makeApp(pool.pool)).put('/api/v1/transactions/1/accept');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('code_issued');
    expect(res.body.data.faceCode).toMatch(/^\d{6}$/);
  });

  it('非卖家不能同意', async () => {
    CURRENT_UID = 1; // 买家
    const res = await request(makeApp(pool.pool)).put('/api/v1/transactions/1/accept');
    expect(res.status).toBe(403);
  });

  it('核销正确码 → completed + 帖子标 sold', async () => {
    // 先把交易设为 code_issued（mock 返回动态状态）
    pool.pool.query.mockImplementationOnce((async () => {
      const t = {
        id: 1,
        post_id: 10,
        seller_id: 2,
        buyer_id: 1,
        status: 'code_issued',
        face_code: '123456',
        code_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        verify_attempts: 0,
      };
      return [[t], []];
    }) as any);
    const res = await request(makeApp(pool.pool)).put('/api/v1/transactions/1/verify').send({ code: '123456' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('completed');
    // 帖子应被标 sold
    const sold = pool.queries.find((q) => q.sql.includes('UPDATE posts SET status'));
    expect(sold).toBeTruthy();
    expect(sold?.sql).toContain("'sold'");
  });

  it('核销错误码返回 400 并累加失败次数', async () => {
    pool.pool.query.mockImplementationOnce((async () => {
      const t = {
        id: 1,
        post_id: 10,
        seller_id: 2,
        buyer_id: 1,
        status: 'code_issued',
        face_code: '123456',
        code_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        verify_attempts: 0,
      };
      return [[t], []];
    }) as any);
    const res = await request(makeApp(pool.pool)).put('/api/v1/transactions/1/verify').send({ code: '000000' });
    expect(res.status).toBe(400);
    const incr = pool.queries.find((q) => q.sql.includes('verify_attempts = verify_attempts + 1'));
    expect(incr).toBeTruthy();
  });

  it('核销码格式非法返回 400', async () => {
    const res = await request(makeApp(pool.pool)).put('/api/v1/transactions/1/verify').send({ code: '12' });
    expect(res.status).toBe(400);
  });

  it('核销失败 5 次后面交码作废（防爆破）', async () => {
    pool.pool.query.mockImplementationOnce((async () => {
      const t = {
        id: 1,
        post_id: 10,
        seller_id: 2,
        buyer_id: 1,
        status: 'code_issued',
        face_code: '123456',
        code_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        verify_attempts: 5,
      };
      return [[t], []];
    }) as any);
    const res = await request(makeApp(pool.pool)).put('/api/v1/transactions/1/verify').send({ code: '123456' });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('作废');
  });

  it('面交码过期返回 400', async () => {
    pool.pool.query.mockImplementationOnce((async () => {
      const t = {
        id: 1,
        post_id: 10,
        seller_id: 2,
        buyer_id: 1,
        status: 'code_issued',
        face_code: '123456',
        code_expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
        verify_attempts: 0,
      };
      return [[t], []];
    }) as any);
    const res = await request(makeApp(pool.pool)).put('/api/v1/transactions/1/verify').send({ code: '123456' });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('过期');
  });

  it('卖家在 code_issued 有效期内不能重复发码', async () => {
    pool.pool.query.mockImplementationOnce((async () => {
      const t = {
        id: 1,
        post_id: 10,
        seller_id: 2,
        buyer_id: 1,
        status: 'code_issued',
        face_code: '123456',
        code_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        verify_attempts: 0,
      };
      return [[t], []];
    }) as any);
    const res = await request(makeApp(pool.pool)).put('/api/v1/transactions/1/accept');
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('仍有效');
  });
});

describe('面交交易：取消 + 评价 + 信誉', () => {
  let pool: ReturnType<typeof makePool>;
  beforeEach(() => {
    CURRENT_UID = 1;
    pool = makePool();
    vi.clearAllMocks();
  });

  it('买家可取消交易', async () => {
    const res = await request(makeApp(pool.pool)).put('/api/v1/transactions/1/cancel');
    expect(res.status).toBe(200);
  });

  it('未完成交易不能评价', async () => {
    const res = await request(makeApp(pool.pool))
      .post('/api/v1/transactions/1/review')
      .send({ rating: 5, comment: '很好' });
    expect(res.status).toBe(400);
  });

  it('completed 交易评价成功（评分 1-5 + 文字）', async () => {
    pool.pool.query.mockImplementationOnce((async () => {
      const t = { id: 1, post_id: 10, seller_id: 2, buyer_id: 1, status: 'completed' };
      return [[t], []];
    }) as any);
    const res = await request(makeApp(pool.pool))
      .post('/api/v1/transactions/1/review')
      .send({ rating: 5, comment: '面交顺利，物品很新' });
    expect(res.status).toBe(200);
  });

  it('评分越界拒绝', async () => {
    pool.pool.query.mockImplementationOnce((async () => {
      const t = { id: 1, post_id: 10, seller_id: 2, buyer_id: 1, status: 'completed' };
      return [[t], []];
    }) as any);
    const res = await request(makeApp(pool.pool)).post('/api/v1/transactions/1/review').send({ rating: 6 });
    expect(res.status).toBe(400);
  });

  it('查询用户信誉', async () => {
    const res = await request(makeApp(pool.pool)).get('/api/v1/users/2/reputation');
    expect(res.status).toBe(200);
    expect(res.body.data.reputationScore).toBe(5.0);
    expect(res.body.data.reviewCount).toBe(0);
  });
});

describe('帖子交易状态接口', () => {
  let pool: any;
  beforeEach(() => {
    CURRENT_UID = 1;
    pool = makePool();
    vi.clearAllMocks();
  });

  it('无进行中交易返回 active=false', async () => {
    const res = await request(makeApp(pool.pool)).get('/api/v1/transactions/post/10');
    expect(res.status).toBe(200);
    expect(res.body.data.active).toBe(false);
  });

  it('有进行中交易返回状态和角色', async () => {
    pool.pool.query
      .mockImplementationOnce((async () => {
        const t = { id: 1, seller_id: 2, buyer_id: 1, status: 'pending' };
        return [[t], []];
      }) as any)
      .mockImplementationOnce((async () => {
        const t = { id: 1, seller_id: 2, buyer_id: 1, status: 'pending' };
        return [[t], []];
      }) as any);
    const res = await request(makeApp(pool.pool)).get('/api/v1/transactions/post/10');
    expect(res.status).toBe(200);
    expect(res.body.data.active).toBe(true);
  });
});

describe('交易校验器', () => {
  it('createTransactionSchema 校验', () => {
    expect(createTransactionSchema.safeParse({ postId: 1 }).success).toBe(true);
    expect(createTransactionSchema.safeParse({ postId: 0 }).success).toBe(false);
    expect(createTransactionSchema.safeParse({}).success).toBe(false);
  });
  it('verifyCodeSchema 校验 6 位数字', () => {
    expect(verifyCodeSchema.safeParse({ code: '123456' }).success).toBe(true);
    expect(verifyCodeSchema.safeParse({ code: '12345' }).success).toBe(false);
    expect(verifyCodeSchema.safeParse({ code: 'abcdef' }).success).toBe(false);
  });
  it('reviewSchema 校验 1-5 星', () => {
    expect(reviewSchema.safeParse({ rating: 5 }).success).toBe(true);
    expect(reviewSchema.safeParse({ rating: 0 }).success).toBe(false);
    expect(reviewSchema.safeParse({ rating: 6 }).success).toBe(false);
  });
});
