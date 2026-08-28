/**
 * Web Push 发送封装
 * - VAPID 密钥缺失时优雅降级（isPushConfigured=false，路由返 503，不影响其他模块）
 * - 404/410（订阅已失效）自动清理对应订阅行
 * - 供其他模块调用 sendPushToUser 给某用户的全部设备推送
 */
import webpush from 'web-push';
import crypto from 'crypto';
import { logger } from '../utils/logger';

export interface PushPayload {
  title: string;
  body: string;
  /** 点击通知打开的路径，默认 /campus/ */
  url?: string;
  /** 相同 tag 的通知会互相覆盖（如同一会话的多条私信） */
  tag?: string;
}

let configured = false;

export function initPush(): void {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@jhcaishui.cn';
  if (!pub || !priv) {
    logger.business('WebPush 未配置（缺 VAPID 密钥），推送功能停用', {});
    return;
  }
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
}

export function isPushConfigured(): boolean {
  return configured;
}

export function getVapidPublicKey(): string {
  return process.env.VAPID_PUBLIC_KEY || '';
}

export function endpointHash(endpoint: string): string {
  return crypto.createHash('sha256').update(endpoint).digest('hex');
}

interface SubscriptionRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** 给单个订阅推送；订阅已失效(404/410)返回 'gone'，其他失败 'error'，成功 'ok' */
export async function sendToSubscription(sub: SubscriptionRow, payload: PushPayload): Promise<'ok' | 'gone' | 'error'> {
  if (!configured) return 'error';
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 3600 },
    );
    return 'ok';
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) return 'gone';
    logger.error('WebPush 发送失败', { status: statusCode, error: (err as Error).message });
    return 'error';
  }
}

/**
 * 广播给全部订阅设备（出分播报等运营场景用，管理员手动触发，不走调度器）。
 * 出分本身没有合法数据源可自动判定"是否已出分"（不存教务凭据、不能后台代查），
 * 这条路径承认这个限制，只做"运营手动喊一声去扫码同步查看"，不是自动化通知。
 */
export async function broadcastPush(pool: any, payload: PushPayload): Promise<{ sent: number; total: number }> {
  if (!configured) return { sent: 0, total: 0 };
  try {
    const [rows]: any = await pool.query('SELECT id, endpoint, p256dh, auth FROM push_subscriptions');
    if (!rows.length) return { sent: 0, total: 0 };

    let sent = 0;
    const goneIds: number[] = [];
    await Promise.all(
      (rows as SubscriptionRow[]).map(async (sub) => {
        const r = await sendToSubscription(sub, payload);
        if (r === 'ok') sent++;
        else if (r === 'gone') goneIds.push(sub.id);
      }),
    );

    if (goneIds.length) {
      await pool.query(`DELETE FROM push_subscriptions WHERE id IN (${goneIds.map(() => '?').join(',')})`, goneIds);
      logger.business('WebPush 广播清理失效订阅', { count: goneIds.length });
    }
    return { sent, total: rows.length };
  } catch (err: any) {
    logger.error('WebPush 广播失败', { error: err.message });
    return { sent: 0, total: 0 };
  }
}

/** 给用户全部设备推送，自动清理失效订阅。返回成功推送的设备数。 */
export async function sendPushToUser(pool: any, userId: number, payload: PushPayload): Promise<number> {
  if (!configured) return 0;
  try {
    const [rows]: any = await pool.query(
      'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?',
      [userId],
    );
    if (!rows.length) return 0;

    let sent = 0;
    const goneIds: number[] = [];
    await Promise.all(
      (rows as SubscriptionRow[]).map(async (sub) => {
        const r = await sendToSubscription(sub, payload);
        if (r === 'ok') sent++;
        else if (r === 'gone') goneIds.push(sub.id);
      }),
    );

    if (goneIds.length) {
      await pool.query(`DELETE FROM push_subscriptions WHERE id IN (${goneIds.map(() => '?').join(',')})`, goneIds);
      logger.business('WebPush 清理失效订阅', { user_id: userId, count: goneIds.length });
    }
    if (sent) {
      await pool.query('UPDATE push_subscriptions SET last_used_at = NOW() WHERE user_id = ?', [userId]);
    }
    return sent;
  } catch (err: any) {
    // push_subscriptions 表未迁移等情况：降级不影响调用方主流程
    logger.error('WebPush 推送用户失败', { user_id: userId, error: err.message });
    return 0;
  }
}
