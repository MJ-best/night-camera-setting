// 캔버스 별지도: 전천 돔(천정 중심)과 지평선 파노라마 두 가지 투영
import { STARS, STAR_BY_ID, CONSTELLATIONS, ASTERISMS, DEEP_SKY } from './data.js';
import { galacticToEquatorial } from './astro.js';
import { moonPhasePath, signedDeg, normDeg } from './format.js';

const DEG = Math.PI / 180;
const CARDINALS = [
  [0, '북'], [45, '북동'], [90, '동'], [135, '남동'], [180, '남'], [225, '남서'], [270, '서'], [315, '북서'],
];
const STAR_COLORS = { b: '#cfe0ff', w: '#f4f6ff', y: '#fff3d6', o: '#ffd6a8', r: '#ffb39a' };

// 은하수 띠: 은하 경도별 폭과 밝기
function bandIntensity(l) {
  const dl = signedDeg(l);
  const core = Math.exp(-((dl / 28) ** 2));
  const cyg = Math.exp(-(((l - 75) / 22) ** 2));
  const car = Math.exp(-(((l - 287) / 25) ** 2));
  return 0.28 + 0.72 * core + 0.3 * cyg + 0.35 * car;
}
const BAND = [];
for (let l = 0; l <= 360; l += 3) {
  const dl = signedDeg(l);
  const wide = 9 + 6 * Math.exp(-((dl / 35) ** 2));
  BAND.push({
    l,
    i: bandIntensity(l),
    outerN: galacticToEquatorial(l, wide),
    outerS: galacticToEquatorial(l, -wide),
    innerN: galacticToEquatorial(l, 3.5),
    innerS: galacticToEquatorial(l, -4.5),
  });
}

