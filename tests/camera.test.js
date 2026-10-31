import test from 'node:test';
import assert from 'node:assert/strict';
import * as cam from '../js/camera.js';

const darkSky = { sunAlt: -30, moonAlt: -20, moonMag: -10, moonIllum: 0.3, moonPhaseAngle: 110, moonDiameter: 0.52, moonDistKm: 384400 };
const ctx = (gear, sky = darkSky, bortle = 3) => ({ gear: { sensor: 'ff', mp: 24, ...gear }, bortle, sky });

test('표준값 반올림', () => {
  assert.equal(cam.roundISO(4752), 5000);
  assert.equal(cam.roundISO(50), 100);
  assert.equal(cam.floorShutter(13.9), 13);
  assert.equal(cam.floorShutter(45), 45);
  assert.equal(cam.formatShutter(20), '20″');
  assert.equal(cam.formatShutter(1 / 200), '1/200');
  assert.equal(cam.formatShutter(0.8), '0.8″');
});

test('NPF·500 법칙', () => {
  const pitch = cam.pixelPitch(cam.SENSORS.ff, 24);
  assert.ok(Math.abs(pitch - 5.95) < 0.1);
  assert.ok(Math.abs(cam.npfSeconds(2.8, pitch, 20) - 13.8) < 0.3);
  assert.equal(cam.rule500(20, 1), 25);
});

test('노출 공식은 서로 역함수다', () => {
  const iso = cam.isoFor(2.8, 20, -6.3);
  assert.ok(Math.abs(cam.shutterFor(2.8, iso, -6.3) - 20) < 1e-9);
  assert.ok(Math.abs(cam.evOf(2.8, 20, iso) - -6.3) < 1e-9);
});

test('은하수: 20mm f/2.8 풀프레임 어두운 하늘이면 ISO 3200~6400, 13초 안팎', () => {
  const s = cam.milkyWaySettings(ctx({ focal: 20, maxAperture: 2.8 }));
  assert.equal(s.aperture, 2.8);
  assert.ok(s.shutter >= 10 && s.shutter <= 15);
  assert.ok(s.iso >= 3200 && s.iso <= 6400, `iso ${s.iso}`);
  assert.equal(s.alternatives.length, 3);
});

test('은하수: 보름달이 높이 뜨면 ISO가 크게 낮아지고 경고가 붙는다', () => {
  const dark = cam.milkyWaySettings(ctx({ focal: 20, maxAperture: 2.8 }));
  const moon = cam.milkyWaySettings(ctx({ focal: 20, maxAperture: 2.8 }, { ...darkSky, moonAlt: 50, moonMag: -12.6, moonIllum: 0.99 }));
  assert.ok(moon.iso <= dark.iso / 4);
  assert.ok(moon.warnings.some((w) => w.includes('달빛')));
});

test('f/1.4 렌즈는 코마를 줄이려 f/2로 조인다', () => {
  assert.equal(cam.wideAperture(1.4), 2);
  assert.equal(cam.wideAperture(1.8), 1.8);
  assert.equal(cam.wideAperture(2.8), 2.8);
});

test('달: 보름은 Looney 11 근처(f/8 ISO100 약 1/200), 반달은 2스톱 더 길다', () => {
  const g = { focal: 400, maxAperture: 5.6 };
  const full = cam.moonSettings(ctx(g, { ...darkSky, moonAlt: 45, moonPhaseAngle: 0 }));
  const half = cam.moonSettings(ctx(g, { ...darkSky, moonAlt: 45, moonPhaseAngle: 90 }));
  assert.equal(full.iso, 100);
  assert.equal(full.aperture, 8);
  assert.ok(full.shutter >= 1 / 250 && full.shutter <= 1 / 160, `full ${full.shutter}`);
  const stops = Math.log2(half.shutter / full.shutter);
  assert.ok(stops > 1.6 && stops < 2.4, `stops ${stops}`);
});

test('달이 프레임에서 차지하는 비율', () => {
  const pct = cam.moonFramePct(cam.SENSORS.ff, 600, 0.52);
  assert.ok(pct > 21 && pct < 24);
});

test('별궤적: 30초 인터벌, 장 수는 시간에 비례', () => {
  const s = cam.starTrailSettings(ctx({ focal: 16, maxAperture: 4 }), { durationMin: 60 });
  assert.equal(s.shutter, 30);
  assert.match(s.sequence, /116장/);
  assert.ok(s.iso >= 200 && s.iso <= 3200);
});

test('도시 야경: 블루아워는 f/8 ISO100에서 몇 초', () => {
  const s = cam.citySettings(ctx({ focal: 24, maxAperture: 4 }, { ...darkSky, sunAlt: -5 }));
  assert.equal(s.iso, 100);
  assert.equal(s.aperture, 8);
  assert.ok(s.shutter >= 1 && s.shutter <= 4, `shutter ${s.shutter}`);
});

test('구도: 광각은 땅을 조금 넣고, 대상이 높으면 대상을 향한다', () => {
  const low = cam.framing(cam.SENSORS.ff, 20, 15);
  assert.ok(low.tilt > 10 && low.tilt < 25);
  const high = cam.framing(cam.SENSORS.ff, 50, 60);
  assert.equal(high.tilt, 60);
});
