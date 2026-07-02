/**
 * 私信路由 — 会话列表、消息收发、已读标记
 */
import { Request, Response } from 'express';
import { Pool } from 'mysql2/promise';
import { z } from 'zod';
import { auth } from '../middleware/auth';
import { limiter } from '../middleware/limiter';
import { logger } from '../../utils/logger';
import { ok, fail, validate } from '../response';
import { ErrorCode } from '../errors';

const sendMessageSchema = z.object({
  content: z.string().max(500, '消息最多500字').optional().default(''),
  imageUrl: z.string().max(500).optional(),
}).refine((v) => (!!v.content && v.content.trim().length > 0) || !!v.imageUrl, {
  message: '消息不能为空',
});

const createConversationSchema = z.object({
  targetUserId: z.number().int().positive('目标用户ID无效'),
});

export function registerMessageRoutes(app: any, pool: Pool) {
  function isSchemaError(err: any): boolean {
    return err?.errno === 1054 || err?.code === 'ER_BAD_FIELD_ERROR';
  }

  // ── 获取我的会话列表 ──
  app.get('/api/v1/conversations', auth, limiter(30), async (req: Request, res: Response) => {
    try {
      const userId = req.userId;
      // 上报自己的活跃时间（用于在线状态），非阻塞
      pool.query('UPDATE users SET last_active = NOW() WHERE id = ?', [userId]).catch(() => {});
      const [rows]: any = await pool.query(
        `SELECT
           c.id,
           c.user1_id,
           c.user2_id,
           c.last_message_at,
           CASE WHEN c.user1_id = ? THEN u2.nickname ELSE u1.nickname END AS other_nickname,
           CASE WHEN c.user1_id = ? THEN u2.avatar_url ELSE u1.avatar_url END AS other_avatar,
           CASE WHEN c.user1_id = ? THEN u2.id ELSE u1.id END AS other_user_id,
           CASE WHEN c.user1_id = ? THEN u2.last_active ELSE u1.last_active END AS other_last_active,
           (SELECT CASE WHEN (content IS NULL OR content = '') AND image_url IS NOT NULL THEN '[图片]' ELSE content END
              FROM chat_messages WHERE conversation_id = c.id AND status = 'active' ORDER BY created_at DESC LIMIT 1) AS last_message,
           (SELECT COUNT(*) FROM chat_messages WHERE conversation_id = c.id AND sender_id != ? AND is_read = FALSE AND status = 'active') AS unread_count
         FROM conversations c
         JOIN users u1 ON c.user1_id = u1.id
         JOIN users u2 ON c.user2_id = u2.id
         WHERE c.user1_id = ? OR c.user2_id = ?
         ORDER BY c.last_message_at DESC
         LIMIT 50`,
        [userId, userId, userId, userId, userId, userId, userId],
      );
      const conversations = rows.map((r: any) => ({
        id: r.id,
        otherUser: {
          id: r.other_user_id,
          nickname: r.other_nickname || '未知用户',
          avatarUrl: r.other_avatar || '',
          lastActive: r.other_last_active || null,
        },
        lastMessage: r.last_message || null,
        lastMessageAt: r.last_message_at || null,
        unreadCount: r.unread_count || 0,
      }));
      ok(res, conversations);
    } catch (err: any) {
      if (isSchemaError(err)) return ok(res, []);
      logger.error('获取会话列表失败', { error: err.message, user_id: req.userId, trace_id: (req as any)._traceId });
      fail(res, 500, '获取会话列表失败');
    }
  });

  // ── 未读私信总数 ──
  app.get('/api/v1/conversations/unread-count', auth, limiter(60), async (req: Request, res: Response) => {
    try {
      const userId = req.userId;
      const [rows]: any = await pool.query(
        `SELECT COUNT(*) AS count FROM chat_messages m
         JOIN conversations c ON m.conversation_id = c.id
         WHERE (c.user1_id = ? OR c.user2_id = ?) AND m.sender_id != ? AND m.is_read = FALSE AND m.status = 'active'`,
        [userId, userId, userId],
      );
      ok(res, { count: rows[0]?.count || 0 });
    } catch (err: any) {
      if (isSchemaError(err)) return ok(res, { count: 0 });
      logger.error('获取未读数失败', { error: err.message, user_id: req.userId, trace_id: (req as any)._traceId });
      fail(res, 500, '获取未读数失败');
    }
  });

  // ── 创建或查找会话 ──
  app.post('/api/v1/conversations', auth, limiter(10), async (req: Request, res: Response) => {
    const input = validate(res, createConversationSchema, req.body);
    if (!input) return;

    const userId = req.userId!;
    const targetUserId = input.targetUserId;

    if (userId === targetUserId) {
      return fail(res, 400, '不能和自己聊天', ErrorCode.INVALID_INPUT);
    }

    try {
      // 检查目标用户是否存在
      const [users]: any = await pool.query('SELECT id, nickname, avatar_url, last_active FROM users WHERE id = ?', [targetUserId]);
      if (users.length === 0) {
        return fail(res, 404, '用户不存在', ErrorCode.NOT_FOUND);
      }

      const targetUser = users[0];

      // 查找或创建会话（使用 LEAST/GREATEST 保证顺序）
      const [convRows]: any = await pool.query(
        `SELECT id FROM conversations
         WHERE user1_id = LEAST(?, ?) AND user2_id = GREATEST(?, ?)`,
        [userId, targetUserId, userId, targetUserId],
      );

      let conversationId: number;
      if (convRows.length > 0) {
        conversationId = convRows[0].id;
      } else {
        const [insertResult]: any = await pool.query(
          'INSERT INTO conversations (user1_id, user2_id) VALUES (LEAST(?, ?), GREATEST(?, ?))',
          [userId, targetUserId, userId, targetUserId],
        );
        conversationId = insertResult.insertId;
        logger.business('创建新会话', {
          conversation_id: conversationId,
          user1: Math.min(userId, targetUserId),
          user2: Math.max(userId, targetUserId),
          trace_id: (req as any)._traceId,
        });
      }

      ok(res, {
        id: conversationId,
        otherUser: {
          id: targetUser.id,
          nickname: targetUser.nickname || '未知用户',
          avatarUrl: targetUser.avatar_url || '',
          lastActive: targetUser.last_active || null,
        },
        lastMessage: null,
        lastMessageAt: null,
        unreadCount: 0,
      });
    } catch (err: any) {
      if (isSchemaError(err)) {
        logger.warn('私信表结构未升级', { user_id: userId, trace_id: (req as any)._traceId });
        return fail(res, 500, '私信功能暂不可用');
      }
      logger.error('创建会话失败', { error: err.message, user_id: userId, trace_id: (req as any)._traceId });
      fail(res, 500, '创建会话失败');
    }
  });

  // ── 获取会话消息（cursor 分页） ──
  app.get('/api/v1/conversations/:id/messages', auth, limiter(30), async (req: Request, res: Response) => {
    const conversationId = parseInt(req.params.id as string, 10);
    if (isNaN(conversationId)) return fail(res, 400, '会话ID无效');

    const userId = req.userId!;
    const before = req.query.before ? parseInt(req.query.before as string, 10) : undefined;
    const limit = 30;

    try {
      // 验证会话归属
      const [convRows]: any = await pool.query(
        'SELECT id FROM conversations WHERE id = ? AND (user1_id = ? OR user2_id = ?)',
        [conversationId, userId, userId],
      );
      if (convRows.length === 0) {
        return fail(res, 404, '会话不存在', ErrorCode.NOT_FOUND);
      }

      let query: string;
      let params: any[];
      if (before) {
        query = `SELECT id, conversation_id, sender_id, content, image_url, is_read, created_at
                 FROM chat_messages
                 WHERE conversation_id = ? AND status = 'active' AND id < ?
                 ORDER BY created_at DESC LIMIT ?`;
        params = [conversationId, before, limit];
      } else {
        query = `SELECT id, conversation_id, sender_id, content, image_url, is_read, created_at
                 FROM chat_messages
                 WHERE conversation_id = ? AND status = 'active'
                 ORDER BY created_at DESC LIMIT ?`;
        params = [conversationId, limit];
      }

      const [msgRows]: any = await pool.query(query, params);
      // 反转顺序让最旧的在前面
      const messages = msgRows.reverse().map((r: any) => ({
        id: r.id,
        conversationId: r.conversation_id,
        senderId: r.sender_id,
        content: r.content || '',
        imageUrl: r.image_url || null,
        isRead: !!r.is_read,
        createdAt: r.created_at,
      }));

      // 检查是否还有更多
      let hasMore = false;
      if (messages.length === limit) {
        const [olderRows]: any = await pool.query(
          'SELECT COUNT(*) AS cnt FROM chat_messages WHERE conversation_id = ? AND status = ? AND id < ?',
          [conversationId, 'active', messages[0].id],
        );
        hasMore = olderRows[0]?.cnt > 0;
      }

      ok(res, { messages, hasMore });
    } catch (err: any) {
      if (isSchemaError(err)) return ok(res, { messages: [], hasMore: false });
      logger.error('获取消息失败', { error: err.message, user_id: userId, trace_id: (req as any)._traceId });
      fail(res, 500, '获取消息失败');
    }
  });

  // ── 发送消息 ──
  app.post('/api/v1/conversations/:id/messages', auth, limiter(10), async (req: Request, res: Response) => {
    const conversationId = parseInt(req.params.id as string, 10);
    if (isNaN(conversationId)) return fail(res, 400, '会话ID无效');

    const input = validate(res, sendMessageSchema, req.body);
    if (!input) return;

    const userId = req.userId!;
    const content = (input.content || '').trim();
    const imageUrl = input.imageUrl || null;

    // 敏感词过滤（与前端相同的词库）
    const blockedWords = ['fuck', 'shit', '操你', '傻逼', 'sb', 'cnm', '代写', '代考', '作弊', '办证', '嫖娼', '赌博', '毒品'];
    const lowerContent = content.toLowerCase();
    for (const word of blockedWords) {
      if (lowerContent.includes(word.toLowerCase())) {
        logger.security('私信敏感词拦截', { user_id: userId, word, trace_id: (req as any)._traceId });
        return fail(res, 400, '消息包含违规内容，请修改后发送');
      }
    }

    try {
      // 验证会话归属
      const [convRows]: any = await pool.query(
        'SELECT id FROM conversations WHERE id = ? AND (user1_id = ? OR user2_id = ?)',
        [conversationId, userId, userId],
      );
      if (convRows.length === 0) {
        return fail(res, 404, '会话不存在', ErrorCode.NOT_FOUND);
      }

      const [insertResult]: any = await pool.query(
        'INSERT INTO chat_messages (conversation_id, sender_id, content, image_url) VALUES (?, ?, ?, ?)',
        [conversationId, userId, content || null, imageUrl],
      );

      // 更新会话最后消息时间
      await pool.query(
        'UPDATE conversations SET last_message_at = NOW() WHERE id = ?',
        [conversationId],
      );

      const messageId = insertResult.insertId;

      logger.business('发送私信', {
        message_id: messageId,
        conversation_id: conversationId,
        sender_id: userId,
        content_length: content.length,
        has_image: !!imageUrl,
        trace_id: (req as any)._traceId,
      });

      // 返回完整的消息对象
      const [msgRows]: any = await pool.query(
        'SELECT id, conversation_id, sender_id, content, image_url, is_read, created_at FROM chat_messages WHERE id = ?',
        [messageId],
      );

      const msg = msgRows[0];
      ok(res, {
        id: msg.id,
        conversationId: msg.conversation_id,
        senderId: msg.sender_id,
        content: msg.content || '',
        imageUrl: msg.image_url || null,
        isRead: !!msg.is_read,
        createdAt: msg.created_at,
      });
    } catch (err: any) {
      if (isSchemaError(err)) return fail(res, 500, '私信功能暂不可用');
      logger.error('发送消息失败', { error: err.message, user_id: userId, trace_id: (req as any)._traceId });
      fail(res, 500, '发送消息失败');
    }
  });

  // ── 标记会话已读 ──
  app.put('/api/v1/conversations/:id/read', auth, limiter(20), async (req: Request, res: Response) => {
    const conversationId = parseInt(req.params.id as string, 10);
    if (isNaN(conversationId)) return fail(res, 400, '会话ID无效');

    const userId = req.userId!;

    try {
      const [result]: any = await pool.query(
        `UPDATE chat_messages SET is_read = TRUE
         WHERE conversation_id = ? AND sender_id != ? AND is_read = FALSE`,
        [conversationId, userId],
      );
      ok(res, { affected: result.affectedRows });
    } catch (err: any) {
      if (isSchemaError(err)) return ok(res, { affected: 0 });
      logger.error('标记已读失败', { error: err.message, user_id: userId, trace_id: (req as any)._traceId });
      fail(res, 500, '操作失败');
    }
  });
}
