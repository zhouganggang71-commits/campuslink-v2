/**
 * CampusLink 主入口 — 纯渲染，数据层和业务层已拆分到 hooks/
 */
import { lazy, Suspense, useCallback, useState, useEffect } from 'react';
import { Listing, Course } from './types';
import { useAppData, clearStorageCache } from './hooks/useAppData';
import { useAppActions } from './hooks/useAppActions';
import { useDirectMessages } from './hooks/useDirectMessages';
import { setSession, getToken } from './utils/api';
import { authApi, transactionsApi } from './api';
import { INITIAL_PROFILE, POST_TYPE_CHANNELS } from './data';
import { autoEnablePush } from './utils/push';
import Icon from './components/ui/Icon';
import Toast from './components/ui/Toast';
import Button from './components/ui/Button';
import Header from './components/layout/Header';
import BottomNav from './components/layout/BottomNav';
import WechatLoginModal from './components/modal/WechatLoginModal';
import AddCourseModal from './components/modal/AddCourseModal';
import ShareScheduleModal from './components/modal/ShareScheduleModal';
import OfflineBanner from './components/ui/OfflineBanner';
import InstallPrompt from './components/ui/InstallPrompt';
import NotificationPrompt from './components/ui/NotificationPrompt';
import NewUserGuide from './components/ui/NewUserGuide';

// 路由级懒加载 — 首屏仅加载当前 Tab
const HomeTab = lazy(() => import('./components/page/HomeTab'));
const ScheduleTab = lazy(() => import('./components/page/ScheduleTab'));
const PublishTab = lazy(() => import('./components/page/PublishTab'));
const MessagesTab = lazy(() => import('./components/page/MessagesTab'));
const CircleTab = lazy(() => import('./components/page/CircleTab'));
const ProfileTab = lazy(() => import('./components/page/ProfileTab'));
const ListingDetail = lazy(() => import('./components/page/ListingDetail'));
const ContentListPage = lazy(() => import('./components/page/ContentListPage'));
const ContentDetailPage = lazy(() => import('./components/page/ContentDetailPage'));
const TransactionsPage = lazy(() => import('./components/page/TransactionsPage'));
const PeerMatchPage = lazy(() => import('./components/page/PeerMatchPage'));
const SearchPage = lazy(() => import('./components/page/SearchPage'));
const ChatView = lazy(() => import('./components/page/ChatView'));
const ProfilePage = lazy(() => import('./components/page/ProfilePage'));

function postTypeLabel(pt: string) {
  return POST_TYPE_CHANNELS.find((p) => p.key === pt)?.label || pt;
}

