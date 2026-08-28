/**
 * 私信 API
 */
import { request } from './client';
import type { Conversation, ChatMessage, PendingConversation } from '../types';

export const dmApi = {
  /** 获取会话列表（按最后消息时间倒序，带未读数；不含陌生人待接受的会话） */
  listConversations() {
    return request<Conversation[]>('GET', '/conversations');
  },

  /** 陌生人消息：我是接收方、对方发起、还未接受的会话 */
  listPending() {
    return request<PendingConversation[]>('GET', '/conversations/pending');
  },

  /** 接受陌生人会话（仅接收方可调，显式"继续聊天"） */
  acceptConversation(conversationId: number) {
    return request<{ status: string }>('PUT', `/conversations/${conversationId}/accept`);
  },

  /** 查找或创建与目标用户的会话 */
  findOrCreate(targetUserId: number) {
    return request<Conversation>('POST', '/conversations', { targetUserId });
  },

  /** 获取会话消息（cursor 分页，before 为上一页最后一条消息 id；since 为轮询用，只返回更新的消息） */
  getMessages(conversationId: number, before?: number, since?: number) {
    const params = new URLSearchParams();
    if (before) params.set('before', String(before));
    if (since) params.set('since', String(since));
    const qs = params.toString();
    return request<{ messages: ChatMessage[]; hasMore: boolean }>(
      'GET',
      `/conversations/${conversationId}/messages${qs ? '?' + qs : ''}`,
    );
  },

  /** 发送消息（文本 / 图片，二者至少一个，可选回复目标） */
  sendMessage(conversationId: number, content: string, imageUrl?: string, replyToId?: number) {
    return request<ChatMessage>('POST', `/conversations/${conversationId}/messages`, { content, imageUrl, replyToId });
  },

  /** 撤回消息（2分钟内可撤回） */
  recallMessage(conversationId: number, messageId: number) {
    return request<{ recalled: boolean }>('PUT', `/conversations/${conversationId}/messages/${messageId}/recall`);
  },

  /** 标记会话已读 */
  markRead(conversationId: number) {
    return request('PUT', `/conversations/${conversationId}/read`);
  },

  /** 获取未读私信总数 */
  unreadCount() {
    return request<{ count: number }>('GET', '/conversations/unread-count');
  },

  /** 拉黑用户（双向禁止私信） */
  blockUser(userId: number) {
    return request<{ blocked: boolean }>('POST', `/users/${userId}/block`);
  },

  /** 取消拉黑 */
  unblockUser(userId: number) {
    return request<{ blocked: boolean }>('DELETE', `/users/${userId}/block`);
  },

  /** 我的拉黑列表 */
  blockedList() {
    return request<{ id: number; nickname: string; avatarUrl: string; blockedAt: string }[]>('GET', '/users/blocked');
  },
};
