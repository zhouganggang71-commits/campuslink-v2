/**
 * 帖子列表状态 hook — 从 useAppData 拆分出的第二块
 * 组件只需 `import { useListings }` 即可获取帖子相关状态
 */
import { useAppData } from './useAppData';
import type { AppData } from './useAppData';

export interface ListingsState {
  listings: AppData['listings'];
  setListings: AppData['setListings'];
  listLoading: AppData['listLoading'];
  listRefreshing: AppData['listRefreshing'];
  listHasMore: AppData['listHasMore'];
  listError: AppData['listError'];
  refreshPosts: AppData['refreshPosts'];
  loadMorePosts: AppData['loadMorePosts'];
  selectedPostType: AppData['selectedPostType'];
  setSelectedPostType: AppData['setSelectedPostType'];
  userListings: AppData['userListings'];
  savedListings: AppData['savedListings'];
  savedCount: AppData['savedCount'];
}

export function useListings(): ListingsState {
  const {
    listings,
    setListings,
    listLoading,
    listRefreshing,
    listHasMore,
    listError,
    refreshPosts,
    loadMorePosts,
    selectedPostType,
    setSelectedPostType,
    userListings,
    savedListings,
    savedCount,
  } = useAppData();
  return {
    listings,
    setListings,
    listLoading,
    listRefreshing,
    listHasMore,
    listError,
    refreshPosts,
    loadMorePosts,
    selectedPostType,
    setSelectedPostType,
    userListings,
    savedListings,
    savedCount,
  };
}
