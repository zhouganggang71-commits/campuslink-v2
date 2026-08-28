/**
 * 校园圈 Tab — 圈子横滑 + 帖子流 + 热度排行 + 发布入口
 */
import { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { usePullToRefresh, PullIndicator } from '../../hooks/usePullToRefresh';
import { useCircles } from '../../hooks/useCircles';
import { getToken } from '../../utils/api';
import { circlesApi } from '../../api';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import Pagination from '../ui/Pagination';
import CircleCard from './CircleCard';
import CirclePostDetail from './CirclePostDetail';
import CirclePublishModal from '../modal/CirclePublishModal';
import CircleHotRanking from '../modal/CircleHotRanking';
import ScrollToTop from '../ui/ScrollToTop';
import { CardSkeleton } from '../ui/Skeleton';
import type { CirclePost } from '../../hooks/useCircles';

interface CircleTabProps {
  showToast: (msg: string, type?: 'success' | 'info') => void;
  isGuest: boolean;
  onAuth: () => void;
  onViewProfile?: (userId: number, placeholder: any) => void;
}

function loadSaved(): Set<number> {
  try {
    const raw = localStorage.getItem('campuslink_circle_saved');
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}
function saveSaved(ids: Set<number>) {
  try {
    localStorage.setItem('campuslink_circle_saved', JSON.stringify([...ids]));
  } catch {
    /* 忽略 */
  }
}

function loadLiked(): Set<number> {
  try {
    const raw = localStorage.getItem('campuslink_circle_liked');
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}
function saveLiked(ids: Set<number>) {
  try {
    localStorage.setItem('campuslink_circle_liked', JSON.stringify([...ids]));
  } catch {
    /* 忽略 */
  }
}

export default function CircleTab({ showToast, isGuest, onAuth, onViewProfile }: CircleTabProps) {
  const {
    circles,
    activeCircle,
    posts,
    loading,
    page,
    totalPages,
    goToPage,
    init,
    switchCircle,
    searchPosts,
    prependPost,
    updateLikeCount,
    initialLoaded,
    initError,
    retryInit,
  } = useCircles();

  const [publishOpen, setPublishOpen] = useState(false);
  const [hotRankingOpen, setHotRankingOpen] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<number>>(loadSaved);
  const [likedIds, setLikedIds] = useState<Set<number>>(loadLiked);
  const [detailPostId, setDetailPostId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── 下拉刷新 ──
  const { pullDistance, handleTouchStart, handleTouchMove, handleTouchEnd, PULL_THRESHOLD } = usePullToRefresh({
    refreshing: loading,
    onRefresh: init,
    scrollRef,
  });
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    if (!initialLoaded) init();
  }, [init, initialLoaded]);

  useEffect(() => {
    if (!getToken()) return;
    circlesApi
      .getFavorites()
      .then((res) => {
        if (res.code === 0 && Array.isArray(res.data)) {
          setSavedIds(new Set(res.data.map((p: any) => p.id)));
        }
      })
      .catch(() => {});
    circlesApi
      .getLikes()
      .then((res) => {
        if (res.code === 0 && Array.isArray(res.data)) {
          setLikedIds(new Set(res.data));
        }
      })
      .catch(() => {});
  }, [initialLoaded]);

  useEffect(() => {
    saveSaved(savedIds);
  }, [savedIds]);
  useEffect(() => {
    saveLiked(likedIds);
  }, [likedIds]);

  // 详情页展示"实时"帖子（随 posts 数组里的点赞/评论数变化同步），而不是打开时的静态快照
  const detailPost = useMemo(
    () => (detailPostId == null ? null : posts.find((p) => p.id === detailPostId) || null),
    [posts, detailPostId],
  );

  // ── 服务端搜索（替代客户端过滤） ──
  const handleSearch = useCallback(() => {
    searchPosts(searchQuery.trim());
  }, [searchQuery, searchPosts]);

  // 清空搜索时恢复全部
  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    searchPosts('');
  }, [searchPosts]);

  const filteredPosts = posts;

  const handleLike = useCallback(
    async (postId: number) => {
      if (isGuest) return showToast('请先登录');
      const wasLiked = likedIds.has(postId);
      // 乐观切换 —— 已赞的会显示红心并允许取消，未赞的点一下就赞满，不会无限重复计数
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.delete(postId);
        else next.add(postId);
        return next;
      });
      try {
        const res = await circlesApi.like(postId);
        if (res.code === 0) {
          const data = res.data as any;
          updateLikeCount(postId, data.like_count || 0);
          setLikedIds((prev) => {
            const next = new Set(prev);
            if (data.liked) next.add(postId);
            else next.delete(postId);
            return next;
          });
        } else {
          setLikedIds((prev) => {
            const next = new Set(prev);
            if (wasLiked) next.add(postId);
            else next.delete(postId);
            return next;
          });
        }
      } catch {
        setLikedIds((prev) => {
          const next = new Set(prev);
          if (wasLiked) next.add(postId);
          else next.delete(postId);
          return next;
        });
      }
    },
    [isGuest, likedIds, updateLikeCount, showToast],
  );

  const handleSave = useCallback(
    async (postId: number) => {
      if (isGuest) return showToast('请先登录');
      const wasSaved = savedIds.has(postId);
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.delete(postId);
        else next.add(postId);
        return next;
      });
      try {
        const res = await circlesApi.toggleFav(postId);
        if (res.code !== 0) {
          setSavedIds((prev) => {
            const next = new Set(prev);
            if (wasSaved) next.add(postId);
            else next.delete(postId);
            return next;
          });
        }
      } catch {
        setSavedIds((prev) => {
          const next = new Set(prev);
          if (wasSaved) next.add(postId);
          else next.delete(postId);
          return next;
        });
      }
    },
    [isGuest, savedIds, showToast],
  );

  const handlePublishSuccess = useCallback(
    (post: CirclePost) => {
      prependPost(post);
      showToast('发布成功');
    },
    [prependPost, showToast],
  );

  // 详情页
  if (detailPost) {
    return (
      <CirclePostDetail
        post={detailPost}
        onBack={() => setDetailPostId(null)}
        onLike={handleLike}
        onSave={handleSave}
        isSaved={savedIds.has(detailPost.id)}
        isLiked={likedIds.has(detailPost.id)}
        showToast={showToast}
        onViewProfile={onViewProfile}
      />
    );
  }

  return (
    <div className="flex flex-col flex-1">
      {/* 顶栏 */}
      <div className="px-4 py-3 bg-white flex items-center justify-between">
        <div>
          <h2 className="font-headline text-base font-bold text-on-surface">校园圈</h2>
          <p className="text-[10px] text-on-surface-variant/60 mt-0.5">打破院系壁垒，连接全校同学</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setHotRankingOpen(true)}
            className="flex items-center gap-1 text-[10px] font-semibold text-course-orange bg-course-orange/5 px-2.5 py-1.5 rounded-full hover:bg-course-orange/10 transition-colors cursor-pointer"
          >
            <Icon name="trending_up" className="text-[10px]" />
            热门
          </button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              if (isGuest) onAuth();
              else setPublishOpen(true);
            }}
          >
            发布
          </Button>
        </div>
      </div>

      {/* 搜索栏 */}
      {showSearch && (
        <div className="px-4 py-2 bg-white border-b border-outline-variant/60 flex items-center gap-2">
          <div className="relative flex-1">
            <Icon
              name="search"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 text-sm"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="搜索校园圈内容..."
              className="w-full bg-black/[0.035] text-xs border-0 rounded-full pl-9 pr-8 py-2 focus:ring-2 focus:ring-primary/10 focus:outline-none"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={handleClearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 cursor-pointer"
                aria-label="清空搜索"
              >
                <Icon name="close" className="text-xs" />
              </button>
            )}
          </div>
          <button
            onClick={handleSearch}
            className="text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 rounded-lg px-3 py-2 cursor-pointer"
          >
            搜索
          </button>
          <button
            onClick={() => {
              setShowSearch(false);
              handleClearSearch();
            }}
            className="text-[10px] text-gray-500 hover:text-gray-700 px-2 py-1 cursor-pointer"
          >
            取消
          </button>
        </div>
      )}

      {/* 圈子分类 — 图标 dock 风格，和首页分类保持一致的视觉语言，不用色块胶囊堆一排 */}
      {!showSearch && (
        <div className="px-4 py-2 flex items-center gap-1 border-b border-outline-variant/60">
          <div className="flex gap-1 overflow-x-auto hide-scrollbar flex-1 min-w-0">
            {circles.map((c) => {
              const active = activeCircle === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => switchCircle(c.id)}
                  className="flex flex-col items-center gap-1 cursor-pointer shrink-0 px-1.5"
                >
                  <span
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${active ? 'bg-primary/10 text-primary' : 'text-on-surface-variant/50'}`}
                  >
                    <Icon name={c.icon || 'chat'} className="text-base" />
                  </span>
                  <span
                    className={`text-[9px] whitespace-nowrap transition-colors ${active ? 'text-primary font-semibold' : 'text-on-surface-variant/60'}`}
                  >
                    {c.name}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setShowSearch(true)}
            aria-label="搜索校园圈"
            className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-black/[0.035] text-on-surface-variant/60 hover:bg-black/[0.06] transition-colors cursor-pointer ml-1"
          >
            <Icon name="search" className="text-sm" />
          </button>
        </div>
      )}

      {/* 帖子流 */}
      <div
        ref={scrollRef}
        className="flex-1 px-4 py-3 flex flex-col gap-3 overflow-y-auto"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* ── 下拉刷新指示器 ── */}
        <PullIndicator pullDistance={pullDistance} PULL_THRESHOLD={PULL_THRESHOLD} refreshing={loading} />
        {initError ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
            <Icon name="wifi_off" className="text-4xl text-gray-300" />
            <p className="text-sm">{initError}</p>
            <button
              onClick={retryInit}
              className="px-4 py-1.5 bg-primary text-white text-xs rounded-full cursor-pointer hover:bg-primary/90 transition-colors"
            >
              点击重试
            </button>
          </div>
        ) : !initialLoaded && loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-on-surface-variant/60">
            <div className="w-16 h-16 rounded-full bg-primary/6 flex items-center justify-center mb-4">
              <Icon name="forum" className="text-2xl text-primary/50" />
            </div>
            <p className="text-sm font-semibold text-on-surface-variant mb-1">还没有人分享</p>
            <p className="text-[10px] text-on-surface-variant/50 mb-4">成为第一个分享校园生活的人</p>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (isGuest) onAuth();
                else setPublishOpen(true);
              }}
            >
              开始分享
            </Button>
          </div>
        ) : searchQuery.trim() && filteredPosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <Icon name="search_off" className="text-4xl mb-3 text-gray-200" />
            <p className="text-xs">没有找到"{searchQuery}"相关内容</p>
          </div>
        ) : (
          <>
            {searchQuery.trim() && (
              <p className="text-[10px] text-gray-400 -mb-1">找到 {filteredPosts.length} 条结果</p>
            )}
            {filteredPosts.map((post) => (
              <CircleCard
                key={post.id}
                post={post}
                onLike={handleLike}
                onSave={handleSave}
                onDetail={() => setDetailPostId(post.id)}
                isSaved={savedIds.has(post.id)}
                isLiked={likedIds.has(post.id)}
                onViewProfile={onViewProfile}
              />
            ))}
            <Pagination page={page} totalPages={totalPages} onPage={goToPage} />
          </>
        )}

        {initialLoaded && loading && <div className="text-center py-3 text-[10px] text-gray-400">加载中...</div>}
      </div>

      <CirclePublishModal
        isOpen={publishOpen}
        circles={circles}
        onClose={() => setPublishOpen(false)}
        onSuccess={handlePublishSuccess}
        onError={(msg) => showToast(msg, 'info')}
      />

      <CircleHotRanking isOpen={hotRankingOpen} onClose={() => setHotRankingOpen(false)} />

      <ScrollToTop containerRef={scrollRef} />
    </div>
  );
}
