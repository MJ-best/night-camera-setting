// 화면 상태와 렌더링
import * as astro from './astro.js';
import * as cam from './camera.js';
import { SkyMap } from './skymap.js';
import { renderTimeline } from './chart.js';
import { fetchWeather, summarize, packRows, unpackRows, isNearby, WEATHER_TTL_MS } from './weather.js';
import { Compass, compassSupported, defaultDeclination } from './compass.js';
import { STARS, METEOR_SHOWERS, PLANETS } from './data.js';
import {
  azimuthName, formatTime, formatDate, formatNightTime, formatRange, formatDuration, formatCoord,
  escapeHtml, moonPhasePath, signedDeg, normDeg,
} from './format.js';

const $ = (id) => document.getElementById(id);
const STORE_KEY = 'night-camera-setting:v1';
const WEATHER_KEY = 'night-camera-setting:weather';
const PLANET_DIAMETER_KM = { Mercury: 4879, Venus: 12104, Mars: 6779, Jupiter: 142984, Saturn: 120536 };

const DEFAULTS = {
  target: 'milkyway',
  lat: 37.5665,
  lon: 126.978,
  locSource: 'default',
  placeName: '서울 (예시 위치)',
  sensor: 'ff',
  mp: 24,
  bortle: 4,
  declination: null,
  skyMode: 'pano',
  screenMode: 'normal',
  places: [],
  lenses: Object.fromEntries(Object.entries(cam.TARGETS).map(([k, v]) => [k, { ...v.lens }])),
};
const PERSIST = ['target', 'lat', 'lon', 'locSource', 'placeName', 'sensor', 'mp', 'bortle', 'declination', 'skyMode', 'screenMode', 'places', 'lenses'];

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      // 예전 버전은 적색 모드를 nightVision(true/false)으로 저장했다
      if (!saved.screenMode && saved.nightVision) saved.screenMode = 'red';
      delete saved.nightVision;
      return { ...DEFAULTS, ...saved, lenses: { ...DEFAULTS.lenses, ...(saved.lenses || {}) } };
    }
  } catch { /* 저장소를 못 쓰는 환경 */ }
  return { ...DEFAULTS, lenses: structuredClone(DEFAULTS.lenses) };
}
function saveState() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(PERSIST.map((k) => [k, state[k]]))));
  } catch { /* 무시 */ }
}

const state = {
  ...loadState(),
  date: astro.currentNightDateStr(),
  selected: null,
  userTime: false,
  shower: null,
  planet: null,
};

let night = null;
let analysis = {};
let weather = { lat: null, lon: null, at: 0, rows: null, status: 'idle', error: null };
let scan = { key: null, rows: null };
let heading = null;
let timelineApi = null;
const skyMap = new SkyMap($('skyCanvas'));
const compass = new Compass((h) => { heading = h; renderDirection(); });

/* ───────────── 계산 ───────────── */

const lens = () => state.lenses[state.target] || cam.TARGETS[state.target].lens;
const declination = () => (state.declination ?? defaultDeclination(state.lat, state.lon));
const southern = () => state.lat < 0;

function recompute() {
  night = astro.computeNight({ lat: state.lat, lon: state.lon, date: state.date });
  analysis = {
    mw: astro.analyzeMilkyWay(night),
    moon: astro.analyzeMoon(night),
    planets: astro.analyzePlanets(night),
  };
  analysis.shower = state.shower ? astro.meteorShowerById(state.shower, state.date) : astro.findMeteorShower(state.date);
  analysis.meteor = astro.analyzeMeteor(night, analysis.shower);
  state.selected = bestTime();
  state.userTime = false;
  setupSlider();
  renderAll();
  // 30일 계산은 그 페이지를 볼 때만 한다
  if (currentPage === PAGE.tonight || scan.rows) scheduleScan();
}

function midOf(iv) {
  return new Date((iv.start.getTime() + iv.end.getTime()) / 2);
}
function longest(ivs) {
  return ivs.reduce((b, iv) => (!b || iv.end - iv.start > b.end - b.start ? iv : b), null);
}

function featuredPlanet() {
  const list = analysis.planets || [];
  if (state.planet) {
    const p = list.find((x) => x.body === state.planet);
    if (p && p.visible) return p;
  }
  return list.find((p) => p.visible) || null;
}

function bestTime() {
  const fallback = night.darkWindows.length ? midOf(longest(night.darkWindows)) : midOf({ start: night.chartRange.from, end: night.chartRange.to });
  switch (state.target) {
    case 'milkyway': return analysis.mw.best ? analysis.mw.best.t : fallback;
    case 'moon': return analysis.moon.best?.t || analysis.moon.lowMoon?.t || fallback;
    case 'startrails': {
      const iv = longest(night.moonlessDark) || longest(night.darkWindows);
      return iv ? new Date(iv.start.getTime() + 15 * astro.MINUTE) : fallback;
    }
    case 'meteor': return analysis.meteor.best?.t || fallback;
    case 'planets': return featuredPlanet()?.t || fallback;
    case 'city': {
      const { blueStart, civilDusk, sunset } = night.events;
      if (blueStart && civilDusk) return new Date((blueStart.getTime() + civilDusk.getTime()) / 2);
      return sunset ? new Date(sunset.getTime() + 25 * astro.MINUTE) : fallback;
    }
    default: return fallback;
  }
}

function snapshotNow() {
  return astro.snapshot(state.selected, night.obs);
}

/** 선택 시각의 촬영 대상 위치 */
function targetAt(snap) {
  const f = snap.frame;
  switch (state.target) {
    case 'milkyway': {
      const region = analysis.mw.best?.region || astro.MILKY_WAY_REGIONS_EQ[0];
      return { ...f(region.ra, region.dec), label: region.name, short: region.short, region };
    }
    case 'moon': return { alt: snap.moon.alt, az: snap.moon.az, label: `달 (${snap.moon.name})` };
    case 'startrails': {
      const pole = southern() ? f(0, -90) : f(2.5303, 89.264);
      return { ...pole, label: southern() ? '남쪽 하늘의 천구 남극' : '북극성 (천구 북극)' };
    }
    case 'meteor': {
      const sh = analysis.shower;
      return { ...f(sh.ra, sh.dec), label: `${sh.name} 복사점` };
    }
    case 'planets': {
      const p = featuredPlanet();
      if (!p) return { alt: snap.moon.alt, az: snap.moon.az, label: '보이는 행성 없음' };
      const sp = snap.planets.find((x) => x.body === p.body);
      return { alt: sp.alt, az: sp.az, label: `${p.name} (${p.constellation})`, planet: sp };
    }
    case 'city': return { alt: Math.max(snap.sun.alt, 0), az: snap.sun.az, label: '해가 진 쪽 (하늘이 가장 밝은 방향)', sunAz: true };
    default: return { alt: 0, az: 180, label: '' };
  }
}

function settingsContext(snap, tgt) {
  const l = lens();
  const ctx = {
    gear: { sensor: state.sensor, mp: state.mp, focal: l.focal, maxAperture: l.maxAperture },
    bortle: state.bortle,
    sky: {
      sunAlt: snap.sun.alt,
      moonAlt: snap.moon.alt,
      moonMag: snap.moon.mag,
      moonIllum: snap.moon.illum,
      moonPhaseAngle: snap.moon.phaseAngle,
      moonDiameter: snap.moon.diameterDeg,
      moonDistKm: snap.moon.distKm,
    },
  };
  if (state.target === 'planets' && tgt.planet) {
    ctx.planet = tgt.planet;
    const km = PLANET_DIAMETER_KM[tgt.planet.body];
    ctx.planetDiameterArcsec = (206265 * km) / (tgt.planet.dist * 149597870.7);
  }
  if (state.target === 'startrails') {
    const iv = longest(night.moonlessDark) || longest(night.darkWindows);
    const min = iv ? (iv.end - iv.start) / astro.MINUTE : 90;
    ctx.durationMin = Math.round(Math.max(30, Math.min(120, min)) / 10) * 10;
  }
  return ctx;
}

function orientationFor(snap, tgt) {
  if (state.target !== 'milkyway' || !tgt.region) return 'landscape';
  const angle = astro.bandAngleAt(snap.frame, tgt.region.l);
  return angle > 55 && lens().focal <= 24 ? 'portrait' : 'landscape';
}

