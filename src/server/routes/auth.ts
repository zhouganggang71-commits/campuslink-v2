/**
 * 认证路由：登录（密码） + 修改密码 + 刷新 Token
 */
import { Request, Response } from 'express';
import { Pool } from 'mysql2/promise';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../jwt';
import { auth } from '../middleware/auth';
import { limiter } from '../middleware/limiter';
import { logger } from '../../utils/logger';
import { ErrorCode } from '../errors';
import { ok, fail, validate } from '../response';
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

      if (rows.length > 0) {
        user = rows[0];
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
        // 新用户：创建账号
        isNew = true;
        const hash = await bcrypt.hash(input.password, 10);
        const [result]: any = await pool.query(
          "INSERT INTO users (student_id, nickname, auth_status, password_hash) VALUES (?, ?, 'pending', ?)",
          [input.studentId, input.fullName, hash],
        );
        user = {
          id: result.insertId,
          student_id: input.studentId,
          nickname: input.fullName,
          auth_status: 'pending',
          is_admin: false,
        };
      }

      const isAdmin = !!user.is_admin;
      const accessToken = signAccessToken(user.id, isAdmin);
      const refreshToken = signRefreshToken(user.id);

      // 事务：refresh_token 写入（删除旧 token + 插入新 token 原子操作）
      // 注意：users 表 INSERT/UPDATE 在事务外执行（不影响登录功能）
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query('DELETE FROM refresh_tokens WHERE user_id = ?', [user.id]);
        await conn.query('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, FROM_UNIXTIME(?))', [
          user.id,
          refreshToken,
          Math.floor(Date.now() / 1000) + 2592000,
        ]);
        await conn.commit();

        logger.business('用户登录', {
          user_id: user.id,
          student_id: input.studentId,
          is_new: isNew,
          is_admin: isAdmin,
          trace_id: req._traceId,
        });
        ok(res, { token: accessToken, refresh_token: refreshToken, user: { isAdmin, authStatus: user.auth_status } });
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

      const [userRows]: any = await pool.query('SELECT * FROM users WHERE id = ?', [payload.uid]);
      if (userRows.length === 0) return fail(res, 404, '用户不存在');

      const user = userRows[0];
      const isAdmin = !!user.is_admin;

      await pool.query('DELETE FROM refresh_tokens WHERE token = ?', [input.refresh_token]);

      const newAccess = signAccessToken(user.id, isAdmin);
      const newRefresh = signRefreshToken(user.id);
      await pool.query('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, FROM_UNIXTIME(?))', [
        user.id,
        newRefresh,
        Math.floor(Date.now() / 1000) + 2592000,
      ]);

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
}
