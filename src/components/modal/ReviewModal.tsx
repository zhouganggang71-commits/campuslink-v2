/**
 * 交易评价弹窗（R12 Phase 2）— 1-5 星 + 文字评价
 */
import { useState } from 'react';
import { Transaction } from '../../types';
import Icon from '../ui/Icon';

interface Props {
  transaction: Transaction;
  onClose: () => void;
  onSubmit: (rating: number, comment: string) => void;
}

export default function ReviewModal({ transaction, onClose, onSubmit }: Props) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  const labels = ['', '很差', '较差', '一般', '满意', '非常满意'];

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="bg-surface-white w-full max-w-sm rounded-2xl p-5 animate-fade-in shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-base font-bold text-center">评价交易</div>
        <div className="text-xs text-on-surface-variant text-center mt-1">
          {transaction.postTitle} · 对方 {transaction.otherName}
        </div>

        {/* 星级 */}
        <div className="flex justify-center gap-2 mt-4">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setRating(n)}
              aria-label={`${n} 星`}
              className="text-3xl cursor-pointer transition-transform active:scale-90"
            >
              <Icon
                name={n <= rating ? 'favorite' : 'favorite_border'}
                className={`${n <= rating ? 'text-course-red' : 'text-on-surface-variant/30'}`}
              />
            </button>
          ))}
        </div>
        <div className="text-center text-xs text-on-surface-variant mt-1 h-4">
          {rating ? labels[rating] : '点击星星评分'}
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, 200))}
          placeholder="说说这次交易体验（选填，最多 200 字）"
          rows={3}
          className="w-full mt-3 bg-on-surface/5 border border-outline-variant/60 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary resize-none"
        />

        <div className="flex gap-2 mt-4">
          <button
            onClick={onClose}
            className="flex-1 bg-on-surface/5 text-on-surface-variant text-sm font-semibold py-2.5 rounded-xl cursor-pointer active:scale-[0.98] transition-transform"
          >
            取消
          </button>
          <button
            onClick={() => rating > 0 && onSubmit(rating, comment.trim())}
            disabled={rating === 0}
            className={`flex-1 text-sm font-semibold py-2.5 rounded-xl cursor-pointer active:scale-[0.98] transition-transform ${rating > 0 ? 'bg-course-green text-white' : 'bg-on-surface/5 text-on-surface-variant/50'}`}
          >
            提交评价
          </button>
        </div>
      </div>
    </div>
  );
}