function cssVar(name, fallback) {
  if (typeof getComputedStyle !== 'function') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** 카메라 프레임(화각 사각형)의 가장자리 점들을 지평 좌표로 */
export function frameOutline(az0, tilt, hfov, vfov, steps = 12) {
  const dir = (alt, az) => [Math.cos(alt * DEG) * Math.sin(az * DEG), Math.cos(alt * DEG) * Math.cos(az * DEG), Math.sin(alt * DEG)];
  const F = dir(tilt, az0);
  const R = [Math.cos(az0 * DEG), -Math.sin(az0 * DEG), 0];
  const U = [R[1] * F[2] - R[2] * F[1], R[2] * F[0] - R[0] * F[2], R[0] * F[1] - R[1] * F[0]];
  const th = Math.tan((hfov / 2) * DEG);
  const tv = Math.tan((vfov / 2) * DEG);
  const pts = [];
  const push = (x, y) => {
    const d = [0, 1, 2].map((k) => F[k] + x * th * R[k] + y * tv * U[k]);
    const n = Math.hypot(...d);
    pts.push({ alt: Math.asin(d[2] / n) / DEG, az: normDeg(Math.atan2(d[0], d[1]) / DEG) });
  };
  for (let i = 0; i <= steps; i++) push(-1 + (2 * i) / steps, 1);
  for (let i = 0; i <= steps; i++) push(1, 1 - (2 * i) / steps);
  for (let i = 0; i <= steps; i++) push(1 - (2 * i) / steps, -1);
  for (let i = 0; i <= steps; i++) push(-1, -1 + (2 * i) / steps);
  return pts;
}

export class SkyMap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.mode = 'pano';
    this.centerAz = 180;
    this.userPanned = false;
    this.state = null;
    this.offscreen = document.createElement('canvas');
    this._bindPan();
  }

  _bindPan() {
    let startX = null;
    let startAz = 0;
    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'pano') return;
      startX = e.clientX;
      startAz = this.centerAz;
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (startX == null) return;
      const rect = this.canvas.getBoundingClientRect();
      const degPerPx = this.span / rect.width;
      this.centerAz = normDeg(startAz - (e.clientX - startX) * degPerPx);
      this.userPanned = true;
      this.render();
    });
    const end = () => { startX = null; };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
  }

  get span() { return 180; }

  setMode(mode) {
    this.mode = mode;
    this.render();
  }

  update(state) {
    this.state = state;
    if (!this.userPanned && state.target) this.centerAz = state.target.az;
    this.render();
  }

  recenter() {
    this.userPanned = false;
    if (this.state?.target) this.centerAz = this.state.target.az;
    this.render();
  }

  _size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const cssW = this.canvas.clientWidth || 600;
    const cssH = this.mode === 'dome' ? cssW : Math.round(cssW / 1.6);
    this.canvas.style.height = `${cssH}px`;
    if (this.canvas.width !== Math.round(cssW * dpr) || this.canvas.height !== Math.round(cssH * dpr)) {
      this.canvas.width = Math.round(cssW * dpr);
      this.canvas.height = Math.round(cssH * dpr);
    }
    return { w: cssW, h: cssH, dpr };
  }

  _projector(w, h) {
    if (this.mode === 'dome') {
      const R = Math.min(w, h) / 2 - 22;
      const cx = w / 2;
      const cy = h / 2;
      return {
        R, cx, cy,
        project: (alt, az) => {
          const r = ((90 - alt) / 90) * R;
          return { x: cx - r * Math.sin(az * DEG), y: cy - r * Math.cos(az * DEG), vis: alt >= -0.5 };
        },
        clip: (ctx) => { ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip(); },
      };
    }
    const altMin = -12;
    const altMax = 90;
    const skyH = h - 22;
    const pxDeg = w / this.span;
    const yOf = (alt) => skyH - ((alt - altMin) / (altMax - altMin)) * skyH;
    return {
      pxDeg, yOf, skyH, altMin,
      project: (alt, az) => {
        const dx = signedDeg(az - this.centerAz);
        return { x: w / 2 + dx * pxDeg, y: yOf(alt), vis: alt >= -0.5 && Math.abs(dx) <= this.span / 2 + 5, dx };
      },
      clip: (ctx) => { ctx.beginPath(); ctx.rect(0, 0, w, skyH); ctx.clip(); },
    };
  }

  render() {
    const s = this.state;
    if (!s) return;
    const { w, h, dpr } = this._size();
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const P = this._projector(w, h);
    const colors = {
      grid: cssVar('--map-grid', 'rgba(150,170,210,0.18)'),
      label: cssVar('--muted', '#8d98b3'),
      text: cssVar('--text', '#e6ebf5'),
      accent: cssVar('--accent', '#f2b45a'),
      moon: cssVar('--moon', '#f4e7b0'),
      mw: cssVar('--mw', '#b8a7ff'),
      ground: cssVar('--ground', '#05070c'),
      line: cssVar('--map-line', 'rgba(140,170,230,0.32)'),
    };
    const sunAlt = s.sun.alt;
    const starAlpha = sunAlt < -15 ? 1 : sunAlt < -6 ? 0.35 + ((-6 - sunAlt) / 9) * 0.65 : sunAlt < 0 ? 0.12 : 0.04;

    ctx.save();
    // 하늘 배경
    this._drawSkyBackground(ctx, P, w, h, sunAlt, s);
    ctx.save();
    P.clip(ctx);
    this._drawGrid(ctx, P, w, h, colors);
    if (starAlpha > 0.2) this._drawBand(ctx, P, w, h, s.frame, starAlpha);
    this._drawConstellations(ctx, P, s.frame, colors, starAlpha);
    this._drawStars(ctx, P, s.frame, starAlpha, colors);
    if (this.mode === 'pano') {
      ctx.fillStyle = colors.ground;
      ctx.fillRect(0, P.yOf(0), w, h);
    }
    if (s.fov) this._drawFov(ctx, P, s.fov, colors);
    this._drawMarkers(ctx, P, s, colors);
    ctx.restore();
    this._drawFrameDecor(ctx, P, w, h, colors);
    ctx.restore();
  }

  _drawSkyBackground(ctx, P, w, h, sunAlt, s) {
    const night = cssVar('--sky-night', '#060a16');
    let top = night;
    let bottom = '#0b1428';
    if (sunAlt > 0) { top = '#3f6fae'; bottom = '#9cc2e8'; }
    else if (sunAlt > -6) { top = '#1d3462'; bottom = '#c07a5a'; }
    else if (sunAlt > -12) { top = '#0d1834'; bottom = '#2c3460'; }
    else if (sunAlt > -18) { top = '#08101f'; bottom = '#151d38'; }
    if (this.mode === 'dome') {
      const g = ctx.createRadialGradient(P.cx, P.cy, 0, P.cx, P.cy, P.R);
      g.addColorStop(0, top);
      g.addColorStop(1, bottom);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(P.cx, P.cy, P.R, 0, Math.PI * 2);
      ctx.fill();
      // 해가 진 방향의 박명 빛
      if (sunAlt > -18 && sunAlt < 2) {
        const p = P.project(0, s.sun.az);
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, P.R * 0.9);
        const a = Math.max(0, Math.min(0.55, (sunAlt + 18) / 30));
        glow.addColorStop(0, `rgba(255,150,90,${a})`);
        glow.addColorStop(1, 'rgba(255,150,90,0)');
        ctx.save();
        ctx.beginPath();
        ctx.arc(P.cx, P.cy, P.R, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, P.skyH);
      g.addColorStop(0, top);
      g.addColorStop(1, bottom);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, P.skyH);
      if (sunAlt > -18 && sunAlt < 2) {
        const p = P.project(0, s.sun.az);
        if (Math.abs(p.dx) < 120) {
          const glow = ctx.createRadialGradient(p.x, P.yOf(0), 0, p.x, P.yOf(0), w * 0.45);
          const a = Math.max(0, Math.min(0.55, (sunAlt + 18) / 30));
          glow.addColorStop(0, `rgba(255,150,90,${a})`);
          glow.addColorStop(1, 'rgba(255,150,90,0)');
          ctx.fillStyle = glow;
          ctx.fillRect(0, 0, w, P.skyH);
        }
      }
    }
  }

  _drawGrid(ctx, P, w, h, colors) {
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.fillStyle = colors.label;
    ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace';
    if (this.mode === 'dome') {
      for (const alt of [30, 60]) {
        ctx.beginPath();
        ctx.arc(P.cx, P.cy, ((90 - alt) / 90) * P.R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillText(`${alt}°`, P.cx + 3, P.cy - ((90 - alt) / 90) * P.R - 3);
      }
      for (let az = 0; az < 360; az += 45) {
        const p = P.project(0, az);
        ctx.beginPath();
        ctx.moveTo(P.cx, P.cy);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    } else {
      for (const alt of [0, 30, 60]) {
        const y = P.yOf(alt);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        if (alt > 0) ctx.fillText(`${alt}°`, 4, y - 3);
      }
      for (let az = 0; az < 360; az += 45) {
        const p = P.project(0, az);
        if (Math.abs(p.dx) > this.span / 2) continue;
        ctx.beginPath();
        ctx.moveTo(p.x, 0);
        ctx.lineTo(p.x, P.skyH);
        ctx.stroke();
      }
    }
  }

  _drawBand(ctx, P, w, h, frame, alpha) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const off = this.offscreen;
    off.width = Math.round(w * dpr / 2);
    off.height = Math.round(h * dpr / 2);
    const o = off.getContext('2d');
    o.setTransform(dpr / 2, 0, 0, dpr / 2, 0, 0);
    o.clearRect(0, 0, w, h);
    const hor = BAND.map((b) => ({
      i: b.i,
      on: frame(b.outerN.ra, b.outerN.dec), os: frame(b.outerS.ra, b.outerS.dec),
      in: frame(b.innerN.ra, b.innerN.dec), is: frame(b.innerS.ra, b.innerS.dec),
    }));
    const quad = (a, b, c, d, fill) => {
      if ([a, b, c, d].some((p) => p.alt < -25)) return;
      const pts = [a, b, c, d].map((p) => P.project(p.alt, p.az));
      if (this.mode === 'pano') {
        const xs = pts.map((p) => p.x);
        if (Math.max(...xs) - Math.min(...xs) > w * 0.5) return;
      }
      o.fillStyle = fill;
      o.beginPath();
      o.moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < 4; k++) o.lineTo(pts[k].x, pts[k].y);
      o.closePath();
      o.fill();
    };
    for (let k = 0; k < hor.length - 1; k++) {
      const a = hor[k];
      const b = hor[k + 1];
      const i = (a.i + b.i) / 2;
      quad(a.on, b.on, b.os, a.os, `rgba(150,140,230,${(0.16 + 0.22 * i).toFixed(3)})`);
    }
    for (let k = 0; k < hor.length - 1; k++) {
      const a = hor[k];
      const b = hor[k + 1];
      const i = (a.i + b.i) / 2;
      quad(a.in, b.in, b.is, a.is, `rgba(225,215,255,${(0.05 + 0.3 * i * i).toFixed(3)})`);
    }
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha) * 0.85;
    ctx.globalCompositeOperation = 'screen';
    try { ctx.filter = 'blur(5px)'; } catch { /* 일부 브라우저 미지원 */ }
    ctx.drawImage(off, 0, 0, w, h);
    ctx.filter = 'none';
    ctx.restore();
  }

  _drawConstellations(ctx, P, frame, colors, alpha) {
    ctx.save();
    ctx.globalAlpha = Math.max(0.15, alpha);
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 1;
    const pos = {};
    const at = (id) => {
      if (!pos[id]) {
        const st = STAR_BY_ID[id];
        pos[id] = frame(st.ra, st.dec);
      }
      return pos[id];
    };
    const seg = (A, B) => {
      if (A.alt < -5 && B.alt < -5) return;
      const a = P.project(A.alt, A.az);
      const b = P.project(B.alt, B.az);
      if (this.mode === 'pano' && Math.abs(a.x - b.x) > this.canvas.clientWidth * 0.5) return;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    };
    ctx.font = '10.5px "IBM Plex Sans KR", system-ui, sans-serif';
    ctx.fillStyle = colors.label;
    for (const c of CONSTELLATIONS) {
      const pts = [];
      for (const chain of c.chains) {
        for (let k = 0; k < chain.length - 1; k++) seg(at(chain[k]), at(chain[k + 1]));
        for (const id of chain) {
          const p = at(id);
          if (p.alt < 0) continue;
          const q = P.project(p.alt, p.az);
          if (q.vis) pts.push(q);
        }
      }
      const xs = pts.map((q) => q.x);
      const spread = pts.length ? Math.max(...xs) - Math.min(...xs) : 0;
      if (pts.length >= 2 && spread < this.canvas.clientWidth * 0.5) {
        const lx = xs.reduce((a, b) => a + b, 0) / pts.length;
        const ly = pts.reduce((a, q) => a + q.y, 0) / pts.length;
        ctx.globalAlpha = Math.max(0.25, alpha * 0.7);
        ctx.fillText(c.label, lx + 6, ly + 14);
        ctx.globalAlpha = Math.max(0.15, alpha);
      }
    }
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = colors.grid;
    for (const a of ASTERISMS) for (let k = 0; k < a.chain.length - 1; k++) seg(at(a.chain[k]), at(a.chain[k + 1]));
    ctx.restore();
  }

  _drawStars(ctx, P, frame, alpha, colors) {
    ctx.save();
    for (const st of STARS) {
      const hpos = frame(st.ra, st.dec);
      if (hpos.alt < -1) continue;
      const p = P.project(hpos.alt, hpos.az);
      if (!p.vis) continue;
      const r = Math.max(0.7, 2.9 - 0.55 * st.mag);
      ctx.globalAlpha = Math.min(1, alpha * (st.mag < 2.5 ? 1 : 0.8));
      ctx.fillStyle = STAR_COLORS[st.color] || '#fff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      if (st.mag < 1) {
        ctx.globalAlpha = alpha * 0.25;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (st.name && st.mag < 1.7 && hpos.alt > 3 && alpha > 0.3) {
        ctx.globalAlpha = 0.85 * alpha;
        ctx.fillStyle = colors.text;
        ctx.font = '11px "IBM Plex Sans KR", system-ui, sans-serif';
        ctx.fillText(st.name, p.x + r + 3, p.y - r - 1);
      }
    }
    ctx.globalAlpha = alpha * 0.8;
    ctx.strokeStyle = colors.label;
    for (const d of DEEP_SKY) {
      const hpos = frame(d.ra, d.dec);
      if (hpos.alt < 0) continue;
      const p = P.project(hpos.alt, hpos.az);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, d.id === 'm31' ? 7 : 4, d.id === 'm31' ? 3 : 4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawFov(ctx, P, fov, colors) {
    const pts = frameOutline(fov.az, fov.tilt, fov.hfov, fov.vfov);
    ctx.save();
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    let prev = null;
    for (const q of pts) {
      const p = P.project(q.alt, q.az);
      if (prev && this.mode === 'pano' && Math.abs(p.x - prev.x) > this.canvas.clientWidth * 0.5) {
        ctx.moveTo(p.x, p.y);
      } else if (!prev) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
      prev = p;
    }
    ctx.stroke();
    ctx.restore();
  }

  _drawMarkers(ctx, P, s, colors) {
    ctx.save();
    ctx.font = '11.5px "IBM Plex Sans KR", system-ui, sans-serif';
    const label = (p, text, color, dy = -10) => {
      ctx.fillStyle = color;
      ctx.fillText(text, p.x + 8, p.y + dy);
    };
    // 은하 중심
    if (s.gc && s.gc.alt > -2) {
      const p = P.project(s.gc.alt, s.gc.az);
      ctx.strokeStyle = colors.mw;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.moveTo(p.x - 12, p.y); ctx.lineTo(p.x - 4, p.y);
      ctx.moveTo(p.x + 4, p.y); ctx.lineTo(p.x + 12, p.y);
      ctx.stroke();
      label(p, '은하 중심', colors.mw, 18);
    }
    // 유성우 복사점
    if (s.radiant && s.radiant.alt > -2) {
      const p = P.project(s.radiant.alt, s.radiant.az);
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 1.2;
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(a) * 5, p.y + Math.sin(a) * 5);
        ctx.lineTo(p.x + Math.cos(a) * 13, p.y + Math.sin(a) * 13);
        ctx.stroke();
      }
      label(p, '복사점', colors.accent, 22);
    }
    // 행성
    for (const pl of s.planets) {
      if (pl.alt < -1) continue;
      const p = P.project(pl.alt, pl.az);
      if (!p.vis) continue;
      ctx.fillStyle = pl.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(2.4, 3.6 - 0.35 * pl.mag), 0, Math.PI * 2);
      ctx.fill();
      label(p, pl.name, pl.color, -6);
    }
    // 태양 (지평선 위일 때)
    if (s.sun.alt > -1) {
      const p = P.project(s.sun.alt, s.sun.az);
      ctx.fillStyle = '#ffcf6b';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.fill();
      label(p, '태양', '#ffcf6b', -12);
    }
    // 달
    if (s.moon.alt > -1) {
      const p = P.project(s.moon.alt, s.moon.az);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = 'rgba(40,44,60,0.9)';
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      const path = moonPhasePath(s.moon.phase, 9, s.southern);
      if (path) {
        ctx.fillStyle = colors.moon;
        ctx.fill(new Path2D(path));
      }
      ctx.restore();
      label(p, `달 ${Math.round(s.moon.illum * 100)}%`, colors.moon, -12);
    }
    // 대상 표시
    if (s.target && s.target.alt > -5) {
      const p = P.project(s.target.alt, s.target.az);
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawFrameDecor(ctx, P, w, h, colors) {
    ctx.save();
    ctx.font = '600 12px "IBM Plex Sans KR", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (this.mode === 'dome') {
      ctx.strokeStyle = colors.grid;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(P.cx, P.cy, P.R, 0, Math.PI * 2);
      ctx.stroke();
      for (const [az, name] of CARDINALS) {
        if (az % 90) continue;
        const r = P.R + 12;
        ctx.fillStyle = az === 0 ? colors.accent : colors.text;
        ctx.fillText(name, P.cx - r * Math.sin(az * DEG), P.cy - r * Math.cos(az * DEG));
      }
    } else {
      ctx.fillStyle = colors.ground;
      ctx.fillRect(0, P.skyH, w, h - P.skyH);
      ctx.strokeStyle = colors.grid;
      ctx.beginPath();
      ctx.moveTo(0, P.yOf(0));
      ctx.lineTo(w, P.yOf(0));
      ctx.stroke();
      for (let az = 0; az < 360; az += 15) {
        const p = P.project(0, az);
        if (Math.abs(p.dx) > this.span / 2) continue;
        const named = CARDINALS.find(([a]) => a === az);
        ctx.fillStyle = named ? (az === 0 ? colors.accent : colors.text) : colors.label;
        ctx.font = named ? '600 12px "IBM Plex Sans KR", system-ui, sans-serif' : '10px "IBM Plex Mono", ui-monospace, monospace';
        ctx.fillText(named ? named[1] : `${az}`, p.x, h - 10);
      }
    }
    ctx.restore();
  }
}
