import { useMemo, useState, useCallback } from 'react';
import { Message, Conversation, PendingConversation, INTERACTION_CATEGORIES } from '../../types';
import Icon from '../ui/Icon';
import Button from '../ui/Button';
import ConversationList from './ConversationList';
import { useTheme } from '../../utils/theme';

type SubTab = 'notifications' | 'dm';
type NestedView = 'list' | 'strangers' | 'interactions';

interface MessagesTabProps {
  messages: Message[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onDeleteMessage: (id: string) => void;
  // 私信
  conversations: Conversation[];
  conversationsLoading: boolean;
  onOpenChat: (conv: Conversation) => void;
  // 陌生人消息（我是接收方、对方发起、还未接受）
  pendingConversations: PendingConversation[];
  onOpenPendingChat: (conv: PendingConversation) => void;
  // 右上角挪下来的个人主页 + 主题切换
  avatarUrl?: string;
  onProfileClick?: () => void;
}

function formatRelTime(dateStr: string | null): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return `${diffMin}分钟前`;
    if (diffMin < 1440) return `${Math.floor(diffMin / 60)}小时前`;
    return `${date.getMonth() + 1}/${date.getDate()}`;
  } catch {
    return '';
  }
}

export default function MessagesTab({
  messages,
  onMarkRead,
  onMarkAllRead,
  onDeleteMessage,
  conversations,
  conversationsLoading,
  onOpenChat,
  pendingConversations,
  onOpenPendingChat,
  avatarUrl,
  onProfileClick,
}: MessagesTabProps) {
  const { theme, toggle } = useTheme();
  const [subTab, setSubTab] = useState<SubTab>(() => {
    return (localStorage.getItem('messages_subtab') as SubTab) || 'notifications';
  });
  const setSubTabAndRemember = useCallback((tab: SubTab) => {
    setSubTab(tab);
    setNestedView('list');
    localStorage.setItem('messages_subtab', tab);
  }, []);
  const [nestedView, setNestedView] = useState<NestedView>('list');
  const [filter, setFilter] = useState<'all' | 'approval' | 'registration' | 'official'>('all');

  // 互动消息（点赞/评论/回复）单独归类展示，不混进通知主列表
  const isInteraction = (cat: string) => (INTERACTION_CATEGORIES as readonly string[]).includes(cat);
  const generalMessages = useMemo(() => messages.filter((m) => !isInteraction(m.category)), [messages]);
  const interactionMessages = useMemo(() => messages.filter((m) => isInteraction(m.category)), [messages]);
  const unreadCount = useMemo(() => generalMessages.filter((m) => !m.isRead).length, [generalMessages]);
  const interactionUnread = useMemo(() => interactionMessages.filter((m) => !m.isRead).length, [interactionMessages]);
  const dmUnread = useMemo(() => conversations.reduce((s, c) => s + (c.unreadCount || 0), 0), [conversations]);
  const filtered = useMemo(() => {
    if (filter === 'all') return generalMessages;
    return generalMessages.filter((m) => m.category === filter);
  }, [generalMessages, filter]);

  const renderMessageCard = (msg: Message) => {
    let iconBgClass = 'bg-course-green/10',
      iconColorClass = 'text-course-green',
      symbolIcon = 'check_circle';
    if (msg.category === 'registration') {
      iconBgClass = 'bg-course-blue/10';
      iconColorClass = 'text-course-blue';
      symbolIcon = 'how_to_reg';
    } else if (msg.category === 'circle_like') {
      iconBgClass = 'bg-red-50';
      iconColorClass = 'text-red-500';
      symbolIcon = 'favorite';
    } else if (msg.category === 'circle_comment' || msg.category === 'circle_reply') {
      iconBgClass = 'bg-course-blue/10';
      iconColorClass = 'text-course-blue';
      symbolIcon = 'chat_bubble';
    } else if (msg.status === 'rejected') {
      iconBgClass = 'bg-course-red/10';
      iconColorClass = 'text-course-red';
      symbolIcon = 'error';
    } else if (msg.status === 'update') {
      iconBgClass = 'bg-course-blue/10';
      iconColorClass = 'text-course-blue';
      symbolIcon = 'campaign';
    } else if (msg.status === 'event') {
      iconBgClass = 'bg-course-purple/10';
      iconColorClass = 'text-course-purple';
      symbolIcon = 'celebration';
    }
    return (
      <div
        key={msg.id}
        onClick={() => onMarkRead(msg.id)}
        className={`bg-white rounded-xl p-3.5 shadow-sm border border-slate-100 flex gap-3 items-start transition-all cursor-pointer relative ${msg.isRead ? 'opacity-70 hover:opacity-90' : 'hover:translate-x-1 duration-150'}`}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDeleteMessage(msg.id);
          }}
          className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors cursor-pointer z-10"
          aria-label="删除消息"
        >
          <Icon name="close" className="text-xs" />
        </button>
        <div className={`shrink-0 w-10 h-10 ${iconBgClass} rounded-full flex items-center justify-center relative`}>
          <Icon name={symbolIcon} className={iconColorClass} />
          {!msg.isRead && (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-course-red rounded-full border-2 border-white"></span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start mb-0.5">
            <h3 className="font-headline font-bold text-xs text-on-surface truncate">{msg.title}</h3>
            <span className="text-[10px] text-gray-400 shrink-0 select-none ml-2">{msg.timeText}</span>
          </div>
          <p className="text-[11px] text-gray-600 leading-relaxed">{msg.content}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col flex-1 animate-fade-in">
      {/* ── 子 Tab 切换 ── */}
      <div className="flex border-b border-gray-100 bg-white">
        {[
          { key: 'notifications' as const, label: '通知', badge: unreadCount },
          { key: 'dm' as const, label: '私信', badge: dmUnread },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSubTabAndRemember(tab.key)}
            className={`flex-1 py-3 text-sm font-semibold text-center cursor-pointer transition-colors relative ${
              subTab === tab.key ? 'text-on-surface' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {tab.label}
            {tab.badge > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
                {tab.badge > 99 ? '99+' : tab.badge}
              </span>
            )}
            {subTab === tab.key && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-on-surface rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* ── 通知面板 ── */}
      {subTab === 'notifications' && nestedView === 'list' && (
        <>
          <header className="px-4 py-4 border-b border-gray-100 bg-white shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={toggle}
                  aria-label="切换主题"
                  className="text-on-surface-variant hover:bg-black/[0.04] transition-colors p-2 rounded-full active:scale-95 cursor-pointer"
                >
                  <Icon name={theme === 'dark' ? 'sunny' : 'dark_mode'} className="text-lg" />
                </button>
                {onProfileClick && (
                  <button
                    onClick={onProfileClick}
                    aria-label="我的"
                    className="p-0.5 rounded-full active:scale-95 cursor-pointer ring-2 ring-transparent hover:ring-primary/30 transition-all"
                  >
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt=""
                        className="w-7 h-7 rounded-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="w-7 h-7 rounded-full bg-primary/8 flex items-center justify-center text-primary/70">
                        <Icon name="person" className="text-base" />
                      </span>
                    )}
                  </button>
                )}
                <div>
                  <h1 className="font-headline text-lg font-bold text-on-surface">消息通知</h1>
                  <p className="text-[10px] text-gray-400 mt-0.5">审核结果与校园通知</p>
                </div>
              </div>
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" onClick={onMarkAllRead}>
                  全标已读
                </Button>
              )}
            </div>
          </header>
          <main className="px-4 pt-3 space-y-3 flex-1">
            {/* 互动消息入口框 —— 仿抖音，点赞/评论/回复单独聚合 */}
            <button
              onClick={() => setNestedView('interactions')}
              className="w-full flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm border border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <div className="shrink-0 w-10 h-10 bg-red-50 rounded-full flex items-center justify-center">
                <Icon name="favorite" className="text-red-500" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <h3 className="font-headline font-bold text-xs text-on-surface">互动消息</h3>
                <p className="text-[11px] text-gray-400">谁赞了/评论了/回复了你</p>
              </div>
              {interactionUnread > 0 && (
                <span className="shrink-0 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                  {interactionUnread > 99 ? '99+' : interactionUnread}
                </span>
              )}
              <Icon name="chevron_right" className="text-gray-300 shrink-0" />
            </button>

            <div className="flex space-x-2 border-b border-slate-200/50 pb-1 text-xs">
              {(
                [
                  { key: 'all', label: '全部' },
                  { key: 'registration', label: '报名' },
                  { key: 'approval', label: '审核' },
                  { key: 'official', label: '官方通知' },
                ] as { key: typeof filter; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={`px-3 py-2 font-bold transition-all relative cursor-pointer ${filter === tab.key ? 'text-primary border-b-2 border-primary' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="space-y-3 pt-2">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400 bg-slate-50 rounded-2xl border border-dashed border-gray-200">
                  <Icon name="mail_outline" className="text-4xl mb-1.5 text-gray-300" />
                  <p className="text-xs">暂无消息</p>
                </div>
              ) : (
                filtered.map(renderMessageCard)
              )}
            </div>
          </main>
        </>
      )}

      {/* ── 互动消息独立视图 ── */}
      {subTab === 'notifications' && nestedView === 'interactions' && (
        <>
          <header className="flex items-center gap-2 px-3 py-3 border-b border-gray-100 bg-white shadow-xs">
            <button
              onClick={() => setNestedView('list')}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer"
            >
              <Icon name="arrow_back" className="text-gray-700" />
            </button>
            <h1 className="font-headline text-base font-bold text-on-surface">互动消息</h1>
          </header>
          <main className="px-4 pt-3 space-y-3 flex-1">
            {interactionMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400 bg-slate-50 rounded-2xl border border-dashed border-gray-200">
                <Icon name="favorite_border" className="text-4xl mb-1.5 text-gray-300" />
                <p className="text-xs">暂无互动消息</p>
              </div>
            ) : (
              interactionMessages.map(renderMessageCard)
            )}
          </main>
        </>
      )}

      {/* ── 私信面板 ── */}
      {subTab === 'dm' && nestedView === 'list' && (
        <>
          {/* 陌生人消息入口框 —— 点开是独立列表，接受聊天后自动从这里消失 */}
          <div className="px-4 pt-3">
            <button
              onClick={() => setNestedView('strangers')}
              className="w-full flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm border border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <div className="shrink-0 w-10 h-10 bg-amber-50 rounded-full flex items-center justify-center">
                <Icon name="person_add" className="text-amber-500" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <h3 className="font-headline font-bold text-xs text-on-surface">陌生人消息</h3>
                <p className="text-[11px] text-gray-400">还未接受聊天的私信请求</p>
              </div>
              {pendingConversations.length > 0 && (
                <span className="shrink-0 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                  {pendingConversations.length > 99 ? '99+' : pendingConversations.length}
                </span>
              )}
              <Icon name="chevron_right" className="text-gray-300 shrink-0" />
            </button>
          </div>
          <ConversationList conversations={conversations} loading={conversationsLoading} onOpenChat={onOpenChat} />
        </>
      )}

      {/* ── 陌生人消息独立视图 ── */}
      {subTab === 'dm' && nestedView === 'strangers' && (
        <>
          <header className="flex items-center gap-2 px-3 py-3 border-b border-gray-100 bg-white shadow-xs">
            <button
              onClick={() => setNestedView('list')}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer"
            >
              <Icon name="arrow_back" className="text-gray-700" />
            </button>
            <h1 className="font-headline text-base font-bold text-on-surface">陌生人消息</h1>
          </header>
          {pendingConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Icon name="person_add" className="text-5xl mb-3 text-gray-200" />
              <p className="text-xs">暂无待接受的私信</p>
            </div>
          ) : (
            <div className="space-y-0">
              {pendingConversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => onOpenPendingChat(conv)}
                  className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer border-b border-gray-50"
                >
                  <div className="shrink-0">
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
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm text-gray-900 truncate">{conv.otherUser.nickname}</span>
                      <span className="text-[10px] text-gray-400 shrink-0 ml-2">
                        {formatRelTime(conv.lastMessageAt)}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400 truncate block mt-1">
                      {conv.lastMessage || '发来一条消息'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
