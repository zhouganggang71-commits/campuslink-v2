/**
 * 聊天视图 — 全屏覆盖层
 * 支持：文本 / 表情 / 图片消息，对方在线状态，己方靠右、对方靠左气泡
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { ChatMessage } from '../../types';
import { uploadApi, dmApi } from '../../api';
import Icon from '../ui/Icon';
import ReportModal from '../modal/ReportModal';

interface ChatViewProps {
  otherUser: { id: number; nickname: string; avatarUrl: string; lastActive?: string | null };
  messages: ChatMessage[];
  hasMore: boolean;
  loading: boolean;
  currentUserId?: number;
  onBack: () => void;
  onSend: (content: string, imageUrl?: string, replyToId?: number) => Promise<boolean>;
  onLoadMore: () => void;
  onRecall?: (messageId: number) => Promise<boolean>;
  /** 'pending' = 陌生人首次会话待接受，缺省按 active 处理（保持向后兼容） */
  status?: 'pending' | 'active';
  /** 当前登录用户是否是这条会话的发起人 */
  isInitiator?: boolean;
  /** 接收方点「继续聊天」，返回是否成功 */
  onAccept?: () => Promise<boolean>;
}

const EMOJIS = [
  '😀',
  '😂',
  '🤣',
  '😊',
  '😍',
  '🥰',
  '😘',
  '😜',
  '🤔',
  '😅',
  '😳',
  '😭',
  '😡',
  '👍',
  '👎',
  '🙏',
  '👏',
  '💪',
  '🎉',
  '❤️',
  '💔',
  '🔥',
  '✨',
  '⭐',
  '🌈',
  '🍚',
  '🧋',
  '☕',
  '🏀',
  '⚽',
  '📚',
  '💯',
  '✅',
  '❌',
  '😴',
  '🤝',
  '🙈',
  '💤',
];

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

function formatOnline(lastActive?: string | null): string {
  if (!lastActive) return '';
  const t = new Date(lastActive).getTime();
  if (isNaN(t)) return '';
  const diff = Date.now() - t;
  if (diff < 2 * 60 * 1000) return '在线';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前活跃`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前活跃`;
  const days = Math.floor(diff / 86400000);
  if (days < 7) return `${days} 天前活跃`;
  return '';
}

function shouldShowTime(msgs: ChatMessage[], index: number): boolean {
  if (index === 0) return true;
  const curr = new Date(msgs[index].createdAt).getTime();
  const prev = new Date(msgs[index - 1].createdAt).getTime();
  return curr - prev > 5 * 60 * 1000;
}

