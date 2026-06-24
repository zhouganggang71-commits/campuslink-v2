/**
 * 数据层 — 所有 state、localStorage、服务端数据拉取、计算属性
 */
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Listing, Course, Message, StudentProfile } from '../types';
import { INITIAL_PROFILE, INITIAL_LISTINGS, INITIAL_COURSES, INITIAL_NOTICES } from '../data';
import { getToken } from '../utils/api';
import { coursesApi, postsApi, noticesApi, authApi } from '../api';
import { safeParseJsonArray } from '../utils/time';

// 缓存版本号：数据结构变更时递增，不兼容旧缓存自动清空
const SCHEMA_VERSION = 2;
const VERSION_KEY = 'campuslink_schema_version';

function checkAndMigrateStorage() {
  try {
    const stored = localStorage.getItem(VERSION_KEY);
    const version = stored ? parseInt(stored, 10) : 0;
    if (version < SCHEMA_VERSION) {
      // 版本不兼容，清空所有缓存数据（保留 token/session）
      clearStorageCache();
      localStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION));
    }
  } catch {
    localStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION));
  }
}
// 启动时执行一次版本检查
checkAndMigrateStorage();

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`campuslink_${key}`);
    // 清除含 HEIC 的旧 avatar/cover 缓存
    if (raw && (key === 'profile')) {
      const parsed = JSON.parse(raw);
      if (parsed.avatarUrl && (parsed.avatarUrl.includes('.heic') || parsed.avatarUrl.includes('.HEIC'))) {
        parsed.avatarUrl = '';
      }
      if (parsed.coverUrl && (parsed.coverUrl.includes('.heic') || parsed.coverUrl.includes('.HEIC'))) {
        parsed.coverUrl = '';
      }
      return parsed;
    }
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function saveToStorage(key: string, value: any): boolean {
  try {
    localStorage.setItem(`campuslink_${key}`, JSON.stringify(value));
    return true;
  } catch {
    return false; // 配额超限或存储不可用
  }
}

export function clearStorageCache() {
  try {
    Object.keys(localStorage)
      .filter(
        (k) => k.startsWith('campuslink_') && !['campuslink_token', 'campuslink_refresh', 'campuslink_sid', 'campuslink_schema_version'].includes(k),
      )
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* noop */
  }
}

