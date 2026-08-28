/**
 * 通用举报弹窗 —— 帖子/圈子帖子/圈子评论/私信共用
 * 复用同一个 /reports 接口，只是 targetType/targetId 不同
 */
import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { reportsApi } from '../../api';
import type { ReportInput } from '../../types';

const REASONS: ReportInput['reason'][] = ['骚扰', '色情低俗', '诈骗', '人身攻击', '虚假信息', '其他'];

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: ReportInput['targetType'];
  targetId: number | null;
  /** 提交成功后的回调（比如私信场景顺带拉黑） */
  onSubmitted?: () => void;
}

export default function ReportModal({ isOpen, onClose, targetType, targetId, onSubmitted }: ReportModalProps) {
  const [reason, setReason] = useState<ReportInput['reason'] | null>(null);
  const [detail, setDetail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleClose = () => {
    setReason(null);
    setDetail('');
    setDone(false);
    setError('');
    onClose();
  };

  const handleSubmit = async () => {
    if (!reason || !targetId || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await reportsApi.submit({ targetType, targetId, reason, reasonDetail: detail.trim() || undefined });
      if (res.code === 0) {
        setDone(true);
        onSubmitted?.();
      } else {
        setError(res.message || '举报提交失败');
      }
    } catch {
      setError('网络异常，请重试');
    }
    setSubmitting(false);
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={done ? '已提交' : '举报'} size="sm">
      {done ? (
        <div className="py-4 text-center">
          <p className="text-sm text-gray-600">已收到你的举报，我们会尽快处理。</p>
          <Button variant="primary" className="mt-4" onClick={handleClose}>
            关闭
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">请选择举报理由</p>
          <div className="grid grid-cols-2 gap-2">
            {REASONS.map((r) => (
              <button
                key={r}
                onClick={() => setReason(r)}
                className={`py-2 px-3 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                  reason === r
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-gray-200 text-gray-600 hover:bg-slate-50'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="补充说明（选填）"
            maxLength={500}
            rows={3}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary resize-none"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <Button variant="danger" block disabled={!reason || submitting} onClick={handleSubmit}>
            {submitting ? '提交中…' : '提交举报'}
          </Button>
        </div>
      )}
    </Modal>
  );
}
