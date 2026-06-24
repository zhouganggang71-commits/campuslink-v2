/**
 * 帖子 API — CRUD/收藏/举报/分类
 */
import { request } from './client';

export const postsApi = {
  list(params: { page?: number; limit?: number; type?: string; keyword?: string; userId?: number; sort?: string } = {}) {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.type) qs.set('type', params.type);
    if (params.keyword) qs.set('keyword', params.keyword.slice(0, 100));
    if (params.userId) qs.set('userId', String(params.userId));
    if (params.sort) qs.set('sort', params.sort);
    return request<{ list: any[]; total: number; page: number; limit: number }>('GET', `/posts?${qs}`);
  },

  detail(postId: string | number) {
    return request<any>('GET', `/posts/${postId}`);
  },

  create(body: {
    title: string; description: string; price?: number | null;
    originalPrice?: number | null; category: string;
    postType: string; imageUrls: string[]; contactInfo?: string | null;
  }) {
    return request<{ id: number }>('POST', '/posts', body);
  },

  delete(postId: string) {
    return request('DELETE', `/posts/${postId}`);
  },

  markSold(postId: string) {
    return request('PUT', `/posts/${postId}/sold`);
  },

  report(postId: string, reason: string) {
    return request('POST', `/posts/${postId}/report`, { reason });
  },

  // 收藏
  toggleFav(postId: string) {
    return request<{ favorited: boolean }>('POST', `/favorites/${postId}`);
  },

  getFavorites() {
    return request<any[]>('GET', '/favorites');
  },

  // 分类
  getCategories() {
    return request<any[]>('GET', '/categories');
  },
};
