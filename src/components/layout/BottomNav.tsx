import { memo } from 'react';
import Icon from '../ui/Icon';
interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  unreadCount: number;
  setSelectedListing: (listing: null) => void;
}

const TABS = [
  { key: 'home', icon: 'home', label: '首页' },
  { key: 'schedule', icon: 'calendar_month', label: '课表' },
  { key: 'publish', icon: 'add_circle', label: '发布', special: true },
  { key: 'circles', icon: 'group', label: '校园圈' },
  { key: 'profile', icon: 'person', label: '我的' },
];

export default memo(function BottomNav({ activeTab, setActiveTab, unreadCount, setSelectedListing }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 w-full z-40 bg-white border-t border-gray-100 shadow-[0px_-4px_12px_rgba(0,0,0,0.05)] py-2 pb-safe flex justify-around items-center max-w-lg mx-auto right-0">
      {TABS.map((item) => {
        const isSelected = activeTab === item.key;
        const badge = item.key === 'messages' ? unreadCount : 0;
        return (
          <button
            key={item.key}
            onClick={() => {
              setActiveTab(item.key);
              setSelectedListing(null);
            }}
            aria-label={item.label}
            className={`flex flex-col items-center justify-center transition-all p-2 rounded-xl h-12 w-16 relative cursor-pointer active:scale-90 ${isSelected ? 'text-primary font-bold' : 'text-gray-400 hover:bg-slate-50'}`}
          >
            <div className="relative">
              <Icon
                name={item.icon}
                className={`transition-all ${item.special ? 'text-[32px] text-primary' : 'text-xl'}`}
              />
              {badge > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-course-red text-white text-[9px] font-bold rounded-full flex items-center justify-center border border-white">
                  {badge}
                </span>
              )}
            </div>
            {!item.special && <span className="text-[9px] font-medium mt-1">{item.label}</span>}
          </button>
        );
      })}
    </nav>
  );
});
