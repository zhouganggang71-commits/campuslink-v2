import { useState, useEffect, useRef, useCallback } from 'react';
import { Listing } from '../../types';
import { postsApi, circlesApi } from '../../api';
import { safeParseJsonArray } from '../../utils/time';
import Icon from '../ui/Icon';
import type { CirclePost } from '../../hooks/useCircles';

interface SearchPageProps {
  savedListingIds: string[];
  onOpenDetail: (l: Listing) => void;
  onClose: () => void;
  postTypeLabel: (pt: string) => string;
}

// ── 搜索历史持久化（最近10条去重）──
const HISTORY_KEY = 'campuslink_search_history';
function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveHistory(terms: string[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(terms)); } catch {}
}

export default function SearchPage({
  savedListingIds,
  onOpenDetail,
  onClose,
  postTypeLabel,
}: SearchPageProps) {
  const [query, setQuery] = useState('');
  const [posts, setPosts] = useState<Listing[]>([]);
  const [circlePosts, setCirclePosts] = useState<CirclePost[]>([]);
  const [searching, setSearching] = useState(false);
  const [history, setHistory] = useState<string[]>(loadHistory);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ── 服务端搜索（300ms 防抖）──
  const doSearch = useCallback(async (keyword: string) => {
    if (!keyword.trim()) {
      setPosts([]);
      setCirclePosts([]);
      return;
    }
    setSearching(true);
    try {
      const [postsRes, circlesRes] = await Promise.all([
        postsApi.list({ keyword, limit: 30 }) as any,
        circlesApi.trending({ keyword, page: 1, size: 30 }) as any,
      ]);

      // 写入搜索历史（去重，保持最近10条）
      const trimmed = keyword.trim();
      setHistory((prev) => {
        const next = [trimmed, ...prev.filter((t) => t !== trimmed)].slice(0, 10);
        saveHistory(next);
        return next;
      });

      if (postsRes.code === 0 && postsRes.data?.list) {
        setPosts(postsRes.data.list.map((p: any) => ({
          id: String(p.id),
          title: p.title,
          price: p.price,
          description: p.description,
          imageUrls: safeParseJsonArray(p.image_urls),
          category: p.category,
          postType: p.post_type,
          publisherId: p.user_id || 0,
          publisherName: p.publisher_name || p.nickname || '',
          publisherAvatar: p.publisher_avatar || '',
          isVerifiedStudent: p.publisher_auth_status === 'verified',
          isOfficialOrg: p.is_official,
          orgName: p.org_name || p.publisher_org_name,
          department: p.publisher_department,
          publisherOrgLevel: p.publisher_org_level,
          publisherPosition: p.publisher_position,
          publishedTimeText: p.created_at?.substring(0, 10) || '',
          views: p.views || 0,
          favorites: 0,
          contactInfo: p.contact_info,
          status: p.status || 'active',
        } as Listing)));
      } else setPosts([]);

      if (circlesRes.code === 0 && circlesRes.data?.list) {
        setCirclePosts(circlesRes.data.list);
      } else setCirclePosts([]);
    } catch { /* 静默 */ }
    setSearching(false);
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(query), 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query, doSearch]);

  const totalResults = posts.length + circlePosts.length;
  const hasQuery = query.trim().length > 0;

  const removeHistoryItem = (term: string) => {
    const next = history.filter((t) => t !== term);
    setHistory(next);
    saveHistory(next);
  };

  const clearHistory = () => {
    setHistory([]);
    saveHistory([]);
  };

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
        {!hasQuery ? (
          history.length > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold text-gray-400">搜索历史</span>
                <button onClick={clearHistory} className="text-[10px] text-gray-400 hover:text-gray-600 cursor-pointer">
                  清空历史
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {history.map((term) => (
                  <div key={term} className="flex items-center gap-1 bg-slate-50 border border-gray-100 rounded-full px-3 py-1.5 group">
                    <button
                      onClick={() => setQuery(term)}
                      className="text-xs text-gray-600 hover:text-primary cursor-pointer"
                    >
                      {term}
                    </button>
                    <button
                      onClick={() => removeHistoryItem(term)}
                      className="text-gray-300 hover:text-gray-500 cursor-pointer"
                    >
                      <Icon name="close" className="text-[10px]" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Icon name="search" className="text-5xl mb-3 text-gray-200" />
              <p className="text-xs">输入关键词搜索信息</p>
            </div>
          )
        ) : searching ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
            <p className="text-xs text-gray-400">搜索中...</p>
          </div>
        ) : totalResults === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Icon name="search_off" className="text-5xl mb-3 text-gray-200" />
            <p className="text-xs">没有找到"{query}"相关的结果</p>
          </div>
        ) : (
          <div>
            <p className="text-[10px] text-gray-400 font-bold mb-3">找到 {totalResults} 条结果</p>
            {posts.length > 0 && (
              <>
                <p className="text-[10px] text-gray-400 font-semibold mb-2">信息广场</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  {posts.map((item) => (
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
                        {savedListingIds.includes(item.id) && <Icon name="favorite" className="text-[10px] ml-1 text-course-red" />}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
                </div>
              </>
            )}
            {circlePosts.length > 0 && (
              <>
                <p className="text-[10px] text-gray-400 font-semibold mb-2">校园圈</p>
                <div className="space-y-2 mb-4">
                  {circlePosts.map((p) => (
                    <div key={p.id} className="bg-white border border-gray-100 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[10px] font-semibold text-gray-500">{p.is_anonymous ? '匿名同学' : p.nickname}</span>
                        <span className="text-[10px] text-gray-300">{p.created_at?.substring(0, 10)}</span>
                      </div>
                      <p className="text-xs text-on-surface line-clamp-2">{p.content}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
