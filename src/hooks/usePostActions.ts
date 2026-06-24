/**
 * 帖子相关操作 — 收藏、浏览、发布、删除、举报、复制、编辑
 */
import { Listing, Message } from '../types';
import { postsApi } from '../api';
import { useOptimistic } from './useOptimistic';

interface PostDataLayer {
  listings: Listing[];
  setListings: React.Dispatch<React.SetStateAction<Listing[]>>;
  savedListingIds: string[];
  setSavedListingIds: React.Dispatch<React.SetStateAction<string[]>>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setSelectedListing: React.Dispatch<React.SetStateAction<Listing | null>>;
  setActiveTab: React.Dispatch<React.SetStateAction<string>>;
  setEditingListing: React.Dispatch<React.SetStateAction<Listing | null>>;
  setCarouselIndex: React.Dispatch<React.SetStateAction<number>>;
  profile: { fullName: string; avatarUrl: string; isVerified: boolean; department?: string };
  reportedPostIds: React.MutableRefObject<Set<string>>;
  lastPublishTime: React.MutableRefObject<number>;
  editingListing: Listing | null;
  PUBLISH_COOLDOWN: number;
  MAX_POSTS_PER_DAY: number;
  MAX_POSTS_UNVERIFIED: number;
  showToast: (msg: string, type?: 'success' | 'info', action?: { label: string; onClick: () => void }) => void;
  getTodayPostCount: () => number;
}

