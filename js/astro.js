// 천문 계산: Astronomy Engine(globalThis.Astronomy)을 감싸 촬영 계획에 필요한 값만 꺼낸다.
import {
  GALACTIC_CENTER, MILKY_WAY_REGIONS, METEOR_SHOWERS, PLANETS, CONSTELLATION_KO, STAR_BY_ID,
} from './data.js';

const DEG = Math.PI / 180;
export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;
export const SYNODIC_MONTH = 29.530588;

function lib() {
  const a = globalThis.Astronomy;
  if (!a) throw new Error('Astronomy Engine이 로드되지 않았습니다.');
  return a;
}

export function makeObserver(lat, lon) {
  return new (lib().Observer)(lat, lon, 0);
}

/**
 * 'YYYY-MM-DD' 밤 계산의 시작점(정오).
 * lon을 주면 그 장소의 태양시 정오를 쓴다. 기기와 시간대가 먼 곳도 밤이 둘로 잘리지 않는다.
 * lon이 없으면 이 기기 시각의 정오.
 */
export function nightStart(dateStr, lon) {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (lon == null) return new Date(y, m - 1, d, 12, 0, 0, 0);
  return new Date(Date.UTC(y, m - 1, d, 12) - (lon / 15) * HOUR);
}

/** 'YYYY-MM-DD'에서 n일 뒤 날짜 문자열 (시간대와 무관) */
export function shiftDateStr(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 그 장소의 시간대가 이 기기와 2시간 넘게 다른가 (경도로 어림) */
export function isFarTimeZone(lon, date = new Date()) {
  const deviceOffsetH = -date.getTimezoneOffset() / 60;
  const diff = Math.abs((((lon / 15 - deviceOffsetH) % 24) + 36) % 24 - 12);
  return diff > 2;
}

export function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 지금이 새벽(정오 이전)이면 어젯밤을, 아니면 오늘 밤을 가리키는 날짜 */
export function currentNightDateStr(now = new Date()) {
  const d = new Date(now);
  if (d.getHours() < 12) d.setDate(d.getDate() - 1);
  return toDateStr(d);
}

/** 태양계 천체의 지평 좌표 (굴절 보정 포함) */
export function bodyHorizon(bodyName, date, obs) {
  const a = lib();
  const eq = a.Equator(a.Body[bodyName], date, obs, true, true);
  const hor = a.Horizon(date, obs, eq.ra, eq.dec, 'normal');
  return { alt: hor.altitude, az: hor.azimuth, ra: eq.ra, dec: eq.dec, dist: eq.dist };
}

/**
 * J2000 적도좌표(RA 시, Dec 도)를 지평좌표로 바꾸는 함수를 만든다.
 * 회전 행렬 하나로 세차·장동을 포함해 많은 별을 빠르게 변환한다.
 */
export function skyFrame(date, obs) {
  const a = lib();
  const r = a.Rotation_EQJ_HOR(date, obs).rot;
  return (raH, decDeg) => {
    const ra = raH * 15 * DEG;
    const dec = decDeg * DEG;
    const cd = Math.cos(dec);
    const x = cd * Math.cos(ra);
    const y = cd * Math.sin(ra);
    const z = Math.sin(dec);
    const hx = r[0][0] * x + r[1][0] * y + r[2][0] * z; // 북
    const hy = r[0][1] * x + r[1][1] * y + r[2][1] * z; // 서
    const hz = r[0][2] * x + r[1][2] * y + r[2][2] * z; // 천정
    let alt = Math.asin(Math.max(-1, Math.min(1, hz))) / DEG;
    if (alt > -1) alt += refraction(alt);
    let az = Math.atan2(-hy, hx) / DEG;
    if (az < 0) az += 360;
    return { alt, az };
  };
}

/** 대기 굴절 (Saemundsson), 단위 도 */
export function refraction(alt) {
  const h = Math.max(alt, -1);
  return 1.02 / Math.tan((h + 10.3 / (h + 5.11)) * DEG) / 60;
}

/** 대기질량 (Kasten & Young 1989) */
export function airmass(alt) {
  if (alt <= 0) return 40;
  return 1 / (Math.sin(alt * DEG) + 0.50572 * Math.pow(alt + 6.07995, -1.6364));
}

// 은하 좌표 → J2000 적도 좌표 (Hipparcos 변환 행렬)
const GAL = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [0.4941094279, -0.44482963, 0.7469822445],
  [-0.867666149, -0.1980763734, 0.4559837762],
];

