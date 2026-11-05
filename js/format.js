// 표시용 포맷 함수

const DIRS16 = ['북', '북북동', '북동', '동북동', '동', '동남동', '남동', '남남동', '남', '남남서', '남서', '서남서', '서', '서북서', '북서', '북북서'];
const DIRS8_SHORT = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function azimuthName(az) {
  return DIRS16[Math.round((((az % 360) + 360) % 360) / 22.5) % 16];
}

export function azimuthShort(az) {
  return DIRS8_SHORT[Math.round((((az % 360) + 360) % 360) / 45) % 8];
}

export const normDeg = (d) => ((d % 360) + 360) % 360;
export const signedDeg = (d) => {
  const n = normDeg(d);
  return n > 180 ? n - 360 : n;
};

/* ───── 현지 시간대 ─────
 * 모든 시각은 '촬영 장소'의 시간대로 표시한다.
 * zone.id: IANA 이름(예: 'Atlantic/Canary'), 없으면 zone.fixedMin(고정 오프셋, 분), 둘 다 없으면 이 기기 시간대.
 */
let zone = { id: null, fixedMin: null };
const partsFormatters = new Map();

export const deviceTimeZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; }
};

export function isValidTimeZone(id) {
  if (!id || typeof id !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: id });
    return true;
  } catch {
    return false;
  }
}

export function setZone(next = {}) {
  zone = { id: isValidTimeZone(next.id) ? next.id : null, fixedMin: Number.isFinite(next.fixedMin) ? next.fixedMin : null };
}

export const getZone = () => ({ ...zone });

function partsFormatter(id) {
  let f = partsFormatters.get(id);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: id, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    partsFormatters.set(id, f);
  }
  return f;
}

/** 그 순간 현지 시간대의 UTC 오프셋 (분) */
export function zoneOffsetMin(date) {
  if (zone.id) {
    const p = {};
    for (const x of partsFormatter(zone.id).formatToParts(date)) p[x.type] = x.value;
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  }
  if (zone.fixedMin != null) return zone.fixedMin;
  return -date.getTimezoneOffset();
}

/** UTC 필드(getUTCHours 등)가 현지 시각이 되도록 옮긴 Date. 표시·달력 계산 전용 */
export function zoned(date) {
  return new Date(date.getTime() + zoneOffsetMin(date) * 60000);
}

export function zoneLabel(date = new Date()) {
  const m = zoneOffsetMin(date);
  const a = Math.abs(m);
  return `UTC${m >= 0 ? '+' : '−'}${Math.floor(a / 60)}${a % 60 ? `:${String(a % 60).padStart(2, '0')}` : ''}`;
}

const pad2 = (n) => String(n).padStart(2, '0');

/** 현지 날짜 'YYYY-MM-DD' */
export function zonedDateStr(date) {
  const z = zoned(date);
  return `${z.getUTCFullYear()}-${pad2(z.getUTCMonth() + 1)}-${pad2(z.getUTCDate())}`;
}

/** 그 순간이 속한 '밤'의 날짜: 현지 정오 이전이면 전날 밤 */
export function nightDateStrAt(date = new Date()) {
  const z = zoned(date);
  if (z.getUTCHours() < 12) z.setUTCDate(z.getUTCDate() - 1);
  return `${z.getUTCFullYear()}-${pad2(z.getUTCMonth() + 1)}-${pad2(z.getUTCDate())}`;
}

export function formatTime(date) {
  if (!date) return '—';
  const z = zoned(date);
  return `${pad2(z.getUTCHours())}:${pad2(z.getUTCMinutes())}`;
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

export function formatDate(date, { weekday = true } = {}) {
  if (!date) return '—';
  const z = zoned(date);
  const base = `${z.getUTCMonth() + 1}월 ${z.getUTCDate()}일`;
  return weekday ? `${base} (${WEEK[z.getUTCDay()]})` : base;
}

/** 'YYYY-MM-DD' 문자열의 년·월·일·요일 (시간대와 무관) */
export function dateStrParts(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

export function formatDateStr(dateStr, { weekday = true } = {}) {
  const { m, d, dow } = dateStrParts(dateStr);
  return weekday ? `${m}월 ${d}일 (${WEEK[dow]})` : `${m}월 ${d}일`;
}

export const weekdayName = (dow) => WEEK[dow];

export function formatDateTime(date) {
  if (!date) return '—';
  return `${formatDate(date)} ${formatTime(date)}`;
}

/** 밤 시작일 기준으로 다음날 새벽이면 '새벽', 낮이면 '낮' 표시 (현지 시각) */
export function formatNightTime(date, nightStart) {
  if (!date) return '—';
  if (!nightStart) return formatTime(date);
  const z = zoned(date);
  const nextDay = z.getUTCDate() !== zoned(nightStart).getUTCDate();
  const h = z.getUTCHours();
  let prefix = '';
  if (nextDay) prefix = h < 6 ? '새벽 ' : h < 12 ? '오전 ' : '다음날 ';
  else if (h < 17) prefix = '낮 ';
  return `${prefix}${formatTime(date)}`;
}

export function formatRange(iv, nightStart) {
  if (!iv) return '—';
  return `${formatNightTime(iv.start, nightStart)} ~ ${formatNightTime(iv.end, nightStart)}`;
}

export function formatDuration(min) {
  const m = Math.round(min);
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}시간 ${r}분` : `${h}시간`;
}

export function formatCoord(lat, lon, digits = 4) {
  const la = `${Math.abs(lat).toFixed(digits)}°${lat >= 0 ? 'N' : 'S'}`;
  const lo = `${Math.abs(lon).toFixed(digits)}°${lon >= 0 ? 'E' : 'W'}`;
  return `${la} ${lo}`;
}

export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** 달 위상 SVG path (반지름 r, 중심 0,0). phase: 0 삭 ~ 180 망 ~ 360 */
export function moonPhasePath(phase, r = 10, southern = false) {
  const illum = (1 - Math.cos((phase * Math.PI) / 180)) / 2;
  if (illum < 0.01) return '';
  if (illum > 0.99) return `M0,${-r}A${r},${r} 0 1 1 0,${r}A${r},${r} 0 1 1 0,${-r}Z`;
  let waxing = phase < 180;
  if (southern) waxing = !waxing;
  const rx = Math.abs(1 - 2 * illum) * r;
  const gibbous = illum > 0.5;
  // 밝은 쪽 반원 (상현이면 오른쪽)
  const side = waxing ? 1 : 0;
  const term = gibbous ? side : 1 - side;
  return `M0,${-r}A${r},${r} 0 0 ${side} 0,${r}A${rx.toFixed(2)},${r} 0 0 ${term} 0,${-r}Z`;
}
