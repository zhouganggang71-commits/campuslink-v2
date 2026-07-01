/**
 * CampusLink 主入口 — 纯渲染，数据层和业务层已拆分到 hooks/
 */
import { lazy, Suspense, useCallback, useState, useEffect, useRef } from 'react';
import { Listing, Course } from './types';
import { useAppData, clearStorageCache } from './hooks/useAppData';
import { useAppActions } from './hooks/useAppActions';
import { useDirectMessages } from './hooks/useDirectMessages';
import { setSession } from './utils/api';
import { INITIAL_PROFILE, POST_TYPE_CHANNELS } from './data';
import Icon from './components/ui/Icon';
import Toast from './components/ui/Toast';
import Button from './components/ui/Button';
import Header from './components/layout/Header';
import BottomNav from './components/layout/BottomNav';
import AuthModal from './components/modal/AuthModal';
import WechatLoginModal from './components/modal/WechatLoginModal';
import AddCourseModal from './components/modal/AddCourseModal';
import ShareScheduleModal from './components/modal/ShareScheduleModal';
import OfflineBanner from './components/ui/OfflineBanner';

// 路由级懒加载 — 首屏仅加载当前 Tab
const HomeTab = lazy(() => import('./components/page/HomeTab'));
const ScheduleTab = lazy(() => import('./components/page/ScheduleTab'));
const PublishTab = lazy(() => import('./components/page/PublishTab'));
const MessagesTab = lazy(() => import('./components/page/MessagesTab'));
const CircleTab = lazy(() => import('./components/page/CircleTab'));
const ProfileTab = lazy(() => import('./components/page/ProfileTab'));
const ListingDetail = lazy(() => import('./components/page/ListingDetail'));
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

  // 个人主页覆盖层（类似抖音的单开页面）
  const [profileView, setProfileView] = useState<{
    userId: number;
    placeholder: { name: string; avatar: string; isVerified: boolean; department?: string; orgLevel?: string; orgName?: string; position?: string };
    onStartChat?: (userId: number) => void;
  } | null>(null);

  const handleWechatLoginSuccess = useCallback((data: { token: string; refresh_token: string; user: any }) => {
    // 复用现有 session 设置逻辑 (和 handleAuth 末尾一致)
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
        .filter((k) => k.startsWith('campuslink_') && !['campuslink_token', 'campuslink_refresh', 'campuslink_sid', 'campuslink_profile', 'campuslink_schema_version'].includes(k))
        .forEach((k) => localStorage.removeItem(k));
    } catch { /* noop */ }
    d.setProfile(newProfile);
    // 关闭 AuthModal（如果有打开）
    d.setIsAuthModalOpen(false);
    // 同步数据
    d.syncCourses();
    d.syncPosts();
    d.syncFavorites();
  }, [d]);

  const clearListing = useCallback(() => d.setSelectedListing(null), [d.setSelectedListing]);
  const handleMessagesClick = useCallback(() => {
    d.setActiveTab('messages');
    d.setSelectedListing(null);
  }, [d.setActiveTab, d.setSelectedListing]);

  const handleViewProfile = useCallback((userId: number, placeholder: any, onStartChat?: (userId: number) => void) => {
    setProfileView({ userId, placeholder, onStartChat });
  }, []);

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
      <Toast toast={d.toast} />

      <Header
        selectedListing={!!d.selectedListing}
        activeTab={d.activeTab}
        unreadCount={d.unreadCount + dm.dmUnreadCount}
        onClearListing={clearListing}
        onMessagesClick={handleMessagesClick}
      />

      <main className="w-full max-w-md bg-white h-[calc(100vh-3.5rem-4rem)] shadow-sm flex flex-col relative overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        <Suspense fallback={<div className="flex items-center justify-center flex-1"><div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin mt-20" /></div>}>
        {d.selectedListing ? (
          <ListingDetail
            listing={d.selectedListing}
            carouselIndex={d.carouselIndex}
            setCarouselIndex={d.setCarouselIndex}
            savedListingIds={d.savedListingIds}
            toggleSaveListing={a.toggleSaveListing}
            onCopyContact={a.handleCopyContact}
            onReport={a.handleReport}
            postTypeLabel={postTypeLabel}
            currentUserName={d.profile.fullName}
            currentProfile={{
              fullName: d.profile.fullName,
              studentId: d.profile.studentId,
              department: d.profile.department,
            }}
            onDelete={a.handleDelete}
            isGuest={d.isGuest}
            onStartChat={(userId) => {
              dm.startChat(userId).then((ok) => {
                if (!ok) d.showToast('发起私信失败', 'info');
              });
            }}
            onViewProfile={(userId, placeholder) => {
              handleViewProfile(userId, placeholder, (uid) => {
                dm.startChat(uid).then((ok) => {
                  if (!ok) d.showToast('发起私信失败', 'info');
                });
              });
            }}
          />
        ) : (
          <div className="flex flex-col flex-1">
            <div style={{ display: d.activeTab === 'home' && !d.selectedListing ? undefined : 'none' }}>
              <HomeTab
                listings={d.listings}
                notices={d.notices}
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
                  handleViewProfile(userId, placeholder, (uid) => {
                    dm.startChat(uid).then((ok) => {
                      if (!ok) d.showToast('发起私信失败', 'info');
                    });
                  });
                }}
              />
            </div>

            {isMounted('schedule') && (
            <div style={{ display: d.isGuest || d.isPending ? (d.activeTab === 'schedule' ? undefined : 'none') : (d.activeTab === 'schedule' ? undefined : 'none') }}>
              {(d.isGuest || d.isPending) ? (
                <LockPage isPending={d.isPending} label="课表" onAuth={() => d.setIsAuthModalOpen(true)} />
              ) : (
                <ScheduleTab
                  courses={d.courses}
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
            <div style={{ display: d.isGuest || d.isPending ? (d.activeTab === 'publish' ? undefined : 'none') : (d.activeTab === 'publish' ? undefined : 'none') }}>
              {(d.isGuest || d.isPending) ? (
                <LockPage isPending={d.isPending} label="发布" onAuth={() => d.setIsAuthModalOpen(true)} />
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
                onAuth={() => d.setIsAuthModalOpen(true)}
                onViewProfile={(userId, placeholder) => {
                  handleViewProfile(userId, placeholder, (uid) => {
                    dm.startChat(uid).then((ok) => {
                      if (!ok) d.showToast('发起私信失败', 'info');
                    });
                  });
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
                onOpenChat={(conv) => dm.openChat(conv.id, conv.otherUser)}
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
                onAuthClick={() => d.setIsAuthModalOpen(true)}
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

      <BottomNav
        activeTab={d.activeTab}
        setActiveTab={d.setActiveTab}
        unreadCount={d.unreadCount + dm.dmUnreadCount}
        setSelectedListing={clearListing}
      />

      <AuthModal
        isOpen={d.isAuthModalOpen}
        onClose={() => d.setIsAuthModalOpen(false)}
        onSubmit={a.handleAuth}
        showToast={d.showToast}
        initialValues={{
          fullName: '周鉦罡',
          studentId: '202330140113',
          department: '财税学院',
          orgLevel: '院级',
          orgName: '校学生会',
          position: '干事',
        }}
      />

      {/* 企业微信快捷登录 — 在 AuthModal 下方追加一个登录入口 */}
      {d.isAuthModalOpen && (
        <div className="fixed bottom-36 left-0 right-0 z-50 flex justify-center pointer-events-none">
          <div className="pointer-events-auto">
            <button
              onClick={() => { d.setIsAuthModalOpen(false); setIsWechatLoginOpen(true); }}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#07C160] text-white rounded-full shadow-lg text-sm font-medium hover:bg-[#06AD56] active:scale-[0.97] transition-all"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8.5 2C4.36 2 1 5.36 1 9.5c0 1.74.62 3.34 1.66 4.6L2 17l3.2-1.6c.84.3 1.74.47 2.66.5.09-.74.29-1.44.6-2.1A7.49 7.49 0 0 1 16 6.68C15.26 3.94 12.12 2 8.5 2zM12 3.5c.77 0 1.5.15 2.18.41A8.498 8.498 0 0 0 6.5 12c0 .46.04.92.1 1.37A7.498 7.498 0 0 0 12 3.5z"/>
              </svg>
              企业微信快捷登录
            </button>
          </div>
        </div>
      )}

      <WechatLoginModal
        isOpen={isWechatLoginOpen}
        onClose={() => setIsWechatLoginOpen(false)}
        onLoginSuccess={handleWechatLoginSuccess}
        showToast={d.showToast}
      />

      <AddCourseModal
        isOpen={d.isAddCourseOpen}
        onClose={() => { d.setIsAddCourseOpen(false); d.setEditingCourseId(null); }}
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
        courseCount={d.courses.filter(c => c.weekStart <= d.shareWeek && c.weekEnd >= d.shareWeek).length}
        courses={d.courses}
        onClose={() => d.setIsShareModalOpen(false)}
      />

      {/* ── 私信聊天覆盖层 ── */}
      {dm.activeChat && (
        <div className="fixed inset-0 z-50 flex justify-center">
          <div className="w-full max-w-md h-full flex flex-col bg-[#ededed]">
            <Suspense fallback={<div className="flex items-center justify-center flex-1"><div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin mt-20" /></div>}>
              <ChatView
                otherUser={dm.activeChat.otherUser}
                messages={dm.activeChat.messages}
                hasMore={dm.activeChat.hasMore}
                loading={dm.activeChat.loading}
                currentUserId={dm.currentUserId}
                onBack={dm.closeChat}
                onSend={dm.sendMessage}
                onLoadMore={dm.loadMoreMessages}
              />
            </Suspense>
          </div>
        </div>
      )}

      {/* ── 个人主页覆盖层（类似抖音）── */}
      {profileView && (
        <div className="fixed inset-0 z-50 flex justify-center">
          <div className="w-full max-w-md h-full flex flex-col bg-slate-50 overflow-y-auto">
            <Suspense fallback={<div className="flex items-center justify-center flex-1"><div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin mt-20" /></div>}>
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
        <Button variant="primary" size="sm" onClick={onAuth}>去认证</Button>
      )}
    </div>
  );
}
