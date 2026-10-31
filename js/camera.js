// 카메라 설정 계산기 — 순수 함수만 둔다 (DOM·천문 라이브러리 의존 없음)

export const SENSORS = {
  ff: { label: '풀프레임', w: 36, h: 24, crop: 1 },
  apsc: { label: 'APS-C (1.5x)', w: 23.5, h: 15.6, crop: 1.53 },
  apscC: { label: 'APS-C 캐논 (1.6x)', w: 22.3, h: 14.9, crop: 1.61 },
  mft: { label: '마이크로포서드 (2x)', w: 17.3, h: 13.0, crop: 2 },
  one: { label: '1인치 (2.7x)', w: 13.2, h: 8.8, crop: 2.72 },
};

export const ISO_STEPS = [
  100, 125, 160, 200, 250, 320, 400, 500, 640, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6400,
  8000, 10000, 12800, 16000, 20000, 25600,
];
export const SHUTTER_STEPS = [
  30, 25, 20, 15, 13, 10, 8, 6, 5, 4, 3.2, 2.5, 2, 1.6, 1.3, 1, 0.8, 0.6, 0.5, 0.4, 0.3,
  1 / 4, 1 / 5, 1 / 6, 1 / 8, 1 / 10, 1 / 13, 1 / 15, 1 / 20, 1 / 25, 1 / 30, 1 / 40, 1 / 50, 1 / 60, 1 / 80,
  1 / 100, 1 / 125, 1 / 160, 1 / 200, 1 / 250, 1 / 320, 1 / 400, 1 / 500, 1 / 640, 1 / 800, 1 / 1000,
  1 / 1250, 1 / 1600, 1 / 2000, 1 / 2500, 1 / 3200, 1 / 4000,
];
export const APERTURES = [
  1, 1.1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.5, 2.8, 3.2, 3.5, 4, 4.5, 5, 5.6, 6.3, 7.1, 8, 9, 10, 11, 13, 14, 16,
  18, 22,
];

/** 보틀 등급별 '달 없는 밤' 목표 노출 (EV100) — 은하수 기준 */
export const DARK_SKY_EV = { 1: -6.6, 2: -6.5, 3: -6.3, 4: -6.0, 5: -5.6, 6: -5.1, 7: -4.6, 8: -4.1, 9: -3.8 };

export const BORTLE_LABELS = {
  1: '1 · 최상급 암흑 (천문대, 오지)',
  2: '2 · 매우 어두움 (국제밤하늘공원급)',
  3: '3 · 시골 하늘',
  4: '4 · 시골·교외 경계',
  5: '5 · 교외',
  6: '6 · 밝은 교외',
  7: '7 · 도시 근교',
  8: '8 · 도시',
  9: '9 · 도심',
};

const log2 = Math.log2;
const nearestLog = (arr, v) => arr.reduce((best, x) => (Math.abs(Math.log(x / v)) < Math.abs(Math.log(best / v)) ? x : best));

export const roundISO = (v) => nearestLog(ISO_STEPS, Math.max(100, Math.min(25600, v)));
export const roundAperture = (v) => nearestLog(APERTURES, v);

/** v 이하인 가장 긴 표준 셔터속도 (30초 초과는 벌브 초 단위) */
export function floorShutter(v) {
  if (v > 30) return Math.round(v);
  for (const s of SHUTTER_STEPS) if (s <= v * 1.02) return s;
  return SHUTTER_STEPS[SHUTTER_STEPS.length - 1];
}
export function nearestShutter(v) {
  if (v > 30) return Math.round(v);
  return nearestLog(SHUTTER_STEPS, v);
}

export function formatShutter(t) {
  if (t >= 0.3) {
    const s = t >= 10 ? String(Math.round(t)) : String(Math.round(t * 10) / 10);
    return `${s}″`;
  }
  return `1/${Math.round(1 / t)}`;
}

export const formatAperture = (n) => `f/${n}`;

export function sensorOf(id) {
  return SENSORS[id] || SENSORS.ff;
}

/** 화소 피치 (µm) */
export function pixelPitch(sensor, mp) {
  const widthPx = Math.sqrt(mp * 1e6 * (sensor.w / sensor.h));
  return (sensor.w * 1000) / widthPx;
}

/** NPF 규칙 (간이식): 별이 점으로 남는 최대 노출 시간 */
export function npfSeconds(aperture, pitchUm, focal) {
  return (35 * aperture + 30 * pitchUm) / focal;
}

