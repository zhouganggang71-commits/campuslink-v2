/**
 * 消息相关操作 — 标记已读、全部已读（乐观更新 + 服务端同步）
 */
import { Message } from '../types';
import { noticesApi } from '../api';

interface MessageDataLayer {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  showToast: (msg: string, type?: 'success' | 'info') => void;
}

export function useMessageActions(d: MessageDataLayer) {
  const handleMarkMessageRead = (messageId: string) => {
    d.setMessages((prev: Message[]) => prev.map((m) => (m.id === messageId ? { ...m, isRead: true } : m)));
    // 服务端同步（乐观更新，失败静默）
    noticesApi.markRead(messageId).catch(() => {});
  };

  const handleMarkAllRead = () => {
    d.setMessages((prev: Message[]) => prev.map((m) => ({ ...m, isRead: true })));
    d.showToast('所有消息已标记为已读');
    // 服务端同步
    noticesApi.markAllRead().catch(() => {});
  };

  const handleDeleteMessage = (messageId: string) => {
    const prevMessages = [...d.messages];
    d.setMessages((prev: Message[]) => prev.filter((m) => m.id !== messageId));
    noticesApi.delete(messageId)
      .catch(() => {
        d.setMessages(prevMessages);
        d.showToast('删除失败，请重试', 'info');
      });
  };

  return {
    handleMarkMessageRead,
    handleMarkAllRead,
    handleDeleteMessage,
  };
}
