import { useState, lazy, Suspense, useRef, useCallback, useEffect } from 'react';
import { Listing } from '../../types';
import Icon from '../ui/Icon';
import ReportModal from '../modal/ReportModal';
import { transactionsApi } from '../../api';
import { request } from '../../api/client';

const RegisterPanel = lazy(() => import('./RegisterPanel'));

interface ListingDetailProps {
  listing: Listing;
  carouselIndex: number;
  setCarouselIndex: (idx: number) => void;
  savedListingIds: string[];
  toggleSaveListing: (id: string) => void;
  onCopyContact: (contactInfo: string) => void;
  postTypeLabel: (pt: string) => string;
  currentUserName: string;
  onDelete: (id: string) => void;
  currentProfile?: { fullName: string; studentId: string; department: string };
  isGuest?: boolean;
  onStartChat?: (userId: number) => void;
  onViewProfile?: (userId: number, placeholder: any) => void;
  /** 发起面交交易（R12 Phase 2）：返回是否成功 */
  onStartTransaction?: (postId: number) => Promise<boolean>;
}

export default function ListingDetail({
  listing,
  carouselIndex,
  setCarouselIndex,
  savedListingIds,
  toggleSaveListing,
  onCopyContact,
  postTypeLabel,
  currentUserName,
  onDelete,
  currentProfile,
  isGuest,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onStartChat,
  onViewProfile,
  onStartTransaction,
}: ListingDetailProps) {
  const isSaved = savedListingIds.includes(listing.id);
  const isReal = /^\d+$/.test(listing.id); // 真实帖子 ID 为纯数字，mock 数据 ID 如 headphones-1 非数字
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [txBusy, setTxBusy] = useState(false);
  const [sellerRep, setSellerRep] = useState<{ score: number; count: number } | null>(null);
  const [txStatus, setTxStatus] = useState<{ active: boolean; status?: string; myRole?: string } | null>(null);
  const isOwn = listing.publisherName === currentUserName;

  // 帖子交易状态（登录且真实帖子时查询，显示"交易中"）
  useEffect(() => {
    if (!isReal || isGuest) return;
    let cancelled = false;
    request('GET', `/api/v1/transactions/post/${listing.id}`)
      .then((r: any) => {
        if (!cancelled && r.code === 0) setTxStatus(r.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isReal, isGuest, listing.id]);

  // 卖家信誉（公开接口，仅真实用户且有 publisherId 时拉取）
  useEffect(() => {
    if (!isReal || !listing.publisherId || listing.publisherId <= 0) return;
    let cancelled = false;
    transactionsApi
      .reputation(listing.publisherId)
      .then((r) => {
        if (!cancelled && r.code === 0 && r.data && r.data.reviewCount > 0) {
          setSellerRep({ score: r.data.reputationScore, count: r.data.reviewCount });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isReal, listing.publisherId]);

  const handleStartTx = () => {
    if (!listing.publisherId || txBusy || !onStartTransaction) return;
    setTxBusy(true);
    onStartTransaction(Number(listing.id))
      .then((ok) => {
        if (ok) setTxBusy(true);
      })
      .finally(() => setTxBusy(false));
  };

  // 帖子处于面交交易中（含进行中/已完成，非 cancelled）
  const txInProgress = txStatus?.active === true;

  // 是否展示面交购买按钮：真实帖子 + 非本人 + sell 类型
  const canFaceTrade =
    isReal &&
    !isOwn &&
    !isGuest &&
    !txInProgress &&
    listing.postType === 'sell' &&
    listing.status === 'active' &&
    !!onStartTransaction;

  // ── 手势滑动 ──
  const touchStartX = useRef(0);
  const [swiping, setSwiping] = useState(false);
  const [swipeDelta, setSwipeDelta] = useState(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    setSwiping(true);
    setSwipeDelta(0);
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!swiping) return;
      const dx = e.touches[0].clientX - touchStartX.current;
      setSwipeDelta(dx);
    },
    [swiping],
  );

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
          {txInProgress && !isOwn && (
            <span className="bg-course-orange/10 text-course-orange text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
              <Icon name="handshake" className="text-[10px]" />
              交易中
            </span>
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
              onClick={() => setIsReportOpen(true)}
              className="ml-auto text-[10px] font-semibold text-course-red bg-course-red/5 hover:bg-course-red/10 flex items-center gap-1 px-2 py-1 rounded-full cursor-pointer transition-colors"
            >
              <Icon name="flag" className="text-xs" />
              举报
            </button>
          )}
        </div>
        {isReal && (
          <ReportModal
            isOpen={isReportOpen}
            onClose={() => setIsReportOpen(false)}
            targetType="post"
            targetId={parseInt(listing.id, 10)}
          />
        )}
        <h1 className="font-headline text-lg font-bold text-on-surface tracking-tight leading-snug mb-3">
          {listing.title}
        </h1>
        {listing.postType === 'sell' && listing.price != null && listing.price > 0 && (
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
          onClick={
            listing.publisherId > 0
              ? () =>
                  onViewProfile?.(listing.publisherId, {
                    name: listing.publisherName,
                    avatar: listing.publisherAvatar,
                    isVerified: listing.isVerifiedStudent,
                    department: listing.department,
                    orgLevel: listing.publisherOrgLevel,
                    orgName: listing.orgName,
                    position: listing.publisherPosition,
                  })
              : undefined
          }
        >
          <div
            className={`flex items-center gap-3 flex-1 min-w-0 touch-manipulation select-none ${listing.publisherId > 0 ? 'cursor-pointer' : ''}`}
          >
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
                {sellerRep && (
                  <span className="bg-course-gold/10 text-course-gold text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-0.5 shrink-0">
                    <Icon name="favorite" className="text-[10px]" />
                    {sellerRep.score.toFixed(1)} · {sellerRep.count}人评价
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
        ) : canFaceTrade ? (
          <div className="flex-1 flex gap-2">
            <button
              onClick={handleStartTx}
              disabled={txBusy}
              className="flex-1 bg-primary text-white font-headline text-sm py-2.5 rounded-lg active:scale-95 transition-all flex items-center justify-center gap-2 font-semibold cursor-pointer shadow-lg disabled:opacity-60"
            >
              <Icon name="handshake" className="text-lg" />
              {txBusy ? '发起中…' : '面交购买'}
            </button>
            {listing.contactInfo && (
              <button
                onClick={() => onCopyContact(listing.contactInfo!)}
                className="bg-on-surface/5 text-on-surface text-sm py-2.5 px-4 rounded-lg active:scale-95 transition-all flex items-center justify-center gap-1.5 font-semibold cursor-pointer"
              >
                <Icon name="content_copy" className="text-base" />
                复制
              </button>
            )}
          </div>
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
