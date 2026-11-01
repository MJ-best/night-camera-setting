// Open-Meteo 예보 (무료·키 불필요). 오프라인이거나 16일 넘는 날짜면 null
const CACHE_MS = 60 * 60 * 1000;
const memory = new Map();

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
    timezone: 'UTC',
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

export async function fetchWeather(lat, lon, { signal } = {}) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = memory.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.rows;
  const res = await fetch(weatherUrl(lat, lon), { signal });
  if (!res.ok) throw new Error(`날씨 서버 응답 ${res.status}`);
  const rows = parseWeather(await res.json());
  if (!rows || !rows.length) throw new Error('날씨 데이터가 비어 있어요');
  memory.set(key, { at: Date.now(), rows });
  return rows;
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
