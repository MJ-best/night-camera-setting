// 오프라인·데이터 절약: 앱 파일은 설치 때 한 번 받아 두고 캐시에서 연다.
// 배포할 때 워크플로가 VERSION을 커밋 해시로 바꾸므로, 새 버전이 나오면 그때만 다시 받는다.
const VERSION = '__BUILD__';
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
  event.waitUntil(
    caches.open(APP_CACHE)
      .then((c) => c.addAll(APP_FILES.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== APP_CACHE && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 날씨는 앱이 직접 기기에 저장하므로 서비스 워커는 손대지 않는다
  if (url.hostname === 'api.open-meteo.com') return;
  if (url.hostname === 'fonts.googleapis.com') {
    // 글꼴 CSS는 응답 상태를 볼 수 없어서(opaque) 저장본을 쓰되 매번 새로 받아 바꿔 둔다
    event.respondWith(staleWhileRevalidate(req, FONT_CACHE));
    return;
  }
  if (url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(req, FONT_CACHE));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(caches.match('index.html').then((hit) => hit || fetch(req)));
    return;
  }
  event.respondWith(cacheFirst(req, APP_CACHE));
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreSearch: cacheName === APP_CACHE });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const fresh = fetch(req)
    .then((res) => {
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit || Response.error());
  return hit || fresh;
}
