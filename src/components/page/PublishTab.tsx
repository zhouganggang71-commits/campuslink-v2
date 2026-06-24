import { useState, FormEvent, useEffect, useRef, useCallback } from 'react';
import { Listing, ORGANIZATIONS } from '../../types';
import { uploadApi } from '../../api';
import { checkSensitive } from '../../utils/sensitiveFilter';
import Icon from '../ui/Icon';

// ── 草稿持久化 ──
const DRAFT_KEY = 'campuslink_publish_draft';

function loadDraft(): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // 至少有一条实质内容才算有效草稿
    if (parsed.title || parsed.description || parsed.imageUrl) return parsed;
    return null;
  } catch { return null; }
}

function saveDraft(form: Record<string, string>) {
  try {
    // 只有有实质内容才存，避免空表单覆盖有效草稿
    if (form.title || form.description || form.imageUrl) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    }
  } catch { /* localStorage 不可用时静默 */ }
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch {}
}

// ── 简易 debounce（零依赖） ──
function useDebounce<T extends (...args: any[]) => void>(fn: T, delay: number): T & { flush: () => void } {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const lastArgsRef = useRef<any[] | null>(null);

  const debounced = useCallback((...args: any[]) => {
    lastArgsRef.current = args;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      fnRef.current(...(lastArgsRef.current || []));
      lastArgsRef.current = null;
    }, delay);
  }, [delay]) as any;

  debounced.flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      if (lastArgsRef.current) {
        fnRef.current(...lastArgsRef.current);
        lastArgsRef.current = null;
      }
    }
  }, []);

  return debounced;
}

const POST_TYPES: { key: Listing['postType']; label: string; icon: string; locked?: boolean; lockMsg?: string }[] = [
  { key: 'sell', label: '二手', icon: 'shopping_bag' },
  { key: 'lost', label: '失物', icon: 'search' },
  { key: 'found', label: '招领', icon: 'volunteer_activism' },
  { key: 'carpool', label: '拼车', icon: 'car' },
  { key: 'job', label: '兼职', icon: 'briefcase' },
  { key: 'activity', label: '活动', icon: 'calendar', locked: true, lockMsg: '仅限学生会/团委/社团发布' },
  { key: 'study', label: '学习', icon: 'graduation_cap' },
];

const CATEGORIES_SELL = ['数码电器', '图书教材', '运动户外', '生活用品', '服饰鞋包', '其他闲置'];
const CATEGORIES_JOB = ['校内勤工', '家教辅导', '实习实训', '校外兼职', '其他'];
const CATEGORIES_STUDY = ['找搭子', '问题答疑', '资料分享', '组队竞赛', '其他'];
const CATEGORIES_ACTIVITY = ['社团活动', '学术讲座', '文艺演出', '体育赛事', '志愿服务', '其他'];

interface PublishTabProps {
  onPublish: (listing: Omit<Listing, 'id'>) => void;
  onCancel: () => void;
  isOrg: boolean;
  isVerified: boolean;
  editListing?: Listing | null;
  showToast?: (msg: string, type?: 'success' | 'info') => void;
}

