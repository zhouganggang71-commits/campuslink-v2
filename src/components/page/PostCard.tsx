/**
 * 帖子卡片 — 首页帖子流列表项，独立组件 + React.memo 减少重渲染
 */
import { memo } from 'react';
import { Listing } from '../../types';
import Icon from '../ui/Icon';

interface PostCardProps {
  listing: Listing;
  postTypeLabel: (pt: string) => string;
  onClick: () => void;
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  return ts?.substring(0, 10) || '';
}

function PostCardInner({ listing, postTypeLabel, onClick }: PostCardProps) {
  return (
    <div
      onClick={onClick}
      className="bg-white border border-gray-50 rounded-xl p-3.5 cursor-pointer hover:shadow-sm transition-all active:scale-[0.99]"
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">
          {postTypeLabel(listing.postType)}
        </span>
        {listing.isOfficialOrg && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
            官方
          </span>
        )}
        {listing.price && <span className="text-course-red font-bold ml-auto">¥{listing.price}</span>}
      </div>
      <h3 className="text-sm font-semibold text-on-surface truncate">{listing.title}</h3>
      <p className="text-xs text-on-surface-variant mt-1 line-clamp-2 leading-relaxed">{listing.description}</p>
      <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
        <span>{listing.publisherName}</span>
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
