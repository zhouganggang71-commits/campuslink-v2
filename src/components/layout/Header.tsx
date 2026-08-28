import { memo } from 'react';
import Icon from '../ui/Icon';
interface HeaderProps {
  selectedListing: boolean;
  activeTab: string;
  onClearListing: () => void;
  onNotificationsClick?: () => void;
  notificationCount?: number;
  isDark?: boolean;
  onToggleTheme?: () => void;
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
  onNotificationsClick,
  notificationCount = 0,
  isDark = false,
  onToggleTheme,
}: HeaderProps) {
  return (
    <header className="w-full bg-white/85 dark:bg-slate-800/85 backdrop-blur-md border-b border-outline-variant/70 h-14 flex items-center justify-between sticky top-0 z-40">
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
          <>
            <img src="/campus/logo.png" alt="川财CampusLink" className="h-8 w-8 rounded-xl object-contain shadow-sm" />
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] text-on-surface-variant/70 font-medium">川财</span>
              <span className="font-bold text-sm text-on-surface tracking-tight">川财CampusLink</span>
            </div>
          </>
        )}
      </div>
      <div className="hidden sm:flex text-primary text-xs font-semibold bg-primary/8 rounded-full px-3.5 py-1.5">
        {selectedListing ? '详情' : (TAB_LABELS[activeTab] ?? '')}
      </div>
      <div className="flex items-center gap-1 pr-2.5">
        {selectedListing ? (
          <button
            onClick={onClearListing}
            aria-label="返回"
            className="text-on-surface-variant hover:bg-black/[0.04] transition-colors p-2 rounded-full active:scale-95 cursor-pointer"
          >
            <Icon name="arrow_back" className="text-lg" />
          </button>
        ) : (
          <>
            <button
              onClick={onToggleTheme}
              aria-label="切换主题"
              className="text-on-surface-variant hover:bg-black/[0.04] dark:hover:bg-white/[0.08] transition-colors p-2 rounded-full active:scale-95 cursor-pointer"
            >
              <Icon name={isDark ? 'light_mode' : 'dark_mode'} className="text-lg" />
            </button>
            <button
              onClick={onNotificationsClick}
              aria-label="通知"
              className="relative text-on-surface-variant hover:bg-black/[0.04] dark:hover:bg-white/[0.08] transition-colors p-2 rounded-full active:scale-95 cursor-pointer"
            >
              <Icon name="notifications" className="text-lg" />
              {notificationCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 bg-course-red text-white text-[9px] font-bold rounded-full flex items-center justify-center border border-white">
                  {notificationCount > 99 ? '99+' : notificationCount}
                </span>
              )}
            </button>
          </>
        )}
      </div>
    </header>
  );
});
