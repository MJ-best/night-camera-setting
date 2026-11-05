// Open-Meteo 예보 (무료·키 불필요). 한 번 받으면 16일치가 오므로 날짜를 바꿔도 다시 받지 않는다.

/** 받은 예보를 다시 쓰는 시간 */
export const WEATHER_TTL_MS = 3 * 60 * 60 * 1000;

/** 같은 예보를 써도 되는 거리 (위경도 약 0.05° ≈ 5km) */
export const isNearby = (a, b) => Math.abs(a.lat - b.lat) < 0.05 && Math.abs(a.lon - b.lon) < 0.05;

export function weatherUrl(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    hourly: [
      'cloud_cover', 'cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high',
      'relative_humidity_2m', 'dew_point_2m', 'temperature_2m', 'wind_speed_10m', 'visibility',
    ].join(','),
    wind_speed_unit: 'ms',
    timeformat: 'unixtime',
    timezone: 'auto', // 응답에 그 장소의 시간대가 함께 온다 (시각 값은 unixtime이라 그대로 UTC)
    past_days: '1',
    forecast_days: '16',
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

export function parseWeather(json) {
  const h = json && json.hourly;
  if (!h || !Array.isArray(h.time)) return null;
  return h.time.map((sec, i) => ({
    t: new Date(sec * 1000),
    cloud: h.cloud_cover?.[i] ?? null,
    low: h.cloud_cover_low?.[i] ?? null,
    mid: h.cloud_cover_mid?.[i] ?? null,
    high: h.cloud_cover_high?.[i] ?? null,
    rh: h.relative_humidity_2m?.[i] ?? null,
    dew: h.dew_point_2m?.[i] ?? null,
    temp: h.temperature_2m?.[i] ?? null,
    wind: h.wind_speed_10m?.[i] ?? null,
    vis: h.visibility?.[i] ?? null,
  })).filter((r) => r.cloud != null);
}

/** @returns {{rows: Array, tz: string|null}} tz: 그 장소의 IANA 시간대 */
export async function fetchWeather(lat, lon, { signal } = {}) {
  const res = await fetch(weatherUrl(lat, lon), { signal, cache: 'no-store' });
  if (!res.ok) throw new Error(`날씨 서버 응답 ${res.status}`);
  const json = await res.json();
  const rows = parseWeather(json);
  if (!rows || !rows.length) throw new Error('날씨 데이터가 비어 있어요');
  return { rows, tz: typeof json.timezone === 'string' ? json.timezone : null };
}

const PACK_KEYS = ['cloud', 'rh', 'dew', 'temp', 'wind'];

/** 기기 저장용으로 열 단위로 압축 (약 400시간 × 6값) */
export function packRows(rows) {
  const out = { t: rows.map((r) => Math.round(r.t.getTime() / 1000)) };
  for (const k of PACK_KEYS) out[k] = rows.map((r) => r[k]);
  return out;
}

export function unpackRows(packed) {
  if (!packed || !Array.isArray(packed.t)) return null;
  return packed.t.map((sec, i) => {
    const row = { t: new Date(sec * 1000) };
    for (const k of PACK_KEYS) row[k] = packed[k]?.[i] ?? null;
    return row;
  });
}

/** 주어진 구간의 날씨 요약 */
export function summarize(rows, from, to) {
  const sel = rows.filter((r) => r.t >= from && r.t <= to);
  if (!sel.length) return null;
  const avg = (k) => sel.reduce((s, r) => s + (r[k] ?? 0), 0) / sel.length;
  const minSpread = Math.min(...sel.map((r) => (r.temp != null && r.dew != null ? r.temp - r.dew : 99)));
  const cloud = avg('cloud');
  return {
    hours: sel.length,
    cloud,
    clearest: sel.reduce((b, r) => (r.cloud < b.cloud ? r : b), sel[0]),
    minTemp: Math.min(...sel.map((r) => r.temp ?? 99)),
    maxWind: Math.max(...sel.map((r) => r.wind ?? 0)),
    rh: avg('rh'),
    dewRisk: minSpread < 2.5,
    sky: cloud < 20 ? '맑음' : cloud < 50 ? '구름 조금' : cloud < 80 ? '구름 많음' : '흐림',
  };
}