export function galacticToEquatorial(l, b) {
  const lr = l * DEG;
  const br = b * DEG;
  const g = [Math.cos(br) * Math.cos(lr), Math.cos(br) * Math.sin(lr), Math.sin(br)];
  const x = GAL[0][0] * g[0] + GAL[1][0] * g[1] + GAL[2][0] * g[2];
  const y = GAL[0][1] * g[0] + GAL[1][1] * g[1] + GAL[2][1] * g[2];
  const z = GAL[0][2] * g[0] + GAL[1][2] * g[1] + GAL[2][2] * g[2];
  let ra = Math.atan2(y, x) / DEG;
  if (ra < 0) ra += 360;
  return { ra: ra / 15, dec: Math.asin(z) / DEG };
}

const REGIONS_EQ = MILKY_WAY_REGIONS.map((r) => ({ ...r, ...galacticToEquatorial(r.l, r.b) }));
export const MILKY_WAY_REGIONS_EQ = REGIONS_EQ;

/** 달 상태 */
export function moonInfo(date) {
  const a = lib();
  const t = a.MakeTime(date);
  const phase = a.MoonPhase(t); // 0 삭, 90 상현, 180 망, 270 하현
  const ill = a.Illumination(a.Body.Moon, t);
  const distKm = a.GeoMoon(t).Length() * a.KM_PER_AU;
  return {
    phase,
    illum: ill.phase_fraction,
    phaseAngle: ill.phase_angle, // 0 = 보름, 180 = 삭
    mag: ill.mag,
    waxing: phase < 180,
    ageDays: (phase / 360) * SYNODIC_MONTH,
    distKm,
    diameterDeg: (2 * Math.asin(1737.4 / distKm)) / DEG,
    name: moonPhaseName(phase),
  };
}

export function moonPhaseName(phase) {
  if (phase < 7 || phase >= 353) return '삭 (그믐~초하루)';
  if (phase < 83) return '초승달';
  if (phase < 97) return '상현달';
  if (phase < 173) return '차오르는 달';
  if (phase < 187) return '보름달';
  if (phase < 263) return '기우는 달';
  if (phase < 277) return '하현달';
  return '그믐달';
}

export function nextMoonPhases(date) {
  const a = lib();
  const t = a.MakeTime(date);
  const full = a.SearchMoonPhase(180, t, 40);
  const neu = a.SearchMoonPhase(0, t, 40);
  return { nextFull: full ? full.date : null, nextNew: neu ? neu.date : null };
}

export function constellationKo(raH, dec) {
  const info = lib().Constellation(raH, dec);
  return CONSTELLATION_KO[info.name] ? `${CONSTELLATION_KO[info.name]}자리` : info.name;
}

