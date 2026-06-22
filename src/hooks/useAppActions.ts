/**
 * 业务层 — 所有操作函数，调用 API 并更新数据层
 */
import { Listing, Course, Message, StudentProfile, Department, OrgLevel, Position } from '../types';
import { INITIAL_PROFILE } from '../data';
import { api, setSession } from '../utils/api';
import { clearStorageCache } from './useAppData';
import { useOptimistic } from './useOptimistic';

interface DataLayer {
  profile: StudentProfile;
  setProfile: React.Dispatch<React.SetStateAction<StudentProfile>>;
  listings: Listing[];
  setListings: React.Dispatch<React.SetStateAction<Listing[]>>;
  courses: Course[];
  setCourses: React.Dispatch<React.SetStateAction<Course[]>>;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  savedListingIds: string[];
  setSavedListingIds: React.Dispatch<React.SetStateAction<string[]>>;
  selectedListing: Listing | null;
  setSelectedListing: React.Dispatch<React.SetStateAction<Listing | null>>;
  setActiveTab: React.Dispatch<React.SetStateAction<string>>;
  setIsAuthModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsAddCourseOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsShareModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setEditingListing: React.Dispatch<React.SetStateAction<Listing | null>>;
  setCarouselIndex: React.Dispatch<React.SetStateAction<number>>;
  courseForm: any;
  setCourseForm: React.Dispatch<React.SetStateAction<any>>;
  editingListing: Listing | null;
  lastPublishTime: React.MutableRefObject<number>;
  reportedPostIds: React.MutableRefObject<Set<string>>;
  PUBLISH_COOLDOWN: number;
  MAX_POSTS_PER_DAY: number;
  MAX_POSTS_UNVERIFIED: number;
  showToast: (msg: string, type?: 'success' | 'info') => void;
  getTodayPostCount: () => number;
  syncCourses: () => void;
  syncPosts: () => void;
}