function framingFor(snap, tgt) {
  const sensor = cam.sensorOf(state.sensor);
  const orientation = orientationFor(snap, tgt);
  if (state.target === 'moon' || (state.target === 'planets' && lens().focal >= 200)) {
    const fov = cam.fieldOfView(sensor, lens().focal);
    return { tilt: Math.max(tgt.alt, 0), hfov: fov.h, vfov: fov.v, orientation };
  }
  if (state.target === 'meteor') {
    const fr = cam.framing(sensor, lens().focal, 0, { orientation });
    const tilt = Math.max(fr.tilt, Math.min(tgt.alt - fr.vfov / 2 + 8, 70));
    return { ...fr, tilt, orientation };
  }
  return { ...cam.framing(sensor, lens().focal, tgt.alt, { orientation }), orientation };
}

function focusStar(snap) {
  const cands = [];
  for (const s of STARS) {
    if (s.mag > 1.6 || !s.name) continue;
    const h = snap.frame(s.ra, s.dec);
    if (h.alt > 20) cands.push({ name: s.name, mag: s.mag, ...h });
  }
  for (const p of snap.planets) if (p.alt > 15 && p.mag < 0) cands.push({ name: p.name, mag: p.mag, alt: p.alt, az: p.az });
  cands.sort((a, b) => a.mag - b.mag);
  return cands[0] || null;
}

/* ───────────── 렌더링 ───────────── */

function renderAll() {
  renderContext();
  renderVerdict();
  renderTimeDependent();
  renderExtra();
  renderCalendar();
  renderChecklist();
}

function renderTimeDependent() {
  const snap = snapshotNow();
  const tgt = targetAt(snap);
  const fr = framingFor(snap, tgt);
  renderSettings(snap, tgt);
  renderDirection(snap, tgt, fr);
  skyMap.update({
    frame: snap.frame,
    sun: snap.sun,
    moon: snap.moon,
    planets: snap.planets,
    southern: southern(),
    gc: snap.frame(17.7611, -29.0078),
    radiant: state.target === 'meteor' ? snap.frame(analysis.shower.ra, analysis.shower.dec) : null,
    target: tgt,
    fov: { az: tgt.az, tilt: fr.tilt, hfov: fr.hfov, vfov: fr.vfov },
  });
  syncSlider();
  renderTimelinePanel();
}

function renderContext() {
  const where = state.placeName || formatCoord(state.lat, state.lon);
  const start = astro.nightStart(state.date);
  $('contextLine').textContent = `${where} · ${formatDate(start, { weekday: false })} 밤`;
  const l = lens();
  $('lat').value = state.lat.toFixed(4);
  $('lon').value = state.lon.toFixed(4);
  $('date').value = state.date;
  const next = new Date(start.getTime() + astro.DAY);
  $('dateHint').textContent = `${formatDate(start)} 저녁부터 ${formatDate(next)} 새벽까지 계산해요.`;
  $('sensor').value = state.sensor;
  $('mp').value = state.mp;
  $('focal').value = l.focal;
  $('aperture').value = l.maxAperture;
  $('bortle').value = String(state.bortle);
  $('lensFor').textContent = `· ${cam.TARGETS[state.target].label}용`;
  $('declination').value = String(declination());
  document.querySelectorAll('.targets button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.target === state.target)));
  document.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === state.skyMode)));
  $('panHint').hidden = state.skyMode !== 'pano';
  $('recenter').hidden = state.skyMode !== 'pano';
  renderPlaces();
  renderSetupSummary();
}

let lastVerdict = null;
function renderSetupSummary() {
  const where = state.placeName || formatCoord(state.lat, state.lon);
  const start = astro.nightStart(state.date);
  const l = lens();
  const gear = `${cam.sensorOf(state.sensor).label} ${l.focal}mm f/${l.maxAperture}`;
  const v = lastVerdict ? ` → ${lastVerdict.title} (${lastVerdict.label})` : '';
  $('setupSummary').textContent = `${where} · ${formatDate(start)} 밤 · ${gear}${v}`;
}

function renderPlaces() {
  const sel = $('places');
  sel.innerHTML = '<option value="">저장한 장소 불러오기</option>' + state.places
    .map((p, i) => `<option value="${i}">${escapeHtml(p.name)} · ${p.lat.toFixed(2)}, ${p.lon.toFixed(2)}</option>`).join('');
}

/* 판정 카드 */
function josa(word, withBatchim, without) {
  const m = String(word).match(/[가-힣](?=[^가-힣]*$)/);
  if (!m) return word + without;
  const code = m[0].charCodeAt(0) - 0xac00;
  return word + (code % 28 ? withBatchim : without);
}

function nightWeather() {
  if (!weather.rows || !night) return null;
  const from = night.darkWindows[0]?.start || night.chartRange.from;
  const to = night.darkWindows.length ? night.darkWindows[night.darkWindows.length - 1].end : night.chartRange.to;
  return summarize(weather.rows, from, to);
}

function moonLine() {
  const m = night.moon;
  const ev = night.events;
  const s = night.start;
  const pct = Math.round(m.illum * 100);
  const parts = [`달은 ${m.name} (밝기 ${pct}%)`];
  if (m.illum < 0.08) return `${parts[0]}이라 달빛 걱정이 없어요.`;
  // 해가 진 뒤부터 해 뜨기 전까지의 월출·월몰만 의미가 있다
  const from = ev.sunset || s;
  const to = ev.sunrise || night.end;
  const inNight = (d) => d && d > from && d < to;
  const rise = inNight(ev.moonrise) ? ev.moonrise : null;
  const set = inNight(ev.moonset) ? ev.moonset : null;
  if (rise && set) return rise < set ? `${parts[0]}, ${formatNightTime(rise, s)}에 떠서 ${formatNightTime(set, s)}에 져요.` : `${parts[0]}, ${formatNightTime(set, s)}에 졌다가 ${formatNightTime(rise, s)}에 다시 떠요.`;
  if (rise) return `${parts[0]}, ${formatNightTime(rise, s)}에 떠요. 그 전이 어두워요.`;
  if (set) return `${parts[0]}, ${formatNightTime(set, s)}에 져요. 그 뒤가 어두워요.`;
  const up = astro.nearestSample(night, new Date((from.getTime() + to.getTime()) / 2)).moon.alt > 0;
  return up ? `${parts[0]}, 밤새 하늘에 있어요.` : `${parts[0]}, 밤에는 뜨지 않아요.`;
}

