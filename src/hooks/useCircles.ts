/**
 * 校园圈数据层 — 圈子列表 + 帖子流 + 发布/点赞/评论
 */
import { useState, useCallback } from 'react';
import { api } from '../utils/api';

export interface CircleInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  post_count: number;
}

export interface CirclePost {
  id: number;
  circle_id: string;
  content: string;
  images: string[] | null;
  tags: string[] | null;
  is_anonymous: boolean;
  like_count: number;
  comment_count: number;
  hot_score: number;
  created_at: string;
  nickname: string;
  auth_status: string;
  is_admin: boolean;
}

export function useCircles() {
  const [circles, setCircles] = useState<CircleInfo[]>([]);
  const [activeCircle, setActiveCircle] = useState('trending');
  const [posts, setPosts] = useState<CirclePost[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);

  // 圈子列表 + 初始帖子流合并在一次 effect 完成，避免闪屏
  const init = useCallback(async () => {
    setLoading(true);
    try {
      const [circlesRes, postsRes] = await Promise.all([
        api.get<CircleInfo[]>('/circles'),
        api.get<{ list: CirclePost[]; total: number; totalPages: number }>('/circles/trending?page=1&size=20'),
      ]);
      if (circlesRes.code === 0 && Array.isArray(circlesRes.data)) {
        setCircles(circlesRes.data);
      }
      if (postsRes.code === 0 && postsRes.data) {
        setPosts(postsRes.data.list);
        setTotalPages(postsRes.data.totalPages || 1);
        setPage(1);
      }
    } catch { /* noop */ }
    setLoading(false);
    setInitialLoaded(true);
  }, []);

  // 获取帖子流
  const fetchPosts = useCallback(async (circleId: string, pageNum: number, keyword = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pageNum), size: '20' });
      if (keyword) params.set('keyword', keyword);
      const url = circleId === 'trending'
        ? `/circles/trending?${params}`
        : `/circles/${circleId}/posts?${params}`;
      const res = await api.get<{ list: CirclePost[]; total: number; totalPages: number }>(url);
      if (res.code === 0 && res.data) {
        setPosts(res.data.list);
        setTotalPages(res.data.totalPages || 1);
        setPage(pageNum);
      }
    } catch { /* noop */ }
    setLoading(false);
  }, []);

  // 切换圈子（不清空旧帖，避免白屏跳跃）
  const switchCircle = useCallback((circleId: string) => {
    setActiveCircle(circleId);
    setPage(1);
    fetchPosts(circleId, 1);
  }, [fetchPosts]);

  // 服务端搜索
  const searchPosts = useCallback((keyword: string) => {
    fetchPosts(activeCircle, 1, keyword);
  }, [activeCircle, fetchPosts]);

  // 翻页
  const goToPage = useCallback((pageNum: number) => {
    fetchPosts(activeCircle, pageNum);
  }, [activeCircle, fetchPosts]);

  // 发布后本地插入
  const prependPost = useCallback((post: CirclePost) => {
    setPosts((prev) => [post, ...prev]);
  }, []);

  // 本地更新点赞数
  const updateLikeCount = useCallback((postId: number, count: number) => {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, like_count: count } : p)));
  }, []);

  return {
    circles, activeCircle,
    posts, loading, page, totalPages, goToPage,
    init, switchCircle, searchPosts,
    prependPost, updateLikeCount,
    initialLoaded,
  };
}
