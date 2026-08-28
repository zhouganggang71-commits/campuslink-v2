import { useState, useEffect } from 'react';
import Icon from './Icon';
import { togglePush, isPushEnabled } from '../../utils/push';
import { isA2hsResolved } from './InstallPrompt';

const DISMISS_KEY = 'campuslink_push_dismissed';
const DISMISS_DAYS = 1; // 之前14天，现在缩短到1天，让没决定的用户很快能再看到
const SHOW_DELAY_MS = 2000; // 之前5秒，现在2秒

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

interface NotificationPromptProps {
  /** 未登录不显示——订阅接口需要 auth，游客点了也只会失败 */
  enabled: boolean;
  onResult: (message: string, ok: boolean) => void;
}

/**
 * 消息通知开通引导：
 * - 只有一个真实决策点是"浏览器原生权限弹窗"，且只能由用户手势触发——不能进页面就直接弹原生权限框，
 *   那样大概率被用户本能点掉，还会被 Chrome 等浏览器的滥用检测记一次"低接受率"，
 *   往后自动降级成"安静提示"甚至不再弹（对全站所有请求都有影响，不只是这一次）。
 *   所以流程是：先出我们自己的横幅当"预告"，用户点「开启」才真正调用 Notification.requestPermission()
 * - iOS 上 Push API 要求先"添加到主屏幕"变成 standalone 才能用，未安装时不显示，避免点了也没用；
 *   这条转化路径交给 InstallPrompt 引导加桌面，装完之后本组件自然会在下次打开时出现
 * - 已明确 denied（用户在系统里手动关过）不再打扰——浏览器本身也会静默拒绝，弹了也没用
 * - 已授权/已订阅、微信QQ内置浏览器、不支持推送的浏览器、14天内关闭过：不显示
 * - 跟加桌面横幅共用"顶部横幅"这一视觉位置：加桌面横幅还没处理完（会出现或即将出现）时，
 *   本横幅让位显示在下面一档，不重叠
 */
export default function NotificationPrompt({ enabled, onResult }: NotificationPromptProps) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    if (typeof Notification === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (isDismissedRecently()) return;

    const ua = navigator.userAgent;
    if (/MicroMessenger|QQ\//i.test(ua)) return; // 内置浏览器基本不支持/无法正常接收
    const ios = /iPhone|iPad|iPod/i.test(ua);
    if (ios && !isStandalone()) return; // iOS 未加桌面前 Push 用不了，交给 InstallPrompt 那条转化路径
    if (Notification.permission === 'denied') return;
    if (Notification.permission === 'granted') return; // 已经授权过，是否订阅由 ProfileTab 里的状态自行处理，不用横幅催促

    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    isPushEnabled().then((already) => {
      if (cancelled || already) return;
      timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled]);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  };

  const handleEnable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await togglePush();
      onResult(r.message, r.ok);
    } catch {
      onResult('操作失败，请重试', false);
    } finally {
      // 不管结果如何，本次都已经明确问过用户一次——尊重结果（同意/拒绝/失败都不再连续追问）
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
      setBusy(false);
      setVisible(false);
    }
  };

  if (!visible) return null;

  // 加桌面横幅还没处理完（会显示或即将显示）时让位到下一档，避免两条横幅重叠
  const topClass = isA2hsResolved() ? 'top-16' : 'top-32';

  return (
    <div className={`fixed ${topClass} left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-md z-50 animate-reveal`}>
      <div className="bg-white rounded-2xl shadow-lg border border-slate-100 px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Icon name="notifications" className="text-xl text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-on-surface">开启消息通知</p>
          <p className="text-[11px] text-gray-400">私信、上课、考试提醒不错过，离线也能收到</p>
        </div>
        <button
          onClick={handleEnable}
          disabled={busy}
          className="shrink-0 bg-primary text-white text-xs font-semibold px-3.5 py-2 rounded-lg cursor-pointer hover:brightness-110 active:scale-95 transition-all disabled:opacity-60"
        >
          开启
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
  );
}
