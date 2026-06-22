import { useState } from 'react';
import { StudentProfile, Listing } from '../../types';
import { useRegistrations } from '../../utils/regContext';
import Icon from '../ui/Icon';

interface ProfileTabProps {
  profile: StudentProfile;
  savedCount: number;
  listings: Listing[];
  savedListings: Listing[];
  onAuthClick: () => void;
  onLogout: () => void;
  onShowToast: (msg: string) => void;
  onOpenDetail: (l: Listing) => void;
  onDelete: (id: string) => void;
  onStartEdit: (l: Listing) => void;
}

const MENU_ITEMS = [
  { id: 'settings', icon: 'settings', label: '设置中心', desc: '通知管理，清空本地存储' },
  { id: 'about', icon: 'info', label: '关于 CampusLink', desc: '校园信息平台使用条例' },
  { id: 'feedback', icon: 'feedback', label: '问题反馈', desc: '联系管理员，提交反馈' },
];

type SubView = null | 'posts' | 'saved' | 'regs';

export default function ProfileTab({
  profile,
  savedCount,
  listings,
  savedListings,
  onAuthClick,
  onLogout,
  onShowToast,
  onOpenDetail,
  onDelete,
  onStartEdit,
}: ProfileTabProps) {
  const { registrations, myRegIds } = useRegistrations();
  const [subView, setSubView] = useState<SubView>(null);
  const [regTab, setRegTab] = useState<'mine' | 'joined'>('mine');

  if (subView === 'posts') {
    return (
      <div className="flex flex-col flex-1 animate-fade-in">
        <header className="px-4 py-3 bg-white border-b border-gray-100 flex items-center gap-3 sticky top-14 z-20">
          <button
            onClick={() => setSubView(null)}
            className="text-on-surface-variant hover:bg-gray-100 p-2 rounded-full active:scale-95 cursor-pointer shrink-0"
          >
            <Icon name="arrow_back" className="" />
          </button>
          <h2 className="font-headline text-base font-bold text-on-surface">我的发布</h2>
        </header>
        <section className="p-4 flex-1">
          {listings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Icon name="post_add" className="text-5xl mb-3 text-gray-200" />
              <p className="text-xs">还没有发布过信息</p>
            </div>
          ) : (
            <div className="space-y-3">
              {listings.map((item) => (
                <div
                  key={item.id}
                  className="bg-white border border-gray-100 rounded-xl p-3 flex gap-3 hover:shadow-sm transition-all"
                >
                  <div
                    onClick={() => onOpenDetail(item)}
                    className="aspect-square w-16 h-16 rounded-lg bg-slate-100 shrink-0 overflow-hidden cursor-pointer"
                  >
                    {item.imageUrls.length > 0 ? (
                      <img
                        src={item.imageUrls[0]}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <Icon name="image" className="text-2xl" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3
                      onClick={() => onOpenDetail(item)}
                      className="font-headline font-semibold text-xs text-on-surface line-clamp-1 mb-1 cursor-pointer"
                    >
                      {item.title}
                    </h3>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={item.status} />
                      <span className="text-[10px] text-gray-400">{item.publishedTimeText}</span>
                    </div>
                    {item.status === 'active' && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(item.id);
                          }}
                          className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-course-red/10 text-course-red hover:bg-course-red/20 cursor-pointer"
                        >
                          删除
                        </button>
                      </div>
                    )}
                    {item.status === 'rejected' && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onStartEdit(item);
                          }}
                          className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-course-blue/10 text-course-blue hover:bg-course-blue/20 cursor-pointer"
                        >
                          编辑重发
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  if (subView === 'regs') {
    const myActivityIds = listings.filter((l) => l.postType === 'activity').map((l) => l.id);
    const myPublishedRegs = registrations.filter((r) => myActivityIds.includes(r.listingId));
    const myJoinedRegs = registrations.filter((r) => myRegIds.has(r.id));
    return (
      <div className="flex flex-col flex-1 animate-fade-in">
        <header className="px-4 py-3 bg-white border-b border-gray-100 flex items-center gap-3 sticky top-14 z-20">
          <button
            onClick={() => setSubView(null)}
            className="text-on-surface-variant hover:bg-gray-100 p-2 rounded-full active:scale-95 cursor-pointer shrink-0"
          >
            <Icon name="arrow_back" className="" />
          </button>
          <h2 className="font-headline text-base font-bold text-on-surface">活动报名库</h2>
        </header>
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => setRegTab('mine')}
            className={`flex-1 py-2.5 text-xs font-semibold text-center ${regTab === 'mine' ? 'text-primary border-b-2 border-primary' : 'text-gray-400'}`}
          >
            我发布的
          </button>
          <button
            onClick={() => setRegTab('joined')}
            className={`flex-1 py-2.5 text-xs font-semibold text-center ${regTab === 'joined' ? 'text-primary border-b-2 border-primary' : 'text-gray-400'}`}
          >
            我报名的
          </button>
        </div>
        <section className="p-4 flex-1">
          {regTab === 'mine' ? (
            myPublishedRegs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <Icon name="celebration" className="text-5xl mb-3 text-gray-200" />
                <p className="text-xs">还没有人报名你的活动</p>
              </div>
            ) : (
              <div className="space-y-4">
                {[...new Set(myPublishedRegs.map((r) => r.listingId))].map((lid) => {
                  const actRegs = myPublishedRegs.filter((r) => r.listingId === lid);
                  return (
                    <div key={lid} className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                      <div className="bg-course-purple/5 px-4 py-3 border-b border-gray-100">
                        <span className="text-xs font-bold text-gray-700">
                          {actRegs[0]?.listingTitle || '未知活动'}
                        </span>
                        <span className="text-[10px] text-gray-400 ml-2">{actRegs.length}人报名</span>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {actRegs.map((r) => (
                          <div key={r.id} className="px-4 py-3 flex items-center justify-between">
                            <div>
                              <span className="text-xs font-semibold text-gray-700">{r.registrantName}</span>
                              <span className="text-[10px] text-gray-400 ml-2">{r.department}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] text-gray-400">{r.phone}</span>
                              <span className="text-[10px] text-gray-300 ml-2">{r.registeredAt}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : myJoinedRegs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Icon name="bookmark" className="text-5xl mb-3 text-gray-200" />
              <p className="text-xs">还没有报名任何活动</p>
            </div>
          ) : (
            <div className="space-y-2">
              {myJoinedRegs.map((r) => (
                <div key={r.id} className="bg-white border border-gray-100 rounded-xl p-3">
                  <span className="text-xs font-semibold text-gray-700">{r.listingTitle}</span>
                  <span className="text-[10px] text-gray-400 ml-2">{r.registeredAt}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  if (subView === 'saved') {
    return (
      <div className="flex flex-col flex-1 animate-fade-in">
        <header className="px-4 py-3 bg-white border-b border-gray-100 flex items-center gap-3 sticky top-14 z-20">
          <button
            onClick={() => setSubView(null)}
            className="text-on-surface-variant hover:bg-gray-100 p-2 rounded-full active:scale-95 cursor-pointer shrink-0"
          >
            <Icon name="arrow_back" className="" />
          </button>
          <h2 className="font-headline text-base font-bold text-on-surface">我的收藏</h2>
        </header>
        <section className="p-4 flex-1">
          {savedListings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Icon name="bookmark" className="text-5xl mb-3 text-gray-200" />
              <p className="text-xs">还没有收藏任何信息</p>
            </div>
          ) : (
            <div className="space-y-3">
              {savedListings.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onOpenDetail(item)}
                  className="bg-white border border-gray-100 rounded-xl p-3 flex gap-3 cursor-pointer hover:shadow-sm transition-all"
                >
                  <div className="aspect-square w-16 h-16 rounded-lg bg-slate-100 shrink-0 overflow-hidden">
                    {item.imageUrls.length > 0 ? (
                      <img
                        src={item.imageUrls[0]}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <Icon name="image" className="text-2xl" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-headline font-semibold text-xs text-on-surface line-clamp-1 mb-1">
                      {item.title}
                    </h3>
                    <div className="flex items-center gap-2 text-[10px] text-gray-400">
                      <span>{item.publisherName}</span>
                      <span>·</span>
                      <span>{item.publishedTimeText}</span>
                    </div>
                  </div>
                  <Icon name="chevron_right" className="text-gray-400 text-sm self-center" />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-4 animate-fade-in flex-1">
      <section className="flex items-center gap-4 bg-white rounded-xl p-4 shadow-sm border border-slate-100">
        <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-slate-200 shrink-0 bg-slate-100">
          <img
            src={profile.avatarUrl}
            alt="Avatar"
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h2 className="font-headline text-base font-bold truncate">{profile.fullName}</h2>
            {profile.isVerified && (
              <span className="inline-flex items-center gap-0.5 bg-course-green/10 text-course-green px-2 py-0.5 rounded-full shrink-0">
                <Icon name="verified" className="text-[10px]" />
                <span className="text-[9px] font-bold">已认证</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="text-xs text-gray-400">{profile.department}</span>
            {profile.orgLevel && (
              <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">{profile.orgLevel}</span>
            )}
            {profile.position && (
              <span className="text-[10px] bg-course-orange/10 text-course-orange px-1.5 py-0.5 rounded">
                {profile.position}
              </span>
            )}
          </div>
        </div>
      </section>

      <button
        onClick={onAuthClick}
        className="w-full bg-gradient-to-r from-[#005ea1] to-[#2b78bf] text-white rounded-xl p-4 flex items-center justify-between shadow-md active:scale-98 transition-transform text-left cursor-pointer hover:brightness-105"
      >
        <div className="pr-3">
          <h3 className="font-headline text-sm font-bold mb-0.5">本校学生身份核验</h3>
          <p className="text-[10px] text-white/90">学号认证 · 组织认证 · 专属通行绿卡</p>
        </div>
        <div className="bg-white/20 p-2 rounded-full flex items-center justify-center shrink-0">
          <Icon name="chevron_right" className="text-white text-sm" />
        </div>
      </button>

      <div className="grid grid-cols-3 gap-3">
        <button
          onClick={() => setSubView('posts')}
          className="rounded-xl p-3 flex flex-col items-center justify-center active:scale-95 transition-transform cursor-pointer bg-white border border-slate-100 shadow-sm hover:bg-slate-50"
        >
          <span className="font-headline text-xl font-bold text-primary">{profile.postsCount}</span>
          <span className="text-[10px] text-gray-500 flex items-center gap-0.5 mt-0.5 font-semibold">
            <Icon name="post_add" className="text-[13px]" />
            我的发布
          </span>
        </button>
        <button
          onClick={() => setSubView('saved')}
          className="rounded-xl p-3 flex flex-col items-center justify-center active:scale-95 transition-transform cursor-pointer bg-white border border-slate-100 shadow-sm hover:bg-slate-50"
        >
          <span className="font-headline text-xl font-bold text-primary">{savedCount}</span>
          <span className="text-[10px] text-gray-500 flex items-center gap-0.5 mt-0.5 font-semibold">
            <Icon name="bookmark" className="text-[13px]" />
            我的收藏
          </span>
        </button>
        <button
          onClick={() => setSubView('regs')}
          className="rounded-xl p-3 flex flex-col items-center justify-center active:scale-95 transition-transform cursor-pointer bg-white border border-slate-100 shadow-sm hover:bg-slate-50"
        >
          <span className="font-headline text-xl font-bold text-primary">
            {registrations.filter((r) => listings.map((l) => l.id).includes(r.listingId)).length}
          </span>
          <span className="text-[10px] text-gray-500 flex items-center gap-0.5 mt-0.5 font-semibold">
            <Icon name="celebration" className="text-[13px]" />
            报名库
          </span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-xs border border-slate-100 overflow-hidden flex flex-col">
        {MENU_ITEMS.map((row) => (
          <button
            key={row.id}
            onClick={() => onShowToast(`进入 ${row.label}`)}
            className="flex items-center justify-between p-4 border-b border-gray-100 hover:bg-slate-50 transition-colors last:border-0 text-left active:bg-gray-100 cursor-pointer"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-primary shrink-0">
                <Icon name={row.icon} className="text-base" />
              </div>
              <div>
                <span className="font-headline font-semibold text-xs leading-none block">{row.label}</span>
                <span className="text-[10px] text-gray-400 block mt-1">{row.desc}</span>
              </div>
            </div>
            <Icon name="chevron_right" className="text-gray-400 text-base" />
          </button>
        ))}
      </div>

      {profile.studentId && (
        <button
          onClick={onLogout}
          className="w-full mt-4 py-3 rounded-xl text-xs font-semibold text-red-500 border border-red-200 bg-red-50 active:scale-95 cursor-pointer"
        >
          退出登录
        </button>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: '已发布', cls: 'bg-course-green/10 text-course-green' },
    pending: { label: '审核中', cls: 'bg-course-yellow/20 text-yellow-700' },
    sold: { label: '已售', cls: 'bg-gray-200 text-gray-500' },
    closed: { label: '已关闭', cls: 'bg-gray-200 text-gray-500' },
    rejected: { label: '已打回', cls: 'bg-course-red/10 text-course-red' },
  };
  const info = map[status] || { label: status, cls: 'bg-gray-100 text-gray-500' };
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${info.cls}`}>{info.label}</span>;
}
