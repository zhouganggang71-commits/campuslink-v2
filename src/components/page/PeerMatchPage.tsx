/**
 * 校内寻伴页（R12 Phase 3）— 覆盖层
 *
 * 对标竞品链千校"校内寻伴"，但用认证数据升级：
 *  - 链千校靠用户自填学院；CampusLink 的 department/major 来自教务扫码（真实可信）
 *  - 匹配范围：同专业（major）> 同院系（department）> 全部
 *  - 排除：自己、已拉黑、未认证用户；不吐学号
 *  - "打招呼"直接发起私信（复用现有私信，陌生人 pending 门槛已有）
 */
import { useCallback, useEffect, useState } from 'react';
import { request } from '../../api/client';
import Icon from '../ui/Icon';

interface Peer {
  userId: number;
  nickname: string;
  avatarUrl: string | null;
  department: string;
  major: string;
  lastActive: string | null;
  reputationScore: number;
  reviewCount: number;
  isSameMajor: boolean;
  isSameDept: boolean;
}

interface Props {
  /** 我的院系（来自 profile.department） */
  myDepartment: string;
  onBack: () => void;
  /** 打招呼 → 发起私信 */
  onStartChat: (userId: number) => void;
  showToast: (msg: string, type?: 'success' | 'info') => void;
  isGuest: boolean;
  onAuth: () => void;
}

export default function PeerMatchPage({ myDepartment, onBack, onStartChat, showToast, isGuest, onAuth }: Props) {
  const [scope, setScope] = useState<'major' | 'department' | 'all'>('major');
  const [list, setList] = useState<Peer[]>([]);
  const [myMajor, setMyMajor] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    if (isGuest) return;
    setLoading(true);
    request('GET', `/api/v1/users/peers?scope=${scope}&limit=30`)
      .then((r: any) => {
        if (r.code === 0 && r.data) {
          setList(r.data.list || []);
          setMyMajor(r.data.my?.major || '');
        } else if (r.code === 401) {
          onAuth();
        }
      })
      .catch(() => showToast('加载失败，请检查网络', 'info'))
      .finally(() => setLoading(false));
  }, [scope, isGuest, onAuth, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const scopes: { key: 'major' | 'department' | 'all'; label: string }[] = [
    { key: 'major', label: '同专业' },
    { key: 'department', label: '同院系' },
    { key: 'all', label: '全部' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col animate-fade-in">
      {/* 顶栏 */}
      <div className="flex items-center gap-1.5 px-3 h-12 shrink-0 bg-background/95 backdrop-blur border-b border-outline-variant/40">
        <button
          onClick={onBack}
          aria-label="返回"
          className="w-9 h-9 flex items-center justify-center cursor-pointer hover:bg-on-surface/5 rounded-full transition-colors shrink-0"
        >
          <Icon name="arrow_back" className="text-xl" />
        </button>
        <span className="text-[15px] font-semibold">校内寻伴</span>
        {myDepartment && (
          <span className="ml-auto text-[10px] text-on-surface-variant bg-on-surface/5 px-2 py-1 rounded-full">
            {myDepartment}
            {myMajor ? ` · ${myMajor}` : ''}
          </span>
        )}
      </div>

      {isGuest ? (
        <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant p-8 text-center">
          <Icon name="handshake" className="text-5xl mb-4 text-on-surface-variant/30" />
          <p className="text-sm font-semibold">认证后才能匹配</p>
          <p className="text-xs mt-2 mb-6">扫码登录教务系统后，你的院系/专业会被自动认证，匹配更可信</p>
          <button
            onClick={onAuth}
            className="bg-primary text-white text-sm font-semibold px-6 py-2.5 rounded-full cursor-pointer active:scale-[0.97] transition-transform"
          >
            去认证
          </button>
        </div>
      ) : (
        <>
          {/* 范围切换 */}
          <div className="flex gap-2 px-4 py-3 shrink-0">
            {scopes.map((s) => (
              <button
                key={s.key}
                onClick={() => setScope(s.key)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                  scope === s.key
                    ? 'bg-primary text-white'
                    : 'bg-on-surface/5 text-on-surface-variant hover:bg-on-surface/10'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+40px)]">
            {loading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="card-float rounded-2xl p-4 animate-pulse">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full bg-on-surface/10" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 bg-on-surface/10 rounded w-1/3" />
                        <div className="h-2 bg-on-surface/5 rounded w-1/2" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : list.length === 0 ? (
              <div className="text-center text-on-surface-variant text-sm py-20">
                <Icon name="handshake" className="text-4xl mx-auto mb-3 text-on-surface-variant/30" />
                没有找到匹配的同学
                <p className="text-xs mt-1">试试切换范围，或等更多同学完成认证</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {list.map((p) => (
                  <div key={p.userId} className="card-float rounded-2xl p-4 flex items-center gap-3">
                    {p.avatarUrl ? (
                      <img
                        src={p.avatarUrl}
                        alt=""
                        className="w-11 h-11 rounded-full object-cover shrink-0 bg-on-surface/5"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-on-surface/5 flex items-center justify-center text-on-surface-variant/40 shrink-0">
                        <Icon name="person" className="text-xl" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold">{p.nickname}</span>
                        {p.isSameMajor && (
                          <span className="bg-course-green/10 text-course-green text-[9px] font-semibold px-1.5 py-0.5 rounded-full">
                            同专业
                          </span>
                        )}
                        {!p.isSameMajor && p.isSameDept && (
                          <span className="bg-course-blue/10 text-course-blue text-[9px] font-semibold px-1.5 py-0.5 rounded-full">
                            同院系
                          </span>
                        )}
                        {p.reviewCount > 0 && (
                          <span className="bg-course-gold/10 text-course-gold text-[9px] font-semibold px-1.5 py-0.5 rounded-full">
                            ★ {p.reputationScore.toFixed(1)}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-on-surface-variant mt-0.5 truncate">
                        {p.department || '未填院系'}
                        {p.major ? ` · ${p.major}` : ''}
                      </div>
                    </div>
                    <button
                      onClick={() => onStartChat(p.userId)}
                      className="shrink-0 bg-primary text-white text-xs font-semibold px-4 py-2 rounded-full cursor-pointer active:scale-[0.97] transition-transform flex items-center gap-1"
                    >
                      <Icon name="chat_bubble" className="text-sm" />
                      打招呼
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