export function rule500(focal, crop) {
  return 500 / (focal * crop);
}

export function fieldOfView(sensor, focal) {
  const h = (2 * Math.atan(sensor.w / (2 * focal)) * 180) / Math.PI;
  const v = (2 * Math.atan(sensor.h / (2 * focal)) * 180) / Math.PI;
  return { h, v };
}

/** 노출 계산: ISO = 100 · N² / (t · 2^EV) */
export const isoFor = (n, t, ev) => (100 * n * n) / (t * Math.pow(2, ev));
export const shutterFor = (n, iso, ev) => (n * n) / (Math.pow(2, ev) * (iso / 100));
export const evOf = (n, t, iso) => log2((n * n) / t) - log2(iso / 100);

/** 밝은 렌즈는 코마수차를 줄이려 조금 조인다 */
export function wideAperture(maxAperture) {
  if (maxAperture < 1.4) return roundAperture(Math.max(maxAperture * 1.41, 1.8));
  if (maxAperture < 1.8) return 2;
  return maxAperture;
}

/* ───── 장면 밝기 (EV100) ───── */

export function moonLightEV(moonAlt, moonMag) {
  if (moonAlt <= -0.5 || moonMag == null) return -Infinity;
  const sinAlt = Math.max(Math.sin((Math.max(moonAlt, 0.5) * Math.PI) / 180), 0.02);
  return -3 - 1.33 * (moonMag + 12.7) + log2(sinAlt);
}

export function twilightEV(sunAlt) {
  if (sunAlt <= -18) return -Infinity;
  if (sunAlt >= 0) return 9;
  return -6.5 + (sunAlt + 18) * 0.75;
}

export const combineEV = (...evs) => {
  const sum = evs.reduce((s, ev) => s + (Number.isFinite(ev) ? Math.pow(2, ev) : 0), 0);
  return log2(sum);
};

export function sceneEV({ bortle, sky }) {
  const dark = DARK_SKY_EV[bortle] ?? -6;
  const moon = moonLightEV(sky.moonAlt, sky.moonMag);
  const sun = twilightEV(sky.sunAlt);
  const value = combineEV(dark, moon, sun);
  const reasons = [`광해 보틀 ${bortle}`];
  if (Number.isFinite(moon) && moon > dark - 1.5) reasons.push(`달빛 (조도 ${Math.round(sky.moonIllum * 100)}%)`);
  else reasons.push('달빛 영향 없음');
  if (Number.isFinite(sun) && sun > dark - 1.5) reasons.push('박명으로 하늘이 밝음');
  return { value, dark, moon, sun, reasons };
}

const evNote = (ev) => `목표 노출 EV100 ${ev.value.toFixed(1)} · ${ev.reasons.join(' · ')}`;

/* ───── 대상별 설정 ───── */

export const TARGETS = {
  milkyway: { label: '은하수', lens: { focal: 20, maxAperture: 2.8 } },
  moon: { label: '달', lens: { focal: 400, maxAperture: 5.6 } },
  startrails: { label: '별궤적', lens: { focal: 16, maxAperture: 4 } },
  meteor: { label: '유성우', lens: { focal: 14, maxAperture: 2.8 } },
  planets: { label: '행성', lens: { focal: 24, maxAperture: 2.8 } },
  city: { label: '도시 야경', lens: { focal: 24, maxAperture: 4 } },
};

function starfieldBase(ctx, { evShift = 0, maxT = 30, minT = 0 } = {}) {
  const sensor = sensorOf(ctx.gear.sensor);
  const pitch = pixelPitch(sensor, ctx.gear.mp);
  const n = wideAperture(ctx.gear.maxAperture);
  const npf = npfSeconds(n, pitch, ctx.gear.focal);
  const r500 = rule500(ctx.gear.focal, sensor.crop);
  const t = floorShutter(Math.max(minT, Math.min(npf, maxT)));
  const ev = sceneEV(ctx);
  const target = ev.value + evShift;
  const rawIso = isoFor(n, t, target);
  return { sensor, pitch, n, npf, r500, t, ev, target, rawIso, iso: roundISO(rawIso) };
}

function whiteBalanceNight(ctx, moonBright) {
  if (moonBright) return 4500;
  return ctx.bortle >= 6 ? 3600 : 4000;
}

