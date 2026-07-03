import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Icon from '../ui/Icon';
import { circlesApi } from '../../api';
import type { CirclePost } from '../../hooks/useCircles';

interface CircleHotRankingProps {
  isOpen: boolean;
  onClose: () => void;
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m}分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}小时前`;
  return new Date(ts).toLocaleDateString('zh-CN');
}

const CIRCLE_NAMES: Record<string, string> = {
  trending: '今天发生', study: '学业互助', sports: '约球约饭',
  hobby: '兴趣社团', treehole: '匿名树洞', career: '毕业就业',
  exam: '考证考试', food: '美食探店', upgrade: '专升本',
};

const RANK_MEDALS = ['🥇', '🥈', '🥉'];

export default function CircleHotRanking({ isOpen, onClose }: CircleHotRankingProps) {
  const [posts, setPosts] = useState<CirclePost[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    circlesApi.trending({ page: 1, size: 10 })
      .then((res) => {
        if (res.code === 0 && res.data?.list) setPosts(res.data.list);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="🔥 校园圈热度排行榜" subtitle="基于点赞、评论和时间衰减的实时热度">
      <div className="max-h-[60vh] overflow-y-auto pr-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-xs">暂无热门帖子</div>
        ) : (
          <div className="space-y-1">
            {posts.map((post, i) => {
              const displayName = post.is_anonymous ? '匿名同学' : post.nickname;
              return (
                <div
                  key={post.id}
                  className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  <div className="w-7 h-7 flex items-center justify-center shrink-0 text-sm">
                    {i < 3 ? RANK_MEDALS[i] : (
                      <span className="text-[11px] font-bold text-gray-400">{i + 1}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] font-semibold text-gray-500">{displayName}</span>
                      <span className="text-[9px] text-gray-300">{CIRCLE_NAMES[post.circle_id] || post.circle_id}</span>
                    </div>
                    <p className="text-xs text-on-surface leading-relaxed line-clamp-2">{post.content}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-400">
                      <span className="flex items-center gap-0.5">
                        <Icon name="favorite" className="text-[9px]" />{post.like_count}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <Icon name="chat" className="text-[9px]" />{post.comment_count}
                      </span>
                      <span>{timeAgo(post.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 text-course-orange font-bold text-xs shrink-0">
                    <Icon name="trending_up" className="text-[10px]" />
                    {post.hot_score}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
