import { useState, useMemo, useRef, useEffect } from 'react';
import { StudentProfile, Listing } from '../../types';
import { useRegistrations } from '../../utils/regContext';
import { authApi, dmApi } from '../../api';
import { togglePush, isPushEnabled } from '../../utils/push';
import Icon from '../ui/Icon';
import GenderBadge from '../ui/GenderBadge';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import FeedbackModal from '../modal/FeedbackModal';
import GradesExamsModal from '../modal/GradesExamsModal';
import ReportAppealModal from '../modal/ReportAppealModal';

// ── 类型 ──

interface ProfileTabProps {
  profile: StudentProfile;
  savedCount: number;
  listings: Listing[];
  savedListings: Listing[];
  onAuthClick: () => void;
  onRescanClick: () => void;
  onLogout: () => void;
  onShowToast: (msg: string, type?: 'success' | 'info') => void;
  onOpenDetail: (l: Listing) => void;
  onDelete: (id: string) => void;
  onStartEdit: (l: Listing) => void;
  onUpdateProfile: React.Dispatch<React.SetStateAction<StudentProfile>>;
  toggleSaveListing: (id: string) => void;
  onOpenTransactions: () => void;
}

// ── 状态徽标 ──
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: '已发布', cls: 'bg-course-green/10 text-course-green' },
    pending: { label: '审核中', cls: 'bg-amber-50 text-amber-700' },
    sold: { label: '已售', cls: 'bg-gray-200 text-gray-500' },
    closed: { label: '已关闭', cls: 'bg-gray-200 text-gray-500' },
    rejected: { label: '已打回', cls: 'bg-course-red/10 text-course-red' },
    under_review: { label: '举报审核中', cls: 'bg-course-red/10 text-course-red' },
  };
  const info = map[status] || { label: status, cls: 'bg-gray-100 text-gray-500' };
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${info.cls}`}>{info.label}</span>;
}

// ── 内容卡片 ──
function ContentCard({
  item,
  onClick,
  rightSlot,
  children,
}: {
  item: Listing;
  onClick: () => void;
  rightSlot?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const [imgError, setImgError] = useState(false);
  const thumbUrl = item.imageUrls?.[0] || '';
  const showImg = !!(thumbUrl && thumbUrl.startsWith('http') && !imgError);
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-3 flex gap-3 hover:shadow-md hover:border-gray-200 transition-all active:scale-[0.98]">
      {showImg && (
        <div
          onClick={onClick}
          className="aspect-square w-16 h-16 rounded-lg bg-slate-100 shrink-0 overflow-hidden cursor-pointer"
        >
          <img
            src={thumbUrl}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
          />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <h3
          onClick={onClick}
          className="font-headline font-semibold text-xs text-on-surface line-clamp-1 mb-1 cursor-pointer"
        >
          {item.title}
        </h3>
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

// ── 统计项（新设计） ──
function StatItem({
  count,
  label,
  icon,
  onClick,
  active,
}: {
  count: number;
  label: string;
  icon: string;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center cursor-pointer transition-all px-4 py-2 rounded-xl min-w-[80px] ${
        active ? 'bg-primary/5 text-primary' : 'text-gray-400 hover:text-gray-600 hover:bg-slate-50'
      }`}
    >
      <Icon name={icon} className={`text-lg mb-0.5 ${active ? 'text-primary' : ''}`} />
      <span className="font-headline text-lg font-bold">{count}</span>
      <span className="text-[10px] font-medium mt-0.5">{label}</span>
    </button>
  );
}

