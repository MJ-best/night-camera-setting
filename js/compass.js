// 휴대폰 나침반: 네이티브 앱에서는 Capacitor Compass 플러그인(자기 센서/CoreLocation)을 우선 사용하고,
// 웹 브라우저에서는 DeviceOrientation API로 폴백한다. 항상 자북(magnetic north) 기준 방위각(0~360°)을 전달한다.
import { getPlugin } from './native.js';

export function compassSupported() {
  return Boolean(getPlugin('Compass')) || (typeof window !== 'undefined' && 'DeviceOrientationEvent' in window);
}

/** 한국 부근이면 대략적인 자기 편각(서편, 음수)을 돌려준다. 그 밖은 0 */
export function defaultDeclination(lat, lon) {
  if (lat > 32 && lat < 43.5 && lon > 124 && lon < 131.5) return -8.5;
  if (lat > 30 && lat < 46 && lon > 128 && lon < 146) return -8; // 일본
  return 0;
}

export class Compass {
  constructor(onHeading) {
    this.onHeading = onHeading;
    this.active = false;
    this._handler = (e) => this._onEvent(e);
    this._absoluteSeen = false;
    this._nativeSub = null;
    this._usingNative = false;
  }

  async start() {
    const native = getPlugin('Compass');
    if (native?.start && native?.addListener) {
      try {
        this._nativeSub = await native.addListener('heading', (data) => {
          if (typeof data?.magneticHeading === 'number' && !Number.isNaN(data.magneticHeading)) {
            const h = ((data.magneticHeading % 360) + 360) % 360;
            this.onHeading(h);
          }
        });
        await native.start();
        this._usingNative = true;
        this.active = true;
        return;
      } catch (err) {
        if (this._nativeSub?.remove) {
          await this._nativeSub.remove().catch(() => {});
          this._nativeSub = null;
        }
        // 네이티브 센서 자체가 없는 기기이거나 권한 거부인 경우, 권한 거부면 바로 알리고 아니면 웹 API 시도
        const msg = String(err?.message || '');
        if (msg.includes('권한') || msg.toLowerCase().includes('denied')) throw err;
      }
    }

    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
      throw new Error('이 기기는 나침반 센서를 지원하지 않아요.');
    }
    const DOE = window.DeviceOrientationEvent;
    if (typeof DOE.requestPermission === 'function') {
      const res = await DOE.requestPermission();
      if (res !== 'granted') throw new Error('나침반 권한이 거부됐어요. 설정에서 동작 및 방향 접근을 허용해 주세요.');
    }
    window.addEventListener('deviceorientationabsolute', this._handler, true);
    window.addEventListener('deviceorientation', this._handler, true);
    this._usingNative = false;
    this.active = true;
  }

  async stop() {
    if (this._usingNative) {
      const native = getPlugin('Compass');
      try { await native?.stop?.(); } catch { /* 무시 */ }
      try { await this._nativeSub?.remove?.(); } catch { /* 무시 */ }
      this._nativeSub = null;
      this._usingNative = false;
    } else if (typeof window !== 'undefined') {
      window.removeEventListener('deviceorientationabsolute', this._handler, true);
      window.removeEventListener('deviceorientation', this._handler, true);
    }
    this.active = false;
  }

  _onEvent(e) {
    let heading = null;
    if (typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading)) {
      heading = e.webkitCompassHeading; // iOS: 자북 기준, 시계 방향
    } else if (e.type === 'deviceorientationabsolute' || e.absolute) {
      if (e.type === 'deviceorientationabsolute') this._absoluteSeen = true;
      else if (this._absoluteSeen) return;
      if (e.alpha == null) return;
      heading = 360 - e.alpha;
      const angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
      heading += angle;
    } else {
      return;
    }
    heading = ((heading % 360) + 360) % 360;
    this.onHeading(heading);
  }
}
