/**
 * 校园圈帖子卡片 — React.memo 减少重渲染
 */
import { memo } from 'react';
import Icon from '../ui/Icon';
import type { CirclePost } from '../../hooks/useCircles';

interface CircleCardProps {
  post: CirclePost;
  onLike: (postId: number) => void;
  onSave: (postId: number) => void;
  onDetail: (post: CirclePost) => void;
  isSaved: boolean;
}

const CIRCLE_LABELS: Record<string, string> = {
  trending: '今天发生', study: '学业互助', sports: '约球约饭',
  hobby: '兴趣社团', treehole: '匿名树洞', career: '毕业就业',
};

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function CircleCardInner({ post, onLike, onSave, onDetail, isSaved }: CircleCardProps) {
  const displayName = post.is_anonymous ? '匿名同学' : (post.nickname || '同学');
  const showVerified = !post.is_anonymous && post.auth_status === 'verified';
  const images = Array.isArray(post.images) ? post.images : [];
  const tags = Array.isArray(post.tags) ? post.tags : [];

  return (
    <div
      onClick={() => onDetail(post)}
      className="bg-white rounded-xl p-3.5 cursor-pointer hover:bg-slate-50/50 active:bg-slate-50 transition-colors border border-gray-50"
    >
      {/* 用户信息行 */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-gray-400 shrink-0">
          <Icon name="person" className="text-sm" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-on-surface">{displayName}</span>
            {showVerified && (
              <Icon name="verified" className="text-[10px] text-course-green" />
            )}
          </div>
          <span className="text-[10px] text-gray-400">{timeAgo(post.created_at)}</span>
        </div>
        {post.is_anonymous ? (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-gray-400 shrink-0">匿名</span>
        ) : null}
      </div>

      {/* 内容 */}
      <p className="text-sm text-on-surface leading-relaxed mb-2.5">{post.content}</p>

      {/* 图片 */}
      {images.length > 0 && (
        <div className="flex gap-1.5 mb-3 overflow-x-auto hide-scrollbar">
          {images.slice(0, 3).map((url, i) => (
            <div key={i} className="w-14 h-14 rounded-lg overflow-hidden bg-slate-100 shrink-0">
              <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
            </div>
          ))}
        </div>
      )}

      {/* 话题标签 */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {tags.map((tag) => (
            <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/5 text-primary font-medium">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* 底栏 */}
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-gray-400 flex items-center gap-1">
          <Icon name="chat" className="text-[9px]" />
          {CIRCLE_LABELS[post.circle_id] || post.circle_id}
        </span>
        <div className="flex items-center gap-3">
          {post.hot_score > 0 && (
            <span className="flex items-center gap-0.5 text-course-orange font-semibold">
              <Icon name="trending_up" className="text-[10px]" />
              {post.hot_score}
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onSave(post.id); }}
            className={`flex items-center gap-1 transition-colors cursor-pointer ${isSaved ? 'text-course-yellow' : 'text-gray-400 hover:text-course-yellow'}`}
          >
            <Icon name="bookmark" className="text-xs" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onLike(post.id); }}
            className="flex items-center gap-1 text-gray-400 hover:text-course-red transition-colors cursor-pointer"
          >
            <Icon name="favorite" className="text-xs" />
            {post.like_count > 0 && <span>{post.like_count}</span>}
          </button>
          <span className="flex items-center gap-1 text-gray-300">
            <Icon name="chat" className="text-xs" />
            {post.comment_count > 0 && <span>{post.comment_count}</span>}
          </span>
        </div>
      </div>
    </div>
  );
}

const CircleCard = memo(CircleCardInner);
export default CircleCard;
