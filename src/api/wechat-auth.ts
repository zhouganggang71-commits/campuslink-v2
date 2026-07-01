/**
 * 企业微信扫码登录 API
 */
const BASE = '/campus/api/v1/auth';

export interface WechatQrResponse {
  sessionId: string;
  qrCode: string;
}

export interface WechatPollResponse {
  status: 'starting' | 'scanning' | 'scanned' | 'done' | 'error';
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
  const data = await res.json();
  if (data.code !== 0) throw new Error(data.message || '登录失败');
  return data.data;
}
