/**
 * 帖子 CRUD + 收藏
 */
import { Request, Response } from 'express';
import { Pool } from 'mysql2/promise';
import { auth } from '../middleware/auth';
import { limiter } from '../middleware/limiter';
import { logger } from '../../utils/logger';
import { checkSensitive } from '../../utils/sensitiveFilter';
import { ErrorCode } from '../errors';
import { ok, fail, notFound, validate } from '../response';
import { createPostSchema } from '../validators';
import { encrypt, decrypt } from '../crypto';

function decryptPost(p: any) {
  return { ...p, contact_info: decrypt(p.contact_info) || p.contact_info };
}

export function registerPostRoutes(app: any, pool: Pool) {
  // 每6小时自动回收超过7天的帖子
  setInterval(async () => {
    try {
      const [result]: any = await pool.query(
        "UPDATE posts SET status = 'closed' WHERE status = 'active' AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)"
      );
      if (result.affectedRows > 0) {
        logger.business('帖子自动回收', { count: result.affectedRows });
      }
    } catch { /* 静默 */ }
  }, 6 * 60 * 60 * 1000);

  // 列表
  app.get('/api/v1/posts', async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
      const offset = (page - 1) * limit;
      const postType = req.query.type as string;
      const sort = (req.query.sort as string) || 'default';
      const keyword = (req.query.keyword as string) || '';

      let where = "WHERE status = 'active' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)";
      const params: any[] = [];
      if (postType && postType !== 'all') {
        where += ' AND post_type = ?';
        params.push(postType);
      }
      if (keyword) {
        const terms = keyword.replace(/[+\-*()~<>]/g, '').split(/\s+/).filter(Boolean);
        if (terms.length > 0) {
          where += ' AND MATCH(title, description) AGAINST(? IN BOOLEAN MODE)';
          params.push(terms.map(w => `+${w}*`).join(' '));
        }
      }

      let orderBy = 'ORDER BY is_official DESC, views DESC, created_at DESC';
      if (sort === 'time') orderBy = 'ORDER BY is_official DESC, created_at DESC';
      if (sort === 'hot') orderBy = 'ORDER BY views DESC, created_at DESC';

      const [rows]: any = await pool.query(`SELECT * FROM posts ${where} ${orderBy} LIMIT ? OFFSET ?`, [
        ...params,
        limit,
        offset,
      ]);
      const [countRows]: any = await pool.query(`SELECT COUNT(*) as total FROM posts ${where}`, params);
      ok(res, { list: rows.map(decryptPost), total: countRows[0].total, page, limit });
    } catch (err: any) {
      logger.error('获取帖子列表失败', { error: err.message, trace_id: req._traceId});
      fail(res, 500, '获取帖子列表失败');
    }
  });

  // 详情
  app.get('/api/v1/posts/:id', async (req: Request, res: Response) => {
    try {
      const [rows]: any = await pool.query('SELECT * FROM posts WHERE id = ?', [req.params.id]);
      if (rows.length === 0) return notFound(res, '帖子不存在');
      await pool.query('UPDATE posts SET views = views + 1 WHERE id = ?', [req.params.id]);
      rows[0].views += 1;
      ok(res, decryptPost(rows[0]));
    } catch (err: any) {
      logger.error('获取帖子详情失败', { error: err.message, post_id: req.params.id, trace_id: req._traceId});
      fail(res, 500, '获取帖子详情失败');
    }
  });

  // 发布
  app.post('/api/v1/posts', auth, limiter(3), async (req: Request, res: Response) => {
    try {
      if (!req.isVerified) return fail(res, 403, '账号待审核，审核通过后才能发布', ErrorCode.FORBIDDEN_NOT_VERIFIED);
      const input = validate(res, createPostSchema, req.body);
      if (!input) return;

      const fullText = input.title + ' ' + input.description;
      const checkResult = checkSensitive(fullText);
      if (!checkResult.passed) {
        logger.security('帖子敏感词拦截', {
          user_id: req.userId,
          hit_words: checkResult.hitWords,
          title: input.title.slice(0, 80),
          trace_id: req._traceId,
        });
        return fail(res, 400, `包含违规词汇：${checkResult.hitWords.slice(0, 5).join('、')}`);
      }

      // 服务端每日发帖限制（前端也有检查，但服务端必须验证）
      const maxPerDay = req.isVerified ? 10 : 3;
      const [todayRows]: any = await pool.query(
        'SELECT COUNT(*) AS cnt FROM posts WHERE user_id = ? AND DATE(created_at) = CURDATE()',
        [req.userId],
      );
      if (todayRows[0].cnt >= maxPerDay) {
        logger.security('帖子发布超限', { user_id: req.userId, count: todayRows[0].cnt, limit: maxPerDay, trace_id: req._traceId });
        return fail(res, 429, `今日发布已达上限（${maxPerDay}条）`, ErrorCode.DAILY_LIMIT_EXCEEDED);
      }

      // 标题去重：同一用户今日不得发相同标题
      const titleHash = input.title.trim().toLowerCase().slice(0, 64);
      const [dupRows]: any = await pool.query(
        'SELECT id FROM posts WHERE user_id = ? AND title_hash = ? AND DATE(created_at) = CURDATE() LIMIT 1',
        [req.userId, titleHash],
      );
      if (dupRows.length > 0) {
        logger.security('帖子重复发布', { user_id: req.userId, title: input.title.slice(0, 40), trace_id: req._traceId });
        return fail(res, 409, '您今天已发布过相同内容的帖子', ErrorCode.DUPLICATE_SUBMISSION);
      }

      const [result]: any = await pool.query(
        `INSERT INTO posts (user_id, title, description, price, original_price, category, post_type, image_urls, contact_info, status, is_official, title_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', false, ?)`,
        [
          req.userId,
          input.title,
          input.description,
          input.price ?? null,
          input.originalPrice ?? null,
          input.category,
          input.postType,
          JSON.stringify(input.imageUrls),
          input.contactInfo ? encrypt(input.contactInfo) : null,
          titleHash,
        ],
      );
      logger.business('帖子发布', {
        post_id: result.insertId,
        user_id: req.userId,
        post_type: input.postType,
        title: input.title.slice(0, 50),
        trace_id: req._traceId,
      });
      ok(res, { id: result.insertId });
    } catch (err: any) {
      logger.error('发布失败', { error: err.message, user_id: req.userId, trace_id: req._traceId});
      fail(res, 500, '发布失败');
    }
  });

  // 关闭
  app.delete('/api/v1/posts/:id', auth, limiter(5), async (req: Request, res: Response) => {
    try {
      const [rows]: any = await pool.query('SELECT * FROM posts WHERE id = ? AND user_id = ?', [
        req.params.id,
        req.userId,
      ]);
      if (rows.length === 0) return notFound(res, '帖子不存在或无权操作');
      await pool.query("UPDATE posts SET status = 'closed' WHERE id = ?", [req.params.id]);
      logger.business('帖子关闭', { post_id: req.params.id, user_id: req.userId, trace_id: req._traceId });
      ok(res, null, '已关闭');
    } catch (err: any) {
      logger.error('关闭帖子失败', { error: err.message, post_id: req.params.id, trace_id: req._traceId});
      fail(res, 500, '关闭失败');
    }
  });

  // 标记已售
  app.put('/api/v1/posts/:id/sold', auth, limiter(5), async (req: Request, res: Response) => {
    try {
      const [rows]: any = await pool.query('SELECT * FROM posts WHERE id = ? AND user_id = ?', [
        req.params.id,
        req.userId,
      ]);
      if (rows.length === 0) return notFound(res, '帖子不存在或无权操作');
      await pool.query("UPDATE posts SET status = 'sold' WHERE id = ?", [req.params.id]);
      logger.business('帖子售出', { post_id: req.params.id, user_id: req.userId, trace_id: req._traceId });
      ok(res, null, '已标记为已售');
    } catch (err: any) {
      logger.error('标记已售失败', { error: err.message, post_id: req.params.id, trace_id: req._traceId});
      fail(res, 500, '标记失败');
    }
  });

  // 收藏（切换）
  app.post('/api/v1/favorites/:postId', auth, limiter(10), async (req: Request, res: Response) => {
    try {
      if (!req.isVerified) return fail(res, 403, '账号待审核，审核通过后才能收藏');
      const postId = String(req.params.postId);
      // 仅允许数字 ID（真实帖子 ID 为自增整数，防止 mock 数据 ID 如 headphones-1 触发外键异常）
      if (!/^\d+$/.test(postId)) {
        return fail(res, 400, '无效的帖子ID');
      }
      const [existing]: any = await pool.query('SELECT id FROM favorites WHERE user_id = ? AND post_id = ?', [
        req.userId,
        postId,
      ]);
      if (existing.length > 0) {
        await pool.query('DELETE FROM favorites WHERE id = ?', [existing[0].id]);
        logger.business('取消收藏', { post_id: postId, user_id: req.userId, trace_id: req._traceId });
        ok(res, { favorited: false });
      } else {
        await pool.query('INSERT INTO favorites (user_id, post_id) VALUES (?, ?)', [req.userId, postId]);
        logger.business('收藏', { post_id: postId, user_id: req.userId, trace_id: req._traceId });
        ok(res, { favorited: true });
      }
    } catch (err: any) {
      logger.error('收藏操作失败', { error: err.message, user_id: req.userId, trace_id: req._traceId});
      fail(res, 500, '收藏操作失败');
    }
  });

  // 收藏列表
  app.get('/api/v1/favorites', auth, async (req: Request, res: Response) => {
    try {
      const [rows]: any = await pool.query(
        'SELECT p.* FROM favorites f JOIN posts p ON f.post_id = p.id WHERE f.user_id = ? ORDER BY f.created_at DESC',
        [req.userId],
      );
      ok(res, rows.map(decryptPost));
    } catch (err: any) {
      logger.error('获取收藏失败', { error: err.message, user_id: req.userId, trace_id: req._traceId});
      fail(res, 500, '获取收藏失败');
    }
  });

  // ── 分类列表 ──
  app.get('/api/v1/categories', async (req: Request, res: Response) => {
    try {
      const [rows]: any = await pool.query(
        'SELECT id, name, parent_id, sort_order FROM categories WHERE is_active = TRUE ORDER BY sort_order'
      );
      ok(res, rows);
    } catch (err: any) {
      logger.error('获取分类失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '获取分类失败');
    }
  });
}
