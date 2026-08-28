/**
 * Web Push 订阅管理
 * - GET  /push/vapid-key    公开，前端订阅时需要 VAPID 公钥
 * - POST /push/subscribe    登录用户注册订阅（幂等 upsert），成功后向该设备发一条测试推送
 * - POST /push/unsubscribe  删除本设备订阅
 */
import { Request, Response } from 'express';
import { auth } from '../middleware/auth';
import { limiter } from '../middleware/limiter';
import { logger } from '../../utils/logger';
import { ok, fail, validate } from '../response';
import { pushSubscribeSchema, pushUnsubscribeSchema } from '../validators';
import { isPushConfigured, getVapidPublicKey, endpointHash, sendToSubscription } from '../push';

export function registerPushRoutes(app: any, pool: any) {
  // ── VAPID 公钥 ──
  app.get('/api/v1/push/vapid-key', limiter(30), (_req: Request, res: Response) => {
    if (!isPushConfigured()) return fail(res, 503, '推送服务未配置');
    ok(res, { key: getVapidPublicKey() });
  });

  // ── 订阅 ──
  app.post('/api/v1/push/subscribe', auth, limiter(10), async (req: Request, res: Response) => {
    try {
      if (!isPushConfigured()) return fail(res, 503, '推送服务未配置');
      const input = validate(res, pushSubscribeSchema, req.body);
      if (!input) return;
      const userId = (req as any).userId;
      const hash = endpointHash(input.endpoint);
      const ua = String(req.headers['user-agent'] || '').slice(0, 255);

      // 幂等 upsert：同一浏览器重复订阅只更新归属（换账号登录时订阅跟人走）
      await pool.query(
        `INSERT INTO push_subscriptions (user_id, endpoint, endpoint_hash, p256dh, auth, user_agent)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth = VALUES(auth), user_agent = VALUES(user_agent), last_used_at = NOW()`,
        [userId, input.endpoint, hash, input.keys.p256dh, input.keys.auth, ua],
      );

      // 只向刚订阅的这台设备发测试推送，验证链路
      const result = await sendToSubscription(
        { id: 0, endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth },
        { title: 'CampusLink', body: '通知已开启，重要消息不再错过', url: '/campus/' },
      );

      logger.business('WebPush 订阅', { user_id: userId, test_push: result });
      ok(res, { message: '订阅成功', testPush: result === 'ok' });
    } catch (err: any) {
      logger.error('WebPush 订阅失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '订阅失败');
    }
  });

  // ── 退订 ──
  app.post('/api/v1/push/unsubscribe', auth, limiter(10), async (req: Request, res: Response) => {
    try {
      const input = validate(res, pushUnsubscribeSchema, req.body);
      if (!input) return;
      const userId = (req as any).userId;
      await pool.query('DELETE FROM push_subscriptions WHERE endpoint_hash = ? AND user_id = ?', [
        endpointHash(input.endpoint),
        userId,
      ]);
      logger.business('WebPush 退订', { user_id: userId });
      ok(res, { message: '已退订' });
    } catch (err: any) {
      logger.error('WebPush 退订失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '退订失败');
    }
  });
}
