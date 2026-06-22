/**
 * 数据层 — 所有 state、localStorage、服务端数据拉取、计算属性
 */
import { useState, useMemo, useEffect, useRef } from 'react';
import { Listing, Course, Message, StudentProfile } from '../types';
import { INITIAL_PROFILE, INITIAL_LISTINGS, INITIAL_COURSES, INITIAL_MESSAGES, INITIAL_NOTICES } from '../data';
import { api, getToken } from '../utils/api';

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`campuslink_${key}`);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function saveToStorage(key: string, value: any) {
  try {
    localStorage.setItem(`campuslink_${key}`, JSON.stringify(value));
  } catch {
    /* noop */
  }
}

export function clearStorageCache() {
  try {
    Object.keys(localStorage)
      .filter(
        (k) => k.startsWith('campuslink_') && !['campuslink_token', 'campuslink_refresh', 'campuslink_sid'].includes(k),
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
  const [courses, setCourses] = useState<Course[]>(() => loadFromStorage('courses', INITIAL_COURSES));
  const [messages, setMessages] = useState<Message[]>(() => loadFromStorage('messages', INITIAL_MESSAGES));
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [savedListingIds, setSavedListingIds] = useState<string[]>(() => loadFromStorage('saved', ['headphones-1']));
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [selectedPostType, setSelectedPostType] = useState('all');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  const lastPublishTime = useRef(0);
  const reportedPostIds = useRef(new Set<string>());
  const PUBLISH_COOLDOWN = 30000;
  const MAX_POSTS_PER_DAY = 10;
  const MAX_POSTS_UNVERIFIED = 3;

  // Modal + form
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAddCourseOpen, setIsAddCourseOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
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
    api
      .get<{ data: any[] }>('/courses')
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
  const syncPosts = () => {
    api
      .get<{ list: any[] }>('/posts')
      .then((res) => {
        if (res.code === 0 && res.data?.list) {
          const serverListings = res.data.list.map(
            (p: any) =>
              ({
                id: String(p.id),
                title: p.title,
                price: p.price,
                originalPrice: p.original_price,
                description: p.description,
                imageUrls: p.image_urls ? JSON.parse(p.image_urls) : [],
                category: p.category,
                postType: p.post_type,
                publisherName: p.publisher_name || p.nickname || '',
                publisherAvatar: '',
                isVerifiedStudent: true,
                isOfficialOrg: p.is_official,
                orgName: p.org_name,
                department: undefined,
                publishedTimeText: p.created_at?.substring(0, 10) || '',
                views: p.views || 0,
                favorites: 0,
                contactInfo: p.contact_info,
                status: p.status || 'active',
              }) as Listing,
          );
          setListings(serverListings);
        }
      })
      .catch(() => {});
  };
  // 挂载：无缓存才拉服务端
  useEffect(() => {
    const cached: any = loadFromStorage('courses', []);
    if (!cached || !cached.length) syncCourses();
  }, []);
  useEffect(() => {
    const cached: any = loadFromStorage('posts', []);
    if (!cached || !cached.length) syncPosts();
  }, []);

  // ── localStorage 持久化（合并为一次写入，避免连续触发多次 setItem）──
  useEffect(() => {
    saveToStorage('listings', listings);
    saveToStorage('courses', courses);
    saveToStorage('messages', messages);
    saveToStorage('profile', profile);
    saveToStorage('saved', savedListingIds);
  }, [listings, courses, messages, profile, savedListingIds]);

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

  function showToast(message: string, type: 'success' | 'info' = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
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
    isShareModalOpen,
    setIsShareModalOpen,
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
  };
}
