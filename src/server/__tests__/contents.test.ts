/**
 * 内容运营路由测试（R12 Phase 1）— 用户端列表/详情 + 管理端 CRUD + 校验器
 * 模式对齐 middleware.test.ts：mock auth/limiter/logger，pool 以 mock 对象传入
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../middleware/auth', () => ({
  adminAuth: (req: any, _res: any, next: () => void) => {
    req.userId = 1;
    req.isAdmin = true;
    next();
  },
}));
vi.mock('../middleware/limiter', () => ({
  limiter: () => (_req: any, _res: any, next: () => void) => next(),
}));
vi.mock('../../utils/logger', () => ({
  logger: { error: vi.fn(), business: vi.fn(), security: vi.fn(), info: vi.fn() },
}));

import { registerContentRoutes } from '../routes/contents';
import { createContentSchema, CONTENT_CATEGORIES } from '../validators';

/** mock pool：按 SQL 特征返回对应结果 */
function makePool() {
  const queries: { sql: string; params?: any[] }[] = [];
  const publishedRow = {
    id: 1,
    category: 'newcomer',
    sub_category: 'dorm',
    title: '宿舍生活指南',
    summary: '新生必看',
    cover_url: null,
    body: '<p>正文内容</p>',
    body_type: 'html',
    sort_order: 0,
    status: 'published',
    view_count: 10,
    created_at: '2026-08-14 10:00:00',
    updated_at: '2026-08-14 10:00:00',
  };
  const pool = {
    query: vi.fn(async (sql: string, params?: any[]) => {
      queries.push({ sql, params });
      if (sql.includes('COUNT(*)')) return [[{ total: 1 }], []];
      if (sql.trimStart().startsWith('DELETE')) return [{ affectedRows: 1 }, []];
      if (sql.includes('UPDATE contents SET view_count')) return [{ affectedRows: 1 }, []];
      // 详情：只有 published 才返回数据（草稿/归档 → 空 → 路由 404）；status 是参数占位符
      if (sql.includes('SELECT * FROM contents')) {
        return params?.includes('published') ? [[publishedRow], []] : [[], []];
      }
      // 列表 / 管理端列表 / DELETE 前置 SELECT title
      if (sql.includes('FROM contents')) {
        return [[publishedRow], []];
      }
      // INSERT
      return [{ insertId: 1, affectedRows: 1 }, []];
    }),
  };
  return { pool, queries };
}

function makeApp(pool: any) {
  const app = express();
  app.use(express.json());
  registerContentRoutes(app, pool);
  return app;
}

describe('contents 用户端接口', () => {
  let pool: ReturnType<typeof makePool>;
  beforeEach(() => {
    pool = makePool();
    vi.clearAllMocks();
  });

  it('GET /contents 返回列表（分页结构）', async () => {
    const res = await request(makeApp(pool.pool)).get('/api/v1/contents?category=newcomer');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.list).toHaveLength(1);
    expect(res.body.data.total).toBe(1);
    // 列表接口 SQL 必须限制 published，不泄露草稿
    const sql = pool.queries.find((q) => q.sql.includes('FROM contents'))?.sql || '';
    expect(sql).toContain("status = 'published'");
  });

  it('GET /contents?category=invalid 返回 400', async () => {
    const res = await request(makeApp(pool.pool)).get('/api/v1/contents?category=hacker');
    expect(res.status).toBe(400);
  });

  it('GET /contents/banner 返回 banner 列表', async () => {
    const res = await request(makeApp(pool.pool)).get('/api/v1/contents/banner');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    // banner 查询必须限定 services/banner
    const sql = pool.queries[0]?.sql || '';
    expect(sql).toContain("category = 'services'");
    expect(sql).toContain("sub_category = 'banner'");
  });

  it('GET /contents/:id 详情返回 body', async () => {
    const res = await request(makeApp(pool.pool)).get('/api/v1/contents/1');
    expect(res.status).toBe(200);
    expect(res.body.data.body).toContain('正文');
  });

  it('GET /contents/:id 无效 ID 返回 400', async () => {
    const res = await request(makeApp(pool.pool)).get('/api/v1/contents/abc');
    expect(res.status).toBe(400);
  });
});

describe('contents 管理端接口', () => {
  let pool: ReturnType<typeof makePool>;
  beforeEach(() => {
    pool = makePool();
    vi.clearAllMocks();
  });

  it('POST /admin/contents 校验失败（标题空）返回 400', async () => {
    const res = await request(makeApp(pool.pool))
      .post('/api/v1/admin/contents')
      .send({ category: 'newcomer', title: '', body: '<p>x</p>' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBeGreaterThanOrEqual(4000);
  });

  it('POST /admin/contents 成功创建', async () => {
    const res = await request(makeApp(pool.pool))
      .post('/api/v1/admin/contents')
      .send({
        category: 'newcomer',
        subCategory: 'dorm',
        title: '新生指南',
        summary: '',
        body: '<p>hi</p>',
        status: 'published',
      });
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(1);
    // INSERT 必须带 school_id（多校预留）
    const insert = pool.queries.find((q) => q.sql.includes('INSERT INTO contents'))!;
    expect(insert.params![0]).toBe(1);
  });

  it('PUT /admin/contents/:id 更新', async () => {
    const res = await request(makeApp(pool.pool))
      .put('/api/v1/admin/contents/1')
      .send({ category: 'services', subCategory: 'life', title: '改后标题', body: '<p>新正文</p>', status: 'draft' });
    expect(res.status).toBe(200);
  });

  it('DELETE /admin/contents/:id 删除并记日志', async () => {
    const res = await request(makeApp(pool.pool)).delete('/api/v1/admin/contents/1');
    expect(res.status).toBe(200);
  });
});

describe('createContentSchema', () => {
  it('合法内容通过', () => {
    const r = createContentSchema.safeParse({ category: 'newcomer', title: '测试', body: '<p>x</p>' });
    expect(r.success).toBe(true);
    expect(r.data!.status).toBe('draft'); // 默认草稿
  });

  it('标题为空拒绝', () => {
    const r = createContentSchema.safeParse({ category: 'newcomer', title: '', body: '<p>x</p>' });
    expect(r.success).toBe(false);
  });

  it('正文为空拒绝', () => {
    const r = createContentSchema.safeParse({ category: 'newcomer', title: 't', body: '' });
    expect(r.success).toBe(false);
  });

  it('分类无效拒绝', () => {
    const r = createContentSchema.safeParse({ category: 'hacker', title: 't', body: '<p>x</p>' });
    expect(r.success).toBe(false);
  });

  it('CONTENT_CATEGORIES 枚举齐全', () => {
    expect(CONTENT_CATEGORIES).toEqual(['newcomer', 'campus_intro', 'services', 'calendar']);
  });
});
