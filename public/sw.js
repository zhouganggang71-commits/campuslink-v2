// 清理型 Service Worker — 替代旧 PWA，只做一件事：删除所有缓存然后自毁
// 不会拦截请求、不会重载页面、不会白屏
self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', () => {
  // 清除 Workbox 预缓存和所有运行时缓存
  caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { return caches.delete(k); }));
  });
  // 自毁：反注册自己
  self.registration.unregister();
});
// 不监听 fetch，让所有请求直接走网络
