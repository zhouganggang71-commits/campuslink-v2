import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Listing, Notice, DEPARTMENTS } from '../../types';
import { POST_TYPE_CHANNELS } from '../../data';
import Icon from '../ui/Icon';
import PostCard from './PostCard';
import AdBanner from './AdBanner';
import Button from '../ui/Button';
import { CardSkeleton } from '../ui/Skeleton';
import ScrollToTop from '../ui/ScrollToTop';

function postTypeLabel(pt: string) {
  return POST_TYPE_CHANNELS.find((p) => p.key === pt)?.label || pt;
}
interface HomeTabProps {
  listings: Listing[];
  notices: Notice[];
  selectedPostType: string;
  setSelectedPostType: (s: string) => void;
  savedListingIds: string[];
  currentUserName?: string;
  openListingDetails: (l: Listing) => void;
  onPublishTab: () => void;
  onOpenSearch: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  onLoadMore: () => void;
  hasMore: boolean;
  loading: boolean;
  listError?: string | null;
  onRetry?: () => void;
  onViewProfile?: (userId: number, placeholder: any) => void;
}

export default function HomeTab({
  listings,
  notices,
  selectedPostType,
  setSelectedPostType,
  savedListingIds,
  currentUserName,
  openListingDetails,
  onPublishTab,
  onOpenSearch,
  onRefresh,
  refreshing,
  onLoadMore,
  hasMore,
  loading,
  listError,
  onRetry,
  onViewProfile,
}: HomeTabProps) {
  const [selectedDept, setSelectedDept] = useState('all');
  const [showMine, setShowMine] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── 下拉刷新 ──
  const [pullDistance, setPullDistance] = useState(0);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);
  const PULL_THRESHOLD = 60;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (scrollRef.current && scrollRef.current.scrollTop <= 0) {
      touchStartY.current = e.touches[0].clientY;
      isPulling.current = true;
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling.current || refreshing) return;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy > 0) {
      setPullDistance(Math.min(dy * 0.4, 80));
    }
  }, [refreshing]);

  const handleTouchEnd = useCallback(() => {
    if (pullDistance >= PULL_THRESHOLD && !refreshing) {
      onRefresh();
    }
    setPullDistance(0);
    isPulling.current = false;
  }, [pullDistance, refreshing, onRefresh]);

  // ── 滚动触底加载更多 ──
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 400 && hasMore && !loading) {
        onLoadMore();
      }
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [hasMore, loading, onLoadMore]);

  const activities = useMemo(
    () => listings.filter((l) => l.postType === 'activity' && l.status === 'active').slice(0, 6),
    [listings],
  );
  const filtered = useMemo(
    () =>
      listings.filter(
        (l) =>
          (selectedPostType === 'all' || l.postType === selectedPostType) &&
          (selectedDept === 'all' || l.department === selectedDept) &&
          (!showMine || l.publisherName === currentUserName),
      ),
    [listings, selectedPostType, selectedDept, showMine, currentUserName],
  );

  // 初始加载骨架屏
  const showInitialSkeleton = loading && !refreshing && listings.length === 0;

  return (
    <div
      ref={scrollRef}
      className="flex flex-col animate-fade-in overflow-y-auto flex-1"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── 下拉刷新指示器 ── */}
      <div
        className="flex items-center justify-center gap-2 transition-all duration-200 overflow-hidden"
        style={{ height: pullDistance, opacity: pullDistance / PULL_THRESHOLD }}
      >
        <div className={`w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full ${refreshing ? 'animate-spin' : ''}`}
          style={{ transform: `rotate(${pullDistance * 3}deg)` }} />
        <span className="text-[11px] text-primary/60 font-semibold">
          {refreshing ? '刷新中...' : pullDistance >= PULL_THRESHOLD ? '松开刷新' : '下拉刷新'}
        </span>
      </div>

      <div className="p-4 flex flex-col gap-3">
        {/* 搜索栏 */}
        <div className="relative w-full">
          <Icon
            name="search"
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 select-none text-base"
          />
          <div
            onClick={onOpenSearch}
            className="w-full bg-slate-100 text-sm border-0 rounded-xl pl-10 pr-4 py-2.5 text-gray-400 text-xs cursor-pointer"
          >
            搜索信息、课程、活动...
          </div>
        </div>

        {/* 活动海报 */}
        {activities.length > 0 && (
          <div className="flex gap-3 overflow-x-auto hide-scrollbar snap-x snap-mandatory -mx-4 px-4">
            {activities.map((a) => (
              <div
                key={a.id}
                onClick={() => openListingDetails(a)}
                className="relative shrink-0 w-[80vw] max-w-[320px] h-40 rounded-2xl overflow-hidden cursor-pointer snap-center active:scale-[0.98] transition-transform"
              >
                <img
                  src={a.imageUrls[0] || ''}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <span className="text-white text-sm font-bold line-clamp-1">{a.title}</span>
                  <span className="text-white/70 text-[10px] block mt-0.5">
                    {a.publisherName} · {a.views} 次浏览
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 分类筛选 */}
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
          {POST_TYPE_CHANNELS.map((ch) => (
            <button
              key={ch.key}
              onClick={() => setSelectedPostType(ch.key)}
              className={`text-xs font-semibold px-4 py-2 rounded-full border shrink-0 transition-all cursor-pointer ${selectedPostType === ch.key ? 'bg-primary text-white border-primary shadow-sm' : 'text-on-surface-variant border-outline-variant hover:border-outline'}`}
            >
              {ch.label}
            </button>
          ))}
        </div>

        {/* 学院筛选 */}
        <div className="flex gap-1.5 overflow-x-auto hide-scrollbar pb-1">
          {currentUserName && (
            <button
              onClick={() => setShowMine(!showMine)}
              className={`text-[10px] font-semibold px-3 py-1 rounded-full border shrink-0 cursor-pointer flex items-center gap-1 ${showMine ? 'bg-primary text-white border-primary' : 'text-on-surface-variant border-outline-variant hover:border-outline'}`}
            >
              <Icon name="person" className="text-[10px]" /> 我的发布
            </button>
          )}
          <button
            onClick={() => setSelectedDept('all')}
            className={`text-[10px] font-semibold px-3 py-1 rounded-full border shrink-0 cursor-pointer ${selectedDept === 'all' ? 'bg-on-surface text-white border-on-surface' : 'text-on-surface-variant border-outline-variant hover:border-outline'}`}
          >
            全部学院
          </button>
          {DEPARTMENTS.map((d) => (
            <button
              key={d}
              onClick={() => setSelectedDept(d)}
              className={`text-[10px] font-semibold px-3 py-1 rounded-full border shrink-0 cursor-pointer ${selectedDept === d ? 'bg-on-surface text-white border-on-surface' : 'text-on-surface-variant border-outline-variant hover:border-outline'}`}
            >
              {d}
            </button>
          ))}
        </div>

        {/* 通知 */}
        {notices.length > 0 && (
          <div className="flex gap-2 overflow-x-auto hide-scrollbar">
            {notices.map((n) => (
              <div
                key={n.id}
                className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 shrink-0"
              >
                <Icon name="megaphone" className="text-amber-600 text-sm shrink-0" />
                <span className="text-[11px] text-amber-800 font-medium truncate">{n.title}</span>
              </div>
            ))}
          </div>
        )}

        {/* 广告 Banner */}
        <AdBanner />

        {/* ── 初始加载骨架屏 ── */}
        {showInitialSkeleton && (
          <div className="flex flex-col gap-2.5">
            {[1, 2, 3, 4].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        )}

        {/* ── 帖子列表/空态/错误 ── */}
        {listError && listings.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
            <Icon name="wifi_off" className="text-4xl opacity-60" />
            <p className="text-xs font-semibold text-gray-500">{listError}</p>
            {onRetry && <Button variant="primary" size="sm" onClick={onRetry}>点击重试</Button>}
          </div>
        ) : !showInitialSkeleton && filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 bg-slate-50 rounded-2xl border border-dashed border-gray-200">
            <Icon name="inbox" className="text-4xl mb-2 opacity-60" />
            <p className="text-xs font-semibold text-gray-500">暂无内容</p>
            <Button variant="primary" size="sm" onClick={onPublishTab}>去发布</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {filtered.map((item) => (
              <PostCard
                key={item.id}
                listing={item}
                postTypeLabel={postTypeLabel}
                onClick={() => openListingDetails(item)}
                isSaved={savedListingIds.includes(String(item.id))}
                onViewProfile={onViewProfile ? () => onViewProfile(item.publisherId, {
                  name: item.publisherName,
                  avatar: item.publisherAvatar,
                  isVerified: item.isVerifiedStudent,
                  department: item.department,
                  orgLevel: item.publisherOrgLevel,
                  orgName: item.orgName,
                  position: item.publisherPosition,
                }) : undefined}
              />
            ))}
          </div>
        )}

        {/* ── 加载更多指示器 ── */}
        {loading && !refreshing && listings.length > 0 && (
          <div className="flex items-center justify-center py-3 gap-2">
            <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
            <span className="text-[10px] text-gray-400">加载中...</span>
          </div>
        )}
        {!hasMore && listings.length > 0 && (
          <div className="text-center py-4 text-[10px] text-gray-400">— 已加载全部 —</div>
        )}
      </div>
      <ScrollToTop containerRef={scrollRef} />
    </div>
  );
}