export function milkyWaySettings(ctx) {
  const b = starfieldBase(ctx);
  const moonBright = Number.isFinite(b.ev.moon) && b.ev.moon > b.ev.dark;
  const warnings = [];
  const tips = [];
  if (ctx.gear.focal > 35) warnings.push(`${ctx.gear.focal}mm는 별이 빨리 흘러요. 14~24mm 광각을 쓰거나 적도의(트래커)를 쓰세요.`);
  if (b.rawIso > 25600) warnings.push('최대 ISO로도 노출이 부족해요. 더 밝은 렌즈나 트래커가 필요해요.');
  if (b.iso >= 8000) tips.push('ISO가 높아 노이즈가 많아요. 같은 설정으로 10~20장 찍어 스태킹(Sequator 등)하면 깨끗해져요.');
  if (moonBright) warnings.push('달빛이 밝아 은하수가 흐려요. 달이 진 뒤나 달 없는 날을 고르세요.');
  if (ctx.sky.sunAlt > -18) warnings.push('아직 박명이 남아 하늘이 밝아요. 천문박명이 끝난 뒤가 가장 좋아요.');

  const t500 = floorShutter(Math.min(b.r500, 30));
  const iso500 = roundISO(isoFor(b.n, t500, b.target));
  const isoTracker = roundISO(isoFor(b.n, 120, b.target));
  return {
    mode: '광각 별사진',
    iso: b.iso, aperture: b.n, shutter: b.t, wb: whiteBalanceNight(ctx, moonBright),
    focus: 'MF · 밝은 별 확대 초점',
    basis: [
      `별이 점으로 찍히는 최대 노출: NPF ${b.npf.toFixed(1)}초 (500 법칙 ${b.r500.toFixed(0)}초) · 화소 피치 ${b.pitch.toFixed(1)}µm`,
      evNote(b.ev),
    ],
    alternatives: [
      { label: '별 점상 우선 (NPF)', iso: b.iso, aperture: b.n, shutter: b.t, note: '확대해도 별이 둥글게' },
      { label: '노이즈 우선 (500 법칙)', iso: iso500, aperture: b.n, shutter: t500, note: '웹·SNS용, 별이 살짝 늘어남' },
      { label: '적도의(트래커) 사용', iso: isoTracker, aperture: b.n, shutter: 120, note: '하늘만 추적, 지상은 따로 찍어 합성' },
    ],
    warnings, tips,
  };
}

export function starTrailSettings(ctx, { durationMin = 90 } = {}) {
  const sensor = sensorOf(ctx.gear.sensor);
  const n = Math.max(ctx.gear.maxAperture, 2.8);
  const t = 30;
  const ev = sceneEV(ctx);
  // 궤적 사진은 배경 하늘을 은하수보다 2~3스톱 어둡게 둬야 선이 또렷하다
  const target = Math.min(ev.value + 2.5, -1.5);
  const iso = roundISO(Math.min(3200, isoFor(n, t, target)));
  const frames = Math.round((durationMin * 60) / (t + 1));
  const arc = (durationMin / 60) * 15;
  const warnings = [];
  if (ctx.gear.focal > 35) warnings.push('별궤적은 14~24mm 광각이 원을 담기 좋아요.');
  return {
    mode: '인터벌 연속 촬영 + 비교(밝게) 합성',
    iso, aperture: roundAperture(n), shutter: t, wb: whiteBalanceNight(ctx, false),
    focus: 'MF · 밝은 별 확대 초점',
    sequence: `${t}초 × ${frames}장 · 간격 1초 · 총 ${durationMin}분 (궤적 길이 약 ${Math.round(arc)}°)`,
    basis: [
      `배경을 은하수보다 2.5스톱 어둡게: 목표 EV100 ${target.toFixed(1)}`,
      evNote(ev),
      `${sensor.label} ${ctx.gear.focal}mm 화각 ${fieldOfView(sensor, ctx.gear.focal).h.toFixed(0)}°`,
    ],
    alternatives: [
      { label: '인터벌 합성 (권장)', iso, aperture: roundAperture(n), shutter: t, note: `${frames}장을 StarStaX 등으로 합성` },
      { label: '한 장 장노출 (벌브)', iso: 100, aperture: 5.6, shutter: 1800, note: '광해가 적은 곳에서만, 30~60분' },
    ],
    warnings,
    tips: [
      '롱 익스포저 노이즈 감소(LENR)는 끄세요. 켜면 장 사이에 빈틈이 생겨요.',
      '추운 밤에는 배터리가 빨리 닳아요. 배터리 그립이나 보조 배터리를 준비하세요.',
    ],
  };
}