// 图片压缩（Canvas → JPEG，max 1920px）
function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 1920;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) {
            height = Math.round((height * MAX) / width);
            width = MAX;
          } else {
            width = Math.round((width * MAX) / height);
            height = MAX;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas 不可用'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('转换失败'))), 'image/jpeg', 0.8);
      };
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
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
  onRecall,
  status = 'active',
  isInitiator = false,
  onAccept,
}: ChatViewProps) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<number | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportShouldBlock, setReportShouldBlock] = useState(false);

  const isPending = status === 'pending';
  const isPendingRecipient = isPending && !isInitiator;
  const isPendingInitiator = isPending && isInitiator;
  // 发起方在 pending 期间只有 1 条免费消息额度，用掉了就前端提前禁用（服务端仍是最终防线）
  const pendingInitiatorQuotaUsed = isPendingInitiator && messages.some((m) => m.senderId === currentUserId);
  // 举报私信：报最近一条对方发的消息作为证据，没有则不可举报
  const latestOtherMsg = [...messages].reverse().find((m) => m.senderId === otherUser.id);

  const handleAccept = async () => {
    if (!onAccept || accepting) return;
    setAccepting(true);
    await onAccept();
    setAccepting(false);
  };

  const handleCopyMessage = useCallback((msg: ChatMessage) => {
    const text = msg.content || '';
    if (!text) return;
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedMsgId(msg.id);
        setTimeout(() => setCopiedMsgId(null), 1500);
      })
      .catch(() => {
        // fallback: 选中文本
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopiedMsgId(msg.id);
        setTimeout(() => setCopiedMsgId(null), 1500);
      });
  }, []);

  // 打开聊天时查真实拉黑状态（原来初始恒 false，重进聊天后按钮/横幅状态丢失）
  useEffect(() => {
    let alive = true;
    dmApi
      .blockedList()
      .then((res) => {
        if (alive && res.code === 0 && Array.isArray(res.data)) {
          setBlocked(res.data.some((u) => u.id === otherUser.id));
        }
      })
      .catch(() => {
        /* 查询失败按未拉黑展示，发送时服务端仍会拦截 */
      });
    return () => {
      alive = false;
    };
  }, [otherUser.id]);

  const handleToggleBlock = async () => {
    if (blockBusy) return;
    if (!blocked && !window.confirm(`拉黑后你和 ${otherUser.nickname} 将无法互发私信，确定拉黑吗？`)) return;
    setBlockBusy(true);
    try {
      const res = blocked ? await dmApi.unblockUser(otherUser.id) : await dmApi.blockUser(otherUser.id);
      if (res.code === 0) setBlocked(!blocked);
    } catch {
      /* 网络失败保持原状态，用户可重试 */
    }
    setBlockBusy(false);
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const prevMsgLen = useRef(messages.length);
  const isNearBottom = useRef(true);
  const pendingLoad = useRef(false);
  const prevScrollHeight = useRef(0);

  const onlineText = formatOnline(otherUser.lastActive);
  const isOnline = onlineText === '在线';

  // 用 ref 包装 onLoadMore，避免 scroll handler 的依赖问题
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 50 && hasMore && !loading && !pendingLoad.current) {
      pendingLoad.current = true;
      prevScrollHeight.current = el.scrollHeight;
      onLoadMoreRef.current();
      // 如果 loadMore 同步返回（early return），100ms 后判断 loading 没有变化则重置
      setTimeout(() => {
        if (pendingLoad.current) pendingLoad.current = false;
      }, 200);
    }
  }, [hasMore, loading]);

  // loading 变为 true → 等待加载完成
  // loading 从 true → false 表示加载完成
  useEffect(() => {
    if (!loading && pendingLoad.current) {
      pendingLoad.current = false;
      const el = scrollRef.current;
      if (el && prevScrollHeight.current > 0) {
        el.scrollTop = el.scrollHeight - prevScrollHeight.current;
      }
    }
  }, [loading]);

  useEffect(() => {
    if (messages.length > prevMsgLen.current && isNearBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMsgLen.current = messages.length;
  }, [messages.length]);

  // 首次加载完成时滚动到底部
  useEffect(() => {
    if (!loading && messages.length > 0 && !pendingLoad.current) {
      bottomRef.current?.scrollIntoView();
    }
  }, [loading]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput('');
    setShowEmoji(false);
    const replyId = replyTo?.id;
    setReplyTo(null);
    const ok = await onSend(text, undefined, replyId);
    if (!ok) setInput(text);
    setSending(false);
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const insertEmoji = (emoji: string) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? input.length;
    const end = el?.selectionEnd ?? input.length;
    const next = input.slice(0, start) + emoji + input.slice(end);
    setInput(next);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = start + emoji.length;
      el?.setSelectionRange(pos, pos);
    });
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let file = e.target.files?.[0];
    if (!file || uploading || sending) return;
    if (!file.type.startsWith('image/')) return;
    setUploading(true);
    try {
      const isHeic =
        file.type === 'image/heic' || file.type === 'image/heif' || file.name.toLowerCase().endsWith('.heic');
      if (isHeic || file.size > 1 * 1024 * 1024) {
        file = new File([await compressImage(file)], file.name.replace(/\.(heic|heif)$/i, '.jpg'), {
          type: 'image/jpeg',
        });
      }
      const form = new FormData();
      form.append('file', file);
      const res = (await uploadApi.uploadImage(form)) as any;
      if (res.code === 0 && res.data?.url) {
        await onSend('', res.data.url);
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    } catch {
      /* 忽略，用户可重试 */
    }
    setUploading(false);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  return (
    <div className="flex flex-col h-full bg-[#ededed]">
      {/* ── 顶部栏 ── */}
      <div
        className="flex items-center gap-3 px-2 pb-2.5 bg-white/95 backdrop-blur border-b border-gray-100 shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 10px)' }}
      >
        <button
          onClick={onBack}
          aria-label="返回"
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 active:scale-90 transition-all shrink-0"
        >
          <Icon name="arrow_back" className="text-xl text-gray-700" />
        </button>
        <div className="relative shrink-0">
          {otherUser.avatarUrl && !avatarError ? (
            <img
              src={otherUser.avatarUrl}
              alt=""
              className="w-9 h-9 rounded-full object-cover bg-slate-100"
              referrerPolicy="no-referrer"
              onError={() => setAvatarError(true)}
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center">
              <Icon name="person" className="text-lg text-gray-400" />
            </div>
          )}
          {isOnline && (
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-course-green border-2 border-white" />
          )}
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="font-semibold text-[15px] text-gray-900 truncate leading-tight">{otherUser.nickname}</span>
          <span className={`text-[10px] leading-tight ${isOnline ? 'text-course-green' : 'text-gray-400'}`}>
            {onlineText || '校园私信'}
          </span>
        </div>
        <button
          onClick={() => {
            setReportShouldBlock(false);
            setReportOpen(true);
          }}
          disabled={!latestOtherMsg}
          aria-label="举报"
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 active:scale-90 transition-all shrink-0 disabled:opacity-30 text-gray-400"
        >
          <Icon name="flag" className="text-lg" />
        </button>
        <button
          onClick={handleToggleBlock}
          disabled={blockBusy}
          aria-label={blocked ? '取消拉黑' : '拉黑用户'}
          className={`w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 active:scale-90 transition-all shrink-0 disabled:opacity-40 ${blocked ? 'text-red-500' : 'text-gray-400'}`}
        >
          <Icon name="block" className="text-lg" />
        </button>
      </div>

      {/* ── 拉黑状态横幅 ── */}
      {blocked && (
        <div className="flex items-center justify-between gap-2 px-4 py-2 bg-red-50 border-b border-red-100 shrink-0">
          <span className="text-xs text-red-500">已拉黑该用户，双方无法互发私信</span>
          <button
            onClick={handleToggleBlock}
            disabled={blockBusy}
            className="text-xs text-primary font-medium disabled:opacity-40"
          >
            取消拉黑
          </button>
        </div>
      )}

      {/* ── 陌生人会话：发起方等待中横幅 ── */}
      {isPendingInitiator && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-100 shrink-0">
          <span className="text-xs text-amber-600">消息已发送，等待对方回复后才能继续聊天</span>
        </div>
      )}

      <ReportModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="chat_message"
        targetId={latestOtherMsg?.id ?? null}
        onSubmitted={() => {
          if (reportShouldBlock) {
            dmApi
              .blockUser(otherUser.id)
              .then((res) => {
                if (res.code === 0) setBlocked(true);
              })
              .catch(() => {});
          }
        }}
      />

      {/* ── 消息区域 ── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onClick={() => setShowEmoji(false)}
        className="flex-1 overflow-y-auto px-3 py-2"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {hasMore && (
          <div className="flex justify-center py-3">
            {loading ? (
              <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
            ) : (
              <span className="text-[10px] text-gray-400">下拉加载更早消息</span>
            )}
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
          const isRecalled = !!msg.recalledAt;
          const canRecall = isMine && !isRecalled && Date.now() - new Date(msg.createdAt).getTime() < 2 * 60 * 1000;
          const replyMsg = msg.replyToId ? messages.find((m) => m.id === msg.replyToId) : null;
          return (
            <div key={msg.id}>
              {showTime && (
                <div className="flex justify-center my-3">
                  <span className="text-[10px] text-gray-400 bg-white/60 px-2.5 py-0.5 rounded-full">
                    {formatChatTime(msg.createdAt)}
                  </span>
                </div>
              )}
              <div className="flex flex-col items-end mb-1">
                {/* 操作按钮 */}
                {!isRecalled && (
                  <div className={`flex gap-1 mb-0.5 ${isMine ? 'justify-end' : 'justify-start ml-10'}`}>
                    <button
                      onClick={() => setReplyTo(msg)}
                      className="text-[10px] text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded hover:bg-gray-100 transition-colors"
                    >
                      回复
                    </button>
                    {canRecall && onRecall && (
                      <button
                        onClick={async () => {
                          const ok = await onRecall(msg.id);
                          if (!ok) alert('撤回失败，消息可能已超过2分钟或已被撤回');
                        }}
                        className="text-[10px] text-gray-400 hover:text-red-500 px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors"
                      >
                        撤回
                      </button>
                    )}
                  </div>
                )}
                <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} w-full`}>
                  {!isMine && (
                    <div className="shrink-0 mr-2 mt-1">
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
                  <div className={`max-w-[70%] ${!isMine && 'ml-0'}`}>
                    {isRecalled ? (
                      <div
                        className={`px-3 py-2 text-xs italic ${isMine ? 'text-gray-400 text-right' : 'text-gray-400'}`}
                      >
                        {isMine ? '你撤回了这条消息' : '对方撤回了这条消息'}
                      </div>
                    ) : msg.imageUrl ? (
                      <a href={msg.imageUrl} target="_blank" rel="noreferrer">
                        <img
                          src={msg.imageUrl}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="rounded-2xl max-w-full max-h-60 object-cover border border-black/5 bg-white"
                        />
                      </a>
                    ) : (
                      <div
                        onClick={() => handleCopyMessage(msg)}
                        className={`px-3 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap relative group cursor-pointer ${
                          isMine
                            ? 'bg-[#576b95] text-white rounded-[16px_4px_16px_16px]'
                            : 'bg-white text-gray-800 rounded-[4px_16px_16px_16px] shadow-sm'
                        }`}
                      >
                        {/* 引用回复预览 */}
                        {replyMsg && (
                          <div
                            className={`mb-1.5 pl-2 border-l-2 text-xs ${
                              isMine ? 'border-white/40 text-white/70' : 'border-gray-300 text-gray-500'
                            }`}
                          >
                            <div className="font-medium truncate max-w-[200px]">
                              {replyMsg.senderId === currentUserId ? '你' : otherUser.nickname}
                            </div>
                            <div className="truncate max-w-[200px]">{replyMsg.content || '[图片]'}</div>
                          </div>
                        )}
                        {msg.content}
                        {copiedMsgId === msg.id && (
                          <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] px-2 py-0.5 rounded bg-gray-800 text-white whitespace-nowrap">
                            已复制
                          </span>
                        )}
                      </div>
                    )}
                    {isMine && !isRecalled && (
                      <div className="text-right mt-0.5 mr-1">
                        <span className="text-[9px] text-gray-400">{msg.isRead ? '已读' : '未读'}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* ── 引用回复预览 ── */}
      {replyTo && (
        <div className="bg-white border-t border-gray-100 px-3 py-2 flex items-center gap-2 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-primary font-medium truncate">
              回复 {replyTo.senderId === currentUserId ? '自己' : otherUser.nickname}
            </div>
            <div className="text-[11px] text-gray-500 truncate">{replyTo.content || '[图片]'}</div>
          </div>
          <button
            onClick={() => setReplyTo(null)}
            className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 shrink-0"
          >
            <Icon name="close" className="text-sm" />
          </button>
        </div>
      )}

      {/* ── 陌生人会话：接收方三按钮，不给自由输入框 ── */}
      {isPendingRecipient ? (
        <div className="bg-white border-t border-gray-100 px-4 py-3 flex items-center gap-2 shrink-0 pb-safe">
          <button
            onClick={handleAccept}
            disabled={accepting}
            className="flex-1 h-10 rounded-full bg-[#576b95] text-white text-sm font-medium disabled:opacity-40 active:scale-95 transition-all"
          >
            {accepting ? '处理中…' : '继续聊天'}
          </button>
          <button
            onClick={onBack}
            className="h-10 px-4 rounded-full border border-gray-200 text-gray-500 text-sm font-medium active:scale-95 transition-all"
          >
            忽略
          </button>
          <button
            onClick={() => {
              setReportShouldBlock(true);
              setReportOpen(true);
            }}
            disabled={!latestOtherMsg}
            className="h-10 px-4 rounded-full border border-red-200 text-red-500 text-sm font-medium disabled:opacity-40 active:scale-95 transition-all"
          >
            举报并拉黑
          </button>
        </div>
      ) : (
        <>
          {/* ── 输入栏 ── */}
          <div className="bg-white border-t border-gray-100 px-3 pt-2 pb-2 flex items-end gap-2 shrink-0 pb-safe">
            {/* 表情 */}
            <button
              onClick={() => {
                setShowEmoji((v) => !v);
              }}
              aria-label="表情"
              className="w-9 h-10 flex items-center justify-center text-gray-500 hover:text-gray-700 shrink-0 active:scale-90 transition-all"
            >
              <Icon name={showEmoji ? 'keyboard' : 'mood'} className="text-xl" />
            </button>
            {/* 图片：陌生人 pending 期间发起方不能发图，服务端也会拦截，这里前端预判提升体验 */}
            <button
              onClick={() => imageInputRef.current?.click()}
              disabled={uploading || isPendingInitiator}
              aria-label="发送图片"
              className="w-9 h-10 flex items-center justify-center text-gray-500 hover:text-gray-700 shrink-0 active:scale-90 transition-all disabled:opacity-40"
            >
              {uploading ? (
                <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
              ) : (
                <Icon name="image" className="text-xl" />
              )}
            </button>
            <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />

            <label className="flex-1 flex items-center bg-[#f5f5f5] rounded-3xl px-4 cursor-text min-h-[40px]">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setShowEmoji(false)}
                disabled={pendingInitiatorQuotaUsed}
                placeholder={pendingInitiatorQuotaUsed ? '等待对方回复后才能继续发送…' : '发送消息…'}
                maxLength={2000}
                enterKeyHint="send"
                autoComplete="off"
                className="w-full bg-transparent py-2 text-[15px] text-gray-800 placeholder-gray-400 outline-none disabled:cursor-not-allowed"
              />
            </label>
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending || pendingInitiatorQuotaUsed}
              aria-label="发送"
              className="h-10 px-4 flex items-center justify-center rounded-full bg-[#576b95] text-white text-sm font-medium shrink-0 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
            >
              {sending ? (
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                '发送'
              )}
            </button>
          </div>

          {/* ── 表情面板 ── */}
          {showEmoji && (
            <div className="bg-white border-t border-gray-100 px-3 py-3 grid grid-cols-8 gap-1 shrink-0 pb-safe max-h-52 overflow-y-auto">
              {EMOJIS.map((em) => (
                <button
                  key={em}
                  onClick={() => insertEmoji(em)}
                  className="text-2xl h-10 flex items-center justify-center rounded-lg hover:bg-slate-100 active:scale-90 transition-all"
                >
                  {em}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
