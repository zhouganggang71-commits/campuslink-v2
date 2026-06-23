import { Request, Response, NextFunction } from "express";
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

export function adminAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    logger.security('未登录访问管理接口', { path: req.originalUrl, ip: req.ip, trace_id: req._traceId });
    return res.status(401).json({ code: -1, message: '未登录' });
  }

  const adminKey = process.env.ADMIN_KEY;
  if (adminKey && token === adminKey) {
    const isLocal = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
    if (!isLocal) {
      logger.security('ADMIN_KEY 远程访问管理接口被拒', { ip: req.ip, path: req.originalUrl, trace_id: req._traceId });
      return res.status(403).json({ code: -1, message: 'ADMIN_KEY 仅限本机使用' });
    }
    logger.security('ADMIN_KEY 本机管理认证（紧急恢复）', { path: req.originalUrl, trace_id: req._traceId });
    return next();
  }

  const user = verifyAccessToken(token);
  if (!user) {
    logger.security('Token 验证失败', { path: req.originalUrl, ip: req.ip, trace_id: req._traceId });
    return res.status(401).json({ code: -1, message: '登录已过期' });
  }
  if (!user.admin) {
    logger.security('非管理员访问管理接口', {
      path: req.originalUrl,
      ip: req.ip,
      user_id: user.uid,
      trace_id: req._traceId,
    });
    return res.status(403).json({ code: -1, message: '无权访问，仅限管理员' });
  }
  req.userId = user.uid;
  req.isAdmin = true;
  next();
}

export function clearAuthCache(userId: number) {
  verifiedCache.delete(userId);
}
