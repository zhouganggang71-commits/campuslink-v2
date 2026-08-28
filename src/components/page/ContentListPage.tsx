/**
 * 内容分类列表页（R12 Phase 1）— 覆盖层，对标竞品链千校"新生必看/校园介绍/服务宫格"列表
 *
 * 视觉对齐 CampusLink：card-float 柔和卡片（封面左缩略图 + 标题 + 摘要 + 浏览量），
 * 复用 PostCard 的 60px 左缩略图布局经验。
 */
import { Content } from '../../types';
import { CONTENT_CATEGORY_LABELS, SUB_CATEGORY_LABELS } from '../../constants/services';
import Icon from '../ui/Icon';

interface Props {
  category: string;
  subCategory?: string;
  items: Content[];
  onOpen: (c: Content) => void;
  onBack: () => void;
}

export default function ContentListPage({ category, subCategory, items, onOpen, onBack }: Props) {
  const title = subCategory
    ? `${CONTENT_CATEGORY_LABELS[category] || category} · ${SUB_CATEGORY_LABELS[subCategory] || subCategory}`
    : CONTENT_CATEGORY_LABELS[category] || category;
  const filtered = subCategory ? items.filter((c) => c.subCategory === subCategory) : items;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col animate-fade-in">
      {/* 顶栏 */}
      <div className="flex items-center gap-2 px-3 h-12 shrink-0">
        <button
          onClick={onBack}
          aria-label="返回"
          className="w-8 h-8 flex items-center justify-center cursor-pointer hover:bg-on-surface/5 rounded-full transition-colors"
        >
          <Icon name="arrow_back" className="text-lg" />
        </button>
        <span className="text-base font-bold line-clamp-1">{title}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {filtered.length === 0 ? (
          <div className="text-center text-on-surface-variant text-sm py-16">运营建设中，敬请期待</div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => onOpen(c)}
                className="card-float rounded-2xl p-3 flex gap-3 text-left cursor-pointer active:scale-[0.98] transition-transform"
              >
                {c.coverUrl && (
                  <img src={c.coverUrl} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" loading="lazy" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold line-clamp-2">{c.title}</div>
                  {c.summary && <div className="text-xs text-on-surface-variant line-clamp-1 mt-0.5">{c.summary}</div>}
                  <div className="text-[10px] text-on-surface-variant/60 mt-1 flex items-center gap-1">
                    <Icon name="visibility" className="text-xs" />
                    {c.viewCount}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
