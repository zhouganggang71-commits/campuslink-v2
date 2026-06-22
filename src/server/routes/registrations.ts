import { Request, Response } from "express";
/**
 * 报名路由
 */
import { Pool } from 'mysql2/promise';
import { auth } from '../middleware/auth';
import { limiter } from '../middleware/limiter';
import { logger } from '../../utils/logger';
import { ok, fail, validate } from '../response';
import { registrationSchema } from '../validators';
import { encrypt, decrypt } from '../crypto';

export function registerRegistrationRoutes(app: any, pool: Pool) {
  app.post('/api/v1/registrations', auth, limiter(3), async (req: Request, res: Response) => {
    try {
      if (!req.isVerified) return fail(res, 403, '账号待审核，审核通过后才能报名');
      const input = validate(res, registrationSchema, req.body);
      if (!input) return;

      // 幂等检查：同一 idempotencyKey 拒绝重复提交
      if (input.idempotencyKey) {
        const [existing]: any = await pool.query(
          'SELECT id FROM registrations WHERE idempotency_key = ?',
          [input.idempotencyKey],
        );
        if (existing.length > 0) return ok(res, null, '报名成功');
      }

      await pool.query(
        `INSERT INTO registrations (listing_id, listing_title, registrant_name, student_id, department, phone, user_id, idempotency_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.listingId,
          input.listingTitle,
          encrypt(input.registrantName) || '',
          encrypt(input.studentId || '') || '',
          input.department || '',
          encrypt(input.phone) || '',
          req.userId,
        ],
      );
      logger.business('活动报名', {
        listing_id: input.listingId,
        listing_title: input.listingTitle.slice(0, 50),
        user_id: req.userId,
        trace_id: req._traceId,
      });
      ok(res, null, '报名成功');
    } catch (err: any) {
      logger.error('报名失败', { error: err.message, user_id: req.userId, trace_id: req._traceId});
      fail(res, 500, '报名失败');
    }
  });

  app.get('/api/v1/registrations', auth, async (req: Request, res: Response) => {
    try {
      const [joined]: any = await pool.query('SELECT * FROM registrations WHERE user_id = ? ORDER BY created_at DESC', [
        req.userId,
      ]);
      const [mine]: any = await pool.query(
        `SELECT r.* FROM registrations r
         JOIN posts p ON r.listing_id = p.id
         WHERE p.user_id = ? ORDER BY r.created_at DESC`,
        [req.userId],
      );
      // 解密敏感字段
      const decryptRow = (r: any) => ({
        ...r,
        registrant_name: decrypt(r.registrant_name) || r.registrant_name,
        student_id: decrypt(r.student_id) || r.student_id,
        phone: decrypt(r.phone) || r.phone,
      });
      ok(res, { joined: joined.map(decryptRow), mine: mine.map(decryptRow) });
    } catch (err: any) {
      logger.error('获取报名失败', { error: err.message, user_id: req.userId, trace_id: req._traceId});
      fail(res, 500, '获取报名数据失败');
    }
  });
}
