/**
 * 面交交易 + 信誉系统（R12 Phase 2）
 *
 * 流程：买家发起(pending) → 卖家同意生成 6 位面交码(code_issued，30 分钟有效)
 *      → 面交现场买家报码、卖家核销(verify) → completed（post 自动标 sold）→ 双方互评
 *
 * 规则：
 *   - 只有交易双方能操作（发起/同意/核销/取消/评价）
 *   - 一个帖子同时只允许一个进行中的交易（pending/code_issued）
 *   - 面交码 6 位数字、30 分钟过期、核销失败 5 次作废（防爆破）
 *   - 评价 1-5 星，一个订单每人只能评一次（唯一键兜底）
 *   - 信誉只展示不限制（reputation_score 平均分 + review_count）
 */
import { Request, Response } from 'express';
import { auth, optionalAuth } from '../middleware/auth';
import { limiter } from '../middleware/limiter';
import { logger } from '../../utils/logger';
import { ok, fail, validate } from '../response';
import { createTransactionSchema, verifyCodeSchema, reviewSchema } from '../validators';

const CODE_TTL_MINUTES = 30;
const MAX_VERIFY_ATTEMPTS = 5;

function genFaceCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000)); // 100000-999999
}

export function registerTransactionRoutes(app: any, pool: any) {
  // ── 买家发起面交交易 ──
  app.post('/api/v1/transactions', auth, limiter(10), async (req: Request, res: Response) => {
    try {
      const input = validate(res, createTransactionSchema, req.body);
      if (!input) return;
      const buyerId = (req as any).userId;

      // 事务 + 帖子行锁（FOR UPDATE）：防止两个买家并发同时通过检查产生两个 pending
      const conn = await pool.getConnection();
      let newTxId: number | null = null;
      let sellerInfo: { id: number; title: string } | null = null;
      try {
        await conn.beginTransaction();
        const [posts]: any = await conn.query(
          'SELECT id, user_id, title, status, post_type FROM posts WHERE id = ? FOR UPDATE',
          [input.postId],
        );
        if (!posts.length) {
          await conn.rollback();
          return fail(res, 404, '帖子不存在');
        }
        const post = posts[0];
        if (post.post_type !== 'sell') {
          await conn.rollback();
          return fail(res, 400, '只有二手出售支持面交交易');
        }
        if (post.status !== 'active') {
          await conn.rollback();
          return fail(res, 400, '帖子已下架或已售出');
        }
        if (post.user_id === buyerId) {
          await conn.rollback();
          return fail(res, 400, '不能购买自己的商品');
        }

        // 锁帖后重查进行中交易（并发下第二个事务会等锁，拿到最新状态）
        const [activeTx]: any = await conn.query(
          "SELECT id FROM transactions WHERE post_id = ? AND status IN ('pending','code_issued')",
          [input.postId],
        );
        if (activeTx.length) {
          await conn.rollback();
          return fail(res, 400, '该商品已有进行中的面交交易');
        }

        const result: any = await conn.query(
          'INSERT INTO transactions (post_id, seller_id, buyer_id, status) VALUES (?, ?, ?, ?)',
          [input.postId, post.user_id, buyerId, 'pending'],
        );
        newTxId = result[0].insertId;
        sellerInfo = { id: post.user_id, title: post.title };
        await conn.commit();
      } catch (txErr: any) {
        try {
          await conn.rollback();
        } catch {
          /* 忽略 */
        }
        throw txErr;
      } finally {
        conn.release();
      }

      // 通知卖家（事务外，失败不影响主流程）
      if (sellerInfo && newTxId) {
        try {
          await pool.query("INSERT INTO notices (user_id, title, content, category) VALUES (?, ?, ?, 'transaction')", [
            sellerInfo.id,
            '面交新申请',
            `有人想面交购买你的「${sellerInfo.title}」，请到「我的交易」确认`,
          ]);
        } catch (noticeErr: any) {
          logger.warn('面交申请通知写入失败', { error: noticeErr.message, post_id: input.postId });
        }
        logger.business('面交交易发起', {
          tx_id: newTxId,
          post_id: input.postId,
          buyer_id: buyerId,
          seller_id: sellerInfo.id,
        });
      }
      ok(res, { id: newTxId, status: 'pending' }, '已发起面交申请，等待卖家确认');
    } catch (err: any) {
      logger.error('发起面交交易失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '操作失败');
    }
  });

  // ── 惰性清理：pending 超过 24h 自动取消（卖家未确认视为放弃）──
  async function expireStalePending() {
    try {
      await pool.query(
        "UPDATE transactions SET status = 'cancelled' WHERE status = 'pending' AND created_at < NOW() - INTERVAL 24 HOUR",
      );
    } catch (e: any) {
      logger.warn('pending 超时清理失败', { error: e.message });
    }
  }

  // ── 帖子交易状态（详情页显示"交易中"）──
  app.get('/api/v1/transactions/post/:postId', auth, limiter(30), async (req: Request, res: Response) => {
    try {
      const postId = Number(req.params.postId);
      const uid = (req as any).userId;
      if (!Number.isInteger(postId) || postId <= 0) return fail(res, 400, '无效ID');
      await expireStalePending();
      const [rows]: any = await pool.query(
        `SELECT id, seller_id, buyer_id, status FROM transactions
         WHERE post_id = ? AND status IN ('pending','code_issued')
         ORDER BY created_at DESC LIMIT 1`,
        [postId],
      );
      if (!rows.length) return ok(res, { active: false });
      const tx = rows[0];
      ok(res, {
        active: true,
        transactionId: tx.id,
        status: tx.status,
        myRole: uid === tx.seller_id ? 'seller' : uid === tx.buyer_id ? 'buyer' : 'other',
      });
    } catch (err: any) {
      logger.error('帖子交易状态查询失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '获取失败');
    }
  });

  // ── 我的交易（作为买家或卖家）──
  app.get('/api/v1/transactions/mine', auth, limiter(30), async (req: Request, res: Response) => {
    try {
      await expireStalePending();
      const uid = (req as any).userId;
      const [rows]: any = await pool.query(
        `SELECT t.*, p.title AS post_title, p.price AS post_price, p.image_urls AS post_images,
                u.nickname AS other_name, u.avatar_url AS other_avatar,
                CASE WHEN t.seller_id = ? THEN 'seller' ELSE 'buyer' END AS my_role,
                -- 面交码只对卖家可见：买家只需"报码"，不应持有完整码（防冒名核销）
                CASE WHEN t.seller_id = ? THEN t.face_code ELSE NULL END AS face_code
         FROM transactions t
         JOIN posts p ON t.post_id = p.id
         JOIN users u ON u.id = CASE WHEN t.seller_id = ? THEN t.buyer_id ELSE t.seller_id END
         WHERE t.seller_id = ? OR t.buyer_id = ?
         ORDER BY t.updated_at DESC LIMIT 50`,
        [uid, uid, uid, uid, uid],
      );
      ok(res, rows);
    } catch (err: any) {
      logger.error('我的交易查询失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '获取失败');
    }
  });

  // ── 卖家同意 + 生成面交码 ──
  app.put('/api/v1/transactions/:id/accept', auth, limiter(10), async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const uid = (req as any).userId;
      const [txs]: any = await pool.query('SELECT * FROM transactions WHERE id = ?', [id]);
      if (!txs.length) return fail(res, 404, '交易不存在');
      const tx = txs[0];
      if (tx.seller_id !== uid) return fail(res, 403, '只有卖家可以确认');
      // pending 首次发码；code_issued 且过期/超限时重新生成（覆盖旧码）
      if (tx.status !== 'pending' && tx.status !== 'code_issued') return fail(res, 400, '当前状态不可确认');
      if (
        tx.status === 'code_issued' &&
        tx.face_code &&
        new Date(tx.code_expires_at).getTime() > Date.now() &&
        tx.verify_attempts < MAX_VERIFY_ATTEMPTS
      ) {
        return fail(res, 400, '当前面交码仍有效，可直接核销');
      }

      const code = genFaceCode();
      const expires = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);
      await pool.query(
        'UPDATE transactions SET status = ?, face_code = ?, code_expires_at = ?, verify_attempts = 0 WHERE id = ?',
        ['code_issued', code, expires, id],
      );
      // ── 通知买家：面交码已生成 ──
      try {
        const [postRows]: any = await pool.query('SELECT title FROM posts WHERE id = ?', [tx.post_id]);
        await pool.query("INSERT INTO notices (user_id, title, content, category) VALUES (?, ?, ?, 'transaction')", [
          tx.buyer_id,
          '面交码已生成',
          `卖家已确认「${postRows[0]?.title || '你的交易'}」，面交码已生成，面交时向卖家报码即可`,
        ]);
      } catch (noticeErr: any) {
        logger.warn('面交码通知写入失败', { error: noticeErr.message, tx_id: id });
      }
      logger.business('面交码已生成', { tx_id: id, seller_id: uid, expires_at: expires.toISOString() });
      ok(
        res,
        { id, status: 'code_issued', faceCode: code, expiresAt: expires.toISOString() },
        '面交码已生成，请告知买家当面核销',
      );
    } catch (err: any) {
      logger.error('生成面交码失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '操作失败');
    }
  });

  // ── 卖家核销面交码（完成交易）──
  app.put('/api/v1/transactions/:id/verify', auth, limiter(10), async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const uid = (req as any).userId;
      const input = validate(res, verifyCodeSchema, req.body);
      if (!input) return;

      const [txs]: any = await pool.query('SELECT * FROM transactions WHERE id = ?', [id]);
      if (!txs.length) return fail(res, 404, '交易不存在');
      const tx = txs[0];
      if (tx.seller_id !== uid) return fail(res, 403, '只有卖家可以核销');
      if (tx.status !== 'code_issued') return fail(res, 400, '交易不在可核销状态');
      if (!tx.face_code || !tx.code_expires_at) return fail(res, 400, '面交码未生成');

      // 防爆破：失败次数超限作废
      if (tx.verify_attempts >= MAX_VERIFY_ATTEMPTS) return fail(res, 400, '核销次数过多，面交码已作废，请重新生成');

      if (new Date(tx.code_expires_at).getTime() < Date.now()) {
        return fail(res, 400, '面交码已过期，请重新生成');
      }
      if (tx.face_code !== input.code) {
        await pool.query('UPDATE transactions SET verify_attempts = verify_attempts + 1 WHERE id = ?', [id]);
        return fail(res, 400, '面交码不正确');
      }

      const [upd]: any = await pool.query(
        "UPDATE transactions SET status = 'completed', completed_at = NOW() WHERE id = ? AND status = 'code_issued'",
        [id],
      );
      if (!upd.affectedRows) return fail(res, 400, '交易状态已变化，请刷新重试');
      // 帖子自动标记已售出
      await pool.query("UPDATE posts SET status = 'sold' WHERE id = ?", [tx.post_id]).catch(() => {});
      // ── 通知买家：交易完成，提醒评价 ──
      try {
        const [postRows]: any = await pool.query('SELECT title FROM posts WHERE id = ?', [tx.post_id]);
        await pool.query("INSERT INTO notices (user_id, title, content, category) VALUES (?, ?, ?, 'transaction')", [
          tx.buyer_id,
          '交易完成',
          `「${postRows[0]?.title || '你的交易'}」面交核销成功，记得互相评价`,
        ]);
      } catch (noticeErr: any) {
        logger.warn('交易完成通知写入失败', { error: noticeErr.message, tx_id: id });
      }
      logger.business('面交交易完成', { tx_id: id, post_id: tx.post_id, seller_id: uid, buyer_id: tx.buyer_id });
      ok(res, { id, status: 'completed' }, '面交核销成功，交易完成！记得互相评价');
    } catch (err: any) {
      logger.error('核销面交码失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '操作失败');
    }
  });

  // ── 取消交易（双方都可）──
  app.put('/api/v1/transactions/:id/cancel', auth, limiter(10), async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const uid = (req as any).userId;
      const [txs]: any = await pool.query('SELECT * FROM transactions WHERE id = ?', [id]);
      if (!txs.length) return fail(res, 404, '交易不存在');
      const tx = txs[0];
      if (tx.seller_id !== uid && tx.buyer_id !== uid) return fail(res, 403, '无权操作');
      if (tx.status !== 'pending' && tx.status !== 'code_issued') return fail(res, 400, '当前状态不可取消');

      const [upd2]: any = await pool.query(
        "UPDATE transactions SET status = 'cancelled' WHERE id = ? AND status IN ('pending','code_issued')",
        [id],
      );
      if (!upd2.affectedRows) return fail(res, 400, '交易状态已变化，请刷新重试');
      // ── 通知对方：交易已取消 ──
      try {
        const otherId = tx.seller_id === uid ? tx.buyer_id : tx.seller_id;
        await pool.query("INSERT INTO notices (user_id, title, content, category) VALUES (?, ?, ?, 'transaction')", [
          otherId,
          '交易已取消',
          '对方取消了面交交易',
        ]);
      } catch (noticeErr: any) {
        logger.warn('取消交易通知写入失败', { error: noticeErr.message, tx_id: id });
      }
      logger.business('面交交易取消', { tx_id: id, user_id: uid });
      ok(res, { id, status: 'cancelled' }, '交易已取消');
    } catch (err: any) {
      logger.error('取消交易失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '操作失败');
    }
  });

  // ── 交易互评（1-5 星 + 文字）──
  app.post('/api/v1/transactions/:id/review', auth, limiter(10), async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const uid = (req as any).userId;
      const input = validate(res, reviewSchema, req.body);
      if (!input) return;

      const [txs]: any = await pool.query('SELECT * FROM transactions WHERE id = ?', [id]);
      if (!txs.length) return fail(res, 404, '交易不存在');
      const tx = txs[0];
      if (tx.status !== 'completed') return fail(res, 400, '交易完成后才能评价');
      if (tx.seller_id !== uid && tx.buyer_id !== uid) return fail(res, 403, '无权评价');
      const revieweeId = tx.seller_id === uid ? tx.buyer_id : tx.seller_id;

      try {
        await pool.query(
          'INSERT INTO reviews (transaction_id, post_id, reviewer_id, reviewee_id, rating, comment) VALUES (?, ?, ?, ?, ?, ?)',
          [id, tx.post_id, uid, revieweeId, input.rating, input.comment.trim()],
        );
      } catch (e: any) {
        if (e.code === 'ER_DUP_ENTRY') return fail(res, 400, '你已评价过该交易');
        throw e;
      }
      // 更新被评人信誉（平均分 + 计数）
      await pool
        .query(
          `UPDATE users u SET
           u.reputation_score = (SELECT ROUND(AVG(rating), 1) FROM reviews WHERE reviewee_id = u.id),
           u.review_count = (SELECT COUNT(*) FROM reviews WHERE reviewee_id = u.id)
         WHERE u.id = ?`,
          [revieweeId],
        )
        .catch(() => {});
      logger.business('交易评价', { tx_id: id, reviewer_id: uid, reviewee_id: revieweeId, rating: input.rating });
      ok(res, { message: '评价成功' });
    } catch (err: any) {
      logger.error('评价失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '操作失败');
    }
  });

  // ── 用户信誉查询（公开，可选登录）──
  app.get('/api/v1/users/:id/reputation', optionalAuth, limiter(30), async (req: Request, res: Response) => {
    try {
      const userId = Number(req.params.id);
      const [users]: any = await pool.query('SELECT nickname, reputation_score, review_count FROM users WHERE id = ?', [
        userId,
      ]);
      if (!users.length) return fail(res, 404, '用户不存在');
      const [reviews]: any = await pool.query(
        `SELECT r.rating, r.comment, r.created_at, u.nickname AS reviewer_name
         FROM reviews r JOIN users u ON r.reviewer_id = u.id
         WHERE r.reviewee_id = ? ORDER BY r.created_at DESC LIMIT 20`,
        [userId],
      );
      ok(res, {
        userId,
        nickname: users[0].nickname,
        reputationScore: users[0].reputation_score,
        reviewCount: users[0].review_count,
        reviews,
      });
    } catch (err: any) {
      logger.error('信誉查询失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '获取失败');
    }
  });
}
