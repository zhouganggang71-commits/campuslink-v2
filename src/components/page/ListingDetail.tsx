import { useState, lazy, Suspense, useRef, useCallback } from 'react';
import { Listing } from '../../types';
import Icon from '../ui/Icon';

const RegisterPanel = lazy(() => import('./RegisterPanel'));
const ProfilePage = lazy(() => import('./ProfilePage'));

const REPORT_REASONS = ['虚假信息', '诈骗钓鱼', '色情低俗', '违禁品', '人身攻击', '其他违规'];

interface ListingDetailProps {
  listing: Listing;
  carouselIndex: number;
  setCarouselIndex: (idx: number) => void;
  savedListingIds: string[];
  toggleSaveListing: (id: string) => void;
  onCopyContact: (contactInfo: string) => void;
  onReport: (id: string, reason: string) => void;
  postTypeLabel: (pt: string) => string;
  currentUserName: string;
  onDelete: (id: string) => void;
  currentProfile?: { fullName: string; studentId: string; department: string };
  isGuest?: boolean;
}

export default function ListingDetail({
  listing,
  carouselIndex,
  setCarouselIndex,
  savedListingIds,
  toggleSaveListing,
  onCopyContact,
  onReport,
  postTypeLabel,
  currentUserName,
  onDelete,
  currentProfile,
  isGuest,
}: ListingDetailProps) {
  const isSaved = savedListingIds.includes(listing.id);
  const isReal = /^\d+$/.test(listing.id); // 真实帖子 ID 为纯数字，mock 数据 ID 如 headphones-1 非数字
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const isOwn = listing.publisherName === currentUserName;

  // ── 手势滑动 ──
  const touchStartX = useRef(0);
  const [swiping, setSwiping] = useState(false);
  const [swipeDelta, setSwipeDelta] = useState(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    setSwiping(true);
    setSwipeDelta(0);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swiping) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    setSwipeDelta(dx);
  }, [swiping]);

  const handleTouchEnd = useCallback(() => {
    setSwiping(false);
    const threshold = 50;
    if (Math.abs(swipeDelta) > threshold) {
      if (swipeDelta > 0 && carouselIndex > 0) {
        setCarouselIndex(carouselIndex - 1);
      } else if (swipeDelta < 0 && carouselIndex < listing.imageUrls.length - 1) {
        setCarouselIndex(carouselIndex + 1);
      }
    }
    setSwipeDelta(0);
  }, [swipeDelta, carouselIndex, setCarouselIndex, listing.imageUrls.length]);

  // 跳转个人主页（overlay 方式避免卸载导致渲染异常）
  if (showProfile) {
    return (
      <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col overflow-y-auto">
        <Suspense fallback={<div className="flex items-center justify-center flex-1"><div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin mt-20" /></div>}>
          <ProfilePage
            userId={listing.publisherId}
            onBack={() => setShowProfile(false)}
            placeholder={{
              name: listing.publisherName,
              avatar: listing.publisherAvatar,
              isVerified: listing.isVerifiedStudent,
              department: listing.department,
              orgLevel: listing.publisherOrgLevel,
              orgName: listing.orgName,
              position: listing.publisherPosition,
            }}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 animate-fade-in">
      {listing.imageUrls.length > 0 && (
      <section
        className="relative w-full aspect-square bg-gray-100 overflow-hidden"
        onTouchStart={listing.imageUrls.length > 1 ? handleTouchStart : undefined}
        onTouchMove={listing.imageUrls.length > 1 ? handleTouchMove : undefined}
        onTouchEnd={listing.imageUrls.length > 1 ? handleTouchEnd : undefined}
      >
        <div
          className="w-full h-full flex transition-transform duration-300"
          style={{
            transform: swiping
              ? `translateX(calc(-${carouselIndex * 100}% + ${swipeDelta}px))`
              : `translateX(-${carouselIndex * 100}%)`,
          }}
        >
          {listing.imageUrls.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={listing.title}
                className="w-full h-full object-cover shrink-0 select-none"
                referrerPolicy="no-referrer"
              />
            ))}
        </div>
        {listing.imageUrls.length > 1 && (
          <>
            <button
              onClick={() => setCarouselIndex(carouselIndex > 0 ? carouselIndex - 1 : listing.imageUrls.length - 1)}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 backdrop-blur text-white flex items-center justify-center hover:bg-black/50 transition-colors"
            >
              <Icon name="chevron_left" className="text-sm" />
            </button>
            <button
              onClick={() => setCarouselIndex(carouselIndex < listing.imageUrls.length - 1 ? carouselIndex + 1 : 0)}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 backdrop-blur text-white flex items-center justify-center hover:bg-black/50 transition-colors"
            >
              <Icon name="chevron_right" className="text-sm" />
            </button>
          </>
        )}
        {listing.imageUrls.length > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
            {listing.imageUrls.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCarouselIndex(idx)}
                className={`w-2.5 h-2.5 rounded-full transition-all cursor-pointer ${carouselIndex === idx ? 'bg-white scale-110' : 'bg-white/50'}`}
              />
            ))}
          </div>
        )}
      </section>
      )}

      <section className="p-4 bg-white border-b border-gray-100">
        <div className="flex items-center gap-2 mb-2">
          <span className="bg-primary/10 text-primary text-xs font-semibold px-2 py-0.5 rounded-full">
            {postTypeLabel(listing.postType)}
          </span>
          {listing.isOfficialOrg && (
            <span className="bg-course-blue text-white text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
              <Icon name="verified" className="text-xs" />
              {listing.orgName || '官方'}
            </span>
          )}
          {listing.status === 'sold' && (
            <span className="bg-gray-400 text-white text-xs font-semibold px-2 py-0.5 rounded-full">已售</span>
          )}
          {listing.status === 'closed' && (
            <span className="bg-gray-400 text-white text-xs font-semibold px-2 py-0.5 rounded-full">已关闭</span>
          )}
          {listing.status === 'pending' && (
            <span className="bg-course-yellow/20 text-yellow-700 text-xs font-semibold px-2 py-0.5 rounded-full">
              审核中
            </span>
          )}
          {listing.department && (
            <span className="bg-gray-100 text-gray-500 text-xs font-semibold px-2 py-0.5 rounded-full">
              {listing.department}
            </span>
          )}
          {!isOwn && listing.status === 'active' && !isGuest && (
            <button
              onClick={() => setIsReportOpen(!isReportOpen)}
              className="ml-auto text-[10px] text-gray-400 hover:text-course-red flex items-center gap-1 cursor-pointer"
            >
              <Icon name="campaign" className="text-xs" />
              举报
            </button>
          )}
        </div>
        {isReportOpen && !isOwn && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-3 animate-fade-in">
            <p className="text-xs font-bold text-gray-700 mb-2">请选择举报原因</p>
            <div className="flex flex-wrap gap-1.5">
              {REPORT_REASONS.map((reason) => (
                <button
                  key={reason}
                  onClick={() => {
                    onReport(listing.id, reason);
                    setIsReportOpen(false);
                  }}
                  className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-white border border-red-200 text-red-600 hover:bg-red-100 cursor-pointer"
                >
                  {reason}
                </button>
              ))}
            </div>
          </div>
        )}
        <h1 className="font-headline text-lg font-bold text-on-surface tracking-tight leading-snug mb-3">
          {listing.title}
        </h1>
        {listing.postType === 'sell' && listing.price !== undefined && (
          <div className="flex items-baseline gap-3 mb-4">
            <span className="font-headline text-2xl font-bold text-course-red">¥ {listing.price}</span>
            {listing.originalPrice && (
              <span className="text-xs text-gray-400 line-through">原价 ¥ {listing.originalPrice}</span>
            )}
          </div>
        )}
        <p className="text-sm text-gray-600 leading-relaxed bg-slate-50 rounded-xl p-3">{listing.description}</p>
        {listing.contactInfo && (
          <div className="mt-3 bg-blue-50 rounded-xl p-3 flex items-center gap-2">
            <Icon name="contact_phone" className="text-course-blue" />
            <span className="text-sm text-course-blue font-semibold">{listing.contactInfo}</span>
          </div>
        )}
      </section>

      <section className="p-4 bg-white flex flex-col gap-4">
        <div
          className="flex items-center justify-between"
          onClick={() => setShowProfile(true)}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer touch-manipulation select-none">
            <img
              src={listing.publisherAvatar}
              alt={listing.publisherName}
              className="w-10 h-10 rounded-full object-cover border border-slate-100 shadow-sm shrink-0 bg-slate-100"
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-headline font-semibold text-sm">{listing.publisherName}</span>
                {listing.isVerifiedStudent && (
                  <span className="bg-course-green text-white text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-0.5 shrink-0">
                    <Icon name="verified" className="text-[10px]" />
                    已认证
                  </span>
                )}
              </div>
              <span className="text-[11px] text-gray-400">{listing.publishedTimeText}</span>
            </div>
            <Icon name="chevron_right" className="text-gray-300 text-sm shrink-0" />
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 pt-4">
          <div className="flex gap-2">
            <span className="bg-slate-100 text-gray-600 text-[11px] font-semibold px-3 py-1 rounded-full">
              {listing.category}
            </span>
            <span className="bg-slate-100 text-gray-600 text-[11px] font-semibold px-3 py-1 rounded-full">
              校内当面交易
            </span>
          </div>
          <div className="flex gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <Icon name="visibility" className="text-sm" />
              {listing.views}
            </span>
            <span className="flex items-center gap-1">
              {isSaved && <Icon name="favorite" className="text-sm text-course-red" />}
            </span>
          </div>
        </div>
      </section>

      <div className="sticky bottom-0 left-0 w-full bg-white border-t border-gray-100 px-4 py-3 flex items-center justify-between gap-4 shadow-[0px_-4px_12px_rgba(0,0,0,0.05)] z-30">
        {!isReal ? (
          <div className="flex flex-col items-center justify-center min-w-[50px] text-gray-300">
            <Icon name="favorite_border" className="text-2xl" />
            <span className="text-[10px] font-medium mt-0.5">收藏</span>
          </div>
        ) : isGuest ? (
          <div className="flex flex-col items-center justify-center min-w-[50px] text-gray-300">
            <Icon name="favorite_border" className="text-2xl" />
            <span className="text-[10px] font-medium mt-0.5">收藏</span>
          </div>
        ) : (
          <button
            onClick={() => toggleSaveListing(listing.id)}
            className="flex flex-col items-center justify-center min-w-[50px] text-gray-400 hover:text-primary transition-colors cursor-pointer"
          >
            <Icon
              name={isSaved ? 'favorite' : 'favorite_border'}
              className={`text-2xl ${isSaved ? 'text-course-red' : ''}`}
            />
            <span className="text-[10px] font-medium mt-0.5">{isSaved ? '已收藏' : '收藏'}</span>
          </button>
        )}
        {!isOwn && listing.postType === 'activity' && !isGuest && (
          <Suspense fallback={null}>
            <RegisterPanel
              listing={listing}
              profile={currentProfile || { fullName: '', studentId: '', department: '' }}
            />
          </Suspense>
        )}
        {isOwn ? (
          <button
            onClick={() => {
              onDelete(listing.id);
            }}
            className="flex-1 bg-course-red text-white font-headline text-sm py-2.5 rounded-lg active:scale-95 transition-all flex items-center justify-center gap-2 font-semibold cursor-pointer shadow-sm"
          >
            <Icon name="delete" className="text-lg" />
            删除
          </button>
        ) : listing.contactInfo ? (
          <button
            onClick={() => onCopyContact(listing.contactInfo!)}
            className="flex-1 bg-primary text-white font-headline text-sm py-2.5 rounded-lg active:scale-95 transition-all flex items-center justify-center gap-2 font-semibold cursor-pointer shadow-lg"
          >
            <Icon name="content_copy" className="text-lg" />
            复制联系方式
          </button>
        ) : (
          <div className="flex-1 text-center text-sm text-gray-400 font-semibold py-2.5 bg-gray-50 rounded-lg">
            未留联系方式
          </div>
        )}
      </div>
    </div>
  );
}
