/**
 * 企业微信扫码登录 API
 */
const BASE = '/campus/api/v1/auth';

export interface WechatQrResponse {
  sessionId: string;
  qrCode: string;
}

export interface WechatPollResponse {
  /** rate_limited=被限流本轮跳过；expired=会话已过期需重新扫码 */
  status: 'starting' | 'scanning' | 'scanned' | 'done' | 'error' | 'rate_limited' | 'expired';
  qrCode?: string;
  token?: string;
  refresh_token?: string;
  user?: {
    isAdmin: boolean;
    authStatus: string;
    department: string;
  };
  sync?: {
    coursesImported: number;
    message: string;
  };
  message?: string;
}

export async function getWechatQr(): Promise<WechatQrResponse> {
  const res = await fetch(BASE + '/wechat-qr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error(data.message || '获取二维码失败');
  return data.data;
}

export async function pollWechatLogin(sessionId: string): Promise<WechatPollResponse> {
  const res = await fetch(BASE + '/wechat-poll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  // 429 = 被限流，不是失败——本轮跳过，下一轮继续
  if (res.status === 429) return { status: 'rate_limited' };
  // 404 = 会话已过期/不存在，继续轮询无意义，提示重新扫码
  if (res.status === 404) return { status: 'expired', message: '会话已过期，请重新扫码' };
  const data = await res.json();
  if (data.code !== 0) throw new Error(data.message || '登录失败');
  return data.data;
}
