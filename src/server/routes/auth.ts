/**
 * 认证路由：登录（密码） + 修改密码 + 刷新 Token
 */
import { Request, Response } from 'express';
import { Pool } from 'mysql2/promise';
import bcrypt from 'bcrypt';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../jwt';
import { auth } from '../middleware/auth';
import { limiter } from '../middleware/limiter';
import { logger } from '../../utils/logger';
import { ErrorCode } from '../errors';
import { ok, fail, notFound, validate } from '../response';
import { loginSchema, setPasswordSchema } from '../validators';

export function registerAuthRoutes(app: any, pool: Pool) {
  // ── 登录/注册 ──
  app.post('/api/v1/auth/dev-login', limiter(5), async (req: Request, res: Response) => {
    try {
      const input = validate(res, loginSchema, req.body);
      if (!input) return;

      if (!input.password || input.password.length < 6) {
        return fail(res, 400, '密码至少6位');
      }

      const [rows]: any = await pool.query('SELECT * FROM users WHERE student_id = ?', [input.studentId]);
      let user: any;
      let isNew = false;
      const hasOrg = !!(input.orgLevel && input.position);

      if (rows.length > 0) {
        user = rows[0];
        // 学号已被注册且姓名不匹配 → 拒绝
        if (user.nickname !== input.fullName) {
          logger.security('学号姓名不匹配', { student_id: input.studentId, claimed: input.fullName, actual: user.nickname, ip: req.ip, trace_id: req._traceId });
          return fail(res, 409, '该学号已被其他姓名注册，请核对学号');
        }
        // 老用户：验证密码
        if (user.password_hash) {
          const valid = await bcrypt.compare(input.password, user.password_hash);
          if (!valid) {
            logger.security('密码错误', { student_id: input.studentId, ip: req.ip, trace_id: req._traceId });
            return fail(res, 401, '密码错误');
          }
        } else {
          // 第一次设密码
          const hash = await bcrypt.hash(input.password, 10);
          await pool.query('UPDATE users SET password_hash = ?, nickname = ? WHERE id = ?', [
            hash,
            input.fullName,
            user.id,
          ]);
          user.password_hash = hash;
          user.nickname = input.fullName;
        }
      } else {
        // 新用户：AI审核+组织审核
        isNew = true;
        const hash = await bcrypt.hash(input.password, 10);
        // AI 高置信度 + 无组织 → 自动认证；有组织 → 待管理员人工审核
        const autoVerified = input.confidence === 'high' && !hasOrg;
        const initialStatus = autoVerified ? 'verified' : 'pending';
        const [result]: any = await pool.query(
          "INSERT INTO users (student_id, nickname, auth_status, password_hash, department, org_level, org_name, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [input.studentId, input.fullName, initialStatus, hash, input.department || null, input.orgLevel || '', input.orgName || '', input.position || ''],
        );
        user = {
          id: result.insertId,
          student_id: input.studentId,
          nickname: input.fullName,
          auth_status: initialStatus,
          is_admin: false,
          department: input.department || null,
          org_level: input.orgLevel || '',
          org_name: input.orgName || '',
          position: input.position || '',
        };
        if (autoVerified) {
          logger.business('AI自动认证', { user_id: user.id, confidence: input.confidence, trace_id: req._traceId });
        } else if (hasOrg) {
          logger.business('组织申请待审核', { user_id: user.id, org_level: input.orgLevel, position: input.position, trace_id: req._traceId });
        }
      }

      // 老用户登录时同步更新组织信息
      if (!isNew && (input.department || input.orgLevel || input.orgName || input.position)) {
        await pool.query(
          'UPDATE users SET department = COALESCE(?, department), org_level = COALESCE(NULLIF(?, \'\'), org_level), org_name = COALESCE(NULLIF(?, \'\'), org_name), position = COALESCE(NULLIF(?, \'\'), position) WHERE id = ?',
          [input.department || null, input.orgLevel || '', input.orgName || '', input.position || '', user.id],
        ).catch(() => {});
      }

      const isAdmin = !!user.is_admin;
      const accessToken = signAccessToken(user.id, isAdmin);
      const refreshToken = signRefreshToken(user.id);
      // 设备指纹：User-Agent 前 180 字符 + IP
      const deviceInfo = ((req.headers['user-agent'] as string) || '').slice(0, 180) || null;
      const clientIp = req.ip || req.socket.remoteAddress || '';

      // 事务：refresh_token 写入（删除旧 token + 插入新 token 原子操作）
      // 注意：users 表 INSERT/UPDATE 在事务外执行（不影响登录功能）
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query('DELETE FROM refresh_tokens WHERE user_id = ?', [user.id]);
        await conn.query(
          'INSERT INTO refresh_tokens (user_id, token, expires_at, device_info, ip_address) VALUES (?, ?, FROM_UNIXTIME(?), ?, ?)',
          [user.id, refreshToken, Math.floor(Date.now() / 1000) + 2592000, deviceInfo, clientIp],
        );
        await conn.commit();

        // 记录登录时间和IP（事务外，不影响登录）
        pool.query('UPDATE users SET last_login = NOW(), ip_address = ? WHERE id = ?', [req.ip || req.socket.remoteAddress || '', user.id])
          .catch(() => {});

        logger.business('用户登录', {
          user_id: user.id,
          student_id: input.studentId,
          is_new: isNew,
          is_admin: isAdmin,
          trace_id: req._traceId,
        });
        ok(res, { token: accessToken, refresh_token: refreshToken, user: { isAdmin, authStatus: user.auth_status, avatarUrl: user.avatar_url || '', coverUrl: user.cover_url || '', bio: user.bio || '', department: user.department || '', orgLevel: user.org_level || '', orgName: user.org_name || '', position: user.position || '' } });
      } catch (err: any) {
        await conn.rollback();
        logger.error('认证事务失败', { error: err.message, user_id: user.id, trace_id: req._traceId });
        fail(res, 500, '认证失败');
      } finally {
        conn.release();
      }
    } catch (err: any) {
      logger.error('登录失败', { error: err.message, trace_id: req._traceId });
      fail(res, 500, '登录失败');
    }
  });

  // ── 刷新 Token ──
  app.post('/api/v1/auth/refresh', limiter(10), async (req: Request, res: Response) => {
    try {
      const input = validate(res, z.object({ refresh_token: z.string().min(1, '缺少 refresh_token') }), req.body);
      if (!input) return;

      const payload = verifyRefreshToken(input.refresh_token);
      if (!payload) return fail(res, 401, 'Token 无效或已过期', ErrorCode.TOKEN_EXPIRED);

      const [rows]: any = await pool.query('SELECT * FROM refresh_tokens WHERE token = ?', [input.refresh_token]);
      if (rows.length === 0) return fail(res, 401, 'Token 已被撤销');

      const currentIp = req.ip || req.socket.remoteAddress || '';
      const storedIp = rows[0].ip_address;
      // IP 变更告警（不拒绝，移动网络 IP 常变，但记录安全日志）
      if (storedIp && currentIp && storedIp !== currentIp) {
        logger.security('Refresh Token IP变更', {
          user_id: payload.uid,
          stored_ip: storedIp,
          current_ip: currentIp,
          trace_id: req._traceId,
        });
      }

      const [userRows]: any = await pool.query('SELECT * FROM users WHERE id = ?', [payload.uid]);
      if (userRows.length === 0) return fail(res, 404, '用户不存在');

      const user = userRows[0];
      const isAdmin = !!user.is_admin;

      const deviceInfo = ((req.headers['user-agent'] as string) || '').slice(0, 180) || null;
      // 记录旧 token 使用次数
      await pool.query(
        'UPDATE refresh_tokens SET last_used_at = NOW(), use_count = use_count + 1 WHERE token = ?',
        [input.refresh_token],
      ).catch(() => {});
      await pool.query('DELETE FROM refresh_tokens WHERE token = ?', [input.refresh_token]);

      const newAccess = signAccessToken(user.id, isAdmin);
      const newRefresh = signRefreshToken(user.id);
      await pool.query(
        'INSERT INTO refresh_tokens (user_id, token, expires_at, device_info, ip_address) VALUES (?, ?, FROM_UNIXTIME(?), ?, ?)',
        [user.id, newRefresh, Math.floor(Date.now() / 1000) + 2592000, deviceInfo, currentIp],
      );

      logger.business('Token刷新', { user_id: user.id, trace_id: req._traceId });
      ok(res, { token: newAccess, refresh_token: newRefresh, isAdmin });
    } catch (err: any) {
      logger.error('Token刷新失败', { error: err.message, trace_id: req._traceId });
      fail(res, 500, '刷新失败');
    }
  });

  // ── 退出 ──
  app.post('/api/v1/auth/logout', auth, limiter(10), async (req: Request, res: Response) => {
    try {
      await pool.query('DELETE FROM refresh_tokens WHERE user_id = ?', [req.userId]);
      logger.business('用户退出', { user_id: req.userId, trace_id: req._traceId });
      ok(res, null, '已退出');
    } catch (err: any) {
      logger.error('退出失败', { error: err.message, user_id: req.userId, trace_id: req._traceId });
      fail(res, 500, '退出失败');
    }
  });

  // ── 修改密码 ──
  app.put('/api/v1/auth/password', auth, limiter(3), async (req: Request, res: Response) => {
    try {
      const input = validate(res, setPasswordSchema, req.body);
      if (!input) return;

      const [rows]: any = await pool.query('SELECT * FROM users WHERE id = ?', [req.userId]);
      if (rows.length === 0) return fail(res, 404, '用户不存在');

      if (rows[0].password_hash) {
        if (!input.oldPassword) return fail(res, 400, '请输入旧密码');
        const valid = await bcrypt.compare(input.oldPassword, rows[0].password_hash);
        if (!valid) return fail(res, 401, '旧密码错误');
      }

      const hash = await bcrypt.hash(input.password, 10);
      await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.userId]);
      logger.business('密码已修改', { user_id: req.userId, trace_id: req._traceId });
      ok(res, null, '密码设置成功');
    } catch (err: any) {
      logger.error('修改密码失败', { error: err.message, user_id: req.userId, trace_id: req._traceId });
      fail(res, 500, '修改密码失败');
    }
  });

  // ── 头像上传 ──
  const avatarUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        const dir = path.join(process.cwd(), 'uploads', 'avatars');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (_req, _file, cb) => {
        const uid = (_req as any).userId || 'unknown';
        cb(null, `avatar-${uid}-${Date.now()}${path.extname(_file.originalname) || '.jpg'}`);
      },
    }),
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter: (_req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']; if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(new Error('仅支持 JPG/PNG/WebP/GIF 格式'));
    },
  });

  app.post('/api/v1/auth/avatar', auth, limiter(5), avatarUpload.single('avatar'), async (req: Request, res: Response) => {
    try {
      if (!req.file) return fail(res, 400, '请选择图片');
      const avatarUrl = `/campus/uploads/avatars/${req.file.filename}`;
      await pool.query('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, req.userId]);
      logger.business('头像更新', { user_id: req.userId, trace_id: req._traceId });
      ok(res, { avatar_url: avatarUrl });
    } catch (err: any) {
      logger.error('头像上传失败', { error: err.message, user_id: req.userId, trace_id: req._traceId });
      fail(res, 500, '头像上传失败');
    }
  });

  // ── 封面上传 ──
  const coverUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        const dir = path.join(process.cwd(), 'uploads', 'covers');
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (req: any, _file, cb) => {
        const uid = req.userId || 'unknown';
        cb(null, `cover-${uid}-${Date.now()}${path.extname(_file.originalname) || '.jpg'}`);
      },
    }),
    limits: { fileSize: 4 * 1024 * 1024 }, // 封面允许 4MB
    fileFilter: (_req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']; if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(new Error('仅支持 JPG/PNG/WebP/GIF 格式'));
    },
  });

  app.post('/api/v1/auth/cover', auth, limiter(5), coverUpload.single('cover'), async (req: Request, res: Response) => {
    try {
      if (!req.file) return fail(res, 400, '请选择图片');
      const coverUrl = `/campus/uploads/covers/${req.file.filename}`;
      await pool.query('UPDATE users SET cover_url = ? WHERE id = ?', [coverUrl, req.userId]);
      logger.business('封面更新', { user_id: req.userId, trace_id: req._traceId });
      ok(res, { cover_url: coverUrl });
    } catch (err: any) {
      logger.error('封面上传失败', { error: err.message, user_id: req.userId, trace_id: req._traceId });
      fail(res, 500, '封面上传失败');
    }
  });

  // ── 更新个人资料（签名等）──
  const updateProfileSchema = z.object({ bio: z.string().max(80).optional() });
  app.put('/api/v1/auth/profile', auth, limiter(10), async (req: Request, res: Response) => {
    try {
      const input = validate(res, updateProfileSchema, req.body);
      if (!input) return;
      if (input.bio !== undefined) {
        await pool.query('UPDATE users SET bio = ? WHERE id = ?', [input.bio || null, req.userId]);
      }
      logger.business('个人资料更新', { user_id: req.userId, trace_id: req._traceId });
      ok(res, { bio: input.bio || '' });
    } catch (err: any) {
      logger.error('资料更新失败', { error: err.message, user_id: req.userId, trace_id: req._traceId });
      fail(res, 500, '更新失败');
    }
  });

  // ── 公开用户主页信息 ──
  app.get('/api/v1/users/:id/public-profile', async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id as string);
      if (!userId || userId < 1) return fail(res, 400, '无效的用户ID');

      const [users]: any = await pool.query(
        'SELECT id, nickname, avatar_url, cover_url, bio, department, org_level, org_name, position, auth_status, created_at FROM users WHERE id = ?',
        [userId],
      );
      if (users.length === 0) return notFound(res, '用户不存在');
      const u = users[0];

      // 统计该用户近30天发布的帖子数
      const [postCount]: any = await pool.query(
        "SELECT COUNT(*) AS cnt FROM posts WHERE user_id = ? AND status = 'active' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)",
        [userId],
      );

      ok(res, {
        id: u.id,
        nickname: u.nickname,
        avatarUrl: u.avatar_url || '',
        coverUrl: u.cover_url || '',
        bio: u.bio || '',
        department: u.department || '',
        orgLevel: u.org_level || '',
        orgName: u.org_name || '',
        position: u.position || '',
        isVerified: u.auth_status === 'verified',
        activePosts: postCount[0]?.cnt || 0,
        joinedAt: u.created_at?.toISOString().substring(0, 10) || '',
      });
    } catch (err: any) {
      logger.error('获取用户信息失败', { error: err.message, trace_id: req._traceId });
      fail(res, 500, '获取用户信息失败');
    }
  });
}
