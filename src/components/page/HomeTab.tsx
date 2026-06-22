import { useState, useMemo } from 'react';
import { Listing, Notice, DEPARTMENTS } from '../../types';
import Icon from '../ui/Icon';

const CHANNELS: { key: Listing['postType'] | 'all'; label: string; icon: string }[] = [
  { key: 'all', label: '全部', icon: 'apps' },
  { key: 'sell', label: '二手', icon: 'shopping_bag' },
  { key: 'lost', label: '失物', icon: 'search' },
  { key: 'found', label: '招领', icon: 'volunteer_activism' },
  { key: 'carpool', label: '拼车', icon: 'directions_car' },
  { key: 'job', label: '兼职', icon: 'work' },
  { key: 'activity', label: '活动', icon: 'celebration' },
  { key: 'study', label: '学习', icon: 'school' },
];

function postTypeLabel(pt: string) {
  return CHANNELS.find((p) => p.key === pt)?.label || pt;
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

interface HomeTabProps {
  listings: Listing[];
  notices: Notice[];
  selectedPostType: string;
  setSelectedPostType: (s: string) => void;
  savedListingIds: string[];
  openListingDetails: (l: Listing) => void;
  onPublishTab: () => void;
  onOpenSearch: () => void;
}

export default function HomeTab({
  listings,
  notices,
  selectedPostType,
  setSelectedPostType,
  openListingDetails,
  onPublishTab,
  onOpenSearch,
}: HomeTabProps) {
  const [selectedDept, setSelectedDept] = useState('all');
  const activities = useMemo(
    () => listings.filter((l) => l.postType === 'activity' && l.status === 'active').slice(0, 6),
    [listings],
  );
  const filtered = useMemo(
    () =>
      listings.filter(
        (l) =>
          (selectedPostType === 'all' || l.postType === selectedPostType) &&
          (selectedDept === 'all' || l.department === selectedDept),
      ),
    [listings, selectedPostType, selectedDept],
  );

  return (
    <div className="flex flex-col animate-fade-in">
      <div className="p-4 flex flex-col gap-3">
        {/* 搜索栏 */}
        <div className="relative w-full">
          <Icon
            name="search"
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 select-none text-base"
          />
          <div
            onClick={onOpenSearch}
            className="w-full bg-slate-100 text-sm border-0 rounded-xl pl-10 pr-4 py-2.5 text-gray-400 text-xs cursor-pointer"
          >
            搜索信息、课程、活动...
          </div>
        </div>

        {/* 活动海报 */}
        {activities.length > 0 && (
          <div className="flex gap-3 overflow-x-auto hide-scrollbar snap-x snap-mandatory -mx-4 px-4">
            {activities.map((a) => (
              <div
                key={a.id}
                onClick={() => openListingDetails(a)}
                className="relative shrink-0 w-[80vw] max-w-[320px] h-40 rounded-2xl overflow-hidden cursor-pointer snap-center active:scale-[0.98] transition-transform"
              >
                <img
                  src={a.imageUrls[0] || ''}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <span className="text-white text-sm font-bold line-clamp-1">{a.title}</span>
                  <span className="text-white/70 text-[10px] block mt-0.5">
                    {a.publisherName} · {a.views} 次浏览
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 分类筛选 */}
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
          {CHANNELS.map((ch) => (
            <button
              key={ch.key}
              onClick={() => setSelectedPostType(ch.key)}
              className={`text-xs font-semibold px-4 py-2 rounded-full border shrink-0 transition-all cursor-pointer ${selectedPostType === ch.key ? 'bg-primary text-white border-primary shadow-sm' : 'text-on-surface-variant border-outline-variant hover:border-outline'}`}
            >
              {ch.label}
            </button>
          ))}
        </div>

        {/* 学院筛选 */}
        <div className="flex gap-1.5 overflow-x-auto hide-scrollbar pb-1">
          <button
            onClick={() => setSelectedDept('all')}
            className={`text-[10px] font-semibold px-3 py-1 rounded-full border shrink-0 cursor-pointer ${selectedDept === 'all' ? 'bg-on-surface text-white border-on-surface' : 'text-on-surface-variant border-outline-variant hover:border-outline'}`}
          >
            全部学院
          </button>
          {DEPARTMENTS.map((d) => (
            <button
              key={d}
              onClick={() => setSelectedDept(d)}
              className={`text-[10px] font-semibold px-3 py-1 rounded-full border shrink-0 cursor-pointer ${selectedDept === d ? 'bg-on-surface text-white border-on-surface' : 'text-on-surface-variant border-outline-variant hover:border-outline'}`}
            >
              {d}
            </button>
          ))}
        </div>

        {/* 通知 */}
        {notices.length > 0 && (
          <div className="flex gap-2 overflow-x-auto hide-scrollbar">
            {notices.map((n) => (
              <div
                key={n.id}
                className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 shrink-0"
              >
                <Icon name="megaphone" className="text-amber-600 text-sm shrink-0" />
                <span className="text-[11px] text-amber-800 font-medium truncate">{n.title}</span>
              </div>
            ))}
          </div>
        )}

        {/* 帖子列表 */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 bg-slate-50 rounded-2xl border border-dashed border-gray-200">
            <Icon name="inbox" className="text-4xl mb-2 opacity-60" />
            <p className="text-xs font-semibold text-gray-500">暂无内容</p>
            <button
              onClick={onPublishTab}
              className="mt-3 bg-primary text-white text-xs font-semibold px-4 py-2 rounded-lg active:scale-95 cursor-pointer"
            >
              去发布
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {filtered.map((item) => (
              <div
                key={item.id}
                onClick={() => openListingDetails(item)}
                className="bg-white border border-gray-50 rounded-xl p-3.5 cursor-pointer hover:shadow-sm transition-all active:scale-[0.99]"
              >
                <div className="flex items-start gap-3">
                  {item.imageUrls.length > 0 && (
                    <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-slate-100">
                      <img src={item.imageUrls[0]} alt="" className="w-full h-full object-cover" loading="lazy" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                        {postTypeLabel(item.postType)}
                      </span>
                      {item.isOfficialOrg && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                          官方
                        </span>
                      )}
                      {item.price && <span className="text-course-red font-bold ml-auto">¥{item.price}</span>}
                    </div>
                    <h3 className="text-sm font-semibold text-on-surface truncate">{item.title}</h3>
                    <p className="text-xs text-on-surface-variant mt-1 line-clamp-1">{item.description}</p>
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
                      <span>{item.publisherName}</span>
                      <span>{timeAgo(item.publishedTimeText)}</span>
                      <span>{item.views} 次浏览</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
