/**
 * 举报申诉弹窗 —— 内容因被多人举报自动/人工软隐藏后，作者本人在这里说明情况，管理员审核。
 * 打开时先查一次自己的申诉状态：没提交过给空表单；被驳回过预填原文允许改了重新提交；
 * 已通过则内容已经恢复可见，不用再申诉，只展示结果。
 */
import { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { reportsApi } from '../../api';
import type { ReportAppeal } from '../../types';

interface ReportAppealModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: 'post' | 'circle_post' | 'circle_comment';
  targetId: number | null;
}

export default function ReportAppealModal({ isOpen, onClose, targetType, targetId }: ReportAppealModalProps) {
  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState<ReportAppeal | null>(null);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || !targetId) return;
    setLoading(true);
    setJustSubmitted(false);
    setError('');
    reportsApi
      .myAppeal(targetType, targetId)
      .then((res) => {
        if (res.code === 0) {
          setExisting(res.data || null);
          setText(res.data?.appealText || '');
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [isOpen, targetType, targetId]);

  const handleSubmit = async () => {
    if (!targetId || !text.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await reportsApi.submitAppeal(targetType, targetId, text.trim());
      if (res.code === 0) {
        setJustSubmitted(true);
      } else {
        setError(res.message || '提交失败');
      }
    } catch {
      setError('网络异常，请重试');
    }
    setSubmitting(false);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="申诉" size="sm">
      {loading ? (
        <div className="py-6 text-center text-sm text-gray-400">加载中…</div>
      ) : existing?.status === 'approved' ? (
        <div className="py-4 text-center">
          <p className="text-sm text-emerald-600 font-medium">申诉已通过，内容已恢复可见</p>
        </div>
      ) : justSubmitted ? (
        <div className="py-4 text-center">
          <p className="text-sm text-gray-600">申诉已提交，管理员会尽快审核。</p>
          <Button variant="primary" className="mt-4" onClick={onClose}>
            关闭
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {existing?.status === 'rejected' && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 text-xs text-amber-700">
              上次申诉被驳回{existing.adminNote ? `：${existing.adminNote}` : ''}。可以修改理由后重新提交。
            </div>
          )}
          {existing?.status === 'pending' && (
            <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 text-xs text-gray-500">
              已提交申诉，审核中。可以修改后重新提交，会覆盖之前的内容。
            </div>
          )}
          <p className="text-xs text-gray-400">这条内容因被多人举报已自动隐藏，说明一下情况：</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="说明为什么这不是违规内容"
            maxLength={500}
            rows={4}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary resize-none"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <Button variant="primary" block disabled={!text.trim() || submitting} onClick={handleSubmit}>
            {submitting ? '提交中…' : '提交申诉'}
          </Button>
        </div>
      )}
    </Modal>
  );
}