export function usePostActions(d: PostDataLayer) {
  const { runToggle, runDelete } = useOptimistic();

  const toggleSaveListing = (listingId: string) => {
    // 仅允许数字 ID（真实帖子 ID 为自增整数），mock 数据 ID（如 headphones-1）静默忽略
    if (!/^\d+$/.test(listingId)) return;
    runToggle(
      d.setSavedListingIds,
      listingId,
      (id) => id === listingId,
      () => postsApi.toggleFav(listingId),
      {
        onSuccess: (res: any) => {
          d.showToast(res.data?.favorited ? '已加入收藏！' : '已取消收藏', res.data?.favorited ? 'success' : 'info');
        },
        onError: () => d.showToast('操作失败，请重试', 'info'),
      },
    );
  };

  const openListingDetails = (listing: Listing) => {
    d.setSelectedListing(listing);
    d.setCarouselIndex(0);
    d.setListings((prev: Listing[]) => prev.map((l) => (l.id === listing.id ? { ...l, views: l.views + 1 } : l)));
  };

  const handleDelete = (listingId: string) => {
    runDelete(
      d.setListings,
      listingId,
      () => postsApi.delete(listingId),
      {
        onSuccess: () => d.showToast('已删除', 'info'),
        onError: () => d.showToast('删除失败，请重试', 'info'),
      },
    );
  };

  const handleCopyContact = (contactInfo: string) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(contactInfo).then(
        () => d.showToast('联系方式已复制', 'success'),
        () => d.showToast('复制失败，请手动复制', 'info')
      );
    } else {
      d.showToast('复制失败，请手动复制', 'info');
    }
  };

  const handleReport = (listingId: string, reason: string) => {
    const target = d.listings.find((l) => l.id === listingId);
    if (!target || target.status !== 'active') {
      d.showToast('该帖子无法举报', 'info');
      return;
    }
    // 仅允许数字ID
    if (!/^\d+$/.test(listingId)) {
      d.showToast('该帖子无法举报', 'info');
      return;
    }
    if (d.reportedPostIds.current.has(listingId)) {
      d.showToast('您已举报过该帖子', 'info');
      return;
    }
    postsApi.report(listingId, reason).then((res) => {
      if (res.code === 0) {
        d.reportedPostIds.current.add(listingId);
        d.setMessages((prev: Message[]) => [
          {
            id: `msg-${Date.now()}`,
            title: '举报已提交',
            content: `您举报的帖子已提交。举报原因：${reason}。管理员将尽快处理。`,
            timeText: '刚刚',
            category: 'approval',
            status: 'update',
            isRead: false,
          },
          ...prev,
        ]);
        d.showToast('举报已提交', 'info');
      } else {
        d.showToast(res.message || '举报失败，请重试', 'info');
      }
    }).catch(() => {
      d.showToast('举报失败，请重试', 'info');
    });
  };

  const handleStartEdit = (listing: Listing) => {
    d.setEditingListing(listing);
    d.setSelectedListing(null);
    d.setActiveTab('publish');
  };

  const handlePublish = (newListing: Omit<Listing, 'id'>) => {
    const now = Date.now();
    if (now - d.lastPublishTime.current < d.PUBLISH_COOLDOWN) {
      const remain = Math.ceil((d.PUBLISH_COOLDOWN - (now - d.lastPublishTime.current)) / 1000);
      return d.showToast(`发布太频繁，请${remain}秒后再试`, 'info');
    }
    const todayCount = d.getTodayPostCount();
    const limit = d.profile.isVerified ? d.MAX_POSTS_PER_DAY : d.MAX_POSTS_UNVERIFIED;
    if (todayCount >= limit) return d.showToast(`今日发布已达上限（${limit}条）`, 'info');
    d.lastPublishTime.current = now;

    const prevEditing = d.editingListing;
    const oldId = d.editingListing?.id;
    if (oldId) {
      d.setListings((prev: Listing[]) => prev.filter((l) => l.id !== oldId));
      d.setEditingListing(null);
    }

    const listingId = `list-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const full: Listing = {
      ...newListing,
      id: listingId,
      status: 'active',
      publisherId: 0,
      publisherName: d.profile.fullName,
      publisherAvatar: d.profile.avatarUrl,
      isVerifiedStudent: d.profile.isVerified,
      department: d.profile.department as any,
    };
    d.setListings((prev: Listing[]) => [full, ...prev]);

    // 精准回滚：仅删除乐观插入的帖子（oldId 存在时恢复原帖）
    // 避免全量快照覆盖并发修改（如同时删除了其他帖子）
    const rollbackPublish = (msg: string) => {
      d.setListings((prev: Listing[]) => {
        let next = prev.filter((l) => l.id !== listingId);
        if (oldId && prevEditing) {
          next = [prevEditing, ...next];
        }
        return next;
      });
      d.setEditingListing(prevEditing);
      d.showToast(msg || '发布失败，请重试', 'info');
    };

    postsApi.create({
        title: full.title,
        description: full.description,
        price: full.price,
        originalPrice: full.originalPrice,
        category: full.category,
        postType: full.postType,
        imageUrls: full.imageUrls,
        contactInfo: full.contactInfo,
      })
      .then((res) => {
        const data = res.data as { id: number } | undefined;
        if (res.code === 0 && data?.id) {
          const serverId = String(data.id);
          d.setListings((prev: Listing[]) =>
            prev.map((l) => (l.id === listingId ? { ...l, id: serverId } : l)),
          );
          const reviewMsg: Message = {
            id: `msg-${Date.now()}`,
            title: '发布提交审核',
            content: `您的"${full.title.substring(0, 20)}..."已提交，审核中。`,
            timeText: '刚刚',
            category: 'approval',
            status: 'update',
            isRead: false,
          };
          d.setMessages((prev: Message[]) => [reviewMsg, ...prev]);
          const publishedListing = { ...full, id: serverId };
          d.showToast('发布成功', 'success', {
            label: '查看',
            onClick: () => {
              d.setSelectedListing(publishedListing);
            },
          });
        } else {
          rollbackPublish(res.message || '');
        }
      })
      .catch((err) => {
        console.error('[handlePublish]', err);
        rollbackPublish('');
      });

    d.setActiveTab('home');
  };

  return {
    toggleSaveListing,
    openListingDetails,
    handleDelete,
    handleCopyContact,
    handleReport,
    handleStartEdit,
    handlePublish,
  };
}
