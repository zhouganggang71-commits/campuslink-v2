/**
 * 私信 API
 */
import { request } from './client';
import type { Conversation, ChatMessage } from '../types';

export const dmApi = {
  /** 获取会话列表（按最后消息时间倒序，带未读数） */
  listConversations() {
    return request<Conversation[]>('GET', '/conversations');
  },

  /** 查找或创建与目标用户的会话 */
  findOrCreate(targetUserId: number) {
    return request<Conversation>('POST', '/conversations', { targetUserId });
  },

  /** 获取会话消息（cursor 分页，before 为上一页最后一条消息 id） */
  getMessages(conversationId: number, before?: number) {
    const query = before ? `?before=${before}` : '';
    return request<{ messages: ChatMessage[]; hasMore: boolean }>('GET', `/conversations/${conversationId}/messages${query}`);
  },

  /** 发送消息（文本 / 图片，二者至少一个） */
  sendMessage(conversationId: number, content: string, imageUrl?: string) {
    return request<ChatMessage>('POST', `/conversations/${conversationId}/messages`, { content, imageUrl });
  },

  /** 标记会话已读 */
  markRead(conversationId: number) {
    return request('PUT', `/conversations/${conversationId}/read`);
  },

  /** 获取未读私信总数 */
  unreadCount() {
    return request<{ count: number }>('GET', '/conversations/unread-count');
  },
};
