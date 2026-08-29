import { Request, Response, NextFunction } from 'express';
/**
 * 认证中间件 + 管理员认证 + 身份审核
 */
import { verifyAccessToken } from '../jwt';
import { pool } from '../db';
import { logger } from '../../utils/logger';

const verifiedCache = new Map<number, { verified: boolean; time: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟

// 每分钟清理过期缓存
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of verifiedCache) {
    if (now - entry.time > CACHE_TTL) verifiedCache.delete(key);
  }
}, 60_000);

export function auth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    logger.security('未登录访问受保护接口', { path: req.originalUrl, ip: req.ip, trace_id: req._traceId });
    return res.status(401).json({ code: -1, message: '未登录' });
  }

  const adminKey = process.env.ADMIN_KEY;
  if (adminKey && token === adminKey) {
    // 紧急恢复密钥：仅限本机访问，记录审计日志
    const isLocal = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
    if (!isLocal) {
      logger.security('ADMIN_KEY 远程访问被拒', { ip: req.ip, path: req.originalUrl, trace_id: req._traceId });
      return res.status(403).json({ code: -1, message: 'ADMIN_KEY 仅限本机使用' });
    }
    logger.security('ADMIN_KEY 本机认证（紧急恢复）', { path: req.originalUrl, ip: req.ip, trace_id: req._traceId });
    req.userId = 0;
    req.isAdmin = true;
    req.isVerified = true;
    return next();
  }

  const user = verifyAccessToken(token);
  if (!user) {
    logger.security('Token 验证失败', { path: req.originalUrl, ip: req.ip, trace_id: req._traceId });
    return res.status(401).json({ code: -1, message: '登录已过期' });
  }
  req.userId = user.uid;
  req.isAdmin = user.admin;
  req.authMethod = user.amr;

  const cached = verifiedCache.get(user.uid);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    req.isVerified = cached.verified;
    return next();
  }

  pool
    .query('SELECT auth_status FROM users WHERE id = ?', [user.uid])
    .then(([rows]: any) => {
      const status = rows[0]?.auth_status;
      const ok = status === 'verified' || status === 'org_verified';
      verifiedCache.set(user.uid, { verified: ok, time: Date.now() });
      req.isVerified = ok;
      next();
    })
    .catch(() => {
      req.isVerified = false;
      next();
    });
}

/**
 * 可选认证：带合法 token 则填充 userId/isAdmin/isVerified，不带或非法则以匿名身份放行。
 * 用于公开接口按登录态区分返回内容（如帖子联系方式）。
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  req.userId = undefined as any;
  req.isAdmin = false;
  req.isVerified = false;

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return next();

  const user = verifyAccessToken(token);
  if (!user) return next(); // token 非法 → 匿名放行，不报 401

  req.userId = user.uid;
  req.isAdmin = user.admin;
  req.authMethod = user.amr;

  const cached = verifiedCache.get(user.uid);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    req.isVerified = cached.verified;
    return next();
  }

  pool
    .query('SELECT auth_status FROM users WHERE id = ?', [user.uid])
    .then(([rows]: any) => {
      const status = rows[0]?.auth_status;
      const ok = status === 'verified' || status === 'org_verified';
      verifiedCache.set(user.uid, { verified: ok, time: Date.now() });
      req.isVerified = ok;
      next();
    })
    .catch(() => next());
}

/** 管理后台 IP 白名单：本机 / 内网 / Tailscale 网段直接放行，不再需要 ADMIN_KEY */
function isAdminAllowedIp(ip: string): boolean {
  if (!ip) return false;
  const clean = ip.replace(/^::ffff:/, ''); // IPv4-mapped IPv6 统一成 IPv4
  if (clean === '127.0.0.1' || clean === '::1') return true; // 本机（含 SSH 隧道来源）
  if (clean.startsWith('192.168.')) return true; // 内网
  if (clean.startsWith('100.')) return true; // Tailscale CGNAT 100.64.0.0/10
  if (clean.startsWith('10.')) return true; // 私网 A 类（备用）
  return false;
}

export function adminAuth(req: Request, res: Response, next: NextFunction) {
  // 2026-08-28 起：IP 白名单替代 ADMIN_KEY。本机（SSH 隧道）/ 内网 / Tailscale 网段直接放行，公网一律拒绝。
  if (isAdminAllowedIp(req.ip || '')) {
    req.userId = 0;
    req.isAdmin = true;
    return next();
  }
  logger.security('管理接口公网访问被拒', { ip: req.ip, path: req.originalUrl, trace_id: req._traceId });
  return res.status(403).json({ code: -1, message: '管理后台仅限内网访问' });
}

export function clearAuthCache(userId: number) {
  verifiedCache.delete(userId);
}
