/**
 * 我的交易页（R12 Phase 2/完善）— 覆盖层
 *
 * 面交交易全流程操作：
 *   pending     卖家→「同意并生成面交码」；买家→等待
 *   code_issued 卖家→码 + 复制 + 核销输入；买家→码（面交时向卖家报码）
 *   completed   双方→「评价」（弹 ReviewModal）
 *   取消/完成/纠纷 状态展示
 *
 * 完善：筛选 tab（全部/进行中/已完成/已取消）+ 面交码一键复制 + 时间线详情
 */
import { useCallback, useEffect, useState } from 'react';
import { Transaction } from '../../types';
import { transactionsApi } from '../../api';
import Icon from '../ui/Icon';
import ReviewModal from '../modal/ReviewModal';

interface Props {
  onBack: () => void;
  showToast: (msg: string, type?: 'success' | 'info') => void;
}

const STATUS_LABELS: Record<string, string> = {
  pending: '待确认',
  code_issued: '待面交',
  completed: '已完成',
  cancelled: '已取消',
  disputed: '纠纷中',
};

type FilterKey = 'all' | 'active' | 'completed' | 'cancelled';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '进行中' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' },
];

function formatExpires(iso: string | null): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return '已过期';
  const min = Math.ceil(ms / 60000);
  return `${min} 分钟内有效`;
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function TransactionsPage({ onBack, showToast }: Props) {
  const [list, setList] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewTx, setReviewTx] = useState<Transaction | null>(null);
  const [verifyInput, setVerifyInput] = useState<Record<number, string>>({});
  const [filter, setFilter] = useState<FilterKey>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    transactionsApi
      .mine()
      .then((r) => {
        if (r.code === 0) setList(r.data);
        else showToast(r.message || '加载失败', 'info');
      })
      .catch(() => showToast('加载失败，请检查网络', 'info'))
      .finally(() => setLoading(false));
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = list.filter((tx) => {
    if (filter === 'active') return tx.status === 'pending' || tx.status === 'code_issued';
    if (filter === 'completed') return tx.status === 'completed';
    if (filter === 'cancelled') return tx.status === 'cancelled';
    return true;
  });

  const handleAccept = (id: number) => {
    transactionsApi.accept(id).then((r) => {
      if (r.code === 0) {
        showToast('面交码已生成，请告知买家', 'success');
        load();
      } else showToast(r.message || '操作失败', 'info');
    });
  };

  const handleVerify = (id: number) => {
    const code = (verifyInput[id] || '').trim();
    if (!/^\d{6}$/.test(code)) {
      showToast('请输入 6 位面交码', 'info');
      return;
    }
    transactionsApi.verify(id, code).then((r) => {
      if (r.code === 0) {
        showToast('核销成功，交易完成！记得互相评价', 'success');
        load();
      } else showToast(r.message || '核销失败', 'info');
    });
  };

  const handleCopyCode = (code: string) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(code).then(
        () => showToast('面交码已复制，发给买家', 'success'),
        () => showToast('复制失败，请手动长按复制', 'info'),
      );
    } else {
      showToast('请长按面交码手动复制', 'info');
    }
  };

  const handleCancel = (id: number) => {
    transactionsApi.cancel(id).then((r) => {
      showToast(r.message || (r.code === 0 ? '已取消' : '取消失败'), r.code === 0 ? 'success' : 'info');
      if (r.code === 0) load();
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col animate-fade-in">
      <div className="flex items-center gap-1.5 px-3 h-12 shrink-0 bg-background/95 backdrop-blur border-b border-outline-variant/40">
        <button
          onClick={onBack}
          aria-label="返回"
          className="w-9 h-9 flex items-center justify-center cursor-pointer hover:bg-on-surface/5 rounded-full transition-colors shrink-0"
        >
          <Icon name="arrow_back" className="text-xl" />
        </button>
        <span className="text-[15px] font-semibold">我的交易</span>
      </div>

      {/* 筛选 tab */}
      <div className="flex gap-2 px-4 py-2.5 shrink-0 border-b border-outline-variant/30">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
              filter === f.key
                ? 'bg-primary text-white'
                : 'bg-on-surface/5 text-on-surface-variant hover:bg-on-surface/10'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain p-4 pb-[calc(env(safe-area-inset-bottom)+40px)]">
        {loading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="card-float rounded-2xl p-4 animate-pulse">
                <div className="h-4 bg-on-surface/10 rounded w-3/4 mb-3" />
                <div className="h-3 bg-on-surface/5 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-on-surface-variant text-sm py-20">
            <Icon name="shopping_bag" className="text-4xl mx-auto mb-3 text-on-surface-variant/30" />
            {filter === 'all' ? '还没有交易记录' : '该状态下暂无交易'}
            {filter === 'all' && <p className="text-xs mt-1">在二手商品详情页点「面交购买」发起</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((tx) => (
              <div key={tx.id} className="card-float rounded-2xl p-4">
                {/* 头部：帖子 + 状态（点击展开时间线） */}
                <button
                  onClick={() => setExpandedId(expandedId === tx.id ? null : tx.id)}
                  className="w-full flex items-start justify-between gap-2 text-left cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold line-clamp-1">{tx.postTitle}</div>
                    <div className="text-xs text-on-surface-variant mt-0.5">
                      {tx.myRole === 'seller' ? '卖' : '买'} · {tx.otherName}
                      {tx.postPrice ? ` · ¥${tx.postPrice}` : ''}
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                      tx.status === 'completed'
                        ? 'bg-course-green/10 text-course-green'
                        : tx.status === 'cancelled'
                          ? 'bg-on-surface/5 text-on-surface-variant'
                          : tx.status === 'code_issued'
                            ? 'bg-course-orange/10 text-course-orange'
                            : 'bg-course-blue/10 text-course-blue'
                    }`}
                  >
                    {STATUS_LABELS[tx.status]}
                  </span>
                </button>

                {/* 面交码区 */}
                {tx.status === 'code_issued' && tx.faceCode && (
                  <div className="mt-3 rounded-xl bg-primary/5 border border-primary/15 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[10px] text-on-surface-variant mb-1">
                          {tx.myRole === 'seller' ? '面交码（买家报码后核销）' : '面交码（面交时向卖家报码）'}
                        </div>
                        <div className="text-2xl font-bold tracking-[0.3em] text-primary font-mono">{tx.faceCode}</div>
                        <div className="text-[10px] text-course-orange mt-1">{formatExpires(tx.codeExpiresAt)}</div>
                      </div>
                      <button
                        onClick={() => tx.faceCode && handleCopyCode(tx.faceCode)}
                        className="shrink-0 bg-primary text-white text-xs font-semibold px-3 py-2 rounded-lg cursor-pointer active:scale-[0.97] transition-transform flex items-center gap-1"
                      >
                        <Icon name="content_copy" className="text-sm" />
                        复制
                      </button>
                    </div>
                    {tx.myRole === 'seller' && (
                      <div className="mt-2 flex gap-2">
                        <input
                          value={verifyInput[tx.id] || ''}
                          onChange={(e) =>
                            setVerifyInput((p) => ({ ...p, [tx.id]: e.target.value.replace(/\D/g, '').slice(0, 6) }))
                          }
                          placeholder="输入买家报的码"
                          inputMode="numeric"
                          className="flex-1 min-w-0 bg-white border border-outline-variant/60 rounded-lg px-3 py-2 text-sm font-mono tracking-widest focus:border-primary outline-none"
                        />
                        <button
                          onClick={() => handleVerify(tx.id)}
                          className="bg-primary text-white text-sm font-semibold px-4 py-2 rounded-lg cursor-pointer active:scale-[0.97] transition-transform"
                        >
                          核销
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* 时间线（点击展开） */}
                {expandedId === tx.id && (
                  <div className="mt-3 rounded-xl bg-on-surface/5 p-3 text-[11px] text-on-surface-variant space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-course-blue shrink-0" />
                      买家发起面交申请 · {fmtTime(tx.createdAt)}
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${tx.status === 'cancelled' ? 'bg-on-surface-variant' : 'bg-course-orange'}`}
                      />
                      最近更新 · {fmtTime(tx.updatedAt)}
                    </div>
                    {tx.status === 'completed' && (
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-course-green shrink-0" />
                        面交核销完成 · {fmtTime(tx.completedAt)}
                      </div>
                    )}
                    {tx.status === 'disputed' && (
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-course-red shrink-0" />
                        交易纠纷中，请等待管理员处理
                      </div>
                    )}
                  </div>
                )}

                {/* 操作按钮 */}
                <div className="mt-3 flex gap-2 justify-end">
                  {tx.status === 'pending' && tx.myRole === 'seller' && (
                    <>
                      <button
                        onClick={() => handleAccept(tx.id)}
                        className="bg-primary text-white text-xs font-semibold px-4 py-2 rounded-lg cursor-pointer active:scale-[0.97] transition-transform"
                      >
                        同意并生成面交码
                      </button>
                      <button
                        onClick={() => handleCancel(tx.id)}
                        className="bg-on-surface/5 text-on-surface-variant text-xs font-semibold px-4 py-2 rounded-lg cursor-pointer active:scale-[0.97] transition-transform"
                      >
                        取消
                      </button>
                    </>
                  )}
                  {tx.status === 'pending' && tx.myRole === 'buyer' && (
                    <>
                      <span className="text-xs text-on-surface-variant self-center">等待卖家确认</span>
                      <button
                        onClick={() => handleCancel(tx.id)}
                        className="bg-on-surface/5 text-on-surface-variant text-xs font-semibold px-4 py-2 rounded-lg cursor-pointer active:scale-[0.97] transition-transform"
                      >
                        取消申请
                      </button>
                    </>
                  )}
                  {tx.status === 'code_issued' && (
                    <button
                      onClick={() => handleCancel(tx.id)}
                      className="bg-on-surface/5 text-on-surface-variant text-xs font-semibold px-4 py-2 rounded-lg cursor-pointer active:scale-[0.97] transition-transform"
                    >
                      取消交易
                    </button>
                  )}
                  {tx.status === 'completed' && (
                    <button
                      onClick={() => setReviewTx(tx)}
                      className="bg-course-green text-white text-xs font-semibold px-4 py-2 rounded-lg cursor-pointer active:scale-[0.97] transition-transform"
                    >
                      评价
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {reviewTx && (
        <ReviewModal
          transaction={reviewTx}
          onClose={() => setReviewTx(null)}
          onSubmit={(rating, comment) => {
            transactionsApi.review(reviewTx.id, rating, comment).then((r) => {
              if (r.code === 0) {
                showToast('评价成功', 'success');
                setReviewTx(null);
                load();
              } else showToast(r.message || '评价失败', 'info');
            });
          }}
        />
      )}
    </div>
  );
}
