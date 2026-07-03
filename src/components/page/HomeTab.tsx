import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Listing, Notice, DEPARTMENTS } from '../../types';
import { POST_TYPE_CHANNELS } from '../../data';
import Icon from '../ui/Icon';
import PostCard from './PostCard';
import AdBanner from './AdBanner';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { CardSkeleton } from '../ui/Skeleton';
import ScrollToTop from '../ui/ScrollToTop';
import { getCategoryStyle } from '../../utils/postCategory';

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
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasExtraFilter = showMine || selectedDept !== 'all';

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
            className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50 select-none text-base"
          />
          <div
            onClick={onOpenSearch}
            className="w-full bg-black/[0.035] text-sm border-0 rounded-full pl-10 pr-4 py-2.5 text-on-surface-variant/60 text-xs cursor-pointer hover:bg-black/[0.05] transition-colors"
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

        {/* 分类图标 dock — 图标+小标签常驻单行，不做文字胶囊，视觉更轻；筛选按钮收纳学院/我的发布 */}
        <div className="flex items-center gap-1">
          <div className="flex flex-1 min-w-0 justify-between">
            {POST_TYPE_CHANNELS.map((ch) => {
              const isAll = ch.key === 'all';
              const style = isAll
                ? { text: 'text-on-surface', bg: 'bg-on-surface/8' }
                : getCategoryStyle(ch.key);
              const active = selectedPostType === ch.key;
              return (
                <button
                  key={ch.key}
                  onClick={() => setSelectedPostType(ch.key)}
                  className="flex flex-col items-center gap-1 cursor-pointer shrink-0 px-1"
                >
                  <span
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${active ? `${style.bg} ${style.text}` : 'text-on-surface-variant/50'}`}
                  >
                    <Icon name={ch.icon} className="text-base" />
                  </span>
                  <span className={`text-[9px] transition-colors ${active ? `${style.text} font-semibold` : 'text-on-surface-variant/60'}`}>
                    {ch.label}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setFilterModalOpen(true)}
            aria-label="更多筛选"
            className={`relative shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ml-1 ${hasExtraFilter ? 'bg-primary/10 text-primary' : 'bg-black/[0.035] text-on-surface-variant/60 hover:bg-black/[0.06]'}`}
          >
            <Icon name="tune" className="text-sm" />
            {hasExtraFilter && (
              <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-course-red" />
            )}
          </button>
        </div>

        {/* 更多筛选 — 学院 / 我的发布，收纳进底部弹层，默认不占据首屏空间 */}
        <Modal
          isOpen={filterModalOpen}
          onClose={() => setFilterModalOpen(false)}
          position="bottom"
          title="筛选"
        >
          <div className="flex flex-col gap-4 pb-2">
            {currentUserName && (
              <button
                onClick={() => setShowMine(!showMine)}
                className={`text-xs font-semibold px-3 py-2 rounded-xl shrink-0 cursor-pointer flex items-center gap-1.5 transition-colors w-full ${showMine ? 'bg-primary text-white' : 'bg-black/[0.03] text-on-surface-variant'}`}
              >
                <Icon name="person" className="text-xs" /> 只看我的发布
              </button>
            )}
            <div>
              <p className="text-[11px] text-on-surface-variant/60 font-semibold mb-2">学院</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setSelectedDept('all')}
                  className={`text-[11px] font-semibold px-3 py-1.5 rounded-full cursor-pointer transition-colors ${selectedDept === 'all' ? 'bg-on-surface text-white' : 'bg-black/[0.03] text-on-surface-variant'}`}
                >
                  全部学院
                </button>
                {DEPARTMENTS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setSelectedDept(d)}
                    className={`text-[11px] font-semibold px-3 py-1.5 rounded-full cursor-pointer transition-colors ${selectedDept === d ? 'bg-on-surface text-white' : 'bg-black/[0.03] text-on-surface-variant'}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Modal>

        {/* 通知 */}
        {notices.length > 0 && (
          <div className="flex gap-2 overflow-x-auto hide-scrollbar">
            {notices.map((n) => (
              <div
                key={n.id}
                className="flex items-center gap-2 bg-amber-50 rounded-xl px-3 py-2 shrink-0"
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
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        )}

        {/* ── 帖子列表/空态/错误 ── */}
        {listError && listings.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant/60 gap-3">
            <Icon name="wifi_off" className="text-4xl opacity-60" />
            <p className="text-xs font-semibold text-on-surface-variant">{listError}</p>
            {onRetry && <Button variant="primary" size="sm" onClick={onRetry}>点击重试</Button>}
          </div>
        ) : !showInitialSkeleton && filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant/60 bg-black/[0.02] rounded-2xl">
            <Icon name="inbox" className="text-4xl mb-2 opacity-60" />
            <p className="text-xs font-semibold text-on-surface-variant">暂无内容</p>
            <Button variant="primary" size="sm" onClick={onPublishTab}>去发布</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((item) => (
              <PostCard
                key={item.id}
                listing={item}
                postTypeLabel={postTypeLabel}
                onClick={() => openListingDetails(item)}
                isSaved={savedListingIds.includes(String(item.id))}
                onViewProfile={onViewProfile && item.publisherId > 0 ? () => onViewProfile(item.publisherId, {
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
