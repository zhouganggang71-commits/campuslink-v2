/**
 * 新手教程 — 首次进入网页展示，凸显平台优势
 * 风格：先抛出问题，再给出 CampusLink 的解决方案
 * 用 localStorage 记住已读，不会重复显示
 */
import { useState } from 'react';
import Icon from './Icon';

const GUIDE_KEY = 'campuslink_guide_done';

const slides = [
  {
    icon: 'forum',
    title: '想找同好却不知道去哪？',
    desc: '底部「校园圈」Tab → 按兴趣分了学业互助、考证考试、美食探店、答疑解惑等板块，一键切换。找到你的圈子，发帖互动、结识志同道合的朋友。',
  },
  {
    icon: 'calendar_month',
    title: '还在繁琐的教务系统翻课表？',
    desc: '扫码登录后，底部「课表」Tab → 课表、成绩、考试安排自动同步，不用再记多个入口。支持手动调课，考前自动倒计时提醒。',
  },
  {
    icon: 'celebration',
    title: '学校活动不知道在哪报名？',
    desc: '首页「活动」分类 → 音乐节、比赛、讲座等活动一目了然。点进去直接报名，报名记录在「我的」→「我的报名」中随时查看。',
  },
  {
    icon: 'chat',
    title: '生活和学习消息混在一起？',
    desc: '底部「消息」Tab → 私信按场景自动分类：二手交易买家、学习小组队友、校园圈新朋友互不干扰。陌生人消息需你确认后才可见，不被骚扰。',
  },
  {
    icon: 'search',
    title: '找信息还在刷微信群和朋友圈？',
    desc: '首页按分类浏览——二手闲置、失物招领、拼车出行、兼职实习…也可以直接搜索关键词。收藏的帖子在「我的」→「我的收藏」里集中管理。',
  },
];

export default function NewUserGuide() {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(() => !!localStorage.getItem(GUIDE_KEY));

  if (done) return null;

  const current = slides[step];
  const isLast = step === slides.length - 1;

  const handleNext = () => {
    if (isLast) {
      localStorage.setItem(GUIDE_KEY, '1');
      setDone(true);
    } else {
      setStep((s) => s + 1);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(GUIDE_KEY, '1');
    setDone(true);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 animate-fade-in">
      <div className="bg-white rounded-3xl mx-4 w-full max-w-sm overflow-hidden shadow-2xl">
        {/* 进度点 */}
        <div className="flex justify-center gap-1.5 pt-6">
          {slides.map((_, i) => (
            <span
              key={i}
              className={`w-2 h-2 rounded-full transition-all ${i === step ? 'bg-primary w-5' : 'bg-gray-200'}`}
            />
          ))}
        </div>

        {/* 内容 */}
        <div className="px-6 py-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
            <Icon name={current.icon} className="text-2xl text-amber-600" />
          </div>
          <h3 className="text-base font-bold text-on-surface mb-3 leading-snug">{current.title}</h3>
          <p className="text-sm text-gray-500 leading-relaxed">{current.desc}</p>
        </div>

        {/* 操作按钮 */}
        <div className="px-6 pb-6 flex items-center gap-3">
          <button
            onClick={handleDismiss}
            className="text-xs text-gray-400 hover:text-gray-600 font-semibold cursor-pointer shrink-0"
          >
            不再显示
          </button>
          <button
            onClick={handleNext}
            className="flex-1 bg-primary text-white text-sm font-semibold py-2.5 rounded-full cursor-pointer hover:brightness-110 active:scale-[0.97] transition-all"
          >
            {isLast ? '开始使用' : '下一步'}
          </button>
        </div>
      </div>
    </div>
  );
}
