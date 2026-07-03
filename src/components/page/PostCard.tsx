/**
 * 帖子卡片 — 首页帖子流列表项，独立组件 + React.memo 减少重渲染
 *
 * 设计说明：首页内容以纯文字信息为主（二手/失物招领/拼车/兼职等），带图帖子占比低。
 * 因此不做瀑布流/大图卡片（图片空缺率高会导致视觉不均衡），也不给无图帖子加占位图标
 * （多余的视觉噪音）；只用左侧色条 + 分类色标签统一视觉语言，一眼分辨类型，
 * 有图帖子照常显示缩略图，无图帖子保持纯文字的轻量感。
 */
import { memo } from 'react';
import { Listing } from '../../types';
import { timeAgo } from '../../utils/time';
import Icon from '../ui/Icon';
import GenderBadge from '../ui/GenderBadge';
import { getCategoryStyle } from '../../utils/postCategory';

interface PostCardProps {
  listing: Listing;
  postTypeLabel: (pt: string) => string;
  onClick: () => void;
  isSaved?: boolean;
  /** 点击发帖人头像/名字 → 打开个人主页；不传则名字不可点 */
  onViewProfile?: () => void;
}

function PostCardInner({ listing, postTypeLabel, onClick, isSaved, onViewProfile }: PostCardProps) {
  const hasImage = listing.imageUrls && listing.imageUrls.length > 0 && listing.imageUrls[0];
  const style = getCategoryStyle(listing.postType);
  return (
    <div
      onClick={onClick}
      className="relative overflow-hidden card-float card-float-interactive rounded-2xl p-3.5 flex flex-col gap-2"
    >
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${style.bar}`} aria-hidden="true" />

      {/* 顶部行：图片与标签/标题顶部对齐（图片高度和这一行内容高度接近，不会互相脱节） */}
      <div className="flex items-start gap-3">
        {hasImage && (
          <div className="w-14 h-14 rounded-xl bg-slate-100 shrink-0 overflow-hidden">
            <img
              src={listing.imageUrls[0]}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>
              {postTypeLabel(listing.postType)}
            </span>
            {listing.isOfficialOrg && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                官方
              </span>
            )}
            {listing.price && <span className="text-course-red font-bold ml-auto shrink-0">¥{listing.price}</span>}
          </div>
          <h3 className="text-[15px] font-bold text-on-surface truncate flex items-center gap-1">
            {isSaved && <Icon name="bookmark" className="text-amber-500 text-xs shrink-0" />}
            {listing.title}
          </h3>
        </div>
      </div>

      {/* 简介/底部信息统一顶格、占满卡片宽度 —— 有图无图的帖子这一段左边缘完全一致 */}
      <p className="text-xs text-on-surface-variant line-clamp-2 leading-relaxed">{listing.description}</p>
      <div className="flex items-center gap-3 text-[10px] text-on-surface-variant/70 flex-wrap">
        {onViewProfile ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onViewProfile(); }}
            className="flex items-center gap-1 max-w-[45%] min-w-0 hover:text-primary transition-colors"
          >
            {listing.publisherAvatar ? (
              <img
                src={listing.publisherAvatar}
                alt=""
                className="w-4 h-4 rounded-full object-cover shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <Icon name="person" className="text-[11px] shrink-0" />
            )}
            <span className="truncate">{listing.publisherName}</span>
            <GenderBadge gender={listing.publisherGender} />
          </button>
        ) : (
          <span className="flex items-center gap-1">
            {listing.publisherName}
            <GenderBadge gender={listing.publisherGender} />
          </span>
        )}
        <span>{timeAgo(listing.publishedTimeText)}</span>
        <span className="flex items-center gap-0.5">
          <Icon name="visibility" className="text-[11px]" />
          {listing.views}
        </span>
        {listing.favorites > 0 && (
          <span className="flex items-center gap-0.5 text-course-red/70">
            <Icon name="favorite" className="text-[10px]" />
            {listing.favorites}
          </span>
        )}
      </div>
    </div>
  );
}

const PostCard = memo(PostCardInner);
export default PostCard;
