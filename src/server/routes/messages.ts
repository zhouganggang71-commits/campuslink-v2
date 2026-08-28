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
import { sendPushToUser } from '../push';

const sendMessageSchema = z
  .object({
    content: z.string().max(2000, '消息最多2000字').optional().default(''),
    imageUrl: z.string().max(500).optional(),
    replyToId: z.number().int().positive().optional(),
  })
  .refine((v) => (!!v.content && v.content.trim().length > 0) || !!v.imageUrl, {
    message: '消息不能为空',
  });

const createConversationSchema = z.object({
  targetUserId: z.number().int().positive('目标用户ID无效'),
});

export function registerMessageRoutes(app: any, pool: Pool) {
  function isSchemaError(err: any): boolean {
    return err?.errno === 1054 || err?.code === 'ER_BAD_FIELD_ERROR' || err?.errno === 1146;
  }

  /** 我拉黑的人（user_blocks 未迁移时返回空数组，优雅降级不影响私信主流程） */
  async function getBlockedIds(userId: number): Promise<number[]> {
    try {
      const [rows]: any = await pool.query('SELECT blocked_id FROM user_blocks WHERE blocker_id = ?', [userId]);
      return rows.map((r: any) => r.blocked_id);
    } catch {
      return [];
    }
  }

  /** 双向拉黑检查：任一方拉黑另一方即为 true */
  async function isBlockedBetween(a: number, b: number): Promise<boolean> {
    try {
      const [rows]: any = await pool.query(
        'SELECT 1 FROM user_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?) LIMIT 1',
        [a, b, b, a],
      );
      return rows.length > 0;
    } catch {
      return false;
    }
  }

  // ── 获取我的会话列表（不含"陌生人待接受且我是接收方"的会话，那些走 /conversations/pending） ──
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
           c.status,
           c.initiator_id,
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
         WHERE (c.user1_id = ? OR c.user2_id = ?)
           AND (c.status = 'active' OR c.initiator_id = ?)
         ORDER BY c.last_message_at DESC
         LIMIT 100`,
        [userId, userId, userId, userId, userId, userId, userId, userId],
      );
      // 过滤掉我拉黑的用户的会话
      const blockedSet = new Set(await getBlockedIds(userId!));
      const conversations = rows
        .filter((r: any) => !blockedSet.has(r.other_user_id))
        .map((r: any) => ({
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
          status: r.status || 'active',
          isInitiator: r.initiator_id === userId,
        }));
      ok(res, conversations);
    } catch (err: any) {
      if (isSchemaError(err)) return ok(res, []);
      logger.error('获取会话列表失败', { error: err.message, user_id: req.userId, trace_id: (req as any)._traceId });
      fail(res, 500, '获取会话列表失败');
    }
  });

  // ── 陌生人消息（我是接收方、对方发起、还未接受的会话）──
  app.get('/api/v1/conversations/pending', auth, limiter(30), async (req: Request, res: Response) => {
    try {
      const userId = req.userId;
      const [rows]: any = await pool.query(
        `SELECT
           c.id,
           c.last_message_at,
           CASE WHEN c.user1_id = ? THEN u2.nickname ELSE u1.nickname END AS other_nickname,
           CASE WHEN c.user1_id = ? THEN u2.avatar_url ELSE u1.avatar_url END AS other_avatar,
           CASE WHEN c.user1_id = ? THEN u2.id ELSE u1.id END AS other_user_id,
           (SELECT CASE WHEN (content IS NULL OR content = '') AND image_url IS NOT NULL THEN '[图片]' ELSE content END
              FROM chat_messages WHERE conversation_id = c.id AND status = 'active' ORDER BY created_at DESC LIMIT 1) AS last_message
         FROM conversations c
         JOIN users u1 ON c.user1_id = u1.id
         JOIN users u2 ON c.user2_id = u2.id
         WHERE (c.user1_id = ? OR c.user2_id = ?)
           AND c.status = 'pending'
           AND c.initiator_id IS NOT NULL AND c.initiator_id != ?
         ORDER BY c.last_message_at DESC
         LIMIT 100`,
        [userId, userId, userId, userId, userId, userId],
      );
      const blockedSet = new Set(await getBlockedIds(userId!));
      const requests = rows
        .filter((r: any) => !blockedSet.has(r.other_user_id))
        .map((r: any) => ({
          id: r.id,
          otherUser: {
            id: r.other_user_id,
            nickname: r.other_nickname || '未知用户',
            avatarUrl: r.other_avatar || '',
          },
          lastMessage: r.last_message || null,
          lastMessageAt: r.last_message_at || null,
        }));
      ok(res, requests);
    } catch (err: any) {
      if (isSchemaError(err)) return ok(res, []);
      logger.error('获取陌生人消息失败', { error: err.message, user_id: req.userId, trace_id: (req as any)._traceId });
      fail(res, 500, '获取失败');
    }
  });

  // ── 未读私信总数 ──
  app.get('/api/v1/conversations/unread-count', auth, limiter(60), async (req: Request, res: Response) => {
    try {
      const userId = req.userId;
      // 排除我拉黑的用户发来的消息
      const blockedIds = await getBlockedIds(userId!);
      let sql = `SELECT COUNT(*) AS count FROM chat_messages m
         JOIN conversations c ON m.conversation_id = c.id
         WHERE (c.user1_id = ? OR c.user2_id = ?) AND m.sender_id != ? AND m.is_read = FALSE AND m.status = 'active'`;
      const params: any[] = [userId, userId, userId];
      if (blockedIds.length > 0) {
        sql += ` AND m.sender_id NOT IN (${blockedIds.map(() => '?').join(',')})`;
        params.push(...blockedIds);
      }
      const [rows]: any = await pool.query(sql, params);
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
      const [users]: any = await pool.query('SELECT id, nickname, avatar_url, last_active FROM users WHERE id = ?', [
        targetUserId,
      ]);
      if (users.length === 0) {
        return fail(res, 404, '用户不存在', ErrorCode.NOT_FOUND);
      }

      const targetUser = users[0];

      // 双向拉黑检查（不区分方向，避免暴露谁拉黑了谁）
      if (await isBlockedBetween(userId, targetUserId)) {
        logger.security('拉黑用户间发起会话被拒', {
          user_id: userId,
          target_id: targetUserId,
          trace_id: (req as any)._traceId,
        });
        return fail(res, 403, '无法向该用户发起会话');
      }

      // 查找或创建会话（使用 LEAST/GREATEST 保证顺序）
      const [convRows]: any = await pool.query(
        `SELECT id, status, initiator_id FROM conversations
         WHERE user1_id = LEAST(?, ?) AND user2_id = GREATEST(?, ?)`,
        [userId, targetUserId, userId, targetUserId],
      );

      let conversationId: number;
      let status = 'active';
      let initiatorId: number | null = null;
      if (convRows.length > 0) {
        // 已存在的会话（不管是谁发起这次请求）：原样返回，不重复建、不重置陌生人配额
        conversationId = convRows[0].id;
        status = convRows[0].status || 'active';
        initiatorId = convRows[0].initiator_id;
      } else {
        // 新会话发起频率风控：短时间内对多个不同陌生人发起会话且都还没被接受，是群发式骚扰的信号
        // 只记录不硬拦截（避免误伤正常场景，比如联系多个卖家），交给管理端按账号聚合处理
        try {
          const [freqRows]: any = await pool.query(
            `SELECT COUNT(*) AS cnt FROM conversations
             WHERE initiator_id = ? AND status = 'pending' AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
            [userId],
          );
          if (freqRows[0].cnt >= 8) {
            logger.security('陌生人会话发起频率异常', {
              user_id: userId,
              pending_count_last_hour: freqRows[0].cnt,
              trace_id: (req as any)._traceId,
            });
          }
        } catch {
          /* 风控统计失败不阻塞主流程 */
        }

        try {
          // 新建会话默认 pending，发起人是当前请求者——陌生人首次接触门槛从这里开始
          const [insertResult]: any = await pool.query(
            "INSERT INTO conversations (user1_id, user2_id, status, initiator_id) VALUES (LEAST(?, ?), GREATEST(?, ?), 'pending', ?)",
            [userId, targetUserId, userId, targetUserId, userId],
          );
          conversationId = insertResult.insertId;
          status = 'pending';
          initiatorId = userId;
          logger.business('创建新会话', {
            conversation_id: conversationId,
            user1: Math.min(userId, targetUserId),
            user2: Math.max(userId, targetUserId),
            initiator_id: userId,
            trace_id: (req as any)._traceId,
          });
        } catch (insertErr: any) {
          // 并发双击撞 uk_user_pair 唯一键 → 重查已存在的会话，而不是 500
          if (insertErr?.errno !== 1062) throw insertErr;
          const [retryRows]: any = await pool.query(
            'SELECT id, status, initiator_id FROM conversations WHERE user1_id = LEAST(?, ?) AND user2_id = GREATEST(?, ?)',
            [userId, targetUserId, userId, targetUserId],
          );
          if (retryRows.length === 0) throw insertErr;
          conversationId = retryRows[0].id;
          status = retryRows[0].status || 'active';
          initiatorId = retryRows[0].initiator_id;
        }
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
        status,
        isInitiator: initiatorId === userId,
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
    const since = req.query.since ? parseInt(req.query.since as string, 10) : undefined;
    const limit = 50;

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
        query = `SELECT id, conversation_id, sender_id, content, image_url, is_read, recalled_at, reply_to_id, created_at
                 FROM chat_messages
                 WHERE conversation_id = ? AND status = 'active' AND id < ?
                 ORDER BY created_at DESC LIMIT ?`;
        params = [conversationId, before, limit];
      } else if (since) {
        // 轮询增量查询：只返回 id > since 的消息，正序排列
        query = `SELECT id, conversation_id, sender_id, content, image_url, is_read, recalled_at, reply_to_id, created_at
                 FROM chat_messages
                 WHERE conversation_id = ? AND status = 'active' AND id > ?
                 ORDER BY created_at ASC LIMIT ?`;
        params = [conversationId, since, limit];
      } else {
        query = `SELECT id, conversation_id, sender_id, content, image_url, is_read, recalled_at, reply_to_id, created_at
                 FROM chat_messages
                 WHERE conversation_id = ? AND status = 'active'
                 ORDER BY created_at DESC LIMIT ?`;
        params = [conversationId, limit];
      }

      const [msgRows]: any = await pool.query(query, params);
      // 反转顺序让最旧的在前面（非 since 查询时 DESC→ASC）
      const messages = (since ? msgRows : msgRows.reverse()).map((r: any) => ({
        id: r.id,
        conversationId: r.conversation_id,
        senderId: r.sender_id,
        content: r.content || '',
        imageUrl: r.image_url || null,
        isRead: !!r.is_read,
        recalledAt: r.recalled_at || null,
        replyToId: r.reply_to_id || null,
        createdAt: r.created_at,
      }));

      // 检查是否还有更多（since 轮询不检查 hasMore）
      let hasMore = false;
      if (!since && messages.length === limit) {
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
    const replyToId = input.replyToId || null;

    // 敏感词过滤（与前端相同的词库）
    const blockedWords = [
      'fuck',
      'shit',
      '操你',
      '傻逼',
      'sb',
      'cnm',
      '代写',
      '代考',
      '作弊',
      '办证',
      '嫖娼',
      '赌博',
      '毒品',
    ];
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
        'SELECT id, user1_id, user2_id, status, initiator_id FROM conversations WHERE id = ? AND (user1_id = ? OR user2_id = ?)',
        [conversationId, userId, userId],
      );
      if (convRows.length === 0) {
        return fail(res, 404, '会话不存在', ErrorCode.NOT_FOUND);
      }

      const conv = convRows[0];
      const otherUserId = conv.user1_id === userId ? conv.user2_id : conv.user1_id;

      // 双向拉黑检查：任一方拉黑后禁止发送（不暴露方向）
      if (await isBlockedBetween(userId, otherUserId)) {
        logger.security('拉黑用户间发私信被拒', {
          user_id: userId,
          other_id: otherUserId,
          conversation_id: conversationId,
          trace_id: (req as any)._traceId,
        });
        return fail(res, 403, '消息发送失败');
      }

      // 陌生人 pending 门槛：接收方必须先「继续聊天」，发起方只能发 1 条纯文字
      if (conv.status === 'pending' && conv.initiator_id) {
        if (conv.initiator_id === userId) {
          if (imageUrl) {
            return fail(res, 400, '对方还未回复前不能发送图片', ErrorCode.CONVERSATION_PENDING_NO_ATTACHMENT);
          }
          const [sentRows]: any = await pool.query(
            'SELECT COUNT(*) AS cnt FROM chat_messages WHERE conversation_id = ? AND sender_id = ?',
            [conversationId, userId],
          );
          if (sentRows[0].cnt >= 1) {
            return fail(
              res,
              400,
              '对方还没有回复，请等待对方接受后再继续发送',
              ErrorCode.CONVERSATION_PENDING_QUOTA_EXCEEDED,
            );
          }
        } else {
          // 接收方在 pending 期间没有自由发消息的权限，必须先调用 accept
          return fail(res, 403, '请先点击"继续聊天"再发送消息', ErrorCode.CONVERSATION_NOT_ACCEPTED);
        }
      }

      const [insertResult]: any = await pool.query(
        'INSERT INTO chat_messages (conversation_id, sender_id, content, image_url, reply_to_id) VALUES (?, ?, ?, ?, ?)',
        [conversationId, userId, content || null, imageUrl, replyToId],
      );

      // 更新会话最后消息时间
      await pool.query('UPDATE conversations SET last_message_at = NOW() WHERE id = ?', [conversationId]);

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
        'SELECT id, conversation_id, sender_id, content, image_url, is_read, recalled_at, reply_to_id, created_at FROM chat_messages WHERE id = ?',
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
        recalledAt: msg.recalled_at || null,
        replyToId: msg.reply_to_id || null,
        createdAt: msg.created_at,
      });

      // Web Push：给接收方推一条新消息通知。异步触发、不 await——推送慢/失败不该拖慢发送方的响应；
      // sendPushToUser 内部已经把"未配置/未订阅/发送失败"全部 catch 成 0，不会抛出未处理异常。
      // 私信本身不匿名（跟帖子/圈子的匿名玩法是两回事），标题用发送者昵称没有泄露问题。
      pool
        .query('SELECT nickname FROM users WHERE id = ?', [userId])
        .then(([senderRows]: any) => {
          const senderName = senderRows?.[0]?.nickname || '有人';
          const preview = content
            ? content.length > 40
              ? content.slice(0, 40) + '…'
              : content
            : imageUrl
              ? '[图片]'
              : '发来一条新消息';
          sendPushToUser(pool, otherUserId, {
            title: senderName,
            body: preview,
            tag: `dm-${conversationId}`,
            url: '/campus/?tab=messages',
          });
        })
        .catch(() => {
          /* 查昵称失败不影响主流程，推送本来就是锦上添花 */
        });
    } catch (err: any) {
      if (isSchemaError(err)) return fail(res, 500, '私信功能暂不可用');
      logger.error('发送消息失败', { error: err.message, user_id: userId, trace_id: (req as any)._traceId });
      fail(res, 500, '发送消息失败');
    }
  });

  // ── 接受陌生人会话（仅接收方可调，显式「继续聊天」，不做"回复即解锁"） ──
  app.put('/api/v1/conversations/:id/accept', auth, limiter(20), async (req: Request, res: Response) => {
    const conversationId = parseInt(req.params.id as string, 10);
    if (isNaN(conversationId)) return fail(res, 400, '会话ID无效');

    const userId = req.userId!;

    try {
      const [convRows]: any = await pool.query(
        'SELECT id, user1_id, user2_id, status, initiator_id FROM conversations WHERE id = ? AND (user1_id = ? OR user2_id = ?)',
        [conversationId, userId, userId],
      );
      if (convRows.length === 0) return fail(res, 404, '会话不存在', ErrorCode.NOT_FOUND);

      const conv = convRows[0];
      if (conv.status !== 'pending') {
        // 已经是 active，幂等返回成功，不报错
        return ok(res, { status: 'active' });
      }
      if (conv.initiator_id === userId) {
        return fail(res, 403, '发起人无需接受自己发起的会话');
      }

      await pool.query("UPDATE conversations SET status = 'active' WHERE id = ?", [conversationId]);

      logger.business('接受陌生人会话', {
        conversation_id: conversationId,
        user_id: userId,
        trace_id: (req as any)._traceId,
      });
      ok(res, { status: 'active' });
    } catch (err: any) {
      if (isSchemaError(err)) return fail(res, 500, '功能暂不可用');
      logger.error('接受会话失败', { error: err.message, user_id: userId, trace_id: (req as any)._traceId });
      fail(res, 500, '操作失败');
    }
  });

  // ── 撤回消息（2分钟内可撤回） ──
  app.put(
    '/api/v1/conversations/:convId/messages/:msgId/recall',
    auth,
    limiter(5),
    async (req: Request, res: Response) => {
      const conversationId = parseInt(req.params.convId as string, 10);
      const messageId = parseInt(req.params.msgId as string, 10);
      if (isNaN(conversationId) || isNaN(messageId)) return fail(res, 400, '参数无效');

      const userId = req.userId!;

      try {
        // 验证消息归属和会话归属
        const [msgRows]: any = await pool.query(
          `SELECT id, sender_id, created_at, recalled_at, status
         FROM chat_messages
         WHERE id = ? AND conversation_id = ? AND status = 'active'`,
          [messageId, conversationId],
        );
        if (msgRows.length === 0) return fail(res, 404, '消息不存在');

        const msg = msgRows[0];

        // 只能撤回自己的消息
        if (msg.sender_id !== userId) {
          return fail(res, 403, '只能撤回自己的消息');
        }

        // 只能在2分钟内撤回
        const elapsed = Date.now() - new Date(msg.created_at).getTime();
        if (elapsed > 2 * 60 * 1000) {
          return fail(res, 400, '超过2分钟，无法撤回');
        }

        // 已撤回的消息不能再次撤回
        if (msg.recalled_at) {
          return fail(res, 400, '消息已被撤回');
        }

        // 执行撤回：清除内容，标记撤回时间
        await pool.query(
          'UPDATE chat_messages SET content = NULL, image_url = NULL, recalled_at = NOW() WHERE id = ?',
          [messageId],
        );

        logger.business('撤回私信', {
          message_id: messageId,
          conversation_id: conversationId,
          sender_id: userId,
          trace_id: (req as any)._traceId,
        });

        ok(res, { recalled: true });
      } catch (err: any) {
        if (isSchemaError(err)) return fail(res, 500, '功能暂不可用');
        logger.error('撤回消息失败', { error: err.message, user_id: userId, trace_id: (req as any)._traceId });
        fail(res, 500, '撤回失败');
      }
    },
  );

  // ── 拉黑用户 ──
  app.post('/api/v1/users/:id/block', auth, limiter(5), async (req: Request, res: Response) => {
    const targetId = parseInt(req.params.id as string, 10);
    if (isNaN(targetId) || targetId < 1) return fail(res, 400, '用户ID无效');
    if (targetId === req.userId) return fail(res, 400, '不能拉黑自己');
    try {
      const [users]: any = await pool.query('SELECT id FROM users WHERE id = ?', [targetId]);
      if (users.length === 0) return fail(res, 404, '用户不存在', ErrorCode.NOT_FOUND);
      await pool.query('INSERT IGNORE INTO user_blocks (blocker_id, blocked_id) VALUES (?, ?)', [req.userId, targetId]);
      logger.business('拉黑用户', { user_id: req.userId, blocked_id: targetId, trace_id: (req as any)._traceId });
      ok(res, { blocked: true });
    } catch (err: any) {
      if (isSchemaError(err)) return fail(res, 500, '功能暂不可用');
      logger.error('拉黑失败', { error: err.message, user_id: req.userId, trace_id: (req as any)._traceId });
      fail(res, 500, '操作失败');
    }
  });

  // ── 取消拉黑 ──
  app.delete('/api/v1/users/:id/block', auth, limiter(5), async (req: Request, res: Response) => {
    const targetId = parseInt(req.params.id as string, 10);
    if (isNaN(targetId) || targetId < 1) return fail(res, 400, '用户ID无效');
    try {
      await pool.query('DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?', [req.userId, targetId]);
      logger.business('取消拉黑', { user_id: req.userId, blocked_id: targetId, trace_id: (req as any)._traceId });
      ok(res, { blocked: false });
    } catch (err: any) {
      if (isSchemaError(err)) return fail(res, 500, '功能暂不可用');
      logger.error('取消拉黑失败', { error: err.message, user_id: req.userId, trace_id: (req as any)._traceId });
      fail(res, 500, '操作失败');
    }
  });

  // ── 我的拉黑列表 ──
  app.get('/api/v1/users/blocked', auth, limiter(10), async (req: Request, res: Response) => {
    try {
      const [rows]: any = await pool.query(
        `SELECT b.blocked_id AS id, u.nickname, u.avatar_url AS avatarUrl, b.created_at AS blockedAt
         FROM user_blocks b JOIN users u ON b.blocked_id = u.id
         WHERE b.blocker_id = ? ORDER BY b.created_at DESC`,
        [req.userId],
      );
      ok(res, rows);
    } catch (err: any) {
      if (isSchemaError(err)) return ok(res, []);
      logger.error('获取拉黑列表失败', { error: err.message, user_id: req.userId, trace_id: (req as any)._traceId });
      fail(res, 500, '获取失败');
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