export function meteorSettings(ctx) {
  const b = starfieldBase(ctx, { maxT: 20, minT: 8 });
  const warnings = [];
  if (ctx.gear.focal > 28) warnings.push('유성은 어디서 떨어질지 몰라요. 14~20mm로 넓게 찍는 게 확률이 높아요.');
  if (Number.isFinite(b.ev.moon) && b.ev.moon > b.ev.dark) warnings.push('달빛 때문에 어두운 유성은 묻혀요.');
  return {
    mode: '연속 촬영 (인터벌)',
    iso: b.iso, aperture: b.n, shutter: b.t, wb: whiteBalanceNight(ctx, false),
    focus: 'MF · 밝은 별 확대 초점',
    sequence: `${formatShutter(b.t)} 노출을 간격 0~1초로 쉬지 않고 반복 · 극대 전후 2~3시간`,
    basis: [
      `유성은 순간이라 노출을 20초 안쪽으로 짧게: 배경 대비가 좋아져요 (NPF ${b.npf.toFixed(1)}초)`,
      evNote(b.ev),
    ],
    alternatives: [
      { label: '기본', iso: b.iso, aperture: b.n, shutter: b.t, note: '한 컷에 한두 개씩 잡히면 성공' },
      { label: '밝은 유성만', iso: roundISO(b.iso / 2), aperture: b.n, shutter: b.t, note: '노이즈 적게, 화구 노리기' },
    ],
    warnings,
    tips: ['찍은 컷 중 유성이 담긴 것만 골라 한 장으로 합성하면 유성우 사진이 돼요.'],
  };
}

/** 위상각(0=보름)·고도에 따른 달 표면 노출 (EV100) */
export function moonSurfaceEV(phaseAngle, moonAlt) {
  const phaseStops = Math.min(phaseAngle / 45, 3.8);
  const X = airmassSimple(moonAlt);
  const extinctionStops = (0.28 * (X - 1)) / 0.753;
  return 13.8 - phaseStops - extinctionStops;
}

function airmassSimple(alt) {
  if (alt <= 0) return 40;
  return 1 / (Math.sin((alt * Math.PI) / 180) + 0.50572 * Math.pow(alt + 6.07995, -1.6364));
}

