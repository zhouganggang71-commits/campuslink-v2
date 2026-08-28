/**
 * 首页运营 Banner 轮播（R12 Phase 1，对标竞品链千校首页 Banner）
 *
 * 视觉对齐 CampusLink 现有"活动海报"卡片风格（HomeTab.tsx 同款）：
 * 圆角 16 + 底部渐变压暗 + 标题叠图 + snap 横滑 + 指示点。
 * 无封面时用 course 色渐变兜底（色盘一致性，不是营销皮肤）。
 */
import { useEffect, useRef, useState } from 'react';
import { Content } from '../../types';

interface Props {
  items: Content[];
  onOpen: (c: Content) => void;
}

export default function HomeBanner({ items, onOpen }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      const w = el.clientWidth || 1;
      const i = Math.min(items.length - 1, Math.max(0, Math.round(el.scrollLeft / w)));
      setIndex(i);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [items.length]);

  if (!items.length) return null;

  return (
    <div>
      <div ref={ref} className="flex gap-3 overflow-x-auto hide-scrollbar snap-x snap-mandatory -mx-4 px-4">
        {items.map((c) => (
          <div
            key={c.id}
            onClick={() => onOpen(c)}
            className="relative shrink-0 w-[92vw] max-w-[420px] h-36 rounded-2xl overflow-hidden cursor-pointer snap-center active:scale-[0.98] transition-transform"
          >
            {c.coverUrl ? (
              <img src={c.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-course-blue/70 via-course-indigo/70 to-course-purple/70" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-3">
              <span className="text-white text-sm font-bold line-clamp-1">{c.title}</span>
              {c.summary && <span className="text-white/70 text-[10px] block mt-0.5 line-clamp-1">{c.summary}</span>}
            </div>
          </div>
        ))}
      </div>
      {items.length > 1 && (
        <div className="flex justify-center gap-1 mt-2">
          {items.map((_, i) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${i === index ? 'bg-on-surface' : 'bg-on-surface/20'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
