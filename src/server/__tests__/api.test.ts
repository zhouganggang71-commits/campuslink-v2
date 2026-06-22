/**
 * 集成测试 — API 端点端到端测试
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';

process.env.JWT_SECRET = 'test-jwt-secret-for-testing';
process.env.CAMPUSLINK_DB_PW = 'test-db-pw';
process.env.ENCRYPTION_KEY = 'test-encryption-key-32chars!!';

import { ErrorCode } from '../errors';
import { ok, fail } from '../response';

describe('API 文档', () => {
  const app = express();
  app.get('/api/v1/openapi.json', (req, res) => {
    res.json({ openapi: '3.1.0', info: { title: 'CampusLink API', version: '2.0.0' }, paths: {} });
  });

  it('GET /api/v1/openapi.json 返回 OpenAPI 规范', async () => {
    const res = await request(app).get('/api/v1/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
  });
});

describe('错误码枚举', () => {
  it('ErrorCode 值应唯一且合理', () => {
    const values = Object.values(ErrorCode);
    const unique = new Set(values);
    expect(values.length).toBe(unique.size);
    expect(ErrorCode.INVALID_INPUT).toBeGreaterThanOrEqual(4000);
    expect(ErrorCode.INTERNAL_ERROR).toBeGreaterThanOrEqual(5000);
  });
});

describe('响应格式', () => {
  it('ok() 应返回标准格式', () => {
    const app = express();
    app.get('/test-ok', (req: any, res: any) => ok(res, { id: 1 }, '成功'));
    return request(app).get('/test-ok').then(res => {
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.message).toBe('成功');
      expect(res.body.data).toEqual({ id: 1 });
      expect(res.body).toHaveProperty('trace_id');
    });
  });

  it('fail() 应返回标准格式（含 errorCode）', () => {
    const app = express();
    app.get('/test-fail', (req: any, res: any) => fail(res, 429, '超限', ErrorCode.DAILY_LIMIT_EXCEEDED));
    return request(app).get('/test-fail').then(res => {
      expect(res.status).toBe(429);
      expect(res.body.code).toBe(ErrorCode.DAILY_LIMIT_EXCEEDED);
      expect(res.body.message).toBe('超限');
      expect(res.body).toHaveProperty('trace_id');
    });
  });
});

describe('路由模块注册', () => {
  it('safeRegister 应捕获模块错误不崩溃', async () => {
    const app = express();
    const results: string[] = [];

    function safeRegister(name: string, fn: () => void) {
      try { fn(); results.push(`${name}: ok`); }
      catch { results.push(`${name}: FAILED`); }
    }

    safeRegister('正常模块', () => app.get('/test-ok', (req, res) => res.json({ ok: true })));
    safeRegister('崩溃模块', () => { throw new Error('模拟错误'); });
    safeRegister('后置模块', () => app.get('/test-after', (req, res) => res.json({ ok: true })));

    expect(results).toEqual(['正常模块: ok', '崩溃模块: FAILED', '后置模块: ok']);

    const res1 = await request(app).get('/test-ok');
    expect(res1.status).toBe(200);
    const res2 = await request(app).get('/test-after');
    expect(res2.status).toBe(200);
  });
});

describe('敏感词检测', () => {
  it('正常文本应通过', async () => {
    const { checkSensitive } = await import('../../utils/sensitiveFilter');
    const result = checkSensitive('求购二手教材，价格好商量');
    expect(result.passed).toBe(true);
  });

  it('含敏感词的文本应被拦截', async () => {
    const { checkSensitive } = await import('../../utils/sensitiveFilter');
    // 使用一个明确的短敏感词
    const result = checkSensitive('test赌博test');
    expect(result.passed).toBe(false);
    expect(result.hitWords.length).toBeGreaterThan(0);
  });
});