export function useAppActions(d: DataLayer) {
  const { runToggle, runDelete } = useOptimistic();

  const toggleSaveListing = (listingId: string) => {
    runToggle(
      d.setSavedListingIds,
      listingId,
      (id) => id === listingId,
      () => api.post(`/favorites/${listingId}`),
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

  const handleMarkMessageRead = (messageId: string) => {
    d.setMessages((prev: Message[]) => prev.map((m) => (m.id === messageId ? { ...m, isRead: true } : m)));
  };

  const handleMarkAllRead = () => {
    d.setMessages((prev: Message[]) => prev.map((m) => ({ ...m, isRead: true })));
    d.showToast('所有消息已标记为已读');
  };

  const handleDelete = (listingId: string) => {
    runDelete(
      d.setListings,
      listingId,
      () => api.delete(`/posts/${listingId}`),
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
    if (d.reportedPostIds.current.has(listingId)) {
      d.showToast('您已举报过该帖子', 'info');
      return;
    }
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

    const prevListings = d.listings;
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
      status: 'pending',
      publisherName: d.profile.fullName,
      publisherAvatar: d.profile.avatarUrl,
      isVerifiedStudent: d.profile.isVerified,
      department: d.profile.department as Department | undefined,
    };
    d.setListings((prev: Listing[]) => [full, ...prev]);

    api
      .post('/posts', {
        title: full.title,
        description: full.description,
        price: full.price,
        originalPrice: full.originalPrice,
        category: full.category,
        postType: full.postType,
        imageUrls: full.imageUrls,
        contactInfo: full.contactInfo,
      })
      .catch((err) => {
        console.error('[handlePublish]', err);
        d.setListings(prevListings);
        d.setEditingListing(prevEditing);
        d.showToast('发布失败，请重试', 'info');
      });

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
    d.showToast('已提交审核', 'info');
    d.setActiveTab('home');
  };

  const handleAddCourse = () => {
    if (!d.courseForm.name || !d.courseForm.classroom) {
      d.showToast('请填写课程名称与教室', 'info');
      return;
    }
    const prevCourses = d.courses;
    const newCourse: Course = {
      id: `course-${Date.now()}`,
      name: d.courseForm.name,
      teacher: d.courseForm.teacher,
      classroom: d.courseForm.classroom,
      weekday: Number(d.courseForm.weekday),
      startPeriod: Number(d.courseForm.startPeriod),
      periodSpan: Number(d.courseForm.periodSpan),
      weekStart: Number(d.courseForm.weekStart),
      weekEnd: Number(d.courseForm.weekEnd),
      weekType: d.courseForm.weekType,
      courseType: d.courseForm.courseType,
      colorClass: d.courseForm.colorClass,
    };
    d.setCourses([...d.courses, newCourse]);
    api
      .post('/courses', { ...newCourse, id: undefined })
      .then(() => d.showToast('课程已添加！', 'success'))
      .catch((err) => {
        console.error('[handleAddCourse]', err);
        d.setCourses(prevCourses);
        d.showToast('添加失败，请重试', 'info');
      });
    d.setIsAddCourseOpen(false);
    d.setCourseForm({
      name: '',
      teacher: '',
      classroom: '',
      weekday: 3,
      startPeriod: 3,
      periodSpan: 2,
      weekStart: 1,
      weekEnd: 18,
      weekType: 'all',
      courseType: 'theory',
      colorClass: 'bg-course-blue text-white',
    });
  };

  const handleImportCourses = async (imported: Omit<Course, 'id'>[]) => {
    const newCourses = imported.map((c, i) => ({ ...c, id: `course-import-${Date.now()}-${i}` }));
    const prev = d.courses;
    d.setCourses(newCourses);

    const res = await api.put('/courses/batch', imported);
    if (res.code !== 0) {
      d.setCourses(prev);
      d.showToast('导入失败，已回滚，请重试', 'info');
      return;
    }
    d.showToast(`已导入 ${imported.length} 门课程`, 'success');
  };

  const handleAuth = async (
    fullName: string,
    studentId: string,
    department: string,
    orgLevel: string,
    position: string,
    password: string,
  ) => {
    const res = await api.post<{ token: string; refresh_token: string; user: any }>('/auth/dev-login', {
      studentId,
      fullName,
      password,
    });
    if (res.code === 0 && res.data?.token) {
      setSession(res.data.token, res.data.refresh_token);
      clearStorageCache();
      const verified = res.data?.user?.authStatus === 'verified';
      d.setProfile({
        ...INITIAL_PROFILE,
        fullName,
        department,
        studentId,
        orgLevel: orgLevel as OrgLevel,
        position: position as Position,
        isVerified: verified,
        isAdmin: !!res.data?.user?.isAdmin,
        postsCount: 0,
        savedCount: 0,
      });
      if (!verified && res.data?.user?.authStatus === 'pending') d.showToast('注册成功！等待管理员审核', 'info');
      d.setCourses([]);
      d.setListings([]);
      d.setMessages([]);
      d.setSavedListingIds([]);
      d.setIsAuthModalOpen(false);
      d.showToast('认证成功！', 'success');
      d.syncCourses();
      d.syncPosts();
    } else {
      d.showToast(res.message || '认证失败', 'info');
    }
  };

  const handleDeleteCourse = (id: string) => {
    runDelete(
      d.setCourses,
      id,
      () => api.delete(`/courses/${id}`),
      {
        onSuccess: () => d.showToast('课程已删除', 'info'),
        onError: () => d.showToast('删除失败，请重试', 'info'),
      },
    );
  };

  const handleShareSchedule = () => {
    d.setIsShareModalOpen(true);
  };

  return {
    toggleSaveListing,
    openListingDetails,
    handleMarkMessageRead,
    handleMarkAllRead,
    handleDelete,
    handleCopyContact,
    handleReport,
    handleStartEdit,
    handlePublish,
    handleAddCourse,
    handleDeleteCourse,
    handleImportCourses,
    handleAuth,
    handleShareSchedule,
  };
}
