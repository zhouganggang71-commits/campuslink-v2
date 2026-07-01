/**
 * 聊天视图 — 仿抖音全屏覆盖层
 * 气泡：己方靠右蓝色，对方靠左灰色，时间分割线
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { ChatMessage } from '../../types';
import Icon from '../ui/Icon';

interface ChatViewProps {
  otherUser: { id: number; nickname: string; avatarUrl: string };
  messages: ChatMessage[];
  hasMore: boolean;
  loading: boolean;
  currentUserId?: number;
  onBack: () => void;
  onSend: (content: string) => Promise<boolean>;
  onLoadMore: () => void;
}

function formatChatTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const time = `${hours}:${minutes}`;

    if (isToday) return time;
    if (isYesterday) return `昨天 ${time}`;
    return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
  } catch {
    return '';
  }
}

function shouldShowTime(msgs: ChatMessage[], index: number): boolean {
  if (index === 0) return true;
  const curr = new Date(msgs[index].createdAt).getTime();
  const prev = new Date(msgs[index - 1].createdAt).getTime();
  return curr - prev > 5 * 60 * 1000; // 超过5分钟显示时间
}

export default function ChatView({
  otherUser,
  messages,
  hasMore,
  loading,
  currentUserId,
  onBack,
  onSend,
  onLoadMore,
}: ChatViewProps) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevMsgLen = useRef(messages.length);
  const isNearBottom = useRef(true);

  // 记录用户是否在底部
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  // 新消息自动滚到底部（仅当用户已在底部时）
  useEffect(() => {
    if (messages.length > prevMsgLen.current && isNearBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMsgLen.current = messages.length;
  }, [messages.length]);

  // 首次加载完成后滚到底部
  useEffect(() => {
    if (!loading && messages.length > 0) {
      bottomRef.current?.scrollIntoView();
    }
  }, [loading]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput('');
    const ok = await onSend(text);
    if (!ok) setInput(text); // 发送失败恢复输入
    setSending(false);
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#ededed] animate-fade-in">
      {/* ── 顶部栏 ── */}
      <div className="flex items-center gap-3 px-3 py-2.5 bg-white border-b border-gray-100 shrink-0">
        <button
          onClick={onBack}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors shrink-0"
        >
          <Icon name="arrow_back" className="text-lg text-gray-700" />
        </button>
        {otherUser.avatarUrl && !avatarError ? (
          <img
            src={otherUser.avatarUrl}
            alt=""
            className="w-9 h-9 rounded-full object-cover bg-slate-100 shrink-0"
            referrerPolicy="no-referrer"
            onError={() => setAvatarError(true)}
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center shrink-0">
            <Icon name="person" className="text-lg text-gray-400" />
          </div>
        )}
        <span className="font-semibold text-sm text-gray-900 truncate">{otherUser.nickname}</span>
      </div>

      {/* ── 消息区域 ── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-2"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {/* 加载更多 */}
        {hasMore && (
          <div className="flex justify-center py-3">
            <button
              onClick={onLoadMore}
              disabled={loading}
              className="text-xs text-gray-400 bg-white/70 px-4 py-1.5 rounded-full shadow-sm disabled:opacity-50"
            >
              {loading ? '加载中...' : '查看更早消息'}
            </button>
          </div>
        )}

        {loading && messages.length === 0 && (
          <div className="flex items-center justify-center py-20">
            <div className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Icon name="chat" className="text-5xl mb-3 text-gray-200" />
            <p className="text-xs">发送第一条消息吧</p>
          </div>
        )}

        {messages.map((msg, i) => {
          const isMine = currentUserId ? msg.senderId === currentUserId : msg.senderId === 0;
          const showTime = shouldShowTime(messages, i);
          return (
            <div key={msg.id}>
              {showTime && (
                <div className="flex justify-center my-3">
                  <span className="text-[10px] text-gray-400 bg-white/60 px-2.5 py-0.5 rounded-full">
                    {formatChatTime(msg.createdAt)}
                  </span>
                </div>
              )}
              <div className={`flex mb-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
                {/* 对方头像 */}
                {!isMine && (
                  <div className="shrink-0 mr-2">
                    {otherUser.avatarUrl && !avatarError ? (
                      <img
                        src={otherUser.avatarUrl}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                        <Icon name="person" className="text-xs text-gray-400" />
                      </div>
                    )}
                  </div>
                )}
                {/* 气泡 */}
                <div className={`max-w-[70%] ${!isMine && 'ml-0'}`}>
                  <div
                    className={`px-3 py-2 text-sm leading-relaxed break-words ${
                      isMine
                        ? 'bg-[#576b95] text-white rounded-[16px_4px_16px_16px]'
                        : 'bg-white text-gray-800 rounded-[4px_16px_16px_16px] shadow-sm'
                    }`}
                  >
                    {msg.content}
                  </div>
                  {/* 已读状态 */}
                  {isMine && (
                    <div className="text-right mt-0.5 mr-1">
                      <span className="text-[9px] text-gray-400">
                        {msg.isRead ? '已读' : '未读'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* ── 输入栏 ── */}
      <div className="bg-white border-t border-gray-100 px-3 py-2 flex items-center gap-2 shrink-0">
        <div className="flex-1 bg-[#f5f5f5] rounded-full">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="发送消息..."
            maxLength={500}
            className="w-full bg-transparent px-4 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none"
          />
        </div>
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-[#576b95] text-white shrink-0 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity active:scale-95"
        >
          <Icon name="send" className="text-sm" />
        </button>
      </div>
    </div>
  );
}
