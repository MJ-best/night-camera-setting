// 휴대폰 나침반 (DeviceOrientation). iOS는 사용자 동작 안에서 권한 요청이 필요하다.

export function compassSupported() {
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
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
  }

  async start() {
    if (!compassSupported()) throw new Error('이 기기는 나침반 센서를 지원하지 않아요.');
    const DOE = window.DeviceOrientationEvent;
    if (typeof DOE.requestPermission === 'function') {
      const res = await DOE.requestPermission();
      if (res !== 'granted') throw new Error('나침반 권한이 거부됐어요. 설정에서 동작 및 방향 접근을 허용해 주세요.');
    }
    window.addEventListener('deviceorientationabsolute', this._handler, true);
    window.addEventListener('deviceorientation', this._handler, true);
    this.active = true;
  }

  stop() {
    window.removeEventListener('deviceorientationabsolute', this._handler, true);
    window.removeEventListener('deviceorientation', this._handler, true);
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
