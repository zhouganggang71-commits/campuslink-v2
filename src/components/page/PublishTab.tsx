import { useState, FormEvent } from 'react';
import { Listing, ORGANIZATIONS } from '../../types';
import Icon from '../ui/Icon';

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
}

export default function PublishTab({ onPublish, onCancel, isOrg, isVerified, editListing }: PublishTabProps) {
  const buildInitial = (): Record<string, string> => {
    if (!editListing)
      return {
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

  const update = (updates: Record<string, string>) => setForm((prev) => ({ ...prev, ...updates }));
  const ft = (key: string) => form[key] || '';

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!ft('title').trim()) return;

    const pt = ft('postType') as Listing['postType'];
    if (pt === 'sell' && !ft('price')) return;

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

    let finalImg = ft('imageUrl');
    if (!finalImg) {
      if (pt === 'activity') finalImg = 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800';
      else if (pt === 'study') finalImg = 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800';
      else finalImg = 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=800';
    }

    onPublish({
      title,
      price,
      originalPrice: pt === 'sell' && ft('originalPrice') ? parseFloat(ft('originalPrice')) : undefined,
      description,
      imageUrls: [finalImg],
      category,
      postType: pt,
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

    // Reset form
    setForm({
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
      activityOrg: '',
      studyType: '找搭子',
      targetCount: '2',
    });
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

        {/* ===== 通用字段 ===== */}
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">图片链接 (可选)</label>
          <input
            type="url"
            placeholder="粘贴图片地址"
            value={ft('imageUrl')}
            onChange={(e) => update({ imageUrl: e.target.value })}
            className="w-full bg-gray-50 text-[13px] border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-xl p-3 focus:outline-none transition-all"
          />
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
            onClick={onCancel}
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
