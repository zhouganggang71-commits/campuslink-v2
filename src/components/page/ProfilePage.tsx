import { useState, useEffect } from 'react';
import { Listing } from '../../types';
import { api } from '../../utils/api';
import Icon from '../ui/Icon';

interface ProfilePageProps {
  userId: number;
  onBack: () => void;
  /** 从 listing 已知的占位信息 */
  placeholder: {
    name: string;
    avatar: string;
    isVerified: boolean;
    department?: string;
    orgLevel?: string;
    orgName?: string;
    position?: string;
  };
}

interface UserPublicProfile {
  id: number;
  nickname: string;
  avatarUrl: string;
  bio: string;
  department: string;
  orgLevel: string;
  orgName: string;
  position: string;
  isVerified: boolean;
  activePosts: number;
  joinedAt: string;
}

type ProfileTab = 'posts' | 'saved';

const COVER_GRADIENTS = [
  'from-indigo-500 via-purple-500 to-pink-500',
  'from-sky-400 via-blue-500 to-indigo-600',
  'from-emerald-400 via-teal-500 to-cyan-600',
  'from-rose-400 via-red-500 to-orange-500',
];

export default function ProfilePage({ userId, onBack, placeholder }: ProfilePageProps) {
  const [profile, setProfile] = useState<UserPublicProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [posts, setPosts] = useState<Listing[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');

  const gradient = COVER_GRADIENTS[Math.abs(userId || 1) % COVER_GRADIENTS.length];

  // 加载用户信息
  useEffect(() => {
    if (!userId) return;
    setProfileLoading(true);
    api.get<UserPublicProfile>(`/users/${userId}/public-profile`)
      .then((res) => {
        if (res.code === 0 && res.data) setProfile(res.data);
      })
      .catch(() => {})
      .finally(() => setProfileLoading(false));
  }, [userId]);

  // 加载用户帖子（仅 posts tab）
  useEffect(() => {
    if (!userId || activeTab !== 'posts') {
      setPosts([]);
      return;
    }
    setPostsLoading(true);
    api.get<{ list: any[]; total: number }>(`/posts?userId=${userId}&limit=30`)
      .then((res) => {
        if (res.code === 0 && res.data?.list) {
          setPosts(res.data.list.map((p: any) => ({
            id: String(p.id),
            title: p.title,
            price: p.price,
            description: p.description,
            imageUrls: Array.isArray(p.image_urls) ? p.image_urls : (p.image_urls ? JSON.parse(p.image_urls) : []),
            category: p.category,
            postType: p.post_type,
            publisherId: p.user_id || userId,
            publisherName: p.publisher_name || '',
            publisherAvatar: p.publisher_avatar || '',
            isVerifiedStudent: p.publisher_auth_status === 'verified',
            isOfficialOrg: p.is_official,
            publishedTimeText: p.created_at?.substring(0, 10) || '',
            views: p.views || 0,
            favorites: 0,
            contactInfo: p.contact_info,
            status: p.status || 'active',
          } as Listing)));
        }
      })
      .catch(() => {})
      .finally(() => setPostsLoading(false));
  }, [userId, activeTab]);

  const displayName = profile?.nickname || placeholder.name || '未知用户';
  const displayAvatar = profile?.avatarUrl || placeholder.avatar || '';
  const displayBio = profile?.bio || '';
  const displayDepartment = profile?.department || placeholder.department || '';
  const displayOrgLevel = profile?.orgLevel || placeholder.orgLevel || '';
  const displayOrgName = profile?.orgName || placeholder.orgName || '';
  const displayPosition = profile?.position || placeholder.position || '';
  const displayVerified = profile?.isVerified ?? placeholder.isVerified ?? false;
  const displayPosts = profile?.activePosts ?? posts.length;
  const displayJoined = profile?.joinedAt || '';

  return (
    <div className="flex flex-col flex-1 animate-fade-in bg-slate-50 min-h-full">
      {/* ── 顶栏：返回按钮 ── */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-3 pt-3">
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-full bg-black/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/30 transition-colors"
        >
          <Icon name="arrow_back" className="text-sm" />
        </button>
        <span className="text-white text-xs font-semibold drop-shadow-sm">个人主页</span>
        <div className="w-8" />
      </div>

      {/* ── 封面 ── */}
      <div className={`h-44 bg-gradient-to-br ${gradient} relative overflow-hidden flex-shrink-0`}>
        {/* 装饰 */}
        <div className="absolute top-6 right-10 w-24 h-24 rounded-full bg-white/10" />
        <div className="absolute -bottom-6 -left-8 w-32 h-32 rounded-full bg-white/5" />
        <div className="absolute top-16 right-20 w-12 h-12 rounded-full bg-white/8" />
      </div>

      {/* ── 用户信息 ── */}
      <div className="flex flex-col items-center px-5 -mt-16 relative z-10">
        {/* 头像 */}
        <div className={`w-24 h-24 rounded-full overflow-hidden border-4 shadow-xl bg-slate-100 ${
          displayVerified ? 'border-primary/20' : 'border-white'
        }`}>
          {displayAvatar ? (
            <img src={displayAvatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300 bg-gradient-to-br from-slate-100 to-slate-200">
              <Icon name="person" className="text-4xl" />
            </div>
          )}
        </div>

        {/* 加载中 */}
        {profileLoading && (
          <div className="py-3">
            <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto" />
          </div>
        )}

        {/* 姓名 + 认证 */}
        <div className="flex items-center justify-center gap-1.5 mt-3 flex-wrap">
          <h1 className="font-headline text-lg font-bold text-on-surface">{displayName}</h1>
          {displayVerified && (
            <span className="inline-flex items-center gap-0.5 bg-course-green/10 text-course-green px-1.5 py-0.5 rounded-full shrink-0">
              <Icon name="verified" className="text-[9px]" />
              <span className="text-[9px] font-bold">已认证</span>
            </span>
          )}
        </div>

        {/* 部门 / 组织 */}
        <div className="flex items-center justify-center gap-1.5 mt-1.5 text-[11px] text-gray-400 flex-wrap">
          {displayDepartment && <span>{displayDepartment}</span>}
          {displayOrgLevel && displayPosition && (
            <>
              {displayDepartment && <span className="text-gray-300">·</span>}
              <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[9px] font-semibold">
                {displayOrgLevel}{displayPosition}
              </span>
            </>
          )}
          {displayOrgName && (
            <span className="text-[11px] text-gray-500">{displayOrgName}</span>
          )}
        </div>

        {/* 签名 */}
        {displayBio ? (
          <p className="mt-2 text-xs text-gray-500 max-w-xs text-center">{displayBio}</p>
        ) : (
          <p className="mt-2 text-xs text-gray-300 italic">这个人很懒，什么都没写</p>
        )}

        {/* 统计数据 */}
        <div className="flex justify-center gap-10 mt-4 w-full">
          <div className="flex flex-col items-center">
            <span className="font-headline text-xl font-bold text-on-surface">{displayPosts}</span>
            <span className="text-[10px] text-gray-400 font-medium">帖子</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="font-headline text-xl font-bold text-on-surface">{profileLoading ? '-' : '0'}</span>
            <span className="text-[10px] text-gray-400 font-medium">收藏</span>
          </div>
          {displayJoined && (
            <div className="flex flex-col items-center">
              <span className="font-headline text-xl font-bold text-on-surface">{displayJoined}</span>
              <span className="text-[10px] text-gray-400 font-medium">加入</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Tab + 内容 ── */}
      <div className="flex-1 mt-5">
        {/* Tab 切换 */}
        <div className="flex border-b border-gray-100 bg-white sticky top-0 z-10">
          {([
            { key: 'posts' as const, label: '帖子' },
            { key: 'saved' as const, label: '收藏' },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-3 text-xs font-semibold text-center cursor-pointer transition-colors relative ${
                activeTab === tab.key ? 'text-on-surface' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {tab.label}
              {activeTab === tab.key && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-on-surface rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* 帖子网格 */}
        {activeTab === 'posts' && (
          <div className="p-2">
            {postsLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
              </div>
            ) : posts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <Icon name="post_add" className="text-5xl mb-3 text-gray-200" />
                <p className="text-xs">暂无帖子</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {posts.map((post) => (
                  <div key={post.id} className="aspect-square bg-slate-100 rounded-lg overflow-hidden relative group">
                    {post.imageUrls.length > 0 ? (
                      <img src={post.imageUrls[0]} alt={post.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 p-2">
                        <Icon name="post_add" className="text-2xl mb-1" />
                        <span className="text-[9px] text-center line-clamp-2 text-gray-400">{post.title}</span>
                      </div>
                    )}
                    {/* 遮罩层 */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-end p-1.5">
                      <span className="text-white text-[9px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity line-clamp-2">{post.title}</span>
                    </div>
                    {/* 状态标签 */}
                    {post.status !== 'active' && (
                      <span className="absolute top-1 right-1 bg-black/50 text-white text-[8px] px-1 rounded">
                        {post.status === 'sold' ? '已售' : post.status === 'closed' ? '已关闭' : post.status}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 收藏 — 占位 */}
        {activeTab === 'saved' && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Icon name="lock" className="text-4xl mb-2 text-gray-200" />
            <p className="text-xs">收藏列表仅自己可见</p>
          </div>
        )}
      </div>
    </div>
  );
}
