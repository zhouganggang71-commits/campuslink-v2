import Icon from '../ui/Icon';
interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  setSelectedListing: (listing: null) => void;
}

const TABS = [
  { key: 'home', icon: 'home', label: '首页' },
  { key: 'circles', icon: 'group', label: '校园圈' },
  { key: 'publish', icon: 'add', label: '发布', special: true },
  { key: 'schedule', icon: 'calendar_month', label: '课表' },
  { key: 'profile', icon: 'person', label: '我的' },
];

export default function BottomNav({ activeTab, setActiveTab, setSelectedListing }: BottomNavProps) {
  return (
    <nav
      aria-label="主导航"
      className="fixed bottom-0 left-0 w-full z-40 bg-white/90 backdrop-blur-md border-t border-outline-variant/70 shadow-[0px_-4px_16px_rgba(23,27,36,0.05)] py-1.5 pb-safe flex justify-around items-center max-w-lg mx-auto right-0"
    >
      {TABS.map((item) => {
        const isSelected = activeTab === item.key;

        if (item.special) {
          return (
            <button
              key={item.key}
              onClick={() => {
                setActiveTab(item.key);
                setSelectedListing(null);
              }}
              aria-label={item.label}
              className="relative -mt-6 flex flex-col items-center justify-center cursor-pointer active:scale-95 transition-transform"
            >
              <span className="w-12 h-12 rounded-full bg-primary flex items-center justify-center shadow-[0_6px_16px_rgba(47,111,224,0.38)] ring-4 ring-background">
                <Icon name={item.icon} className="text-2xl text-white" />
              </span>
            </button>
          );
        }

        return (
          <button
            key={item.key}
            onClick={() => {
              setActiveTab(item.key);
              setSelectedListing(null);
            }}
            aria-label={item.label}
            className={`flex flex-col items-center justify-center gap-0.5 transition-all px-3 py-1.5 rounded-2xl h-12 min-w-16 relative cursor-pointer active:scale-90 ${isSelected ? 'text-primary bg-primary/8 font-bold' : 'text-inactive-grey hover:bg-black/[0.03]'}`}
          >
            <div className="relative">
              <Icon name={item.icon} className="text-xl" />
            </div>
            <span className="text-[9px] font-medium">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
