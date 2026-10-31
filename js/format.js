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

export function formatTime(date) {
  if (!date) return '—';
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

export function formatDate(date, { weekday = true } = {}) {
  if (!date) return '—';
  const base = `${date.getMonth() + 1}월 ${date.getDate()}일`;
  return weekday ? `${base} (${WEEK[date.getDay()]})` : base;
}

export function formatDateTime(date) {
  if (!date) return '—';
  return `${formatDate(date)} ${formatTime(date)}`;
}

/** 다음날로 넘어간 시각이면 '새벽' 표시 */
export function formatNightTime(date, nightStart) {
  if (!date) return '—';
  if (!nightStart) return formatTime(date);
  const nextDay = date.getDate() !== nightStart.getDate();
  const h = date.getHours();
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

export function formatCoord(lat, lon) {
  const la = `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}`;
  const lo = `${Math.abs(lon).toFixed(4)}°${lon >= 0 ? 'E' : 'W'}`;
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
