/**
 * 首页"新生必看"横滑宫格（R12 Phase 1，对标竞品链千校新生必看 15 项）
 *
 * 视觉对齐 CampusLink：cover 小图卡片（rounded-xl + 柔和底）+ 标题，
 * 横滑 hide-scrollbar snap-x（HomeTab 活动海报同款手势）。无内容时不渲染。
 */
import { Content } from '../../types';
import Icon from '../ui/Icon';

interface Props {
  items: Content[];
  onOpen: (c: Content) => void;
  onViewAll: () => void;
}

export default function NewcomerGrid({ items, onOpen, onViewAll }: Props) {
  if (!items.length) return null;

  return (
    <div>
      <div className="flex items-center justify-between px-1 mb-2">
        <span className="text-sm font-bold">新生必看</span>
        <button
          onClick={onViewAll}
          className="text-xs text-on-surface-variant flex items-center gap-0.5 cursor-pointer hover:text-on-surface transition-colors"
        >
          查看全部
          <Icon name="chevron_right" className="text-sm" />
        </button>
      </div>
      <div className="flex gap-3 overflow-x-auto hide-scrollbar snap-x snap-mandatory -mx-4 px-4">
        {items.map((c) => (
          <button
            key={c.id}
            onClick={() => onOpen(c)}
            className="shrink-0 w-24 snap-start text-left cursor-pointer transition-transform active:scale-[0.96]"
          >
            <div className="w-24 h-16 rounded-xl overflow-hidden bg-on-surface/5 relative">
              {c.coverUrl ? (
                <img src={c.coverUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-on-surface-variant/40">
                  <Icon name="post_add" className="text-lg" />
                </div>
              )}
            </div>
            <div className="text-[11px] leading-tight line-clamp-2 mt-1">{c.title}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