export default function App() {
  const d = useAppData();
  const a = useAppActions(d);
  const dm = useDirectMessages();
  const [isWechatLoginOpen, setIsWechatLoginOpen] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const [peerOpen, setPeerOpen] = useState(false);

  // 个人主页覆盖层（类似抖音的单开页面）
  const [profileView, setProfileView] = useState<{
    userId: number;
    placeholder: {
      name: string;
      avatar: string;
      isVerified: boolean;
      department?: string;
      orgLevel?: string;
      orgName?: string;
      position?: string;
    };
    onStartChat?: (userId: number) => void;
  } | null>(null);

  // ── 暗色模式 ──
  const [isDark, setIsDark] = useState(() => {
    try {
      return localStorage.getItem('campuslink_dark') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    try {
      localStorage.setItem('campuslink_dark', String(isDark));
    } catch {
      /* noop */
    }
  }, [isDark]);

  const toggleTheme = useCallback(() => setIsDark((prev) => !prev), []);

  // ── 登录态恢复：用 token 从 /auth/me 拉取用户信息重建 profile ──
  // 场景：①页面刷新后 profile 缓存被 BUILD 清理脚本清掉 ②扫码登录响应缺姓名学号 ③authStatus 变化后保持最新
  const refreshProfileFromMe = useCallback(() => {
    if (!getToken()) return;
    authApi
      .me()
      .then((res) => {
        if (res.code !== 0 || !res.data) return; // 失败保持现状（token 过期由 client 自动刷新/清理）
        const u = res.data;
        const verified = u.authStatus === 'verified' || u.authStatus === 'org_verified';
        d.setProfile((prev) => ({
          ...prev,
          fullName: u.nickname || prev.fullName,
          studentId: u.studentId || prev.studentId,
          department: u.department || prev.department,
          orgLevel: (u.orgLevel || prev.orgLevel) as typeof prev.orgLevel,
          orgName: u.orgName || '',
          position: (u.position || prev.position) as typeof prev.position,
          avatarUrl: u.avatarUrl || '',
          coverUrl: u.coverUrl || '',
          bio: u.bio || '',
          isVerified: verified,
          isAdmin: u.isAdmin,
          gender: u.gender ?? null,
          genderVisible: !!u.genderVisible,
        }));
      })
      .catch(() => {
        /* 网络异常保持现状 */
      });
  }, [d.setProfile]);

  // 启动时恢复一次（token 在、profile 可能刚被发版清缓存清掉）
  useEffect(() => {
    refreshProfileFromMe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 启动时如有 token，自动尝试开启推送通知（用户无感知）
  useEffect(() => {
    if (getToken()) autoEnablePush().catch(() => {});
  }, []);

  // 推送通知点击跳转：sw.js notificationclick 会导航到 push payload 里的 url（如 /campus/?tab=messages）。
  // 只做 Tab 级跳转（不精确定位到某条会话——那需要先按 id 查会话详情才能拿到 openChat 需要的对方信息，
  // 范围更大，先解决"点了通知却落回首页"这个更明显的问题）；处理完立即清掉 query string，避免刷新重复跳转
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab) {
      d.setActiveTab(tab);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleWechatLoginSuccess = useCallback(
    (data: { token: string; refresh_token: string; user: any }) => {
      // 复用现有 session 设置逻辑
      setSession(data.token, data.refresh_token);
      const verified = data.user?.authStatus === 'verified' || data.user?.authStatus === 'org_verified';
      const newProfile = {
        ...INITIAL_PROFILE,
        department: data.user?.department || '',
        isVerified: verified,
        isAdmin: !!data.user?.isAdmin,
        postsCount: 0,
        savedCount: 0,
      };
      try {
        localStorage.setItem('campuslink_profile', JSON.stringify(newProfile));
        Object.keys(localStorage)
          .filter(
            (k) =>
              k.startsWith('campuslink_') &&
              ![
                'campuslink_token',
                'campuslink_refresh',
                'campuslink_sid',
                'campuslink_profile',
                'campuslink_schema_version',
              ].includes(k),
          )
          .forEach((k) => localStorage.removeItem(k));
      } catch {
        /* noop */
      }
      d.setProfile(newProfile);
      // 扫码登录响应不含姓名/学号，立即从 /auth/me 补全
      refreshProfileFromMe();
      // 关闭认证弹窗（扫码登录成功后）
      setIsWechatLoginOpen(false);
      // 同步数据
      d.syncCourses();
      d.syncPosts();
      d.syncFavorites();
    },
    [d, refreshProfileFromMe],
  );

  const clearListing = useCallback(() => d.setSelectedListing(null), [d.setSelectedListing]);
  const handleProfileClick = useCallback(() => {
    d.setActiveTab('profile');
    d.setSelectedListing(null);
  }, [d.setActiveTab, d.setSelectedListing]);

  // 发起私信 + 失败时展示服务端真实错误（不能和自己聊天 / 目标用户ID无效 等）
  const startChatWithToast = useCallback(
    (uid: number) => {
      dm.startChat(uid).then((res) => {
        if (res.code === 0) {
          setProfileView(null); // 成功后关掉个人主页覆盖层，露出聊天页（两者同为 z-50，否则会被盖住）
        } else {
          d.showToast(res.message || '发起私信失败', 'info');
        }
      });
    },
    [dm, d],
  );

  const handleViewProfile = useCallback(
    (userId: number, placeholder: any, onStartChat?: (userId: number) => void) => {
      if (!userId || userId <= 0) return; // 发布者 ID 无效，不打开主页
      // 查看自己的主页时不显示”发私信”
      setProfileView({ userId, placeholder, onStartChat: userId === dm.currentUserId ? undefined : onStartChat });
    },
    [dm.currentUserId],
  );

  // Tab 懒加载：首次切换到某 Tab 才挂载，之后用 display:none 保活
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(new Set(['home']));
  useEffect(() => {
    if (!mountedTabs.has(d.activeTab)) {
      setMountedTabs((prev) => new Set([...prev, d.activeTab]));
    }
  }, [d.activeTab]);
  const isMounted = (tab: string) => mountedTabs.has(tab);

  return (
    <div className="w-full min-h-screen bg-slate-50 text-on-surface font-sans antialiased flex flex-col items-center">
      <OfflineBanner />
      <InstallPrompt />
      <NotificationPrompt enabled={!d.isGuest} onResult={(msg, ok) => d.showToast(msg, ok ? 'success' : 'info')} />
      <NewUserGuide />
      <Toast toast={d.toast} />

      <Header
        selectedListing={!!d.selectedListing || !!d.contentList || !!d.selectedContent}
        activeTab={d.activeTab}
        onClearListing={clearListing}
        onNotificationsClick={() => d.setActiveTab('messages')}
        notificationCount={d.unreadCount + dm.dmUnreadCount}
        isDark={isDark}
        onToggleTheme={toggleTheme}
      />

      <main className="w-full max-w-md bg-white dark:bg-slate-800 min-h-[calc(100vh-3.5rem-4rem)] shadow-sm flex flex-col relative">
        <Suspense
          fallback={
            <div className="flex items-center justify-center flex-1">
              <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin mt-20" />
            </div>
          }
        >
          {d.selectedContent ? (
            <ContentDetailPage content={d.selectedContent} onBack={() => d.setSelectedContent(null)} />
          ) : d.contentList ? (
            <ContentListPage
              category={d.contentList.category}
              subCategory={d.contentList.subCategory}
              items={d.contentsByCat[d.contentList.category] || []}
              onOpen={d.openContent}
              onBack={() => d.setContentList(null)}
            />
          ) : d.selectedListing ? (
            <ListingDetail
              listing={d.selectedListing}
              carouselIndex={d.carouselIndex}
              setCarouselIndex={d.setCarouselIndex}
              savedListingIds={d.savedListingIds}
              toggleSaveListing={a.toggleSaveListing}
              onCopyContact={a.handleCopyContact}
              postTypeLabel={postTypeLabel}
              currentUserName={d.profile.fullName}
              currentProfile={{
                fullName: d.profile.fullName,
                studentId: d.profile.studentId,
                department: d.profile.department,
              }}
              onDelete={a.handleDelete}
              isGuest={d.isGuest}
              onStartChat={startChatWithToast}
              onViewProfile={(userId, placeholder) => {
                handleViewProfile(userId, placeholder, startChatWithToast);
              }}
              onStartTransaction={(postId) => {
                if (d.isGuest) {
                  setIsWechatLoginOpen(true);
                  return Promise.resolve(false);
                }
                return transactionsApi
                  .create(postId)
                  .then((r) => {
                    if (r.code === 0) {
                      d.showToast(r.message || '已发起面交申请，等待卖家确认', 'success');
                      setTxOpen(true);
                      return true;
                    }
                    d.showToast(r.message || '发起失败', 'info');
                    return false;
                  })
                  .catch(() => {
                    d.showToast('网络异常，请重试', 'info');
                    return false;
                  });
              }}
            />
          ) : (
            // pb-28：BottomNav 是 fixed 定位悬浮在视口底部，不占据文档流，各 Tab 自身也没有为它
            // 预留空间——内容超过一屏需要滚动时，最后一段内容/操作按钮会被 BottomNav 盖住导致
            // "翻不到底"。统一在这里加底部留白，一次修复覆盖全部 5 个 Tab，不用每个页面单独改
            <div className="flex flex-col flex-1 pb-28">
              <div style={{ display: d.activeTab === 'home' && !d.selectedListing ? undefined : 'none' }}>
                <HomeTab
                  listings={d.listings}
                  notices={d.notices}
                  courses={d.courses}
                  courseOverrides={d.courseOverrides}
                  onGoSchedule={() => d.setActiveTab('schedule')}
                  onGoCircles={() => d.setActiveTab('circles')}
                  selectedPostType={d.selectedPostType}
                  setSelectedPostType={d.setSelectedPostType}
                  savedListingIds={d.savedListingIds}
                  currentUserName={d.profile.fullName}
                  openListingDetails={a.openListingDetails}
                  onPublishTab={() => d.setActiveTab('publish')}
                  onOpenSearch={() => d.setIsSearchOpen(true)}
                  onRefresh={d.refreshPosts}
                  refreshing={d.listRefreshing}
                  onLoadMore={d.loadMorePosts}
                  hasMore={d.listHasMore}
                  loading={d.listLoading}
                  listError={d.listError}
                  onRetry={d.refreshPosts}
                  onViewProfile={(userId, placeholder) => {
                    handleViewProfile(userId, placeholder, startChatWithToast);
                  }}
                  bannerItems={d.bannerItems}
                  contentsByCat={d.contentsByCat}
                  contentsLoading={d.contentsLoading}
                  openContentList={d.openContentList}
                  openContent={d.openContent}
                  onOpenPeerMatch={() => setPeerOpen(true)}
                />
              </div>

              {isMounted('schedule') && (
                <div
                  style={{
                    display:
                      d.isGuest || d.isPending
                        ? d.activeTab === 'schedule'
                          ? undefined
                          : 'none'
                        : d.activeTab === 'schedule'
                          ? undefined
                          : 'none',
                  }}
                >
                  {d.isGuest || d.isPending ? (
                    <LockPage isPending={d.isPending} label="课表" onAuth={() => setIsWechatLoginOpen(true)} />
                  ) : (
                    <ScheduleTab
                      courses={d.courses}
                      overrides={d.courseOverrides}
                      onOverridesChanged={d.syncOverrides}
                      onShowToast={d.showToast}
                      onReAuth={() => setIsWechatLoginOpen(true)}
                      onAddCourse={() => d.setIsAddCourseOpen(true)}
                      onEditCourse={(course: Course) => {
                        d.setEditingCourseId(course.id);
                        d.setCourseForm({
                          name: course.name,
                          teacher: course.teacher,
                          classroom: course.classroom,
                          weekday: course.weekday,
                          startPeriod: course.startPeriod,
                          periodSpan: course.periodSpan,
                          weekStart: course.weekStart,
                          weekEnd: course.weekEnd,
                          weekType: course.weekType,
                          courseType: course.courseType,
                          colorClass: course.colorClass,
                        });
                        d.setIsAddCourseOpen(true);
                      }}
                      onImportCourses={a.handleImportCourses}
                      onShareSchedule={a.handleShareSchedule}
                      onDeleteCourse={a.handleDeleteCourse}
                    />
                  )}
                </div>
              )}

              {isMounted('publish') && (
                <div
                  style={{
                    display:
                      d.isGuest || d.isPending
                        ? d.activeTab === 'publish'
                          ? undefined
                          : 'none'
                        : d.activeTab === 'publish'
                          ? undefined
                          : 'none',
                  }}
                >
                  {d.isGuest || d.isPending ? (
                    <LockPage isPending={d.isPending} label="发布" onAuth={() => setIsWechatLoginOpen(true)} />
                  ) : (
                    <PublishTab
                      onPublish={a.handlePublish}
                      onCancel={() => {
                        d.setActiveTab('home');
                        d.setEditingListing(null);
                      }}
                      isOrg={!!d.profile.orgLevel && !!d.profile.position}
                      isVerified={d.profile.isVerified}
                      editListing={d.editingListing}
                      showToast={d.showToast}
                    />
                  )}
                </div>
              )}

              {isMounted('circles') && (
                <div style={{ display: d.activeTab === 'circles' ? undefined : 'none' }}>
                  <CircleTab
                    showToast={d.showToast}
                    isGuest={d.isGuest}
                    onAuth={() => setIsWechatLoginOpen(true)}
                    onViewProfile={(userId, placeholder) => {
                      handleViewProfile(userId, placeholder, startChatWithToast);
                    }}
                  />
                </div>
              )}

              {isMounted('messages') && (
                <div style={{ display: d.activeTab === 'messages' ? undefined : 'none' }}>
                  <MessagesTab
                    messages={d.messages}
                    onMarkRead={a.handleMarkMessageRead}
                    onMarkAllRead={a.handleMarkAllRead}
                    onDeleteMessage={a.handleDeleteMessage}
                    conversations={dm.conversations}
                    conversationsLoading={dm.conversationsLoading}
                    onOpenChat={(conv) =>
                      dm.openChat(conv.id, conv.otherUser, conv.status || 'active', !!conv.isInitiator)
                    }
                    pendingConversations={dm.pendingConversations}
                    onOpenPendingChat={(conv) => dm.openChat(conv.id, conv.otherUser, 'pending', false)}
                    avatarUrl={d.profile.avatarUrl}
                    onProfileClick={handleProfileClick}
                  />
                </div>
              )}

              {isMounted('profile') && (
                <div style={{ display: d.activeTab === 'profile' ? undefined : 'none' }}>
                  <ProfileTab
                    profile={d.profile}
                    savedCount={d.savedCount}
                    listings={d.userListings}
                    savedListings={d.savedListings}
                    onAuthClick={() => setIsWechatLoginOpen(true)}
                    onRescanClick={() => setIsWechatLoginOpen(true)}
                    onLogout={() => {
                      setSession(null, null);
                      clearStorageCache();
                      d.setProfile(INITIAL_PROFILE);
                      d.setCourses([]);
                      d.setMessages([]);
                      d.setSavedListingIds([]);
                      d.showToast('已退出', 'info');
                    }}
                    onShowToast={d.showToast}
                    onOpenDetail={a.openListingDetails}
                    onDelete={a.handleDelete}
                    onStartEdit={a.handleStartEdit}
                    onUpdateProfile={d.setProfile}
                    toggleSaveListing={a.toggleSaveListing}
                    onOpenTransactions={() => setTxOpen(true)}
                  />
                </div>
              )}
            </div>
          )}

          {d.isSearchOpen && !d.selectedListing && (
            <div className="absolute inset-0 z-30 bg-white">
              <SearchPage
                savedListingIds={d.savedListingIds}
                onOpenDetail={(l: Listing) => {
                  a.openListingDetails(l);
                  d.setIsSearchOpen(false);
                }}
                onClose={() => d.setIsSearchOpen(false)}
                postTypeLabel={postTypeLabel}
              />
            </div>
          )}
        </Suspense>
      </main>

      {/* 详情页/搜索页是"子页面"体验（有自己的返回/操作栏），不与它们同时显示——
          否则 ListingDetail 自己的 sticky 底部操作栏会被 z-index 更高的 BottomNav 完全盖住 */}
      {!d.selectedListing && !d.isSearchOpen && !d.contentList && !d.selectedContent && (
        <BottomNav activeTab={d.activeTab} setActiveTab={d.setActiveTab} setSelectedListing={clearListing} />
      )}

      <WechatLoginModal
        isOpen={isWechatLoginOpen}
        onClose={() => setIsWechatLoginOpen(false)}
        onLoginSuccess={handleWechatLoginSuccess}
        showToast={d.showToast}
      />

      <AddCourseModal
        isOpen={d.isAddCourseOpen}
        onClose={() => {
          d.setIsAddCourseOpen(false);
          d.setEditingCourseId(null);
        }}
        onSubmit={(e: any) => {
          e.preventDefault();
          a.handleAddCourse();
        }}
        form={d.courseForm}
        onChange={(updates: any) => d.setCourseForm((prev: any) => ({ ...prev, ...updates }))}
        editMode={!!d.editingCourseId}
      />

      <ShareScheduleModal
        isOpen={d.isShareModalOpen}
        selectedWeek={d.shareWeek}
        courseCount={d.courses.filter((c) => c.weekStart <= d.shareWeek && c.weekEnd >= d.shareWeek).length}
        courses={d.courses}
        onClose={() => d.setIsShareModalOpen(false)}
      />

      {/* ── 私信聊天覆盖层 ── */}
      {dm.activeChat && (
        <div className="fixed inset-0 z-50 flex justify-center">
          <div className="w-full max-w-md h-full flex flex-col bg-[#ededed]">
            <Suspense
              fallback={
                <div className="flex items-center justify-center flex-1">
                  <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin mt-20" />
                </div>
              }
            >
              <ChatView
                otherUser={dm.activeChat.otherUser}
                messages={dm.activeChat.messages}
                hasMore={dm.activeChat.hasMore}
                loading={dm.activeChat.loading}
                currentUserId={dm.currentUserId}
                status={dm.activeChat.status}
                isInitiator={dm.activeChat.isInitiator}
                onAccept={dm.acceptChat}
                onBack={dm.closeChat}
                onSend={dm.sendMessage}
                onLoadMore={dm.loadMoreMessages}
                onRecall={dm.recallMessage}
              />
            </Suspense>
          </div>
        </div>
      )}

      {/* ── 校内寻伴覆盖层 ── */}
      {peerOpen && (
        <div className="fixed inset-0 z-50 flex justify-center">
          <div className="w-full max-w-md h-full flex flex-col">
            <Suspense
              fallback={
                <div className="flex items-center justify-center flex-1">
                  <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin mt-20" />
                </div>
              }
            >
              <PeerMatchPage
                myDepartment={d.profile.department || ''}
                onBack={() => setPeerOpen(false)}
                onStartChat={startChatWithToast}
                showToast={d.showToast}
                isGuest={d.isGuest}
                onAuth={() => setIsWechatLoginOpen(true)}
              />
            </Suspense>
          </div>
        </div>
      )}

      {/* ── 我的交易覆盖层 ── */}
      {txOpen && (
        <div className="fixed inset-0 z-50 flex justify-center">
          <div className="w-full max-w-md h-full flex flex-col">
            <Suspense
              fallback={
                <div className="flex items-center justify-center flex-1">
                  <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin mt-20" />
                </div>
              }
            >
              <TransactionsPage onBack={() => setTxOpen(false)} showToast={d.showToast} />
            </Suspense>
          </div>
        </div>
      )}

      {/* ── 个人主页覆盖层（类似抖音）── */}
      {profileView && (
        <div className="fixed inset-0 z-50 flex justify-center">
          <div className="w-full max-w-md h-full flex flex-col bg-slate-50 overflow-y-auto">
            <Suspense
              fallback={
                <div className="flex items-center justify-center flex-1">
                  <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin mt-20" />
                </div>
              }
            >
              <ProfilePage
                userId={profileView.userId}
                onBack={() => setProfileView(null)}
                onStartChat={profileView.onStartChat}
                placeholder={profileView.placeholder}
              />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}

function LockPage({ isPending, label, onAuth }: { isPending: boolean; label: string; onAuth: () => void }) {
  return (
    <div className="p-8 flex flex-col items-center justify-center flex-1 text-gray-400">
      <Icon name="lock" className="text-5xl mb-3 text-gray-200" />
      <p className="text-sm font-semibold text-gray-500">{isPending ? '账号审核中' : `游客模式无法使用${label}`}</p>
      <p className="text-xs mt-1">{isPending ? '审核通过后即可使用' : '请先完成学生身份认证'}</p>
      {!isPending && (
        <Button variant="primary" size="sm" onClick={onAuth}>
          去认证
        </Button>
      )}
    </div>
  );
}