function verdictData() {
  const s = night.start;
  const t = state.target;
  if (t === 'milkyway') {
    const mw = analysis.mw;
    if (!mw.best) {
      return {
        level: 'bad', title: '은하수 촬영이 어려운 밤',
        lines: [night.hasAstroDark ? '어두운 시간대에 은하수가 지평선 가까이 낮게만 있어요.' : '이 날짜·위도는 밤에도 하늘이 완전히 어두워지지 않아요.', moonLine()],
      };
    }
    const r = mw.best.region;
    const win = longest(mw.regionWindows);
    const minutes = astro.totalMinutes(mw.regionWindows);
    const coreRegion = r.id === 'core' || r.id === 'carina';
    const level = minutes >= 90 && coreRegion ? 'good' : minutes >= 30 ? 'ok' : 'bad';
    const lines = [];
    if (win) lines.push(`${josa(r.name, '이', '가')} ${formatRange(win, s)} ${azimuthName(mw.best.pos.az)}쪽 하늘에 보여요 (가장 좋은 때 ${formatNightTime(mw.best.t, s)}, 고도 ${Math.round(mw.best.pos.alt)}°).`);
    else lines.push(`${josa(r.name, '이', '가')} 떠 있지만 달빛이 겹쳐요. 가장 나은 때는 ${formatNightTime(mw.best.t, s)}이에요.`);
    lines.push(moonLine());
    if (r.id !== 'core' && r.id !== 'carina') {
      lines.push(mw.gcMaxAlt > 5
        ? '은하수 중심부(궁수자리)는 해가 진 뒤엔 이미 낮거나 지평선 아래예요. 한국에서는 3~10월, 특히 5~8월이 은하수 중심 시즌이에요.'
        : '은하수 중심부(궁수자리)는 이 시기 밤에 뜨지 않아요. 한국에서는 3~10월, 특히 5~8월이 은하수 중심 시즌이에요.');
    }
    return { level, title: `은하수 ${level === 'good' ? '촬영하기 좋은 밤' : level === 'ok' ? '촬영 가능' : '조건이 아쉬운 밤'}`, lines, windows: mw.regionWindows };
  }
  if (t === 'moon') {
    const m = night.moon;
    const best = analysis.moon.best;
    const level = !best || m.illum < 0.05 ? 'bad' : best.alt > 20 ? 'good' : 'ok';
    const lines = [`${m.name} · 밝기 ${Math.round(m.illum * 100)}% · 월령 ${m.ageDays.toFixed(1)}일`];
    if (best) lines.push(`가장 높이 뜨는 때는 ${formatNightTime(best.t, s)} ${azimuthName(best.az)}쪽 고도 ${Math.round(best.alt)}°예요.`);
    else lines.push('어두운 시간에는 달이 거의 보이지 않아요. 다음 보름이나 낮달을 노려 보세요.');
    if (analysis.moon.lowMoon && analysis.moon.lowMoon.sunAlt < 0) lines.push(`월출 직후 ${formatNightTime(analysis.moon.lowMoon.t, s)}에는 지평선 가까이 큰 달과 풍경을 함께 담을 수 있어요.`);
    lines.push(`다음 보름 ${formatDate(night.nextFull)} · 다음 삭 ${formatDate(night.nextNew)}`);
    const wins = astro.intervals(night.samples, (x) => x.moon.alt > 10 && x.sun.alt < -4);
    return { level, title: level === 'bad' ? '달 촬영이 어려운 밤' : `${m.name} 촬영`, lines, windows: wins };
  }
  if (t === 'startrails') {
    const dark = astro.totalMinutes(night.darkWindows);
    const ml = astro.totalMinutes(night.moonlessDark);
    const level = ml >= 180 ? 'good' : dark >= 120 ? 'ok' : 'bad';
    const pole = southern() ? '천구 남극' : '북극성';
    const polarAlt = Math.abs(state.lat).toFixed(0);
    const lines = [
      `달빛 없는 어두운 시간 ${formatDuration(ml)} (어두운 시간 전체 ${formatDuration(dark)}).`,
      `${pole}은 ${southern() ? '남쪽' : '북쪽'} 고도 약 ${polarAlt}°에 있어 그 주위로 동심원이 그려져요.`,
      moonLine(),
    ];
    return { level, title: `별궤적 ${level === 'good' ? '촬영하기 좋은 밤' : level === 'ok' ? '촬영 가능' : '어두운 시간이 짧은 밤'}`, lines, windows: night.moonlessDark };
  }
  if (t === 'meteor') {
    const sh = analysis.shower;
    const best = analysis.meteor.best;
    const days = sh.daysToPeak;
    const moonAtPeak = astro.moonInfo(sh.peak);
    const moonPenalty = moonAtPeak.illum > 0.5 ? 1.5 : moonAtPeak.illum > 0.2 ? 0.7 : 0;
    const rate = best ? astro.meteorRate(sh, best.pos.alt, state.bortle, moonPenalty, days) : 0;
    const peakRate = best ? astro.meteorRate(sh, best.pos.alt, state.bortle, moonPenalty, 0) : 0;
    const farFromPeak = Math.abs(days) > 2;
    const level = Math.abs(days) <= 1.5 && rate >= 15 ? 'good' : (Math.abs(days) <= 3 || rate >= 8) ? 'ok' : 'bad';
    const when = days > 1.5 ? `극대까지 ${Math.round(days)}일 남았어요` : days < -1.5 ? `극대가 ${Math.round(-days)}일 지났어요` : '극대 무렵이에요';
    const lines = [
      `${sh.name}: ${formatDate(sh.peak)} ${formatTime(sh.peak)} 극대 (ZHR ${sh.zhr}), ${when}.`,
      !best ? '어두운 시간에 복사점이 지평선 아래에 있어요.'
        : farFromPeak ? `오늘은 유성이 드물어요. 극대일 밤 비슷한 조건이면 복사점이 가장 높을 때 시간당 약 ${Math.round(peakRate)}개를 기대할 수 있어요.`
          : `복사점이 가장 높은 때는 ${formatNightTime(best.t, s)} (고도 ${Math.round(best.pos.alt)}°). 이때 시간당 약 ${Math.max(0, Math.round(rate))}개를 기대할 수 있어요.`,
      `극대 날 달 밝기 ${Math.round(moonAtPeak.illum * 100)}% · ${moonLine()}`,
    ];
    const radAlt = new Map(analysis.meteor.radiant.map((r) => [r.t.getTime(), r.alt]));
    const wins = astro.intervals(night.samples, (x) => x.sun.alt < night.darkThreshold && radAlt.get(x.t.getTime()) > 20);
    return { level, title: `${sh.name}`, lines, windows: wins };
  }
  if (t === 'planets') {
    const vis = analysis.planets.filter((p) => p.visible);
    const level = vis.length >= 2 ? 'good' : vis.length === 1 ? 'ok' : 'bad';
    const lines = vis.length
      ? vis.map((p) => `${p.name} ${p.constellation} · ${formatNightTime(p.t, s)} ${azimuthName(p.az)}쪽 고도 ${Math.round(p.alt)}° · ${p.mag.toFixed(1)}등급`)
      : ['어두운 시간에 잘 보이는 밝은 행성이 없어요.'];
    const fp = featuredPlanet();
    const wins = fp ? astro.intervals(night.samples, (x) => x.sun.alt < -6 && x.planets[fp.body].alt > 10) : [];
    return { level, title: vis.length ? `오늘 밤 보이는 행성 ${vis.length}개` : '행성 보기 어려운 밤', lines, windows: wins };
  }
  // 도시 야경
  const ev = night.events;
  const lines = [];
  if (ev.blueStart && ev.civilDusk) lines.push(`저녁 블루아워 ${formatTime(ev.blueStart)} ~ ${formatTime(ev.civilDusk)} (태양 고도 −4°~−6°)`);
  if (ev.goldenStart && ev.sunset) lines.push(`골든아워 ${formatTime(ev.goldenStart)} ~ 일몰 ${formatTime(ev.sunset)}`);
  if (ev.civilDawn && ev.blueEnd) lines.push(`새벽 블루아워 ${formatTime(ev.civilDawn)} ~ ${formatTime(ev.blueEnd)}`);
  const wins = [];
  if (ev.blueStart && ev.civilDusk) wins.push({ start: ev.blueStart, end: ev.civilDusk });
  if (ev.civilDawn && ev.blueEnd) wins.push({ start: ev.civilDawn, end: ev.blueEnd });
  return { level: 'good', title: '블루아워 야경', lines: lines.length ? lines : ['이 날짜·위도에서는 블루아워가 뚜렷하지 않아요.'], windows: wins };
}

function renderVerdict() {
  const v = verdictData();
  const wx = nightWeather();
  let level = v.level;
  const chips = [];
  const ev = night.events;
  if (night.hasAstroDark && night.darkWindows.length) {
    chips.push(`<span class="chip">완전한 밤 <b>${formatTime(ev.astroDusk)}–${formatTime(ev.astroDawn)}</b></span>`);
  } else if (!night.hasAstroDark) {
    chips.push('<span class="chip">천문박명이 밤새 이어짐</span>');
  }
  chips.push(`<span class="chip"><svg viewBox="-10 -10 20 20" aria-hidden="true"><circle r="9" fill="var(--panel)" stroke="var(--line)"/><path d="${moonPhasePath(night.moon.phase, 9, southern())}" fill="var(--moon)"/></svg>달 <b>${Math.round(night.moon.illum * 100)}%</b></span>`);
  if (wx) {
    chips.push(`<span class="chip">구름 <b>${Math.round(wx.cloud)}%</b> ${wx.sky}</span>`);
    if (wx.dewRisk) chips.push('<span class="chip">이슬 주의</span>');
    if (wx.maxWind >= 6) chips.push(`<span class="chip">바람 <b>${wx.maxWind.toFixed(0)}m/s</b></span>`);
    if (wx.cloud >= 70 && state.target !== 'city') level = 'bad';
    else if (wx.cloud >= 45 && level === 'good') level = 'ok';
  } else if (weather.status === 'loading') {
    chips.push('<span class="chip">날씨 불러오는 중…</span>');
  } else if (!weather.rows) {
    chips.push('<span class="chip">날씨 정보 없음</span>');
  }
  const label = { good: '좋음', ok: '보통', bad: '어려움' }[level];
  const lines = [...v.lines];
  if (wx && wx.cloud >= 45 && state.target !== 'city') lines.unshift(`예보상 구름이 많아요 (평균 ${Math.round(wx.cloud)}%). 가장 맑은 때는 ${formatTime(wx.clearest.t)} 무렵 ${Math.round(wx.clearest.cloud)}%예요.`);
  $('verdict').innerHTML = `
    <div class="verdict-top"><h2>${escapeHtml(v.title)}</h2><span class="pill ${level}">${label}</span></div>
    <div class="verdict-lines">${lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('')}</div>
    <div class="chips">${chips.join('')}</div>`;
  analysis.windows = v.windows || [];
  lastVerdict = { title: v.title, label };
  renderSetupSummary();
}

