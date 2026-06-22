import { useState, useMemo } from 'react';
import { Listing } from '../../types';
import Icon from '../ui/Icon';

interface SearchPageProps {
  listings: Listing[];
  savedListingIds: string[];
  onOpenDetail: (l: Listing) => void;
  onClose: () => void;
  postTypeLabel: (pt: string) => string;
}

export default function SearchPage({
  listings,
  savedListingIds,
  onOpenDetail,
  onClose,
  postTypeLabel,
}: SearchPageProps) {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return listings.filter(
      (l) =>
        l.title.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q) ||
        l.category.toLowerCase().includes(q),
    );
  }, [listings, query]);

  return (
    <div className="flex flex-col flex-1 animate-fade-in">
      <header className="px-4 py-3 bg-white border-b border-gray-100 flex items-center gap-3 sticky top-14 z-20">
        <button
          onClick={onClose}
          className="text-on-surface-variant hover:bg-gray-100 p-2 rounded-full active:scale-95 cursor-pointer shrink-0"
        >
          <Icon name="arrow_back" className="" />
        </button>
        <div className="relative flex-1">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-base" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索信息、课程、活动..."
            className="w-full bg-slate-100 text-xs border-0 rounded-lg pl-9 pr-8 py-2.5 focus:ring-2 focus:ring-primary focus:outline-none"
            autoFocus
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-on-surface p-1"
            >
              <Icon name="close" className="text-sm" />
            </button>
          )}
        </div>
      </header>

      <section className="p-4 flex-1">
        {!query.trim() ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Icon name="search" className="text-5xl mb-3 text-gray-200" />
            <p className="text-xs">输入关键词搜索信息</p>
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Icon name="search_off" className="text-5xl mb-3 text-gray-200" />
            <p className="text-xs">没有找到"{query}"相关的结果</p>
          </div>
        ) : (
          <div>
            <p className="text-[10px] text-gray-400 font-bold mb-3">找到 {results.length} 条结果</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {results.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onOpenDetail(item)}
                  className="bg-white border border-gray-100 rounded-xl overflow-hidden hover:shadow-md transition-all cursor-pointer flex flex-col group"
                >
                  <div className="aspect-[4/3] w-full bg-slate-100 relative overflow-hidden">
                    {item.imageUrls.length > 0 ? (
                      <img
                        src={item.imageUrls[0]}
                        alt={item.title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-slate-100 text-gray-300">
                        <Icon name="image" className="text-4xl" />
                      </div>
                    )}
                    <div className="absolute top-2 left-2">
                      <span className="bg-black/50 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {postTypeLabel(item.postType)}
                      </span>
                    </div>
                  </div>
                  <div className="p-3">
                    <h3 className="font-headline font-semibold text-xs text-on-surface line-clamp-2 mb-1">
                      {item.title}
                    </h3>
                    <div className="flex justify-between items-center">
                      {item.postType === 'sell' && item.price ? (
                        <span className="text-xs font-bold text-course-red">¥ {item.price}</span>
                      ) : (
                        <span className="text-[10px] text-gray-400">{item.publishedTimeText}</span>
                      )}
                      <div className="flex items-center gap-1 text-[10px] text-gray-400">
                        <Icon name="visibility" className="text-[10px]" />
                        {item.views}
                        <Icon name="favorite" className="text-[10px] ml-1" />
                        {item.favorites + (savedListingIds.includes(item.id) ? 1 : 0)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