// ── 免责声明全文 ──
const DISCLAIMER_SECTIONS = [
  {
    title: '⚠️ 重要提示',
    content: '本平台仅供校内师生间信息交流使用，不涉及任何商业运营。请在使用过程中注意保护个人隐私和财产安全。',
    highlight: true,
  },
  {
    title: '一、平台定位',
    content:
      '本平台是校园信息展示与交流工具，仅为用户提供信息发布和浏览的技术服务，不主动生产、编辑或修改用户发布的内容。平台所有内容均由用户自行发布，不代表平台立场。平台不对任何用户内容的真实性、准确性、完整性、合法性作任何形式的保证。',
  },
  {
    title: '二、信息准确性与课表',
    content:
      '课表信息来源于用户上传的教务系统截图，经 OCR 技术自动识别。受技术限制，识别结果可能存在遗漏、错位、文字错误等问题。请务必以学校教务系统官方信息为准，因依赖本平台课表信息导致的缺课、迟到等后果，本平台不承担责任。用户发布的通知、活动等信息，请自行核实。涉及考试、选课、学分等重要事项，务必以学校官方渠道为准。',
  },
  {
    title: '三、用户行为规范',
    content:
      '用户须遵守《中华人民共和国网络安全法》《中华人民共和国个人信息保护法》等法律法规及学校规章制度。禁止发布违法违规信息、虚假诈骗信息、色情暴力内容、侵犯他人隐私或知识产权的内容、传销或非法集资信息、赌博信息、毒品或违禁品信息。用户应对自己的一切行为承担全部法律责任。本平台有权在不事先通知的情况下删除违规内容、限制或封禁违规账号，并保留向学校或司法机关报告的权利。',
  },
  {
    title: '四、交易相关',
    content:
      '本平台仅作为信息展示的中间媒介，不对任何交易作背书、担保或推荐。平台不介入交易谈判、不代收代付资金、不提供售后服务。本平台不涉及任何支付系统或金钱流转功能。一切资金往来均由交易双方自行协商处理并承担全部风险。平台不收取任何交易佣金、中介费或手续费。建议用户选择校内当面交易，交易前核实对方身份，保留交易凭证。涉及大额交易请谨慎决策。',
  },
  {
    title: '五、兼职与拼车安全',
    content:
      '平台上的兼职信息由发布者自行提供。请在应聘前核实用工单位的合法性，警惕要求提前缴纳押金、培训费、服装费等任何形式的预付费用。拼车信息仅供参考。拼车前请确认车辆信息和驾驶人身份，建议与熟识的同学拼车，并告知他人行程。本平台对兼职和拼车过程中发生的人身伤害、财产损失、劳动争议等不承担任何责任。',
  },
  {
    title: '六、个人信息与隐私',
    content:
      '本平台收集的学号、姓名等基础信息仅用于用户身份识别和校内服务，不会出售或非法向第三方提供。用户发布的联系方式将对平台内其他用户可见，请自行评估信息披露风险。学号、密码等敏感数据在存储和传输过程中采用加密保护。但受技术条件限制，无法保证绝对安全。建议使用独立密码，勿与其他平台共用。如发现账号异常登录或信息泄露，请立即修改密码并联系平台。',
  },
  {
    title: '七、知识产权',
    content:
      '本平台的名称、标识、源代码、界面设计等知识产权归开发团队所有，未经书面授权不得使用、复制或修改。用户发布的内容，视为授权本平台在平台内展示。用户须保证所发布内容不侵犯第三方知识产权。如发现本平台内容侵犯您的合法权益，请联系我们，将在核实后及时处理。',
  },
  {
    title: '八、服务可用性',
    content:
      '本平台尽力保障服务的稳定运行，但不对服务的无中断、无延迟、无错误作任何保证。因服务器维护、网络故障、电力中断、不可抗力等原因导致的服务中断或数据丢失，本平台不承担责任。本平台保留随时修改、暂停或终止部分或全部服务的权利，无需事先通知。',
  },
  {
    title: '九、未成年人保护',
    content:
      '根据《中华人民共和国未成年人保护法》，未满 18 周岁的用户在使用本平台时应由监护人陪同阅读并同意本协议。未成年用户发布信息时应更加审慎地保护个人信息，避免透露具体位置、联系方式等敏感内容。',
  },
  {
    title: '十、责任限制',
    content:
      '在任何情况下，本平台及开发团队对用户因使用或无法使用本平台服务所产生的任何直接、间接、附带、特殊或惩罚性损失不承担任何责任，包括但不限于财产损失、人身伤害、名誉损害、数据丢失等。本平台对用户在平台外私下交易产生的纠纷、因轻信他人发布信息而遭受的损失、因网络攻击设备故障等不可控因素导致的数据泄露不承担责任。本平台对第三方链接或外部服务的内容、安全性、合法性不作任何保证。',
  },
  {
    title: '十一、举报与处理',
    content:
      '如发现违规内容或侵权行为，可通过平台举报功能或校内渠道联系我们。我们将在收到有效举报后及时核实处理，但不对处理时效作具体承诺。',
  },
  {
    title: '十二、广告',
    content:
      '本平台保留在服务中展示广告的权利。广告内容由广告主自行负责，本平台不对广告内容的真实性、准确性、合法性作任何保证。用户与广告主之间的任何交易或互动，均由双方自行负责。广告收入归本平台所有，用于维持平台运营和发展。如发现违法或虚假广告，欢迎举报，我们将及时处理。',
  },
  {
    title: '十三、其他',
    content:
      '本协议的解释、效力及纠纷解决适用中华人民共和国法律。如本协议任何条款被认定为无效，不影响其余条款的效力。本协议可能不时更新，更新后一经发布即生效。重大变更将以公告形式通知。建议定期查阅。如有问题或建议，请通过校内渠道联系川财CampusLink 开发团队。',
  },
];

// ── 菜单项 ──
const MENU_ITEMS = [
  { id: 'transactions' as const, icon: 'shopping_bag', label: '我的交易', desc: '面交码核销与信誉评价' },
  { id: 'grades' as const, icon: 'school', label: '成绩与考试', desc: '扫码登录时自动同步，不用登录教务系统查询' },
  { id: 'gender' as const, icon: 'person', label: '性别展示', desc: '默认不公开，自己开启后才会在帖子里显示' },
  {
    id: 'push' as const,
    icon: 'notifications',
    label: '消息通知',
    desc: '开启后离线也能收到私信等提醒（iOS 需先加桌面）',
  },
  { id: 'password' as const, icon: 'lock', label: '修改密码', desc: '扫码登录的会话可免旧密码重设' },
  { id: 'blocked' as const, icon: 'block', label: '拉黑管理', desc: '查看并解除已拉黑的用户' },
  { id: 'about' as const, icon: 'info', label: '关于川财CampusLink', desc: '免责声明与用户协议' },
  { id: 'feedback' as const, icon: 'feedback', label: '问题反馈', desc: '联系管理员，提交反馈和建议' },
];