/* 카메라 설정 */
function renderSettings(snap, tgt) {
  const s = cam.settingsFor(state.target, settingsContext(snap, tgt));
  $('settingsTime').textContent = `${formatNightTime(state.selected, night.start)} 기준`;
  $('modeLine').textContent = s.mode;
  $('lcdIso').textContent = String(s.iso);
  $('lcdAperture').textContent = cam.formatAperture(s.aperture);
  $('lcdShutter').textContent = cam.formatShutter(s.shutter);
  $('lcdWb').textContent = typeof s.wb === 'number' ? `${s.wb}K` : s.wb;
  const meta = [['초점', s.focus]];
  if (['milkyway', 'startrails', 'meteor', 'planets'].includes(state.target)) {
    const fs = focusStar(snap);
    if (fs) meta.push(['초점용 별', `${fs.name} · ${azimuthName(fs.az)}쪽 고도 ${Math.round(fs.alt)}°`]);
  }
  if (s.sequence) meta.push(['촬영 방식', s.sequence]);
  meta.push(['기본', 'RAW · 수동(M) 노출 · 손떨림 보정 OFF · 2초 타이머/릴리즈']);
  $('settingsMeta').innerHTML = meta.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('');
  $('alts').innerHTML = (s.alternatives || []).map((a, i) => `
    <div class="alt${i === 0 ? ' primary' : ''}" role="listitem">
      <span class="alt-label">${escapeHtml(a.label)}</span>
      <span class="alt-values">ISO ${a.iso} · f/${a.aperture} · ${cam.formatShutter(a.shutter)}</span>
      <span class="alt-note">${escapeHtml(a.note)}</span>
    </div>`).join('');
  const notes = [
    ...(s.warnings || []).map((w) => `<li class="warn">${escapeHtml(w)}</li>`),
    ...(s.tips || []).map((w) => `<li class="tip">${escapeHtml(w)}</li>`),
  ];
  $('warnings').innerHTML = notes.join('');
  $('warnings').hidden = notes.length === 0;
  $('basis').innerHTML = s.basis.map((b) => `<li>${escapeHtml(b)}</li>`).join('');
}

/* 방향 */
let lastDir = null;
function renderDirection(snap, tgt, fr) {
  if (snap) lastDir = { snap, tgt, fr };
  if (!lastDir) return;
  ({ snap, tgt, fr } = lastDir);
  const decl = declination();
  const magAz = normDeg(tgt.az - decl);
  $('dirTarget').textContent = tgt.label;
  $('dirName').textContent = azimuthName(tgt.az);
  $('dirAz').textContent = `${Math.round(tgt.az)}°`;
  const below = tgt.alt < 0 && !tgt.sunAz;
  const orient = fr.orientation === 'portrait' ? '세로' : '가로';
  $('dirTilt').innerHTML = below
    ? `지금은 지평선 아래 (고도 ${Math.round(tgt.alt)}°) · 시각을 옮겨 보세요`
    : `카메라를 위로 <b>${Math.round(fr.tilt)}°</b> 기울이고 ${orient}로 · 대상 고도 ${Math.round(tgt.alt)}°`;
  $('dirMag').textContent = decl ? `나침반(자북) 기준으로는 ${Math.round(magAz)}° (편각 ${decl > 0 ? '+' : ''}${decl}° 보정)` : '진북 기준 방위각';
  const tips = {
    milkyway: fr.orientation === 'portrait'
      ? '은하수 띠가 거의 수직으로 서 있어요. 세로 구도로 띠 전체를 담고 아래쪽에 풍경을 조금 넣으세요.'
      : '은하수 띠가 비스듬히 누워 있어요. 가로 구도나 파노라마(여러 장 이어 찍기)로 아치를 담아 보세요.',
    moon: '삼각대에 고정하고, 달은 생각보다 빨리 움직이니 몇 분마다 구도를 다시 맞추세요.',
    startrails: southern() ? '남쪽 하늘을 향하면 천구 남극 주위로 동심원이 생겨요. 동·서쪽은 사선, 북쪽은 완만한 호가 돼요.' : '북쪽 하늘(북극성)을 향하면 동심원이 생겨요. 동·서쪽은 사선, 남쪽은 완만한 호가 돼요.',
    meteor: '복사점을 프레임 위쪽 가장자리에 두면 유성이 프레임 안을 길게 가로질러요. 가장 어두운 하늘 쪽이면 더 좋아요.',
    planets: '행성은 별처럼 깜빡이지 않는 밝은 점이에요. 망원이면 화면 중앙에 두고 자주 따라가세요.',
    city: '해가 진 쪽은 노을빛 하늘, 반대쪽(동쪽)은 고른 파란 하늘이에요. 조명이 켜진 블루아워를 노리세요.',
  };
  $('dirTip').textContent = tips[state.target];

  const live = $('dirLive');
  if (compass.active && heading != null) {
    const trueHeading = normDeg(heading + decl);
    const delta = signedDeg(tgt.az - trueHeading);
    live.hidden = false;
    live.textContent = Math.abs(delta) <= 4 ? '정면이에요. 이 방향으로 카메라를 두세요.' : `${delta > 0 ? '오른쪽' : '왼쪽'}으로 ${Math.round(Math.abs(delta))}° 돌리세요`;
    drawRose(tgt, snap, trueHeading);
  } else {
    live.hidden = true;
    drawRose(tgt, snap, null);
  }
}

function drawRose(tgt, snap, trueHeading) {
  const rot = trueHeading == null ? 0 : -trueHeading;
  const ticks = [];
  for (let a = 0; a < 360; a += 15) {
    const major = a % 90 === 0;
    const r1 = major ? 84 : 90;
    const rad = (a * Math.PI) / 180;
    ticks.push(`<line class="tick${major ? ' major' : ''}" x1="${(Math.sin(rad) * r1).toFixed(1)}" y1="${(-Math.cos(rad) * r1).toFixed(1)}" x2="${(Math.sin(rad) * 97).toFixed(1)}" y2="${(-Math.cos(rad) * 97).toFixed(1)}" stroke-width="${major ? 2 : 1}"/>`);
  }
  const lbl = [[0, '북', 'n'], [90, '동', ''], [180, '남', ''], [270, '서', '']].map(([a, t, c]) => {
    const rad = (a * Math.PI) / 180;
    return `<text class="lbl ${c}" x="${(Math.sin(rad) * 70).toFixed(1)}" y="${(-Math.cos(rad) * 70).toFixed(1)}" transform="rotate(${-rot} ${(Math.sin(rad) * 70).toFixed(1)} ${(-Math.cos(rad) * 70).toFixed(1)})">${t}</text>`;
  }).join('');
  const ta = (tgt.az * Math.PI) / 180;
  const tip = [Math.sin(ta) * 104, -Math.cos(ta) * 104];
  const base = [Math.sin(ta) * 20, -Math.cos(ta) * 20];
  const perp = [Math.cos(ta) * 9, Math.sin(ta) * 9];
  const head = [Math.sin(ta) * 82, -Math.cos(ta) * 82];
  let moonDot = '';
  if (snap.moon.alt > 0 && state.target !== 'moon') {
    const ma = (snap.moon.az * Math.PI) / 180;
    moonDot = `<circle class="moon-dot" cx="${(Math.sin(ma) * 56).toFixed(1)}" cy="${(-Math.cos(ma) * 56).toFixed(1)}" r="6"><title>달</title></circle>`;
  }
  const phone = trueHeading == null ? '' : '<path class="phone" d="M0,-116 L-7,-104 L7,-104 Z"/>';
  $('rose').innerHTML = `
    <g transform="rotate(${rot})">
      <circle class="ring" r="98"/>
      ${ticks.join('')}${lbl}${moonDot}
      <line class="arrow-line" x1="${base[0].toFixed(1)}" y1="${base[1].toFixed(1)}" x2="${head[0].toFixed(1)}" y2="${head[1].toFixed(1)}"/>
      <path class="arrow" d="M${tip[0].toFixed(1)},${tip[1].toFixed(1)} L${(head[0] + perp[0]).toFixed(1)},${(head[1] + perp[1]).toFixed(1)} L${(head[0] - perp[0]).toFixed(1)},${(head[1] - perp[1]).toFixed(1)} Z"/>
    </g>
    <circle r="4" fill="var(--text)"/>${phone}`;
}

