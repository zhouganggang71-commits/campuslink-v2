/**
 * 内容运营 — 新生必看/校园介绍/生活服务/校历（对标竞品链千校，R12 Phase 1）
 *
 * 用户端（公开，限流）：列表 / banner / 详情
 * 管理端（adminAuth）：CRUD + 上下架 + 排序
 *
 * 安全与规则：
 *   - 用户端只吐 published；draft/archived 一律 404，不泄露草稿
 *   - 列表接口不返回 body（轻量），详情才带
 *   - 浏览量同 IP 同内容 5 分钟窗口去重（内存缓存，重启清零可接受）
 *   - 管理端所有操作记 logger.business（操作人/目标/动作）
 *   - school_id 本轮恒为 1（多校预留），查询/写入都显式带，扩校时零迁移
 */
import { Request, Response } from 'express';
import { adminAuth } from '../middleware/auth';
import { limiter } from '../middleware/limiter';
import { logger } from '../../utils/logger';
import { ok, fail, validate } from '../response';
import { createContentSchema, CONTENT_CATEGORIES } from '../validators';

const SCHOOL_ID = 1; // 多校预留：本轮恒为川财

/** 浏览量防刷：Map<`${ip}:${contentId}`, lastViewedAt>，5 分钟窗口 */
const viewDedup = new Map<string, number>();
const VIEW_WINDOW_MS = 5 * 60 * 1000;
const VIEW_DEDUP_MAX = 10000; // 容量上限：防伪造不同 IP 撑爆内存
setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of viewDedup) {
    if (now - ts > VIEW_WINDOW_MS) viewDedup.delete(key);
  }
  if (viewDedup.size > VIEW_DEDUP_MAX) {
    // 超上限：清掉最旧的 1/3
    let n = Math.floor(viewDedup.size / 3);
    for (const key of viewDedup.keys()) {
      if (n-- <= 0) break;
      viewDedup.delete(key);
    }
  }
}, 60_000).unref?.();

