import test from 'node:test';
import assert from 'node:assert/strict';
import { azimuthName, moonPhasePath, formatNightTime, signedDeg } from '../js/format.js';
import { parseWeather, summarize, weatherUrl } from '../js/weather.js';

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
