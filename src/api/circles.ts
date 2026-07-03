/**
 * 校园圈 API — 圈子列表/帖子流/发布/点赞/评论/收藏
 */
import { request } from './client';

export const circlesApi = {
  /** 圈子列表 */
  list() {
    return request<any[]>('GET', '/circles');
  },

  /** 热门跨圈流 */
  trending(params: { page?: number; size?: number; keyword?: string } = {}) {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.size) qs.set('size', String(params.size));
    if (params.keyword) qs.set('keyword', params.keyword.slice(0, 100));
    return request<{ list: any[]; total: number; totalPages: number }>('GET', `/circles/trending?${qs}`);
  },

  /** 单圈帖子流 */
  posts(circleId: string, params: { page?: number; size?: number; keyword?: string } = {}) {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.size) qs.set('size', String(params.size));
    if (params.keyword) qs.set('keyword', params.keyword.slice(0, 100));
    return request<{ list: any[]; total: number; totalPages: number }>('GET', `/circles/${circleId}/posts?${qs}`);
  },

  /** 发布帖子 */
  createPost(circleId: string, body: {
    circle_id: string; content: string; images?: string[];
    tags?: string[]; is_anonymous?: boolean;
  }) {
    return request<any>('POST', `/circles/${circleId}/posts`, body);
  },

  /** 删除帖子（软删除） */
  deletePost(circleId: string, postId: string) {
    return request('DELETE', `/circles/${circleId}/posts/${postId}`);
  },

  /** 点赞（切换，返回最新状态） */
  like(postId: number) {
    return request<{ liked: boolean; like_count: number }>('POST', `/circle-posts/${postId}/like`);
  },

  /** 点赞列表（当前用户已点赞的帖子 id） */
  getLikes() {
    return request<number[]>('GET', '/circle-likes');
  },

  /** 评论 */
  comment(postId: number, content: string, parentId?: number | null, imageUrl?: string) {
    return request<any>('POST', `/circle-posts/${postId}/comment`, { content, parent_id: parentId, image_url: imageUrl });
  },

  /** 评论列表 */
  getComments(postId: number) {
    return request<any[]>('GET', `/circle-posts/${postId}/comments`);
  },

  /** 收藏（切换） */
  toggleFav(postId: number) {
    return request<{ favorited: boolean }>('POST', `/circle-posts/${postId}/favorite`);
  },

  /** 收藏列表 */
  getFavorites() {
    return request<any[]>('GET', '/circle-favorites');
  },
};
