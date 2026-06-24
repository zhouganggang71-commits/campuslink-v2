/**
 * 通知 API
 */
import { request } from './client';

export const noticesApi = {
  /** 删除通知 */
  delete(noticeId: string) {
    return request('DELETE', `/notices/${noticeId}`);
  },
  /** 获取通知列表 */
  list() {
    return request<any[]>('GET', '/notices');
  },

  /** 标记已读 */
  markRead(noticeId: string) {
    return request('PUT', `/notices/${noticeId}/read`);
  },

  /** 全部已读 */
  markAllRead() {
    return request('PUT', '/notices/read-all');
  },
};
