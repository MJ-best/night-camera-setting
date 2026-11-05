// 밤 동안의 고도 변화 차트 (SVG)
import { twilightLevel } from './astro.js';

const TW_FILL = ['var(--tw-day)', 'var(--tw-civil)', 'var(--tw-nautical)', 'var(--tw-astro)', 'transparent'];

export function renderTimeline(el, opts) {
  const { night, selected, series, windows = [], clouds = null } = opts;
  const W = Math.max(300, Math.round(el.clientWidth || 640));
  const hasClouds = clouds && clouds.length > 0;
  const padL = 34;
  const padR = 10;
  const padT = 14;
  const plotH = 170;
  const cloudH = hasClouds ? 26 : 0;
  const axisH = 22;
  const H = padT + plotH + (hasClouds ? cloudH + 6 : 0) + axisH;
  const from = night.chartRange.from.getTime();
  const to = night.chartRange.to.getTime();
  const altMin = -12;
  const altMax = 90;
  const x = (t) => padL + ((t - from) / (to - from)) * (W - padL - padR);
  const y = (alt) => padT + (1 - (Math.max(altMin - 8, Math.min(altMax, alt)) - altMin) / (altMax - altMin)) * plotH;
  const inRange = night.samples.filter((s) => s.t >= from - 6e5 && s.t <= to + 6e5);

  const parts = [];
  parts.push(`<defs><clipPath id="plotClip"><rect x="${padL}" y="${padT}" width="${W - padL - padR}" height="${plotH}"/></clipPath></defs>`);
  parts.push(`<rect x="${padL}" y="${padT}" width="${W - padL - padR}" height="${plotH}" fill="var(--chart-night)"/>`);

  // 박명 음영
  let runStart = null;
  let runLevel = null;
  const flush = (endT) => {
    if (runStart == null || runLevel === 4) return;
    parts.push(`<rect x="${x(runStart).toFixed(1)}" y="${padT}" width="${Math.max(0, x(endT) - x(runStart)).toFixed(1)}" height="${plotH}" fill="${TW_FILL[runLevel]}" clip-path="url(#plotClip)"/>`);
  };
  for (const s of inRange) {
    const lvl = twilightLevel(s.sun.alt);
    if (lvl !== runLevel) {
      flush(s.t.getTime());
      runStart = s.t.getTime();
      runLevel = lvl;
    }
  }
  flush(to + 6e5);

  // 촬영 가능 구간 (상단 막대)
  for (const iv of windows) {
    const x1 = x(Math.max(from, iv.start.getTime()));
    const x2 = x(Math.min(to, iv.end.getTime()));
    if (x2 - x1 < 1) continue;
    parts.push(`<rect x="${x1.toFixed(1)}" y="${padT - 8}" width="${(x2 - x1).toFixed(1)}" height="5" rx="2.5" fill="var(--good)"/>`);
  }

  // 고도 눈금
  for (const alt of [0, 30, 60, 90]) {
    const yy = y(alt).toFixed(1);
    parts.push(`<line x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}" stroke="${alt === 0 ? 'var(--horizon)' : 'var(--chart-grid)'}" stroke-width="${alt === 0 ? 1.2 : 1}"/>`);
    parts.push(`<text x="${padL - 6}" y="${(+yy + 3.5).toFixed(1)}" text-anchor="end" class="ax">${alt}°</text>`);
  }

  // 천체 고도 곡선
  for (const ser of series) {
    const pts = inRange.map((s) => `${x(s.t.getTime()).toFixed(1)},${y(ser.alt(s)).toFixed(1)}`).join(' ');
    parts.push(`<polyline points="${pts}" fill="none" stroke="${ser.color}" stroke-width="${ser.width || 1.6}" ${ser.dash ? `stroke-dasharray="${ser.dash}"` : ''} stroke-linejoin="round" stroke-linecap="round" clip-path="url(#plotClip)" opacity="${ser.opacity ?? 1}"/>`);
  }

  // 구름량
  if (hasClouds) {
    const top = padT + plotH + 6;
    parts.push(`<text x="${padL - 6}" y="${top + cloudH / 2 + 3.5}" text-anchor="end" class="ax">구름</text>`);
    parts.push(`<rect x="${padL}" y="${top}" width="${W - padL - padR}" height="${cloudH}" fill="var(--chart-night)"/>`);
    for (const c of clouds) {
      const t = c.t.getTime();
      if (t < from - 18e5 || t > to) continue;
      const x1 = Math.max(padL, x(t));
      const x2 = Math.min(W - padR, x(t + 36e5));
      if (x2 - x1 <= 1) continue; // 차트 끝에 걸린 1px 미만 조각은 그리지 않는다
      const hh = (c.cloud / 100) * cloudH;
      parts.push(`<rect x="${(x1 + 0.5).toFixed(1)}" y="${(top + cloudH - hh).toFixed(1)}" width="${(x2 - x1 - 1).toFixed(1)}" height="${hh.toFixed(1)}" fill="var(--cloud)"><title>${c.cloud}%</title></rect>`);
    }
  }

  // 시간 축
  const axisY = H - 6;
  const hourMs = 3_600_000;
  const span = (to - from) / hourMs;
  const stepH = W / span < 34 ? 2 : 1;
  const firstHour = new Date(from);
  firstHour.setMinutes(0, 0, 0);
  for (let t = firstHour.getTime() + hourMs; t <= to; t += hourMs) {
    const d = new Date(t);
    if (d.getHours() % stepH) continue;
    const xx = x(t).toFixed(1);
    parts.push(`<line x1="${xx}" x2="${xx}" y1="${padT + plotH}" y2="${padT + plotH + 4}" stroke="var(--chart-grid)"/>`);
    parts.push(`<text x="${xx}" y="${axisY}" text-anchor="middle" class="ax">${String(d.getHours()).padStart(2, '0')}</text>`);
  }

  // 선택 시각
  if (selected) {
    const xs = x(selected.getTime()).toFixed(1);
    parts.push(`<line x1="${xs}" x2="${xs}" y1="${padT - 2}" y2="${padT + plotH}" stroke="var(--accent)" stroke-width="1.5"/>`);
    parts.push(`<circle cx="${xs}" cy="${padT + plotH}" r="4" fill="var(--accent)"/>`);
  }

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="밤 동안 천체 고도 변화">${parts.join('')}</svg>`;
  const svg = el.firstElementChild;
  return {
    timeAt(clientX) {
      const rect = svg.getBoundingClientRect();
      const px = ((clientX - rect.left) / rect.width) * W;
      const t = from + ((px - padL) / (W - padL - padR)) * (to - from);
      return new Date(Math.max(from, Math.min(to, t)));
    },
  };
}
