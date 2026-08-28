/**
 * 私信数据层 — 会话列表、当前聊天、轮询
 */
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Conversation, ChatMessage, PendingConversation } from '../types';
import { dmApi } from '../api/messages';
import { getToken } from '../utils/api';

export interface ActiveChat {
  conversationId: number;
  otherUser: Conversation['otherUser'];
  messages: ChatMessage[];
  hasMore: boolean;
  loading: boolean;
  /** 'pending' = 陌生人首次会话待接受 */
  status: 'pending' | 'active';
  isInitiator: boolean;
}

export function useDirectMessages() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const conversationsLoading = false;
  const [pendingConversations, setPendingConversations] = useState<PendingConversation[]>([]);
  const [activeChat, setActiveChat] = useState<ActiveChat | null>(null);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const convPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeChatRef = useRef(activeChat);
  activeChatRef.current = activeChat; // 轮询闭包始终读到最新 activeChat

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
    dmApi
      .listConversations()
      .then((res) => {
        if (res.code === 0 && res.data) setConversations(res.data);
      })
      .catch(() => {});
  }, []);

  // ── 加载陌生人消息（我是接收方、对方发起、还未接受）──
  const loadPending = useCallback(() => {
    if (!getToken()) return;
    dmApi
      .listPending()
      .then((res) => {
        if (res.code === 0 && res.data) setPendingConversations(res.data);
      })
      .catch(() => {});
  }, []);

  // ── 会话列表轮询（15s，陌生人消息列表跟着一起刷）──
  useEffect(() => {
    if (!getToken()) return;
    loadConversations();
    loadPending();
    const startPoll = () => {
      convPollRef.current = setInterval(() => {
        loadConversations();
        loadPending();
      }, 15_000);
    };
    const stopPoll = () => {
      if (convPollRef.current) {
        clearInterval(convPollRef.current);
        convPollRef.current = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) {
        stopPoll();
      } else {
        loadConversations();
        loadPending();
        startPoll();
      }
    };
    startPoll();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopPoll();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [loadConversations, loadPending]);

  // ── 打开聊天（status/isInitiator 决定 pending 态下渲染哪种 UI，缺省按 active/非发起人处理）──
  const openChat = useCallback(
    async (
      conversationId: number,
      otherUser: Conversation['otherUser'],
      status: 'pending' | 'active' = 'active',
      isInitiator = false,
    ) => {
      // pending 态下接收方还不能自由收发，已读标记对发起方等待中的会话也无害，正常打
      dmApi.markRead(conversationId).catch(() => {});

      setActiveChat({
        conversationId,
        otherUser,
        messages: [],
        hasMore: false,
        loading: true,
        status,
        isInitiator,
      });

      try {
        const res = await dmApi.getMessages(conversationId);
        if (res.code === 0 && res.data) {
          setActiveChat((prev) =>
            prev
              ? {
                  ...prev,
                  messages: res.data!.messages,
                  hasMore: res.data!.hasMore,
                  loading: false,
                }
              : null,
          );
        } else {
          setActiveChat((prev) => (prev ? { ...prev, loading: false } : null));
        }
      } catch {
        setActiveChat((prev) => (prev ? { ...prev, loading: false } : null));
      }
    },
    [],
  );

  // ── 接受陌生人会话（接收方显式点"继续聊天"）──
  const acceptChat = useCallback(async () => {
    const chat = activeChatRef.current;
    if (!chat) return false;
    try {
      const res = await dmApi.acceptConversation(chat.conversationId);
      if (res.code === 0) {
        setActiveChat((prev) => (prev ? { ...prev, status: 'active' } : null));
        loadConversations();
        loadPending();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [loadConversations, loadPending]);

  // ── 关闭聊天 ──
  const closeChat = useCallback(() => {
    setActiveChat(null);
  }, []);

  // ── 聊天消息轮询（3s，仅聊天打开时） ──
  useEffect(() => {
    if (!activeChat) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    const poll = () => {
      const chat = activeChatRef.current;
      if (!chat) return;
      // 获取最新消息（取当前最新消息 id 作为 since 参数）
      const latestId = chat.messages.length > 0 ? chat.messages[chat.messages.length - 1].id : 0;
      dmApi
        .getMessages(chat.conversationId, undefined, latestId)
        .then((res) => {
          if (res.code === 0 && res.data) {
            setActiveChat((prev) => {
              if (!prev) return null;
              const newMsgs = res.data!.messages.filter((m: ChatMessage) => m.id > latestId);
              if (newMsgs.length === 0) return prev;
              // 只要轮询到对方发的新消息，就标记已读
              const hasMsgFromOther = newMsgs.some((m: ChatMessage) => m.senderId === prev.otherUser.id);
              if (hasMsgFromOther) {
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
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [activeChat?.conversationId, loadConversations]);

  // ── 加载更早的消息 ──
  const loadMoreMessages = async () => {
    const chat = activeChatRef.current;
    if (!chat || !chat.hasMore || chat.loading) return;
    const oldestId = chat.messages[0]?.id;
    if (!oldestId) return;

    setActiveChat((prev) => (prev ? { ...prev, loading: true } : null));
    try {
      const res = await dmApi.getMessages(chat.conversationId, oldestId);
      if (res.code === 0 && res.data) {
        setActiveChat((prev) =>
          prev
            ? {
                ...prev,
                messages: [...res.data!.messages, ...prev.messages],
                hasMore: res.data!.hasMore,
                loading: false,
              }
            : null,
        );
      } else {
        setActiveChat((prev) => (prev ? { ...prev, loading: false } : null));
      }
    } catch {
      setActiveChat((prev) => (prev ? { ...prev, loading: false } : null));
    }
  };

  // ── 发送消息（乐观更新，支持引用回复） ──
  const sendMessage = async (content: string, imageUrl?: string, replyToId?: number) => {
    const chat = activeChatRef.current;
    if (!chat || (!content.trim() && !imageUrl)) return false;

    const tempId = Date.now();
    const optimisticMsg: ChatMessage = {
      id: tempId,
      conversationId: chat.conversationId,
      senderId: currentUserId, // 乐观显示为自己
      content: content.trim(),
      imageUrl: imageUrl || null,
      isRead: false,
      recalledAt: null,
      replyToId: replyToId || null,
      createdAt: new Date().toISOString(),
    };

    // 乐观插入
    setActiveChat((prev) =>
      prev
        ? {
            ...prev,
            messages: [...prev.messages, optimisticMsg],
          }
        : null,
    );

    try {
      const res = await dmApi.sendMessage(chat.conversationId, content.trim(), imageUrl, replyToId);
      if (res.code === 0 && res.data) {
        // 替换临时消息为服务端返回的
        setActiveChat((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            messages: prev.messages.map((m) => (m.id === tempId ? res.data! : m)),
          };
        });
        loadConversations();
        return true;
      } else {
        // 发送失败，移除临时消息
        setActiveChat((prev) =>
          prev
            ? {
                ...prev,
                messages: prev.messages.filter((m) => m.id !== tempId),
              }
            : null,
        );
        return false;
      }
    } catch {
      setActiveChat((prev) =>
        prev
          ? {
              ...prev,
              messages: prev.messages.filter((m) => m.id !== tempId),
            }
          : null,
      );
      return false;
    }
  };

  // ── 撤回消息 ──
  const recallMessage = async (messageId: number) => {
    const chat = activeChatRef.current;
    if (!chat) return false;
    try {
      const res = await dmApi.recallMessage(chat.conversationId, messageId);
      if (res.code === 0) {
        // 更新本地消息为已撤回
        setActiveChat((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            messages: prev.messages.map((m) =>
              m.id === messageId ? { ...m, content: '', imageUrl: null, recalledAt: new Date().toISOString() } : m,
            ),
          };
        });
        loadConversations();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  // ── 从 ProfilePage 发起聊天 ──
  const startChat = useCallback(
    async (targetUserId: number) => {
      if (!targetUserId || targetUserId <= 0) {
        return { code: -1, message: '用户信息异常，无法发起私信', data: null };
      }
      const res = await dmApi.findOrCreate(targetUserId);
      if (res.code === 0 && res.data) {
        openChat(res.data.id, res.data.otherUser, res.data.status || 'active', !!res.data.isInitiator);
      }
      return res; // 返回完整响应，上层可展示真实错误信息
    },
    [openChat],
  );

  return {
    conversations,
    conversationsLoading,
    pendingConversations,
    pendingCount: pendingConversations.length,
    dmUnreadCount,
    currentUserId,
    activeChat,
    openChat,
    acceptChat,
    closeChat,
    sendMessage,
    recallMessage,
    loadMoreMessages,
    startChat,
    loadConversations,
    loadPending,
  };
}
