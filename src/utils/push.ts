/**
 * Web Push 前端订阅流程
 * - iOS 16.4+ 仅在"添加到主屏幕"后的 standalone 模式下支持推送
 * - dev(http) 不注册 SW，推送仅生产可用
 */
import { pushApi } from '../api/push';

export interface PushToggleResult {
  ok: boolean;
  message: string;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isIos(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined';
}

/** 当前设备是否已订阅推送 */
export async function isPushEnabled(): Promise<boolean> {
  if (!isSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration('/campus/');
  if (!reg) return false;
  return !!(await reg.pushManager.getSubscription());
}

/** 开关推送：已订阅则退订，未订阅则走完整订阅流程 */
export async function togglePush(): Promise<PushToggleResult> {
  if (!isSupported()) {
    return { ok: false, message: '当前浏览器不支持通知推送' };
  }
  if (isIos() && !isStandalone()) {
    return { ok: false, message: 'iOS 请先「添加到主屏幕」，从桌面图标打开后再开启' };
  }

  // 用 getRegistration 而非 ready：dev/注册失败时 ready 会永久挂起
  const reg = await navigator.serviceWorker.getRegistration('/campus/');
  if (!reg) {
    return { ok: false, message: '推送服务未就绪，请刷新页面重试' };
  }

  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    // ── 关闭 ──
    try {
      await pushApi.unsubscribe(existing.endpoint);
    } catch {
      /* 服务端失败不阻塞本地退订 */
    }
    await existing.unsubscribe();
    return { ok: true, message: '通知已关闭' };
  }

  // ── 开启 ──
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    return { ok: false, message: '未获得通知权限，可在系统设置中手动开启' };
  }

  const keyRes = await pushApi.getVapidKey();
  if (keyRes.code !== 0 || !keyRes.data?.key) {
    return { ok: false, message: '推送服务未配置，请稍后再试' };
  }

  let sub: PushSubscription;
  try {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyRes.data.key) as BufferSource,
    });
  } catch {
    return { ok: false, message: '订阅失败，请重试' };
  }

  const json = sub.toJSON();
  const res = await pushApi.subscribe({
    endpoint: sub.endpoint,
    keys: { p256dh: json.keys?.p256dh || '', auth: json.keys?.auth || '' },
  });
  if (res.code !== 0) {
    // 服务端没记录成功，本地订阅回滚，避免"看着开了实际收不到"
    await sub.unsubscribe().catch(() => {});
    return { ok: false, message: res.message || '订阅失败' };
  }
  return { ok: true, message: '通知已开启，稍后会收到一条测试推送' };
}

/**
 * 登录后自动尝试开启推送（静默版）：
 * - 如果浏览器已经授权过（granted），直接订阅，用户无感知
 * - 如果还没授权过（default），调用 requestPermission 看能不能弹窗
 * - 如果已拒绝（denied）或不支持，静默跳过
 * 返回 true=已开启，false=未开启（但不报错，不打扰用户）
 */
export async function autoEnablePush(): Promise<boolean> {
  if (!isSupported()) return false;
  if (isIos() && !isStandalone()) return false;
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'denied') return false;

  const reg = await navigator.serviceWorker.getRegistration('/campus/');
  if (!reg) return false;

  // 已经订阅了就不重复走流程
  const existing = await reg.pushManager.getSubscription();
  if (existing) return true;

  // 已经授权过但还没订阅（比如换了设备），自动走订阅流程
  if (Notification.permission === 'granted') {
    return trySubscribe(reg, existing);
  }

  // permission === 'default' — 还没问过用户
  // 尝试请求权限（部分浏览器在用户交互外可能不弹窗）
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return false;
  return trySubscribe(reg, null);
}

async function trySubscribe(reg: ServiceWorkerRegistration, _existing: PushSubscription | null): Promise<boolean> {
  try {
    const keyRes = await pushApi.getVapidKey();
    if (keyRes.code !== 0 || !keyRes.data?.key) return false;

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyRes.data.key) as BufferSource,
    });
    const json = sub.toJSON();
    const res = await pushApi.subscribe({
      endpoint: sub.endpoint,
      keys: { p256dh: json.keys?.p256dh || '', auth: json.keys?.auth || '' },
    });
    if (res.code !== 0) {
      await sub.unsubscribe().catch(() => {});
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
