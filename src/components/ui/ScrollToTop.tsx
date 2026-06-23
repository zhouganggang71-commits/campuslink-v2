import { useState, useEffect } from 'react';
import Icon from './Icon';

interface ScrollToTopProps {
  /** 滚动容器 ref */
  containerRef: React.RefObject<HTMLElement | null>;
  /** 触发显示的滚动距离，默认 500px */
  threshold?: number;
}

export default function ScrollToTop({ containerRef, threshold = 500 }: ScrollToTopProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onScroll = () => setVisible(el.scrollTop > threshold);
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // 初始化检查

    return () => el.removeEventListener('scroll', onScroll);
  }, [containerRef, threshold]);

  if (!visible) return null;

  return (
    <button
      onClick={() => containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed bottom-20 right-4 w-10 h-10 bg-primary text-white rounded-full shadow-lg flex items-center justify-center z-40 active:scale-95 transition-transform cursor-pointer hover:brightness-110"
      aria-label="回到顶部"
    >
      <Icon name="expand_less" className="text-lg" />
    </button>
  );
}
