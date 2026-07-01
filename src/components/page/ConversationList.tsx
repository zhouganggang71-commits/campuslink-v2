/**
 * 会话列表 — 仿抖音私信列表
 * 左 avatar + 右 昵称/最后消息/时间 + 未读红点数字
 */
import { Conversation } from '../../types';
import Icon from '../ui/Icon';

interface ConversationListProps {
  conversations: Conversation[];
  loading: boolean;
  onOpenChat: (conv: Conversation) => void;
}

function formatConvTime(dateStr: string | null): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return `${diffMin}分钟前`;
    if (diffHour < 24) return `${diffHour}小时前`;
    if (diffDay === 1) return '昨天';
    if (diffDay < 7) {
      const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      return weekdays[date.getDay()];
    }
    return `${date.getMonth() + 1}/${date.getDate()}`;
  } catch {
    return '';
  }
}

export default function ConversationList({ conversations, loading, onOpenChat }: ConversationListProps) {
  if (loading && conversations.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <Icon name="forum" className="text-5xl mb-3 text-gray-200" />
        <p className="text-xs">暂无私信</p>
        <p className="text-[10px] mt-1 text-gray-300">在他人主页点击"发私信"开始聊天</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {conversations.map((conv) => (
        <div
          key={conv.id}
          onClick={() => onOpenChat(conv)}
          className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer border-b border-gray-50"
        >
          {/* 头像 */}
          <div className="relative shrink-0">
            {conv.otherUser.avatarUrl ? (
              <img
                src={conv.otherUser.avatarUrl}
                alt=""
                className="w-12 h-12 rounded-full object-cover bg-slate-100"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center">
                <Icon name="person" className="text-xl text-gray-400" />
              </div>
            )}
          </div>

          {/* 内容 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm text-gray-900 truncate">
                {conv.otherUser.nickname}
              </span>
              <span className="text-[10px] text-gray-400 shrink-0 ml-2">
                {formatConvTime(conv.lastMessageAt)}
              </span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-gray-400 truncate max-w-[180px]">
                {conv.lastMessage || '暂无消息'}
              </span>
              {conv.unreadCount > 0 && (
                <span className="min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 shrink-0 ml-2">
                  {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
