/**
 * 广告 Banner — 首页顶部轮播，从后端 API 获取活跃广告
 */
import { useEffect, useState, useCallback } from 'react';
import { api } from '../../utils/api';
import Icon from '../ui/Icon';

interface Ad {
  id: number;
  title: string;
  image_url: string;
  link_url: string;
}

const AD_DISMISS_KEY = 'campuslink_ad_dismissed_at';

function isAdDismissed(): boolean {
  try {
    const raw = localStorage.getItem(AD_DISMISS_KEY);
    if (!raw) return false;
    const dismissedAt = parseInt(raw, 10);
    // 24 小时后恢复展示
    return Date.now() - dismissedAt < 24 * 60 * 60 * 1000;
  } catch { return false; }
}

function dismissAd() {
  try { localStorage.setItem(AD_DISMISS_KEY, String(Date.now())); } catch {}
}

export default function AdBanner() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState(isAdDismissed);

  useEffect(() => {
    api.get<Ad[]>('/ads').then((res) => {
      if (res.code === 0 && Array.isArray(res.data) && res.data.length > 0) {
        setAds(res.data);
      }
    }).catch(() => {});
  }, []);

  const handleClick = useCallback((ad: Ad) => {
    api.post(`/ads/${ad.id}/click`).catch(() => {});
    if (ad.link_url) window.open(ad.link_url, '_blank', 'noopener');
  }, []);

  if (ads.length === 0 || dismissed) return null;

  const ad = ads[index];

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    dismissAd();
    setDismissed(true);
  };

  return (
    <div className="relative w-full px-4 pt-3 pb-1">
      <div
        onClick={() => handleClick(ad)}
        className="relative w-full aspect-[3/1] rounded-xl overflow-hidden cursor-pointer bg-slate-100 group"
      >
        <img
          src={ad.image_url}
          alt={ad.title}
          className="w-full h-full object-cover"
          loading="eager"
        />
        {ad.title && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent p-2">
            <span className="text-[10px] text-white font-medium">{ad.title}</span>
          </div>
        )}
        {/* 广告标识 + 关闭 */}
        <span className="absolute top-1.5 right-1.5 text-[9px] bg-black/40 text-white px-1.5 py-0.5 rounded font-medium">
          广告
        </span>
        <button
          onClick={handleDismiss}
          className="absolute top-1.5 left-1.5 w-5 h-5 bg-black/40 hover:bg-black/60 rounded-full flex items-center justify-center cursor-pointer"
          aria-label="关闭广告"
        >
          <Icon name="close" className="text-white text-[9px]" />
        </button>
      </div>
      {/* 指示点 */}
      {ads.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-1.5">
          {ads.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={`w-1.5 h-1.5 rounded-full transition-all cursor-pointer ${i === index ? 'bg-primary w-3' : 'bg-gray-300'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
