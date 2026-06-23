import { useMemo, useState } from 'react';
import { Message } from '../../types';
import Icon from '../ui/Icon';
import Button from '../ui/Button';

interface MessagesTabProps {
  messages: Message[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}

export default function MessagesTab({ messages, onMarkRead, onMarkAllRead }: MessagesTabProps) {
  const [filter, setFilter] = useState<'all' | 'approval' | 'official'>('all');
  const unreadCount = useMemo(() => messages.filter((m) => !m.isRead).length, [messages]);
  const filtered = useMemo(() => {
    if (filter === 'all') return messages;
    return messages.filter((m) => m.category === filter);
  }, [messages, filter]);

  return (
    <div className="flex flex-col flex-1 animate-fade-in">
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
              if (msg.status === 'rejected') {
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
                  className={`bg-white rounded-xl p-3.5 shadow-sm border border-slate-100 flex gap-3 items-start transition-all cursor-pointer ${msg.isRead ? 'opacity-70 hover:opacity-90' : 'hover:translate-x-1 duration-150'}`}
                >
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
    </div>
  );
}
