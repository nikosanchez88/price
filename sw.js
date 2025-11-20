const CACHE_NAME = 'price-tool-v3';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  'https://cdn.tailwindcss.com' // 缓存 CDN 样式
];

// 安装时缓存文件
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// 请求拦截：有缓存用缓存，没缓存去下载
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request))
  );
});