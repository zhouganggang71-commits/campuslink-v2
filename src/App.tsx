/**
 * CampusLink 主入口 — 纯渲染，数据层和业务层已拆分到 hooks/
 */
import { lazy, Suspense } from 'react';
import { Listing } from './types';
import { useAppData, clearStorageCache } from './hooks/useAppData';
import { useAppActions } from './hooks/useAppActions';
import { setSession } from './utils/api';
import { INITIAL_PROFILE } from './data';
import Icon from './components/ui/Icon';
import Toast from './components/ui/Toast';
import Button from './components/ui/Button';
import Header from './components/layout/Header';
import BottomNav from './components/layout/BottomNav';
import AuthModal from './components/modal/AuthModal';
import AddCourseModal from './components/modal/AddCourseModal';
import ShareScheduleModal from './components/modal/ShareScheduleModal';

// 路由级懒加载 — 首屏仅加载当前 Tab
const HomeTab = lazy(() => import('./components/page/HomeTab'));
const ScheduleTab = lazy(() => import('./components/page/ScheduleTab'));
const PublishTab = lazy(() => import('./components/page/PublishTab'));
const MessagesTab = lazy(() => import('./components/page/MessagesTab'));
const CircleTab = lazy(() => import('./components/page/CircleTab'));
const ProfileTab = lazy(() => import('./components/page/ProfileTab'));
const ListingDetail = lazy(() => import('./components/page/ListingDetail'));
const SearchPage = lazy(() => import('./components/page/SearchPage'));

const POST_TYPES: { key: Listing['postType'] | 'all'; label: string; icon: string }[] = [
  { key: 'all', label: '全部', icon: 'apps' },
  { key: 'sell', label: '二手', icon: 'shopping_bag' },
  { key: 'lost', label: '失物', icon: 'search' },
  { key: 'found', label: '招领', icon: 'volunteer_activism' },
  { key: 'carpool', label: '拼车', icon: 'directions_car' },
  { key: 'job', label: '兼职', icon: 'work' },
  { key: 'activity', label: '活动', icon: 'celebration' },
  { key: 'study', label: '学习', icon: 'school' },
];

function postTypeLabel(pt: string) {
  return POST_TYPES.find((p) => p.key === pt)?.label || pt;
}

export default function App() {
  const d = useAppData();
  const a = useAppActions(d);

  return (
    <div className="w-full min-h-screen bg-slate-50 text-on-surface font-sans antialiased pb-20 flex flex-col items-center">
      <Toast toast={d.toast} />

      <Header
        selectedListing={!!d.selectedListing}
        activeTab={d.activeTab}
        unreadCount={d.unreadCount}
        onClearListing={() => d.setSelectedListing(null)}
        onMessagesClick={() => {
          d.setActiveTab('messages');
          d.setSelectedListing(null);
        }}
      />

      <main className="w-full max-w-md bg-white min-h-[calc(100vh-3.5rem)] shadow-sm flex flex-col overflow-hidden relative pb-10">
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
                openListingDetails={a.openListingDetails}
                onPublishTab={() => d.setActiveTab('publish')}
                onOpenSearch={() => d.setIsSearchOpen(true)}
                onRefresh={d.refreshPosts}
                refreshing={d.listRefreshing}
                onLoadMore={d.loadMorePosts}
                hasMore={d.listHasMore}
                loading={d.listLoading}
              />
            </div>

            <div style={{ display: d.isGuest || d.isPending ? (d.activeTab === 'schedule' ? undefined : 'none') : (d.activeTab === 'schedule' ? undefined : 'none') }}>
              {(d.isGuest || d.isPending) ? (
                <LockPage isPending={d.isPending} label="课表" onAuth={() => d.setIsAuthModalOpen(true)} />
              ) : (
                <ScheduleTab
                  courses={d.courses}
                  onAddCourse={() => d.setIsAddCourseOpen(true)}
                  onImportCourses={a.handleImportCourses}
                  onShareSchedule={a.handleShareSchedule}
                  onDeleteCourse={a.handleDeleteCourse}
                />
              )}
            </div>

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
                />
              )}
            </div>

            <div style={{ display: d.activeTab === 'circles' ? undefined : 'none' }}>
              <CircleTab
                showToast={d.showToast}
                isGuest={d.isGuest}
                onAuth={() => d.setIsAuthModalOpen(true)}
              />
            </div>

            <div style={{ display: d.activeTab === 'messages' ? undefined : 'none' }}>
              <MessagesTab
                messages={d.messages}
                onMarkRead={a.handleMarkMessageRead}
                onMarkAllRead={a.handleMarkAllRead}
              />
            </div>

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
          </div>
        )}

        {d.isSearchOpen && !d.selectedListing && (
          <div className="absolute inset-0 z-30 bg-white">
            <SearchPage
              listings={d.listings}
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
        unreadCount={d.unreadCount}
        setSelectedListing={() => d.setSelectedListing(null)}
      />

      <AuthModal
        isOpen={d.isAuthModalOpen}
        onClose={() => d.setIsAuthModalOpen(false)}
        onSubmit={a.handleAuth}
        initialValues={{
          fullName: '周鉦罡',
          studentId: '202330140113',
          department: '财税学院',
          orgLevel: '院级',
          position: '干事',
        }}
      />

      <AddCourseModal
        isOpen={d.isAddCourseOpen}
        onClose={() => d.setIsAddCourseOpen(false)}
        onSubmit={(e: any) => {
          e.preventDefault();
          a.handleAddCourse();
        }}
        form={d.courseForm}
        onChange={(updates: any) => d.setCourseForm((prev: any) => ({ ...prev, ...updates }))}
      />

      <ShareScheduleModal
        isOpen={d.isShareModalOpen}
        selectedWeek={16}
        courseCount={0}
        onClose={() => d.setIsShareModalOpen(false)}
      />
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
