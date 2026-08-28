/**
 * 首页分类宫格（R12 Phase 1，对标竞品链千校宫格：紧凑、入口多、一目了然）
 *
 * 信息结构对标链千校，视觉走 CampusLink 设计体系：
 * 宫格项 = services.ts 静态配置（sub_category → 中文标签 + lucide 图标 + course 色盘），
 * 卡片语言（rounded-2xl + 柔和底 + 无边框），非链千校的大色块营销风。
 *
 * 「更多」= 箭头下拉展开（不再跳转）：展开显示更多服务入口（校历/课表/全部文章）。
 */
import { useState } from 'react';
import { SERVICE_ITEMS, SERVICE_EXTRA_ITEMS } from '../../constants/services';
import Icon from '../ui/Icon';

interface Props {
  /** 宫格项：services 子类（life/transfer/...） */
  onOpenSub: (sub: string) => void;
  /** 展开区：category 分类（calendar/services 全部分类） */
  onOpenCategory: (category: string) => void;
  /** 课表查询入口 → 跳课表 Tab */
  onGoSchedule: () => void;
}

export default function ServiceGrid({ onOpenSub, onOpenCategory, onGoSchedule }: Props) {
  const [expanded, setExpanded] = useState(false);

  const handleExtra = (key: string) => {
    if (key === 'schedule') {
      onGoSchedule();
    } else if (key === 'all') {
      onOpenCategory('services');
    } else {
      onOpenCategory('calendar');
    }
  };

  return (
    <div className="card-float rounded-2xl px-2 py-2">
      <div className="grid grid-cols-4 gap-y-2">
        {SERVICE_ITEMS.map((it) => (
          <button
            key={it.sub}
            onClick={() => onOpenSub(it.sub)}
            className="flex flex-col items-center gap-1 py-1.5 cursor-pointer transition-transform active:scale-[0.96]"
          >
            <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${it.color}`}>
              <Icon name={it.icon} className="text-lg" />
            </span>
            <span className="text-[11px] leading-none">{it.label}</span>
          </button>
        ))}
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex flex-col items-center gap-1 py-1.5 cursor-pointer transition-transform active:scale-[0.96]"
        >
          <span className="w-10 h-10 rounded-xl flex items-center justify-center bg-on-surface/5 text-on-surface-variant">
            <Icon name={expanded ? 'expand_less' : 'expand_more'} className="text-lg" />
          </span>
          <span className="text-[11px] leading-none">{expanded ? '收起' : '更多'}</span>
        </button>
      </div>

      {expanded && (
        <div className="mt-1.5 pt-2 border-t border-outline-variant/60">
          <div className="grid grid-cols-4 gap-y-2">
            {SERVICE_EXTRA_ITEMS.map((it) => (
              <button
                key={it.key}
                onClick={() => handleExtra(it.key)}
                className="flex flex-col items-center gap-1 py-1.5 cursor-pointer transition-transform active:scale-[0.96]"
              >
                <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${it.color}`}>
                  <Icon name={it.icon} className="text-lg" />
                </span>
                <span className="text-[11px] leading-none">{it.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
