/**
 * 私信数据层 — 会话列表、当前聊天、轮询
 */
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Conversation, ChatMessage } from '../types';
import { dmApi } from '../api/messages';
import { getToken } from '../utils/api';

export interface ActiveChat {
  conversationId: number;
  otherUser: Conversation['otherUser'];
  messages: ChatMessage[];
  hasMore: boolean;
  loading: boolean;
}

export function useDirectMessages() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [activeChat, setActiveChat] = useState<ActiveChat | null>(null);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const convPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const dmUnreadCount = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  // 从 JWT 解析当前用户数据库 ID（依赖 token，登录后会重算，避免游客→登录残留 0）
  const tokenVal = getToken();
  const currentUserId = useMemo(() => {
    try {
      if (!tokenVal) return 0;
      const payload = JSON.parse(atob(tokenVal.split('.')[1]));
      return payload?.uid || 0;
    } catch {
      return 0;
    }
  }, [tokenVal]);

  // ── 加载会话列表 ──
  const loadConversations = useCallback(() => {
    if (!getToken()) return;
    dmApi.listConversations()
      .then((res) => {
        if (res.code === 0 && res.data) setConversations(res.data);
      })
      .catch(() => {});
  }, []);

  // ── 会话列表轮询（15s） ──
  useEffect(() => {
    if (!getToken()) return;
    loadConversations();
    const startPoll = () => {
      convPollRef.current = setInterval(() => loadConversations(), 15_000);
    };
    const stopPoll = () => {
      if (convPollRef.current) { clearInterval(convPollRef.current); convPollRef.current = null; }
    };
    const onVisibility = () => {
      if (document.hidden) { stopPoll(); }
      else { loadConversations(); startPoll(); }
    };
    startPoll();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopPoll();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [loadConversations]);

  // ── 打开聊天 ──
  const openChat = useCallback(async (conversationId: number, otherUser: Conversation['otherUser']) => {
    // 先标记已读
    dmApi.markRead(conversationId).catch(() => {});

    setActiveChat({
      conversationId,
      otherUser,
      messages: [],
      hasMore: false,
      loading: true,
    });

    try {
      const res = await dmApi.getMessages(conversationId);
      if (res.code === 0 && res.data) {
        setActiveChat((prev) => prev ? {
          ...prev,
          messages: res.data!.messages,
          hasMore: res.data!.hasMore,
          loading: false,
        } : null);
      } else {
        setActiveChat((prev) => prev ? { ...prev, loading: false } : null);
      }
    } catch {
      setActiveChat((prev) => prev ? { ...prev, loading: false } : null);
    }
  }, []);

  // ── 关闭聊天 ──
  const closeChat = useCallback(() => {
    setActiveChat(null);
  }, []);

  // ── 聊天消息轮询（3s，仅聊天打开时） ──
  useEffect(() => {
    if (!activeChat) {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
      return;
    }

    const poll = () => {
      // 获取最新消息（取当前最新消息 id 作为 since 参数）
      const latestId = activeChat.messages.length > 0
        ? activeChat.messages[activeChat.messages.length - 1].id
        : 0;
      dmApi.getMessages(activeChat.conversationId)
        .then((res) => {
          if (res.code === 0 && res.data) {
            setActiveChat((prev) => {
              if (!prev) return null;
              const newMsgs = res.data!.messages.filter(
                (m: ChatMessage) => m.id > latestId,
              );
              if (newMsgs.length === 0) return prev;
              // 标记对方消息为已读
              const otherNewMsgs = newMsgs.filter((m: ChatMessage) => m.senderId !== prev.otherUser.id);
              if (otherNewMsgs.length === 0) {
                dmApi.markRead(prev.conversationId).catch(() => {});
              }
              return {
                ...prev,
                messages: [...prev.messages, ...newMsgs],
              };
            });
            // 刷新会话列表
            loadConversations();
          }
        })
        .catch(() => {});
    };

    poll();
    pollingRef.current = setInterval(poll, 3_000);

    return () => {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    };
  }, [activeChat?.conversationId, loadConversations]);

  // ── 加载更早的消息 ──
  const loadMoreMessages = useCallback(async () => {
    if (!activeChat || !activeChat.hasMore || activeChat.loading) return;
    const oldestId = activeChat.messages[0]?.id;
    if (!oldestId) return;

    setActiveChat((prev) => prev ? { ...prev, loading: true } : null);
    try {
      const res = await dmApi.getMessages(activeChat.conversationId, oldestId);
      if (res.code === 0 && res.data) {
        setActiveChat((prev) => prev ? {
          ...prev,
          messages: [...res.data!.messages, ...prev.messages],
          hasMore: res.data!.hasMore,
          loading: false,
        } : null);
      } else {
        setActiveChat((prev) => prev ? { ...prev, loading: false } : null);
      }
    } catch {
      setActiveChat((prev) => prev ? { ...prev, loading: false } : null);
    }
  }, [activeChat]);

  // ── 发送消息（乐观更新） ──
  const sendMessage = useCallback(async (content: string) => {
    if (!activeChat || !content.trim()) return false;

    const tempId = Date.now();
    const optimisticMsg: ChatMessage = {
      id: tempId,
      conversationId: activeChat.conversationId,
      senderId: 0, // 会被服务端覆盖
      content: content.trim(),
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    // 乐观插入
    setActiveChat((prev) => prev ? {
      ...prev,
      messages: [...prev.messages, optimisticMsg],
    } : null);

    try {
      const res = await dmApi.sendMessage(activeChat.conversationId, content.trim());
      if (res.code === 0 && res.data) {
        // 替换临时消息为服务端返回的
        setActiveChat((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            messages: prev.messages.map((m) => m.id === tempId ? res.data! : m),
          };
        });
        loadConversations();
        return true;
      } else {
        // 发送失败，移除临时消息
        setActiveChat((prev) => prev ? {
          ...prev,
          messages: prev.messages.filter((m) => m.id !== tempId),
        } : null);
        return false;
      }
    } catch {
      setActiveChat((prev) => prev ? {
        ...prev,
        messages: prev.messages.filter((m) => m.id !== tempId),
      } : null);
      return false;
    }
  }, [activeChat, loadConversations]);

  // ── 从 ProfilePage 发起聊天 ──
  const startChat = useCallback(async (targetUserId: number) => {
    if (!targetUserId || targetUserId <= 0) {
      return { code: -1, message: '用户信息异常，无法发起私信', data: null };
    }
    // debug: 线上排查 currentUserId 是否为 0
    if (!currentUserId) console.warn('[DM] currentUserId is 0, JWT uid may be missing', { tokenVal: !!getToken() });
    const res = await dmApi.findOrCreate(targetUserId);
    if (res.code === 0 && res.data) {
      openChat(res.data.id, res.data.otherUser);
    }
    return res; // 返回完整响应，上层可展示真实错误信息
  }, [openChat, currentUserId]);

  return {
    conversations,
    conversationsLoading,
    dmUnreadCount,
    currentUserId,
    activeChat,
    openChat,
    closeChat,
    sendMessage,
    loadMoreMessages,
    startChat,
    loadConversations,
  };
}