/* 오늘 밤 차트 */
function renderTimelinePanel() {
  const series = [];
  const legend = [];
  const t = state.target;
  series.push({ alt: (s) => s.moon.alt, color: 'var(--moon)', width: 1.4 + 1.8 * night.moon.illum });
  legend.push(['var(--moon)', `달 ${Math.round(night.moon.illum * 100)}%`]);
  if (t === 'milkyway') {
    series.push({ alt: (s) => s.gc.alt, color: 'var(--mw)', width: 2.2 });
    legend.push(['var(--mw)', '은하 중심']);
    const r = analysis.mw.best?.region;
    if (r && r.id !== 'core') {
      series.push({ alt: (s) => s.regions[r.id].alt, color: 'var(--mw)', width: 1.6, dash: '5 4' });
      legend.push(['var(--mw)', r.short, true]);
    }
  }
  if (t === 'meteor') {
    const rad = new Map(analysis.meteor.radiant.map((r) => [r.t.getTime(), r.alt]));
    series.push({ alt: (s) => rad.get(s.t.getTime()) ?? -90, color: 'var(--accent)', width: 2.2 });
    legend.push(['var(--accent)', '복사점']);
  }
  if (t === 'startrails') {
    series.push({ alt: (s) => s.polaris.alt, color: 'var(--accent)', width: 1.6, dash: '4 4' });
    legend.push(['var(--accent)', '북극성']);
  }
  if (t === 'planets' || t === 'city') {
    for (const p of PLANETS) {
      const fp = featuredPlanet();
      const strong = fp && fp.body === p.body;
      series.push({ alt: (s) => s.planets[p.body].alt, color: p.color, width: strong ? 2.2 : 1.1, opacity: strong ? 1 : 0.6 });
      legend.push([p.color, p.name]);
    }
  }
  if (t === 'moon') series[0].width = 2.6;
  const clouds = weather.rows ? weather.rows.filter((r) => r.t >= night.chartRange.from && r.t <= night.chartRange.to) : null;
  timelineApi = renderTimeline($('timeline'), { night, selected: state.selected, series, windows: analysis.windows || [], clouds });
  legend.push(['var(--good)', '촬영 적기', false, 'box']);
  legend.push(['var(--tw-civil)', '박명', false, 'box']);
  $('timelineLegend').innerHTML = legend.map(([c, l, dashed, box]) => `<li><i class="${box ? 'box' : ''}" style="background:${dashed ? `repeating-linear-gradient(90deg, ${c} 0 5px, transparent 5px 9px)` : c}"></i>${escapeHtml(l)}</li>`).join('');
  renderEvents();
}

function renderEvents() {
  const e = night.events;
  const s = night.start;
  const items = [
    [e.sunset, '일몰'],
    [e.civilDusk, '시민박명 끝'],
    [e.nauticalDusk, '항해박명 끝'],
    [e.astroDusk, '천문박명 끝 · 완전한 밤', true],
    [e.astroDawn, '천문박명 시작', true],
    [e.civilDawn, '시민박명 시작'],
    [e.sunrise, '일출'],
  ];
  const azAt = (d) => Math.round(astro.nearestSample(night, d).moon.az);
  if (e.moonrise) items.push([e.moonrise, `월출 · ${azimuthName(azAt(e.moonrise))} ${azAt(e.moonrise)}°`]);
  if (e.moonset) items.push([e.moonset, `월몰 · ${azimuthName(azAt(e.moonset))} ${azAt(e.moonset)}°`]);
  for (const iv of analysis.windows || []) {
    items.push([iv.start, '촬영 적기 시작', true]);
    items.push([iv.end, '촬영 적기 끝', true]);
  }
  const list = items.filter(([d]) => d && d >= night.chartRange.from && d <= night.chartRange.to).sort((a, b) => a[0] - b[0]);
  $('events').innerHTML = list.map(([d, label, key]) => `<li class="${key ? 'key-event' : ''}"><time>${formatNightTime(d, s)}</time><span>${escapeHtml(label)}</span></li>`).join('');
}