export function useAppData() {
  const [profile, setProfile] = useState<StudentProfile>(() => loadFromStorage('profile', INITIAL_PROFILE));
  const isGuest = !profile.studentId;
  const isPending = !isGuest && !profile.isVerified;

  const [activeTab, setActiveTab] = useState('home');
  const [listings, setListings] = useState<Listing[]>(() => loadFromStorage('listings', INITIAL_LISTINGS));
  const [listPage, setListPage] = useState(1);
  const [listHasMore, setListHasMore] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [listRefreshing, setListRefreshing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [courses, setCourses] = useState<Course[]>(() => loadFromStorage('courses', INITIAL_COURSES));
  const [messages, setMessages] = useState<Message[]>(() => loadFromStorage('messages', []));
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [savedListingIds, setSavedListingIds] = useState<string[]>(() => {
    const raw = loadFromStorage('saved', []);
    // 清除 mock 数据 ID（非数字），防止触发服务端外键异常
    return raw.filter((id: string) => /^\d+$/.test(id));
  });
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [selectedPostType, setSelectedPostType] = useState(() => loadFromStorage('home_filter', 'all'));
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info'; action?: { label: string; onClick: () => void } } | null>(null);

  const lastPublishTime = useRef(0);
  const reportedPostIds = useRef(new Set<string>());
  const PUBLISH_COOLDOWN = 30000;
  const MAX_POSTS_PER_DAY = 10;
  const MAX_POSTS_UNVERIFIED = 3;

  // Modal + form
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAddCourseOpen, setIsAddCourseOpen] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareWeek, setShareWeek] = useState(() => {
    // 默认当前教学周（学期第1周从3月开始估算，实际以用户选择为准）
    return 16;
  });
  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  const [courseForm, setCourseForm] = useState({
    name: '',
    teacher: '',
    classroom: '',
    weekday: 3,
    startPeriod: 3,
    periodSpan: 2,
    weekStart: 1,
    weekEnd: 18,
    weekType: 'all' as Course['weekType'],
    courseType: 'theory' as Course['courseType'],
    colorClass: 'bg-course-blue text-white',
  });

  function getTodayPostCount(): number {
    const today = new Date().toDateString();
    return listings.filter((l) => {
      // 本地帖子（list- 前缀）：从 ID 时间戳判断
      if (l.id.startsWith('list-')) {
        const ts = parseInt(l.id.replace('list-', ''), 10);
        return !isNaN(ts) && new Date(ts).toDateString() === today;
      }
      // 服务端帖子：从 publishedTimeText 判断
      if (l.publishedTimeText) {
        const d = new Date(l.publishedTimeText);
        if (!isNaN(d.getTime())) return d.toDateString() === today;
      }
      return false;
    }).length;
  }

  // ── 服务端数据拉取（缓存优先，无缓存才拉服务端） ──
  const syncCourses = () => {
    if (!getToken()) return;
    coursesApi.list()
      .then((res) => {
        if (res.code === 0 && res.data) {
          const serverCourses = (Array.isArray(res.data) ? res.data : (res.data as any).data || []).map(
            (c: any) =>
              ({
                id: String(c.id),
                name: c.name,
                teacher: c.teacher || '',
                classroom: c.classroom || '',
                weekday: c.weekday || 1,
                startPeriod: c.start_period || 1,
                periodSpan: c.period_span || 2,
                weekStart: c.week_start || 1,
                weekEnd: c.week_end || 18,
                weekType: c.week_type || 'all',
                courseType: c.course_type || 'theory',
                colorClass: c.color_class || 'bg-course-blue text-white',
              }) as Course,
          );
          setCourses(serverCourses);
        }
      })
      .catch(() => {});
  };
  const syncPosts = (page = 1, append = false) => {
    if (listLoading) return;
    setListLoading(true);
    postsApi.list({ page, limit: 20, type: selectedPostType !== 'all' ? selectedPostType : undefined })
      .then((res) => {
        if (res.code === 0 && res.data) {
          const serverListings = (res.data.list || []).map(
            (p: any) =>
              ({
                id: String(p.id),
                title: p.title,
                price: p.price,
                originalPrice: p.original_price,
                description: p.description,
                imageUrls: safeParseJsonArray(p.image_urls),
                category: p.category,
                postType: p.post_type,
                publisherId: p.user_id || 0,
                publisherName: p.publisher_name || p.nickname || '',
                publisherAvatar: p.publisher_avatar || '',
                isVerifiedStudent: p.publisher_auth_status === 'verified',
                isOfficialOrg: p.is_official,
                orgName: p.org_name || p.publisher_org_name,
                department: p.publisher_department,
                publisherOrgLevel: p.publisher_org_level,
                publisherPosition: p.publisher_position,
                publishedTimeText: p.created_at?.substring(0, 10) || '',
                views: p.views || 0,
                favorites: 0,
                contactInfo: p.contact_info,
                status: p.status || 'active',
              }) as Listing,
          );
          setListings(prev => append ? [...prev, ...serverListings] : serverListings);
          setListHasMore(serverListings.length >= 20);
          setListPage(page);
          setListError(null); // 成功清除错误
        }
      })
      .catch(() => {
        if (!append) setListError('加载失败，请检查网络后重试');
      })
      .finally(() => {
        setListLoading(false);
        setListRefreshing(false);
      });
  };

  const refreshPosts = () => {
    setListRefreshing(true);
    syncPosts(1, false);
  };

  const loadMorePosts = () => {
    if (listHasMore && !listLoading) syncPosts(listPage + 1, true);
  };
  const syncFavorites = () => {
    if (!getToken() || !profile.studentId) return;
    postsApi.getFavorites()
      .then((res) => {
        if (res.code === 0 && Array.isArray(res.data)) {
          const ids = res.data.map((p: any) => String(p.id));
          setSavedListingIds(ids);
        }
      })
      .catch(() => {});
  };

  // ── 相对时间格式化 ──
  const formatRelativeTime = (dateStr: string): string => {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      const diffHour = Math.floor(diffMs / 3600000);
      const diffDay = Math.floor(diffMs / 86400000);

      if (diffMin < 1) return '刚刚';
      if (diffMin < 60) return `${diffMin}分钟前`;
      if (diffHour < 24) return `${diffHour}小时前`;
      if (diffDay === 1) return '昨天';
      if (diffDay < 7) {
        const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        return weekdays[date.getDay()];
      }
      return `${date.getMonth() + 1}月${date.getDate()}日`;
    } catch {
      return dateStr;
    }
  };

  // ── 从 notices API 推导消息状态 ──
  const deriveStatus = (title: string, category: string): Message['status'] => {
    if (category === 'approval') {
      if (title.includes('通过')) return 'approved';
      if (title.includes('打回') || title.includes('退回')) return 'rejected';
    }
    if (category === 'registration') {
      if (title.includes('报名')) return 'event';
    }
    if (category === 'official') {
      if (title.includes('活动') || title.includes('音乐节')) return 'event';
      return 'update';
    }
    return 'update';
  };

  const syncMessages = useCallback(() => {
    if (!getToken()) return;
    noticesApi.list()
      .then((res) => {
        if (res.code === 0 && Array.isArray(res.data)) {
          const serverMessages: Message[] = res.data.map((n: any) => ({
            id: String(n.id),
            title: n.title || '',
            content: n.content || '',
            timeText: formatRelativeTime(n.created_at),
            category: (n.category === 'approval' ? 'approval' : n.category === 'registration' ? 'registration' : 'official') as Message['category'],
            status: deriveStatus(n.title || '', n.category || 'official'),
            isRead: !!n.is_read,
          }));
          setMessages(serverMessages);
        }
      })
      .catch(() => {});
  }, []);
  // 挂载：无缓存才拉服务端
  useEffect(() => {
    if (!getToken()) return;
    const cached: any = loadFromStorage('courses', []);
    if (!cached || !cached.length) syncCourses();
  }, [profile.studentId]);
  useEffect(() => {
    if (!getToken()) return;
    const cached: any = loadFromStorage('listings', []);
    if (!cached || !cached.length) syncPosts(1, false);
  }, [profile.studentId]);
  // 挂载：收藏始终从服务端同步（服务端是权威数据源）
  useEffect(() => {
    if (!profile.studentId) return;
    syncFavorites();
  }, [profile.studentId]);
  // 挂载：消息从服务端同步（服务端是权威数据源）
  useEffect(() => {
    if (!profile.studentId) return;
    syncMessages();
  }, [profile.studentId, syncMessages]);

  // 消息轮询：90s 间隔，切后台暂停省电
  useEffect(() => {
    if (!profile.studentId) return;
    let timer: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (timer) return;
      timer = setInterval(() => syncMessages(), 90_000);
    };

    const stopPolling = () => {
      if (timer) { clearInterval(timer); timer = null; }
    };

    const onVisibility = () => {
      if (document.hidden) { stopPolling(); }
      else { syncMessages(); startPolling(); }
    };

    startPolling();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [profile.studentId, syncMessages]);

  // ── 登录后从 API 刷新 profile（覆盖 localStorage 旧缓存）──
  useEffect(() => {
    const token = getToken();
    if (!token || !profile.studentId) return;
    try {
      // 从 JWT payload 提取 user_id
      const payload = JSON.parse(atob(token.split('.')[1]));
      const userId = payload?.uid;
      if (!userId) return;
      authApi.getPublicProfile(userId)
        .then((res) => {
          if (res.code === 0 && res.data) {
            setProfile((prev) => ({
              ...prev,
              avatarUrl: res.data.avatarUrl || prev.avatarUrl,
              coverUrl: res.data.coverUrl || prev.coverUrl,
              bio: res.data.bio || prev.bio,
              department: res.data.department || prev.department,
              orgLevel: res.data.orgLevel || prev.orgLevel,
              orgName: res.data.orgName || prev.orgName,
              position: res.data.position || prev.position,
              isVerified: res.data.isVerified ?? prev.isVerified,
            }));
          }
        })
        .catch(() => {});
    } catch { /* JWT 解析失败静默 */ }
  }, [profile.studentId]);

  // ── localStorage 持久化（合并为一次写入，避免连续触发多次 setItem）──
  const quotaWarned = useRef(false);
  useEffect(() => {
    let failed = false;
    if (!saveToStorage('listings', listings)) failed = true;
    if (!saveToStorage('courses', courses)) failed = true;
    if (!saveToStorage('messages', messages)) failed = true;
    if (!saveToStorage('profile', profile)) failed = true;
    if (!saveToStorage('saved', savedListingIds)) failed = true;
    if (failed && !quotaWarned.current) {
      quotaWarned.current = true;
      showToast('存储空间不足，部分数据可能未保存', 'info');
    }
  }, [listings, courses, messages, profile, savedListingIds]);

  // 分类筛选记忆
  useEffect(() => {
    saveToStorage('home_filter', selectedPostType);
  }, [selectedPostType]);

  // ── 计算属性 ──
  const notices = INITIAL_NOTICES;
  const unreadCount = useMemo(() => messages.filter((m) => !m.isRead).length, [messages]);
  const userListings = useMemo(
    () => listings.filter((l) => l.publisherName === profile.fullName),
    [listings, profile.fullName],
  );
  const savedListings = useMemo(
    () => listings.filter((l) => savedListingIds.includes(l.id)),
    [listings, savedListingIds],
  );
  const savedCount = savedListingIds.length;

  function showToast(message: string, type: 'success' | 'info' = 'success', action?: { label: string; onClick: () => void }) {
    setToast({ message, type, action });
    const duration = action ? 5000 : 3000;
    setTimeout(() => setToast(null), duration);
  }

  return {
    // 状态
    profile,
    setProfile,
    isGuest,
    isPending,
    activeTab,
    setActiveTab,
    listings,
    setListings,
    courses,
    setCourses,
    messages,
    setMessages,
    listLoading,
    listRefreshing,
    listHasMore,
    listError,
    refreshPosts,
    loadMorePosts,
    selectedListing,
    setSelectedListing,
    savedListingIds,
    setSavedListingIds,
    carouselIndex,
    setCarouselIndex,
    selectedPostType,
    setSelectedPostType,
    toast,
    showToast,
    // 防刷
    lastPublishTime,
    reportedPostIds,
    PUBLISH_COOLDOWN,
    MAX_POSTS_PER_DAY,
    MAX_POSTS_UNVERIFIED,
    getTodayPostCount,
    // Modal
    isSearchOpen,
    setIsSearchOpen,
    isAuthModalOpen,
    setIsAuthModalOpen,
    isAddCourseOpen,
    setIsAddCourseOpen,
    editingCourseId,
    setEditingCourseId,
    isShareModalOpen,
    setIsShareModalOpen,
    shareWeek,
    setShareWeek,
    editingListing,
    setEditingListing,
    courseForm,
    setCourseForm,
    // 计算
    notices,
    unreadCount,
    userListings,
    savedListings,
    savedCount,
    syncCourses,
    syncPosts,
    syncFavorites,
    syncMessages,
  };
}

export type AppData = ReturnType<typeof useAppData>;
