import test from 'node:test';
import assert from 'node:assert/strict';
import {
  azimuthName, moonPhasePath, formatNightTime, signedDeg, setZone, formatTime, formatDate, zoneLabel, zoneOffsetMin,
  nightDateStrAt, formatDateStr, zonedDateStr,
} from '../js/format.js';
import { parseWeather, summarize, weatherUrl, packRows, unpackRows, isNearby } from '../js/weather.js';

test('방위 이름', () => {
  assert.equal(azimuthName(0), '북');
  assert.equal(azimuthName(359), '북');
  assert.equal(azimuthName(225), '남서');
  assert.equal(azimuthName(100), '동');
  assert.equal(signedDeg(350), -10);
});

test('달 모양 경로: 삭은 비고, 보름은 원', () => {
  assert.equal(moonPhasePath(0), '');
  assert.match(moonPhasePath(180), /^M0,-10A10,10 0 1 1/);
  assert.notEqual(moonPhasePath(90), moonPhasePath(270));
});

test('밤 시각 표시: 다음날 새벽 표시', () => {
  const start = new Date(2026, 9, 31, 12);
  assert.equal(formatNightTime(new Date(2026, 10, 1, 3, 5), start), '새벽 03:05');
  assert.equal(formatNightTime(new Date(2026, 9, 31, 21, 30), start), '21:30');
  assert.equal(formatNightTime(new Date(2026, 9, 31, 13, 0), start), '낮 13:00');
});

test('Open-Meteo 응답 파싱과 밤 요약', () => {
  const base = Date.UTC(2026, 9, 31, 9) / 1000;
  const n = 12;
  const json = {
    hourly: {
      time: Array.from({ length: n }, (_, i) => base + i * 3600),
      cloud_cover: Array.from({ length: n }, (_, i) => (i < 6 ? 10 : 90)),
      relative_humidity_2m: Array(n).fill(85),
      dew_point_2m: Array(n).fill(7),
      temperature_2m: Array(n).fill(8),
      wind_speed_10m: Array(n).fill(3),
    },
  };
  const rows = parseWeather(json);
  assert.equal(rows.length, n);
  const all = summarize(rows, new Date(base * 1000), new Date((base + 11 * 3600) * 1000));
  assert.equal(Math.round(all.cloud), 50);
  assert.equal(all.dewRisk, true);
  assert.equal(all.clearest.cloud, 10);
  assert.equal(summarize(rows, new Date(0), new Date(1000)), null);
  assert.match(weatherUrl(37.5, 127), /cloud_cover/);
});

test('저장용 압축·복원은 값을 그대로 돌려준다', () => {
  const rows = [
    { t: new Date(Date.UTC(2026, 10, 1, 12)), cloud: 20, rh: 80, dew: 5, temp: 9, wind: 2.1 },
    { t: new Date(Date.UTC(2026, 10, 1, 13)), cloud: 35, rh: 85, dew: 5.5, temp: 8, wind: null },
  ];
  const back = unpackRows(JSON.parse(JSON.stringify(packRows(rows))));
  assert.deepEqual(back, rows);
  assert.equal(unpackRows(null), null);
});

test('5km 안쪽이면 같은 예보를 다시 쓴다', () => {
  assert.equal(isNearby({ lat: 37.56, lon: 126.97 }, { lat: 37.58, lon: 126.99 }), true);
  assert.equal(isNearby({ lat: 37.56, lon: 126.97 }, { lat: 37.62, lon: 128.73 }), false);
});

test('현지 시간대로 시각·날짜를 표시한다', () => {
  const t = new Date('2026-11-05T19:30:00Z');
  try {
    setZone({ id: 'Atlantic/Canary' });
    assert.equal(formatTime(t), '19:30');
    assert.equal(zoneLabel(t), 'UTC+0');
    setZone({ id: 'Asia/Kolkata' });
    assert.equal(formatTime(t), '01:00');
    assert.equal(formatDate(t), '11월 6일 (금)');
    assert.equal(zoneLabel(t), 'UTC+5:30');
    setZone({ id: 'America/Los_Angeles' });
    assert.equal(formatTime(t), '11:30');
    // 일광절약시간: 11월 1일 새벽에 −7시간에서 −8시간으로
    assert.equal(zoneOffsetMin(new Date('2026-10-31T12:00:00Z')), -420);
    assert.equal(zoneOffsetMin(new Date('2026-11-02T12:00:00Z')), -480);
    setZone({ fixedMin: -300 });
    assert.equal(formatTime(t), '14:30');
    assert.equal(zoneLabel(t), 'UTC−5');
    setZone({ id: 'Not/AZone' }); // 잘못된 이름은 기기 시간대로
    assert.equal(formatTime(t), '04:30'); // 테스트는 TZ=Asia/Seoul
  } finally {
    setZone({});
  }
});

test('현지 기준 오늘 밤 날짜', () => {
  try {
    setZone({ id: 'America/New_York' });
    // 뉴욕 11월 6일 01:00(EST) → 11월 5일 밤
    assert.equal(nightDateStrAt(new Date('2026-11-06T06:00:00Z')), '2026-11-05');
    assert.equal(zonedDateStr(new Date('2026-11-06T06:00:00Z')), '2026-11-06');
    // 뉴욕 11월 6일 13:00 → 11월 6일 밤
    assert.equal(nightDateStrAt(new Date('2026-11-06T18:00:00Z')), '2026-11-06');
    // 밤 시작일 기준 접두어: 같은 날 저녁은 접두어 없음, 다음날 새벽은 '새벽'
    const start = new Date('2026-11-05T17:00:00Z'); // 뉴욕 정오
    assert.equal(formatNightTime(new Date('2026-11-06T00:30:00Z'), start), '19:30');
    assert.equal(formatNightTime(new Date('2026-11-06T08:15:00Z'), start), '새벽 03:15');
  } finally {
    setZone({});
  }
  assert.equal(formatDateStr('2026-11-05'), '11월 5일 (목)');
});