/* 대상별 추가 정보 */
function renderExtra() {
  const el = $('extra');
  const s = night.start;
  const t = state.target;
  if (t === 'milkyway') {
    const rows = astro.MILKY_WAY_REGIONS_EQ.map((r) => {
      let best = null;
      for (const x of night.samples) {
        if (x.sun.alt >= night.darkThreshold) continue;
        const p = x.regions[r.id];
        if (!best || p.alt > best.alt) best = { ...p, t: x.t };
      }
      return { r, best };
    }).filter((x) => x.best && x.best.alt > 5);
    el.innerHTML = `<h2>오늘 밤 보이는 은하수 영역</h2>
      ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>영역</th><th>가장 높을 때</th><th>방향</th><th>고도</th></tr></thead><tbody>
      ${rows.map(({ r, best }) => `<tr class="${analysis.mw.best?.region.id === r.id ? 'selected' : ''}"><td>${escapeHtml(r.name)}</td><td class="num">${formatNightTime(best.t, s)}</td><td>${azimuthName(best.az)} <span class="num">${Math.round(best.az)}°</span></td><td class="num">${Math.round(best.alt)}°</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="hint">어두운 시간에 지평선 위로 충분히 올라오는 은하수 영역이 없어요.</p>'}
      <p class="hint">은하 중심 최고 고도는 위도에 따라 정해져요: 이곳에서는 최대 ${Math.max(0, Math.round(90 - Math.abs(state.lat - -29.0)))}° 정도. 낮을수록 지평선의 빛 공해를 피해야 해요.</p>`;
    return;
  }
  if (t === 'moon') {
    const m = night.moon;
    const e = night.events;
    const azAt = (d) => Math.round(astro.nearestSample(night, d).moon.az);
    el.innerHTML = `<h2>달 정보</h2>
      <div class="facts">
        <div class="fact"><span>위상</span><b>${escapeHtml(m.name)}</b><small>밝기 ${Math.round(m.illum * 100)}% · 월령 ${m.ageDays.toFixed(1)}일</small></div>
        <div class="fact"><span>월출</span><b>${e.moonrise ? formatNightTime(e.moonrise, s) : '—'}</b><small>${e.moonrise ? `${azimuthName(azAt(e.moonrise))} ${azAt(e.moonrise)}°` : '이 밤에는 없음'}</small></div>
        <div class="fact"><span>월몰</span><b>${e.moonset ? formatNightTime(e.moonset, s) : '—'}</b><small>${e.moonset ? `${azimuthName(azAt(e.moonset))} ${azAt(e.moonset)}°` : '이 밤에는 없음'}</small></div>
        <div class="fact"><span>지구–달 거리</span><b>${Math.round(m.distKm).toLocaleString()}km</b><small>겉보기 지름 ${(m.diameterDeg * 60).toFixed(1)}′</small></div>
        <div class="fact"><span>다음 보름</span><b>${formatDate(night.nextFull, { weekday: false })}</b><small>${formatTime(night.nextFull)}</small></div>
        <div class="fact"><span>다음 삭</span><b>${formatDate(night.nextNew, { weekday: false })}</b><small>${formatTime(night.nextNew)}</small></div>
      </div>
      <p class="hint">반달 무렵에는 명암 경계선의 크레이터 그림자가 깊어 보름보다 입체적으로 찍혀요.</p>`;
    return;
  }
  if (t === 'meteor') {
    const sh = analysis.shower;
    const opts = METEOR_SHOWERS.map((m) => `<option value="${m.id}" ${m.id === sh.id ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('');
    const up = astro.upcomingShowers(new Date(), 5);
    el.innerHTML = `<h2>유성우</h2>
      <div class="row-select"><label for="showerSel" class="sr-only">유성우 선택</label><select id="showerSel">${opts}</select><button class="btn small" type="button" id="goPeak">극대일로 이동</button></div>
      <div class="facts">
        <div class="fact"><span>극대</span><b>${formatDate(sh.peak, { weekday: false })}</b><small>${formatTime(sh.peak)}</small></div>
        <div class="fact"><span>ZHR (이상적 조건)</span><b>${sh.zhr}개/시</b><small>속도 ${sh.speed}km/s</small></div>
        <div class="fact"><span>복사점</span><b>${escapeHtml(astro.constellationKo(sh.ra, sh.dec))}</b><small>적경 ${sh.ra.toFixed(1)}h · 적위 ${sh.dec}°</small></div>
      </div>
      <p class="hint">다가오는 유성우: ${up.map((u) => `${escapeHtml(u.name)} ${formatDate(u.peak, { weekday: false })}`).join(' · ')}</p>`;
    $('showerSel').addEventListener('change', (e) => { state.shower = e.target.value; recompute(); });
    $('goPeak').addEventListener('click', () => {
      state.date = astro.currentNightDateStr(new Date(sh.peak.getTime()));
      recompute();
    });
    return;
  }
  if (t === 'planets') {
    const fp = featuredPlanet();
    el.innerHTML = `<h2>행성 (눌러서 대상 바꾸기)</h2>
      <div class="table-wrap"><table><thead><tr><th>행성</th><th>잘 보일 때</th><th>방향</th><th>고도</th><th>밝기</th><th>별자리</th></tr></thead><tbody>
      ${analysis.planets.map((p) => `<tr class="${p.visible ? 'pick' : 'dim'} ${fp && fp.body === p.body ? 'selected' : ''}" data-planet="${p.body}" ${p.visible ? 'tabindex="0"' : ''}>
        <td><span style="color:${p.color}">●</span> ${p.name}</td>
        <td class="num">${p.visible ? formatNightTime(p.t, s) : '안 보임'}</td>
        <td>${p.visible ? `${azimuthName(p.az)} <span class="num">${Math.round(p.az)}°</span>` : '—'}</td>
        <td class="num">${p.alt != null ? Math.round(p.alt) + '°' : '—'}</td>
        <td class="num">${p.mag != null ? p.mag.toFixed(1) : '—'}</td>
        <td>${p.constellation || '—'}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="hint">등급은 숫자가 작을수록 밝아요. 금성 −4, 목성 −2 정도면 박명 속에서도 쉽게 보여요.</p>`;
    el.querySelectorAll('tr.pick').forEach((tr) => {
      const pick = () => { state.planet = tr.dataset.planet; state.selected = bestTime(); state.userTime = false; renderAll(); };
      tr.addEventListener('click', pick);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    });
    return;
  }
  if (t === 'startrails') {
    const p = astro.nearestSample(night, state.selected).polaris;
    el.innerHTML = `<h2>방향별 별궤적 모양</h2>
      <div class="facts">
        <div class="fact"><span>${southern() ? '천구 남극' : '북극성'}</span><b>${southern() ? '남' : '북'} ${Math.abs(state.lat).toFixed(0)}°</b><small>${southern() ? '' : `방위 ${Math.round(p.az)}° · 고도 ${Math.round(p.alt)}°`}</small></div>
        <div class="fact"><span>${southern() ? '남쪽' : '북쪽'}</span><b>동심원</b><small>극 주위를 도는 원</small></div>
        <div class="fact"><span>동쪽 · 서쪽</span><b>사선</b><small>떠오르거나 지는 별</small></div>
        <div class="fact"><span>${southern() ? '북쪽' : '남쪽'}</span><b>완만한 호</b><small>천구 적도 부근</small></div>
      </div>
      <p class="hint">별은 한 시간에 15°씩 돌아요. 2시간이면 30°짜리 호가 생겨요.</p>`;
    return;
  }
  const e = night.events;
  el.innerHTML = `<h2>빛의 시간표</h2>
    <div class="facts">
      <div class="fact"><span>골든아워</span><b>${formatTime(e.goldenStart)}</b><small>일몰 ${formatTime(e.sunset)}까지</small></div>
      <div class="fact"><span>저녁 블루아워</span><b>${formatTime(e.blueStart)}</b><small>${formatTime(e.civilDusk)}까지</small></div>
      <div class="fact"><span>새벽 블루아워</span><b>${formatTime(e.civilDawn)}</b><small>${formatTime(e.blueEnd)}까지</small></div>
      <div class="fact"><span>일출</span><b>${formatTime(e.sunrise)}</b><small>골든아워 ${formatTime(e.goldenEnd)}까지</small></div>
    </div>
    <p class="hint">블루아워는 몇십 분이면 끝나요. 도착해서 구도를 미리 잡아 두고 시작 시각에 맞춰 연속으로 찍으세요.</p>`;
}

/* 30일 달력 */
function scheduleScan() {
  const fromDate = astro.currentNightDateStr();
  const key = `${state.lat.toFixed(2)},${state.lon.toFixed(2)},${fromDate}`;
  if (scan.key === key && scan.rows) { renderCalendar(); return; }
  scan = { key, rows: null };
  renderCalendar();
  setTimeout(() => {
    if (scan.key !== key) return;
    scan.rows = astro.scanNights({ lat: state.lat, lon: state.lon, fromDate, count: 30 });
    renderCalendar();
  }, 60);
}

function renderCalendar() {
  const el = $('calStrip');
  if (!scan.rows) {
    el.innerHTML = `<p class="hint">${scan.key ? '날짜별 조건을 계산하는 중…' : '이 페이지를 열면 날짜별 조건을 계산해요.'}</p>`;
    return;
  }
  const t = state.target;
  const metric = {
    milkyway: [(r) => r.core || r.band * 0.6, 300, '은하수 + 달 없는 어둠'],
    moon: [(r) => r.moon.illum * 100, 100, '달 밝기'],
    startrails: [(r) => r.moonless, 600, '달 없는 어두운 시간'],
    meteor: [(r) => r.moonless, 600, '달 없는 어두운 시간'],
    planets: [(r) => r.moonless, 600, '달 없는 어두운 시간'],
    city: [(r) => r.moon.illum * 100, 100, '달 밝기'],
  }[t];
  const [fn, max, legend] = metric;
  $('calLegend').textContent = `막대: ${legend}`;
  $('calTitle').textContent = t === 'milkyway' ? '은하수 좋은 날 (30일)' : t === 'moon' ? '달 위상 (30일)' : '앞으로 30일';
  const peaks = t === 'meteor' ? astro.upcomingShowers(new Date(), 6) : [];
  el.innerHTML = scan.rows.map((r) => {
    const v = fn(r);
    const pct = Math.max(0, Math.min(1, v / max));
    const d = r.start;
    const dow = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    const peak = peaks.find((p) => astro.currentNightDateStr(p.peak) === r.date);
    const val = t === 'moon' || t === 'city' ? `${Math.round(v)}%` : v >= 60 ? `${(v / 60).toFixed(v >= 600 ? 0 : 1)}h` : v > 0 ? `${Math.round(v)}m` : '–';
    return `<button type="button" class="cal-day" data-date="${r.date}" aria-pressed="${r.date === state.date}" title="${formatDate(d)} 밤">
      <span class="dow ${d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : ''}">${dow}</span>
      <span class="dnum">${d.getDate() === 1 || r === scan.rows[0] ? `${d.getMonth() + 1}/` : ''}${d.getDate()}</span>
      <svg viewBox="-10 -10 20 20" aria-hidden="true"><circle r="9" fill="#1a2133"/><path d="${moonPhasePath(r.moon.phase, 9, southern())}" fill="var(--moon)"/></svg>
      <span class="cal-bar"><i style="height:${(pct * 100).toFixed(0)}%; ${t === 'moon' || t === 'city' ? 'background:var(--moon)' : ''}"></i></span>
      <span class="val">${val}</span>
      ${peak ? `<span class="peak">★${escapeHtml(peak.name.replace(/자리.*$/, ''))}</span>` : ''}
    </button>`;
  }).join('');
  el.querySelectorAll('.cal-day').forEach((b) => b.addEventListener('click', () => {
    state.date = b.dataset.date;
    recompute();
  }));
}

/* 체크리스트 */
const GEAR_COMMON = ['튼튼한 삼각대', '릴리즈 또는 인터벌 타이머', '여분 배터리 (추위에 빨리 닳아요)', '적색 헤드랜턴 (눈의 암적응 유지)', '렌즈 히터·핫팩 (이슬 방지)', '방한복·핫팩'];
const GEAR = {
  milkyway: ['14~24mm f/2.8 이하 밝은 광각 렌즈', '빛 공해 지도에서 고른 어두운 장소'],
  moon: ['300mm 이상 망원 렌즈 (크롭 바디면 유리)', '셔터 진동을 줄일 릴리즈'],
  startrails: ['대용량 메모리카드 (RAW 200장 ≈ 6GB)', '외부 전원 또는 배터리 그립'],
  meteor: ['돗자리·캠핑 의자 (몇 시간 대기)', '대용량 메모리카드'],
  planets: ['망원 렌즈 또는 망원경 + T링 어댑터', '동영상 스태킹 프로그램 (AutoStakkert 등)'],
  city: ['ND 필터 (차량 궤적)', '렌즈 후드 (플레어 방지)'],
};
const STEPS = {
  default: [
    '해 지기 전에 도착해 밝을 때 구도와 발 디딜 곳을 확인하세요.',
    'RAW, 수동(M) 모드, 손떨림 보정 OFF, 2초 타이머로 맞추세요.',
    'MF로 바꾸고 라이브뷰를 10배 확대해 밝은 별이 가장 작은 점이 되는 곳에 초점을 맞춘 뒤 테이프로 고정하세요.',
    '위 설정으로 테스트 컷을 찍고, 히스토그램 산이 왼쪽에서 1/3 지점에 오도록 ISO를 조정하세요.',
    '화면 밝기를 최저로 낮추고 적색 모드를 켜 둔 채 본 촬영을 하세요.',
  ],
  moon: [
    'ISO 100, 조리개 f/8 안팎, 수동(M) 모드로 맞추세요.',
    '라이브뷰로 달을 10배 확대해 가장자리(크레이터 경계)가 가장 또렷한 곳에 MF로 초점을 맞추세요.',
    '2초 타이머·전자 선막으로 진동을 줄이고 손떨림 보정은 끄세요.',
    '하이라이트 경고(점멸)가 생기지 않을 만큼 셔터를 조정하고, 여러 장 찍어 가장 선명한 컷을 고르세요.',
  ],
  city: [
    '블루아워 30분 전에 도착해 구도를 잡으세요.',
    'ISO 100, f/8~11, 수동(M) 또는 조리개 우선(A)으로 맞추세요.',
    'AF로 초점을 잡은 뒤 MF로 바꿔 고정하세요.',
    '하늘이 어두워지면서 노출이 길어지니 몇 분마다 셔터를 다시 맞추고 브라케팅하세요.',
  ],
};

function renderChecklist() {
  $('gearList').innerHTML = [...(GEAR[state.target] || []), ...(state.target === 'city' ? GEAR_COMMON.slice(0, 2) : GEAR_COMMON)]
    .map((g) => `<li>${escapeHtml(g)}</li>`).join('');
  const steps = STEPS[state.target] || STEPS.default;
  $('stepList').innerHTML = steps.map((g) => `<li>${escapeHtml(g)}</li>`).join('');
}

/* 시간 슬라이더 */
function setupSlider() {
  const sl = $('timeSlider');
  const span = Math.round((night.chartRange.to - night.chartRange.from) / astro.MINUTE);
  sl.min = '0';
  sl.max = String(span);
  sl.step = '5';
}
function syncSlider() {
  const sl = $('timeSlider');
  sl.value = String(Math.round((state.selected - night.chartRange.from) / astro.MINUTE));
  $('timeOut').textContent = formatTime(state.selected);
  const nextDay = state.selected.getDate() !== night.start.getDate();
  $('timeDay').textContent = nextDay ? `${state.selected.getMonth() + 1}/${state.selected.getDate()} 새벽` : `${state.selected.getMonth() + 1}/${state.selected.getDate()} 저녁`;
}

let raf = 0;
function setSelected(date) {
  state.selected = date;
  state.userTime = true;
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => renderTimeDependent());
}

/* 날씨: 위치가 정해질 때(준비 페이지)만 받는다. 받은 예보는 기기에 저장해 3시간 동안 다시 쓴다 */
function readWeatherCache() {
  try {
    const c = JSON.parse(localStorage.getItem(WEATHER_KEY));
    const rows = c && unpackRows(c.data);
    return rows && rows.length ? { lat: c.lat, lon: c.lon, at: c.at, rows } : null;
  } catch {
    return null;
  }
}

function writeWeatherCache(w) {
  try {
    localStorage.setItem(WEATHER_KEY, JSON.stringify({ lat: w.lat, lon: w.lon, at: w.at, data: packRows(w.rows) }));
  } catch { /* 저장 공간이 없으면 이번 세션만 쓴다 */ }
}

let weatherRequest = 0;
async function ensureWeather({ force = false } = {}) {
  const here = { lat: state.lat, lon: state.lon };
  const cached = weather.rows && isNearby(weather, here) ? weather : readWeatherCache();
  const usable = cached && isNearby(cached, here) ? cached : null;
  if (usable) {
    weather = { ...usable, status: 'ok', error: null };
    if (!force && Date.now() - usable.at < WEATHER_TTL_MS) { onWeatherChanged(); return; }
  } else {
    weather = { ...here, at: 0, rows: null, status: 'idle', error: null };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    weather.status = usable ? 'stale' : 'offline';
    onWeatherChanged();
    return;
  }
  const req = ++weatherRequest;
  weather.status = 'loading';
  renderWeatherStatus();
  try {
    const rows = await fetchWeather(here.lat, here.lon);
    if (req !== weatherRequest) return;
    weather = { ...here, at: Date.now(), rows, status: 'ok', error: null };
    writeWeatherCache(weather);
  } catch (err) {
    if (req !== weatherRequest) return;
    weather = usable ? { ...usable, status: 'stale', error: err.message } : { ...here, at: 0, rows: null, status: 'error', error: err.message };
  }
  onWeatherChanged();
}

function onWeatherChanged() {
  renderWeatherStatus();
  if (!night) return;
  renderVerdict();
  renderTimelinePanel();
  renderWeatherInfo();
}

function ago(ms) {
  const min = Math.max(0, Math.round((Date.now() - ms) / astro.MINUTE));
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  return `${Math.round(min / 60)}시간 전`;
}

function renderWeatherStatus() {
  const el = $('wxStatus');
  const btn = $('wxRefresh');
  btn.disabled = weather.status === 'loading';
  const got = weather.at ? `${formatTime(new Date(weather.at))}에 받은 예보 (${ago(weather.at)})` : '';
  const wx = nightWeather();
  const tonight = wx ? ` · 이 날 밤 구름 <b>${Math.round(wx.cloud)}%</b> ${escapeHtml(wx.sky)}` : weather.rows ? ' · 고른 날짜는 예보 범위(16일) 밖이에요' : '';
  const msg = {
    idle: state.locSource === 'default' ? '위치를 정하면 그곳의 예보를 받아요.' : '아직 받지 않았어요.',
    loading: '예보를 받는 중…',
    ok: `${got}${tonight}`,
    stale: `새로 받지 못해 저장된 예보를 써요. ${got}${tonight}`,
    offline: '오프라인이에요. 인터넷이 될 때 ‘예보 다시 받기’를 누르세요. 천문 계산은 그대로 돼요.',
    error: '예보를 받지 못했어요. 인터넷 연결을 확인하고 다시 받아 보세요. 천문 계산은 그대로 돼요.',
  }[weather.status];
  el.innerHTML = msg;
}

function renderWeatherInfo() {
  const el = $('weatherInfo');
  const badge = $('weatherBadge');
  const wx = nightWeather();
  if (!wx) {
    badge.textContent = weather.status === 'loading' ? '날씨 불러오는 중…' : '';
    el.textContent = weather.rows
      ? '이 날짜는 날씨 예보 범위(16일) 밖이에요.'
      : weather.status === 'loading' ? '' : '날씨 예보가 없어요. 준비 페이지에서 받을 수 있어요. 천문 계산은 그대로 돼요.';
    return;
  }
  badge.textContent = `구름 ${Math.round(wx.cloud)}% · ${wx.sky}`;
  const bits = [`밤 동안 평균 구름 ${Math.round(wx.cloud)}%`, `최저 ${Math.round(wx.minTemp)}°C`, `습도 ${Math.round(wx.rh)}%`, `최대 풍속 ${wx.maxWind.toFixed(1)}m/s`];
  if (wx.dewRisk) bits.push('기온과 이슬점이 가까워 렌즈에 이슬이 맺히기 쉬워요. 렌즈 히터를 챙기세요');
  el.textContent = `${bits.join(' · ')}. (Open-Meteo 예보, ${ago(weather.at)} 받음)`;
}

/* 페이지 넘기기 */
const PAGE = { setup: 0, settings: 1, sky: 2, tonight: 3, ref: 4 };
let currentPage = 0;

function pageCount() {
  return $('pager').children.length;
}

function goToPage(i, { smooth = true } = {}) {
  const pager = $('pager');
  const idx = Math.max(0, Math.min(pageCount() - 1, i));
  pager.scrollTo({ left: idx * pager.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
  setPage(idx);
}

function setPage(i) {
  const changed = i !== currentPage;
  currentPage = i;
  document.querySelectorAll('#pageTabs button').forEach((b) => {
    if (Number(b.dataset.goto) === i) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  $('timebar').hidden = i === PAGE.setup || i === PAGE.ref;
  if (!changed) return;
  if (i === PAGE.tonight) scheduleScan();
  if (i === PAGE.sky) skyMap.render();
}

/* ───────────── 이벤트 ───────────── */

function bind() {
  document.querySelectorAll('.targets button').forEach((b) => b.addEventListener('click', () => {
    state.target = b.dataset.target;
    saveState();
    state.selected = bestTime();
    state.userTime = false;
    skyMap.userPanned = false;
    renderAll();
  }));

  $('timeSlider').addEventListener('input', (e) => {
    setSelected(new Date(night.chartRange.from.getTime() + Number(e.target.value) * astro.MINUTE));
  });
  $('bestTime').addEventListener('click', () => { state.selected = bestTime(); state.userTime = false; renderTimeDependent(); });
  $('nowTime').addEventListener('click', () => {
    const now = new Date();
    const nd = astro.currentNightDateStr(now);
    if (nd !== state.date) { state.date = nd; recompute(); }
    if (now >= night.chartRange.from && now <= night.chartRange.to) setSelected(now);
  });

  const tl = $('timeline');
  let dragging = false;
  tl.addEventListener('pointerdown', (e) => { dragging = true; tl.setPointerCapture(e.pointerId); if (timelineApi) setSelected(timelineApi.timeAt(e.clientX)); });
  tl.addEventListener('pointermove', (e) => { if (dragging && timelineApi) setSelected(timelineApi.timeAt(e.clientX)); });
  tl.addEventListener('pointerup', () => { dragging = false; });
  tl.addEventListener('pointercancel', () => { dragging = false; });

  $('gpsBtn').addEventListener('click', locate);
  const onCoord = () => {
    const lat = Number($('lat').value);
    const lon = Number($('lon').value);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      $('gpsStatus').textContent = '위도는 −90~90, 경도는 −180~180 사이 숫자로 입력하세요.';
      return;
    }
    setLocation(lat, lon, 'manual', '');
  };
  $('lat').addEventListener('change', onCoord);
  $('lon').addEventListener('change', onCoord);
  $('places').addEventListener('change', (e) => {
    const p = state.places[Number(e.target.value)];
    if (p) setLocation(p.lat, p.lon, 'place', p.name);
  });
  $('savePlace').addEventListener('click', () => {
    const name = $('placeName').value.trim() || formatCoord(state.lat, state.lon);
    state.places = [{ name, lat: state.lat, lon: state.lon }, ...state.places.filter((p) => p.name !== name)].slice(0, 12);
    state.placeName = name;
    $('placeName').value = '';
    saveState();
    renderContext();
    $('gpsStatus').textContent = `‘${name}’을(를) 저장했어요.`;
  });
  $('date').addEventListener('change', (e) => {
    if (!e.target.value) return;
    state.date = e.target.value;
    recompute();
  });
  $('bortle').innerHTML = Object.entries(cam.BORTLE_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  $('bortle').addEventListener('change', (e) => { state.bortle = Number(e.target.value); saveState(); renderAll(); });
  $('sensor').innerHTML = Object.entries(cam.SENSORS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  $('sensor').addEventListener('change', (e) => { state.sensor = e.target.value; saveState(); renderAll(); });
  const numInput = (id, apply, min, max) => $(id).addEventListener('change', (e) => {
    const v = Number(e.target.value);
    if (!Number.isFinite(v) || v < min || v > max) { renderContext(); return; }
    apply(v);
    saveState();
    renderAll();
  });
  numInput('mp', (v) => { state.mp = v; }, 5, 120);
  numInput('focal', (v) => { state.lenses[state.target] = { ...lens(), focal: v }; }, 8, 2000);
  numInput('aperture', (v) => { state.lenses[state.target] = { ...lens(), maxAperture: v }; }, 0.95, 16);
  $('declination').addEventListener('change', (e) => {
    const v = Number(e.target.value);
    state.declination = Number.isFinite(v) && e.target.value !== '' ? v : null;
    saveState();
    renderDirection();
  });

  document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
    state.skyMode = b.dataset.mode;
    saveState();
    skyMap.setMode(state.skyMode);
    renderContext();
  }));
  $('recenter').addEventListener('click', () => skyMap.recenter());

  $('nightVision').addEventListener('click', () => {
    state.screenMode = SCREEN_MODES[state.screenMode]?.next || 'red';
    applyNightVision();
    saveState();
  });

  const cbtn = $('compassBtn');
  if (!compassSupported()) cbtn.hidden = true;
  cbtn.addEventListener('click', async () => {
    if (compass.active) {
      compass.stop();
      heading = null;
      cbtn.setAttribute('aria-pressed', 'false');
      cbtn.textContent = '실시간 나침반';
      renderDirection();
      return;
    }
    try {
      await compass.start();
      cbtn.setAttribute('aria-pressed', 'true');
      cbtn.textContent = '나침반 끄기';
      $('dirLive').hidden = false;
      $('dirLive').textContent = '휴대폰을 평평하게 들고 천천히 돌려 보세요…';
    } catch (err) {
      $('dirLive').hidden = false;
      $('dirLive').textContent = err.message;
    }
  });

  const pager = $('pager');
  let pageRaf = 0;
  pager.addEventListener('scroll', () => {
    cancelAnimationFrame(pageRaf);
    pageRaf = requestAnimationFrame(() => {
      const i = Math.round(pager.scrollLeft / Math.max(1, pager.clientWidth));
      if (i !== currentPage) setPage(i);
    });
  }, { passive: true });
  document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => goToPage(Number(b.dataset.goto))));
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.target.closest && e.target.closest('input, select, textarea, [contenteditable]')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); goToPage(currentPage + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); goToPage(currentPage - 1); }
  });
  $('wxRefresh').addEventListener('click', () => ensureWeather({ force: true }));

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      pager.scrollTo({ left: currentPage * pager.clientWidth, behavior: 'auto' });
      skyMap.render();
      renderTimelinePanel();
    }, 120);
  });
}

// 버튼을 누를 때마다 기본 → 적색 → 녹색 → 기본
const SCREEN_MODES = {
  normal: { next: 'red', label: '적색 모드', title: '누르면 적색 화면으로 바뀌어요 (눈의 암적응 유지)' },
  red: { next: 'green', label: '적색 모드', title: '적색 화면 사용 중 · 누르면 녹색 화면으로 바뀌어요' },
  green: { next: 'normal', label: '녹색 모드', title: '녹색 화면 사용 중 · 누르면 기본 화면으로 돌아가요' },
};

function applyNightVision() {
  if (!SCREEN_MODES[state.screenMode]) state.screenMode = 'normal';
  const mode = SCREEN_MODES[state.screenMode];
  const root = document.documentElement.classList;
  root.toggle('nv-red', state.screenMode === 'red');
  root.toggle('nv-green', state.screenMode === 'green');
  const btn = $('nightVision');
  btn.dataset.mode = state.screenMode;
  btn.setAttribute('aria-pressed', String(state.screenMode !== 'normal'));
  btn.title = mode.title;
  btn.querySelector('span').textContent = mode.label;
}

function setLocation(lat, lon, source, name) {
  state.lat = Math.round(lat * 10000) / 10000;
  state.lon = Math.round(lon * 10000) / 10000;
  state.locSource = source;
  state.placeName = name;
  saveState();
  recompute();
  ensureWeather();
}

function locate() {
  const status = $('gpsStatus');
  if (!('geolocation' in navigator)) {
    status.textContent = '이 브라우저는 위치 기능을 지원하지 않아요. 좌표를 직접 입력하세요.';
    return;
  }
  const btn = $('gpsBtn');
  btn.disabled = true;
  status.textContent = '위치를 찾는 중… (야외에서 더 정확해요)';
  navigator.geolocation.getCurrentPosition((pos) => {
    btn.disabled = false;
    const { latitude, longitude, accuracy } = pos.coords;
    status.textContent = `현재 위치를 찾았어요 (정확도 약 ${Math.round(accuracy)}m).`;
    setLocation(latitude, longitude, 'gps', '현재 위치');
  }, (err) => {
    btn.disabled = false;
    const msg = {
      1: '위치 권한이 거부됐어요. 브라우저 설정에서 이 사이트의 위치 접근을 허용하거나 좌표를 직접 입력하세요.',
      2: '위치를 확인할 수 없어요. 하늘이 트인 곳에서 다시 시도하거나 좌표를 직접 입력하세요.',
      3: '위치 확인 시간이 초과됐어요. 다시 시도해 주세요.',
    }[err.code] || '위치를 가져오지 못했어요.';
    status.textContent = msg;
  }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 5 * 60 * 1000 });
}

function init() {
  if (!globalThis.Astronomy) {
    $('verdict').innerHTML = '<p>천문 계산 라이브러리를 불러오지 못했어요. 새로고침해 주세요.</p>';
    return;
  }
  bind();
  skyMap.mode = state.skyMode;
  applyNightVision();
  setPage(PAGE.setup);
  recompute();
  // 예시 위치(서울)로는 예보를 받지 않는다. 위치를 정하면 그때 받는다
  if (state.locSource !== 'default') ensureWeather();
  else renderWeatherStatus();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
