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
import { signAccessToken, signRefreshToken, verifyRefreshToken, hashToken } from '../jwt';
import { auth } from '../middleware/auth';
import { limiter } from '../middleware/limiter';
import { logger } from '../../utils/logger';
import { ErrorCode } from '../errors';
import { ok, fail, notFound, validate } from '../response';
import { setPasswordSchema } from '../validators';
import { validateImageMagic } from './upload';

export function registerAuthRoutes(app: any, pool: Pool) {
  // ── 登录/注册：已停用 ──
  // 2026-08-28 起只保留企业微信扫码登录（/api/v1/auth/wechat-*，教务系统为权威身份源）。
  // 密码注册/登录接口 dev-login 整体移除，防止绕过扫码直接注册。
  app.post('/api/v1/auth/dev-login', limiter(5, 20), (_req: Request, res: Response) => {
    fail(res, 404, '账号密码登录已停用，请使用企业微信扫码登录');
  });

  // ── 当前用户信息（页面刷新后用 token 恢复登录态） ──
  app.get('/api/v1/auth/me', auth, limiter(30), async (req: Request, res: Response) => {
    try {
      const [rows]: any = await pool.query(
        'SELECT id, student_id, nickname, auth_status, is_admin, avatar_url, cover_url, bio, department, org_level, org_name, position, gender, gender_visible FROM users WHERE id = ?',
        [req.userId],
      );
      if (rows.length === 0) return notFound(res, '用户不存在');
      const u = rows[0];
      ok(res, {
        id: u.id,
        studentId: u.student_id,
        nickname: u.nickname,
        authStatus: u.auth_status,
        isAdmin: !!u.is_admin,
        avatarUrl: u.avatar_url || '',
        coverUrl: u.cover_url || '',
        bio: u.bio || '',
        department: u.department || '',
        orgLevel: u.org_level || '',
        orgName: u.org_name || '',
        position: u.position || '',
        gender: u.gender || null,
        genderVisible: !!u.gender_visible,
      });
    } catch (err: any) {
      logger.error('获取当前用户失败', { error: err.message, user_id: req.userId, trace_id: req._traceId });
      fail(res, 500, '获取用户信息失败');
    }
  });

  // ── 刷新 Token ──
  app.post('/api/v1/auth/refresh', limiter(10), async (req: Request, res: Response) => {
    try {
      const input = validate(res, z.object({ refresh_token: z.string().min(1, '缺少 refresh_token') }), req.body);
      if (!input) return;

      const payload = verifyRefreshToken(input.refresh_token);
      if (!payload) return fail(res, 401, 'Token 无效或已过期', ErrorCode.TOKEN_EXPIRED);

      const tokenHash = hashToken(input.refresh_token);
      const [rows]: any = await pool.query('SELECT * FROM refresh_tokens WHERE user_id = ? AND token_hash = ?', [
        payload.uid,
        tokenHash,
      ]);
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
      await pool
        .query(
          'UPDATE refresh_tokens SET last_used_at = NOW(), use_count = use_count + 1 WHERE user_id = ? AND token_hash = ?',
          [payload.uid, tokenHash],
        )
        .catch(() => {});
      await pool.query('DELETE FROM refresh_tokens WHERE user_id = ? AND token_hash = ?', [payload.uid, tokenHash]);

      const newAccess = signAccessToken(user.id, isAdmin);
      const newRefresh = signRefreshToken(user.id);
      await pool.query(
        'INSERT INTO refresh_tokens (user_id, token_hash, expires_at, device_info, ip_address) VALUES (?, ?, FROM_UNIXTIME(?), ?, ?)',
        [user.id, hashToken(newRefresh), Math.floor(Date.now() / 1000) + 2592000, deviceInfo, currentIp],
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
  app.put('/api/v1/auth/password', auth, limiter(3, 5), async (req: Request, res: Response) => {
    try {
      const input = validate(res, setPasswordSchema, req.body);
      if (!input) return;

      const [rows]: any = await pool.query('SELECT * FROM users WHERE id = ?', [req.userId]);
      if (rows.length === 0) return fail(res, 404, '用户不存在');

      if (rows[0].password_hash) {
        if (!input.oldPassword) {
          // 密码找回：教务扫码登录的会话（amr=scan）身份已由教务系统权威确认，允许免旧密码重设
          if (req.authMethod !== 'scan') return fail(res, 400, '请输入旧密码');
          logger.security('扫码会话免旧密码重设密码', { user_id: req.userId, ip: req.ip, trace_id: req._traceId });
        } else {
          const valid = await bcrypt.compare(input.oldPassword, rows[0].password_hash);
          if (!valid) return fail(res, 401, '旧密码错误');
        }
      }

      const hash = await bcrypt.hash(input.password, 10);
      await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.userId]);
      // 改密后吊销全部 refresh token（防旧会话继续续期，当前 access token 剩余有效期内仍可用）
      await pool.query('DELETE FROM refresh_tokens WHERE user_id = ?', [req.userId]).catch(() => {});
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
        cb(null, `avatar-${uid}-${Date.now()}.jpg`);
      },
    }),
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter: (_req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(null, false);
    },
  });

  app.post(
    '/api/v1/auth/avatar',
    auth,
    limiter(5),
    avatarUpload.single('avatar'),
    async (req: Request, res: Response) => {
      try {
        if (!req.file) return fail(res, 400, '请选择图片');
        if (!validateImageMagic(req.file.path, req.file.mimetype)) {
          fs.unlink(req.file.path, () => {});
          logger.security('头像上传伪造类型', {
            mimetype: req.file.mimetype,
            originalname: req.file.originalname,
            size: req.file.size,
            ip: req.ip,
            trace_id: req._traceId,
          });
          return fail(res, 400, '仅支持 JPG/PNG/WebP/GIF 格式图片');
        }
        const avatarUrl = `/campus/uploads/avatars/${req.file.filename}`;
        await pool.query('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, req.userId]);
        logger.business('头像更新', { user_id: req.userId, trace_id: req._traceId });
        ok(res, { avatar_url: avatarUrl });
      } catch (err: any) {
        logger.error('头像上传失败', { error: err.message, user_id: req.userId, trace_id: req._traceId });
        fail(res, 500, '头像上传失败');
      }
    },
  );

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
        cb(null, `cover-${uid}-${Date.now()}.jpg`);
      },
    }),
    limits: { fileSize: 4 * 1024 * 1024 }, // 封面允许 4MB
    fileFilter: (_req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(null, false);
    },
  });

  app.post('/api/v1/auth/cover', auth, limiter(5), coverUpload.single('cover'), async (req: Request, res: Response) => {
    try {
      if (!req.file) return fail(res, 400, '请选择图片');
      if (!validateImageMagic(req.file.path, req.file.mimetype)) {
        fs.unlink(req.file.path, () => {});
        logger.security('封面上传伪造类型', {
          mimetype: req.file.mimetype,
          originalname: req.file.originalname,
          size: req.file.size,
          ip: req.ip,
          trace_id: req._traceId,
        });
        return fail(res, 400, '仅支持 JPG/PNG/WebP/GIF 格式图片');
      }
      const coverUrl = `/campus/uploads/covers/${req.file.filename}`;
      await pool.query('UPDATE users SET cover_url = ? WHERE id = ?', [coverUrl, req.userId]);
      logger.business('封面更新', { user_id: req.userId, trace_id: req._traceId });
      ok(res, { cover_url: coverUrl });
    } catch (err: any) {
      logger.error('封面上传失败', { error: err.message, user_id: req.userId, trace_id: req._traceId });
      fail(res, 500, '封面上传失败');
    }
  });

  // ── 更新个人资料（签名/性别等）──
  const updateProfileSchema = z.object({
    bio: z.string().max(80).optional(),
    gender: z.enum(['male', 'female']).nullable().optional(),
    genderVisible: z.boolean().optional(),
  });
  app.put('/api/v1/auth/profile', auth, limiter(10), async (req: Request, res: Response) => {
    try {
      const input = validate(res, updateProfileSchema, req.body);
      if (!input) return;
      if (input.bio !== undefined) {
        await pool.query('UPDATE users SET bio = ? WHERE id = ?', [input.bio || null, req.userId]);
      }
      if (input.gender !== undefined) {
        await pool.query('UPDATE users SET gender = ? WHERE id = ?', [input.gender, req.userId]);
      }
      if (input.genderVisible !== undefined) {
        await pool.query('UPDATE users SET gender_visible = ? WHERE id = ?', [input.genderVisible, req.userId]);
      }
      logger.business('个人资料更新', { user_id: req.userId, trace_id: req._traceId });
      // 只传了部分字段时，返回更新后的完整状态，避免前端拿局部响应覆盖出错误状态
      const [rows]: any = await pool.query('SELECT bio, gender, gender_visible FROM users WHERE id = ?', [req.userId]);
      const u = rows[0] || {};
      ok(res, { bio: u.bio || '', gender: u.gender || null, genderVisible: !!u.gender_visible });
    } catch (err: any) {
      logger.error('资料更新失败', { error: err.message, user_id: req.userId, trace_id: req._traceId });
      fail(res, 500, '更新失败');
    }
  });

  // ── 公开用户主页信息 ──
  app.get('/api/v1/users/:id/public-profile', limiter(30), async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id as string);
      if (!userId || userId < 1) return fail(res, 400, '无效的用户ID');

      const [users]: any = await pool.query(
        'SELECT id, nickname, avatar_url, cover_url, bio, department, org_level, org_name, position, auth_status, created_at, gender, gender_visible FROM users WHERE id = ?',
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
        gender: u.gender_visible ? u.gender || null : null,
      });
    } catch (err: any) {
      logger.error('获取用户信息失败', { error: err.message, trace_id: req._traceId });
      fail(res, 500, '获取用户信息失败');
    }
  });

  // ── 校内寻伴：按同专业/同院系推荐认证用户（R12 Phase 3）──
  // 数据优势：department/major 来自教务扫码（认证数据），比竞品"用户自填"可信
  app.get('/api/v1/users/peers', auth, limiter(20), async (req: Request, res: Response) => {
    try {
      const uid = (req as any).userId;
      const scope = (req.query.scope as string) || 'major'; // major | department | all
      const limit = Math.min(50, parseInt(req.query.limit as string) || 20);

      // 先取我的院系/专业
      const [meRows]: any = await pool.query('SELECT department, major FROM users WHERE id = ?', [uid]);
      if (!meRows.length) return fail(res, 404, '用户不存在');
      const myDept = meRows[0].department || '';
      const myMajor = meRows[0].major || '';

      const orderBy =
        scope === 'all'
          ? 'u.last_active DESC'
          : scope === 'department'
            ? "(u.department = ? AND u.department != '') DESC, u.last_active DESC"
            : "(u.major = ? AND u.major != '') DESC, (u.department = ? AND u.department != '') DESC, u.last_active DESC";
      // ⚠️ 参数顺序必须与 SQL 占位符顺序一致：
      //   b1.blocked_user_id → b2.user_id → u.id（WHERE）→ ORDER BY 占位 → LIMIT
      const params: any[] = [uid, uid, uid];
      if (scope === 'department') params.push(myDept);
      if (scope === 'major') params.push(myMajor, myDept);
      params.push(limit);

      const [rows]: any = await pool.query(
        `SELECT u.id, u.nickname, u.avatar_url, u.department, u.major, u.last_active, u.reputation_score, u.review_count
         FROM users u
         LEFT JOIN user_blocks b1 ON b1.user_id = u.id AND b1.blocked_user_id = ?
         LEFT JOIN user_blocks b2 ON b2.user_id = ? AND b2.blocked_user_id = u.id
         WHERE u.id != ? AND u.auth_status = 'verified' AND b1.id IS NULL AND b2.id IS NULL
         ORDER BY ${orderBy} LIMIT ?`,
        params,
      );
      // 只吐安全字段，不吐学号/联系方式
      ok(res, {
        list: rows.map((u: any) => ({
          userId: u.id,
          nickname: u.nickname,
          avatarUrl: u.avatar_url,
          department: u.department,
          major: u.major,
          lastActive: u.last_active,
          reputationScore: u.reputation_score,
          reviewCount: u.review_count,
          isSameMajor: !!myMajor && u.major === myMajor,
          isSameDept: !!myDept && u.department === myDept,
        })),
        my: { department: myDept, major: myMajor },
      });
    } catch (err: any) {
      logger.error('校内寻伴查询失败', { error: err.message, trace_id: req._traceId });
      fail(res, 500, '获取失败');
    }
  });
}
