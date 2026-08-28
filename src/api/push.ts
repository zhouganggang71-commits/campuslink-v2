/**
 * Web Push API
 */
import { request } from './client';

export const pushApi = {
  /** 获取 VAPID 公钥（订阅时作为 applicationServerKey） */
  getVapidKey() {
    return request<{ key: string }>('GET', '/push/vapid-key');
  },

  /** 注册本设备订阅（服务端幂等 upsert，成功后回发一条测试推送） */
  subscribe(sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    return request<{ message: string; testPush: boolean }>('POST', '/push/subscribe', sub);
  },

  /** 删除本设备订阅 */
  unsubscribe(endpoint: string) {
    return request<{ message: string }>('POST', '/push/unsubscribe', { endpoint });
  },
};
