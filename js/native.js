// 네이티브(Capacitor iOS/Android) 브리지 및 웹 폴백
// 웹 브라우저 및 Node 테스트 환경에서도 의존성 오류 없이 안전하게 동작한다.

function cap() {
  return typeof globalThis !== 'undefined' ? globalThis.Capacitor : null;
}

export function isNativeApp() {
  try {
    return Boolean(cap()?.isNativePlatform?.());
  } catch {
    return false;
  }
}

export function nativePlatform() {
  try {
    return cap()?.getPlatform?.() || 'web';
  } catch {
    return 'web';
  }
}

export function getPlugin(name) {
  const c = cap();
  if (!c || !isNativeApp()) return null;
  if (c.Plugins?.[name]) return c.Plugins[name];
  if (typeof c.registerPlugin === 'function') {
    try {
      return c.registerPlugin(name);
    } catch {
      return null;
    }
  }
  return null;
}

export async function hideSplashScreen() {
  const splash = getPlugin('SplashScreen');
  if (!splash?.hide) return;
  try {
    await splash.hide({ fadeOutDuration: 300 });
  } catch { /* 이미 닫혔거나 미지원 */ }
}

export async function syncStatusBar(screenMode = 'normal') {
  const statusBar = getPlugin('StatusBar');
  if (!statusBar) return;
  const colors = {
    normal: '#070a12',
    red: '#1a0204',
    green: '#021705',
  };
  const color = colors[screenMode] || colors.normal;
  try {
    if (statusBar.setStyle) await statusBar.setStyle({ style: 'DARK' });
    if (nativePlatform() === 'android' && statusBar.setBackgroundColor) {
      await statusBar.setBackgroundColor({ color });
    }
  } catch { /* 무시 */ }
}

export async function hapticTap(style = 'LIGHT') {
  const haptics = getPlugin('Haptics');
  if (!haptics) return;
  try {
    if (haptics.impact) await haptics.impact({ style });
    else if (haptics.selectionChanged) await haptics.selectionChanged();
  } catch { /* 무시 */ }
}

export async function openExternalUrl(url) {
  const browser = getPlugin('Browser');
  if (browser?.open) {
    try {
      await browser.open({ url, toolbarColor: '#070a12' });
      return;
    } catch { /* 폴백 */ }
  }
  if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
}

export function registerBackHandler(onBack) {
  const app = getPlugin('App');
  if (!app?.addListener) return () => {};
  try {
    const handle = app.addListener('backButton', async () => {
      const handled = await onBack();
      if (!handled && app.exitApp) app.exitApp();
    });
    return () => {
      Promise.resolve(handle).then((h) => h?.remove?.()).catch(() => {});
    };
  } catch {
    return () => {};
  }
}

export async function getCurrentLocation() {
  const geo = getPlugin('Geolocation');
  if (geo?.getCurrentPosition) {
    if (geo.checkPermissions && geo.requestPermissions) {
      let perm = await geo.checkPermissions();
      if (perm?.location !== 'granted' && perm?.coarseLocation !== 'granted') {
        perm = await geo.requestPermissions({ permissions: ['location'] });
      }
      if (perm?.location === 'denied' && perm?.coarseLocation === 'denied') {
        const err = new Error('위치 권한이 거부됐어요. 기기 설정에서 이 앱의 위치 접근을 허용하거나 좌표를 직접 입력하세요.');
        err.code = 1;
        throw err;
      }
    }
    try {
      const pos = await geo.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 5 * 60 * 1000,
      });
      return pos.coords;
    } catch (e) {
      const msg = String(e?.message || '').toLowerCase();
      const err = new Error(
        msg.includes('denied') || msg.includes('permission')
          ? '위치 권한이 거부됐어요. 기기 설정에서 이 앱의 위치 접근을 허용하거나 좌표를 직접 입력하세요.'
          : msg.includes('timeout')
            ? '위치 확인 시간이 초과됐어요. 다시 시도해 주세요.'
            : '위치를 확인할 수 없어요. 하늘이 트인 곳에서 다시 시도하거나 좌표를 직접 입력하세요.',
      );
      err.code = msg.includes('denied') || msg.includes('permission') ? 1 : msg.includes('timeout') ? 3 : 2;
      throw err;
    }
  }

  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    const err = new Error('이 기기는 위치 기능을 지원하지 않아요. 좌표를 직접 입력하세요.');
    err.code = 0;
    throw err;
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      (err) => {
        const msg = {
          1: '위치 권한이 거부됐어요. 설정에서 이 앱/사이트의 위치 접근을 허용하거나 좌표를 직접 입력하세요.',
          2: '위치를 확인할 수 없어요. 하늘이 트인 곳에서 다시 시도하거나 좌표를 직접 입력하세요.',
          3: '위치 확인 시간이 초과됐어요. 다시 시도해 주세요.',
        }[err.code] || '위치를 가져오지 못했어요.';
        const wrapped = new Error(msg);
        wrapped.code = err.code;
        reject(wrapped);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 5 * 60 * 1000 },
    );
  });
}