export default function PublishTab({ onPublish, onCancel, isOrg, isVerified, editListing, showToast }: PublishTabProps) {
  const DEFAULT_FORM: Record<string, string> = {
    postType: 'sell',
    title: '',
    description: '',
    price: '',
    originalPrice: '',
    contactInfo: '',
    imageUrl: '',
    category: '数码电器',
    departFrom: '',
    arriveTo: '',
    departTime: '',
    seats: '2',
    jobType: '校内勤工',
    salary: '',
    workTime: '',
    activityTime: '',
    activityLocation: '',
    activityOrg: '校学生会',
    studyType: '找搭子',
    targetCount: '2',
  };

  const buildInitial = (): Record<string, string> => {
    if (!editListing) {
      // 尝试恢复草稿（编辑模式下不使用草稿）
      const draft = loadDraft();
      if (draft) return draft;
      return { ...DEFAULT_FORM };
    }
    // 从 editListing 提取字段
    const desc = editListing.description || '';
    const extractDesc = (prefix: string): string => {
      const re = new RegExp(`${prefix}：([^\\n]*)`);
      const m = desc.match(re);
      return m ? m[1] : '';
    };
    return {
      postType: editListing.postType || 'sell',
      title: editListing.title || '',
      description: desc,
      price: editListing.price ? String(editListing.price) : '',
      originalPrice: editListing.originalPrice ? String(editListing.originalPrice) : '',
      contactInfo: editListing.contactInfo || '',
      imageUrl: editListing.imageUrls?.[0] || '',
      category: editListing.category || '数码电器',
      departFrom: extractDesc('出发') || extractDesc('遗失地点') || extractDesc('拾到地点') || '',
      arriveTo: extractDesc('目的地') || extractDesc('特征') || '',
      departTime: extractDesc('时间') || '',
      seats: extractDesc('空位') || '2',
      jobType: extractDesc('工作类型') || '校内勤工',
      salary: extractDesc('薪资') || '',
      workTime: extractDesc('时间') || '',
      activityTime: extractDesc('活动时间') || '',
      activityLocation: extractDesc('地点') || '',
      activityOrg: extractDesc('主办') || '',
      studyType: extractDesc('类型') || '找搭子',
      targetCount: extractDesc('寻找人数') || '2',
    };
  };

  const [form, setForm] = useState<Record<string, string>>(buildInitial);
  const [showDraftPrompt, setShowDraftPrompt] = useState(() => !!loadDraft() && !editListing);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── 伪进度动画 ──
  const startFakeProgress = () => {
    setUploadProgress(0);
    const start = Date.now();
    const DURATION = 2000; // 0→90% 持续 2 秒
    progressTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(90, Math.round((elapsed / DURATION) * 90));
      setUploadProgress(pct);
      if (pct >= 90 && progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    }, 80);
  };

  const finishProgress = () => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    setUploadProgress(100);
    setTimeout(() => setUploadProgress(0), 600);
  };

  const update = (updates: Record<string, string>) => setForm((prev) => ({ ...prev, ...updates }));
  const ft = (key: string) => form[key] || '';

  // ── 草稿自动保存（debounce 2 秒） ──
  const debouncedSave = useDebounce((f: Record<string, string>) => saveDraft(f), 2000);

  useEffect(() => {
    if (!editListing) debouncedSave(form);
    return () => debouncedSave.flush();
  }, [form, editListing, debouncedSave]);

  // 清理进度定时器
  useEffect(() => {
    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, []);

  // ── Canvas 压缩（长边最大 1920px，JPEG quality 0.8） ──
  const compressImage = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const MAX = 1920;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
          else { width = Math.round(width * MAX / height); height = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas 不可用'));
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('压缩失败'));
        }, 'image/jpeg', 0.8);
      };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('图片加载失败')); };
      img.src = objectUrl;
    });
  };

  // ── 图片上传 ──
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > 10 * 1024 * 1024) return;

    setUploadingImage(true);
    startFakeProgress();
    try {
      // 大于 500KB 的图片先压缩再上传
      const blob = file.size > 500 * 1024 ? await compressImage(file) : file;
      const formData = new FormData();
      formData.append('file', blob, blob instanceof File ? blob.name : 'compressed.jpg');
      const res = await uploadApi.uploadImage(formData) as any;
      if (res.code === 0 && res.data?.url) {
        update({ imageUrl: res.data.url });
      }
    } catch { /* 静默 */ }
    finishProgress();
    setUploadingImage(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!ft('title').trim()) return;

    const pt = ft('postType') as Listing['postType'];
    if (pt === 'sell' && !ft('price')) return;

    // ── 违禁词检查 ──
    const combinedText = [ft('title'), ft('description'), ft('contactInfo')].join(' ');
    const result = checkSensitive(combinedText);
    if (!result.passed) {
      showToast?.(`内容包含违禁词：${result.hitWords.slice(0, 3).join('、')}`, 'info');
      return;
    }

    // Build title and description dynamically per type
    const title = ft('title');
    let description = ft('description') || '';
    let price: number | undefined;
    const category = ft('category') || '其他';
    const contactInfo: string | undefined = ft('contactInfo').trim() || undefined;

    switch (pt) {
      case 'sell':
        price = parseFloat(ft('price')) || 0;
        break;
      case 'lost':
        description = description || `遗失地点：${ft('departFrom') || '未知'}\n特征：${ft('arriveTo') || '未知'}`;
        break;
      case 'found':
        description = description || `拾到地点：${ft('departFrom') || '未知'}\n特征：${ft('arriveTo') || '未知'}`;
        break;
      case 'carpool':
        description =
          description ||
          `出发：${ft('departFrom')} → 目的地：${ft('arriveTo')}\n时间：${ft('departTime')}\n空位：${ft('seats')}人`;
        break;
      case 'job':
        description = description || `工作类型：${ft('jobType')}\n薪资：${ft('salary')}\n时间：${ft('workTime')}`;
        break;
      case 'activity':
        description =
          description || `活动时间：${ft('activityTime')}\n地点：${ft('activityLocation')}\n主办：${ft('activityOrg')}`;
        break;
      case 'study':
        description = description || `类型：${ft('studyType')}\n寻找人数：${ft('targetCount')}人`;
        break;
    }

    const finalImg = ft('imageUrl') || '';

    onPublish({
      title,
      price,
      originalPrice: pt === 'sell' && ft('originalPrice') ? parseFloat(ft('originalPrice')) : undefined,
      description,
      imageUrls: finalImg ? [finalImg] : [],
      category,
      postType: pt,
      publisherId: 0,
      publisherName: '当前用户',
      publisherAvatar: '',
      isVerifiedStudent: isVerified,
      isOfficialOrg: pt === 'activity' && !!ft('activityOrg'),
      orgName: pt === 'activity' ? ft('activityOrg') : undefined,
      publishedTimeText: '刚刚发布',
      views: 1,
      favorites: 0,
      contactInfo,
      status: 'active',
    });

    // 清除草稿
    clearDraft();

    // Reset form — 保留 postType 和类型相关字段，方便连续发布同类型
    const keepFields = typeKeepFields[pt] || [];
    const resetForm: Record<string, string> = { ...DEFAULT_FORM };
    // 保留 postType
    resetForm.postType = pt;
    // 保留类型特定字段（如 departFrom, arriveTo 等）
    for (const f of keepFields) {
      if (f in form) resetForm[f] = form[f];
    }
    setForm(resetForm);
  };

  // 各类型保留字段（发布后不清空，方便连续发布）
  const typeKeepFields: Record<string, string[]> = {
    sell: ['category'],
    lost: ['departFrom'],
    found: ['departFrom'],
    carpool: ['departFrom', 'arriveTo', 'seats'],
    job: ['jobType', 'salary', 'workTime'],
    activity: ['activityOrg', 'activityTime', 'activityLocation'],
    study: ['studyType', 'targetCount'],
  };

  const pt = ft('postType') as Listing['postType'];

  // Check if activity is locked for non-org users
  const activityLocked = pt === 'activity' && !isOrg;

  return (
    <div className="p-4 flex flex-col gap-4 animate-fade-in flex-1">
      <div className="pb-2">
        <h2 className="font-headline text-xl font-bold text-gray-900 mb-1">发布信息</h2>
        <p className="text-[12px] text-gray-500">选择分类，发布到对应的信息板块</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 类型选择 */}
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">信息类型 *</label>
          <div className="grid grid-cols-4 gap-2">
            {POST_TYPES.map((ptEntry) => {
              const isSelected = ft('postType') === ptEntry.key;
              const isDisabled = ptEntry.locked && !isOrg;
              return (
                <button
                  key={ptEntry.key}
                  type="button"
                  onClick={() => !isDisabled && update({ postType: ptEntry.key })}
                  disabled={isDisabled}
                  className={`flex flex-col items-center gap-1 py-2.5 rounded-lg border text-xs font-semibold transition-all ${isSelected ? 'bg-primary text-white border-primary shadow-sm' : isDisabled ? 'bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed' : 'bg-slate-50 text-gray-600 border-slate-200 hover:border-slate-300 cursor-pointer'}`}
                >
                  <Icon name={ptEntry.icon} className="text-lg" />
                  {ptEntry.label}
                  {isDisabled && <span className="text-[8px] mt-0.5 text-gray-400">🔒 组织认证</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* ===== 草稿恢复提示 ===== */}
        {showDraftPrompt && (
          <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2">
              <Icon name="schedule" className="text-primary text-base" />
              <span className="text-xs font-semibold text-primary">检测到未发布的草稿</span>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => { clearDraft(); setForm({ ...DEFAULT_FORM }); setShowDraftPrompt(false); }}
                className="text-[10px] text-gray-400 hover:text-gray-600 cursor-pointer px-2 py-1">丢弃</button>
              <button type="button" onClick={() => setShowDraftPrompt(false)}
                className="text-[10px] font-semibold text-primary bg-primary/10 hover:bg-primary/20 rounded-lg px-3 py-1 cursor-pointer">继续编辑</button>
            </div>
          </div>
        )}

        {/* ===== 活动锁定提示 ===== */}
        {activityLocked && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Icon name="lock" className="text-amber-600 text-lg" />
              <span className="text-sm font-bold text-amber-700">活动板块仅限认证组织发布</span>
            </div>
            <p className="text-xs text-amber-600">
              请先完成<b>组织认证</b>（学生会/团委/社团），或联系已认证组织代为发布。
            </p>
            <p className="text-[10px] text-amber-500">需要学校出具的社团注册证明或团委授权书。</p>
          </div>
        )}

        {/* ===== 标题（所有类型通用） ===== */}
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">
            {pt === 'sell'
              ? '商品标题'
              : pt === 'lost'
                ? '失物标题'
                : pt === 'found'
                  ? '招领标题'
                  : pt === 'carpool'
                    ? '行程标题'
                    : pt === 'job'
                      ? '职位标题'
                      : pt === 'activity'
                        ? '活动标题'
                        : '标题'}{' '}
            *
          </label>
          <input
            type="text"
            required
            placeholder={
              pt === 'sell'
                ? '例如：九成新 Sony 降噪耳机，毕业急出'
                : pt === 'lost'
                  ? '例如：丢失校园卡一张'
                  : pt === 'found'
                    ? '例如：拾到 AirPods 一副'
                    : pt === 'carpool'
                      ? '例如：周五下午拼车去火车站'
                      : pt === 'job'
                        ? '例如：招校内送餐兼职'
                        : pt === 'activity'
                          ? '例如：草地星空音乐节'
                          : '例如：找英语六级打卡搭子'
            }
            value={ft('title')}
            onChange={(e) => update({ title: e.target.value })}
            className="w-full bg-gray-50 text-[13px] border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl p-3 focus:outline-none transition-all"
          />
        </div>

        {/* ===== SELL: 分类+价格 ===== */}
        {pt === 'sell' && (
          <>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">商品品类 *</label>
              <select
                value={ft('category')}
                onChange={(e) => update({ category: e.target.value })}
                className="w-full bg-gray-50 text-[13px] border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl p-3 focus:outline-none transition-all"
              >
                {CATEGORIES_SELL.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">售价 (¥) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  placeholder="例如：1200"
                  value={ft('price')}
                  onChange={(e) => update({ price: e.target.value })}
                  className="w-full bg-gray-50 text-[13px] border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl p-3 focus:outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">原价 (¥)</label>
                <input
                  type="number"
                  placeholder="例如：2299"
                  value={ft('originalPrice')}
                  onChange={(e) => update({ originalPrice: e.target.value })}
                  className="w-full bg-gray-50 text-[13px] border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl p-3 focus:outline-none transition-all"
                />
              </div>
            </div>
          </>
        )}

        {/* ===== LOST/FOUND: 地点+特征 ===== */}
        {(pt === 'lost' || pt === 'found') && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">
                {pt === 'lost' ? '遗失地点' : '拾到地点'}
              </label>
              <input
                type="text"
                placeholder="例如：图书馆二楼"
                value={ft('departFrom')}
                onChange={(e) => update({ departFrom: e.target.value })}
                className="w-full bg-gray-50 text-[13px] border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl p-3 focus:outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">物品特征</label>
              <input
                type="text"
                placeholder={pt === 'lost' ? '例如：蓝色保护壳' : '例如：蓝色保护壳'}
                value={ft('arriveTo')}
                onChange={(e) => update({ arriveTo: e.target.value })}
                className="w-full bg-gray-50 text-[13px] border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl p-3 focus:outline-none transition-all"
              />
            </div>
          </div>
        )}

        {/* ===== CARPOOL: 出发地+目的地+时间+人数 ===== */}
        {pt === 'carpool' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">出发地</label>
                <input
                  type="text"
                  placeholder="例如：学校南门"
                  value={ft('departFrom')}
                  onChange={(e) => update({ departFrom: e.target.value })}
                  className="w-full bg-gray-50 text-[13px] border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl p-3 focus:outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">目的地</label>
                <input
                  type="text"
                  placeholder="例如：火车站"
                  value={ft('arriveTo')}
                  onChange={(e) => update({ arriveTo: e.target.value })}
                  className="w-full bg-gray-50 text-[13px] border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl p-3 focus:outline-none transition-all"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">出发时间</label>
                <input
                  type="text"
                  placeholder="例如：周五 17:00"
                  value={ft('departTime')}
                  onChange={(e) => update({ departTime: e.target.value })}
                  className="w-full bg-gray-50 text-[13px] border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl p-3 focus:outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">空位数</label>
                <select
                  value={ft('seats')}
                  onChange={(e) => update({ seats: e.target.value })}
                  className="w-full bg-gray-50 text-[13px] border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl p-3 focus:outline-none transition-all"
                >
                  {['1', '2', '3', '4'].map((s) => (
                    <option key={s} value={s}>
                      {s}人
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </>
        )}

        {/* ===== JOB: 工作类型+薪资+时间 ===== */}
        {pt === 'job' && (
          <>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">工作类型 *</label>
              <select
                value={ft('jobType')}
                onChange={(e) => update({ jobType: e.target.value })}
                className="w-full bg-gray-50 text-[13px] border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl p-3 focus:outline-none transition-all"
              >
                {CATEGORIES_JOB.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">薪资</label>
                <input
                  type="text"
                  placeholder="例如：15元/时"
                  value={ft('salary')}
                  onChange={(e) => update({ salary: e.target.value })}
                  className="w-full bg-gray-50 text-[13px] border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl p-3 focus:outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">工作时间</label>
                <input
                  type="text"
                  placeholder="例如：课余时间灵活安排"
                  value={ft('workTime')}
                  onChange={(e) => update({ workTime: e.target.value })}
                  className="w-full bg-gray-50 text-[13px] border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl p-3 focus:outline-none transition-all"
                />
              </div>
            </div>
          </>
        )}

        {/* ===== ACTIVITY: 活动时间+地点+主办组织 ===== */}
        {pt === 'activity' && !activityLocked && (
          <>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">主办组织 *</label>
              <select
                value={ft('activityOrg')}
                onChange={(e) => update({ activityOrg: e.target.value })}
                className="w-full bg-gray-50 text-[13px] border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl p-3 focus:outline-none transition-all"
              >
                {ORGANIZATIONS.map((org) => (
                  <option key={org} value={org}>
                    {org}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">活动分类 *</label>
              <select
                value={ft('category')}
                onChange={(e) => update({ category: e.target.value })}
                className="w-full bg-gray-50 text-[13px] border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl p-3 focus:outline-none transition-all"
              >
                {CATEGORIES_ACTIVITY.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">活动时间 *</label>
                <input
                  type="text"
                  placeholder="例如：6/21 18:00-22:00"
                  value={ft('activityTime')}
                  onChange={(e) => update({ activityTime: e.target.value })}
                  className="w-full bg-gray-50 text-[13px] border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl p-3 focus:outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">活动地点 *</label>
                <input
                  type="text"
                  placeholder="例如：大操场"
                  value={ft('activityLocation')}
                  onChange={(e) => update({ activityLocation: e.target.value })}
                  className="w-full bg-gray-50 text-[13px] border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl p-3 focus:outline-none transition-all"
                />
              </div>
            </div>
          </>
        )}

        {/* ===== STUDY: 类型+人数 ===== */}
        {pt === 'study' && (
          <>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">互助类型 *</label>
              <select
                value={ft('studyType')}
                onChange={(e) => update({ studyType: e.target.value })}
                className="w-full bg-gray-50 text-[13px] border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl p-3 focus:outline-none transition-all"
              >
                {CATEGORIES_STUDY.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">寻找人数</label>
              <select
                value={ft('targetCount')}
                onChange={(e) => update({ targetCount: e.target.value })}
                className="w-full bg-gray-50 text-[13px] border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl p-3 focus:outline-none transition-all"
              >
                {['1', '2', '3', '4', '5', '不限'].map((s) => (
                  <option key={s} value={s}>
                    {s}人
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {/* ===== 图片上传 ===== */}
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">图片 (可选)</label>
          {ft('imageUrl') ? (
            <div className="relative w-32 h-32 rounded-xl overflow-hidden bg-slate-100 border border-gray-200">
              <img src={ft('imageUrl')} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              <button type="button" onClick={() => update({ imageUrl: '' })}
                className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center cursor-pointer transition-colors"
                aria-label="移除图片">
                <Icon name="close" className="text-white text-xs" />
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed rounded-xl cursor-pointer transition-colors
                  ${uploadingImage ? 'border-primary/30 bg-primary/5' : 'border-gray-300 bg-gray-50 hover:border-primary/50 hover:bg-primary/5'}`}
              >
                {uploadingImage ? (
                  <div className="w-full px-4">
                    <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-gray-400 mt-1 block text-center">
                      {uploadProgress >= 100 ? '处理中...' : `上传中 ${uploadProgress}%`}
                    </span>
                  </div>
                ) : (
                  <Icon name="add_a_photo" className="text-2xl text-gray-400" />
                )}
                <span className="text-xs text-gray-400">{uploadingImage ? '' : '点击上传图片（支持 JPG/PNG/WebP，最大 10MB）'}</span>
              </div>
              <details className="group">
                <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-600 select-none">或粘贴图片链接</summary>
                <input
                  type="url"
                  placeholder="https://..."
                  value={ft('imageUrl')}
                  onChange={(e) => update({ imageUrl: e.target.value })}
                  className="mt-1.5 w-full bg-gray-50 text-[13px] border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl p-3 focus:outline-none transition-all"
                />
              </details>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">联系方式 (可选)</label>
          <input
            type="text"
            placeholder="QQ/微信/电话"
            value={ft('contactInfo')}
            onChange={(e) => update({ contactInfo: e.target.value })}
            className="w-full bg-gray-50 text-[13px] border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl p-3 focus:outline-none transition-all"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">详情描述</label>
          <textarea
            rows={3}
            placeholder="补充说明..."
            value={ft('description')}
            onChange={(e) => update({ description: e.target.value })}
            className="w-full bg-gray-50 text-[13px] border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl p-3 focus:outline-none transition-all resize-none"
          />
        </div>

        <div className="pt-2 flex gap-3">
          <button
            type="button"
            onClick={() => { clearDraft(); onCancel(); }}
            className="flex-1 py-2.5 bg-slate-100 text-gray-600 font-semibold text-xs rounded-lg active:scale-95 cursor-pointer"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={activityLocked}
            className="flex-1 py-2.5 bg-primary text-white font-semibold text-xs rounded-lg active:scale-95 shadow-md cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {activityLocked ? '🔒 需要组织认证' : '提交审核'}
          </button>
        </div>
      </form>
    </div>
  );
}