// ── 封面渐变色方案 ──
const COVER_GRADIENTS = [
  'from-primary/80 via-primary to-primary/60',
  'from-sky-400 via-indigo-500 to-purple-500',
  'from-emerald-400 via-teal-500 to-cyan-500',
  'from-rose-400 via-pink-500 to-orange-400',
];

// ── 主组件 ──
export default function ProfileTab({
  profile,
  savedCount,
  listings,
  savedListings,
  onAuthClick,
  onRescanClick,
  onLogout,
  onShowToast,
  onOpenDetail,
  onDelete,
  onStartEdit,
  onUpdateProfile,
  toggleSaveListing,
  onOpenTransactions,
}: ProfileTabProps) {
  const { registrations, myRegIds } = useRegistrations();
  const [regTab, setRegTab] = useState<'mine' | 'joined'>('mine');
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [newPwd2, setNewPwd2] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<
    { id: number; nickname: string; avatarUrl: string; blockedAt: string }[] | null
  >(null);
  const [unblockBusyId, setUnblockBusyId] = useState<number | null>(null);
  const [showGradesModal, setShowGradesModal] = useState(false);
  // 帖子因被举报隐藏(under_review)后的申诉入口：存目标帖子 id，非 null 时弹出申诉弹窗
  const [appealPostId, setAppealPostId] = useState<string | null>(null);
  const [showGenderModal, setShowGenderModal] = useState(false);
  const [genderDraft, setGenderDraft] = useState<'male' | 'female' | null>(profile.gender);
  const [genderVisibleDraft, setGenderVisibleDraft] = useState(profile.genderVisible);
  const [genderBusy, setGenderBusy] = useState(false);

  // 消息通知开关：已订阅→关闭，未订阅→走权限+订阅流程（togglePush 内部处理 iOS/不支持等分支）
  // pushEnabled: null=检测中（首次渲染避免闪一下"未开启"再跳"已开启"）
  const [pushBusy, setPushBusy] = useState(false);
  const [pushEnabled, setPushEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    isPushEnabled()
      .then((v) => {
        if (!cancelled) setPushEnabled(v);
      })
      .catch(() => {
        if (!cancelled) setPushEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const handlePushToggle = async () => {
    if (pushBusy) return;
    if (!profile.studentId) {
      onShowToast('请先登录', 'info');
      return;
    }
    setPushBusy(true);
    try {
      const r = await togglePush();
      onShowToast(r.message, r.ok ? 'success' : 'info');
      isPushEnabled()
        .then(setPushEnabled)
        .catch(() => {});
    } catch {
      onShowToast('操作失败，请重试', 'info');
    } finally {
      setPushBusy(false);
    }
  };

  const openGenderModal = () => {
    setGenderDraft(profile.gender);
    setGenderVisibleDraft(profile.genderVisible);
    setShowGenderModal(true);
  };

  const handleSaveGender = async () => {
    if (genderBusy) return;
    setGenderBusy(true);
    try {
      const res = await authApi.updateGender(genderDraft, genderDraft ? genderVisibleDraft : false);
      if (res.code === 0) {
        onUpdateProfile((prev) => ({
          ...prev,
          gender: res.data?.gender ?? genderDraft,
          genderVisible: res.data?.genderVisible ?? genderVisibleDraft,
        }));
        onShowToast('已保存', 'success');
        setShowGenderModal(false);
      } else {
        onShowToast(res.message || '保存失败', 'info');
      }
    } catch {
      onShowToast('网络异常，请重试', 'info');
    }
    setGenderBusy(false);
  };

  // 拉黑管理：会话列表会过滤掉已拉黑用户，这里是唯一的解除入口
  const openBlockModal = () => {
    setShowBlockModal(true);
    setBlockedUsers(null); // null = 加载中
    dmApi
      .blockedList()
      .then((res) => {
        setBlockedUsers(res.code === 0 && Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => setBlockedUsers([]));
  };

  const handleUnblock = async (userId: number) => {
    if (unblockBusyId !== null) return;
    setUnblockBusyId(userId);
    try {
      const res = await dmApi.unblockUser(userId);
      if (res.code === 0) {
        setBlockedUsers((prev) => (prev || []).filter((u) => u.id !== userId));
        onShowToast('已取消拉黑', 'success');
      } else {
        onShowToast(res.message || '操作失败', 'info');
      }
    } catch {
      onShowToast('网络异常，请重试', 'info');
    }
    setUnblockBusyId(null);
  };

  const handleChangePassword = async () => {
    if (newPwd.length < 6) {
      onShowToast('新密码至少6位', 'info');
      return;
    }
    if (newPwd !== newPwd2) {
      onShowToast('两次输入的新密码不一致', 'info');
      return;
    }
    if (pwdBusy) return;
    setPwdBusy(true);
    try {
      const res = await authApi.changePassword(newPwd, oldPwd || undefined);
      if (res.code === 0) {
        onShowToast('密码已更新', 'success');
        setShowPwdModal(false);
        setOldPwd('');
        setNewPwd('');
        setNewPwd2('');
      } else {
        onShowToast(res.message || '修改失败', 'info');
      }
    } catch {
      onShowToast('网络异常，请重试', 'info');
    }
    setPwdBusy(false);
  };

  // ── 时间问候 ──

  // 基于学号哈希选一个稳定的封面渐变
  const coverGradient = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < (profile.studentId || 'guest').length; i++) {
      hash = (hash << 5) - hash + (profile.studentId || 'guest').charCodeAt(i);
      hash |= 0;
    }
    return COVER_GRADIENTS[Math.abs(hash) % COVER_GRADIENTS.length];
  }, [profile.studentId]);

  const myPostCount = listings.length;
  const myActivityIds = useMemo(() => listings.filter((l) => l.postType === 'activity').map((l) => l.id), [listings]);
  const myPublishedRegs = useMemo(
    () => registrations.filter((r) => myActivityIds.includes(r.listingId)),
    [registrations, myActivityIds],
  );
  const myJoinedRegs = useMemo(() => registrations.filter((r) => myRegIds.has(r.id)), [registrations, myRegIds]);
  const regCount = useMemo(
    () => registrations.filter((r) => myActivityIds.includes(r.listingId)).length,
    [registrations, myActivityIds],
  );

  const [activeContentTab, setActiveContentTab] = useState<'posts' | 'saved' | 'regs'>('posts');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [coverError, setCoverError] = useState(false);
  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState(profile.bio || '');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // 图片压缩/转换（Canvas → JPEG，max 1920px）
  const compressImage = (file: File, quality = 0.85): Promise<Blob> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX = 1920;
          let { width, height } = img;
          if (width > MAX || height > MAX) {
            if (width > height) {
              height = Math.round((height * MAX) / width);
              width = MAX;
            } else {
              width = Math.round((width * MAX) / height);
              height = MAX;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas 不可用'));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('转换失败'))), 'image/jpeg', quality);
        };
        img.onerror = () => reject(new Error('图片加载失败'));
        img.src = reader.result as string;
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsDataURL(file);
    });

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    setAvatarError(false);
    try {
      // HEIC 自动转 JPEG，>2MB 自动压缩
      const isHeic =
        file.type === 'image/heic' ||
        file.type === 'image/heif' ||
        file.name.toLowerCase().endsWith('.heic') ||
        file.name.toLowerCase().endsWith('.heif');
      const needCompress = isHeic || file.size > 2 * 1024 * 1024;
      if (needCompress) {
        onShowToast(isHeic ? '正在转换 HEIC 格式...' : '正在压缩图片...', 'info');
        try {
          file = new File([await compressImage(file)], file.name.replace(/\.(heic|heif)$/i, '.jpg'), {
            type: 'image/jpeg',
          });
        } catch {
          onShowToast('图片处理失败，请使用 JPG/PNG 格式', 'info');
          setAvatarUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }
      }
      const form = new FormData();
      form.append('avatar', file);
      const res = (await authApi.uploadAvatar(form)) as any;
      if (res.code === 0 && res.data?.avatar_url) {
        onUpdateProfile((prev) => ({ ...prev, avatarUrl: res.data!.avatar_url }));
        onShowToast('头像已更新');
      } else {
        onShowToast(res.message || '上传失败');
      }
    } catch {
      onShowToast('上传失败，请重试');
    }
    setAvatarUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let file = e.target.files?.[0];
    if (!file) return;
    setCoverUploading(true);
    setCoverError(false);
    try {
      // HEIC 自动转 JPEG，>4MB 自动压缩
      const isHeic =
        file.type === 'image/heic' ||
        file.type === 'image/heif' ||
        file.name.toLowerCase().endsWith('.heic') ||
        file.name.toLowerCase().endsWith('.heif');
      const needCompress = isHeic || file.size > 4 * 1024 * 1024;
      if (needCompress) {
        onShowToast(isHeic ? '正在转换 HEIC 格式...' : '正在压缩图片...', 'info');
        try {
          file = new File([await compressImage(file)], file.name.replace(/\.(heic|heif)$/i, '.jpg'), {
            type: 'image/jpeg',
          });
        } catch {
          onShowToast('图片处理失败，请使用 JPG/PNG 格式', 'info');
          setCoverUploading(false);
          if (coverInputRef.current) coverInputRef.current.value = '';
          return;
        }
      }
      const form = new FormData();
      form.append('cover', file);
      const res = (await authApi.uploadCover(form)) as any;
      if (res.code === 0 && res.data?.cover_url) {
        onUpdateProfile((prev) => ({ ...prev, coverUrl: res.data!.cover_url }));
        onShowToast('封面已更新');
      } else {
        onShowToast(res.message || '上传失败');
      }
    } catch {
      onShowToast('上传失败，请重试');
    }
    setCoverUploading(false);
    if (coverInputRef.current) coverInputRef.current.value = '';
  };

  const handleBioSave = async () => {
    const trimmed = bioDraft.trim().slice(0, 80);
    try {
      const res = (await authApi.updateProfile(trimmed)) as any;
      if (res.code === 0) {
        onUpdateProfile((prev) => ({ ...prev, bio: trimmed }));
        onShowToast('签名已更新');
      } else {
        onShowToast(res.message || '更新失败');
      }
    } catch {
      onShowToast('更新失败');
    }
    setEditingBio(false);
  };

  // 当前 tab 对应的数据
  const contentData = activeContentTab === 'saved' ? savedListings : listings;

  // ── 内容区 ──
  const renderContent = () => {
    if (activeContentTab === 'regs') {
      const groupedByActivity = [...new Set(myPublishedRegs.map((r) => r.listingId))].map((lid) => ({
        lid,
        title: myPublishedRegs.find((r) => r.listingId === lid)?.listingTitle || '未知活动',
        regs: myPublishedRegs.filter((r) => r.listingId === lid),
      }));
      return (
        <div className="flex-1 flex flex-col">
          <div className="flex border-b border-gray-100 bg-white">
            {(['mine', 'joined'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setRegTab(tab)}
                className={`flex-1 py-3 text-xs font-semibold text-center cursor-pointer transition-colors relative ${
                  regTab === tab ? 'text-primary' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {tab === 'mine' ? '我发布的' : '我报名的'}
                {regTab === tab && (
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
                )}
              </button>
            ))}
          </div>
          <div className="p-4 flex-1">
            {regTab === 'mine' ? (
              groupedByActivity.length === 0 ? (
                <EmptyState icon="celebration" text="还没有人报名你的活动" />
              ) : (
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
            ) : myJoinedRegs.length === 0 ? (
              <EmptyState icon="bookmark" text="还没有报名任何活动" />
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
            <ContentCard
              key={item.id}
              item={item}
              onClick={() => onOpenDetail(item)}
              rightSlot={
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSaveListing(item.id);
                  }}
                  className="text-course-red/50 hover:text-course-red cursor-pointer p-1"
                  aria-label="取消收藏"
                >
                  <Icon name="favorite" className="text-lg" />
                </button>
              }
            >
              <div className="flex items-center gap-2 text-[10px] text-gray-400">
                <span>{item.publisherName}</span>
                <span>·</span>
                <span>{item.publishedTimeText}</span>
              </div>
            </ContentCard>
          ) : (
            <ContentCard key={item.id} item={item} onClick={() => onOpenDetail(item)}>
              <div className="flex items-center gap-2">
                <StatusBadge status={item.status} />
                <span className="text-[10px] text-gray-400">{item.publishedTimeText}</span>
              </div>
              {item.status === 'active' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(item.id);
                  }}
                  className="mt-2 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-course-red/10 text-course-red hover:bg-course-red/20 cursor-pointer"
                >
                  删除
                </button>
              )}
              {item.status === 'rejected' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onStartEdit(item);
                  }}
                  className="mt-2 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
                >
                  编辑重发
                </button>
              )}
              {item.status === 'under_review' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setAppealPostId(item.id);
                  }}
                  className="mt-2 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
                >
                  申诉
                </button>
              )}
            </ContentCard>
          ),
        )}
      </div>
    );
  };

  // ── 渲染 ──
  return (
    <div className="flex flex-col flex-1 animate-fade-in bg-slate-50">
      {/* ━━━ 封面区（仿微信朋友圈） ━━━ */}
      <section className="relative">
        {/* 封面背景 */}
        <div className={`h-48 relative ${profile.coverUrl && !coverError ? '' : `bg-gradient-to-br ${coverGradient}`}`}>
          {profile.coverUrl && !coverError ? (
            <img
              src={profile.coverUrl}
              alt=""
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
              onError={() => setCoverError(true)}
            />
          ) : (
            <>
              <div className="absolute top-3 right-6 w-20 h-20 rounded-full bg-white/10" />
              <div className="absolute -bottom-4 -left-4 w-24 h-24 rounded-full bg-white/5" />
              <div className="absolute top-10 right-12 w-10 h-10 rounded-full bg-white/8" />
            </>
          )}

          {/* 封面上传中遮罩 */}
          {coverUploading && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-20">
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          )}

          {/* 更换封面按钮 — 半透明黑底 + 白色相机图标 */}
          {profile.studentId && (
            <button
              onClick={() => coverInputRef.current?.click()}
              className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 bg-black/35 hover:bg-black/50 backdrop-blur-sm text-white/90 text-[11px] font-medium px-3 py-1.5 rounded-full transition-all cursor-pointer"
              aria-label="更换封面"
            >
              <Icon name="camera" className="text-sm" />
              更换封面
            </button>
          )}
          <input ref={coverInputRef} type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />

          {/* 头像 — 左下角（仿朋友圈布局） */}
          <div className="absolute -bottom-10 left-5 z-10">
            <div
              onClick={() =>
                profile.avatarUrl && !avatarError
                  ? setPreviewImage(profile.avatarUrl)
                  : profile.studentId && fileInputRef.current?.click()
              }
              className={`relative w-20 h-20 rounded-full overflow-hidden border-[3px] border-white shadow-lg shrink-0 bg-slate-100 ${
                profile.isVerified ? 'border-primary/20' : 'border-white'
              } ${profile.studentId || profile.avatarUrl ? 'cursor-pointer active:scale-95 transition-transform' : ''}`}
            >
              {profile.avatarUrl && !avatarError ? (
                <img
                  src={profile.avatarUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300 bg-gradient-to-br from-slate-100 to-slate-200">
                  <Icon name="person" className="text-3xl" />
                </div>
              )}
              {/* 头像编辑角标 */}
              {profile.studentId && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="absolute bottom-0 right-0 w-6 h-6 bg-primary rounded-full flex items-center justify-center shadow-md border-2 border-white cursor-pointer hover:scale-110 transition-transform"
                >
                  <Icon name="camera" className="text-white text-[9px]" />
                </div>
              )}
              {/* 上传中遮罩 */}
              {avatarUploading && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-full">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                </div>
              )}
            </div>
          </div>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />

        {/* 姓名 — 左对齐，在头像旁边 */}
        <div className="pt-12 pb-1 px-5 flex items-center gap-2">
          <h1 className="font-headline text-lg font-bold text-on-surface">{profile.fullName}</h1>
          <GenderBadge gender={profile.genderVisible ? profile.gender : null} />
          {profile.isVerified ? (
            <span className="inline-flex items-center gap-0.5 bg-course-green/10 text-course-green px-2 py-1 rounded-full shrink-0">
              <Icon name="verified" className="text-[11px]" />
              <span className="text-[10px] font-bold">已认证</span>
            </span>
          ) : (
            <button
              onClick={onAuthClick}
              className="inline-flex items-center gap-1 bg-primary text-white px-3 py-1.5 rounded-full shrink-0 hover:bg-primary/90 transition-colors cursor-pointer text-xs font-bold shadow-sm"
            >
              <Icon name="verified" className="text-sm" />
              去认证
            </button>
          )}
        </div>

        {/* 学校/部门/身份 */}
        <div className="px-5 pb-2 flex items-center gap-2 text-[11px] text-gray-400 flex-wrap">
          {profile.studentId && <span>学号 {profile.studentId}</span>}
          {profile.studentId && <span className="text-gray-300">·</span>}
          <span>{profile.department}</span>
          {profile.orgLevel && (
            <>
              <span className="text-gray-300">·</span>
              <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[9px] font-semibold">
                {profile.orgLevel}
                {profile.position}
              </span>
            </>
          )}
        </div>

        {/* 个性签名 */}
        <div className="px-5 pb-1">
          {editingBio ? (
            <div className="flex items-center gap-1.5 max-w-xs mx-auto">
              <input
                autoFocus
                value={bioDraft}
                onChange={(e) => setBioDraft(e.target.value)}
                maxLength={80}
                placeholder="写一句个性签名..."
                className="flex-1 text-xs bg-white border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary/10 focus:border-primary focus:outline-none text-center"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleBioSave();
                  if (e.key === 'Escape') setEditingBio(false);
                }}
              />
              <button
                onClick={handleBioSave}
                className="text-[10px] font-semibold text-primary bg-primary/5 px-2.5 py-2 rounded-lg hover:bg-primary/10 cursor-pointer shrink-0"
              >
                保存
              </button>
              <button
                onClick={() => setEditingBio(false)}
                className="text-[10px] text-gray-400 px-2 py-2 cursor-pointer shrink-0"
              >
                取消
              </button>
            </div>
          ) : (
            <p
              onClick={() => profile.studentId && setEditingBio(true)}
              className={`inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full transition-colors ${
                profile.bio
                  ? 'text-gray-500 bg-slate-100 hover:bg-slate-200'
                  : 'text-primary/60 hover:text-primary bg-primary/5 hover:bg-primary/10'
              } ${profile.studentId ? 'cursor-pointer' : ''}`}
            >
              {profile.bio ? (
                profile.bio
              ) : (
                <>
                  <Icon name="edit_document" className="text-[10px]" />
                  <span>添加个性签名</span>
                </>
              )}
            </p>
          )}
        </div>
      </section>

      {/* ━━━ 数据统计 ━━━ */}
      <section className="px-4 pt-4 pb-2">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-2 py-3 flex justify-center gap-1">
          <StatItem
            count={myPostCount}
            label="发布"
            icon="post_add"
            onClick={() => setActiveContentTab('posts')}
            active={activeContentTab === 'posts'}
          />
          <div className="w-px bg-gray-100 self-center h-8" />
          <StatItem
            count={savedCount}
            label="收藏"
            icon="bookmark"
            onClick={() => setActiveContentTab('saved')}
            active={activeContentTab === 'saved'}
          />
          <div className="w-px bg-gray-100 self-center h-8" />
          <StatItem
            count={regCount}
            label="报名"
            icon="celebration"
            onClick={() => setActiveContentTab('regs')}
            active={activeContentTab === 'regs'}
          />
        </div>
      </section>

      {/* ━━━ 内容标签切换 ━━━ */}
      <section className="px-4 pt-1 pb-2">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-gray-100">
            {(
              [
                { key: 'posts', label: '我的发布' },
                { key: 'saved', label: '我的收藏' },
                { key: 'regs', label: '活动报名' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveContentTab(tab.key)}
                className={`flex-1 py-3 text-xs font-semibold text-center cursor-pointer transition-colors relative ${
                  activeContentTab === tab.key ? 'text-primary' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {tab.label}
                {activeContentTab === tab.key && (
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
                )}
              </button>
            ))}
          </div>

          {/* 隐私提示 */}
          {activeContentTab !== 'posts' && (
            <div className="flex items-center justify-center gap-1 px-4 py-2 bg-slate-50 text-[10px] text-gray-400">
              <Icon name="lock" className="text-[9px]" />
              仅自己可见
            </div>
          )}

          {/* 内容列表 */}
          <div className="max-h-[70vh] overflow-y-auto">{renderContent()}</div>
        </div>
      </section>

      {/* ━━━ 底部菜单 ━━━ */}
      <section className="px-4 pt-1 pb-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {MENU_ITEMS.map((row, idx) => (
            <button
              key={row.id}
              onClick={() =>
                row.id === 'transactions'
                  ? onOpenTransactions()
                  : row.id === 'feedback'
                    ? setIsFeedbackOpen(true)
                    : row.id === 'password'
                      ? setShowPwdModal(true)
                      : row.id === 'blocked'
                        ? openBlockModal()
                        : row.id === 'gender'
                          ? openGenderModal()
                          : row.id === 'grades'
                            ? setShowGradesModal(true)
                            : row.id === 'push'
                              ? handlePushToggle()
                              : setShowAbout(true)
              }
              className={`w-full flex items-center gap-3 py-3 px-4 text-left hover:bg-slate-50 transition-colors cursor-pointer ${
                idx > 0 ? 'border-t border-gray-50' : ''
              }`}
            >
              <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-gray-500 shrink-0">
                <Icon name={row.icon} className="text-sm" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-semibold text-gray-700 block">{row.label}</span>
                <span className="text-[10px] text-gray-400">{row.desc}</span>
              </div>
              {row.id === 'push' && pushEnabled !== null && (
                <span
                  className={`text-[10px] font-semibold shrink-0 mr-1 ${pushEnabled ? 'text-emerald-500' : 'text-gray-300'}`}
                >
                  {pushEnabled ? '已开启' : '未开启'}
                </span>
              )}
              <Icon name="chevron_right" className="text-gray-300 text-sm" />
            </button>
          ))}
        </div>

        {profile.studentId && (
          <div className="mt-3">
            <Button variant="danger" size="sm" block onClick={onLogout}>
              退出登录
            </Button>
          </div>
        )}
      </section>

      {/* 反馈弹窗 */}
      <FeedbackModal isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} onSuccess={onShowToast} />

      {/* 成绩与考试弹窗 —— 刷新目前的做法是重新走一次扫码登录，同一套流程会顺带重新同步课表/成绩/考试 */}
      <GradesExamsModal
        isOpen={showGradesModal}
        onClose={() => setShowGradesModal(false)}
        onRefresh={() => {
          setShowGradesModal(false);
          onRescanClick();
        }}
      />

      {/* 举报申诉弹窗 — 帖子因被多人举报自动隐藏(under_review)后，作者本人在这里说明情况 */}
      <ReportAppealModal
        isOpen={!!appealPostId}
        onClose={() => setAppealPostId(null)}
        targetType="post"
        targetId={appealPostId ? Number(appealPostId) : null}
      />

      {/* 性别展示弹窗 — 默认不公开，用户自己选了性别 + 打开显示开关才会在帖子/主页展示 */}
      <Modal
        isOpen={showGenderModal}
        onClose={() => setShowGenderModal(false)}
        title="性别展示"
        subtitle="不填 / 不开启，别人都看不到"
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" size="sm" block onClick={() => setShowGenderModal(false)}>
              取消
            </Button>
            <Button variant="primary" size="sm" block onClick={handleSaveGender} disabled={genderBusy}>
              {genderBusy ? '保存中…' : '保存'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-2">性别</label>
            <div className="flex gap-2">
              {[
                { value: null, label: '不设置' },
                { value: 'male' as const, label: '♂ 男' },
                { value: 'female' as const, label: '♀ 女' },
              ].map((opt) => (
                <button
                  key={String(opt.value)}
                  type="button"
                  onClick={() => {
                    setGenderDraft(opt.value);
                    // 选性别时自动打开可见性（如果之前没设过性别）
                    if (opt.value && !profile.gender) setGenderVisibleDraft(true);
                  }}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                    genderDraft === opt.value ? 'bg-primary text-white' : 'bg-slate-50 text-gray-500 hover:bg-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div
            className={`flex items-center justify-between gap-3 ${!genderDraft ? 'opacity-40 pointer-events-none' : ''}`}
          >
            <div>
              <span className="block text-xs font-bold text-gray-600">在帖子里显示性别</span>
              <span className="block text-[10px] text-gray-400 mt-0.5">
                开启后，首页帖子和校园圈（匿名帖除外）会带上性别标识
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={genderVisibleDraft}
              onClick={() => setGenderVisibleDraft((v) => !v)}
              className={`shrink-0 w-11 h-6 rounded-full transition-colors cursor-pointer relative ${genderVisibleDraft ? 'bg-primary' : 'bg-gray-200'}`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${genderVisibleDraft ? 'translate-x-5' : 'translate-x-0.5'}`}
              />
            </button>
          </div>
        </div>
      </Modal>

      {/* 修改密码弹窗 */}
      <Modal
        isOpen={showPwdModal}
        onClose={() => setShowPwdModal(false)}
        title="修改密码"
        subtitle="忘记旧密码？先用微信扫码登录，再来这里可直接重设"
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" size="sm" block onClick={() => setShowPwdModal(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              block
              onClick={handleChangePassword}
              disabled={pwdBusy || newPwd.length < 6 || newPwd !== newPwd2}
            >
              {pwdBusy ? '提交中…' : '确认修改'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">旧密码</label>
            <input
              type="password"
              value={oldPwd}
              onChange={(e) => setOldPwd(e.target.value)}
              placeholder="扫码登录的会话可留空"
              autoComplete="current-password"
              className="w-full bg-slate-50 border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary focus:outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">新密码 *</label>
            <input
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              placeholder="至少6位"
              autoComplete="new-password"
              className="w-full bg-slate-50 border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary focus:outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">确认新密码 *</label>
            <input
              type="password"
              value={newPwd2}
              onChange={(e) => setNewPwd2(e.target.value)}
              placeholder="再输一遍"
              autoComplete="new-password"
              className="w-full bg-slate-50 border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary focus:outline-none transition-all"
            />
          </div>
          <p className="text-[10px] text-gray-400">修改成功后，其他设备的登录将失效。</p>
        </div>
      </Modal>

      {/* 拉黑管理弹窗 — 会话列表不显示已拉黑用户，这里是唯一解除入口 */}
      <Modal
        isOpen={showBlockModal}
        onClose={() => setShowBlockModal(false)}
        title="拉黑管理"
        subtitle="拉黑后双方无法互发私信"
      >
        {blockedUsers === null ? (
          <p className="text-xs text-gray-400 text-center py-6">加载中…</p>
        ) : blockedUsers.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">没有拉黑任何人</p>
        ) : (
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {blockedUsers.map((u) => (
              <div key={u.id} className="flex items-center gap-3 p-2 rounded-xl bg-slate-50">
                {u.avatarUrl ? (
                  <img src={u.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                    <Icon name="person" className="text-gray-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{u.nickname || '未知用户'}</p>
                  <p className="text-[10px] text-gray-400">
                    拉黑于 {u.blockedAt ? new Date(u.blockedAt).toLocaleDateString() : '—'}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleUnblock(u.id)}
                  disabled={unblockBusyId !== null}
                >
                  {unblockBusyId === u.id ? '处理中…' : '取消拉黑'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* 关于弹窗 — 完整免责声明 */}
      <Modal
        isOpen={showAbout}
        onClose={() => setShowAbout(false)}
        title="免责声明与用户协议"
        subtitle="生效日期：2026年6月23日 · 川财CampusLink 校园信息平台"
      >
        <div className="text-xs text-gray-600 leading-relaxed space-y-3 max-h-[55vh] overflow-y-auto pr-1">
          <p className="text-[10px] text-gray-500">
            欢迎使用川财CampusLink。本平台由学生团队独立开发运营，非学校官方产品。使用即表示同意以下全部条款。
          </p>
          {DISCLAIMER_SECTIONS.map((s, i) => (
            <div
              key={i}
              className={
                s.highlight ? 'bg-amber-50 border border-amber-200 rounded-lg p-3 text-[11px] text-amber-800' : ''
              }
            >
              <h4 className={`font-bold mb-1 ${s.highlight ? 'text-amber-900' : 'text-on-surface'}`}>{s.title}</h4>
              <p className={s.highlight ? '' : 'text-[11px]'}>{s.content}</p>
            </div>
          ))}
          <div className="border-t border-gray-100 pt-3 text-center text-[10px] text-gray-400">川财CampusLink</div>
        </div>
      </Modal>

      {/* 头像大图预览 */}
      {previewImage && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col" onClick={() => setPreviewImage(null)}>
          <button
            onClick={() => setPreviewImage(null)}
            className="absolute top-4 left-4 z-10 w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-white"
          >
            <Icon name="arrow_back" className="text-lg" />
          </button>
          <div className="flex-1 flex items-center justify-center">
            <img
              src={previewImage}
              alt=""
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
