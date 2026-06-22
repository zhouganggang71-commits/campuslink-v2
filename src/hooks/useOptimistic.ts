/**
 * 乐观更新工具 — 用「操作回滚」替代「快照回滚」，避免并发竞态
 *
 * 核心思路：不依赖旧快照，而是记录「当前操作做了什么」，
 * 回滚时做反向操作。两个并发操作各自管自己的那条数据，互不覆盖。
 *
 * 使用示例：
 *   const { runToggle } = useOptimistic();
 *   runToggle(d.setSavedListingIds, listingId, id => id === listingId,
 *     () => api.post(`/favorites/${listingId}`),
 *     { onSuccess: () => showToast('成功') }
 *   );
 */
import { useCallback } from 'react';

type SetState<T> = React.Dispatch<React.SetStateAction<T>>;

export function useOptimistic() {
  /**
   * 针对「列表项切换」场景（收藏/取消收藏）
   * 记录操作前该项是否存在，回滚时做反向操作
   */
  const runToggle = useCallback(
    <TItem>(
      setState: SetState<TItem[]>,
      itemId: TItem,
      predicate: (item: TItem) => boolean,
      apiCall: () => Promise<any>,
      options?: {
        onSuccess?: (res: any) => void;
        onError?: () => void;
      },
    ) => {
      const wasPresent = { current: false };
      setState((prev) => {
        wasPresent.current = prev.some(predicate);
        return wasPresent.current
          ? prev.filter((x) => !predicate(x))
          : [...prev, itemId];
      });

      apiCall()
        .then((res: any) => {
          if (res.code !== 0) {
            setState((prev) =>
              wasPresent.current
                ? [...prev, itemId]
                : prev.filter((x) => !predicate(x)),
            );
            options?.onError?.();
          } else {
            options?.onSuccess?.(res);
          }
        })
        .catch((err) => {
          console.error('[useOptimistic] runToggle API 失败:', err);
          setState((prev) =>
            wasPresent.current
              ? [...prev, itemId]
              : prev.filter((x) => !predicate(x)),
          );
          options?.onError?.();
        });
    },
    [],
  );

  /**
   * 针对「从列表中删除一项」场景（如删帖子）
   * 保留被删对象，回滚时插回数组末尾
   */
  const runDelete = useCallback(
    <T extends { id: string }>(
      setState: SetState<T[]>,
      itemId: string,
      apiCall: () => Promise<any>,
      options?: {
        onSuccess?: () => void;
        onError?: () => void;
      },
    ) => {
      const deleted = { current: undefined as T | undefined };
      setState((prev) => {
        deleted.current = prev.find((x) => x.id === itemId);
        return prev.filter((x) => x.id !== itemId);
      });

      apiCall()
        .then((res: any) => {
          if (res.code !== 0) {
            setState((prev) => {
              if (!deleted.current) return prev;
              return [...prev, deleted.current];
            });
            options?.onError?.();
          } else {
            options?.onSuccess?.();
          }
        })
        .catch((err) => {
          console.error('[useOptimistic] runDelete API 失败:', err);
          setState((prev) => {
            if (!deleted.current) return prev;
            return [...prev, deleted.current!];
          });
          options?.onError?.();
        });
    },
    [],
  );

  return { runToggle, runDelete };
}
