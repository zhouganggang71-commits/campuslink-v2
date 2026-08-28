/**
 * 帖子 CRUD + 收藏
 */
import { Request, Response } from 'express';
import { Pool } from 'mysql2/promise';
import { auth, optionalAuth } from '../middleware/auth';
import { limiter } from '../middleware/limiter';
import { logger } from '../../utils/logger';
import { checkSensitive } from '../../utils/sensitiveFilter';
import { ErrorCode } from '../errors';
import { ok, fail, notFound, validate } from '../response';
import { createPostSchema } from '../validators';
import { encrypt, decrypt } from '../crypto';

/**
 * 联系方式仅对「已认证用户 / 管理员 / 帖子作者本人」解密返回，
 * 匿名或未认证请求返回 null，防止微信号/手机号被爬虫批量采集。
 */
function decryptPost(p: any, req?: Request) {
  const canSeeContact = !!req && (req.isVerified || req.isAdmin || (req.userId != null && req.userId === p.user_id));
  return { ...p, contact_info: canSeeContact ? (decrypt(p.contact_info) ?? null) : null };
}

export function registerPostRoutes(app: any, pool: Pool) {
  // 每6小时自动回收超过7天的帖子
  setInterval(
    async () => {
      try {
        const [result]: any = await pool.query(
          "UPDATE posts SET status = 'closed' WHERE status = 'active' AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)",
        );
        if (result.affectedRows > 0) {
          logger.business('帖子自动回收', { count: result.affectedRows });
        }
      } catch {
        /* 静默 */
      }
    },
    6 * 60 * 60 * 1000,
  );

  // 列表
  app.get('/api/v1/posts', optionalAuth, async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
      const offset = (page - 1) * limit;
      const postType = req.query.type as string;
      const sort = (req.query.sort as string) || 'default';
      const keyword = (req.query.keyword as string) || '';
      const userId = parseInt(req.query.userId as string) || 0;

      // 查看特定用户帖子：本人/管理员可见全部状态（我的发布页需要 closed/sold），
      // 其他人只能看 active/sold，不泄露 pending/rejected/closed 内容
      const isOwner = userId > 0 && (req.userId === userId || req.isAdmin);
      let where =
        userId > 0
          ? isOwner
            ? 'WHERE p.user_id = ?'
            : "WHERE p.user_id = ? AND p.status IN ('active','sold')"
          : "WHERE p.status = 'active' AND p.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)";
      const params: any[] = [];
      if (userId > 0) {
        params.push(userId);
      }
      if (postType && postType !== 'all') {
        where += ' AND p.post_type = ?';
        params.push(postType);
      }
      if (keyword) {
        // ngram parser 适配：中文用短语搜索 +"词"（bigram 分词下 +词* 前缀语义不成立），
        // 英文/数字保留前缀通配 +word*，单个中文字符（< ngram_token_size=2）退化为 LIKE
        const terms = keyword
          .slice(0, 100)
          .replace(/[+\-*()~<>"@]/g, ' ')
          .split(/\s+/)
          .filter(Boolean);
        const hasCJK = (s: string) => /[一-鿿]/.test(s);
        const ftTerms: string[] = [];
        const likeTerms: string[] = [];
        for (const w of terms) {
          if (hasCJK(w) && [...w].length < 2) likeTerms.push(w);
          else if (hasCJK(w)) ftTerms.push(`+"${w}"`);
          else ftTerms.push(`+${w}*`);
        }
        if (ftTerms.length > 0) {
          where += ' AND MATCH(p.title, p.description) AGAINST(? IN BOOLEAN MODE)';
          params.push(ftTerms.join(' '));
        }
        for (const w of likeTerms) {
          const escaped = w.replace(/[%_\\]/g, (m) => '\\' + m);
          where += ' AND (p.title LIKE ? OR p.description LIKE ?)';
          params.push(`%${escaped}%`, `%${escaped}%`);
        }
      }

      let orderBy = 'ORDER BY p.is_official DESC, p.views DESC, p.created_at DESC';
      if (sort === 'time') orderBy = 'ORDER BY p.is_official DESC, p.created_at DESC';
      if (sort === 'hot') orderBy = 'ORDER BY p.views DESC, p.created_at DESC';

      const joinedSelect = `SELECT p.*, u.nickname AS publisher_name, u.avatar_url AS publisher_avatar,
        u.department AS publisher_department, u.org_level AS publisher_org_level,
        u.org_name AS publisher_org_name, u.position AS publisher_position,
        u.auth_status AS publisher_auth_status,
        (CASE WHEN u.gender_visible THEN u.gender ELSE NULL END) AS publisher_gender
        FROM posts p LEFT JOIN users u ON p.user_id = u.id`;
      const [rows]: any = await pool.query(`${joinedSelect} ${where} ${orderBy} LIMIT ? OFFSET ?`, [
        ...params,
        limit,
        offset,
      ]);
      const [countRows]: any = await pool.query(`SELECT COUNT(*) as total FROM posts p ${where}`, params);
      ok(res, { list: rows.map((r: any) => decryptPost(r, req)), total: countRows[0].total, page, limit });
    } catch (err: any) {
      logger.error('获取帖子列表失败', { error: err.message, trace_id: req._traceId });
      fail(res, 500, '获取帖子列表失败');
    }
  });

  // 详情
  app.get('/api/v1/posts/:id', optionalAuth, async (req: Request, res: Response) => {
    try {
      const [rows]: any = await pool.query(
        `SELECT p.*, u.nickname AS publisher_name, u.avatar_url AS publisher_avatar,
         u.department AS publisher_department, u.org_level AS publisher_org_level,
         u.org_name AS publisher_org_name, u.position AS publisher_position,
         u.auth_status AS publisher_auth_status,
         (CASE WHEN u.gender_visible THEN u.gender ELSE NULL END) AS publisher_gender
         FROM posts p LEFT JOIN users u ON p.user_id = u.id WHERE p.id = ?`,
        [req.params.id],
      );
      if (rows.length === 0) return notFound(res, '帖子不存在');
      // pending/rejected/closed 的帖子仅作者本人和管理员可见
      const post = rows[0];
      const canSeeHidden = req.userId === post.user_id || req.isAdmin;
      if (!['active', 'sold'].includes(post.status) && !canSeeHidden) {
        return notFound(res, '帖子不存在');
      }
      await pool.query('UPDATE posts SET views = views + 1 WHERE id = ?', [req.params.id]);
      post.views += 1;
      ok(res, decryptPost(post, req));
    } catch (err: any) {
      logger.error('获取帖子详情失败', { error: err.message, post_id: req.params.id, trace_id: req._traceId });
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
        logger.security('帖子发布超限', {
          user_id: req.userId,
          count: todayRows[0].cnt,
          limit: maxPerDay,
          trace_id: req._traceId,
        });
        return fail(res, 429, `今日发布已达上限（${maxPerDay}条）`, ErrorCode.DAILY_LIMIT_EXCEEDED);
      }

      // 标题去重：同一用户今日不得发相同标题
      const titleHash = input.title.trim().toLowerCase().slice(0, 64);
      const [dupRows]: any = await pool.query(
        'SELECT id FROM posts WHERE user_id = ? AND title_hash = ? AND DATE(created_at) = CURDATE() LIMIT 1',
        [req.userId, titleHash],
      );
      if (dupRows.length > 0) {
        logger.security('帖子重复发布', {
          user_id: req.userId,
          title: input.title.slice(0, 40),
          trace_id: req._traceId,
        });
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
      logger.error('发布失败', { error: err.message, user_id: req.userId, trace_id: req._traceId });
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
      logger.error('关闭帖子失败', { error: err.message, post_id: req.params.id, trace_id: req._traceId });
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
      logger.error('标记已售失败', { error: err.message, post_id: req.params.id, trace_id: req._traceId });
      fail(res, 500, '标记失败');
    }
  });

  // ── 举报帖子 ──
  // 帖子举报已迁移到统一的 POST /api/v1/reports（target_type=post），见 routes/reports.ts

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
      logger.error('收藏操作失败', { error: err.message, user_id: req.userId, trace_id: req._traceId });
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
      ok(
        res,
        rows.map((r: any) => decryptPost(r, req)),
      );
    } catch (err: any) {
      logger.error('获取收藏失败', { error: err.message, user_id: req.userId, trace_id: req._traceId });
      fail(res, 500, '获取收藏失败');
    }
  });

  // ── 用户公开收藏列表（他人个人主页使用）──
  // ── 分类列表 ──
  app.get('/api/v1/categories', async (req: Request, res: Response) => {
    try {
      const [rows]: any = await pool.query(
        'SELECT id, name, parent_id, sort_order FROM categories WHERE is_active = TRUE ORDER BY sort_order',
      );
      ok(res, rows);
    } catch (err: any) {
      logger.error('获取分类失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '获取分类失败');
    }
  });
}
