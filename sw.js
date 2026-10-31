// 오프라인 지원: 앱 파일은 캐시 우선, 날씨는 네트워크만, 글꼴은 받아 둔 것 재사용
const VERSION = 'v1';
const APP_CACHE = `night-camera-${VERSION}`;
const FONT_CACHE = 'night-camera-fonts';
const APP_FILES = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/astro.js',
  'js/camera.js',
  'js/chart.js',
  'js/compass.js',
  'js/data.js',
  'js/format.js',
  'js/skymap.js',
  'js/weather.js',
  'vendor/astronomy.browser.min.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== APP_CACHE && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.hostname === 'api.open-meteo.com') return;
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const hit = await cache.match(event.request);
        const net = fetch(event.request).then((res) => { cache.put(event.request, res.clone()); return res; }).catch(() => hit);
        return hit || net;
      }),
    );
    return;
  }
  if (url.origin !== self.location.origin) return;
  // 앱 파일: 네트워크가 되면 최신으로 갱신, 안 되면 캐시
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) caches.open(APP_CACHE).then((c) => c.put(event.request, res.clone()));
        return res;
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match('index.html'))),
  );
});
