/**
 * JWT 工具 — 基于 jsonwebtoken 标准库
 * 替代手写 HMAC token，提供标准过期校验、算法白名单等安全特性
 */
import jwt from 'jsonwebtoken';

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`缺少必需环境变量: ${name}`);
  return val;
}

const JWT_SECRET = requireEnv('JWT_SECRET');
const ACCESS_EXPIRY = '1h';
const REFRESH_EXPIRY = '30d';

export interface AccessTokenPayload {
  uid: number;
  admin: boolean;
}

export interface RefreshTokenPayload {
  uid: number;
}

export function signAccessToken(userId: number, isAdmin: boolean = false): string {
  return jwt.sign({ uid: userId, admin: isAdmin, type: 'access' }, JWT_SECRET, { expiresIn: ACCESS_EXPIRY });
}

export function signRefreshToken(userId: number): string {
  return jwt.sign({ uid: userId, type: 'refresh' }, JWT_SECRET, { expiresIn: REFRESH_EXPIRY });
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    if (payload.type && payload.type !== 'access') return null;
    return { uid: payload.uid, admin: !!payload.admin };
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    if (payload.type && payload.type !== 'refresh') return null;
    return { uid: payload.uid };
  } catch {
    return null;
  }
}
