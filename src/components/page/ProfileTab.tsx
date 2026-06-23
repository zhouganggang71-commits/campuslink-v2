import { useState, useMemo, useRef } from 'react';
import { StudentProfile, Listing } from '../../types';
import { useRegistrations } from '../../utils/regContext';
import { api } from '../../utils/api';
import Icon from '../ui/Icon';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import FeedbackModal from '../modal/FeedbackModal';

// ── 类型 ──
type SubView = null | 'posts' | 'saved' | 'regs';

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
  onUpdateProfile: React.Dispatch<React.SetStateAction<StudentProfile>>;
  toggleSaveListing: (id: string) => void;
}

// ── 状态徽标 ──
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: '已发布', cls: 'bg-course-green/10 text-course-green' },
    pending: { label: '审核中', cls: 'bg-amber-50 text-amber-700' },
    sold: { label: '已售', cls: 'bg-gray-200 text-gray-500' },
    closed: { label: '已关闭', cls: 'bg-gray-200 text-gray-500' },
    rejected: { label: '已打回', cls: 'bg-course-red/10 text-course-red' },
  };
  const info = map[status] || { label: status, cls: 'bg-gray-100 text-gray-500' };
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${info.cls}`}>{info.label}</span>;
}

// ── 缩略图列表项 ──
function ThumbListItem({ item, onClick, rightSlot, children }: {
  item: Listing; onClick: () => void; rightSlot?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-3 flex gap-3 hover:shadow-sm transition-all">
      <div onClick={onClick} className="aspect-square w-16 h-16 rounded-lg bg-slate-100 shrink-0 overflow-hidden cursor-pointer">
        {item.imageUrls.length > 0 ? (
          <img src={item.imageUrls[0]} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300"><Icon name="image" className="text-2xl" /></div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 onClick={onClick} className="font-headline font-semibold text-xs text-on-surface line-clamp-1 mb-1 cursor-pointer">{item.title}</h3>
        {children}
      </div>
      {rightSlot}
    </div>
  );
}

// ── 空状态 ──
function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
      <Icon name={icon} className="text-5xl mb-3 text-gray-200" />
      <p className="text-xs">{text}</p>
    </div>
  );
}

// ── 免责声明全文 ──
const DISCLAIMER_SECTIONS = [
  { title: '⚠️ 重要提示', content: '本平台仅供校内师生间信息交流使用，不涉及任何商业运营。请在使用过程中注意保护个人隐私和财产安全。', highlight: true },
  { title: '一、平台定位', content: '本平台是校园信息展示与交流工具，仅为用户提供信息发布和浏览的技术服务，不主动生产、编辑或修改用户发布的内容。平台所有内容均由用户自行发布，不代表平台立场。平台不对任何用户内容的真实性、准确性、完整性、合法性作任何形式的保证。' },
  { title: '二、信息准确性与课表', content: '课表信息来源于用户上传的教务系统截图，经 OCR 技术自动识别。受技术限制，识别结果可能存在遗漏、错位、文字错误等问题。请务必以学校教务系统官方信息为准，因依赖本平台课表信息导致的缺课、迟到等后果，本平台不承担责任。用户发布的通知、活动等信息，请自行核实。涉及考试、选课、学分等重要事项，务必以学校官方渠道为准。' },
  { title: '三、用户行为规范', content: '用户须遵守《中华人民共和国网络安全法》《中华人民共和国个人信息保护法》等法律法规及学校规章制度。禁止发布违法违规信息、虚假诈骗信息、色情暴力内容、侵犯他人隐私或知识产权的内容、传销或非法集资信息、赌博信息、毒品或违禁品信息。用户应对自己的一切行为承担全部法律责任。本平台有权在不事先通知的情况下删除违规内容、限制或封禁违规账号，并保留向学校或司法机关报告的权利。' },
  { title: '四、交易相关', content: '本平台仅作为信息展示的中间媒介，不对任何交易作背书、担保或推荐。平台不介入交易谈判、不代收代付资金、不提供售后服务。本平台不涉及任何支付系统或金钱流转功能。一切资金往来均由交易双方自行协商处理并承担全部风险。平台不收取任何交易佣金、中介费或手续费。建议用户选择校内当面交易，交易前核实对方身份，保留交易凭证。涉及大额交易请谨慎决策。' },
  { title: '五、兼职与拼车安全', content: '平台上的兼职信息由发布者自行提供。请在应聘前核实用工单位的合法性，警惕要求提前缴纳押金、培训费、服装费等任何形式的预付费用。拼车信息仅供参考。拼车前请确认车辆信息和驾驶人身份，建议与熟识的同学拼车，并告知他人行程。本平台对兼职和拼车过程中发生的人身伤害、财产损失、劳动争议等不承担任何责任。' },
  { title: '六、个人信息与隐私', content: '本平台收集的学号、姓名等基础信息仅用于用户身份识别和校内服务，不会出售或非法向第三方提供。用户发布的联系方式将对平台内其他用户可见，请自行评估信息披露风险。学号、密码等敏感数据在存储和传输过程中采用加密保护。但受技术条件限制，无法保证绝对安全。建议使用独立密码，勿与其他平台共用。如发现账号异常登录或信息泄露，请立即修改密码并联系平台。' },
  { title: '七、知识产权', content: '本平台的名称、标识、源代码、界面设计等知识产权归开发团队所有，未经书面授权不得使用、复制或修改。用户发布的内容，视为授权本平台在平台内展示。用户须保证所发布内容不侵犯第三方知识产权。如发现本平台内容侵犯您的合法权益，请联系我们，将在核实后及时处理。' },
  { title: '八、服务可用性', content: '本平台尽力保障服务的稳定运行，但不对服务的无中断、无延迟、无错误作任何保证。因服务器维护、网络故障、电力中断、不可抗力等原因导致的服务中断或数据丢失，本平台不承担责任。本平台保留随时修改、暂停或终止部分或全部服务的权利，无需事先通知。' },
  { title: '九、未成年人保护', content: '根据《中华人民共和国未成年人保护法》，未满 18 周岁的用户在使用本平台时应由监护人陪同阅读并同意本协议。未成年用户发布信息时应更加审慎地保护个人信息，避免透露具体位置、联系方式等敏感内容。' },
  { title: '十、责任限制', content: '在任何情况下，本平台及开发团队对用户因使用或无法使用本平台服务所产生的任何直接、间接、附带、特殊或惩罚性损失不承担任何责任，包括但不限于财产损失、人身伤害、名誉损害、数据丢失等。本平台对用户在平台外私下交易产生的纠纷、因轻信他人发布信息而遭受的损失、因网络攻击设备故障等不可控因素导致的数据泄露不承担责任。本平台对第三方链接或外部服务的内容、安全性、合法性不作任何保证。' },
  { title: '十一、举报与处理', content: '如发现违规内容或侵权行为，可通过平台举报功能或校内渠道联系我们。我们将在收到有效举报后及时核实处理，但不对处理时效作具体承诺。' },
  { title: '十二、广告', content: '本平台保留在服务中展示广告的权利。广告内容由广告主自行负责，本平台不对广告内容的真实性、准确性、合法性作任何保证。用户与广告主之间的任何交易或互动，均由双方自行负责。广告收入归本平台所有，用于维持平台运营和发展。如发现违法或虚假广告，欢迎举报，我们将及时处理。' },
  { title: '十三、其他', content: '本协议的解释、效力及纠纷解决适用中华人民共和国法律。如本协议任何条款被认定为无效，不影响其余条款的效力。本协议可能不时更新，更新后一经发布即生效。重大变更将以公告形式通知。建议定期查阅。如有问题或建议，请通过校内渠道联系 CampusLink 开发团队。' },
];

// ── 菜单项 ──
const MENU_ITEMS = [
  { id: 'about' as const, icon: 'info', label: '关于 CampusLink', desc: '免责声明与用户协议' },
  { id: 'feedback' as const, icon: 'feedback', label: '问题反馈', desc: '联系管理员，提交反馈和建议' },
];

// ── 主组件 ──
export default function ProfileTab({
  profile, savedCount, listings, savedListings,
  onAuthClick, onLogout, onShowToast, onOpenDetail, onDelete, onStartEdit, onUpdateProfile,
  toggleSaveListing,
}: ProfileTabProps) {
  const { registrations, myRegIds } = useRegistrations();
  const [subView, setSubView] = useState<SubView>(null);
  const [regTab, setRegTab] = useState<'mine' | 'joined'>('mine');
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  // ── 时间问候 ──
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 6) return '夜深了，注意休息';
    if (h < 9) return '早上好，新的一天';
    if (h < 12) return '上午好，精力充沛';
    if (h < 14) return '中午好，记得吃饭';
    if (h < 18) return '下午好，继续加油';
    return '晚上好，今天辛苦了';
  }, []);

  const myPostCount = listings.length;
  const myActivityIds = useMemo(() => listings.filter((l) => l.postType === 'activity').map((l) => l.id), [listings]);
  const myPublishedRegs = useMemo(() => registrations.filter((r) => myActivityIds.includes(r.listingId)), [registrations, myActivityIds]);
  const myJoinedRegs = useMemo(() => registrations.filter((r) => myRegIds.has(r.id)), [registrations, myRegIds]);
  const regCount = useMemo(() => registrations.filter((r) => myActivityIds.includes(r.listingId)).length, [registrations, myActivityIds]);

  const [activeContentTab, setActiveContentTab] = useState<'posts' | 'saved' | 'regs'>('posts');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState(profile.bio || '');

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { onShowToast('请选择图片文件'); return; }
    if (file.size > 2 * 1024 * 1024) { onShowToast('图片不能超过2MB'); return; }
    setAvatarUploading(true);
    try {
      const form = new FormData();
      form.append('avatar', file);
      const res = await api.upload<{ avatar_url: string }>('/auth/avatar', form);
      if (res.code === 0 && res.data?.avatar_url) {
        onUpdateProfile((prev) => ({ ...prev, avatarUrl: res.data!.avatar_url }));
        onShowToast('头像已更新');
      } else {
        onShowToast(res.message || '上传失败');
      }
    } catch { onShowToast('上传失败，请重试'); }
    setAvatarUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleBioSave = async () => {
    const trimmed = bioDraft.trim().slice(0, 80);
    try {
      const res = await api.put<{ bio: string }>('/auth/profile', { bio: trimmed });
      if (res.code === 0) {
        onUpdateProfile((prev) => ({ ...prev, bio: trimmed }));
        onShowToast('签名已更新');
      } else {
        onShowToast(res.message || '更新失败');
      }
    } catch { onShowToast('更新失败'); }
    setEditingBio(false);
  };

  // 当前 tab 对应的数据
  const contentData = activeContentTab === 'saved' ? savedListings : listings;

  // ── 内容区 ──
  const renderContent = () => {
    if (activeContentTab === 'regs') {
      const groupedByActivity = [...new Set(myPublishedRegs.map((r) => r.listingId))].map((lid) => ({
        lid, title: myPublishedRegs.find((r) => r.listingId === lid)?.listingTitle || '未知活动',
        regs: myPublishedRegs.filter((r) => r.listingId === lid),
      }));
      return (
        <div className="flex-1 flex flex-col">
          <div className="flex border-b border-gray-100">
            {(['mine', 'joined'] as const).map((tab) => (
              <button key={tab} onClick={() => setRegTab(tab)}
                className={`flex-1 py-2.5 text-xs font-semibold text-center cursor-pointer transition-colors ${regTab === tab ? 'text-primary border-b-2 border-primary' : 'text-gray-400 hover:text-gray-600'}`}>
                {tab === 'mine' ? '我发布的' : '我报名的'}
              </button>
            ))}
          </div>
          <div className="p-4 flex-1">
            {regTab === 'mine' ? (
              groupedByActivity.length === 0 ? <EmptyState icon="celebration" text="还没有人报名你的活动" /> : (
                <div className="space-y-4">
                  {groupedByActivity.map(({ lid, title, regs }) => (
                    <div key={lid} className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                      <div className="bg-primary/5 px-4 py-3 border-b border-gray-100">
                        <span className="text-xs font-bold text-gray-700">{title}</span>
                        <span className="text-[10px] text-gray-400 ml-2">{regs.length}人报名</span>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {regs.map((r) => (
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
                  ))}
                </div>
              )
            ) : myJoinedRegs.length === 0 ? <EmptyState icon="bookmark" text="还没有报名任何活动" /> : (
              <div className="space-y-2">
                {myJoinedRegs.map((r) => (
                  <div key={r.id} className="bg-white border border-gray-100 rounded-xl p-3">
                    <span className="text-xs font-semibold text-gray-700">{r.listingTitle}</span>
                    <span className="text-[10px] text-gray-400 ml-2">{r.registeredAt}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }

    if (contentData.length === 0) {
      const emptyMap: Record<string, { icon: string; text: string }> = {
        posts: { icon: 'post_add', text: '还没有发布过信息' },
        saved: { icon: 'bookmark', text: '还没有收藏任何信息' },
      };
      const e = emptyMap[activeContentTab] || { icon: 'info', text: '暂无数据' };
      return <EmptyState icon={e.icon} text={e.text} />;
    }

    return (
      <div className="p-4 space-y-3">
        {contentData.map((item) =>
          activeContentTab === 'saved' ? (
            <ThumbListItem key={item.id} item={item} onClick={() => onOpenDetail(item)}
              rightSlot={
                <button onClick={(e) => {
                  e.stopPropagation();
                  toggleSaveListing(item.id);
                }} className="text-course-red/50 hover:text-course-red cursor-pointer p-1" aria-label="取消收藏">
                  <Icon name="favorite" className="text-lg" />
                </button>
              }>
              <div className="flex items-center gap-2 text-[10px] text-gray-400">
                <span>{item.publisherName}</span><span>·</span><span>{item.publishedTimeText}</span>
              </div>
            </ThumbListItem>
          ) : (
            <ThumbListItem key={item.id} item={item} onClick={() => onOpenDetail(item)}>
              <div className="flex items-center gap-2">
                <StatusBadge status={item.status} />
                <span className="text-[10px] text-gray-400">{item.publishedTimeText}</span>
              </div>
              {item.status === 'active' && (
                <button onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
                  className="mt-2 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-course-red/10 text-course-red hover:bg-course-red/20 cursor-pointer">删除</button>
              )}
              {item.status === 'rejected' && (
                <button onClick={(e) => { e.stopPropagation(); onStartEdit(item); }}
                  className="mt-2 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer">编辑重发</button>
              )}
            </ThumbListItem>
          )
        )}
      </div>
    );
  };

  // ── 渲染 ──
  return (
    <div className="flex flex-col flex-1 animate-fade-in">
      {/* 个人信息头部 — 社交主页风格 */}
      <section className="px-4 pt-6 pb-4 bg-white border-b border-gray-100">
        <div className="flex items-center gap-4">
          <div
            onClick={() => profile.studentId && fileInputRef.current?.click()}
            className={`relative w-20 h-20 rounded-full overflow-hidden border-2 shrink-0 bg-slate-100 ${profile.isVerified ? 'border-primary/30' : 'border-slate-200'} ${profile.studentId ? 'cursor-pointer' : ''}`}
          >
            <img src={profile.avatarUrl || ''} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            {!profile.avatarUrl && (
              <div className="absolute inset-0 flex items-center justify-center text-gray-300">
                <Icon name="person" className="text-3xl" />
              </div>
            )}
            {profile.studentId && (
              <div className="absolute bottom-0 right-0 w-6 h-6 bg-primary rounded-full flex items-center justify-center shadow-md">
                <Icon name="camera" className="text-white text-[10px]" />
              </div>
            )}
            {avatarUploading && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-primary font-semibold mb-0.5">{greeting}</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              <h1 className="font-headline text-lg font-bold truncate">{profile.fullName}</h1>
              {profile.isVerified && (
                <span className="inline-flex items-center gap-0.5 bg-course-green/10 text-course-green px-1.5 py-0.5 rounded-full shrink-0">
                  <Icon name="verified" className="text-[9px]" /><span className="text-[9px] font-bold">已认证</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400 flex-wrap">
              {profile.studentId && <span>学号 {profile.studentId}</span>}
              <span className="text-gray-300">|</span>
              <span>{profile.department}</span>
              {profile.orgLevel && (
                <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[9px] font-semibold">{profile.orgLevel}{profile.position}</span>
              )}
            </div>
            {editingBio ? (
              <div className="flex items-center gap-1.5 mt-2">
                <input
                  autoFocus
                  value={bioDraft}
                  onChange={(e) => setBioDraft(e.target.value)}
                  maxLength={80}
                  placeholder="写一句个性签名..."
                  className="flex-1 text-xs bg-slate-50 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-primary/10 focus:border-primary focus:outline-none"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleBioSave(); if (e.key === 'Escape') setEditingBio(false); }}
                />
                <button onClick={handleBioSave} className="text-[10px] font-semibold text-primary bg-primary/5 px-2.5 py-1.5 rounded-lg hover:bg-primary/10 cursor-pointer">保存</button>
                <button onClick={() => setEditingBio(false)} className="text-[10px] text-gray-400 px-2 py-1.5 cursor-pointer">取消</button>
              </div>
            ) : (
              <p
                onClick={() => profile.studentId && setEditingBio(true)}
                className={`flex items-center gap-1 mt-1.5 text-xs ${profile.bio ? 'text-gray-500 hover:text-primary' : 'text-primary/60 hover:text-primary'} ${profile.studentId ? 'cursor-pointer' : ''}`}
              >
                {profile.bio ? (
                  profile.bio
                ) : (
                  <>
                    <Icon name="edit" className="text-[10px]" />
                    <span>添加个性签名</span>
                  </>
                )}
              </p>
            )}
            {!profile.isVerified && (
              <Button variant="primary" size="sm" onClick={onAuthClick}>本校学生身份核验</Button>
            )}
          </div>
        </div>

        {/* 数据统计 */}
        <div className="flex gap-6 mt-5 pt-4 border-t border-gray-50">
          <StatItem count={myPostCount} label="发布" onClick={() => setActiveContentTab('posts')} active={activeContentTab === 'posts'} />
          <StatItem count={savedCount} label="收藏" onClick={() => setActiveContentTab('saved')} active={activeContentTab === 'saved'} />
          <StatItem count={regCount} label="报名" onClick={() => setActiveContentTab('regs')} active={activeContentTab === 'regs'} />
        </div>
      </section>

      {/* 内容区 */}
      <div className="flex-1 flex flex-col">
        {activeContentTab !== 'posts' && (
          <div className="flex items-center gap-1 px-4 py-1.5 bg-slate-50 border-b border-gray-100 text-[10px] text-gray-400">
            <Icon name="lock" className="text-[9px]" />
            仅自己可见
          </div>
        )}
        {renderContent()}
      </div>

      {/* 底部菜单 */}
      <div className="border-t border-gray-100 bg-white px-4 py-2 flex flex-col gap-1">
        {MENU_ITEMS.map((row) => (
          <button key={row.id}
            onClick={() => row.id === 'feedback' ? setIsFeedbackOpen(true) : setShowAbout(true)}
            className="flex items-center gap-3 py-2.5 text-left hover:bg-slate-50 rounded-lg px-2 transition-colors cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-gray-500 shrink-0">
              <Icon name={row.icon} className="text-sm" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-semibold text-gray-700 block">{row.label}</span>
              <span className="text-[10px] text-gray-400">{row.desc}</span>
            </div>
            <Icon name="chevron_right" className="text-gray-300 text-sm" />
          </button>
        ))}
        {profile.studentId && (
          <Button variant="danger" size="sm" block onClick={onLogout}>退出登录</Button>
        )}
      </div>

      {/* 反馈弹窗 */}
      <FeedbackModal isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} onSuccess={onShowToast} />

      {/* 关于弹窗 — 完整免责声明 */}
      <Modal isOpen={showAbout} onClose={() => setShowAbout(false)} title="免责声明与用户协议" subtitle="生效日期：2026年6月23日 · CampusLink 校园信息平台">
        <div className="text-xs text-gray-600 leading-relaxed space-y-3 max-h-[55vh] overflow-y-auto pr-1">
          <p className="text-[10px] text-gray-500">欢迎使用 CampusLink。本平台由四川财经职业学院学生团队独立开发运营，非学校官方产品。使用即表示同意以下全部条款。</p>
          {DISCLAIMER_SECTIONS.map((s, i) => (
            <div key={i} className={s.highlight ? 'bg-amber-50 border border-amber-200 rounded-lg p-3 text-[11px] text-amber-800' : ''}>
              <h4 className={`font-bold mb-1 ${s.highlight ? 'text-amber-900' : 'text-on-surface'}`}>{s.title}</h4>
              <p className={s.highlight ? '' : 'text-[11px]'}>{s.content}</p>
            </div>
          ))}
          <div className="border-t border-gray-100 pt-3 text-center text-[10px] text-gray-400">
            CampusLink · 四川财经职业学院
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── 统计项 ──
function StatItem({ count, label, onClick, active }: { count: number; label: string; onClick: () => void; active: boolean }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center cursor-pointer transition-colors ${active ? 'text-primary' : 'text-gray-400 hover:text-gray-600'}`}>
      <span className="font-headline text-lg font-bold">{count}</span>
      <span className={`text-[10px] font-semibold mt-0.5 ${active ? 'border-b-2 border-primary pb-0.5' : ''}`}>{label}</span>
    </button>
  );
}
