import { useState, useEffect } from 'react';
import Icon from './Icon';

export function useNetworkStatus() {
  const [online, setOnline] = useState(() => typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}

export default function OfflineBanner() {
  const online = useNetworkStatus();
  if (online) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[120] bg-amber-500 text-white text-center py-1.5 text-xs font-semibold flex items-center justify-center gap-1.5">
      <Icon name="wifi_off" className="text-sm" />
      网络连接已断开，部分功能不可用
    </div>
  );
}
