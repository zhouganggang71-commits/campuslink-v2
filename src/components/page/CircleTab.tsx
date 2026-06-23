/**
 * 校园圈 Tab — 圈子横滑 + 帖子流 + 热度排行 + 发布入口
 */
import { useEffect, useCallback, useState, useRef } from 'react';
import { useCircles } from '../../hooks/useCircles';
import { api, getToken } from '../../utils/api';
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
}

const CIRCLE_ICONS: Record<string, string> = {
  trending: 'trending_up', study: 'school', sports: 'directions_car',
  hobby: 'celebration', treehole: 'chat', career: 'work',
};

function loadSaved(): Set<number> {
  try {
    const raw = localStorage.getItem('campuslink_circle_saved');
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}
function saveSaved(ids: Set<number>) {
  try { localStorage.setItem('campuslink_circle_saved', JSON.stringify([...ids])); } catch {}
}

export default function CircleTab({ showToast, isGuest, onAuth }: CircleTabProps) {
  const {
    circles, activeCircle,
    posts, loading, page, totalPages, goToPage,
    init, switchCircle, searchPosts,
    prependPost, updateLikeCount,
    initialLoaded,
  } = useCircles();

  const [publishOpen, setPublishOpen] = useState(false);
  const [hotRankingOpen, setHotRankingOpen] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<number>>(loadSaved);
  const [detailPost, setDetailPost] = useState<CirclePost | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showCircleGrid, setShowCircleGrid] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!initialLoaded) init(); }, [init, initialLoaded]);

  useEffect(() => {
    if (!getToken()) return;
    api.get<any[]>('/circle-favorites').then((res) => {
      if (res.code === 0 && Array.isArray(res.data)) {
        setSavedIds(new Set(res.data.map((p: any) => p.id)));
      }
    }).catch(() => {});
  }, [initialLoaded]);

  useEffect(() => { saveSaved(savedIds); }, [savedIds]);

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

  const handleLike = useCallback(async (postId: number) => {
    if (isGuest) return showToast('请先登录');
    try {
      const res = await api.post(`/circle-posts/${postId}/like`);
      if (res.code === 0) updateLikeCount(postId, (res.data as any).like_count || 0);
    } catch { /* noop */ }
  }, [isGuest, updateLikeCount, showToast]);

  const handleSave = useCallback(async (postId: number) => {
    if (isGuest) return showToast('请先登录');
    const wasSaved = savedIds.has(postId);
    setSavedIds((prev) => {
      const next = new Set(prev);
      wasSaved ? next.delete(postId) : next.add(postId);
      return next;
    });
    try {
      const res = await api.post(`/circle-posts/${postId}/favorite`);
      if (res.code !== 0) {
        setSavedIds((prev) => {
          const next = new Set(prev);
          wasSaved ? next.add(postId) : next.delete(postId);
          return next;
        });
      }
    } catch {
      setSavedIds((prev) => {
        const next = new Set(prev);
        wasSaved ? next.add(postId) : next.delete(postId);
        return next;
      });
    }
  }, [isGuest, savedIds, showToast]);

  const handlePublishSuccess = useCallback((post: CirclePost) => {
    prependPost(post);
    showToast('发布成功');
  }, [prependPost, showToast]);

  // 详情页
  if (detailPost) {
    return (
      <CirclePostDetail
        post={detailPost}
        onBack={() => setDetailPost(null)}
        onLike={handleLike}
        onSave={handleSave}
        isSaved={savedIds.has(detailPost.id)}
        showToast={showToast}
      />
    );
  }

  return (
    <div className="flex flex-col flex-1">
      {/* 顶栏 */}
      <div className="px-4 py-3 bg-white flex items-center justify-between">
        <div>
          <h2 className="font-headline text-base font-bold text-on-surface">校园圈</h2>
          <p className="text-[10px] text-gray-400 mt-0.5">打破院系壁垒，连接全校同学</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setHotRankingOpen(true)}
            className="flex items-center gap-1 text-[10px] font-semibold text-course-orange bg-course-orange/5 px-2.5 py-1.5 rounded-full hover:bg-course-orange/10 transition-colors cursor-pointer"
          >
            <Icon name="trending_up" className="text-[10px]" />
            热门
          </button>
          <Button variant="primary" size="sm" onClick={() => { if (isGuest) onAuth(); else setPublishOpen(true); }}>发布</Button>
        </div>
      </div>

      {/* 搜索栏 */}
      {showSearch && (
        <div className="px-4 py-2 bg-white border-b border-gray-50 flex items-center gap-2">
          <div className="relative flex-1">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="搜索校园圈内容..."
              className="w-full bg-slate-100 text-xs border-0 rounded-lg pl-9 pr-8 py-2 focus:ring-2 focus:ring-primary/10 focus:outline-none"
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
            onClick={() => { setShowSearch(false); handleClearSearch(); }}
            className="text-[10px] text-gray-500 hover:text-gray-700 px-2 py-1 cursor-pointer"
          >
            取消
          </button>
        </div>
      )}

      {/* 圈子横滑 */}
      <div className="px-4 py-2 flex gap-2 overflow-x-auto hide-scrollbar border-b border-gray-50">
        {!showSearch && (
          <div className="flex gap-2">
          <button
            onClick={() => setShowSearch(true)}
            className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full shrink-0 bg-slate-100 text-gray-500 hover:bg-slate-200 transition-all cursor-pointer"
          >
            <Icon name="search" className="text-[11px]" />
            搜索
          </button>
          <div className="relative">
            <button
              onClick={() => setShowCircleGrid(!showCircleGrid)}
              className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full shrink-0 transition-all cursor-pointer ${showCircleGrid ? 'bg-primary text-white shadow-sm' : 'bg-slate-100 text-gray-500 hover:bg-slate-200'}`}
            >
              <Icon name="apps" className="text-[11px]" />
              导航
            </button>
            {showCircleGrid && (
              <div>
                <div className="fixed inset-0 z-40" onClick={() => setShowCircleGrid(false)} />
                <div className="absolute left-0 top-full mt-1 bg-white border border-slate-100 rounded-xl shadow-xl z-50 p-3 w-64 grid grid-cols-2 gap-2">
                  {circles.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { switchCircle(c.id); setShowCircleGrid(false); }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${activeCircle === c.id ? 'bg-primary/10 text-primary' : 'hover:bg-slate-50 text-gray-600'}`}
                    >
                      <Icon name={CIRCLE_ICONS[c.id] || 'chat'} className="text-sm" />
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          </div>
        )}
        {circles.map((c) => (
          <button
            key={c.id}
            onClick={() => switchCircle(c.id)}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full shrink-0 transition-all cursor-pointer ${activeCircle === c.id ? 'bg-primary text-white shadow-sm' : 'bg-slate-100 text-gray-500 hover:bg-slate-200'}`}
          >
            <Icon name={CIRCLE_ICONS[c.id] || 'chat'} className="text-[11px]" />
            {c.name}
          </button>
        ))}
      </div>

      {/* 帖子流 */}
      <div ref={scrollRef} className="flex-1 px-4 py-3 flex flex-col gap-3 overflow-y-auto">
        {!initialLoaded && loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mb-4">
              <Icon name="forum" className="text-2xl text-gray-300" />
            </div>
            <p className="text-sm font-semibold text-gray-400 mb-1">还没有人分享</p>
            <p className="text-[10px] text-gray-300 mb-4">成为第一个分享校园生活的人</p>
            <Button variant="primary" size="sm" onClick={() => { if (isGuest) onAuth(); else setPublishOpen(true); }}>
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
                onDetail={() => setDetailPost(post)}
                isSaved={savedIds.has(post.id)}
              />
            ))}
            <Pagination page={page} totalPages={totalPages} onPage={goToPage} />
          </>
        )}

        {initialLoaded && loading && (
          <div className="text-center py-3 text-[10px] text-gray-400">加载中...</div>
        )}
      </div>

      <CirclePublishModal
        isOpen={publishOpen}
        circles={circles}
        onClose={() => setPublishOpen(false)}
        onSuccess={handlePublishSuccess}
        onError={(msg) => showToast(msg, 'info')}
      />

      <CircleHotRanking
        isOpen={hotRankingOpen}
        onClose={() => setHotRankingOpen(false)}
      />

      <ScrollToTop containerRef={scrollRef} />
    </div>
  );
}
