import { memo } from 'react';
import Icon from '../ui/Icon';
import { useTheme } from '../../utils/theme';
interface HeaderProps {
  selectedListing: boolean;
  activeTab: string;
  unreadCount: number;
  onClearListing: () => void;
  onMessagesClick: () => void;
}

const TAB_LABELS: Record<string, string> = {
  home: '校园广场',
  schedule: '课表',
  publish: '发布',
  messages: '消息',
  profile: '我的',
};

export default memo(function Header({
  selectedListing,
  activeTab,
  unreadCount,
  onClearListing,
  onMessagesClick,
}: HeaderProps) {
  const { theme, toggle } = useTheme();
  return (
    <header className="w-full bg-white border-b border-gray-100 h-14 flex items-center justify-between shadow-sm sticky top-0 z-40">
      <div className="flex items-center gap-2 pl-3">
        {selectedListing ? (
          <button
            onClick={onClearListing}
            aria-label="返回"
            className="text-gray-500 hover:bg-gray-100 transition-colors p-2 rounded-full active:scale-95 cursor-pointer"
          >
            <Icon name="arrow_back" className="text-lg" />
          </button>
        ) : (
          <img src="/campus/logo.png" alt="四川财经职业学院" className="h-8 w-8 rounded-lg object-contain" />
        )}
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] text-gray-400 font-medium">四川财经职业学院</span>
          <span className="font-bold text-sm text-gray-800 tracking-tight">CampusLink</span>
        </div>
      </div>
      <div className="hidden sm:flex text-gray-500 text-xs font-semibold bg-slate-100 rounded-lg px-3 py-1">
        {selectedListing ? '详情' : (TAB_LABELS[activeTab] ?? '')}
      </div>
      <div className="flex items-center gap-1 pr-2">
        <button
          onClick={onMessagesClick}
          aria-label="消息通知"
          className="text-gray-500 hover:bg-gray-100 transition-colors p-2 rounded-full active:scale-95 relative cursor-pointer"
        >
          <Icon name="notifications" className="text-lg" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white" />
          )}
        </button>
        <button
          onClick={toggle}
          aria-label="切换主题"
          className="text-gray-500 hover:bg-gray-100 transition-colors p-2 rounded-full active:scale-95 cursor-pointer"
        >
          <Icon name={theme === 'dark' ? 'sunny' : 'dark_mode'} className="text-lg" />
        </button>
      </div>
    </header>
  );
});
