import { useState, useEffect, useRef } from 'react';
import Icon from './Icon';
import Modal from './Modal';
import Button from './Button';

// beforeinstallprompt 事件类型（lib.dom 未内置）
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'campuslink_a2hs_dismissed'; // 已加入 index.html BUILD 清缓存白名单
const DISMISS_DAYS = 14;
const SHOW_DELAY_MS = 3000;
// 很多国产安卓浏览器（UC/小米/华为/vivo/oppo/QQ浏览器等）不支持 beforeinstallprompt 事件，
// 等这么久还等不到就认定当前浏览器不支持原生安装弹窗，退回手动图文教程——
// 否则这部分用户会永远等不到任何引导（之前的实现正是这样）
const ANDROID_FALLBACK_MS = 5000;

/** PWA 埋点：记录安装引导事件，用于管理后台看转化率 */
function trackInstallEvent(eventType: string) {
  try {
    const env = getEnv();
    fetch('/campus/api/v1/pwa/install-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: eventType, env }),
    }).catch(() => {}); // 静默，不影响用户体验
  } catch {
    /* noop */
  }
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isDismissedRecently(): boolean {
  const ts = Number(localStorage.getItem(DISMISS_KEY) || 0);
  return ts > 0 && Date.now() - ts < DISMISS_DAYS * 24 * 3600 * 1000;
}

/**
 * 供其他顶部横幅（如 NotificationPrompt 通知开通引导）判断"加桌面横幅是否已经/将要占用顶部第一档位置"，
 * 避免两条横幅同时出现时重叠——条件跟本组件 useEffect 里的早退条件完全一致（true = 本组件永远不会显示）
 */
export function isA2hsResolved(): boolean {
  const e = getEnv();
  return isStandalone() || isDismissedRecently() || e === 'inapp' || e === 'other';
}

