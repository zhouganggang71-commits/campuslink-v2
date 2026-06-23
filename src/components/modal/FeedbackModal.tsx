/**
 * 用户反馈/建议 — 提交弹窗
 */
import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { api } from '../../utils/api';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

export default function FeedbackModal({ isOpen, onClose, onSuccess }: FeedbackModalProps) {
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim() || content.trim().length < 2) return;
    setLoading(true);
    try {
      const res = await api.post('/feedback', { content: content.trim(), contact: contact.trim() });
      if (res.code === 0) {
        onSuccess('反馈已提交，感谢你的建议！');
        setContent('');
        setContact('');
        onClose();
      } else {
        onSuccess(res.message || '提交失败');
      }
    } catch {
      onSuccess('提交失败，请重试');
    }
    setLoading(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="意见反馈"
      subtitle="你的建议帮助我们做得更好"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" block onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            block
            onClick={handleSubmit}
            disabled={!content.trim() || content.trim().length < 2 || loading}
          >
            {loading ? '提交中...' : '提交反馈'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">反馈内容 *</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="请描述你的问题或建议..."
            rows={4}
            maxLength={2000}
            className="w-full bg-slate-50 border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary focus:outline-none transition-all resize-none"
          />
          <p className="text-[10px] text-gray-400 mt-1 text-right">{content.length}/2000</p>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">联系方式</label>
          <input
            type="text"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="QQ/微信/手机号（选填）"
            className="w-full bg-slate-50 border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary focus:outline-none transition-all"
          />
        </div>
        <div className="bg-slate-50 rounded-lg p-3 space-y-1">
          <p className="text-[10px] font-bold text-gray-500 mb-1">📞 直接联系管理员</p>
          <p className="text-[11px] text-gray-600">电话/微信：<span className="font-semibold text-primary">18227733797</span></p>
          <p className="text-[11px] text-gray-600">QQ：<span className="font-semibold text-primary">1831600978</span></p>
        </div>
      </div>
    </Modal>
  );
}
