/**
 * JWT 工具 — 基于 jsonwebtoken 标准库
 * 替代手写 HMAC token，提供标准过期校验、算法白名单等安全特性
 */
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from './envSchema';

const JWT_SECRET = env.JWT_SECRET;
const ACCESS_EXPIRY = '1h';
const REFRESH_EXPIRY = '30d';

/** amr = 认证方式：password 密码登录 / scan 教务扫码（权威身份源，可免旧密码重设密码） */
export type AuthMethod = 'password' | 'scan';

export interface AccessTokenPayload {
  uid: number;
  admin: boolean;
  amr: AuthMethod;
}

export interface RefreshTokenPayload {
  uid: number;
}

export function signAccessToken(userId: number, isAdmin: boolean = false, amr: AuthMethod = 'password'): string {
  return jwt.sign({ uid: userId, admin: isAdmin, amr, type: 'access' }, JWT_SECRET, { expiresIn: ACCESS_EXPIRY });
}

export function signRefreshToken(userId: number): string {
  return jwt.sign({ uid: userId, type: 'refresh' }, JWT_SECRET, { expiresIn: REFRESH_EXPIRY });
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    if (payload.type !== 'access') return null;
    return { uid: payload.uid, admin: !!payload.admin, amr: payload.amr === 'scan' ? 'scan' : 'password' };
  } catch {
    return null;
  }
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function verifyRefreshToken(token: string): RefreshTokenPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    if (payload.type !== 'refresh') return null;
    return { uid: payload.uid };
  } catch {
    return null;
  }
}