/** 조건을 만족하는 연속 구간 */
export function intervals(samples, pred) {
  const out = [];
  let cur = null;
  for (const s of samples) {
    if (pred(s)) {
      if (!cur) cur = { start: s.t, end: s.t };
      else cur.end = s.t;
    } else if (cur) {
      out.push(cur);
      cur = null;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export const totalMinutes = (ivs) => ivs.reduce((m, iv) => m + (iv.end - iv.start) / MINUTE, 0);

/** 달빛이 촬영을 방해하는가 */
export const moonInterferes = (moonAlt, illum) => moonAlt > 0 && illum > 0.12;

/** 하늘 밝기 단계: 0 낮, 1 시민박명, 2 항해박명, 3 천문박명, 4 밤 */
export function twilightLevel(sunAlt) {
  if (sunAlt > -0.833) return 0;
  if (sunAlt > -6) return 1;
  if (sunAlt > -12) return 2;
  if (sunAlt > -18) return 3;
  return 4;
}

/**
 * 하룻밤(정오~다음날 정오) 전체 계산
 * @returns 이벤트 시각, 5분 간격 샘플, 달 정보, 어두운 시간대
 */
export function computeNight({ lat, lon, date, stepMin = 5 }) {
  const a = lib();
  const obs = makeObserver(lat, lon);
  const start = nightStart(date, lon);
  const end = new Date(start.getTime() + DAY);
  const t0 = a.MakeTime(start);
  const within = (t) => (t && t.date >= start && t.date <= end ? t.date : null);
  const riseSet = (body, dir) => within(a.SearchRiseSet(body, obs, dir, t0, 1));
  const sunAt = (dir, alt) => within(a.SearchAltitude(a.Body.Sun, obs, dir, t0, 1, alt));

  const ev = {
    goldenStart: sunAt(-1, 6),
    sunset: riseSet(a.Body.Sun, -1),
    blueStart: sunAt(-1, -4),
    civilDusk: sunAt(-1, -6),
    nauticalDusk: sunAt(-1, -12),
    astroDusk: sunAt(-1, -18),
    astroDawn: sunAt(+1, -18),
    nauticalDawn: sunAt(+1, -12),
    civilDawn: sunAt(+1, -6),
    blueEnd: sunAt(+1, -4),
    sunrise: riseSet(a.Body.Sun, +1),
    goldenEnd: sunAt(+1, 6),
    moonrise: riseSet(a.Body.Moon, +1),
    moonset: riseSet(a.Body.Moon, -1),
  };

  const samples = [];
  for (let ms = start.getTime(); ms <= end.getTime(); ms += stepMin * MINUTE) {
    const d = new Date(ms);
    const time = a.MakeTime(d);
    const frame = skyFrame(time, obs);
    const planets = {};
    for (const p of PLANETS) planets[p.body] = bodyHorizon(p.body, time, obs);
    const regions = {};
    for (const r of REGIONS_EQ) regions[r.id] = frame(r.ra, r.dec);
    samples.push({
      t: d,
      sun: bodyHorizon('Sun', time, obs),
      moon: bodyHorizon('Moon', time, obs),
      gc: frame(GALACTIC_CENTER.ra, GALACTIC_CENTER.dec),
      polaris: frame(STAR_BY_ID.polaris.ra, STAR_BY_ID.polaris.dec),
      planets,
      regions,
    });
  }

  const midnight = new Date(start.getTime() + 12 * HOUR);
  const moon = moonInfo(midnight);
  // 밤 동안 달의 밝기 변화는 작으므로 샘플마다 조도를 근사
  for (const s of samples) s.moonIllum = moon.illum;

  const dark = intervals(samples, (s) => s.sun.alt < -18);
  const hasAstroDark = dark.length > 0;
  const darkThreshold = hasAstroDark ? -18 : -12;
  const darkWindows = hasAstroDark ? dark : intervals(samples, (s) => s.sun.alt < -12);
  const moonlessDark = intervals(
    samples,
    (s) => s.sun.alt < darkThreshold && !moonInterferes(s.moon.alt, s.moonIllum),
  );

  const first = ev.sunset ? ev.sunset.getTime() - 50 * MINUTE : start.getTime();
  const last = ev.sunrise ? ev.sunrise.getTime() + 50 * MINUTE : end.getTime();
  const chartRange = {
    from: new Date(Math.max(start.getTime(), first)),
    to: new Date(Math.min(end.getTime(), Math.max(last, first + 6 * HOUR))),
  };

  return {
    lat, lon, date, obs, start, end, events: ev, samples, moon,
    darkThreshold, hasAstroDark, darkWindows, moonlessDark, chartRange,
    ...nextMoonPhases(midnight),
  };
}

/** 특정 시각의 하늘 상태 */
export function snapshot(date, obs) {
  const a = lib();
  const time = a.MakeTime(date);
  const moon = { ...bodyHorizon('Moon', time, obs), ...moonInfo(date) };
  const planets = PLANETS.map((p) => {
    const h = bodyHorizon(p.body, time, obs);
    const mag = a.Illumination(a.Body[p.body], time).mag;
    return { ...p, ...h, mag };
  });
  return {
    t: date,
    sun: bodyHorizon('Sun', time, obs),
    moon,
    planets,
    frame: skyFrame(time, obs),
  };
}

export function nearestSample(night, date) {
  const step = night.samples[1].t - night.samples[0].t;
  const i = Math.round((date - night.samples[0].t) / step);
  return night.samples[Math.max(0, Math.min(night.samples.length - 1, i))];
}

/* ────────────── 대상별 분석 ────────────── */

const altScore = (alt, full = 20) => (alt < 8 ? 0 : Math.min(1, (alt - 8) / (full - 8)));

/** 은하수: 오늘 밤 가장 좋은 영역과 시각 */
export function analyzeMilkyWay(night) {
  const dark = night.samples.filter((s) => s.sun.alt < night.darkThreshold);
  let best = null;
  for (const s of dark) {
    const moonFactor = moonInterferes(s.moon.alt, s.moonIllum) ? Math.max(0.12, 1 - s.moonIllum * 1.05) : 1;
    for (const r of REGIONS_EQ) {
      const pos = s.regions[r.id];
      const score = r.weight * altScore(pos.alt) * moonFactor;
      if (!best || score > best.score) best = { score, region: r, t: s.t, pos };
    }
  }
  const coreWindows = intervals(night.samples, (s) => s.sun.alt < night.darkThreshold && s.gc.alt > 10);
  const coreMoonless = intervals(
    night.samples,
    (s) => s.sun.alt < night.darkThreshold && s.gc.alt > 10 && !moonInterferes(s.moon.alt, s.moonIllum),
  );
  let regionWindows = [];
  if (best && best.score > 0) {
    const id = best.region.id;
    regionWindows = intervals(
      night.samples,
      (s) => s.sun.alt < night.darkThreshold && s.regions[id].alt > 10 && !moonInterferes(s.moon.alt, s.moonIllum),
    );
  }
  const gcMax = night.samples.reduce((m, s) => Math.max(m, s.gc.alt), -90);
  return {
    best: best && best.score > 0 ? best : null,
    coreWindows,
    coreMoonless,
    regionWindows,
    gcMaxAlt: gcMax,
    coreMinutes: totalMinutes(coreMoonless),
  };
}

/** 은하수 띠가 지평선과 이루는 각도 (구도 판단용) */
export function bandAngleAt(frame, l) {
  const p1 = galacticToEquatorial(l - 6, 0);
  const p2 = galacticToEquatorial(l + 6, 0);
  const h1 = frame(p1.ra, p1.dec);
  const h2 = frame(p2.ra, p2.dec);
  let daz = h2.az - h1.az;
  if (daz > 180) daz -= 360;
  if (daz < -180) daz += 360;
  const meanAlt = ((h1.alt + h2.alt) / 2) * DEG;
  const dx = daz * Math.cos(meanAlt);
  const dy = h2.alt - h1.alt;
  return Math.abs(Math.atan2(Math.abs(dy), Math.abs(dx)) / DEG);
}

/** 유성우: 날짜 기준으로 활동 중이거나 다음에 올 유성우 */
/**
 * fromDate 이후 태양이 처음으로 황경 lon°에 오는 시각.
 * SearchSunLongitude에 1년짜리 창을 주면 목표가 창 끝 근처일 때 null을 돌려주므로,
 * 지금 태양 황경으로 날짜를 어림한 뒤 며칠짜리 좁은 창에서 찾는다.
 */
export function nextSunLongitude(lon, fromDate) {
  const a = lib();
  const now = a.SunPosition(a.MakeTime(fromDate)).elon;
  const days = ((((lon - now) % 360) + 360) % 360) / 360 * 365.2422;
  const start = new Date(fromDate.getTime() + Math.max(0, days - 4) * DAY);
  const hit = a.SearchSunLongitude(lon, a.MakeTime(start), 8);
  return hit ? hit.date : new Date(fromDate.getTime() + days * DAY);
}

export function findMeteorShower(dateStr) {
  const ref = nightStart(dateStr);
  const from = new Date(ref.getTime() - 40 * DAY);
  const list = METEOR_SHOWERS.map((sh) => {
    const peak = nextSunLongitude(sh.peakSolarLon, from);
    const days = (peak - ref) / DAY;
    return { ...sh, peak, daysToPeak: days, active: isActive(sh, ref) };
  });
  // 극대 앞뒤 4일 안의 유성우가 있으면 그것을, 아니면 다음 극대를 고른다
  const near = list.filter((s) => s.active && Math.abs(s.daysToPeak) <= 4)
    .sort((x, y) => Math.abs(x.daysToPeak) - Math.abs(y.daysToPeak));
  if (near.length) return near[0];
  return list.filter((s) => s.daysToPeak > -1).sort((x, y) => x.daysToPeak - y.daysToPeak)[0];
}

/** id로 유성우를 고르고, 날짜에 가장 가까운 극대 시각을 붙인다 */
export function meteorShowerById(id, dateStr) {
  const sh = METEOR_SHOWERS.find((s) => s.id === id);
  if (!sh) return findMeteorShower(dateStr);
  const ref = nightStart(dateStr);
  const peak = nextSunLongitude(sh.peakSolarLon, new Date(ref.getTime() - 182 * DAY));
  return { ...sh, peak, daysToPeak: (peak - ref) / DAY, active: isActive(sh, ref) };
}

function isActive(sh, date) {
  const md = (date.getMonth() + 1) * 100 + date.getDate();
  const from = sh.activeFrom[0] * 100 + sh.activeFrom[1];
  const to = sh.activeTo[0] * 100 + sh.activeTo[1];
  return from <= to ? md >= from && md <= to : md >= from || md <= to;
}

export function upcomingShowers(date, count = 4) {
  const from = new Date(date.getTime() - 2 * DAY);
  return METEOR_SHOWERS.map((sh) => ({ ...sh, peak: nextSunLongitude(sh.peakSolarLon, from) }))
    .sort((x, y) => x.peak - y.peak)
    .slice(0, count);
}

/** 보틀 등급 → 한계등급 */
export const BORTLE_LM = { 1: 7.8, 2: 7.3, 3: 6.8, 4: 6.3, 5: 5.8, 6: 5.3, 7: 4.8, 8: 4.3, 9: 4.0 };

export function meteorRate(shower, radiantAlt, bortle, moonPenalty = 0, daysFromPeak = 0) {
  if (radiantAlt <= 0) return 0;
  const lm = BORTLE_LM[bortle] - moonPenalty;
  const activity = Math.exp(-(daysFromPeak * daysFromPeak) / 3);
  return shower.zhr * Math.sin(radiantAlt * DEG) * Math.pow(2.2, lm - 6.5) * activity;
}

export function analyzeMeteor(night, shower) {
  const frameAt = (s) => skyFrame(lib().MakeTime(s.t), night.obs);
  let best = null;
  const radiant = night.samples.map((s) => {
    const pos = frameAt(s)(shower.ra, shower.dec);
    if (s.sun.alt < night.darkThreshold && pos.alt > 0 && (!best || pos.alt > best.pos.alt)) best = { t: s.t, pos };
    return { t: s.t, ...pos };
  });
  return { radiant, best };
}

/** 행성: 밤 동안 각 행성의 최고 고도와 시각 */
export function analyzePlanets(night) {
  const a = lib();
  return PLANETS.map((p) => {
    // 45° 넘으면 더 높아도 큰 차이가 없으니, 어두운 하늘에서 충분히 높이 뜬 가장 이른 시각을 고른다
    let best = null;
    let bestScore = -Infinity;
    for (const s of night.samples) {
      if (s.sun.alt > -6) continue;
      const h = s.planets[p.body];
      const score = Math.min(h.alt, 45) + (s.sun.alt < -15 ? 5 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = { t: s.t, alt: h.alt, az: h.az, ra: h.ra, dec: h.dec };
      }
    }
    if (!best) return { ...p, visible: false };
    const time = a.MakeTime(best.t);
    const mag = a.Illumination(a.Body[p.body], time).mag;
    const rise = a.SearchRiseSet(a.Body[p.body], night.obs, +1, a.MakeTime(night.start), 1);
    const set = a.SearchRiseSet(a.Body[p.body], night.obs, -1, a.MakeTime(night.start), 1);
    return {
      ...p,
      ...best,
      mag,
      visible: best.alt > 5,
      constellation: constellationKo(best.ra, best.dec),
      rise: rise ? rise.date : null,
      set: set ? set.date : null,
    };
  }).sort((x, y) => (y.visible - x.visible) || (x.mag - y.mag));
}

/** 달 촬영: 밤(또는 박명) 중 달이 가장 높은 시각, 월출 직후 시각 */
export function analyzeMoon(night) {
  let best = null;
  let bestScore = -Infinity;
  for (const s of night.samples) {
    if (s.sun.alt > -4 || s.moon.alt < 5) continue;
    const score = Math.min(s.moon.alt, 50) + (s.sun.alt < -12 ? 5 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = { t: s.t, alt: s.moon.alt, az: s.moon.az };
    }
  }
  let lowMoon = null;
  if (night.events.moonrise) {
    const target = night.events.moonrise.getTime() + 25 * MINUTE;
    const s = nearestSample(night, new Date(target));
    lowMoon = { t: s.t, alt: s.moon.alt, az: s.moon.az, sunAlt: s.sun.alt };
  }
  return { best, lowMoon };
}

/** 여러 날 밤을 빠르게 훑어 촬영 적합도를 계산 */
export function scanNights({ lat, lon, fromDate, count = 30, stepMin = 20 }) {
  const a = lib();
  const obs = makeObserver(lat, lon);
  const out = [];
  for (let i = 0; i < count; i++) {
    const dateStr = shiftDateStr(fromDate, i);
    const start = nightStart(dateStr, lon);
    const moon = moonInfo(new Date(start.getTime() + 12 * HOUR));
    let dark = 0;
    let moonless = 0;
    let core = 0;
    let band = 0;
    const step = stepMin;
    for (let m = 0; m <= 24 * 60; m += step) {
      const d = new Date(start.getTime() + m * MINUTE);
      const time = a.MakeTime(d);
      const sun = bodyHorizon('Sun', time, obs);
      if (sun.alt >= -18) continue;
      dark += step;
      const moonH = bodyHorizon('Moon', time, obs);
      if (moonInterferes(moonH.alt, moon.illum)) continue;
      moonless += step;
      const frame = skyFrame(time, obs);
      const gc = frame(GALACTIC_CENTER.ra, GALACTIC_CENTER.dec);
      if (gc.alt > 10) core += step;
      const cyg = REGIONS_EQ.find((r) => r.id === 'cygnus');
      const c = frame(cyg.ra, cyg.dec);
      if (gc.alt > 10 || c.alt > 30) band += step;
    }
    out.push({ date: dateStr, start, moon, dark, moonless, core, band });
  }
  return out;
}
