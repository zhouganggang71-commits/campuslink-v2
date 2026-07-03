import { memo } from 'react';
import Icon from '../ui/Icon';
import { useTheme } from '../../utils/theme';
interface HeaderProps {
  selectedListing: boolean;
  activeTab: string;
  onClearListing: () => void;
  onProfileClick: () => void;
  avatarUrl?: string;
}

const TAB_LABELS: Record<string, string> = {
  home: '校园广场',
  schedule: '课表',
  publish: '发布',
  circles: '校园圈',
  messages: '消息',
  profile: '我的',
};

export default memo(function Header({
  selectedListing,
  activeTab,
  onClearListing,
  onProfileClick,
  avatarUrl,
}: HeaderProps) {
  const { theme, toggle } = useTheme();
  return (
    <header className="w-full bg-white/85 backdrop-blur-md border-b border-outline-variant/70 h-14 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center gap-2.5 pl-3.5">
        {selectedListing ? (
          <button
            onClick={onClearListing}
            aria-label="返回"
            className="text-on-surface-variant hover:bg-black/[0.04] transition-colors p-2 rounded-full active:scale-95 cursor-pointer"
          >
            <Icon name="arrow_back" className="text-lg" />
          </button>
        ) : (
          <img src="/campus/logo.png" alt="四川财经职业学院" className="h-8 w-8 rounded-xl object-contain shadow-sm" />
        )}
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] text-on-surface-variant/70 font-medium">四川财经职业学院</span>
          <span className="font-bold text-sm text-on-surface tracking-tight">CampusLink</span>
        </div>
      </div>
      <div className="hidden sm:flex text-primary text-xs font-semibold bg-primary/8 rounded-full px-3.5 py-1.5">
        {selectedListing ? '详情' : (TAB_LABELS[activeTab] ?? '')}
      </div>
      <div className="flex items-center gap-1 pr-2.5">
        <button
          onClick={toggle}
          aria-label="切换主题"
          className="text-on-surface-variant hover:bg-black/[0.04] transition-colors p-2 rounded-full active:scale-95 cursor-pointer"
        >
          <Icon name={theme === 'dark' ? 'sunny' : 'dark_mode'} className="text-lg" />
        </button>
        <button
          onClick={onProfileClick}
          aria-label="我的"
          className={`p-0.5 rounded-full active:scale-95 cursor-pointer ring-2 transition-all ${
            activeTab === 'profile' ? 'ring-primary' : 'ring-transparent hover:ring-primary/30'
          }`}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <span className="w-7 h-7 rounded-full bg-primary/8 flex items-center justify-center text-primary/70">
              <Icon name="person" className="text-base" />
            </span>
          )}
        </button>
      </div>
    </header>
  );
});
