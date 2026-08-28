import { useState, useEffect } from 'react';
import { Listing } from '../../types';
import { authApi, postsApi } from '../../api';
import { safeParseJsonArray } from '../../utils/time';
import Icon from '../ui/Icon';
import GenderBadge from '../ui/GenderBadge';

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
  onStartChat?: (userId: number) => void;
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
  gender?: 'male' | 'female' | null;
  coverUrl: string;
}

type ProfileTab = 'posts' | 'saved';

const COVER_GRADIENTS = [
  'from-indigo-500 via-purple-500 to-pink-500',
  'from-sky-400 via-blue-500 to-indigo-600',
  'from-emerald-400 via-teal-500 to-cyan-600',
  'from-rose-400 via-red-500 to-orange-500',
];

export default function ProfilePage({ userId, onBack, placeholder, onStartChat }: ProfilePageProps) {
  const [profile, setProfile] = useState<UserPublicProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [posts, setPosts] = useState<Listing[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');
  const [avatarError, setAvatarError] = useState(false);
  const [coverError, setCoverError] = useState(false);

  const gradient = COVER_GRADIENTS[Math.abs(userId || 1) % COVER_GRADIENTS.length];

  // 加载用户信息
  useEffect(() => {
    if (!userId) return;
    setProfileLoading(true);
    authApi
      .getPublicProfile(userId)
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
    postsApi
      .list({ userId, limit: 30 })
      .then((res) => {
        if (res.code === 0 && res.data?.list) {
          setPosts(
            res.data.list.map(
              (p: any) =>
                ({
                  id: String(p.id),
                  title: p.title,
                  price: p.price,
                  description: p.description,
                  imageUrls: safeParseJsonArray(p.image_urls),
                  category: p.category,
                  postType: p.post_type,
                  publisherId: p.user_id || userId,
                  publisherName: p.publisher_name || '',
                  publisherAvatar: p.publisher_avatar || '',
                  publisherGender: p.publisher_gender || null,
                  isVerifiedStudent: p.publisher_auth_status === 'verified',
                  isOfficialOrg: p.is_official,
                  publishedTimeText: p.created_at?.substring(0, 10) || '',
                  views: p.views || 0,
                  favorites: 0,
                  contactInfo: p.contact_info,
                  status: p.status || 'active',
                }) as Listing,
            ),
          );
        }
      })
      .catch(() => {})
      .finally(() => setPostsLoading(false));
  }, [userId, activeTab]);

  const displayName = profile?.nickname || placeholder.name || '未知用户';
  const displayAvatar = profile?.avatarUrl || placeholder.avatar || '';
  const displayDepartment = profile?.department || placeholder.department || '';
  const displayVerified = profile?.isVerified ?? placeholder.isVerified ?? false;
  const displayPosts = profile?.activePosts ?? posts.length;
  const displayJoined = profile?.joinedAt || '';

  return (
    <div className="flex flex-col animate-fade-in bg-slate-50">
      {/* ── 封面（仿微信朋友圈）── */}
      <div
        className={`h-48 relative flex-shrink-0 ${profile?.coverUrl && !coverError ? '' : `bg-gradient-to-br ${gradient}`}`}
      >
        {profile?.coverUrl && !coverError ? (
          <img
            src={profile.coverUrl}
            alt=""
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
            onError={() => setCoverError(true)}
          />
        ) : (
          <>
            <div className="absolute top-6 right-10 w-24 h-24 rounded-full bg-white/10" />
            <div className="absolute -bottom-6 -left-8 w-32 h-32 rounded-full bg-white/5" />
            <div className="absolute top-16 right-20 w-12 h-12 rounded-full bg-white/8" />
          </>
        )}
        <button
          onClick={onBack}
          className="absolute top-3 left-3 z-20 w-8 h-8 rounded-full bg-black/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/30 transition-colors"
        >
          <Icon name="arrow_back" className="text-sm" />
        </button>
        {/* 头像 — 左下角 */}
        <div className="absolute -bottom-10 left-5 z-10">
          <div
            className={`w-20 h-20 rounded-full overflow-hidden border-[3px] border-white shadow-xl bg-slate-100 ${
              displayVerified ? 'border-primary/20' : 'border-white'
            }`}
          >
            {displayAvatar && !avatarError ? (
              <img
                src={displayAvatar}
                alt=""
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
                onError={() => setAvatarError(true)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300 bg-gradient-to-br from-slate-100 to-slate-200">
                <Icon name="person" className="text-3xl" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 姓名 */}
      <div className="pt-12 pb-1 px-5 flex items-center gap-2">
        <h1 className="font-headline text-lg font-bold text-on-surface">{displayName}</h1>
        <GenderBadge gender={profile?.gender} />
        {displayVerified && (
          <span className="inline-flex items-center gap-0.5 bg-course-green/10 text-course-green px-1.5 py-0.5 rounded-full shrink-0">
            <Icon name="verified" className="text-[9px]" />
            <span className="text-[9px] font-bold">已认证</span>
          </span>
        )}
      </div>
      <div className="px-5 pb-2 flex items-center gap-2 text-[11px] text-gray-400 flex-wrap">
        {displayDepartment && <span>{displayDepartment}</span>}
        {displayDepartment && displayJoined && <span className="text-gray-300">·</span>}
        {displayJoined && <span>{displayJoined}</span>}
      </div>

      {/* 简介 */}
      {profile?.bio && (
        <div className="px-5 pb-1">
          <p className="text-xs text-gray-500 leading-relaxed">{profile.bio}</p>
        </div>
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

      {/* 发私信按钮 */}
      {onStartChat && (
        <button
          onClick={() => onStartChat(userId)}
          className="mt-4 px-6 py-2 bg-[#576b95] text-white text-sm font-semibold rounded-full active:scale-95 transition-transform"
        >
          发私信
        </button>
      )}

      {/* ── Tab + 内容 ── */}
      <div className="mt-5">
        {/* Tab 切换 */}
        <div className="flex border-b border-gray-100 bg-white sticky top-0 z-10">
          {[
            { key: 'posts' as const, label: '帖子' },
            { key: 'saved' as const, label: '收藏' },
          ].map((tab) => (
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
                  <PostGridItem key={post.id} post={post} />
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

function PostGridItem({ post }: { post: Listing }) {
  const [imgError, setImgError] = useState(false);
  const thumbUrl = post.imageUrls?.[0] || '';
  const showImg = !!(thumbUrl && thumbUrl.startsWith('http') && !imgError);

  return (
    <div className="aspect-square bg-slate-100 rounded-lg overflow-hidden relative group">
      {showImg ? (
        <img
          src={thumbUrl}
          alt={post.title}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="w-full h-full flex flex-col justify-between p-2 bg-gradient-to-br from-slate-50 to-slate-100">
          <span
            className={`text-[8px] font-semibold px-1 py-0.5 rounded self-start ${
              post.postType === 'sell'
                ? 'bg-course-red/10 text-course-red'
                : post.postType === 'activity'
                  ? 'bg-course-blue/10 text-course-blue'
                  : 'bg-slate-200 text-gray-500'
            }`}
          >
            {post.postType === 'sell'
              ? '二手'
              : post.postType === 'lost'
                ? '失物'
                : post.postType === 'found'
                  ? '招领'
                  : post.postType === 'activity'
                    ? '活动'
                    : post.postType === 'carpool'
                      ? '拼车'
                      : post.postType === 'job'
                        ? '兼职'
                        : post.postType === 'study'
                          ? '学习'
                          : '其他'}
          </span>
          <span className="text-[9px] text-gray-500 line-clamp-2 leading-tight">{post.title}</span>
          <span className="text-[8px] text-gray-400">
            {post.price ? `¥${post.price}` : post.views ? `${post.views}次浏览` : ''}
          </span>
        </div>
      )}
      {/* 遮罩层 */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-end p-1.5">
        <span className="text-white text-[9px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity line-clamp-2">
          {post.title}
        </span>
      </div>
      {/* 状态标签 */}
      {post.status !== 'active' && (
        <span className="absolute top-1 right-1 bg-black/50 text-white text-[8px] px-1 rounded">
          {post.status === 'sold' ? '已售' : post.status === 'closed' ? '已关闭' : post.status}
        </span>
      )}
    </div>
  );
}