function getEnv(): 'ios' | 'android' | 'inapp' | 'other' {
  const ua = navigator.userAgent;
  // 微信/QQ 内置浏览器无法加桌面，不打扰
  if (/MicroMessenger|QQ\//i.test(ua)) return 'inapp';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

/** iOS 上非 Safari 的浏览器（Chrome/Firefox/Edge/Opera for iOS）加桌面后仍在原浏览器内打开，不是真正独立 App 体验 */
function isIosNonSafari(): boolean {
  return /CriOS|FxiOS|EdgiOS|OPiOS/i.test(navigator.userAgent);
}

interface BrowserGuide {
  name: string;
  steps: string[];
}

/** 安卓浏览器碎片化严重，按 UA 尽量给出对应浏览器的真实菜单路径；未识别的退回通用说法 */
function getAndroidGuide(): BrowserGuide {
  const ua = navigator.userAgent;
  if (/MiuiBrowser/i.test(ua)) {
    return {
      name: '小米/红米浏览器',
      steps: ['点击底部菜单栏最右侧的「⋯」', '选择「添加到桌面」', '点击「添加」完成'],
    };
  }
  if (/HuaweiBrowser/i.test(ua)) {
    return { name: '华为浏览器', steps: ['点击右下角「⋯」更多', '选择「添加到桌面」', '确认添加'] };
  }
  if (/VivoBrowser/i.test(ua)) {
    return { name: 'vivo 浏览器', steps: ['点击右下角「⋮」菜单', '选择「添加到桌面」', '确认添加'] };
  }
  if (/OppoBrowser|HeyTapBrowser/i.test(ua)) {
    return { name: 'oppo 浏览器', steps: ['点击右下角「⋯」菜单', '选择「添加到桌面」', '确认添加'] };
  }
  if (/MQQBrowser/i.test(ua)) {
    return { name: '手机QQ浏览器', steps: ['点击右下角「⋯」', '选择「添加到手机桌面」', '确认添加'] };
  }
  if (/UCBrowser/i.test(ua)) {
    return { name: 'UC浏览器', steps: ['点击底部「≡」菜单', '选择「添加到桌面」', '确认添加'] };
  }
  if (/Quark/i.test(ua)) {
    return { name: '夸克浏览器', steps: ['点击右下角「⋯」', '选择「添加到桌面」', '确认添加'] };
  }
  if (/SamsungBrowser/i.test(ua)) {
    return { name: '三星浏览器', steps: ['点击「≡」菜单', '选择「添加页面至」', '选择「主屏幕」并确认'] };
  }
  if (/baiduboxapp|bdbrowser/i.test(ua)) {
    return { name: '百度浏览器', steps: ['点击底部「⋯」', '选择「添加到桌面」', '确认添加'] };
  }
  // Chrome for Android 及其他未识别浏览器
  return { name: '当前浏览器', steps: ['点击右上角「⋮」菜单', '选择「安装应用」或「添加到主屏幕」', '确认安装'] };
}

/**
 * 加桌面引导：
 * - 顶部横幅固定在 Header 下方（不再贴底部），跟 BottomNav/ScrollToTop 悬浮按钮不共用同一空间和 z-index，
 *   不管当前停在哪个 Tab 都稳定展示——之前贴底部时跟 BottomNav 同为 z-40，绘制顺序导致横幅在部分 Tab 上被盖住
 * - Android：优先监听 beforeinstallprompt 走原生一键安装；等不到（很多国产浏览器根本不支持这个事件）就退回按浏览器
 *   类型定制的手动图文教程，不再让这部分用户永远看不到任何引导
 * - iOS：没有安装 API，图文教程；非 Safari 浏览器（Chrome/Firefox/Edge for iOS）额外提示先用 Safari 打开，
 *   否则加到桌面后仍在原浏览器里开，不是真正独立 App 体验
 * - 已 standalone 运行 / 14 天内关闭过 / 微信内置浏览器：不显示
 */
export default function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [installMode, setInstallMode] = useState<'native' | 'manual'>('manual');
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const env = useRef(getEnv());
  const hasTriggeredRef = useRef(false);
  const androidGuide = useRef<BrowserGuide | null>(null);

  useEffect(() => {
    if (isStandalone() || isDismissedRecently() || env.current === 'inapp' || env.current === 'other') return;

    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;

    if (env.current === 'android') {
      androidGuide.current = getAndroidGuide();

      const onBip = (e: Event) => {
        e.preventDefault();
        deferredPrompt.current = e as BeforeInstallPromptEvent;
        setInstallMode('native');
        if (!hasTriggeredRef.current) {
          hasTriggeredRef.current = true;
          showTimer = setTimeout(() => {
            setVisible(true);
            trackInstallEvent('shown');
          }, SHOW_DELAY_MS);
        } else {
          setVisible(true); // 手动教程已经展示过，静默升级成原生一键安装按钮
        }
      };
      window.addEventListener('beforeinstallprompt', onBip);

      // 兜底：等不到原生安装事件的浏览器，退回手动教程，不让这批用户永远看不到引导
      fallbackTimer = setTimeout(() => {
        if (!hasTriggeredRef.current) {
          hasTriggeredRef.current = true;
          setInstallMode('manual');
          setVisible(true);
          trackInstallEvent('shown');
        }
      }, ANDROID_FALLBACK_MS);

      return () => {
        window.removeEventListener('beforeinstallprompt', onBip);
        if (showTimer) clearTimeout(showTimer);
        if (fallbackTimer) clearTimeout(fallbackTimer);
      };
    }

    // iOS：无安装事件可等，延迟后直接出横幅（走图文教程）
    setInstallMode('manual');
    showTimer = setTimeout(() => {
      setVisible(true);
      trackInstallEvent('shown');
    }, SHOW_DELAY_MS);
    return () => {
      if (showTimer) clearTimeout(showTimer);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
    setShowGuide(false);
    trackInstallEvent('dismissed');
  };

  const handleInstall = async () => {
    if (installMode === 'manual') {
      setShowGuide(true);
      trackInstallEvent('manual_opened');
      return;
    }
    const bip = deferredPrompt.current;
    if (!bip) {
      // native 模式但事件对象丢失（理论上不该发生），退回手动教程而不是静默无反应
      setShowGuide(true);
      trackInstallEvent('manual_opened');
      return;
    }
    trackInstallEvent('native_clicked');
    await bip.prompt();
    const choice = await bip.userChoice;
    deferredPrompt.current = null;
    if (choice.outcome === 'accepted') {
      trackInstallEvent('native_accepted');
      setVisible(false);
    } else {
      trackInstallEvent('native_dismissed');
      dismiss();
    }
  };

  if (!visible) return null;

  const iosNonSafari = env.current === 'ios' && isIosNonSafari();
  const guide = env.current === 'android' ? androidGuide.current : null;

  return (
    <>
      {/* 顶部横幅——固定在 Header 下方，不跟 BottomNav/悬浮按钮抢位置，任何 Tab 下都稳定展示 */}
      <div className="fixed top-16 left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-md z-50 animate-reveal">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 px-4 py-3 flex items-center gap-3">
          <img src="/campus/pwa-192x192.png" alt="" className="w-10 h-10 rounded-xl shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-on-surface">把川财CampusLink 添加到桌面</p>
            <p className="text-[11px] text-gray-400">像 App 一样一点就开，不用记网址</p>
          </div>
          <button
            onClick={handleInstall}
            className="shrink-0 bg-primary text-white text-xs font-semibold px-3.5 py-2 rounded-lg cursor-pointer hover:brightness-110 active:scale-95 transition-all"
          >
            {installMode === 'manual' ? '怎么加' : '安装'}
          </button>
          <button
            onClick={dismiss}
            className="shrink-0 text-gray-300 hover:text-gray-500 cursor-pointer"
            aria-label="关闭"
          >
            <Icon name="x" className="text-base" />
          </button>
        </div>
      </div>

      {/* 图文教程 */}
      <Modal
        isOpen={showGuide}
        onClose={dismiss}
        title="添加到主屏幕"
        subtitle="添加后从桌面图标打开，全屏无地址栏"
        size="sm"
        footer={
          <Button block onClick={dismiss}>
            知道了
          </Button>
        }
      >
        {env.current === 'ios' ? (
          <>
            {iosNonSafari && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 mb-3 text-xs text-amber-700">
                当前浏览器加桌面后仍会在该浏览器内打开，不是完整独立 App 体验。建议先点右上角「⋯」选择「在 Safari
                中打开」，再按下面步骤操作。
              </div>
            )}
            <ol className="space-y-3 py-1">
              <li className="flex items-center gap-3 text-sm text-gray-600">
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                  1
                </span>
                <span className="flex items-center gap-1.5 flex-wrap">
                  点击 Safari 底部（或地址栏旁）的 <Icon name="share" className="text-base text-primary" /> 分享按钮
                </span>
              </li>
              <li className="flex items-center gap-3 text-sm text-gray-600">
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                  2
                </span>
                <span className="flex items-center gap-1.5 flex-wrap">
                  向下滑动菜单，找到并点击 <Icon name="plus" className="text-base text-primary" /> 「添加到主屏幕」
                </span>
              </li>
              <li className="flex items-center gap-3 text-sm text-gray-600">
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                  3
                </span>
                <span>确认名称后，点右上角「添加」</span>
              </li>
              <li className="flex items-center gap-3 text-sm text-gray-600">
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                  4
                </span>
                <span>回到桌面找到川财CampusLink 图标，之后都从这里打开</span>
              </li>
            </ol>
            <p className="text-[11px] text-gray-400 mt-3">若在微信中打开，请先点右上角「···」选择「在浏览器打开」</p>
          </>
        ) : (
          <>
            <p className="text-xs text-gray-400 mb-2">
              识别到你在用「{guide?.name || '当前浏览器'}」，以下路径按此浏览器给出，具体位置可能因版本略有差异：
            </p>
            <ol className="space-y-3 py-1">
              {(guide?.steps ?? []).map((step, i) => (
                <li key={i} className="flex items-center gap-3 text-sm text-gray-600">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
              <li className="flex items-center gap-3 text-sm text-gray-600">
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                  {(guide?.steps.length ?? 0) + 1}
                </span>
                <span>回到桌面找到川财CampusLink 图标，之后都从这里打开</span>
              </li>
            </ol>
            <p className="text-[11px] text-gray-400 mt-3">
              若菜单里没找到，可尝试在菜单里搜索"桌面"或"主屏幕"字样；部分浏览器需先点右上角刷新/更多按钮才会出现该选项
            </p>
          </>
        )}
      </Modal>
    </>
  );
}