export function moonSettings(ctx) {
  const sensor = sensorOf(ctx.gear.sensor);
  const focal = ctx.gear.focal;
  const sky = ctx.sky;
  const warnings = [];
  const tips = [];
  if (sky.moonAlt < 0) warnings.push('선택한 시각에는 달이 지평선 아래에 있어요.');

  if (focal < 100) {
    // 광각: 달이 있는 풍경 (박명이나 달빛 풍경)
    const ev = sceneEV(ctx);
    const n = Math.max(ctx.gear.maxAperture, 5.6);
    let iso = 400;
    let t = shutterFor(n, iso, ev.value);
    if (t > 25) { iso = roundISO(isoFor(n, 25, ev.value)); t = 25; }
    t = nearestShutter(t);
    tips.push('광각에서 달은 작은 점이에요. 월출·월몰 무렵 박명 시간에 찍으면 하늘과 달의 밝기가 비슷해 둘 다 살아나요.');
    tips.push('달 디테일까지 원하면 달 노출로 한 장 더 찍어 합성(HDR)하세요.');
    return {
      mode: '달이 있는 풍경 (광각)',
      iso, aperture: roundAperture(n), shutter: t, wb: 'AWB',
      focus: 'MF · 무한대 또는 풍경 과초점',
      basis: [evNote(ev), `달 겉보기 지름 ${sky.moonDiameter.toFixed(2)}° → ${focal}mm에서 프레임 높이의 ${moonFramePct(sensor, focal, sky.moonDiameter).toFixed(1)}%`],
      alternatives: [{ label: '풍경 노출', iso, aperture: roundAperture(n), shutter: t, note: '달은 하얗게 날아감' }],
      warnings, tips,
    };
  }

  const ev = moonSurfaceEV(sky.moonPhaseAngle, Math.max(sky.moonAlt, 1));
  let n = Math.max(ctx.gear.maxAperture, 8);
  if (n > 11 && ctx.gear.maxAperture <= 11) n = 11;
  n = roundAperture(n);
  // 일주운동으로 1.5픽셀 이상 번지지 않는 최대 셔터
  const pitch = pixelPitch(sensor, ctx.gear.mp);
  const pixelScale = (206.265 * pitch) / focal; // 각초/픽셀
  const tMax = (1.5 * pixelScale) / 14.5;
  let iso = 100;
  let t = shutterFor(n, iso, ev);
  if (t > tMax) {
    iso = roundISO(isoFor(n, tMax, ev));
    t = tMax;
    if (iso > 1600) {
      n = roundAperture(ctx.gear.maxAperture);
      iso = roundISO(isoFor(n, tMax, ev));
    }
  }
  t = floorShutter(t);
  const pct = moonFramePct(sensor, focal, sky.moonDiameter);
  if (sky.moonAlt < 15 && sky.moonAlt >= 0) tips.push('달이 낮아 대기 때문에 흐리고 붉어요. 노출을 1스톱 정도 더 주고 여러 장 찍어 가장 선명한 컷을 고르세요.');
  if (sky.moonIllum < 0.35) tips.push('초승·그믐달이면 어두운 부분의 지구조(地球照)도 찍어 보세요: ISO 800 · f/5.6 · 1~2초 (밝은 부분은 날아감).');
  if (sky.moonDistKm < 362000) tips.push(`오늘 달은 지구와 가까워요 (${Math.round(sky.moonDistKm).toLocaleString()}km, 슈퍼문급). 평소보다 약 ${Math.round((384400 / sky.moonDistKm - 1) * 100)}% 크게 보여요.`);
  return {
    mode: '망원 달 촬영',
    iso, aperture: n, shutter: t, wb: 5200,
    focus: 'MF · 라이브뷰 10배 확대, 달 가장자리',
    basis: [
      `달 표면 노출 EV100 ${ev.toFixed(1)} (보름 기준 13.8에서 위상·대기 감광 보정, Looney 11 규칙 응용)`,
      `일주운동 번짐 한계 ${formatShutter(tMax)} (${focal}mm, ${pixelScale.toFixed(2)}″/px)`,
      `달 크기: 프레임 높이의 ${pct.toFixed(0)}% (겉보기 지름 ${sky.moonDiameter.toFixed(2)}°)`,
    ],
    alternatives: [
      { label: '표준', iso, aperture: n, shutter: t, note: '밝은 면 디테일 살리기' },
      { label: '브라케팅 −1', iso, aperture: n, shutter: nearestShutter(t / 2), note: '하이라이트 보호' },
      { label: '브라케팅 +1', iso, aperture: n, shutter: nearestShutter(t * 2), note: '경계(명암 경계선) 강조' },
    ],
    warnings,
    tips: [...tips, '손떨림 보정은 끄고, 2초 타이머·전자 선막으로 셔터 진동을 줄이세요.'],
  };
}

export function moonFramePct(sensor, focal, diameterDeg) {
  const size = 2 * focal * Math.tan(((diameterDeg / 2) * Math.PI) / 180);
  return (size / sensor.h) * 100;
}

const PLANET_EV = { Venus: 15, Mercury: 13, Mars: 11.5, Jupiter: 11, Saturn: 9.5 };

export function planetSettings(ctx) {
  const p = ctx.planet;
  if (ctx.gear.focal < 200 || !p) {
    const s = milkyWaySettings(ctx);
    return {
      ...s,
      mode: '행성이 있는 별 풍경 (광각)',
      alternatives: s.alternatives.slice(0, 2),
      warnings: s.warnings.filter((w) => !w.includes('은하수')),
      tips: ['행성끼리, 또는 달과 행성이 가까이 붙는 날(근접)은 광각~표준 렌즈로 풍경과 함께 담기 좋아요.'],
    };
  }
  const sensor = sensorOf(ctx.gear.sensor);
  const ev = (PLANET_EV[p.body] ?? 11) - ((0.28 * (airmassSimple(Math.max(p.alt, 1)) - 1)) / 0.753);
  const n = roundAperture(Math.max(ctx.gear.maxAperture, 8));
  const iso = 200;
  const t = nearestShutter(shutterFor(n, iso, ev));
  const alternatives = [{ label: `${p.name} 원반`, iso, aperture: n, shutter: t, note: '표면 노출, 크롭 필요' }];
  if (p.body === 'Jupiter') {
    const tm = nearestShutter(shutterFor(n, 800, 3.5));
    alternatives.push({ label: '갈릴레이 위성까지', iso: 800, aperture: n, shutter: tm, note: '목성은 하얗게 날아감' });
  }
  const sizeArcsec = ctx.planetDiameterArcsec;
  const tips = ['행성은 매우 작아요. 크롭하거나 동영상으로 찍어 스태킹(AutoStakkert 등)하면 훨씬 선명해져요.'];
  if (p.body === 'Saturn') tips.push('토성 고리는 600mm 이상에서 겨우 보여요.');
  return {
    mode: '망원 행성 촬영',
    iso, aperture: n, shutter: t, wb: 5200,
    focus: 'MF · 라이브뷰 확대, 행성을 가장 작고 또렷하게',
    basis: [
      `${p.name} 표면 노출 EV100 ${ev.toFixed(1)} (고도 ${Math.round(p.alt)}°, 대기 감광 보정)`,
      sizeArcsec ? `겉보기 크기 약 ${sizeArcsec.toFixed(0)}″ → ${ctx.gear.focal}mm ${sensor.label}에서 약 ${((sizeArcsec / 206265) * ctx.gear.focal * 1000 / pixelPitch(sensor, ctx.gear.mp)).toFixed(0)}픽셀` : null,
    ].filter(Boolean),
    alternatives,
    warnings: p.alt < 15 ? ['행성이 낮아 대기 흔들림이 커요. 더 높이 떴을 때가 좋아요.'] : [],
    tips,
  };
}

