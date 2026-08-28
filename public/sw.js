// CampusLink Service Worker — 保守缓存策略（2026-07 重建）
//
// ⚠️ 历史教训：旧 PWA（Workbox 预缓存）曾因缓存 index.html 导致发版后白屏/旧壳，
// 后来被替换成"清缓存自毁"SW。本次重建的铁律：
//   1. index.html / 导航请求 永不缓存（network-only），BUILD 清缓存机制继续兜底
//   2. 只缓存 /campus/assets/ 下带内容 hash 的静态文件（immutable，cache-first）
//   3. API / uploads / 其他一切请求不拦截，直连网络
//
// 缓存版本：结构性变更时 bump CACHE_NAME，activate 时清掉旧版本缓存。

const CACHE_NAME = 'campuslink-assets-v1';
const ASSETS_PREFIX = '/campus/assets/';

self.addEventListener('install', () => {
  // 不预缓存任何内容，新 SW 立即接管
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 清掉旧版本缓存（含历史 Workbox 残留）
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// ── Web Push ──
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: '川财CampusLink', body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || '川财CampusLink', {
      body: payload.body || '',
      icon: '/campus/pwa-192x192.png',
      badge: '/campus/pwa-192x192.png',
      tag: payload.tag || undefined,
      data: { url: payload.url || '/campus/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/campus/';
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // 已有打开的窗口 → 聚焦并导航；没有 → 开新窗口
      for (const client of clientList) {
        if (client.url.includes('/campus/') && 'focus' in client) {
          await client.focus();
          if ('navigate' in client && !client.url.endsWith(url)) {
            try { await client.navigate(url); } catch { /* 跨 scope 忽略 */ }
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 只处理同源、带 hash 的构建产物；其余（导航/API/uploads/manifest）全部放行走网络
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(ASSETS_PREFIX)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      // 只缓存成功的完整响应（跳过 206/opaque）
      if (res.ok && res.status === 200 && res.type === 'basic') {
        cache.put(req, res.clone());
      }
      return res;
    })()
  );
});
