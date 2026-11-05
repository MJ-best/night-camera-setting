import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as astro from '../js/astro.js';
import { GALACTIC_CENTER } from '../js/data.js';

const SEOUL = { lat: 37.5665, lon: 126.978 };
const minutesOf = (d) => d.getHours() * 60 + d.getMinutes();

test('서울 하지 일몰·천문박명 시각이 실제 값과 맞다', () => {
  const n = astro.computeNight({ ...SEOUL, date: '2026-06-20' });
  // 한국천문연구원 기준 서울 하지 일몰 약 19:56
  assert.ok(Math.abs(minutesOf(n.events.sunset) - (19 * 60 + 56)) <= 3, `sunset ${n.events.sunset}`);
  assert.ok(Math.abs(minutesOf(n.events.sunrise) - (5 * 60 + 11)) <= 3, `sunrise ${n.events.sunrise}`);
  const order = ['sunset', 'civilDusk', 'nauticalDusk', 'astroDusk', 'astroDawn', 'nauticalDawn', 'civilDawn', 'sunrise'];
  for (let i = 1; i < order.length; i++) assert.ok(n.events[order[i - 1]] < n.events[order[i]], `${order[i - 1]} < ${order[i]}`);
  assert.ok(n.hasAstroDark);
  assert.equal(n.darkWindows.length, 1);
});

test('은하 좌표 변환: l=0,b=0은 궁수자리 은하 중심', () => {
  const p = astro.galacticToEquatorial(0, 0);
  assert.ok(Math.abs(p.ra - GALACTIC_CENTER.ra) < 0.01);
  assert.ok(Math.abs(p.dec - GALACTIC_CENTER.dec) < 0.1);
  const ngp = astro.galacticToEquatorial(0, 90);
  assert.ok(Math.abs(ngp.ra * 15 - 192.86) < 0.05 && Math.abs(ngp.dec - 27.13) < 0.05);
});

test('회전 행렬로 구한 별 위치가 Astronomy.Horizon과 일치한다', () => {
  const A = globalThis.Astronomy;
  const obs = astro.makeObserver(SEOUL.lat, SEOUL.lon);
  const t = A.MakeTime(new Date('2026-07-15T22:00:00+09:00'));
  A.DefineStar(A.Body.Star1, GALACTIC_CENTER.ra, GALACTIC_CENTER.dec, 26000);
  const eq = A.Equator(A.Body.Star1, t, obs, true, true);
  const hor = A.Horizon(t, obs, eq.ra, eq.dec, 'normal');
  const mine = astro.skyFrame(t, obs)(GALACTIC_CENTER.ra, GALACTIC_CENTER.dec);
  assert.ok(Math.abs(mine.alt - hor.altitude) < 0.05, `${mine.alt} vs ${hor.altitude}`);
  assert.ok(Math.abs(mine.az - hor.azimuth) < 0.05, `${mine.az} vs ${hor.azimuth}`);
});

test('여름밤에는 은하수 중심이, 한겨울 밤에는 다른 영역이 추천된다', () => {
  const summer = astro.analyzeMilkyWay(astro.computeNight({ ...SEOUL, date: '2026-08-12' }));
  assert.equal(summer.best.region.id, 'core');
  assert.ok(summer.coreMinutes > 60);
  assert.ok(summer.gcMaxAlt > 22 && summer.gcMaxAlt < 25, `gcMax ${summer.gcMaxAlt}`);
  const winter = astro.analyzeMilkyWay(astro.computeNight({ ...SEOUL, date: '2026-12-20' }));
  assert.equal(winter.coreMinutes, 0);
  assert.notEqual(winter.best?.region.id, 'core');
});

test('보름 무렵 달은 조도가 높고, 위상 이름이 맞다', () => {
  const n = astro.computeNight({ ...SEOUL, date: '2026-10-26' });
  assert.ok(n.moon.illum > 0.95);
  assert.equal(n.moon.name, '보름달');
  const m = astro.moonInfo(new Date('2026-11-09T18:00:00+09:00'));
  assert.ok(m.illum < 0.03);
});