/** 도시 야경: 태양 고도에 따른 장면 밝기 */
export function cityEV(sunAlt) {
  if (sunAlt > 0) return 10;
  if (sunAlt > -4) return 8;
  if (sunAlt > -6) return 5;
  if (sunAlt > -9) return 4;
  return 3.3;
}

export function citySettings(ctx) {
  const ev = cityEV(ctx.sky.sunAlt);
  const n = roundAperture(Math.max(ctx.gear.maxAperture, 8));
  const iso = 100;
  const t = nearestShutter(shutterFor(n, iso, ev));
  const tStar = nearestShutter(shutterFor(16, iso, ev));
  const tCar = nearestShutter(Math.max(15, shutterFor(11, iso, ev)));
  const phase = ctx.sky.sunAlt > -4 ? '노을·골든아워' : ctx.sky.sunAlt > -6 ? '블루아워' : ctx.sky.sunAlt > -9 ? '블루아워 끝무렵' : '밤 (조명 위주)';
  return {
    mode: `도시 야경 · ${phase}`,
    iso, aperture: n, shutter: t, wb: ctx.sky.sunAlt > -6 ? 'AWB' : 4000,
    focus: 'AF로 맞춘 뒤 MF 고정',
    basis: [`장면 밝기 EV100 약 ${ev} (태양 고도 ${ctx.sky.sunAlt.toFixed(1)}°, ${phase})`],
    alternatives: [
      { label: '기본', iso, aperture: n, shutter: t, note: '선명한 야경' },
      { label: '빛갈라짐(별 모양 가로등)', iso, aperture: 16, shutter: tStar, note: '조리개를 조여 광원을 별 모양으로' },
      { label: '차량 궤적', iso, aperture: 11, shutter: tCar, note: '15초 이상, 밝으면 ND 필터' },
    ],
    warnings: [],
    tips: [
      '블루아워(태양 고도 −4°~−6°)에는 하늘과 조명의 밝기가 비슷해 가장 균형 잡힌 사진이 나와요.',
      '하이라이트가 많으니 −1, 0, +1 브라케팅으로 찍어 두세요.',
    ],
  };
}

export function settingsFor(target, ctx) {
  switch (target) {
    case 'moon': return moonSettings(ctx);
    case 'startrails': return starTrailSettings(ctx, { durationMin: ctx.durationMin || 90 });
    case 'meteor': return meteorSettings(ctx);
    case 'planets': return planetSettings(ctx);
    case 'city': return citySettings(ctx);
    default: return milkyWaySettings(ctx);
  }
}

/** 카메라 방향: 대상 방위·고도와 화각으로 권장 기울기 */
export function framing(sensor, focal, targetAlt, { orientation = 'landscape', groundDeg = 12 } = {}) {
  const fov = fieldOfView(sensor, focal);
  const v = orientation === 'portrait' ? fov.h : fov.v;
  const h = orientation === 'portrait' ? fov.v : fov.h;
  const groundTilt = v / 2 - groundDeg;
  let tilt;
  if (groundTilt > 0 && targetAlt <= groundTilt + v / 2 - 5) tilt = groundTilt;
  else tilt = Math.max(targetAlt, 0);
  return { tilt, hfov: h, vfov: v };
}
