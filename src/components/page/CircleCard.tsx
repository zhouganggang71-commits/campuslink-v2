/**
 * 校园圈帖子卡片 — React.memo 减少重渲染
 *
 * 两处小设计，让信息流不是每张卡片都长一个样：
 * 1. 热度够高的帖子右上角挂一条"热门"丝带 —— 内容本身的热度自然制造视觉差异，
 *    而不是人为给每个分类刷一遍颜色模板。
 * 2. 匿名树洞帖子背景带一点极淡的靛蓝渐变 + 引号装饰，呼应"深夜心事"的语境，
 *    只用在树洞这一个场景，不是系统化铺开的配色规则。
 */
import { memo, useState } from 'react';
import Icon from '../ui/Icon';
import GenderBadge from '../ui/GenderBadge';
import { timeAgo } from '../../utils/time';
import type { CirclePost } from '../../hooks/useCircles';

interface CircleCardProps {
  post: CirclePost;
  onLike: (postId: number) => void;
  onSave: (postId: number) => void;
  onDetail: (post: CirclePost) => void;
  isSaved: boolean;
  isLiked?: boolean;
  onViewProfile?: (userId: number, placeholder: any) => void;
}

const CIRCLE_LABELS: Record<string, string> = {
  trending: '今天发生', study: '学业互助', sports: '约球约饭',
  hobby: '兴趣社团', treehole: '匿名树洞', career: '毕业就业',
  exam: '考证考试', food: '美食探店', upgrade: '专升本',
};

const HOT_THRESHOLD = 8;

function CircleCardInner({ post, onLike, onSave, onDetail, isSaved, isLiked, onViewProfile }: CircleCardProps) {
  const [justLiked, setJustLiked] = useState(false);
  const displayName = post.is_anonymous ? '匿名同学' : (post.nickname || '同学');
  const showVerified = !post.is_anonymous && post.auth_status === 'verified';
  const canViewProfile = !post.is_anonymous && !!onViewProfile && (post.user_id || 0) > 0;
  const images = Array.isArray(post.images) ? post.images : [];
  const tags = Array.isArray(post.tags) ? post.tags : [];
  const isTreehole = post.circle_id === 'treehole' && post.is_anonymous;
  const isHot = post.hot_score >= HOT_THRESHOLD;

  return (
    <div
      onClick={() => onDetail(post)}
      className={`relative overflow-hidden card-float card-float-interactive rounded-2xl p-3.5 ${
        isTreehole ? 'bg-gradient-to-br from-indigo-50 via-white to-white dark:from-indigo-500/10 dark:via-transparent dark:to-transparent' : ''
      }`}
    >
      {isHot && (
        <span className="absolute top-0 right-0 flex items-center gap-0.5 text-[9px] font-bold text-white bg-gradient-to-r from-course-orange to-amber-400 px-2.5 py-1 rounded-bl-xl">
          <Icon name="local_fire_department" className="text-[10px]" />
          热门
        </span>
      )}
      {/* 用户信息行 */}
      <div className="flex items-center gap-2 mb-3">
        <div
          className={`flex items-center gap-2 flex-1 min-w-0 ${canViewProfile ? 'cursor-pointer' : ''}`}
          onClick={canViewProfile ? (e) => {
            e.stopPropagation();
            onViewProfile!(post.user_id || 0, {
              name: post.nickname || '',
              avatar: '',
              isVerified: post.auth_status === 'verified',
            });
          } : undefined}
        >
          <div className="w-8 h-8 rounded-full bg-primary/8 flex items-center justify-center text-primary/70 shrink-0 overflow-hidden">
            {post.avatar_url ? (
              <img src={post.avatar_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <Icon name="person" className="text-sm" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-on-surface">{displayName}</span>
              <GenderBadge gender={post.gender} />
              {showVerified && (
                <Icon name="verified" className="text-[10px] text-course-green" />
              )}
            </div>
            <span className="text-[10px] text-on-surface-variant/70">{timeAgo(post.created_at)}</span>
          </div>
        </div>
        {post.is_anonymous ? (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-on-surface-variant/70 shrink-0">匿名</span>
        ) : null}
      </div>

      {/* 内容 */}
      <p className="text-sm text-on-surface leading-relaxed mb-2.5">
        {isTreehole && <span className="text-indigo-300 font-serif text-base mr-0.5 align-top">"</span>}
        {post.content}
      </p>

      {/* 图片 */}
      {images.length > 0 && (
        <div className="flex gap-1.5 mb-3 overflow-x-auto hide-scrollbar">
          {images.slice(0, 3).map((url, i) => (
            <div key={i} className="w-14 h-14 rounded-xl overflow-hidden bg-slate-100 shrink-0">
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
      <div className="flex items-center justify-between text-[10px] pt-2.5 mt-0.5 border-t border-outline-variant/60">
        <span className="text-on-surface-variant/70 flex items-center gap-1">
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
            className={`flex items-center gap-1 transition-colors cursor-pointer ${isSaved ? 'text-course-yellow' : 'text-on-surface-variant/60 hover:text-course-yellow'}`}
          >
            <Icon name="bookmark" className="text-xs" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!isLiked) setJustLiked(true);
              onLike(post.id);
            }}
            aria-pressed={isLiked}
            className={`flex items-center gap-1 transition-colors cursor-pointer ${isLiked ? 'text-course-red' : 'text-on-surface-variant/60 hover:text-course-red'}`}
          >
            <span
              className={`inline-flex ${justLiked ? 'animate-heart-pop' : ''}`}
              onAnimationEnd={() => setJustLiked(false)}
            >
              <Icon name="favorite" className="text-xs" />
            </span>
            {post.like_count > 0 && <span>{post.like_count}</span>}
          </button>
          <span className="flex items-center gap-1 text-on-surface-variant/40">
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