test('유성우: 8월 12일 밤은 페르세우스, 극대는 8월 13일 새벽', () => {
  const sh = astro.findMeteorShower('2026-08-12');
  assert.equal(sh.id, 'PER');
  assert.ok(Math.abs(sh.daysToPeak) < 1.5);
  assert.equal(sh.peak.getMonth(), 7);
  const gem = astro.meteorShowerById('GEM', '2026-12-01');
  assert.equal(gem.peak.getMonth(), 11);
  assert.ok(gem.peak.getDate() >= 13 && gem.peak.getDate() <= 15);
});

test('유성 기대 개수는 복사점 고도와 하늘 밝기에 따라 줄어든다', () => {
  const sh = { zhr: 100 };
  const high = astro.meteorRate(sh, 60, 2);
  const low = astro.meteorRate(sh, 20, 2);
  const city = astro.meteorRate(sh, 60, 8);
  assert.ok(high > low && high > city);
  assert.equal(astro.meteorRate(sh, -5, 2), 0);
});

test('행성 분석 결과는 보이는 행성이 먼저 온다', () => {
  const list = astro.analyzePlanets(astro.computeNight({ ...SEOUL, date: '2026-10-31' }));
  assert.equal(list.length, 5);
  const firstHidden = list.findIndex((p) => !p.visible);
  if (firstHidden >= 0) assert.ok(list.slice(firstHidden).every((p) => !p.visible));
  for (const p of list.filter((x) => x.visible)) assert.match(p.constellation, /자리$/);
});

test('30일 스캔은 날짜별 어둠·달 정보를 준다', () => {
  const rows = astro.scanNights({ ...SEOUL, fromDate: '2026-07-01', count: 30 });
  assert.equal(rows.length, 30);
  assert.equal(rows[0].date, '2026-07-01');
  assert.ok(rows.every((r) => r.dark >= r.moonless && r.moonless >= r.core));
  assert.ok(rows.some((r) => r.core > 0));
});

test('정오 이전이면 어젯밤 날짜를 쓴다', () => {
  assert.equal(astro.currentNightDateStr(new Date(2026, 9, 31, 2, 0)), '2026-10-30');
  assert.equal(astro.currentNightDateStr(new Date(2026, 9, 31, 21, 0)), '2026-10-31');
});

test('유성우 극대 검색은 2년 동안 어느 날짜에서도 실패하지 않는다', () => {
  for (let d = new Date(2026, 0, 1); d < new Date(2028, 0, 1); d.setDate(d.getDate() + 1)) {
    const ds = astro.toDateStr(d);
    const sh = astro.findMeteorShower(ds);
    assert.ok(sh && sh.peak instanceof Date, ds);
    assert.ok(sh.daysToPeak > -41 && sh.daysToPeak < 366, `${ds} ${sh.id} ${sh.daysToPeak}`);
    const up = astro.upcomingShowers(new Date(d), 3);
    assert.equal(up.length, 3);
    assert.ok(up.every((u) => u.peak >= new Date(d.getTime() - 3 * astro.DAY)), ds);
  }
});

test('태양 황경 검색: 극대일이 매년 같은 무렵에 온다', () => {
  // 페르세우스(140°)는 8월 12~13일, 쌍둥이자리(262.2°)는 12월 13~15일
  for (const year of [2026, 2027, 2028]) {
    const per = astro.nextSunLongitude(140, new Date(year, 0, 1));
    assert.equal(per.getMonth(), 7);
    assert.ok(per.getDate() >= 12 && per.getDate() <= 13, `${year} PER ${per}`);
    const gem = astro.nextSunLongitude(262.2, new Date(year, 0, 1));
    assert.equal(gem.getMonth(), 11);
    assert.ok(gem.getDate() >= 13 && gem.getDate() <= 15, `${year} GEM ${gem}`);
  }
  // 목표 황경을 막 지난 시점이면 다음 해를 돌려준다
  const after = astro.nextSunLongitude(140, new Date(2026, 7, 14));
  assert.equal(after.getFullYear(), 2027);
});
