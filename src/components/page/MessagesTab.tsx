import { useMemo, useState } from 'react';
import { Message, Conversation } from '../../types';
import Icon from '../ui/Icon';
import Button from '../ui/Button';
import ConversationList from './ConversationList';

type SubTab = 'notifications' | 'dm';

interface MessagesTabProps {
  messages: Message[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onDeleteMessage: (id: string) => void;
  // 私信
  conversations: Conversation[];
  conversationsLoading: boolean;
  onOpenChat: (conv: Conversation) => void;
}

export default function MessagesTab({
  messages,
  onMarkRead,
  onMarkAllRead,
  onDeleteMessage,
  conversations,
  conversationsLoading,
  onOpenChat,
}: MessagesTabProps) {
  const [subTab, setSubTab] = useState<SubTab>('notifications');
  const [filter, setFilter] = useState<'all' | 'approval' | 'registration' | 'official'>('all');
  const unreadCount = useMemo(() => messages.filter((m) => !m.isRead).length, [messages]);
  const dmUnread = useMemo(() => conversations.reduce((s, c) => s + (c.unreadCount || 0), 0), [conversations]);
  const filtered = useMemo(() => {
    if (filter === 'all') return messages;
    return messages.filter((m) => m.category === filter);
  }, [messages, filter]);

  return (
    <div className="flex flex-col flex-1 animate-fade-in">
      {/* ── 子 Tab 切换 ── */}
      <div className="flex border-b border-gray-100 bg-white">
        {([
          { key: 'notifications' as const, label: '通知', badge: unreadCount },
          { key: 'dm' as const, label: '私信', badge: dmUnread },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSubTab(tab.key)}
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
      {subTab === 'notifications' && (
        <>
          <header className="px-4 py-4 border-b border-gray-100 bg-white shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-headline text-lg font-bold text-on-surface">消息通知</h1>
                <p className="text-[10px] text-gray-400 mt-0.5">审核结果与校园通知</p>
              </div>
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" onClick={onMarkAllRead}>全标已读</Button>
              )}
            </div>
          </header>
          <main className="px-4 pt-3 space-y-3 flex-1">
            <div className="flex space-x-2 border-b border-slate-200/50 pb-1 text-xs">
              {[
                { key: 'all', label: '全部' },
                { key: 'registration', label: '报名' },
                { key: 'approval', label: '审核' },
                { key: 'official', label: '官方通知' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key as any)}
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
                filtered.map((msg) => {
                  let iconBgClass = 'bg-course-green/10',
                    iconColorClass = 'text-course-green',
                    symbolIcon = 'check_circle';
                  if (msg.category === 'registration') {
                    iconBgClass = 'bg-course-blue/10';
                    iconColorClass = 'text-course-blue';
                    symbolIcon = 'how_to_reg';
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
                        onClick={(e) => { e.stopPropagation(); onDeleteMessage(msg.id); }}
                        className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors cursor-pointer z-10"
                        aria-label="删除消息"
                      >
                        <Icon name="close" className="text-xs" />
                      </button>
                      <div
                        className={`shrink-0 w-10 h-10 ${iconBgClass} rounded-full flex items-center justify-center relative`}
                      >
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
                })
              )}
            </div>
          </main>
        </>
      )}

      {/* ── 私信面板 ── */}
      {subTab === 'dm' && (
        <ConversationList
          conversations={conversations}
          loading={conversationsLoading}
          onOpenChat={onOpenChat}
        />
      )}
    </div>
  );
}