export function registerContentRoutes(app: any, pool: any) {
  // ── 用户端：内容列表（分类维度，轻量，无 body）──
  app.get('/api/v1/contents', limiter(60), async (req: Request, res: Response) => {
    try {
      const category = (req.query.category as string) || '';
      const subCategory = (req.query.subCategory as string) || '';
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize as string) || 20));

      if (category && !CONTENT_CATEGORIES.includes(category as any)) {
        return fail(res, 400, '分类无效');
      }

      const where = ['school_id = ?', "status = 'published'", "sub_category != 'banner'"];
      const params: any[] = [SCHOOL_ID];
      if (category) {
        where.push('category = ?');
        params.push(category);
      }
      if (subCategory) {
        where.push('sub_category = ?');
        params.push(subCategory);
      }

      const [rows]: any = await pool.query(
        `SELECT id, category, sub_category, title, summary, cover_url, sort_order, view_count, updated_at
         FROM contents WHERE ${where.join(' AND ')}
         ORDER BY sort_order ASC, id DESC LIMIT ? OFFSET ?`,
        [...params, pageSize, (page - 1) * pageSize],
      );
      const [countRows]: any = await pool.query(
        `SELECT COUNT(*) AS total FROM contents WHERE ${where.join(' AND ')}`,
        params,
      );
      ok(res, { list: rows, total: countRows[0].total, page, pageSize });
    } catch (err: any) {
      logger.error('内容列表失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '获取失败');
    }
  });

  // ── 用户端：首页 Banner（services/banner 约定）──
  // ⚠️ 必须在 /contents/:id 之前注册，否则会被 :id 捕获
  app.get('/api/v1/contents/banner', limiter(60), async (req: Request, res: Response) => {
    try {
      const [rows]: any = await pool.query(
        `SELECT id, category, sub_category, title, summary, cover_url, sort_order, view_count
         FROM contents
         WHERE school_id = ? AND status = 'published' AND category = 'services' AND sub_category = 'banner'
         ORDER BY sort_order ASC, id DESC LIMIT 5`,
        [SCHOOL_ID],
      );
      ok(res, rows);
    } catch (err: any) {
      logger.error('Banner 获取失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '获取失败');
    }
  });

  // ── 用户端：内容详情（含 body，浏览量去重 +1）──
  app.get('/api/v1/contents/:id', limiter(60), async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return fail(res, 400, '无效ID');

      const [rows]: any = await pool.query('SELECT * FROM contents WHERE id = ? AND school_id = ? AND status = ?', [
        id,
        SCHOOL_ID,
        'published',
      ]);
      if (!rows.length) return fail(res, 404, '内容不存在');

      const content = rows[0];
      // 浏览量防刷：同 IP 同内容 5 分钟内不重复计数
      const dedupKey = `${req.ip}:${id}`;
      const now = Date.now();
      if (!viewDedup.has(dedupKey) || now - (viewDedup.get(dedupKey) || 0) > VIEW_WINDOW_MS) {
        viewDedup.set(dedupKey, now);
        await pool.query('UPDATE contents SET view_count = view_count + 1 WHERE id = ?', [id]).catch(() => {});
        content.view_count += 1;
      }

      ok(res, content);
    } catch (err: any) {
      logger.error('内容详情失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '获取失败');
    }
  });

  // ── 管理端：列表（含草稿/归档，分页 + 筛选）──
  app.get('/api/v1/admin/contents', adminAuth, limiter(30), async (req: Request, res: Response) => {
    try {
      const category = (req.query.category as string) || '';
      const status = (req.query.status as string) || '';
      const sort = (req.query.sort as string) || 'sort';
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(200, parseInt(req.query.limit as string) || 50);

      const where = ['school_id = ?'];
      const params: any[] = [SCHOOL_ID];
      if (category && CONTENT_CATEGORIES.includes(category as any)) {
        where.push('category = ?');
        params.push(category);
      }
      if (['draft', 'published', 'archived'].includes(status)) {
        where.push('status = ?');
        params.push(status);
      }
      // 运营埋点：按浏览量/热度排序（默认 sort_order，可切 views）
      const orderBy = sort === 'views' ? 'c.view_count DESC, c.id DESC' : 'c.sort_order ASC, c.id DESC';

      const [rows]: any = await pool.query(
        `SELECT c.*, u.nickname AS creator_name
         FROM contents c LEFT JOIN users u ON c.created_by = u.id
         WHERE ${where.join(' AND ')}
         ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
        [...params, limit, (page - 1) * limit],
      );
      const [countRows]: any = await pool.query(
        `SELECT COUNT(*) AS total FROM contents WHERE ${where.join(' AND ')}`,
        params,
      );
      ok(res, { list: rows, total: countRows[0].total, page, limit });
    } catch (err: any) {
      logger.error('管理端内容列表失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '获取失败');
    }
  });

  // ── 管理端：新建 ──
  app.post('/api/v1/admin/contents', adminAuth, limiter(30), async (req: Request, res: Response) => {
    try {
      const input = validate(res, createContentSchema, req.body);
      if (!input) return;

      const result: any = await pool.query(
        `INSERT INTO contents (school_id, category, sub_category, title, summary, cover_url, resource_url, resource_name, body, body_type, sort_order, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          SCHOOL_ID,
          input.category,
          input.subCategory,
          input.title.trim(),
          input.summary.trim(),
          input.coverUrl || null,
          input.resourceUrl || null,
          input.resourceName,
          input.body,
          input.bodyType,
          input.sortOrder,
          input.status,
          (req as any).userId || 0,
        ],
      );
      logger.business('内容新建', {
        content_id: result[0].insertId,
        category: input.category,
        title: input.title,
        user_id: (req as any).userId,
      });
      ok(res, { id: result[0].insertId });
    } catch (err: any) {
      logger.error('内容新建失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '创建失败');
    }
  });

  // ── 管理端：更新（含上下架/排序/正文）──
  app.put('/api/v1/admin/contents/:id', adminAuth, limiter(30), async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return fail(res, 400, '无效ID');
      const input = validate(res, createContentSchema, req.body);
      if (!input) return;

      const [result]: any = await pool.query(
        `UPDATE contents SET category = ?, sub_category = ?, title = ?, summary = ?, cover_url = ?, resource_url = ?, resource_name = ?, body = ?, body_type = ?, sort_order = ?, status = ?
         WHERE id = ? AND school_id = ?`,
        [
          input.category,
          input.subCategory,
          input.title.trim(),
          input.summary.trim(),
          input.coverUrl || null,
          input.resourceUrl || null,
          input.resourceName,
          input.body,
          input.bodyType,
          input.sortOrder,
          input.status,
          id,
          SCHOOL_ID,
        ],
      );
      if (!result.affectedRows) return fail(res, 404, '内容不存在');
      logger.business('内容更新', {
        content_id: id,
        status: input.status,
        title: input.title,
        user_id: (req as any).userId,
      });
      ok(res, { id });
    } catch (err: any) {
      logger.error('内容更新失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '更新失败');
    }
  });

  // ── 管理端：删除（物理删 + business 日志）──
  app.delete('/api/v1/admin/contents/:id', adminAuth, limiter(30), async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return fail(res, 400, '无效ID');

      const [rows]: any = await pool.query('SELECT title FROM contents WHERE id = ? AND school_id = ?', [
        id,
        SCHOOL_ID,
      ]);
      if (!rows.length) return fail(res, 404, '内容不存在');

      await pool.query('DELETE FROM contents WHERE id = ? AND school_id = ?', [id, SCHOOL_ID]);
      logger.business('内容删除', { content_id: id, title: rows[0].title, user_id: (req as any).userId });
      ok(res, { message: '已删除' });
    } catch (err: any) {
      logger.error('内容删除失败', { error: err.message, trace_id: (req as any)._traceId });
      fail(res, 500, '删除失败');
    }
  });
}
