/**
 * 中间件测试 — auth / limiter / optionalAuth
 * 注意：JWT_SECRET 由 vitest.config.ts 的 env 注入，
 * 在导入 auth 之前就已经设置好了（静态 import 在模块顶层读 env）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// vitest.config.ts 注入的 JWT_SECRET，与 jwt.ts 模块初始化时读取的一致
const JWT_SECRET = 'test-jwt-unit-test-secret-key-2026';

// 模拟 db.pool
vi.mock('../db', () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { auth, optionalAuth, clearAuthCache } from '../middleware/auth';
import { limiter } from '../middleware/limiter';
import { pool } from '../db';

describe('auth 中间件', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAuthCache(1);
  });

  it('无 token 应返回 401', async () => {
    const app = express();
    app.get('/protected', auth, (req, res) => res.json({ ok: true }));
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe(-1);
  });

  it('过期 token 应返回 401', async () => {
    const expired = jwt.sign({ uid: 1, admin: false, amr: 'password', type: 'access' }, JWT_SECRET, {
      expiresIn: '0s',
    });
    await new Promise((r) => setTimeout(r, 1100));
    const app = express();
    app.get('/protected', auth, (req, res) => res.json({ ok: true }));
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it('合法 token 应为 req 注入 userId/isAdmin', async () => {
    (pool.query as any).mockResolvedValueOnce([[{ auth_status: 'verified' }]]);
    const token = jwt.sign({ uid: 1, admin: false, amr: 'password', type: 'access' }, JWT_SECRET, { expiresIn: '1h' });

    const app = express();
    app.get('/protected', auth, (req: any, res) => {
      expect(req.userId).toBe(1);
      expect(req.isAdmin).toBe(false);
      res.json({ ok: true });
    });
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('被篡改的 token 应被拒绝', async () => {
    const token = jwt.sign({ uid: 1, admin: false, amr: 'password', type: 'access' }, JWT_SECRET, { expiresIn: '1h' });
    const tampered = token.slice(0, -1) + (token[token.length - 1] === 'a' ? 'b' : 'a');
    const app = express();
    app.get('/protected', auth, (req, res) => res.json({ ok: true }));
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${tampered}`);
    expect(res.status).toBe(401);
  });
});

describe('optionalAuth 中间件', () => {
  it('无 token 应以匿名身份放行', async () => {
    const app = express();
    app.get('/public', optionalAuth, (req: any, res) => {
      expect(req.isVerified).toBe(false);
      expect(req.isAdmin).toBe(false);
      res.json({ ok: true });
    });
    const res = await request(app).get('/public');
    expect(res.status).toBe(200);
  });

  it('带合法 token 应注入用户信息', async () => {
    (pool.query as any).mockResolvedValueOnce([[{ auth_status: 'verified' }]]);
    const token = jwt.sign({ uid: 1, admin: true, amr: 'password', type: 'access' }, JWT_SECRET, { expiresIn: '1h' });

    const app = express();
    app.get('/public', optionalAuth, (req: any, res) => {
      expect(req.userId).toBe(1);
      expect(req.isAdmin).toBe(true);
      res.json({ ok: true });
    });
    const res = await request(app).get('/public').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('带过期 token 应以匿名身份放行（不报 401）', async () => {
    const expired = jwt.sign({ uid: 1, admin: false, amr: 'password', type: 'access' }, JWT_SECRET, {
      expiresIn: '0s',
    });
    await new Promise((r) => setTimeout(r, 1100));
    const app = express();
    app.get('/public', optionalAuth, (req: any, res) => {
      expect(req.isVerified).toBe(false);
      res.json({ ok: true });
    });
    const res = await request(app).get('/public').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(200);
  });
});

describe('limiter 限流中间件', () => {
  it('正常请求应通过', async () => {
    const app = express();
    app.get('/api', limiter(10), (req, res) => res.json({ ok: true }));
    const res = await request(app).get('/api');
    expect(res.status).toBe(200);
  });

  it('超过秒级限流应返回 429', async () => {
    const app = express();
    app.get('/api', limiter(1), (req, res) => res.json({ ok: true }));
    await request(app).get('/api');
    const res = await request(app).get('/api');
    expect(res.status).toBe(429);
    expect(res.body.code).toBe(-1);
  });

  it('不同接口的限流桶应独立', async () => {
    const app = express();
    app.get('/api/a', limiter(1), (req, res) => res.json({ ok: true }));
    app.get('/api/b', limiter(1), (req, res) => res.json({ ok: true }));
    await request(app).get('/api/a');
    const resB = await request(app).get('/api/b');
    expect(resB.status).toBe(200);
    const resA = await request(app).get('/api/a');
    expect(resA.status).toBe(429);
  });
});
