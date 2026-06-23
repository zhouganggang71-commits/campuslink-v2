import { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import Icon from '../ui/Icon';
import Modal from '../ui/Modal';

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

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: number;
  /** 从 listing 中已知的信息，作为加载前的占位 */
  placeholder?: {
    name: string;
    avatar: string;
    isVerified: boolean;
    department?: string;
    orgLevel?: string;
    orgName?: string;
    position?: string;
  };
}

export default function UserProfileModal({ isOpen, onClose, userId, placeholder }: UserProfileModalProps) {
  const [profile, setProfile] = useState<UserPublicProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || !userId) return;
    setLoading(true);
    setError('');
    api.get<UserPublicProfile>(`/users/${userId}/public-profile`)
      .then((res) => {
        if (res.code === 0 && res.data) {
          setProfile(res.data);
        } else {
          setError(res.message || '获取用户信息失败');
        }
      })
      .catch(() => setError('网络错误，请重试'))
      .finally(() => setLoading(false));
  }, [isOpen, userId]);

  // 兜底用 placeholder 显示基本信息
  const displayName = profile?.nickname || placeholder?.name || '未知用户';
  const displayAvatar = profile?.avatarUrl || placeholder?.avatar || '';
  const displayBio = profile?.bio || '';
  const displayDepartment = profile?.department || placeholder?.department || '';
  const displayOrgLevel = profile?.orgLevel || placeholder?.orgLevel || '';
  const displayOrgName = profile?.orgName || placeholder?.orgName || '';
  const displayPosition = profile?.position || placeholder?.position || '';
  const displayVerified = profile?.isVerified ?? placeholder?.isVerified ?? false;
  const displayPosts = profile?.activePosts ?? 0;
  const displayJoined = profile?.joinedAt || '';

  // 基于 userId 选封面渐变色
  const coverGradients = [
    'from-primary/80 via-primary to-primary/60',
    'from-sky-400 via-indigo-500 to-purple-500',
    'from-emerald-400 via-teal-500 to-cyan-500',
    'from-rose-400 via-pink-500 to-orange-400',
  ];
  const gradient = coverGradients[Math.abs(userId) % coverGradients.length];

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" showCloseButton={false}>
      <div className="flex flex-col items-center text-center">
        {/* 封面渐变 */}
        <div className={`w-full h-28 rounded-xl bg-gradient-to-br ${gradient} relative overflow-hidden -mx-1 -mt-1`}>
          <div className="absolute top-3 right-6 w-16 h-16 rounded-full bg-white/10" />
          <div className="absolute -bottom-4 -left-4 w-20 h-20 rounded-full bg-white/5" />
        </div>

        {/* 头像 — 覆盖封面底部 */}
        <div className="flex justify-center -mt-12 relative z-10">
          <div className={`w-20 h-20 rounded-full overflow-hidden border-4 shadow-lg shrink-0 bg-slate-100 ${
            displayVerified ? 'border-primary/20' : 'border-white'
          }`}>
            {displayAvatar ? (
              <img src={displayAvatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300 bg-gradient-to-br from-slate-100 to-slate-200">
                <Icon name="person" className="text-3xl" />
              </div>
            )}
          </div>
        </div>

        {/* 加载状态 */}
        {loading && (
          <div className="py-6">
            <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto" />
            <p className="text-xs text-gray-400 mt-2">加载中...</p>
          </div>
        )}

        {/* 错误 */}
        {error && !loading && (
          <div className="py-6 text-center">
            <Icon name="error" className="text-3xl text-gray-300 mb-2" />
            <p className="text-xs text-gray-400">{error}</p>
          </div>
        )}

        {/* 用户信息 */}
        {!loading && !error && (
          <>
            <div className="mt-2 pt-2 px-4 w-full">
              {/* 姓名 + 认证 */}
              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                <h2 className="font-headline text-base font-bold text-on-surface">{displayName}</h2>
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
                  <>
                    <span className="text-gray-300">·</span>
                    <span className="text-[11px] text-gray-500">{displayOrgName}</span>
                  </>
                )}
              </div>

              {/* 签名 */}
              {displayBio ? (
                <p className="mt-2.5 text-xs text-gray-500 bg-slate-50 rounded-full px-3 py-1.5 inline-block">
                  {displayBio}
                </p>
              ) : (
                <p className="mt-2.5 text-xs text-gray-300 italic">这个人很懒，什么都没写</p>
              )}

              {/* 统计数据 */}
              <div className="flex justify-center gap-8 mt-4 pt-3 border-t border-gray-100">
                <div className="flex flex-col items-center">
                  <span className="font-headline text-lg font-bold text-gray-700">{displayPosts}</span>
                  <span className="text-[10px] text-gray-400 font-medium">活跃帖子</span>
                </div>
                {displayJoined && (
                  <div className="flex flex-col items-center">
                    <span className="font-headline text-lg font-bold text-gray-700">{displayJoined}</span>
                    <span className="text-[10px] text-gray-400 font-medium">加入时间</span>
                  </div>
                )}
              </div>
            </div>

            {/* 关闭按钮 */}
            <button
              onClick={onClose}
              className="mt-4 mb-1 text-xs font-semibold text-gray-400 hover:text-gray-600 bg-slate-100 hover:bg-slate-200 rounded-lg px-6 py-2 cursor-pointer transition-colors"
            >
              关闭
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
