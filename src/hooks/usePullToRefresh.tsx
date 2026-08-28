/**
 * usePullToRefresh — 可复用的下拉刷新 Hook
 *
 * 从 HomeTab 提取，适用任何可滚动的容器。
 * 用法：
 *   const { pullDistance, handleTouchStart, handleTouchMove, handleTouchEnd, PullIndicator } =
 *     usePullToRefresh({ refreshing, onRefresh, scrollRef });
 *
 *   将 touch 事件绑定到滚动容器上，在容器顶部渲染 <PullIndicator />。
 */
import { useState, useRef, useCallback } from 'react';

interface UsePullToRefreshOptions {
  refreshing: boolean;
  onRefresh: () => void;
  /** 滚动容器 ref，仅当 scrollTop <= 0 时允许下拉（避免与正常滚动冲突） */
  scrollRef?: React.RefObject<{ scrollTop: number } | null>;
}

interface UsePullToRefreshReturn {
  pullDistance: number;
  handleTouchStart: (e: React.TouchEvent) => void;
  handleTouchMove: (e: React.TouchEvent) => void;
  handleTouchEnd: () => void;
  PULL_THRESHOLD: number;
}

export function usePullToRefresh({
  refreshing,
  onRefresh,
  scrollRef,
}: UsePullToRefreshOptions): UsePullToRefreshReturn {
  const [pullDistance, setPullDistance] = useState(0);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);
  const PULL_THRESHOLD = 60;

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      // 仅当在容器顶部时才激活下拉（避免与正常滚动冲突）
      if (scrollRef?.current && scrollRef.current.scrollTop > 0) return;
      touchStartY.current = e.touches[0].clientY;
      isPulling.current = true;
    },
    [scrollRef],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isPulling.current || refreshing) return;
      const dy = e.touches[0].clientY - touchStartY.current;
      if (dy > 0) {
        setPullDistance(Math.min(dy * 0.4, 80));
      }
    },
    [refreshing],
  );

  const handleTouchEnd = useCallback(() => {
    if (pullDistance >= PULL_THRESHOLD && !refreshing) {
      onRefresh();
    }
    setPullDistance(0);
    isPulling.current = false;
  }, [pullDistance, refreshing, onRefresh]);

  return { pullDistance, handleTouchStart, handleTouchMove, handleTouchEnd, PULL_THRESHOLD };
}

/**
 * PullIndicator — 下拉刷新指示器 UI，配合 usePullToRefresh 使用
 */
export function PullIndicator({
  pullDistance,
  PULL_THRESHOLD,
  refreshing,
}: {
  pullDistance: number;
  PULL_THRESHOLD: number;
  refreshing: boolean;
}) {
  return (
    <div
      className="flex items-center justify-center gap-2 transition-all duration-200 overflow-hidden"
      style={{ height: pullDistance, opacity: pullDistance / PULL_THRESHOLD }}
    >
      <div
        className={`w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full ${refreshing ? 'animate-spin' : ''}`}
        style={{ transform: `rotate(${pullDistance * 3}deg)` }}
      />
      <span className="text-[11px] text-primary/60 font-semibold">
        {refreshing ? '刷新中...' : pullDistance >= PULL_THRESHOLD ? '松开刷新' : '下拉刷新'}
      </span>
    </div>
  );
}
