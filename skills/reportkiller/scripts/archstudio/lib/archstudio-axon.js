/* 建築スタジオ：アクソメ・階層の図（GnotoArchStudio.views.axon / layers / structure / stack / floors / sequence）  担当 F3
   ───────────────────────────────────────────────────────────────────────────────
   tools/archdraw/axon/*.py（axgeom・axhlr・axsvg・axhouse・make_axon）と tools/archdraw/layers/*.py（model・archlib・
   floors・exploded・stacksection）を JavaScript に移したもの。外部ライブラリなし。座標はすべて紙の上の mm。
   建物モデル（docs/archstudio/DESIGN.md §2）を toM() で archdraw の M（通り芯・壁の長方形・開口・階段…）に直してから描く。

   views.axon(m, opt)      図1 外観アクソメ（プラノメトリック 30/60、1:100、A3 縦）。opt.explode が真なら layers と同じ
   views.layers(m, opt)    図2 各階の分解アクソメ（基礎・1F・2F・3F・屋根、1:200、A4 縦）
   views.structure(m, opt) 図3 構造と外皮の分解アクソメ（軸組・床・外壁・開口・屋根、1:100、A3 縦）
   views.stack(m, opt)     積層断面 B–B′（階段を通る断面に各階の帯、1:50、A3 横）
   views.floors(m, opt)    階の並べ図（各階平面図を同じ枠で横に並べ、下に属性の表。1:100、A3 横）
   views.sequence(m, opt)  層の分解図（等角投影。軸組→床と階段→外皮→開口→設備→全体の 6 枚、1:200、A3 横）
   opt：scale（図ごとの既定）・title（false で図題なし）・caption（図題の本文）・proj（'plan30'|'plan45'|'iso'）・
        page（false で紙に置かず、図の外接矩形で切る）・accent（false で強調色なし）
   返り値は SVG 文字列（width/height は mm、viewBox は紙の mm）。
   線の体系・色・文字は tools/archdraw/SPEC.md §1・§2（黒 #1A1A1A・灰 #8C9493・強調 #943522、文字 2.0／2.5／3.5）。
   要素の鍵（archstudio-check.js）：ad-visible（輪郭）・ad-hidden（破線）・ad-layer-label・ad-dim・ad-north・ad-scalebar・
   ad-scale-text・ad-title。 */
(function(){
'use strict';
const A = window.GnotoArchStudio || window.GnotoArch || (window.GnotoArch = {});
if (!window.GnotoArchStudio) window.GnotoArchStudio = A;
if (A.views && A.views.axonVersion >= 2) return;

const INK = '#1A1A1A', GREY = '#8C9493', ACCENT = '#943522', WHITE = '#FFFFFF';
const FONT = "'Noto Sans JP','IPAGothic','Helvetica Neue',Arial,sans-serif";
const T_NOTE = 2.0, T_ROOM = 2.5, T_TITLE = 3.5;
function sourceOf(M) { return '筆者作成' + (M && M.name ? '（題材：' + M.name + '）' : ''); }   // 以前は『archdraw SPEC §4 の架空の住戸』と決め打ち
const arr = (x) => Array.isArray(x) ? x : [];
const num = (v, d) => { const n = +v; return isFinite(n) ? n : d; };

function fmt(v) { let s = (+v).toFixed(3).replace(/0+$/, '').replace(/\.$/, ''); if (s === '-0' || s === '') s = '0'; return s; }
function fmtmm(v) { return Math.round(v).toLocaleString('en-US'); }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
/* IPAGothic（等幅）を前提にした幅の見積り：全角 1em・半角 0.5em（archlib は半角 0.56em） */
function textWidth(s, size, half) {
  half = half || 0.5; let w = 0;
  for (const ch of String(s)) { const o = ch.codePointAt(0); if (o < 0x2000 || (o >= 0xFF61 && o <= 0xFF9F)) w += half; else if (ch === ' ' || ch === '　') w += half === 0.5 ? 0.5 : 0.2; else w += 1.0; }
  return w * size;
}

/* ═══════════════════════════════ 投影と幾何（axgeom.py） ═══════════════════════════════
   世界は mm。x＝東、y＝北、z＝上（GL＝0）。紙は SVG の座標（mm、右が +u、下が +y）。平行投影（アフィン）。 */
const V = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  unit: (a) => { const n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n]; }
};
const PROJECTIONS = {
  plan30: { kind: 'planometric', angle: 30, label: 'プラノメトリック 30/60',
    how: '平面を実形のまま 30 度まわし、高さも同じ縮尺で立ち上げた（幅・奥行・高さの 3 方向とも寸法が読める）。' },
  plan45: { kind: 'planometric', angle: 45, label: 'プラノメトリック 45/45',
    how: '平面を実形のまま 45 度まわし、高さも同じ縮尺で立ち上げた（幅・奥行・高さの 3 方向とも寸法が読める）。' },
  iso: { kind: 'iso_drawing', angle: 30, label: '等角図',
    how: '3 軸を 120 度ずつに開き、3 軸の向きの長さを実長で描いた（寸法は軸の向きだけ読める）。' }
};
function projOf(opt) {
  const k = (opt && opt.proj) || ((opt && (opt.angle === 'iso' || opt.angle === 'isometric')) ? 'iso' : (opt && (opt.angle === '45/45' || opt.angle === 45)) ? 'plan45' : 'plan30');
  return PROJECTIONS[k] || PROJECTIONS.plan30;
}

/* 平行投影。kind：planometric（平面を angle 度まわして立ち上げる）・iso_drawing（等角図、実長）・isometric（等角投影、0.8165）。
   いずれも南西の上から見下ろす（見える面は 上・南・西）。 */
class Projection {
  constructor(kind, angle, scale, origin) {
    this.kind = kind || 'planometric'; this.angle = angle == null ? 30 : angle; this.scale = +scale || 100;
    this.ox = origin ? origin[0] : 0; this.oy = origin ? origin[1] : 0;
    let r0, r1;
    if (this.kind === 'planometric') { const a = this.angle * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); r0 = [c, -s, 0]; r1 = [s, c, 1]; }
    else if (this.kind === 'iso_drawing') { const c = Math.cos(Math.PI / 6); r0 = [c, -c, 0]; r1 = [0.5, 0.5, 1]; }
    else { const k = Math.sqrt(2 / 3), c = Math.cos(Math.PI / 6); r0 = [c * k, -c * k, 0]; r1 = [0.5 * k, 0.5 * k, k]; }
    this.r0 = r0; this.r1 = r1;
    let w = V.cross(r0, r1); if (w[2] < 0) w = V.mul(w, -1);
    this.w = V.unit(w);   // 見る人のいる側（上・南西）を向く
  }
  p(P) { const u = V.dot(this.r0, P) / this.scale + this.ox, v = V.dot(this.r1, P) / this.scale; return [u, this.oy - v]; }
  depth(P) { return V.dot(this.w, P); }   // 見る人に近いほど大きい（世界 mm）
  axisVectors() { const o = this.p([0, 0, 0]), out = {}; [['x', [1000, 0, 0]], ['y', [0, 1000, 0]], ['z', [0, 0, 1000]]].forEach(([n, d]) => { const q = this.p(d); out[n] = [q[0] - o[0], q[1] - o[1]]; }); return out; }
}

function area2(poly) { let s = 0; const n = poly.length; for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return 0.5 * s; }
function bbox2(pts) { let x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18; for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[0] > x1) x1 = p[0]; if (p[1] > y1) y1 = p[1]; } return [x0, y0, x1, y1]; }
function ccw(poly) { return area2(poly) < 0 ? poly.slice().reverse() : poly.slice(); }
function pointInConvex(pt, poly, eps) {
  eps = eps == null ? 1e-9 : eps; const x = pt[0], y = pt[1], n = poly.length;
  for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; if ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) < -eps) return false; }
  return true;
}
/* 線分 a→b のうち凸多角形の中にある区間 [t0,t1]（無ければ null）。Cyrus–Beck */
function clipSegmentConvex(a, b, poly) {
  let t0 = 0, t1 = 1; const dx = b[0] - a[0], dy = b[1] - a[1], n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n], ex = q[0] - p[0], ey = q[1] - p[1];
    const nu = ex * (a[1] - p[1]) - ey * (a[0] - p[0]), de = ex * dy - ey * dx;
    if (Math.abs(de) < 1e-14) { if (nu < 0) return null; continue; }
    const t = -nu / de;
    if (de > 0) { if (t > t0) t0 = t; } else { if (t < t1) t1 = t; }
    if (t0 > t1) return null;
  }
  return [t0, t1];
}
/* Sutherland–Hodgman。両方とも area2>0 の向き */
function clipPolyConvex(subject, clipper) {
  let out = subject.slice(); const n = clipper.length;
  for (let i = 0; i < n && out.length; i++) {
    const p1 = clipper[i], p2 = clipper[(i + 1) % n], ex = p2[0] - p1[0], ey = p2[1] - p1[1];
    const side = (p) => ex * (p[1] - p1[1]) - ey * (p[0] - p1[0]);
    const inter = (p, q) => { const ap = side(p), aq = side(q), t = ap / (ap - aq); return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; };
    const inp = out; out = []; const m = inp.length;
    for (let j = 0; j < m; j++) {
      const p = inp[j], q = inp[(j + 1) % m], pin = side(p) >= -1e-12, qin = side(q) >= -1e-12;
      if (pin) { out.push(p); if (!qin) out.push(inter(p, q)); } else if (qin) out.push(inter(p, q));
    }
  }
  return out;
}
function centroid2(poly) {
  const a = area2(poly), n = poly.length;
  if (Math.abs(a) < 1e-12) { let sx = 0, sy = 0; poly.forEach(p => { sx += p[0]; sy += p[1]; }); return [sx / n, sy / n]; }
  let cx = 0, cy = 0;
  for (let i = 0; i < n; i++) { const p = poly[i], q = poly[(i + 1) % n], f = p[0] * q[1] - q[0] * p[1]; cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f; }
  return [cx / (6 * a), cy / (6 * a)];
}
/* 2D の 3 点とその値 d から、d = a*u + b*v + c を解く */
function affineFrom3(p2, d) {
  const [u1, v1] = p2[0], [u2, v2] = p2[1], [u3, v3] = p2[2];
  const det = (u2 - u1) * (v3 - v1) - (u3 - u1) * (v2 - v1);
  if (Math.abs(det) < 1e-12) return null;
  const a = ((d[1] - d[0]) * (v3 - v1) - (d[2] - d[0]) * (v2 - v1)) / det;
  const b = ((u2 - u1) * (d[2] - d[0]) - (u3 - u1) * (d[1] - d[0])) / det;
  return [a, b, d[0] - a * u1 - b * v1];
}
function pointInPoly(x, y, poly) {
  let inside = false; const n = poly.length;
  for (let i = 0; i < n; i++) { const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % n]; if ((y1 > y) !== (y2 > y) && x < x1 + (y - y1) * (x2 - x1) / (y2 - y1)) inside = !inside; }
  return inside;
}
function convexHull(pts) {
  const P = Array.from(new Set(pts.map(p => (Math.round(p[0] * 1e4) / 1e4) + ',' + (Math.round(p[1] * 1e4) / 1e4)))).map(s => s.split(',').map(Number)).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (P.length < 3) return P;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return ccw(lo.slice(0, -1).concat(up.slice(0, -1)));
}

/* ═══════════════════════════════ 隠れ線の処理（axhlr.py） ═══════════════════════════════
   1. 立体は凸の平面多角形の面の集まり（箱・板）。見る向き w に向いた面だけを残す。
   2. 線（面の縁と細部の線）は、手前にある面で隠れる区間を正確に切り取る（区間の中で奥行きの差は一次式）。
   3. 見える区間を、線の両側のすぐ外の点で「いちばん手前の面」を調べて分類：輪郭（sil）・稜線（edge）・目地（joint）・無し。
   4. 面の塗りは画家のアルゴリズム（重なりの中の 1 点で前後を比べた有向グラフのトポロジカル順）。 */
const CAP_RANK = { ctx: 0, thin: 1, mid: 2, main: 3 };
class Solid { constructor(group, part, cap, name) { this.faces = []; this.group = group; this.part = part; this.cap = cap || 'main'; this.name = name || ''; } }
class Face {
  constructor(P, n, tone, solid, accent, twoSided) { this.P = P; this.n = n; this.d = V.dot(n, P[0]); this.tone = tone; this.solid = solid; this.accent = !!accent; this.twoSided = !!twoSided; this.p2 = null; this.bb = null; this.dep = null; this.idx = -1; this.cdep = 0; }
}
function faceDir(n) {
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  if (az >= ax && az >= ay) return n[2] > 0 ? 'top' : 'bottom';
  if (ay >= ax) return n[1] < 0 ? 'south' : 'north';
  return n[0] < 0 ? 'west' : 'east';
}
const TONE_DEF = { top: 'top', bottom: 'top', south: 'south', north: 'south', west: 'west', east: 'west' };
let SOLID_SEQ = 0;

class Scene {
  constructor(proj) { this.proj = proj; this.solids = []; this.details = []; this.boxes = []; this.faces = []; this.grid = new Map(); this.cell = 4; this.cycles = 0; }
  /* 軸に平行な箱。tones は {top,south,west,...} の上書き。accent は強調色の輪郭にする面の向きの組 */
  box(x0, x1, y0, y1, z0, z1, group, o) {
    o = o || {};
    if (x1 < x0) [x0, x1] = [x1, x0]; if (y1 < y0) [y0, y1] = [y1, y0]; if (z1 < z0) [z0, z1] = [z1, z0];
    if (x1 - x0 < 1e-6 || y1 - y0 < 1e-6 || z1 - z0 < 1e-6) return null;
    const s = new Solid(group, o.part != null ? o.part : (o.name || ('s' + (++SOLID_SEQ))), o.cap, o.name);
    const t = Object.assign({}, TONE_DEF, o.tones || {}), acc = o.accent || [];
    const fs = [
      ['bottom', [0, 0, -1], [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]]],
      ['top', [0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]],
      ['south', [0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]],
      ['north', [0, 1, 0], [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]],
      ['west', [-1, 0, 0], [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]]],
      ['east', [1, 0, 0], [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]]];
    fs.forEach(([key, n, P]) => s.faces.push(new Face(P, n, t[key], s, acc.indexOf(key) >= 0, false)));
    this.solids.push(s);
    if (o.check !== false) this.boxes.push([x0, x1, y0, y1, z0, z1, o.name || String(s.part), group]);
    return s;
  }
  /* 1 枚の凸の平面多角形（両面） */
  panel(P, group, o) {
    o = o || {};
    const s = new Solid(group, o.part != null ? o.part : (o.name || ('s' + (++SOLID_SEQ))), o.cap, o.name);
    const n = V.unit(V.cross(V.sub(P[1], P[0]), V.sub(P[2], P[0])));
    s.faces.push(new Face(P.map(q => q.slice()), n, o.tone || 'top', s, !!o.accent, true));
    this.solids.push(s); return s;
  }
  /* 凸の底面 base を hVec だけ押し出した角柱 */
  prism(base, hVec, group, o) {
    o = o || {};
    const s = new Solid(group, o.part != null ? o.part : (o.name || ('s' + (++SOLID_SEQ))), o.cap, o.name);
    let top = base.map(b => V.add(b, hVec)), n0 = V.unit(V.cross(V.sub(base[1], base[0]), V.sub(base[2], base[0])));
    if (V.dot(n0, hVec) > 0) { base = base.slice().reverse(); top = top.slice().reverse(); n0 = V.mul(n0, -1); }
    const td = o.tones || {}, toneOf = (n) => { const k = faceDir(n); return td[k] || TONE_DEF[k]; };
    s.faces.push(new Face(base.slice(), n0, toneOf(n0), s));
    const n1 = V.mul(n0, -1); s.faces.push(new Face(top.slice(), n1, toneOf(n1), s));
    const m = base.length, c = [0, 1, 2].map(k => base.reduce((acc, q) => acc + q[k], 0) / m);
    for (let i = 0; i < m; i++) {
      const a = base[i], b = base[(i + 1) % m], P = [a, b, top[(i + 1) % m], top[i]];
      let n = V.unit(V.cross(V.sub(P[1], P[0]), V.sub(P[3], P[0])));
      if (V.dot(n, V.sub(a, c)) < 0) n = V.mul(n, -1);
      s.faces.push(new Face(P, n, toneOf(n), s));
    }
    this.solids.push(s); return s;
  }
  line(P0, P1, style, hidden) { this.details.push({ P0: P0.slice(), P1: P1.slice(), style, hidden: hidden || null }); }
  polyline(pts, style, closed, hidden) { const n = pts.length; for (let i = 0; i < (closed ? n : n - 1); i++) this.line(pts[i], pts[(i + 1) % n], style, hidden); }
  /* 体積をもって重なる箱の組（部材が食い込んでいると前後関係が崩れるので 0 にする） */
  overlappingBoxes(tol) {
    tol = tol == null ? 0.5 : tol; const bad = [], B = this.boxes;
    for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
      const a = B[i], b = B[j]; if (a[7] !== b[7]) continue;
      if (Math.min(a[1], b[1]) - Math.max(a[0], b[0]) > tol && Math.min(a[3], b[3]) - Math.max(a[2], b[2]) > tol && Math.min(a[5], b[5]) - Math.max(a[4], b[4]) > tol) bad.push([a[6], b[6]]);
    }
    return bad;
  }
  /* 2 つの立体が接する面（向きが逆で同じ平面にあり、相手の面に覆われる面）：塗りからも隠す面からも除く */
  _internalFaces() {
    const idx = new Map();
    for (const s of this.solids) for (const f of s.faces) {
      const ax = [0, 1, 2].filter(i => Math.abs(f.n[i]) > 0.999);
      if (ax.length !== 1 || f.twoSided) continue;
      const a = ax[0], key = a + ':' + Math.round(f.P[0][a] * 10) / 10;
      const lo = [0, 1, 2].map(i => Math.min(...f.P.map(q => q[i]))), hi = [0, 1, 2].map(i => Math.max(...f.P.map(q => q[i])));
      if (!idx.has(key)) idx.set(key, []);
      idx.get(key).push({ f, pos: f.n[a] > 0, lo, hi });
    }
    const out = new Set();
    for (const [key, L] of idx) {
      const a = +key.split(':')[0], o = [0, 1, 2].filter(i => i !== a);
      for (const e of L) for (const g of L) {
        if (g.pos === e.pos || g.f.solid === e.f.solid) continue;
        if (o.every(i => g.lo[i] <= e.lo[i] + 0.5 && g.hi[i] >= e.hi[i] - 0.5)) { out.add(e.f); break; }
      }
    }
    return out;
  }
  solve(sample, delta, cell) {
    sample = sample || 0.2; delta = delta || 0.03; cell = cell || 4.0;
    const pr = this.proj, w = pr.w, faces = [], internal = this._internalFaces();
    for (const s of this.solids) for (const f of s.faces) {
      if (internal.has(f)) continue;
      let nd = V.dot(f.n, w);
      if (f.twoSided && nd < 0) { f.n = V.mul(f.n, -1); f.d = -f.d; nd = -nd; }
      if (nd <= 1e-9) continue;
      const p2 = f.P.map(q => pr.p(q)); if (Math.abs(area2(p2)) < 1e-7) continue;
      f.p2 = ccw(p2); f.bb = bbox2(f.p2);
      const deps = f.P.map(q => pr.depth(q)), m = p2.length; let coef = null;
      for (let i = 0; i < m && !coef; i++) for (let j = i + 1; j < m && !coef; j++) for (let k = j + 1; k < m && !coef; k++) coef = affineFrom3([p2[i], p2[j], p2[k]], [deps[i], deps[j], deps[k]]);
      if (!coef) continue;
      f.dep = coef; f.idx = faces.length; faces.push(f);
    }
    this.faces = faces; this.cell = cell; this._grid();
    // 線の候補：表の面の縁（重複を除く）
    const edges = new Map(), key3 = (q) => q.map(c => Math.round(c * 100) / 100).join(',');
    for (const f of faces) { const m = f.P.length; for (let i = 0; i < m; i++) { const Aq = f.P[i], Bq = f.P[(i + 1) % m], ka = key3(Aq), kb = key3(Bq); if (ka === kb) continue; const key = ka < kb ? ka + '|' + kb : kb + '|' + ka; let e = edges.get(key); if (!e) { e = { A: Aq, B: Bq, owners: [] }; edges.set(key, e); } e.owners.push(f); } }
    const lines = [];
    for (const e of edges.values()) {
      const vis = this._visible(e.A, e.B); if (!vis.length) continue;
      const caps = Math.max(...e.owners.map(o => CAP_RANK[o.solid.cap])), accent = e.owners.some(o => o.accent);
      const a2 = pr.p(e.A), b2 = pr.p(e.B);
      for (const [t0, t1] of vis) for (const [s0, s1, cls0] of this._classify(a2, b2, t0, t1, sample, delta)) {
        if (cls0 == null) continue; let cls = cls0;
        if (caps === 0) cls = 'ctx'; else if (caps === 1) cls = 'thin'; else if (caps === 2 && cls === 'sil') cls = 'edge';
        lines.push([[a2[0] + (b2[0] - a2[0]) * s0, a2[1] + (b2[1] - a2[1]) * s0], [a2[0] + (b2[0] - a2[0]) * s1, a2[1] + (b2[1] - a2[1]) * s1], cls, accent]);
      }
    }
    const dlines = [];
    for (const dl of this.details) {
      const vis = this._visible(dl.P0, dl.P1), a2 = pr.p(dl.P0), b2 = pr.p(dl.P1);
      const seg = (t0, t1, st) => dlines.push([[a2[0] + (b2[0] - a2[0]) * t0, a2[1] + (b2[1] - a2[1]) * t0], [a2[0] + (b2[0] - a2[0]) * t1, a2[1] + (b2[1] - a2[1]) * t1], st]);
      for (const [t0, t1] of vis) seg(t0, t1, dl.style);
      if (dl.hidden) for (const [t0, t1] of complement(vis)) if (t1 - t0 >= 1e-6) seg(t0, t1, dl.hidden);
    }
    return { fills: this._paintOrder(), lines, details: dlines };
  }
  _grid() {
    const grid = new Map(), cell = this.cell;
    for (const f of this.faces) { const [x0, y0, x1, y1] = f.bb; for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++) for (let gy = Math.floor(y0 / cell); gy <= Math.floor(y1 / cell); gy++) { const k = gx + ',' + gy; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(f.idx); } }
    this.grid = grid;
  }
  _cands(bb) { const cell = this.cell, out = new Set(); for (let gx = Math.floor(bb[0] / cell); gx <= Math.floor(bb[2] / cell); gx++) for (let gy = Math.floor(bb[1] / cell); gy <= Math.floor(bb[3] / cell); gy++) { const L = this.grid.get(gx + ',' + gy); if (L) L.forEach(i => out.add(i)); } return out; }
  _visible(Aq, Bq, eps) {
    eps = eps == null ? 0.5 : eps; const pr = this.proj, a2 = pr.p(Aq), b2 = pr.p(Bq), L2 = Math.hypot(b2[0] - a2[0], b2[1] - a2[1]);
    if (L2 < 1e-6) return [];
    const dA = pr.depth(Aq), dB = pr.depth(Bq), bb = [Math.min(a2[0], b2[0]), Math.min(a2[1], b2[1]), Math.max(a2[0], b2[0]), Math.max(a2[1], b2[1])], occ = [];
    for (const fi of this._cands(bb)) {
      const f = this.faces[fi];
      if (f.bb[0] > bb[2] || f.bb[2] < bb[0] || f.bb[1] > bb[3] || f.bb[3] < bb[1]) continue;
      if (Math.abs(V.dot(f.n, Aq) - f.d) < eps && Math.abs(V.dot(f.n, Bq) - f.d) < eps) continue;   // 線がその面の平面の上
      const r = clipSegmentConvex(a2, b2, f.p2); if (!r) continue;
      const [t0, t1] = r; if (t1 - t0 < 1e-9) continue;
      const [a, b, c] = f.dep, g = (t) => (a * (a2[0] + (b2[0] - a2[0]) * t) + b * (a2[1] + (b2[1] - a2[1]) * t) + c) - (dA + (dB - dA) * t);
      const g0 = g(t0), g1 = g(t1);
      if (g0 <= eps && g1 <= eps) continue;
      if (g0 > eps && g1 > eps) occ.push([t0, t1]);
      else { const tm = t0 + (t1 - t0) * (eps - g0) / (g1 - g0); occ.push(g0 > eps ? [t0, tm] : [tm, t1]); }
    }
    const mn = 0.02 / L2;
    return complement(mergeIv(occ)).filter(([s, e]) => e - s > mn);
  }
  frontmost(q) {
    const cell = this.cell, L = this.grid.get(Math.floor(q[0] / cell) + ',' + Math.floor(q[1] / cell)); if (!L) return null;
    let best = null, bd = -1e30;
    for (const fi of L) { const f = this.faces[fi], bb = f.bb; if (q[0] < bb[0] || q[0] > bb[2] || q[1] < bb[1] || q[1] > bb[3]) continue; if (pointInConvex(q, f.p2, 1e-9)) { const d = f.dep[0] * q[0] + f.dep[1] * q[1] + f.dep[2]; if (d > bd) { bd = d; best = f; } } }
    return best;
  }
  _clsAt(a2, b2, t, nx, ny, delta) {
    const q = [a2[0] + (b2[0] - a2[0]) * t, a2[1] + (b2[1] - a2[1]) * t];
    const FL = this.frontmost([q[0] + nx * delta, q[1] + ny * delta]), FR = this.frontmost([q[0] - nx * delta, q[1] - ny * delta]);
    if (!FL || !FR) return 'sil';
    if (FL.solid.group !== FR.solid.group) return 'sil';
    if (FL === FR) return null;
    if (Math.abs(FL.n[0] - FR.n[0]) < 1e-6 && Math.abs(FL.n[1] - FR.n[1]) < 1e-6 && Math.abs(FL.n[2] - FR.n[2]) < 1e-6 && Math.abs(FL.d - FR.d) < 0.5) { if (FL.solid.part === FR.solid.part && FL.tone === FR.tone) return null; return 'joint'; }
    return 'edge';
  }
  _classify(a2, b2, t0, t1, sample, delta) {
    const L2 = Math.hypot(b2[0] - a2[0], b2[1] - a2[1]), nx = -(b2[1] - a2[1]) / L2, ny = (b2[0] - a2[0]) / L2;
    const n = Math.max(2, Math.ceil((t1 - t0) * L2 / sample)), ts = [], cl = [];
    for (let i = 0; i < n; i++) { ts.push(t0 + (t1 - t0) * (i + 0.5) / n); cl.push(this._clsAt(a2, b2, ts[i], nx, ny, delta)); }
    const out = []; let start = t0;
    for (let i = 1; i < n; i++) if (cl[i] !== cl[i - 1]) {
      let lo = ts[i - 1], hi = ts[i];
      for (let k = 0; k < 12; k++) { const mid = 0.5 * (lo + hi); if (this._clsAt(a2, b2, mid, nx, ny, delta) === cl[i - 1]) lo = mid; else hi = mid; }
      out.push([start, 0.5 * (lo + hi), cl[i - 1]]); start = 0.5 * (lo + hi);
    }
    out.push([start, t1, cl[n - 1]]); return out;
  }
  _paintOrder(eps) {
    eps = eps == null ? 0.5 : eps;
    const faces = this.faces.filter(f => f.tone != null), n = faces.length, loc = new Map(); faces.forEach((f, i) => loc.set(f.idx, i));
    const succ = faces.map(() => new Set()), indeg = new Array(n).fill(0), seen = new Set();
    for (const L of this.grid.values()) {
      const ids = L.filter(i => loc.has(i)).map(i => loc.get(i));
      for (let ii = 0; ii < ids.length; ii++) for (let jj = ii + 1; jj < ids.length; jj++) {
        const i = ids[ii], j = ids[jj], key = i < j ? i * 100000 + j : j * 100000 + i; if (seen.has(key)) continue; seen.add(key);
        const fi = faces[i], fj = faces[j];
        if (fi.bb[0] >= fj.bb[2] || fj.bb[0] >= fi.bb[2] || fi.bb[1] >= fj.bb[3] || fj.bb[1] >= fi.bb[3]) continue;
        const inter = clipPolyConvex(fi.p2, fj.p2); if (inter.length < 3 || Math.abs(area2(inter)) < 1e-5) continue;
        const c = centroid2(inter), di = fi.dep[0] * c[0] + fi.dep[1] * c[1] + fi.dep[2], dj = fj.dep[0] * c[0] + fj.dep[1] * c[1] + fj.dep[2];
        if (di > dj + eps) { if (!succ[j].has(i)) { succ[j].add(i); indeg[i]++; } } else if (dj > di + eps) { if (!succ[i].has(j)) { succ[i].add(j); indeg[j]++; } }
      }
    }
    faces.forEach(f => { const c = centroid2(f.p2); f.cdep = f.dep[0] * c[0] + f.dep[1] * c[1] + f.dep[2]; });
    // 最小ヒープ（奥行きが小さい＝奥のものから）
    const heap = []; const push = (it) => { heap.push(it); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    for (let i = 0; i < n; i++) if (indeg[i] === 0) push([faces[i].cdep, i]);
    const done = new Array(n).fill(false), order = []; this.cycles = 0;
    while (order.length < n) {
      if (!heap.length) { this.cycles++; let bi = -1; for (let i = 0; i < n; i++) if (!done[i] && (bi < 0 || faces[i].cdep < faces[bi].cdep)) bi = i; indeg[bi] = 0; push([faces[bi].cdep, bi]); }
      const [, i] = pop(); if (done[i]) continue; done[i] = true; order.push(i);
      for (const j of succ[i]) { indeg[j]--; if (indeg[j] <= 0 && !done[j]) push([faces[j].cdep, j]); }
    }
    return order.map(i => [faces[i].p2, faces[i].tone]);
  }
}
function mergeIv(iv) { if (!iv.length) return []; iv = iv.slice().sort((a, b) => a[0] - b[0]); const out = [iv[0].slice()]; for (let i = 1; i < iv.length; i++) { const [s, e] = iv[i]; if (s <= out[out.length - 1][1] + 1e-12) { if (e > out[out.length - 1][1]) out[out.length - 1][1] = e; } else out.push([s, e]); } return out; }
function complement(iv) { const out = []; let t = 0; for (let [s, e] of iv) { s = Math.max(0, s); e = Math.min(1, e); if (s > t) out.push([t, s]); t = Math.max(t, e); } if (t < 1) out.push([t, 1]); return out; }

/* ═══════════════════════════════ SVG の書き出しと注記（axsvg.py） ═══════════════════════════════ */
const TONES = { top: '#FFFFFF', south: '#EDEDED', west: '#CDCDCD', glass: '#A8A8A8', cut: INK, ctx: '#FFFFFF', none: null };
/* 線の段（紙の mm）。ISO 128 の系列から。縮尺に合わせて段をずらす */
const WEIGHTS = {
  50: { sil: 0.70, edge: 0.35, joint: 0.18, thin: 0.13, ctx: 0.13, accent: 0.50 },
  100: { sil: 0.50, edge: 0.25, joint: 0.13, thin: 0.13, ctx: 0.13, accent: 0.35 },
  200: { sil: 0.35, edge: 0.18, joint: 0.13, thin: 0.13, ctx: 0.13, accent: 0.25 }
};
function weightsFor(scale) { return WEIGHTS[scale] || (scale <= 75 ? WEIGHTS[50] : scale < 150 ? WEIGHTS[100] : WEIGHTS[200]); }

class Sheet {
  constructor(w, h, scale, margin) {
    this.w = w; this.h = h; this.scale = scale; this.margin = margin == null ? 12 : margin;
    this.layers = { fills: [], lines: [], hidden: [], details: [], notes: [], text: [] };
    this.texts = []; this.leaders = []; this.wt = weightsFor(scale); this.defs = []; this._id = 0; this.prefix = 'ax' + (++SOLID_SEQ) + '_';
  }
  addResult(res) {
    const out = this.layers.fills;
    for (const [poly, tone] of res.fills) { const col = TONES[tone]; if (col == null) continue; const d = 'M' + poly.map(p => fmt(p[0]) + ' ' + fmt(p[1])).join(' L') + ' Z'; out.push('<path d="' + d + '" fill="' + col + '" stroke="' + col + '" stroke-width="0.1" stroke-linejoin="round"/>'); }
    const order = ['ctx', 'joint', 'thin', 'edge', 'sil'], by = {}, acc = {}; order.forEach(k => { by[k] = []; acc[k] = []; });
    for (const [p0, p1, cls, accent] of res.lines) (accent ? acc : by)[cls].push([p0, p1]);
    const L = this.layers.lines;
    for (const k of order) if (by[k].length) L.push(this._path(by[k], k === 'ctx' ? GREY : INK, this.wt[k]));
    for (const k of order) if (acc[k].length) L.push(this._path(acc[k], ACCENT, Math.max(this.wt[k], this.wt.accent)));
    const groups = {};
    for (const [p0, p1, st] of res.details) (groups[st] = groups[st] || []).push([p0, p1]);
    for (const st in groups) { const [col, w, dash] = this.style(st); (dash ? this.layers.hidden : this.layers.details).push(this._path(groups[st], col, w, dash)); }
  }
  /* 細部の線の種類 → [色, 太さ, dasharray] */
  style(st) {
    const wt = this.wt, t = {
      thin: [INK, wt.thin, null], joint: [INK, wt.joint, null], edge: [INK, wt.edge, null], sil: [INK, wt.sil, null], ctx: [GREY, wt.ctx, null],
      ctxdash: [GREY, wt.ctx, '1.6 0.8'],
      guide: [INK, 0.18, '2.2 0.6'],            // 分解の案内線（破線。ISO：線分 12d・すき間 3d）
      hidden: [INK, 0.18, '1.2 0.6'],           // 隠れ線・上部の輪郭
      chain: [INK, 0.13, '4 0.8 0.5 0.8'],      // 通り芯・中心線（一点鎖線）
      chainctx: [GREY, 0.13, '4 0.8 0.5 0.8'],
      phantom: [GREY, 0.13, '4 0.8 0.5 0.8 0.5 0.8'],  // 敷地境界（二点鎖線）
      accent: [ACCENT, wt.edge, null], accentdash: [ACCENT, 0.18, '1.2 0.6']
    };
    return t[st] || t.thin;
  }
  _path(segs, col, width, dash) {
    const parts = segs.map(([a, b]) => 'M' + fmt(a[0]) + ' ' + fmt(a[1]) + 'L' + fmt(b[0]) + ' ' + fmt(b[1]));
    return '<path d="' + parts.join('') + '" fill="none" stroke="' + col + '" stroke-width="' + fmt(width) + '" stroke-linecap="round" stroke-linejoin="round"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>';
  }
  line(a, b, width, col, dash, layer) {
    this.layers[layer || 'notes'].push('<line x1="' + fmt(a[0]) + '" y1="' + fmt(a[1]) + '" x2="' + fmt(b[0]) + '" y2="' + fmt(b[1]) + '" stroke="' + (col || INK) + '" stroke-width="' + fmt(width == null ? 0.13 : width) + '"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>');
  }
  poly(pts, width, col, fill, closed, layer, dash) {
    width = width == null ? 0.13 : width;
    this.layers[layer || 'notes'].push('<' + (closed ? 'polygon' : 'polyline') + ' points="' + pts.map(p => fmt(p[0]) + ',' + fmt(p[1])).join(' ') + '" fill="' + (fill || 'none') + '" stroke="' + (width > 0 ? (col || INK) : 'none') + '" stroke-width="' + fmt(width) + '" stroke-linejoin="miter"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>');
  }
  circle(c, r, width, fill, col, layer) {
    width = width == null ? 0.13 : width;
    this.layers[layer || 'notes'].push('<circle cx="' + fmt(c[0]) + '" cy="' + fmt(c[1]) + '" r="' + fmt(r) + '" fill="' + (fill || 'none') + '" stroke="' + (width > 0 ? (col || INK) : 'none') + '" stroke-width="' + fmt(width) + '"/>');
  }
  text(x, y, s, size, weight, anchor, col, check, cls) {
    size = size || 2.0; anchor = anchor || 'start';
    this.layers.text.push('<text' + (cls ? ' class="' + cls + '"' : '') + ' x="' + fmt(x) + '" y="' + fmt(y) + '" font-size="' + fmt(size) + '"' + (weight >= 700 ? ' font-weight="700"' : '') + ' text-anchor="' + anchor + '" fill="' + (col || INK) + '">' + esc(s) + '</text>');
    const w = textWidth(s, size), x0 = anchor === 'start' ? x : anchor === 'middle' ? x - w / 2 : x - w;
    const bb = [x0, y - size * 0.88, x0 + w, y + size * 0.12, s];
    if (check !== false) this.texts.push(bb);
    return bb;
  }
  /* 引出線：対象の上の黒丸 → 折れ点 → 文字の手前。細線 0.13 */
  leader(anchor, elbow, end, dot) {
    const pts = [anchor].concat(elbow ? [elbow] : [], [end]);
    this.poly(pts, 0.13); this.circle(anchor, dot == null ? 0.35 : dot, 0, INK); this.leaders.push(pts);
  }
  /* 実寸の目盛りのスケールバー（白黒の交互）。x,y は左下 */
  scalebar(x, y, meters, ticks, labelEvery, h) {
    h = h || 1.0; const mmPerM = 1000 / this.scale, n = Math.round(meters / ticks);
    this.layers.notes.push('<g class="ad-scalebar">');
    for (let i = 0; i < n; i++) { const x0 = x + i * ticks * mmPerM, x1 = x0 + ticks * mmPerM; this.poly([[x0, y - h], [x1, y - h], [x1, y], [x0, y]], 0.13, INK, i % 2 === 0 ? INK : WHITE, true); }
    this.layers.notes.push('</g>');
    labelEvery = labelEvery || ticks;
    for (let k = 0; k <= meters + 1e-9; k += labelEvery) { const lab = String(+k.toFixed(6)) + (Math.abs(k - meters) < 1e-9 ? ' m' : ''); this.text(x + k * mmPerM, y + 2.6, lab, 2.0, 400, k === 0 ? 'start' : 'middle', INK, true, 'ad-scale-text'); }
  }
  /* 方位記号：平面の上の北（y の正）を投影した向きの矢印と N */
  north(proj, c, L) {
    L = L || 9; const o = proj.p([0, 0, 0]), q = proj.p([0, 1000, 0]); let dx = q[0] - o[0], dy = q[1] - o[1]; const n = Math.hypot(dx, dy); dx /= n; dy /= n;
    const a = [c[0] - dx * L / 2, c[1] - dy * L / 2], b = [c[0] + dx * L / 2, c[1] + dy * L / 2];
    this.layers.notes.push('<g class="ad-north">'); this.line(a, b, 0.25);
    const px = -dy, py = dx, hl = 2.2, hw = 0.8;
    this.poly([b, [b[0] - dx * hl + px * hw, b[1] - dy * hl + py * hw], [b[0] - dx * hl - px * hw, b[1] - dy * hl - py * hw]], 0, INK, INK, true);
    this.layers.notes.push('</g>');
    this.text(b[0] + dx * 2.6, b[1] + dy * 2.6 + 0.8, 'N', 2.5, 400, 'middle');
  }
  caption(x, y, numStr, title, lines) {
    this.text(x, y, numStr, 3.5, 700, 'start', INK, true, 'ad-title');
    this.text(x + textWidth(numStr, 3.5) + 3.5, y, title, 3.5, 400, 'start', INK, true, 'ad-title');
    let yy = y + 4.6; for (const s of (lines || [])) { this.text(x, yy, s, 2.0); yy += 3.2; } return yy;
  }
  svg(title, opt) {
    opt = opt || {};
    let X = 0, Y = 0, W = this.w, H = this.h;
    if (opt.crop) { const b = opt.crop, m = opt.cropMargin == null ? 6 : opt.cropMargin; X = b[0] - m; Y = b[1] - m; W = b[2] - b[0] + 2 * m; H = b[3] - b[1] + 2 * m; }
    const out = ['<svg xmlns="http://www.w3.org/2000/svg" width="' + fmt(W) + 'mm" height="' + fmt(H) + 'mm" viewBox="' + fmt(X) + ' ' + fmt(Y) + ' ' + fmt(W) + ' ' + fmt(H) + '" font-family="' + FONT.replace(/"/g, '') + '">',
      '<title>' + esc(title || '') + '</title>', '<rect x="' + fmt(X) + '" y="' + fmt(Y) + '" width="' + fmt(W) + '" height="' + fmt(H) + '" fill="#FFFFFF"/>'];
    if (this.defs.length) out.push('<defs>' + this.defs.join('') + '</defs>');
    const cls = { fills: 'ad-fill', lines: 'ad-visible', hidden: 'ad-hidden', details: 'ad-detail', notes: 'ad-notes', text: 'ad-text' };
    for (const k of ['fills', 'lines', 'hidden', 'details', 'notes', 'text']) { out.push('<g class="' + cls[k] + '">'); out.push(...this.layers[k]); out.push('</g>'); }
    out.push('</svg>'); return out.join('\n');
  }
}

/* ── make_axon.py の共通の道具 ────────────────────────────────────────────── */
function resBbox(res) {
  let b = [1e18, 1e18, -1e18, -1e18]; const ext = (x, y) => { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; };
  for (const [poly] of res.fills) for (const p of poly) ext(p[0], p[1]);
  for (const l of res.lines) { ext(l[0][0], l[0][1]); ext(l[1][0], l[1][1]); }
  for (const l of res.details) { ext(l[0][0], l[0][1]); ext(l[1][0], l[1][1]); }
  if (b[0] > b[2]) b = [0, 0, 10, 10]; return b;
}
function translate(res, proj, dx, dy) {
  res.fills = res.fills.map(([poly, t]) => [poly.map(p => [p[0] + dx, p[1] + dy]), t]);
  res.lines = res.lines.map(([a, b, c, ac]) => [[a[0] + dx, a[1] + dy], [b[0] + dx, b[1] + dy], c, ac]);
  res.details = res.details.map(([a, b, st]) => [[a[0] + dx, a[1] + dy], [b[0] + dx, b[1] + dy], st]);
  proj.ox += dx; proj.oy += dy; return res;
}
/* 紙の上で図を動かしたとき、面の 2D・外接矩形・奥行きの一次式・格子を合わせる */
function shiftScene(sc, dx, dy) {
  for (const f of sc.faces) { f.p2 = f.p2.map(p => [p[0] + dx, p[1] + dy]); f.bb = [f.bb[0] + dx, f.bb[1] + dy, f.bb[2] + dx, f.bb[3] + dy]; const [a, b, c] = f.dep; f.dep = [a, b, c - a * dx - b * dy]; }
  sc._grid();
}
/* 引出線の文字の縦位置を、望む位置に近く、重ならないように詰める。items: [{y, h}] */
function placeLabels(items, yMin, yMax, gap) {
  const order = items.map((_, i) => i).sort((a, b) => items[a].y - items[b].y), ys = new Array(items.length).fill(0);
  let cur = yMin;
  for (const i of order) { const y = Math.max(items[i].y, cur); ys[i] = y; cur = y + items[i].h + gap; }
  const over = cur - gap - yMax;
  if (over > 0) { cur = yMax; for (let k = order.length - 1; k >= 0; k--) { const i = order[k]; const y = Math.min(ys[i], cur - items[i].h); ys[i] = y; cur = y - gap; } }
  return ys;
}
/* labels: [{anchor:[x,y], lines:[[text,size,weight],...]}]。side='right' は文字を colX から右へ */
function drawLabels(sh, labels, side, colX, yMin, yMax, gap) {
  gap = gap == null ? 2.2 : gap;
  const items = labels.map(L => ({ y: L.anchor[1] - L.lines[0][1] * 0.5, h: L.lines.reduce((s, l) => s + l[1] * 1.35, 0) }));
  const ys = placeLabels(items, yMin, yMax, gap);
  sh.layers.notes.push('<g class="ad-layer-label">');
  labels.forEach((L, i) => {
    const y = ys[i], first = L.lines[0][1], ty = y + first * 0.36, [ax, ay] = L.anchor;
    let end, elbow;
    if (side === 'right') { end = [colX - 1.2, ty]; elbow = Math.abs(ay - ty) > 0.05 ? [colX - 6.0, ty] : null; if (elbow && elbow[0] < ax + 1) elbow = null; }
    else { end = [colX + 1.2, ty]; elbow = Math.abs(ay - ty) > 0.05 ? [colX + 6.0, ty] : null; if (elbow && elbow[0] > ax - 1) elbow = null; }
    sh.leader([ax, ay], elbow, end);
    let yy = y + first * 0.72;
    for (const [t, s, wgt] of L.lines) { sh.text(colX, yy, t, s, wgt, side === 'right' ? 'start' : 'end'); yy += s * 1.35; }
  });
  sh.layers.notes.push('</g>');
  return ys;
}
function vcenterDy(bb, SH, capLines, margin) { margin = margin == null ? 14 : margin; const block = (bb[3] - bb[1]) + 22 + capLines * 3.2 + 2; return Math.max(margin, (SH - block) / 2) - bb[1]; }
/* 紙の上の寸法線（3D の 2 点を投影）。端末は 45° の斜線 */
function dimLine(sh, proj, P0, P1, o) {
  o = o || {}; const side = o.side == null ? 1 : o.side, tick = o.tick || 1.0, size = o.size || 2.0, tpos = o.tpos == null ? 0.5 : o.tpos, toff = o.toff == null ? 1.4 : o.toff;
  const a = proj.p(P0), b = proj.p(P1);
  sh.layers.notes.push('<g class="ad-dim">');
  sh.line(a, b, 0.13);
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, c = Math.SQRT1_2, s = Math.SQRT1_2, tx = ux * c - uy * s, ty = ux * s + uy * c;
  for (const p of [a, b]) sh.line([p[0] - tx * tick / 2, p[1] - ty * tick / 2], [p[0] + tx * tick / 2, p[1] + ty * tick / 2], 0.25);
  sh.layers.notes.push('</g>');
  if (o.text) { const m = [a[0] + dx * tpos, a[1] + dy * tpos], nx = -uy * side, ny = ux * side, w = textWidth(o.text, size), need = (w / 2) * Math.abs(nx) + (size * 0.55) * Math.abs(ny) + 0.7, d = Math.max(toff, need); sh.text(m[0] + nx * d, m[1] + ny * d + size * 0.35, o.text, size, 400, 'middle'); }
  return [a, b];
}
function bubble(sh, c, label, r) { r = r || 2.3; sh.circle(c, r, 0.18, WHITE); sh.text(c[0], c[1] + 0.72, label, 2.0, 400, 'middle'); }
function dirOf(P, Aq, Bq) { const a = P(Aq), b = P(Bq), dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; }
function visibleOn(sc, pt, prefix) { const f = sc.frontmost(pt); return !!f && String(f.solid.part).indexOf(prefix) === 0; }
/* 候補の 3D 点のうち、紙の上で対象の部材が手前に見える最初の点を引出線の先にする */
function resolve(sc, P, cands, part) { for (const c of cands) { const q = P(c); if (part == null || visibleOn(sc, q, part)) return q; } return P(cands[0]); }
function segHitsBox(a, b, box) {
  const [x0, y0, x1, y1] = box, dx = b[0] - a[0], dy = b[1] - a[1]; let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, a[0] - x0], [dx, x1 - a[0]], [-dy, a[1] - y0], [dy, y1 - a[1]]]) {
    if (Math.abs(p) < 1e-12) { if (q < 0) return false; continue; }
    const t = q / p; if (p < 0) { if (t > t1) return false; t0 = Math.max(t0, t); } else { if (t < t0) return false; t1 = Math.min(t1, t); }
  }
  return t0 <= t1;
}
class SegIndex {
  constructor(segs, cell) {
    this.cell = cell || 3; this.segs = segs; this.g = new Map();
    segs.forEach(([a, b], i) => { for (let gx = Math.floor(Math.min(a[0], b[0]) / this.cell); gx <= Math.floor(Math.max(a[0], b[0]) / this.cell); gx++) for (let gy = Math.floor(Math.min(a[1], b[1]) / this.cell); gy <= Math.floor(Math.max(a[1], b[1]) / this.cell); gy++) { const k = gx + ',' + gy; if (!this.g.has(k)) this.g.set(k, []); this.g.get(k).push(i); } });
  }
  hits(box) {
    const c = this.cell, seen = new Set();
    for (let gx = Math.floor(box[0] / c); gx <= Math.floor(box[2] / c); gx++) for (let gy = Math.floor(box[1] / c); gy <= Math.floor(box[3] / c); gy++) for (const i of (this.g.get(gx + ',' + gy) || [])) { if (seen.has(i)) continue; seen.add(i); if (segHitsBox(this.segs[i][0], this.segs[i][1], box)) return true; }
    return false;
  }
}
function allSegments(res) { return res.lines.map(l => [l[0], l[1]]).concat(res.details.map(l => [l[0], l[1]])); }
function minus(segs, a, c) { const out = []; for (const [s, e] of segs) { if (c <= s || a >= e) { out.push([s, e]); continue; } if (a > s) out.push([s, a]); if (c < e) out.push([c, e]); } return out; }

/* ═══════════════════════════════ 建物モデル → archdraw の M（axhouse.load_plan_model の形） ═══════════════════════════════
   DESIGN §2 のモデル（壁＝芯の線分、開口の at、階段の origin/dir、家具の at/w/d）を、axhouse が使う形に直す：
   X・Y（通り芯）、tw・tp、FL（'1F'…'RF'）、top、openings（外壁。a0/a1 は軸の絶対座標、z0/z1 は GL から）、
   stairs（北へ上る直階段）、parts（間仕切りの長方形）、doors、rooms、fixtures（rect の形）、roof_open（天窓）、site・alley。 */
function levelsSorted(m) { return arr(m.levels).slice().sort((a, b) => a.fl - b.fl); }
function wallRectOf(w) {
  const h = (w.t || 150) / 2;
  if (Math.abs(w.a[1] - w.b[1]) < 1e-6) return [Math.min(w.a[0], w.b[0]), w.a[1] - h, Math.max(w.a[0], w.b[0]), w.a[1] + h];
  if (Math.abs(w.a[0] - w.b[0]) < 1e-6) return [w.a[0] - h, Math.min(w.a[1], w.b[1]), w.a[0] + h, Math.max(w.a[1], w.b[1])];
  const xs = [w.a[0], w.b[0]], ys = [w.a[1], w.b[1]]; return [Math.min(...xs) - h, Math.min(...ys) - h, Math.max(...xs) + h, Math.max(...ys) + h];
}
function isExt(w) { return w.kind === 'exterior' || w.kind === 'fire'; }
function toM(m) {
  const M = {};
  const gx = arr(m.grid && m.grid.x).map(g => +g.at).filter(isFinite).sort((a, b) => a - b), gy = arr(m.grid && m.grid.y).map(g => +g.at).filter(isFinite).sort((a, b) => a - b);
  const walls = arr(m.walls), ext = walls.filter(isExt);
  if (gx.length < 2 || gy.length < 2) {   // 通り芯が無ければ外壁の芯の外形
    const xs = [], ys = []; (ext.length ? ext : walls).forEach(w => { xs.push(w.a[0], w.b[0]); ys.push(w.a[1], w.b[1]); });
    if (!xs.length) { xs.push(0, 5400); ys.push(0, 8100); }
    M.X = [Math.min(...xs), Math.max(...xs)]; M.Y = [Math.min(...ys), Math.max(...ys)];
  } else { M.X = gx; M.Y = gy; }
  M.gridIds = { x: arr(m.grid && m.grid.x).slice().sort((a, b) => a.at - b.at).map(g => g.id), y: arr(m.grid && m.grid.y).slice().sort((a, b) => a.at - b.at).map(g => g.id) };
  M.tw = (ext[0] && ext[0].t) || 150; M.tp = (walls.find(w => w.kind === 'partition') || {}).t || 100;
  M.GL = 0;
  const ls = levelsSorted(m); M.levelIds = ls.map(l => l.id);
  M.FL = {}; ls.forEach(l => { M.FL[l.id] = +l.fl; });
  const lastTop = ls.length ? ls[ls.length - 1].fl + (ls[ls.length - 1].height || 2800) : 8650;
  M.FL.RF = (m.roof && isFinite(+m.roof.fl)) ? +m.roof.fl : lastTop;
  M.parapet = (m.roof && isFinite(+m.roof.parapet)) ? +m.roof.parapet : 1100;
  M.roofIsLevel = ls.length > 0 && Math.abs(M.FL.RF - ls[ls.length - 1].fl) < 1;   // 最上階が屋上テラス（RF が階として入っている）
  M.top = M.FL.RF + M.parapet;
  arr(m.roofs).forEach(r => { if (r && isFinite(+r.fl)) M.top = Math.max(M.top, +r.fl + (r.shell && r.shell.kind === 'curved' && isFinite(+r.shell.rise) ? +r.shell.rise : 0)); });
  M.coping = 40; M.slab = isFinite(+m.slab) ? +m.slab : 300; M.found_top = 450;
  M.story = {}; ls.forEach((l, i) => { M.story[l.id] = (i < ls.length - 1 ? ls[i + 1].fl : (M.FL.RF > l.fl + 1 ? M.FL.RF : l.fl + (+l.height || 2800))) - l.fl; });
  M.cut = (m.plan && isFinite(+m.plan.cut)) ? +m.plan.cut : 1200;
  M.raw = m;   // 新要素（columns・voids・ramps・screens・roofs）と壁の接合は元のモデルから読む（ELEMENTS.md）
  M.name = m.name || '';
  M.rc = /RC|鉄筋|コンクリート|concrete/i.test(String(m.structure || '') + ' ' + String(m.materials && m.materials.structure || ''));
  M.roofs = arr(m.roofs).filter(r => r && isFinite(+r.fl) && arr(r.polygon).length >= 3);
  M.columns = arr(m.columns).filter(c => c && c.at && isFinite(+c.at[0]) && isFinite(+c.at[1]));
  M.voids = arr(m.voids).filter(v => v && arr(v.polygon).length >= 3);
  M.ramps = arr(m.ramps).filter(r => r && arr(r.path).length >= 2 && isFinite(+r.width));
  M.screens = arr(m.screens).filter(s => s && s.a && s.b && isFinite(+s.height) && isFinite(+s.depth));
  M.neighbors = arr(m.site && m.site.neighbors).filter(n => n && n.side);
  M.accentWalls = walls.filter(w => w.accent);
  // 敷地と道路：roads が無ければ路地は無い（決め打ちをしない）。edge は 0/'S' を南、2/'N' を北とする
  const sp = arr(m.site && m.site.polygon); const sb = sp.length ? bbox2(sp) : [M.X[0] - 650, M.Y[0] - 725, M.X[M.X.length - 1] + 650, M.Y[M.Y.length - 1] + 725];
  M.site = { x0: sb[0], x1: sb[2], y0: sb[1], y1: sb[3], has: sp.length > 0 };
  const road = arr(m.site && m.site.roads).find(r => r && isFinite(+r.width) && (r.edge === 0 || r.edge === 'S' || r.edge === 2 || r.edge === 'N')) || null;
  const rw = road ? +road.width : 0;
  if (!road) M.alley = null;
  else if (road.edge === 2 || road.edge === 'N') M.alley = { y_near: sb[3], y_far: sb[3] + rw, side: 'N', width: rw };
  else M.alley = { y_near: sb[1], y_far: sb[1] - rw, side: 'S', width: rw };
  M.alleyWidth = rw; M.setback = (m.site && isFinite(+m.site.setback)) ? +m.site.setback : (M.alley ? (M.Y[0] - M.tw / 2) - M.alley.y_near : 0);
  // 壁の長方形と向き
  const X0 = M.X[0], X1 = M.X[M.X.length - 1], Y0 = M.Y[0], Y1 = M.Y[M.Y.length - 1];
  const sideOf = (r) => { const cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2, horiz = (r[2] - r[0]) >= (r[3] - r[1]); if (horiz) return Math.abs(cy - Y0) < Math.abs(cy - Y1) ? 'S' : 'N'; return Math.abs(cx - X0) < Math.abs(cx - X1) ? 'W' : 'E'; };
  M.walls = {}; M.parts = {}; M.openings = []; M.doors = []; M.rooms = {}; M.fixtures = {}; M.roof_open = null;
  ls.forEach(l => { M.walls[l.id] = []; M.parts[l.id] = []; M.rooms[l.id] = []; M.fixtures[l.id] = []; });
  const wallById = {};
  walls.forEach(w => {
    if (!M.walls[w.level]) return;
    const r = wallRectOf(w), kind = isExt(w) ? 'struct' : 'part', side = isExt(w) ? sideOf(r) : null;
    const rec = { id: w.id, kind, side, rect: r, level: w.level, accent: !!w.accent, horiz: (r[2] - r[0]) >= (r[3] - r[1]), dirPos: w.b[0] + w.b[1] >= w.a[0] + w.a[1], h: isFinite(+w.h) ? +w.h : null, w };
    wallById[w.id] = rec; M.walls[w.level].push(rec);
    if (kind === 'part') M.parts[w.level].push({ id: w.id, rect: r });
  });
  arr(m.openings).forEach(o => {
    const w = wallById[o.wall]; if (!w) return;
    const fl = w.level, FL = M.FL[fl]; if (FL == null) return;
    // a→b の向きで at を軸の絶対座標に
    const lo = w.horiz ? w.rect[0] : w.rect[1], hi = w.horiz ? w.rect[2] : w.rect[3];
    const a = w.dirPos ? lo + o.at : hi - o.at - o.width, b = a + o.width;
    const sill = +o.sill || 0, head = +o.head || 2000;
    if (w.kind === 'struct') {
      const shop = !!o.shutter || (o.type === 'sweep' && fl === M.levelIds[0] && !o.rail);
      M.openings.push({ id: o.id, wall: w.side, fl, a0: a, a1: b, sill, head, z0: FL + sill, z1: FL + head, panels: o.panels || 2, kind: shop ? 'shop' : 'window', rail: o.rail ? FL + 1100 : null, fire: !!o.fire, type: o.type, shutter: !!o.shutter });
    } else {
      const dot = w.horiz ? 1 : -1, hingeA = (o.swing || 'L') === 'L';
      const hinge = (hingeA === w.dirPos) ? 0 : 1;      // 0＝低い座標の端が吊元
      const swing = o.flip ? dot : -dot;
      M.doors.push({ fl, wall: w.id, a, b, head, type: o.type === 'door' ? 'swing' : (o.variant === 'closet' ? 'closet' : 'slide'), hinge, swing, side: (o.side || 1) * dot, panels: o.panels || 1, park: o.park || 'b' });
    }
  });
  M.stairs = [];
  arr(m.stairs).forEach(s => {
    if (M.FL[s.from] == null || M.FL[s.to] == null) return;
    const d = { N: [0, 1], E: [1, 0], S: [0, -1], W: [-1, 0] }[s.dir] || [0, 1], r = [d[1], -d[0]], w = s.width || 800, run = (s.n - 1) * s.tread;
    const pts = [s.origin, [s.origin[0] + d[0] * run, s.origin[1] + d[1] * run], [s.origin[0] + d[0] * run + r[0] * w, s.origin[1] + d[1] * run + r[1] * w], [s.origin[0] + r[0] * w, s.origin[1] + r[1] * w]];
    const bb = bbox2(pts);
    M.stairs.push({ id: s.id, fl: s.from, to: s.to, x0: bb[0], x1: bb[2], y0: s.dir === 'S' ? bb[3] : bb[1], dir: s.dir === 'S' ? -1 : 1, risers: s.n, tread: s.tread, rise: s.rise || (M.FL[s.to] - M.FL[s.from]) / s.n, bbox: bb, axis: (s.dir === 'E' || s.dir === 'W') ? 'x' : 'y' });
  });
  arr(m.rooms).forEach(r => { if (!M.rooms[r.level]) return; const name = r.labelText || r.name; M.rooms[r.level].push({ name, poly: arr(r.polygon).map(p => [p[0], p[1]]), small: !!r.small || !!r.labelText, label: r.label || null, sub: r.sub || null, id: r.id, finish: r.finish || null, hasLabel: r.label !== null }); });
  arr(m.fixtures).forEach(f => {
    if (!M.fixtures[f.level]) return;
    const t = f.kind, at = f.at || [0, 0], w = f.w || 600, d = f.d || 600, rot = ((f.rot || 0) % 360 + 360) % 360;
    const rw = (rot === 90 || rot === 270) ? d : w, rd = (rot === 90 || rot === 270) ? w : d;
    const rect = [at[0] - rw / 2, at[1] - rd / 2, at[0] + rw / 2, at[1] + rd / 2];
    if (t === 'skylight') { M.roof_open = { kind: 'skylight', rect }; return; }
    const fx = { type: t, rect, upper: !!f.upper, rot };
    if (t === 'toilet') { const s = rot === 0 ? 1 : -1; fx.x = at[0]; fx.y = at[1] - s * 362.5; fx.rot = rot === 0 ? 0 : 180; }
    else if (t === 'handbasin') { fx.x = at[0] + 130; fx.y = at[1]; fx.rot = 90; }
    else if (t === 'shower') { fx.x = at[0]; fx.y = at[1] + 110; }
    else if (t === 'rod') { fx.line = [[at[0] - w / 2, at[1]], [at[0] + w / 2, at[1]]]; }
    if (f.div) fx.div = f.div; if (f.chairs) fx.chairs = f.chairs; if (f.head) fx.head = f.head; if (f.pillows) fx.pillows = f.pillows;
    if (f.sink) fx.sink = [f.sink[0] + at[0], f.sink[1] + at[1], f.sink[2] + at[0], f.sink[3] + at[1]];
    if (f.hob) fx.hob = [f.hob[0] + at[0], f.hob[1] + at[1]];
    M.fixtures[f.level].push(fx);
  });
  // 天窓は fixtures の skylight だけ（以前は最後の階段の上に決め打ちで置いていた）
  M.sections = {}; arr(m.sections).forEach(s => { if (!s.a || !s.b) return; if (Math.abs(s.a[1] - s.b[1]) < 1e-6) M.sections[s.id] = { axis: 'x', at: s.a[1], look: s.look }; else if (Math.abs(s.a[0] - s.b[0]) < 1e-6) M.sections[s.id] = { axis: 'y', at: s.a[0], look: s.look }; });
  M.name = m.name || '';
  M.parts = Object.fromEntries(Object.entries(M.parts).map(([k, L]) => [k, trimParts(L)]));
  return M;
}
/* 平面では重ねて描く間仕切りの交点を、後の壁の長手から差し引いて 3D で食い込まないようにする */
function trimParts(parts) {
  const out = [];
  for (const p of parts) {
    const [x0, y0, x1, y1] = p.rect, horiz = (x1 - x0) >= (y1 - y0); let segs = [horiz ? [x0, x1] : [y0, y1]];
    for (const q of out) { const [a0, b0, a1, b1] = q.rect; if (Math.min(x1, a1) - Math.max(x0, a0) <= 1e-6 || Math.min(y1, b1) - Math.max(y0, b0) <= 1e-6) continue; const lo = horiz ? Math.max(x0, a0) : Math.max(y0, b0), hi = horiz ? Math.min(x1, a1) : Math.min(y1, b1); segs = minus(segs, lo, hi); }
    for (const [a, b] of segs) if (b - a > 1) out.push({ id: p.id, rect: horiz ? [a, y0, b, y1] : [x0, a, x1, b] });
  }
  return out;
}

/* ═══════════════════════════════ 部品の幾何（axhouse.py） ═══════════════════════════════ */
/* 段の列 {x0,x1,y0,y1,zt,rise}。蹴上 = 階高 / 段数、踏面の数 = 段数 - 1（最後の段は上の床） */
function stairSteps(st, FL) {
  const z0 = FL[st.fl], rise = (FL[st.to] - z0) / st.risers, out = [];
  for (let k = 1; k < st.risers; k++) {
    if (st.axis === 'x') { const a = st.bbox[0] + (k - 1) * st.tread; out.push({ x0: a, x1: a + st.tread, y0: st.bbox[1], y1: st.bbox[3], zt: z0 + k * rise, rise }); }
    else { const a = st.y0 + st.dir * (k - 1) * st.tread, b = a + st.dir * st.tread; out.push({ x0: st.x0, x1: st.x1, y0: Math.min(a, b), y1: Math.max(a, b), ya: a, yb: b, zt: z0 + k * rise, rise }); }
  }
  return out;
}
/* 上の階の床の穴（頭上 2,000 を確保できない段から上り切りまで）。[x0,x1,y0,y1] */
function stairWell(M, st) {
  const FL = M.FL, under = FL[st.to] - M.slab, steps = stairSteps(st, FL);
  if (st.axis === 'x') { const xTop = st.bbox[0] + (st.risers - 1) * st.tread; let xs = xTop; for (const s of steps) if (under - s.zt < 2000) { xs = s.x0; break; } return [xs, xTop, st.bbox[1], st.bbox[3]]; }
  const yTop = st.y0 + st.dir * (st.risers - 1) * st.tread; let yStart = yTop;
  for (const s of steps) if (under - s.zt < 2000) { yStart = s.ya; break; }
  return [st.x0, st.x1, Math.min(yStart, yTop), Math.max(yStart, yTop)];
}
/* その高さの床（2F・3F・RF）の穴の列 */
function holesOf(M, level) {
  const out = M.stairs.filter(st => st.to === level).map(st => stairWell(M, st));
  if (level === 'RF' && M.roof_open) { const [x0, y0, x1, y1] = M.roof_open.rect; out.push([x0, x1, y0, y1]); }
  return out;
}
/* 壁の面（a：壁に沿う座標、b：高さ）から開口を抜いた長方形の列 */
function splitWall(a0, a1, b0, b1, openings) {
  const cuts = new Set([a0, a1]);
  for (const [o0, o1] of openings) { if (o1 <= a0 || o0 >= a1) continue; cuts.add(Math.max(a0, o0)); cuts.add(Math.min(a1, o1)); }
  const C = Array.from(cuts).sort((a, b) => a - b), out = [];
  for (let i = 0; i < C.length - 1; i++) {
    const s = C[i], e = C[i + 1]; if (e - s < 1e-6) continue;
    const holes = openings.filter(([o0, o1]) => o0 <= s + 1e-6 && o1 >= e - 1e-6).map(([, , p0, p1]) => [Math.max(b0, p0), Math.min(b1, p1)]).filter(h => h[1] > h[0]).sort((a, b) => a[0] - b[0]);
    let z = b0; for (const [h0, h1] of holes) { if (h0 > z) out.push([s, e, z, h0]); z = Math.max(z, h1); }
    if (z < b1) out.push([s, e, z, b1]);
  }
  return out;
}
/* 長方形の板から、互いに重ならない長方形の穴を抜いた長方形の列（縦の帯に分けて作る） */
function plateMinus(x0, x1, y0, y1, holes) {
  const hs = holes.map(([a, b, c, d]) => [Math.max(x0, a), Math.min(x1, b), Math.max(y0, c), Math.min(y1, d)]).filter(h => h[1] > h[0] && h[3] > h[2]);
  const xs = Array.from(new Set([x0, x1].concat(hs.map(h => h[0]), hs.map(h => h[1])))).sort((a, b) => a - b), out = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i], b = xs[i + 1], cut = hs.filter(h => h[0] <= a + 1e-6 && h[1] >= b - 1e-6).map(h => [h[2], h[3]]).sort((p, q) => p[0] - q[0]);
    let y = y0; for (const [c, d] of cut) { if (c > y) out.push([a, b, y, c]); y = Math.max(y, d); }
    if (y < y1) out.push([a, b, y, y1]);
  }
  return out;
}
/* 外壁の管柱の位置（隅を除く）。900 の割付から開口にかかるものを除き、開口の両脇に柱を足す */
function wallColumns(M, side, fl, col) {
  col = col || 120; const X0 = M.X[0], X1 = M.X[M.X.length - 1], Y0 = M.Y[0], Y1 = M.Y[M.Y.length - 1];
  const length = (side === 'S' || side === 'N') ? X1 - X0 : Y1 - Y0, base = (side === 'S' || side === 'N') ? X0 : Y0;
  const ops = M.openings.filter(o => o.wall === side && o.fl === fl).map(o => [o.a0 - base, o.a1 - base]), h = col / 2, jambs = [];
  for (const [a, b] of ops) jambs.push(a - h, b + h);
  const cols = jambs.slice();
  for (let k = 1; k < Math.floor(length / 900) + (length % 900 === 0 ? 0 : 1); k++) { const c = k * 900; if (c >= length) break; if (ops.some(([a, b]) => a - h < c && c < b + h)) continue; if (jambs.some(j => Math.abs(c - j) < col + 60)) continue; cols.push(c); }
  return cols.filter(c => h + 60 < c && c < length - h - 60).sort((a, b) => a - b).map(c => c + base);
}

/* Scene に家の部品を置く。off で層ごとに動かす（分解図）。cut で FL+1,200 の水平切断 */
class Builder {
  constructor(sc, M) { this.sc = sc; this.M = M; }
  box(x0, x1, y0, y1, z0, z1, group, part, o) {
    o = o || {}; const off = o.off || [0, 0, 0]; let tones = o.tones;
    if (o.cut != null) {
      if (z0 >= o.cut - 1e-6) return null;
      const t = Object.assign({}, tones || {});
      if (z1 >= o.cut - 1e-6) { z1 = o.cut; t.top = o.poche === false ? (t.top || 'top') : 'cut'; }
      tones = t;
    }
    return this.sc.box(x0 + off[0], x1 + off[0], y0 + off[1], y1 + off[1], z0 + off[2], z1 + off[2], group, { part, cap: o.cap || 'main', tones, accent: o.accent, name: o.name || part });
  }
  line(P0, P1, style, off, hidden) { off = off || [0, 0, 0]; this.sc.line([P0[0] + off[0], P0[1] + off[1], P0[2] + off[2]], [P1[0] + off[0], P1[1] + off[1], P1[2] + off[2]], style, hidden); }
  rectLines(x0, y0, x1, y1, z, off, style) { const P = [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]]; for (let i = 0; i < 4; i++) this.line(P[i], P[(i + 1) % 4], style || 'thin', off); }
  panel(P, group, part, tone, off, cap) { off = off || [0, 0, 0]; return this.sc.panel(P.map(p => [p[0] + off[0], p[1] + off[1], p[2] + off[2]]), group, { part, tone: tone || 'glass', cap: cap || 'main' }); }
  /* 外壁 */
  extWall(side, z0, z1, group, part, o) {
    o = o || {}; const M = this.M, h = M.tw / 2, X0 = M.X[0], X1 = M.X[M.X.length - 1], Y0 = M.Y[0], Y1 = M.Y[M.Y.length - 1];
    const ops = M.openings.filter(op => op.wall === side).map(op => [op.a0, op.a1, op.z0, op.z1]), acc = o.accent ? ['south'] : [];
    if (side === 'S' || side === 'N') { const yc = side === 'S' ? Y0 : Y1; for (const [a, b, za, zb] of splitWall(X0 - h, X1 + h, z0, z1, ops)) this.box(a, b, yc - h, yc + h, za, zb, group, part, { off: o.off, cut: o.cut, accent: acc }); }
    else { const xc = side === 'W' ? X0 : X1; for (const [a, b, za, zb] of splitWall(Y0 + h, Y1 - h, z0, z1, ops)) this.box(xc - h, xc + h, a, b, za, zb, group, part, { off: o.off, cut: o.cut }); }
  }
  coping(group, part, off, sides) {
    sides = sides || 'SNWE'; const M = this.M, h = M.tw / 2 + 25, X0 = M.X[0], X1 = M.X[M.X.length - 1], Y0 = M.Y[0], Y1 = M.Y[M.Y.length - 1], z1 = M.top, z0 = z1 - M.coping;
    if (sides.indexOf('S') >= 0) this.box(X0 - h, X1 + h, Y0 - h, Y0 + h, z0, z1, group, part, { off });
    if (sides.indexOf('N') >= 0) this.box(X0 - h, X1 + h, Y1 - h, Y1 + h, z0, z1, group, part, { off });
    if (sides.indexOf('W') >= 0) this.box(X0 - h, X0 + h, Y0 + h, Y1 - h, z0, z1, group, part, { off });
    if (sides.indexOf('E') >= 0) this.box(X1 - h, X1 + h, Y0 + h, Y1 - h, z0, z1, group, part, { off });
  }
  /* 外壁の開口に入る窓。枠 50・見込み 70、ガラスは外面から 65 奥 */
  window(o, group, opt) {
    opt = opt || {}; const M = this.M, h = M.tw / 2, fw = 50, cut = opt.cut, off = opt.off, part = opt.part || 'sash', a0 = o.a0, a1 = o.a1, z0 = o.z0, z1 = o.z1;
    if (cut != null && z0 >= cut) return;
    const side = o.wall; if (side !== 'S' && side !== 'N') return this.windowEW(o, group, opt);
    let yo, fy0, fy1, gy;
    if (side === 'S') { yo = M.Y[0] - h; fy0 = yo + 30; fy1 = yo + 100; gy = yo + 65; } else { yo = M.Y[M.Y.length - 1] + h; fy0 = yo - 100; fy1 = yo - 30; gy = yo - 65; }
    const zc1 = cut != null ? Math.min(z1, cut) : z1;
    const B = (xa, xb, za, zb) => this.box(xa, xb, fy0, fy1, za, zb, group, part, { cap: 'thin', off, cut });
    B(a0, a1, z0, z0 + fw); B(a0, a1, z1 - fw, z1); B(a0, a0 + fw, z0 + fw, z1 - fw); B(a1 - fw, a1, z0 + fw, z1 - fw);
    const n = o.panels || 2, xs = []; for (let i = 0; i <= n; i++) xs.push(a0 + fw + (a1 - a0 - 2 * fw) * i / n);
    for (let i = 1; i < n; i++) B(xs[i] - fw / 2, xs[i] + fw / 2, z0 + fw, z1 - fw);
    for (let i = 0; i < n; i++) { const ga = xs[i] + (i > 0 ? fw / 2 : 0), gb = xs[i + 1] - (i < n - 1 ? fw / 2 : 0), gz1 = Math.min(z1 - fw, zc1); if (gz1 <= z0 + fw) continue; this.panel([[ga, gy, z0 + fw], [gb, gy, z0 + fw], [gb, gy, gz1], [ga, gy, gz1]], group, part + '_g', 'glass', off, 'thin'); }
    if (opt.detail === false) return;
    const sill = o.z0 - M.FL[o.fl];
    if (o.kind !== 'shop' && sill > 0) this.box(a0, a1, yo - 30, yo + 30, z0, z0 + 25, group, part + '_sill', { cap: 'thin', off, cut });
    if (o.kind === 'shop' && side === 'S') { this.box(a0 - 60, a1 + 60, yo - 260, yo, z1, z1 + 300, group, part + '_shutter', { off, cut }); for (const [xa, xb] of [[a0 - 60, a0], [a1, a1 + 60]]) this.box(xa, xb, yo - 60, yo, z0, z1, group, part + '_rail', { cap: 'thin', off, cut }); }
    if (o.rail && side === 'S') {
      for (const zr of [o.rail, o.rail - 450]) this.box(a0 - 100, a1 + 100, yo - 90, yo - 60, zr - 30, zr, group, part + '_rail', { cap: 'thin', off, cut });
      for (const xb of [a0 - 80, a1 + 50]) this.box(xb, xb + 30, yo - 60, yo, o.rail - 480, o.rail, group, part + '_rail', { cap: 'thin', off, cut });
    }
  }
  windowEW(o, group, opt) {   // 東西の壁の窓（題材には無い。枠とガラスだけ）
    const M = this.M, h = M.tw / 2, fw = 50, cut = opt.cut, off = opt.off, part = opt.part || 'sash', a0 = o.a0, a1 = o.a1, z0 = o.z0, z1 = o.z1;
    let xo, fx0, fx1, gx; if (o.wall === 'W') { xo = M.X[0] - h; fx0 = xo + 30; fx1 = xo + 100; gx = xo + 65; } else { xo = M.X[M.X.length - 1] + h; fx0 = xo - 100; fx1 = xo - 30; gx = xo - 65; }
    const B = (ya, yb, za, zb) => this.box(fx0, fx1, ya, yb, za, zb, group, part, { cap: 'thin', off, cut });
    B(a0, a1, z0, z0 + fw); B(a0, a1, z1 - fw, z1); B(a0, a0 + fw, z0 + fw, z1 - fw); B(a1 - fw, a1, z0 + fw, z1 - fw);
    const gz1 = Math.min(z1 - fw, cut != null ? cut : z1); if (gz1 > z0 + fw) this.panel([[gx, a0 + fw, z0 + fw], [gx, a1 - fw, z0 + fw], [gx, a1 - fw, gz1], [gx, a0 + fw, gz1]], group, part + '_g', 'glass', off, 'thin');
  }
  /* 1 段の高さの塊を段ごとに置く */
  stair(st, group, opt) {
    opt = opt || {}; const FL = this.M.FL;
    for (const s of stairSteps(st, FL)) { if (opt.cut != null && s.zt > opt.cut + 1e-6) break; this.box(s.x0, s.x1, s.y0, s.y1, s.zt - s.rise, s.zt, group, opt.part || 'stair', { cap: 'main', off: opt.off }); }
  }
  /* 間仕切りと戸 */
  partition(prt, fl, group, opt) {
    opt = opt || {}; const M = this.M, z = M.FL[fl], [x0, y0, x1, y1] = prt.rect, horiz = (x1 - x0) >= (y1 - y0);
    const doors = M.doors.filter(d => d.fl === fl && d.wall === prt.id), ops = doors.map(d => [d.a, d.b, z, z + d.head]), zTop = z + Math.min(2400, M.story[fl] - M.slab);
    if (horiz) for (const [a, b, za, zb] of splitWall(x0, x1, z, zTop, ops)) this.box(a, b, y0, y1, za, zb, group, 'part_' + fl, { off: opt.off, cut: opt.cut });
    else for (const [a, b, za, zb] of splitWall(y0, y1, z, zTop, ops)) this.box(x0, x1, a, b, za, zb, group, 'part_' + fl, { off: opt.off, cut: opt.cut });
    for (const d of doors) { const lo = horiz ? x0 : y0, hi = horiz ? x1 : y1; if (lo - 1 <= d.a && d.b <= hi + 1) this.door(d, prt.rect, group, opt); }
  }
  /* 開き戸は 90° に開いた戸と床の上の弧、引戸は閉じた戸 */
  door(d, rect, group, opt) {
    opt = opt || {}; const FL = this.M.FL[d.fl], cut = opt.cut, off = opt.off, [x0, y0, x1, y1] = rect, horiz = (x1 - x0) >= (y1 - y0);
    const c = horiz ? (y0 + y1) / 2 : (x0 + x1) / 2, tp = (horiz ? (y1 - y0) : (x1 - x0)) / 2, s0 = d.a, s1 = d.b, W = s1 - s0;
    let z1 = FL + d.head; const tones = (cut != null && z1 >= cut) ? { top: 'cut' } : null; if (cut != null) z1 = Math.min(z1, cut);
    const t = 35;
    if (d.type === 'swing') {
      const hinge = d.hinge, sw = d.swing, hp = hinge === 0 ? s0 : s1, other = hinge === 0 ? s1 : s0; let xa, xb, ya, yb, cx, cy, aStart, aEnd;
      if (!horiz) { [ya, yb] = hinge === 0 ? [hp, hp + t] : [hp - t, hp]; [xa, xb] = [c + sw * tp, c + sw * (tp + W)].sort((p, q) => p - q); cx = c + sw * tp; cy = hp; aStart = Math.atan2(other - hp, 0); aEnd = Math.atan2(0, sw); }
      else { [xa, xb] = hinge === 0 ? [hp, hp + t] : [hp - t, hp]; [ya, yb] = [c + sw * tp, c + sw * (tp + W)].sort((p, q) => p - q); cx = hp; cy = c + sw * tp; aStart = Math.atan2(0, other - hp); aEnd = Math.atan2(sw, 0); }
      this.box(xa, xb, ya, yb, FL, z1, group, 'door', { cap: 'thin', off, tones });
      let da = aEnd - aStart; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      const pts = []; for (let i = 0; i <= 16; i++) pts.push([cx + W * Math.cos(aStart + da * i / 16), cy + W * Math.sin(aStart + da * i / 16), FL + 1]);
      for (let i = 0; i < 16; i++) this.line(pts[i], pts[i + 1], 'thin', off);
    } else if (d.type === 'slide') {
      const side = d.side || 1;
      if (horiz) { const [ya, yb] = [c + side * tp, c + side * (tp + 30)].sort((p, q) => p - q); this.box(s0 - 40, s1 + 40, ya, yb, FL, z1, group, 'door', { cap: 'thin', off, tones }); }
      else { const [xa, xb] = [c + side * tp, c + side * (tp + 30)].sort((p, q) => p - q); this.box(xa, xb, s0 - 40, s1 + 40, FL, z1, group, 'door', { cap: 'thin', off, tones }); }
    } else {
      const half = W / 2; [[s0, s0 + half + 20], [s1 - half - 20, s1]].forEach(([a, b], i) => { const k = i === 0 ? -1 : 1; if (horiz) this.box(a, b, c + k * 25 - 15, c + k * 25 + 15, FL, z1, group, 'door', { cap: 'thin', off, tones }); else this.box(c + k * 25 - 15, c + k * 25 + 15, a, b, FL, z1, group, 'door', { cap: 'thin', off, tones }); });
    }
  }
  /* 家具・設備 */
  fixtures(fl, group, opt) {
    opt = opt || {}; const M = this.M, z = M.FL[fl], h = M.tw / 2, X0 = M.X[0] + h, X1 = M.X[M.X.length - 1] - h, off = opt.off, cut = opt.cut;
    const F = (x0, y0, x1, y1, ht, name, z0) => this.box(Math.min(x0, x1), Math.max(x0, x1), Math.min(y0, y1), Math.max(y0, y1), z + (z0 || 0), z + ht, group, name, { cap: 'thin', off, cut, poche: false });
    const L = (x0, y0, x1, y1, ht) => this.rectLines(x0, y0, x1, y1, z + ht, off);
    const HT = { bench: 850, shelf: 900, shoebox: 1000, fridge: 1800, counter: 850, lowtable: 350, tvboard: 450, bed: 450, desk: 720, wardrobe: 1800, tub: 550, vanity: 800, washer: 950 };
    const dirs = { 0: [0, 1], 90: [-1, 0], 180: [0, -1], 270: [1, 0] };
    for (const fx of (M.fixtures[fl] || [])) {
      if (fx.upper) continue; const t = fx.type; let x0, y0, x1, y1; if (fx.rect) [x0, y0, x1, y1] = fx.rect;
      if (['bench', 'shoebox', 'fridge', 'lowtable', 'tvboard', 'desk', 'wardrobe'].indexOf(t) >= 0) F(x0, y0, x1, y1, HT[t], t);
      else if (t === 'shelf') { F(x0, y0, x1, y1, HT[t], t); if (fx.div) { let yy = y0 + fx.div; while (yy < y1 - 1) { this.line([x0, yy, z + HT[t]], [x1, yy, z + HT[t]], 'thin', off); yy += fx.div; } } }
      else if (t === 'counter') { F(x0, y0, x1, y1, HT[t], t); if (fx.sink) L(fx.sink[0], fx.sink[1], fx.sink[2], fx.sink[3], HT[t]); if (fx.hob) for (const dx of [-150, 150]) L(fx.hob[0] + dx - 110, fx.hob[1] - 110, fx.hob[0] + dx + 110, fx.hob[1] + 110, HT[t]); }
      else if (t === 'table') {
        F(x0, y0, x1, y1, 730, 'table', 700);
        for (const [lx, ly] of [[x0 + 40, y0 + 40], [x1 - 80, y0 + 40], [x0 + 40, y1 - 80], [x1 - 80, y1 - 80]]) F(lx, ly, lx + 40, ly + 40, 700, 'leg');
        const n = fx.chairs || 0; let spots;
        if ((x1 - x0) >= (y1 - y0)) { const cx = (x0 + x1) / 2; spots = [[cx - 210, y0 - 500, cx + 210, y0 - 80], [cx - 210, y1 + 80, cx + 210, y1 + 500]]; } else { const cy = (y0 + y1) / 2; spots = [[x0 - 500, cy - 210, x0 - 80, cy + 210], [x1 + 80, cy - 210, x1 + 500, cy + 210]]; }
        spots.slice(0, n).forEach(([a, b, c2, d2]) => F(a, b, c2, d2, 430, 'chair'));
      } else if (t === 'sofa') { F(x0, y0, x1, y1, 420, 'sofa'); if (Math.abs(x0 - X0) < 5) F(x0, y0, x0 + 200, y1, 780, 'sofa_back', 420); else if (Math.abs(x1 - X1) < 5) F(x1 - 200, y0, x1, y1, 780, 'sofa_back', 420); }
      else if (t === 'bed') { F(x0, y0, x1, y1, HT[t], t); const head = fx.head || 'N'; if (head === 'E') this.line([x1 - 450, y0, z + 450], [x1 - 450, y1, z + 450], 'thin', off); else if (head === 'W') this.line([x0 + 450, y0, z + 450], [x0 + 450, y1, z + 450], 'thin', off); else if (head === 'N') this.line([x0, y1 - 450, z + 450], [x1, y1 - 450, z + 450], 'thin', off); else this.line([x0, y0 + 450, z + 450], [x1, y0 + 450, z + 450], 'thin', off); }
      else if (t === 'tub') { F(x0, y0, x1, y1, HT[t], t); L(x0 + 90, y0 + 90, x1 - 90, y1 - 90, HT[t]); }
      else if (t === 'vanity') { F(x0, y0, x1, y1, HT[t], t); L(x0 + 120, y0 + 120, x1 - 120, y1 - 120, HT[t]); }
      else if (t === 'washer') { F(x0, y0, x1, y1, HT[t], t); L(x0 + 110, y0 + 110, x1 - 110, y1 - 110, HT[t]); }
      else if (t === 'toilet' || t === 'handbasin') {
        const [dx, dy] = dirs[fx.rot % 360] || [0, 1], px = fx.x, py = fx.y, ux = -dy, uy = dx;
        const parts = t === 'toilet' ? [[225, 0, 200, 800, 0], [190, 200, 760, 400, 0]] : [[200, 0, 300, 800, 650]];
        for (const [hw, d0, d1, ht, zb] of parts) F(px + dx * d0 - ux * hw, py + dy * d0 - uy * hw, px + dx * d1 + ux * hw, py + dy * d1 + uy * hw, ht, t, zb);
      }
    }
  }
}

/* 周辺：隣地の家（切妻。高さは site.neighbors の kind・eave・ridge から） */
function gableHouse(sc, x0, x1, y0, y1, eave, ridge, ridgeAxis, group) {
  group = group || 'ctx'; const tones = { top: 'ctx', south: 'ctx', west: 'ctx', north: 'ctx', east: 'ctx', bottom: 'ctx' };
  sc.box(x0, x1, y0, y1, 0, eave, group, { part: 'ctx' + x0 + '_' + y0, cap: 'ctx', tones, check: false });
  if (ridgeAxis === 'x') { const ym = (y0 + y1) / 2; sc.prism([[x0, y0, eave], [x0, y1, eave], [x0, ym, ridge]], [x1 - x0, 0, 0], group, { part: 'ctxr' + x0 + '_' + y0, cap: 'ctx', tones }); }
  else { const xm = (x0 + x1) / 2; sc.prism([[x0, y0, eave], [x1, y0, eave], [xm, y0, ridge]], [0, y1 - y0, 0], group, { part: 'ctxr' + x0 + '_' + y0, cap: 'ctx', tones }); }
}
/* 天窓：屋根の穴のまわりの立上り（高 250）と、ガラスと中桟 */
function skylight(b, M, group, off, part) {
  if (!M.roof_open) return; part = part || 'skylight'; const FL = M.FL, [x0, y0, x1, y1] = M.roof_open.rect, h = M.tw / 2, X1i = M.X[M.X.length - 1] - h, zr = FL.RF, zz = zr + 250, w = 100;
  b.box(x0 - w, x0, y0 - w, y1 + w, zr, zz, group, part, { off });
  b.box(x0, Math.min(x1, X1i), y0 - w, y0, zr, zz, group, part, { off });
  b.box(x0, Math.min(x1, X1i), y1, y1 + w, zr, zz, group, part, { off });
  if (x1 < X1i - 1) b.box(x1, x1 + w, y0 - w, y1 + w, zr, zz, group, part, { off });
  b.panel([[x0, y0, zz - 20], [x1, y0, zz - 20], [x1, y1, zz - 20], [x0, y1, zz - 20]], group, part + '_g', 'glass', off);
  const ym = (y0 + y1) / 2; b.box(x0, Math.min(x1, X1i), ym - 25, ym + 25, zz - 40, zz, group, part, { off, cap: 'thin' });
}
function shopOpening(M) { return M.openings.find(o => o.kind === 'shop') || null; }

/* ═══════════════════════════════ 新要素（docs/archstudio/ELEMENTS.md）：壁の接合・柱・吹抜・斜路・ブリーズ・ソレイユ・屋根の板 ═══════════════════════════════
   モデルの壁（芯の線分）をそのまま置く汎用の組み立て。archdraw の M（4 面の外壁・通り芯）に頼らないので、通り芯の外に外壁がある建物（ショーダン邸）も描ける。 */
const ARCH = () => (window.GnotoArchStudio || window.GnotoArch || {});
function wallDir(w) { const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], L = Math.hypot(dx, dy) || 1; return { u: [dx / L, dy / L], n: [-dy / L, dx / L], len: L }; }
/* 壁の接合：model.wallJoin(m, level) があればそれを使う（S-A）。無ければここだけの仮の実装：
   端点が他の壁の芯に乗る壁は、L 形なら id の小さい方を相手の厚さの半分だけ伸ばし、大きい方を相手の面まで縮める（重ならずに隅がそろう）。
   T 形なら相手の面で止める。返り値 [{id, w, poly, s0, s1}]（s0・s1 は a→b の芯に沿う区間。開口の at はこの区間の中） */
function joinedWalls(m, level) {
  const MD = ARCH().model;
  if (MD && typeof MD.wallJoin === 'function') {
    try {
      const r = MD.wallJoin(m, level);
      if (Array.isArray(r) && r.length) return r.map(x => { const w = x.w || x.wall || arr(m.walls).find(q => q.id === (x.id || x.wall)); const poly = x.poly || x.polygon; if (!w || !poly || poly.length < 3) return null; const g = wallDir(w); let lo = 1e18, hi = -1e18; poly.forEach(p => { const t = (p[0] - w.a[0]) * g.u[0] + (p[1] - w.a[1]) * g.u[1]; if (t < lo) lo = t; if (t > hi) hi = t; }); return { id: w.id, w, poly, s0: isFinite(+x.s0) ? +x.s0 : lo, s1: isFinite(+x.s1) ? +x.s1 : hi }; }).filter(Boolean);
    } catch (e) { /* 仮の実装へ */ }
  }
  const ws = arr(m.walls).filter(w => w && w.a && w.b && (level == null || w.level === level) && !w.column && isFinite(+w.a[0]) && isFinite(+w.b[0]));
  return ws.map(w => {
    const g = wallDir(w), t = +w.t || 150; let s0 = 0, s1 = g.len;
    [[w.a, -1], [w.b, 1]].forEach(([P, end]) => {
      for (const q of ws) {
        if (q === w) continue; const gq = wallDir(q), tq = +q.t || 150;
        if (Math.abs(g.u[0] * gq.u[0] + g.u[1] * gq.u[1]) > 0.95) continue;   // 平行な壁は接合しない
        const dn = Math.abs((P[0] - q.a[0]) * gq.n[0] + (P[1] - q.a[1]) * gq.n[1]), ds = (P[0] - q.a[0]) * gq.u[0] + (P[1] - q.a[1]) * gq.u[1];
        if (dn > tq / 2 + 1 || ds < -t / 2 - 1 || ds > gq.len + t / 2 + 1) continue;
        const atEnd = ds < t / 2 + 1 || ds > gq.len - t / 2 - 1, cosA = Math.abs(g.u[0] * gq.n[0] + g.u[1] * gq.n[1]), k = cosA > 1e-6 ? 1 / cosA : 1;
        const d = atEnd ? ((String(w.id) < String(q.id)) ? tq / 2 * k : -(tq / 2) * k) : -(tq / 2) * k;
        if (end < 0) s0 = Math.max(s0 - d, -tq); else s1 = Math.min(s1 + d, g.len + tq);
        break;
      }
    });
    if (s1 - s0 < 1) { s0 = 0; s1 = g.len; }
    const h = t / 2, p0 = [w.a[0] + g.u[0] * s0, w.a[1] + g.u[1] * s0], p1 = [w.a[0] + g.u[0] * s1, w.a[1] + g.u[1] * s1];
    return { id: w.id, w, s0, s1, poly: [[p0[0] + g.n[0] * h, p0[1] + g.n[1] * h], [p1[0] + g.n[0] * h, p1[1] + g.n[1] * h], [p1[0] - g.n[0] * h, p1[1] - g.n[1] * h], [p0[0] - g.n[0] * h, p0[1] - g.n[1] * h]] };
  });
}
function isAxisRect(poly) { if (poly.length !== 4) return false; const bb = bbox2(poly); return poly.every(p => (Math.abs(p[0] - bb[0]) < 0.5 || Math.abs(p[0] - bb[2]) < 0.5) && (Math.abs(p[1] - bb[1]) < 0.5 || Math.abs(p[1] - bb[3]) < 0.5)); }
/* 凸の平面多角形を z0..z1 に立ち上げる（軸に平行な長方形なら箱、そうでなければ角柱）。cut で水平に切り、切り口を黒に */
function solidPoly(b, poly, z0, z1, group, part, o) {
  o = o || {}; const off = o.off || [0, 0, 0]; let tones = o.tones;
  if (o.cut != null) { if (z0 >= o.cut - 1e-6) return null; if (z1 > o.cut) { z1 = o.cut; tones = Object.assign({}, tones || {}, { top: o.poche === false ? 'top' : 'cut' }); } }
  if (z1 - z0 < 1e-6) return null;
  if (isAxisRect(poly)) { const bb = bbox2(poly); return b.sc.box(bb[0] + off[0], bb[2] + off[0], bb[1] + off[1], bb[3] + off[1], z0 + off[2], z1 + off[2], group, { part, cap: o.cap || 'main', tones, accent: o.accent || [], name: part, check: false }); }
  const base = ccw(poly).map(p => [p[0] + off[0], p[1] + off[1], z0 + off[2]]);
  if (base.length < 3 || Math.abs(area2(base)) < 1) return null;
  return b.sc.prism(base, [0, 0, z1 - z0], group, { part, cap: o.cap || 'main', tones, name: part });
}
function outwardOf(M, w) { const g = wallDir(w), c = M.center || [(M.X[0] + M.X[M.X.length - 1]) / 2, (M.Y[0] + M.Y[M.Y.length - 1]) / 2], mx = (w.a[0] + w.b[0]) / 2 - c[0], my = (w.a[1] + w.b[1]) / 2 - c[1]; return (mx * g.n[0] + my * g.n[1]) >= 0 ? g.n : [-g.n[0], -g.n[1]]; }
function sideOfWall(M, w) { const n = outwardOf(M, w); return Math.abs(n[0]) > Math.abs(n[1]) ? (n[0] > 0 ? 'E' : 'W') : (n[1] > 0 ? 'N' : 'S'); }
/* 壁 1 枚（接合した区間 s0..s1）を、開口を抜いて置く。fl はその階の床（開口の sill・head の基準） */
function wallSolid(b, M, jw, fl, z0, z1, group, part, o) {
  o = o || {}; const w = jw.w, g = wallDir(w), h = (+w.t || 150) / 2;
  const ops = arr(M.raw.openings).filter(op => op && op.wall === w.id && isFinite(+op.at) && isFinite(+op.width)).map(op => [+op.at, +op.at + +op.width, fl + (+op.sill || 0), fl + (isFinite(+op.head) ? +op.head : 2000)]);
  for (const [a, c, za, zb] of splitWall(jw.s0, jw.s1, z0, z1, ops)) {
    const p0 = [w.a[0] + g.u[0] * a, w.a[1] + g.u[1] * a], p1 = [w.a[0] + g.u[0] * c, w.a[1] + g.u[1] * c];
    solidPoly(b, [[p0[0] + g.n[0] * h, p0[1] + g.n[1] * h], [p1[0] + g.n[0] * h, p1[1] + g.n[1] * h], [p1[0] - g.n[0] * h, p1[1] - g.n[1] * h], [p0[0] - g.n[0] * h, p0[1] - g.n[1] * h]], za, zb, group, part, { off: o.off, cut: o.cut, accent: o.accent, tones: o.tones });
  }
}
/* 開口に入る建具：窓は枠 50 と中桟とガラス（壁の芯の面）、戸は閉じた板 */
function windowSolid(b, M, jw, op, fl, group, part, o) {
  o = o || {}; const w = jw.w, g = wallDir(w), fw = 50, cut = o.cut, off = o.off || [0, 0, 0];
  const a0 = +op.at, a1 = a0 + +op.width, z0 = fl + (+op.sill || 0), z1 = fl + (isFinite(+op.head) ? +op.head : 2000);
  if (!(a1 > a0) || !(z1 > z0) || (cut != null && z0 >= cut)) return;
  const P = (s, d) => [w.a[0] + g.u[0] * s + g.n[0] * d, w.a[1] + g.u[1] * s + g.n[1] * d];
  const seg = (sa, sb, na, nb, za, zb) => solidPoly(b, [P(sa, na), P(sb, na), P(sb, nb), P(sa, nb)], za, zb, group, part, { off, cut, cap: 'thin' });
  if (op.type === 'door') { seg(a0, a1, -18, 18, z0, z1); return; }
  seg(a0, a1, -35, 35, z0, z0 + fw); seg(a0, a1, -35, 35, z1 - fw, z1); seg(a0, a0 + fw, -35, 35, z0 + fw, z1 - fw); seg(a1 - fw, a1, -35, 35, z0 + fw, z1 - fw);
  const n = Math.max(1, Math.round(+op.panels) || (op.type === 'fix' ? 1 : 2));
  for (let i = 1; i < n; i++) { const s = a0 + fw + (a1 - a0 - 2 * fw) * i / n; seg(s - fw / 2, s + fw / 2, -35, 35, z0 + fw, z1 - fw); }
  const gz1 = Math.min(z1 - fw, cut != null ? cut : z1);
  if (gz1 > z0 + fw) { const q0 = P(a0 + fw, 0), q1 = P(a1 - fw, 0); b.sc.panel([[q0[0] + off[0], q0[1] + off[1], z0 + fw + off[2]], [q1[0] + off[0], q1[1] + off[1], z0 + fw + off[2]], [q1[0] + off[0], q1[1] + off[1], gz1 + off[2]], [q0[0] + off[0], q0[1] + off[1], gz1 + off[2]]], group, { part: part + '_g', tone: 'glass', cap: 'thin' }); }
}
/* 独立柱の平面形（rect は w×d、round は直径 w の 12 角形） */
function columnPoly(c) {
  const w = +c.w || 400, d = +c.d || w, x = +c.at[0], y = +c.at[1];
  if (c.shape === 'round') { const r = w / 2, pts = []; for (let i = 0; i < 12; i++) pts.push([x + r * Math.cos(i * Math.PI / 6), y + r * Math.sin(i * Math.PI / 6)]); return pts; }
  return [[x - w / 2, y - d / 2], [x + w / 2, y - d / 2], [x + w / 2, y + d / 2], [x - w / 2, y + d / 2]];
}
/* 柱の下端・上端（GL から）：from の床（無ければ level の床）から to の床へ。to が屋根の id か roofs.supports に名があれば屋根の板の下端。無ければ次の階の床 */
function columnZ(M, c) {
  const FL = M.FL, ids = M.levelIds, i = ids.indexOf(c.level); if (i < 0 || FL[c.level] == null) return null;
  const z0 = (c.from != null && FL[c.from] != null) ? FL[c.from] : FL[c.level];
  let z1 = null;
  if (c.to != null) { if (FL[c.to] != null) z1 = FL[c.to]; else { const rf = M.roofs.find(r => r.id === c.to); if (rf) z1 = +rf.fl - (isFinite(+rf.thickness) ? +rf.thickness : 300); } }
  if (z1 == null) { const sup = M.roofs.find(r => arr(r.supports).indexOf(c.id) >= 0); if (sup) z1 = +sup.fl - (isFinite(+sup.thickness) ? +sup.thickness : 300); }
  if (z1 == null) z1 = i + 1 < ids.length ? FL[ids[i + 1]] : (M.FL.RF > FL[c.level] + 1 ? M.FL.RF - M.slab : FL[c.level] + (M.story[c.level] || 2800));
  return z1 > z0 ? [z0, z1] : null;
}
function holePoly(hole) {
  if (!hole) return null;
  if (arr(hole.polygon).length >= 3) return hole.polygon.map(p => [+p[0], +p[1]]);
  if (hole.c && (isFinite(+hole.rx) || isFinite(+hole.r))) {
    const rx = isFinite(+hole.rx) ? +hole.rx : +hole.r, ry = isFinite(+hole.ry) ? +hole.ry : rx, rot = (+hole.rot || 0) * Math.PI / 180, pts = [];
    for (let i = 0; i < 32; i++) { const t = i * Math.PI / 16, x = rx * Math.cos(t), y = ry * Math.sin(t); pts.push([+hole.c[0] + x * Math.cos(rot) - y * Math.sin(rot), +hole.c[1] + x * Math.sin(rot) + y * Math.cos(rot)]); }
    return pts;
  }
  return null;
}
function polyYAt(poly, x) { const ys = [], n = poly.length; for (let i = 0; i < n; i++) { const p = poly[i], q = poly[(i + 1) % n]; if ((p[0] <= x) !== (q[0] <= x)) ys.push(p[1] + (q[1] - p[1]) * (x - p[0]) / (q[0] - p[0])); } return ys; }
/* 長方形の板 rect=[x0,y0,x1,y1] から多角形の穴を抜いた立体。穴の外接矩形の中は縦の帯に分けて凸にする（曲線の孔は折れ線の近似） */
function slabWithHoles(b, rect, holes, z0, z1, group, part, off, o) {
  o = o || {}; const [x0, y0, x1, y1] = rect; if (!(x1 > x0 && y1 > y0 && z1 > z0)) return;
  const hs = holes.map(h => ({ poly: h, bb: bbox2(h) })).filter(h => h.bb[0] < x1 && h.bb[2] > x0 && h.bb[1] < y1 && h.bb[3] > y0);
  const rects = hs.map(h => [Math.max(x0, h.bb[0]), Math.min(x1, h.bb[2]), Math.max(y0, h.bb[1]), Math.min(y1, h.bb[3])]);
  for (const [a, c, ya, yc] of plateMinus(x0, x1, y0, y1, rects)) b.box(a, c, ya, yc, z0, z1, group, part, { off, cut: o.cut, tones: o.tones });
  hs.forEach((h, k) => {
    const [a, c, ya, yc] = rects[k];
    if (isAxisRect(h.poly)) return;   // 長方形の穴はそのまま抜けている
    const N = Math.max(4, Math.min(16, Math.round((c - a) / 250))), eps = 0.5;
    const yAt = (x) => { const ys = polyYAt(h.poly, Math.min(Math.max(x, h.bb[0] + eps), h.bb[2] - eps)); return ys.length ? [Math.min(...ys), Math.max(...ys)] : null; };
    for (let i = 0; i < N; i++) {
      const xa = a + (c - a) * i / N, xb = a + (c - a) * (i + 1) / N, m0 = yAt(xa), m1 = yAt(xb), mm = yAt((xa + xb) / 2);
      if (!mm) { b.box(xa, xb, ya, yc, z0, z1, group, part, { off, cut: o.cut, tones: o.tones }); continue; }
      const lo0 = m0 ? m0[0] : mm[0], lo1 = m1 ? m1[0] : mm[0], hi0 = m0 ? m0[1] : mm[1], hi1 = m1 ? m1[1] : mm[1];
      if (Math.min(lo0, lo1) > ya + 1) solidPoly(b, [[xa, ya], [xb, ya], [xb, Math.max(lo1, ya)], [xa, Math.max(lo0, ya)]], z0, z1, group, part, { off, cut: o.cut, tones: o.tones });
      if (Math.max(hi0, hi1) < yc - 1) solidPoly(b, [[xa, Math.min(hi0, yc)], [xb, Math.min(hi1, yc)], [xb, yc], [xa, yc]], z0, z1, group, part, { off, cut: o.cut, tones: o.tones });
    }
  });
}
/* ブリーズ・ソレイユ：a→b の線の外側に、羽根（pitch ごとの縦板 thickness×depth）と、eggcrate/horizontal なら横板 */
function screenSolids(b, M, s, group, o) {
  o = o || {}; const fl = M.FL[s.level]; if (fl == null) return;
  const a = [+s.a[0], +s.a[1]], q = [+s.b[0], +s.b[1]], dx = q[0] - a[0], dy = q[1] - a[1], L = Math.hypot(dx, dy); if (!(L > 1)) return;
  const u = [dx / L, dy / L]; let n = [-u[1], u[0]];
  const c = M.center || [(M.X[0] + M.X[M.X.length - 1]) / 2, (M.Y[0] + M.Y[M.Y.length - 1]) / 2], mid = [(a[0] + q[0]) / 2 - c[0], (a[1] + q[1]) / 2 - c[1]];
  if (mid[0] * n[0] + mid[1] * n[1] < 0) n = [-n[0], -n[1]];   // 建物の外へ
  const depth = +s.depth, t = +s.thickness || 100, pitch = +s.pitch || 1000, from = +s.from || 0, H = +s.height, z0 = fl + from, z1 = z0 + H, kind = s.kind || 'vertical';
  if (!(depth > 0 && H > 0 && pitch > 0)) return;
  const P = (sx, d) => [a[0] + u[0] * sx + n[0] * d, a[1] + u[1] * sx + n[1] * d], part = o.part || 'screen';
  const piece = (s0, s1, za, zb) => solidPoly(b, [P(s0, 0), P(s1, 0), P(s1, depth), P(s0, depth)], za, zb, group, part, { off: o.off, cut: o.cut, cap: 'main' });
  if (kind === 'vertical' || kind === 'eggcrate') {
    const fins = []; for (let sx = 0; sx <= L - t + 1; sx += pitch) fins.push(Math.max(0, Math.min(sx, L - t)));
    if (L - fins[fins.length - 1] > t + 1) fins.push(L - t);
    fins.forEach(sx => piece(sx, sx + t, z0, z1));
  }
  if (kind === 'horizontal' || kind === 'eggcrate') {
    const hp = isFinite(+s.hpitch) ? +s.hpitch : (kind === 'horizontal' ? pitch : H);
    for (let z = z0; z < z1 - t - 1; z += hp) piece(0, L, z, Math.min(z + t, z1));
    piece(0, L, z1 - t, z1);
  }
}
/* 斜路：path（中心線）に沿う傾いた板（厚さ 200）と両側の手摺（H 900）。cut で切る */
function rampSolids(b, M, r, group, o) {
  o = o || {}; const FL = M.FL, z0 = FL[r.level], z1 = FL[r.to]; if (z0 == null || z1 == null) return;
  const path = r.path.map(p => [+p[0], +p[1]]), W = +r.width, T = isFinite(+r.thickness) ? +r.thickness : 200, off = o.off || [0, 0, 0];
  let total = 0; for (let i = 0; i + 1 < path.length; i++) total += Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]); if (!(total > 1) || !(W > 0)) return;
  let s = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const p = path[i], q = path[i + 1], L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, u = [(q[0] - p[0]) / L, (q[1] - p[1]) / L], n = [-u[1], u[0]];
    let za = z0 + (z1 - z0) * s / total, zb = z0 + (z1 - z0) * (s + L) / total, pb = q; s += L;
    if (o.cut != null) { if (za >= o.cut) continue; if (zb > o.cut) { const k = (o.cut - za) / (zb - za); pb = [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]; zb = o.cut; } }
    const Q = (pt, d, z) => [pt[0] + n[0] * d + off[0], pt[1] + n[1] * d + off[1], z + off[2]];
    b.sc.prism([Q(p, -W / 2, za), Q(pb, -W / 2, zb), Q(pb, W / 2, zb), Q(p, W / 2, za)], [0, 0, -T], group, { part: o.part || 'ramp', cap: 'main', name: 'ramp' });
    if (o.rail !== false) for (const side of [-1, 1]) { const d = side * (W / 2 - 40), hz = 900; b.sc.prism([Q(p, d, za + hz - 40), Q(pb, d, zb + hz - 40), Q(pb, d, zb + hz), Q(p, d, za + hz)], [n[0] * 40 * side, n[1] * 40 * side, 0], group, { part: (o.part || 'ramp') + '_rail', cap: 'thin', name: 'rail' }); }
  }
}
/* 屋根の板（roofs）：孔を抜いた板。曲面の殻は帯に分けて放物線の段で近似（折れ線の近似） */
function roofSolids(b, M, group, off, o) {
  o = o || {};
  M.roofs.forEach(r => {
    const T = isFinite(+r.thickness) ? +r.thickness : 300, z1 = +r.fl, z0 = z1 - T, poly = r.polygon.map(p => [+p[0], +p[1]]), bb = bbox2(poly), part = 'roofplate_' + r.id;
    const holes = arr(r.holes).map(holePoly).filter(Boolean);
    if (r.shell && r.shell.kind === 'curved' && isFinite(+r.shell.rise) && +r.shell.rise > 0) {
      const along = (bb[2] - bb[0]) >= (bb[3] - bb[1]) ? 0 : 1, N = 12, rise = +r.shell.rise;
      for (let i = 0; i < N; i++) {
        const t0 = i / N, t1 = (i + 1) / N, tm = (t0 + t1) / 2, dz = rise * (1 - Math.pow(2 * tm - 1, 2));
        const rc = along === 0 ? [bb[0] + (bb[2] - bb[0]) * t0, bb[1], bb[0] + (bb[2] - bb[0]) * t1, bb[3]] : [bb[0], bb[1] + (bb[3] - bb[1]) * t0, bb[2], bb[1] + (bb[3] - bb[1]) * t1];
        slabWithHoles(b, rc, holes, z0 + dz, z1 + dz, group, part, off, o);
      }
      return;
    }
    if (isAxisRect(poly)) slabWithHoles(b, [bb[0], bb[1], bb[2], bb[3]], holes, z0, z1, group, part, off, o);
    else solidPoly(b, poly, z0, z1, group, part, { off, cut: o.cut });
  });
}
/* 階 id の床の外形（外壁の接合した多角形の外接。外壁が無ければ全部の壁、それも無ければ通り芯） */
function floorRect(M, id) {
  const all = joinedWalls(M.raw, id), ext = all.filter(j => isExt(j.w)), pts = [];
  (ext.length ? ext : all).forEach(j => pts.push(...j.poly));
  if (!pts.length) { const h = M.tw / 2; return [M.X[0] - h, M.Y[0] - h, M.X[M.X.length - 1] + h, M.Y[M.Y.length - 1] + h]; }
  return bbox2(pts);
}
/* 階 id の床を抜く吹抜：その階の voids と、下の階から to（その床は残す）まで抜ける voids */
function voidPolys(M, id) {
  const FL = M.FL, z = FL[id]; if (z == null) return [];
  return M.voids.filter(v => v.level === id || (v.to != null && FL[v.level] != null && FL[v.to] != null && FL[v.level] < z && z < FL[v.to])).map(v => v.polygon.map(p => [+p[0], +p[1]]));
}
function floorSolid(b, M, id, z0, z1, group, part, off, o) {
  o = o || {}; const r = floorRect(M, id), t = o.inset || 0;
  slabWithHoles(b, [r[0] + t, r[1] + t, r[2] - t, r[3] - t], voidPolys(M, id).concat(o.extraHoles || []), z0, z1, group, part, off, o);
}
/* 階ごとに壁・建具・柱・斜路・ブリーズ・ソレイユを置く。
   opt.exterior：外壁だけ（外壁の無い階＝屋上テラスでは間仕切りと柱も）。opt.cut：FL+cut で切る層。opt.offFn(w, side)：壁ごとの移動（分解図） */
function buildLevelsGeneric(b, M, opt) {
  opt = opt || {}; const m = M.raw, FL = M.FL, ids = M.levelIds, cut = opt.cut, group = opt.group || 'bldg';
  ids.forEach((id, i) => {
    if (opt.level != null && id !== opt.level) return;
    const fl = FL[id]; if (fl == null) return;
    const nextZ = i + 1 < ids.length ? FL[ids[i + 1]] : (M.FL.RF > fl + 1 ? M.FL.RF : fl + (M.story[id] || 2800));
    const jws = joinedWalls(m, id), hasExt = jws.some(j => isExt(j.w)), last = i === ids.length - 1;
    const topOf = (w) => { if (isFinite(+w.h)) return fl + +w.h; if (last && isExt(w) && !M.roofIsLevel) return M.roofs.length ? M.FL.RF : M.top - M.coping; return nextZ; };
    jws.forEach(jw => {
      const w = jw.w, ext = isExt(w); if (opt.exterior && !ext && hasExt) return;
      const off = opt.offFn ? opt.offFn(w, sideOfWall(M, w)) : opt.off, zt = topOf(w);
      const z0 = opt.layer ? (i === 0 ? fl - 100 : fl - M.slab) : ((i === 0 && ext && fl > M.found_top) ? M.found_top : fl);
      const acc = (w.accent && ext && opt.accent !== false) ? [faceDir([outwardOf(M, w)[0], outwardOf(M, w)[1], 0])] : [];
      wallSolid(b, M, jw, fl, z0, zt, opt.groupFn ? opt.groupFn(w, sideOfWall(M, w)) : group, (ext ? 'ext_' : 'part_') + id, { off, cut, accent: acc, tones: opt.tones });
      if (ext || !opt.exterior) arr(m.openings).filter(op => op && op.wall === w.id).forEach(op => windowSolid(b, M, jw, op, fl, opt.groupFn ? opt.groupFn(w, sideOfWall(M, w)) : group, 'sash_' + id, { off: opt.winOffFn ? opt.winOffFn(w, sideOfWall(M, w)) : off, cut }));
    });
    M.columns.forEach(c => { if (c.level !== id) return; const z = columnZ(M, c); if (!z) return; if (opt.exterior && hasExt && !M.roofs.some(r => arr(r.supports).indexOf(c.id) >= 0)) return; solidPoly(b, columnPoly(c), z[0], z[1], group, 'col_' + id, { off: opt.off, cut }); });
    M.ramps.forEach(r => { if (r.level !== id) return; if (opt.exterior && hasExt) return; rampSolids(b, M, r, group, { off: opt.off, cut, part: 'ramp_' + id }); });
    if (opt.screens !== false) M.screens.forEach(s => { if (s.level !== id) return; screenSolids(b, M, s, group, { off: opt.off, cut, part: 'screen_' + id }); });
  });
}
/* 最上階の外壁の上の笠木（陸屋根・パラペットの建物） */
function copingGeneric(b, M, group, off) {
  const id = M.levelIds[M.levelIds.length - 1];
  joinedWalls(M.raw, id).forEach(jw => { if (!isExt(jw.w)) return; const g = wallDir(jw.w), h = (+jw.w.t || 150) / 2 + 25, P = (s, d) => [jw.w.a[0] + g.u[0] * s + g.n[0] * d, jw.w.a[1] + g.u[1] * s + g.n[1] * d]; solidPoly(b, [P(jw.s0, -h), P(jw.s1, -h), P(jw.s1, h), P(jw.s0, h)], M.top - M.coping, M.top, group, 'coping', { off }); });
}
function levelCenter(M) { const r = floorRect(M, M.levelIds[0]); return [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2]; }

/* 図 1：外観 */
function buildExterior(sc, M, context) {
  const b = new Builder(sc, M), FL = M.FL, g = 'bldg', ids = M.levelIds, fl1 = FL[ids[0]], mats = (M.raw && M.raw.materials) || {};
  M.center = levelCenter(M);
  // 基礎の立上り（1 階の外形の内側 15。1 階の床が GL より上のとき）
  const fr = floorRect(M, ids[0]); if (fl1 > 50) b.box(fr[0] + 15, fr[2] - 15, fr[1] + 15, fr[3] - 15, 0, Math.min(fl1, M.found_top), g, 'found');
  buildLevelsGeneric(b, M, { exterior: true, group: g });
  // 床の板（外壁の無い階＝屋上テラスや、吹抜から見える階）
  ids.forEach((id, i) => { if (i === 0) return; floorSolid(b, M, id, FL[id] - M.slab, FL[id], g, 'floor_' + id, null, {}); });
  // 屋根：roofs があればその板（孔つき）。無ければ陸屋根の板・笠木・天窓（モデルに skylight があるとき）
  if (M.roofs.length) roofSolids(b, M, g, null, {});
  if (!M.roofIsLevel) {
    const r = floorRect(M, ids[ids.length - 1]), h = M.tw / 2, holes = M.roof_open ? [[M.roof_open.rect[0], M.roof_open.rect[2], M.roof_open.rect[1], M.roof_open.rect[3]]] : [];
    for (const [a, c, ya, yc] of plateMinus(r[0] + h, r[2] - h, r[1] + h, r[3] - h, holes)) b.box(a, c, ya, yc, FL.RF - M.slab, FL.RF, g, 'roof');
    if (!M.roofs.length) { copingGeneric(b, M, g); skylight(b, M, g); }
  }
  // 縦樋・ルーフドレン：materials.downpipe があるときだけ（西面の北寄り。判断）
  if (mats.downpipe && !M.roofIsLevel) {
    const h = M.tw / 2, X0 = fr[0] + h, Y1 = fr[3] - h, py = Y1 - 350;
    b.rectLines(X0 + 150, Y1 - 450, X0 + 350, Y1 - 250, FL.RF);
    b.box(X0 - h - 160, X0 - h, py - 90, py + 90, FL.RF - 420, FL.RF - 120, g, 'leader_box', { cap: 'thin' });
    b.box(X0 - h - 120, X0 - h - 50, py - 35, py + 35, 0, FL.RF - 420, g, 'downpipe', { cap: 'thin' });
    for (let zb = 1200; zb < FL.RF - 600; zb += 1800) b.box(X0 - h - 50, X0 - h, py - 12, py + 12, zb - 15, zb + 15, g, 'bracket', { cap: 'thin' });
    M.downpipe = { x: X0 - h - 120, y: py };
  }
  // 外壁の目地：materials.joints（各階の床の位置）があるときだけ。見える南・西の面
  if (mats.joints) for (const id of ids.slice(1).concat(M.roofIsLevel ? [] : ['RF'])) {
    const z = FL[id] - 150, h = M.tw / 2; let segs = [[fr[0], fr[2]]];
    for (const o of M.openings) if (o.wall === 'S' && o.z0 < z && z < o.z1) segs = minus(segs, o.a0, o.a1);
    for (const [a, c] of segs) b.line([a, fr[1], z], [c, fr[1], z], 'joint');
    b.line([fr[0], fr[1], z], [fr[0], fr[3] - h, z], 'joint');
  }
  if (context !== false) buildContext(sc, M);
  return b;
}
/* 周辺：路地（site.roads があるとき）・敷地境界（site.polygon があるとき）・隣家（site.neighbors の側だけ。奥＝北・東は立体、手前＝南・西は足元の線） */
function buildContext(sc, M) {
  const S = M.site, Al = M.alley, fr = floorRect(M, M.levelIds[0]), X0 = fr[0], X1 = fr[2], Y0 = fr[1], Y1 = fr[3], W = X1 - X0, D = Y1 - Y0;
  const xl = Math.min(S.x0, X0) - 1500, xr = Math.max(S.x1, X1) + 1500;
  if (Al) { sc.line([xl, Al.y_near, 0], [xr, Al.y_near, 0], 'ctx'); sc.line([xl, Al.y_far, 0], [xr, Al.y_far, 0], 'ctx'); const yc = (Al.y_near + Al.y_far) / 2; sc.line([xl, yc, 0], [xr, yc, 0], 'chainctx'); }
  if (S.has) { sc.line([S.x0, S.y0, 0], [S.x0, S.y1, 0], 'phantom'); sc.line([S.x1, S.y0, 0], [S.x1, S.y1, 0], 'phantom'); sc.line([S.x0, S.y1, 0], [S.x1, S.y1, 0], 'phantom'); if (!Al || Al.side !== 'S') sc.line([S.x0, S.y0, 0], [S.x1, S.y0, 0], 'phantom'); }
  M.neighbors.forEach(nb => {
    const two = !/平屋|1 ?階|一階/.test(String(nb.kind || '')), eave = isFinite(+nb.eave) ? +nb.eave : (two ? 5800 : 3200), ridge = isFinite(+nb.ridge) ? +nb.ridge : (two ? 7300 : 4500);
    if (nb.side === 'N') gableHouse(sc, X0 + 300, X1 - 300, S.y1 + 300, S.y1 + 300 + Math.max(2000, D * 0.25), eave, ridge, 'x');
    else if (nb.side === 'E') gableHouse(sc, S.x1 + 300, S.x1 + 300 + Math.max(3000, W * 0.55), Y0 - 600, Y1 - 300, eave, ridge, 'y');
    else {   // 手前（南・西）は建物を隠すので足元の線だけ
      const lot = nb.side === 'W' ? [S.x0 - 300 - Math.max(2400, W * 0.45), S.x0 - 300, Y0 - 600, Y0 + Math.max(2400, D * 0.5)] : [X0 + 500, X1 - 300, (Al ? Al.y_far : S.y0) - 2400, (Al ? Al.y_far : S.y0) - 150];
      const P = [[lot[0], lot[2], 0], [lot[1], lot[2], 0], [lot[1], lot[3], 0], [lot[0], lot[3], 0]], edges = { S: [0, 1], E: [1, 2], N: [2, 3], W: [3, 0] };
      for (const k in edges) if (k !== (nb.side === 'W' ? 'N' : 'S')) sc.line(P[edges[k][0]], P[edges[k][1]], 'ctx');
    }
  });
}
/* 図 2：各階の分解（平面を FL+1,200 で切った層を上下に離す） */
function buildFloorLayer(sc, M, fl, off, group) {
  const b = new Builder(sc, M), FL = M.FL, z = FL[fl], cut = z + M.cut, ids = M.levelIds, i = ids.indexOf(fl), first = i === 0, zb = first ? z - 100 : z - M.slab;
  M.center = M.center || levelCenter(M);
  // 床の板：外壁の内側、階段の穴と吹抜（voids）を抜く
  const stairHoles = holesOf(M, fl).map(([x0, x1, y0, y1]) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
  floorSolid(b, M, fl, zb, z, group, 'floor_' + fl, off, { extraHoles: stairHoles });
  // 壁（外壁・間仕切り。接合した多角形）・建具・柱・斜路・ブリーズ・ソレイユを FL+cut で切る
  buildLevelsGeneric(b, M, { level: fl, off, cut, group, layer: true });
  for (const st of M.stairs) if (st.fl === fl) {
    b.stair(st, group, { off, cut });
    const steps = stairSteps(st, FL).filter(s => s.zt <= cut + 1e-6); if (!steps.length) continue;
    const pts = [];
    if (st.axis === 'x') { const ym = (st.bbox[1] + st.bbox[3]) / 2; for (const s of steps) { pts.push([s.x0 + 60, ym, s.zt + 1]); pts.push([s.x1 - 30, ym, s.zt + 1]); } }
    else { const xm = (st.x0 + st.x1) / 2; for (const s of steps) { pts.push([xm, s.ya + st.dir * 60, s.zt + 1]); pts.push([xm, s.yb - st.dir * 30, s.zt + 1]); } }
    for (let k = 0; k < pts.length - 1; k++) b.line(pts[k], pts[k + 1], 'thin', off);
    const end = pts[pts.length - 1], d = st.axis === 'x' ? [1, 0] : [0, st.dir];
    b.line(end, [end[0] - d[0] * 160 - d[1] * 90, end[1] - d[1] * 160 + d[0] * 90, end[2]], 'thin', off);
    b.line(end, [end[0] - d[0] * 160 + d[1] * 90, end[1] - d[1] * 160 - d[0] * 90, end[2]], 'thin', off);
  }
  // 床の穴の対角線（階段の上）と、壁の無い縁の手摺（判断：H 1,100）
  for (const [wx0, wx1, wy0, wy1] of holesOf(M, fl)) { b.line([wx0, wy0, z], [wx1, wy1, z], 'thin', off); b.line([wx0, wy1, z], [wx1, wy0, z], 'thin', off); }
  for (const [wx0, wx1, wy0, wy1] of holesOf(M, fl)) { const walled = joinedWalls(M.raw, fl).some(j => { const r = bbox2(j.poly); return Math.abs(r[2] - wx0) < 5 && r[1] <= wy0 + 5 && r[3] >= wy1 - 5; }); if (!walled) b.box(wx0 - 40, wx0, wy0, wy1, z, z + 1100, group, 'guard', { cap: 'thin', off, cut }); }
  // 吹抜の縁の線（床の穴の輪郭：細線）
  voidPolys(M, fl).forEach(pg => { for (let k = 0; k < pg.length; k++) b.line([pg[k][0], pg[k][1], z], [pg[(k + 1) % pg.length][0], pg[(k + 1) % pg.length][1], z], 'thin', off); });
  b.fixtures(fl, group, { off, cut });
  return b;
}
function buildFoundationLayer(sc, M, off, group, stems, doma) {
  const b = new Builder(sc, M), fr = floorRect(M, M.levelIds[0]), X0 = fr[0], X1 = fr[2], Y0 = fr[1], Y1 = fr[3], fl1 = M.FL[M.levelIds[0]], tw = M.tw;
  b.box(X0, X1, Y0, Y1, -150, 50, group, 'mat', { off });
  const w = 450; b.box(X0, X1, Y0, Y0 + w, -450, -150, group, 'footing', { off }); b.box(X0, X0 + w, Y0 + w, Y1, -450, -150, group, 'footing', { off });
  if (doma && fl1 > 50) b.box(X0 + tw, X1 - tw, Y0 + tw, Y1 - tw, 50, fl1, group, 'doma', { off });
  if (!stems) return b;
  // 立上り：1 階の外壁の下（接合した多角形のまま）。土間の開口（床まで）の下は床の高さまで
  const ft = M.found_top;
  joinedWalls(M.raw, M.levelIds[0]).forEach(jw => { if (!isExt(jw.w)) return; const ops = arr(M.raw.openings).filter(o => o.wall === jw.w.id && (+o.sill || 0) <= 0).map(o => [+o.at, +o.at + +o.width, 50, ft]); const g = wallDir(jw.w), h = (+jw.w.t || 150) / 2, P = (s, d) => [jw.w.a[0] + g.u[0] * s + g.n[0] * d, jw.w.a[1] + g.u[1] * s + g.n[1] * d]; for (const [a, c, za, zb] of splitWall(jw.s0, jw.s1, 50, ft, ops)) solidPoly(b, [P(a, -h), P(c, -h), P(c, h), P(a, h)], za, zb, group, 'stem', { off }); for (const [a, c] of ops) if (fl1 > ft) solidPoly(b, [P(a, -h), P(c, -h), P(c, h), P(a, h)], 50, fl1, group, 'stem', { off }); });
  return b;
}
function buildRoofLayer(sc, M, off, group) {
  const b = new Builder(sc, M), FL = M.FL, ids = M.levelIds, last = ids[ids.length - 1];
  M.center = M.center || levelCenter(M);
  if (M.roofs.length) {
    roofSolids(b, M, group, off, {});
    // 屋根を受ける柱（最上階の床から屋根の下端まで）は屋根の層に付ける
    M.columns.forEach(c => { if (!M.roofs.some(r => arr(r.supports).indexOf(c.id) >= 0) && !(c.to && M.roofs.some(r => r.id === c.to))) return; const z = columnZ(M, c); if (!z) return; solidPoly(b, columnPoly(c), z[0], z[1], group, 'roofcol', { off }); });
    return b;
  }
  const fr = floorRect(M, last), h = M.tw / 2, zt = M.top - M.coping;
  for (const [a, c, ya, yc] of plateMinus(fr[0] + h, fr[2] - h, fr[1] + h, fr[3] - h, holesOf(M, 'RF'))) b.box(a, c, ya, yc, FL.RF - M.slab, FL.RF, group, 'roofslab', { off });
  joinedWalls(M.raw, last).forEach(jw => { if (!isExt(jw.w)) return; const acc = jw.w.accent ? [faceDir([outwardOf(M, jw.w)[0], outwardOf(M, jw.w)[1], 0])] : []; const g = wallDir(jw.w), hh = (+jw.w.t || 150) / 2, P = (s, d) => [jw.w.a[0] + g.u[0] * s + g.n[0] * d, jw.w.a[1] + g.u[1] * s + g.n[1] * d]; solidPoly(b, [P(jw.s0, -hh), P(jw.s1, -hh), P(jw.s1, hh), P(jw.s0, hh)], FL.RF - M.slab, zt, group, 'parapet', { off, accent: acc }); });
  copingGeneric(b, M, group, off); skylight(b, M, group, off);
  if (M.raw.materials && M.raw.materials.downpipe) b.rectLines(fr[0] + h + 150, fr[3] - h - 450, fr[0] + h + 350, fr[3] - h - 250, FL.RF, off);
  return b;
}

/* 図 3：在来軸組の部材の箱の列 [x0,x1,y0,y1,z0,z1,name]。互いに食い込まない */
const COL = 120;
function frameMembers(M) {
  const FL = M.FL, h = COL / 2, X0 = M.X[0], X1 = M.X[M.X.length - 1], Y0 = M.Y[0], Y1 = M.Y[M.Y.length - 1], ft = M.found_top, sillTop = ft + 120, topRailZ = M.top - M.coping - 120, out = [];
  const shop = shopOpening(M), floors = M.levelIds, levels = floors.slice(1).concat(['RF']);
  if (shop && shop.wall === 'S') { out.push([X0 - h, shop.a0 - h * 2, Y0 - h, Y0 + h, ft, sillTop, '土台']); out.push([shop.a1 + h * 2, X1 + h, Y0 - h, Y0 + h, ft, sillTop, '土台']); } else out.push([X0 - h, X1 + h, Y0 - h, Y0 + h, ft, sillTop, '土台']);
  out.push([X0 - h, X1 + h, Y1 - h, Y1 + h, ft, sillTop, '土台']); out.push([X0 - h, X0 + h, Y0 + h, Y1 - h, ft, sillTop, '土台']); out.push([X1 - h, X1 + h, Y0 + h, Y1 - h, ft, sillTop, '土台']);
  for (const [x, y] of [[X0, Y0], [X1, Y0], [X0, Y1], [X1, Y1]]) out.push([x - h, x + h, y - h, y + h, sillTop, topRailZ, '通し柱']);
  const beamTop = {}; levels.forEach(L => { beamTop[L] = FL[L] - 40; });
  const dS = 450, dO = 300;
  floors.forEach((fl, i) => {
    const zb = i === 0 ? sillTop : beamTop[levels[i - 1]], up = levels[i], zS = beamTop[up] - dS, zO = beamTop[up] - dO;
    for (const c of wallColumns(M, 'S', fl)) { const z0 = (i === 0 && shop && (Math.abs(c - (shop.a0 - h)) < 1 || Math.abs(c - (shop.a1 + h)) < 1)) ? ft : zb; out.push([c - h, c + h, Y0 - h, Y0 + h, z0, zS, '管柱']); }
    for (const c of wallColumns(M, 'N', fl)) out.push([c - h, c + h, Y1 - h, Y1 + h, zb, zO, '管柱']);
    for (const c of wallColumns(M, 'W', fl)) out.push([X0 - h, X0 + h, c - h, c + h, zb, zO, '管柱']);
    for (const c of wallColumns(M, 'E', fl)) out.push([X1 - h, X1 + h, c - h, c + h, zb, zO, '管柱']);
  });
  const inner = M.Y.slice(1, -1);
  for (const L of levels) {
    const t = beamTop[L];
    out.push([X0 + h, X1 - h, Y0 - h, Y0 + h, t - dS, t, '胴差']); out.push([X0 + h, X1 - h, Y1 - h, Y1 + h, t - dO, t, '胴差']); out.push([X0 - h, X0 + h, Y0 + h, Y1 - h, t - dO, t, '胴差']); out.push([X1 - h, X1 + h, Y0 + h, Y1 - h, t - dO, t, '胴差']);
    const holes = holesOf(M, L);
    if (holes.length) {
      const wx0 = Math.min(...holes.map(hh => hh[0])), wy0 = Math.min(...holes.map(hh => hh[2])), wy1 = Math.max(...holes.map(hh => hh[3])), tx0 = wx0 - 120, tx1 = wx0;
      // 大梁：穴にかかる通り芯は受け梁（tx0）まで、それ以外は全長
      inner.forEach(y => { if (y < wy0 - 60 || y > wy1 + 60) out.push([X0 + h, X1 - h, y - h, y + h, t - 390, t, '大梁']); else out.push([X0 + h, tx0, y - h, y + h, t - 390, t, '大梁']); });
      const yFrom = inner.length ? Math.min(...inner.filter(y => y < wy0 - 60).concat([Y0])) : Y0;
      out.push([tx0, tx1, Math.max(yFrom + h, Y0 + h), Y1 - h, t - 390, t, '受け梁']);
      out.push([tx1, X1 - h, wy0 - 120, wy0, t - 240, t, '受け梁']);
      if (wy1 + 120 <= Y1 - h) out.push([tx1, X1 - h, wy1, wy1 + 120, t - 240, t, '受け梁']);
      const bays = [Y0].concat(inner, [Y1]);
      for (let x = X0 + 900; x < X1 - 60; x += 900) { if (x + 52.5 > tx0) continue; for (let k = 0; k < bays.length - 1; k++) out.push([x - 52.5, x + 52.5, bays[k] + h, bays[k + 1] - h, t - 240, t, '小梁']); }
      const xe = (tx1 + X1 - h) / 2;
      for (let k = 0; k < bays.length - 1; k++) { const ya = bays[k] + h, yb = Math.min(bays[k + 1] - h, wy0 - 120); if (yb > ya + 1 && bays[k] < wy0) out.push([xe - 52.5, xe + 52.5, ya, yb, t - 240, t, '小梁']); }
    } else {
      inner.forEach(y => out.push([X0 + h, X1 - h, y - h, y + h, t - 390, t, '大梁']));
      const bays = [Y0].concat(inner, [Y1]);
      for (let x = X0 + 900; x < X1 - 60; x += 900) for (let k = 0; k < bays.length - 1; k++) out.push([x - 52.5, x + 52.5, bays[k] + h, bays[k + 1] - h, t - 240, t, '小梁']);
    }
  }
  for (const o of M.openings) {
    let yc; if (o.wall === 'S') yc = Y0; else if (o.wall === 'N') yc = Y1; else continue;
    if (o.z0 - FL[o.fl] > 0) out.push([o.a0, o.a1, yc - h, yc + h, o.z0 - 105, o.z0, '窓台']);
    const i = floors.indexOf(o.fl), up = levels[i]; if (!up) continue;
    const zb = beamTop[up] - (o.wall === 'S' ? dS : dO); if (o.z1 < zb - 1) out.push([o.a0, o.a1, yc - h, yc + h, o.z1, Math.min(o.z1 + 105, zb), 'まぐさ']);
  }
  const rt = beamTop.RF;
  for (let x = X0 + 900; x < X1 - 60; x += 900) { out.push([x - h, x + h, Y0 - h, Y0 + h, rt, topRailZ, '束']); out.push([x - h, x + h, Y1 - h, Y1 + h, rt, topRailZ, '束']); }
  for (let y = Y0 + 900; y < Y1 - 60; y += 900) { out.push([X0 - h, X0 + h, y - h, y + h, rt, topRailZ, '束']); out.push([X1 - h, X1 + h, y - h, y + h, rt, topRailZ, '束']); }
  out.push([X0 - h, X1 + h, Y0 - h, Y0 + h, topRailZ, topRailZ + 120, '横架材']); out.push([X0 - h, X1 + h, Y1 - h, Y1 + h, topRailZ, topRailZ + 120, '横架材']);
  out.push([X0 - h, X0 + h, Y0 + h, Y1 - h, topRailZ, topRailZ + 120, '横架材']); out.push([X1 - h, X1 + h, Y0 + h, Y1 - h, topRailZ, topRailZ + 120, '横架材']);
  return out;
}
/* 床（構造用合板 t28＋仕上げ＝40）：梁の内側、穴を抜く */
function deckBoxes(M) {
  const FL = M.FL, h = COL / 2, X0 = M.X[0], X1 = M.X[M.X.length - 1], Y0 = M.Y[0], Y1 = M.Y[M.Y.length - 1], out = [];
  for (const L of M.levelIds.slice(1).concat(['RF'])) {
    const holes = holesOf(M, L).map(([a, b, c, d]) => [a, b >= X1 - h - 20 ? X1 - h : b, c, d]);
    for (const [a, c, ya, yc] of plateMinus(X0 + h, X1 - h, Y0 + h, Y1 - h, holes)) out.push([a, c, ya, yc, FL[L] - 40, FL[L], L]);
  }
  return out;
}

/* ═══════════════════════════════ 図 1　外観（make_axon.fig1） ═══════════════════════════════ */
function bldgBbox(sc) { const pts = []; for (const f of sc.faces) if (f.solid.group !== 'ctx') pts.push(...f.p2); return pts.length ? bbox2(pts) : [0, 0, 1, 1]; }
function levelMarks(M) {
  const FL = M.FL, ids = M.levelIds, out = [[0, 'GL', '±0' + (ids.length ? '（' + ids[0] + 'L +' + fmtmm(FL[ids[0]]) + '）' : '')]];
  ids.slice(1).forEach(id => out.push([FL[id], id + 'L', '+' + fmtmm(FL[id])]));
  out.push([FL.RF, 'RFL', '+' + fmtmm(FL.RF)]); out.push([M.top, '最高高さ', '+' + fmtmm(M.top)]);
  return out;
}
function fig1(M, opt) {
  opt = opt || {}; const PR = projOf(opt), scale = opt.scale || 100, proj = new Projection(PR.kind, PR.angle, scale), sc = new Scene(proj);
  buildExterior(sc, M, opt.context !== false);
  const FL = M.FL, X = M.X, Y = M.Y, Al = M.alley, S = M.site, fr = floorRect(M, M.levelIds[0]), X0 = fr[0], X1 = fr[2], Y0 = fr[1], Y1 = fr[3], m = M.raw;
  const scrS = Math.max(0, ...M.screens.map(s => +s.depth || 0)), roofOut = M.roofs.length ? bbox2([].concat(...M.roofs.map(r => r.polygon.map(p => [+p[0], +p[1]])))) : null;
  const yFront = Math.min(Y0, roofOut ? roofOut[1] : Y0) - scrS, xLeft = Math.min(X0, roofOut ? roofOut[0] : X0) - scrS;
  const yEnd = (Al ? Al.y_far : Math.min(S.y0, yFront)) - 1500, xEnd = Math.min(S.x0, xLeft) - 2300;
  for (const x of X) sc.line([x, yFront, 0], [x, yEnd, 0], 'chain');
  for (const y of Y) sc.line([xLeft, y, 0], [xEnd, y, 0], 'chain');
  const lx = xLeft - 1500, levels = levelMarks(M), yv = Y1;
  for (const [z] of levels) sc.line([xLeft - 150, yv, z], [lx - 150, yv, z], 'thin');
  const res = sc.solve(), bb = resBbox(res);
  const SW = 297, SH = 420;
  if ((opt._auto || !opt.scale) && scale < 1000 && ((bb[2] - bb[0]) > SW - 90 || (bb[3] - bb[1]) > SH - 80)) return fig1(M, Object.assign({}, opt, { scale: scale * 2, _auto: true }));
  const sh = new Sheet(SW, SH, scale);
  let bl = bldgBbox(sc); const dx = SW / 2 - 6 - (bl[0] + bl[2]) / 2, dy = vcenterDy(bb, SH, 3);
  translate(res, proj, dx, dy); shiftScene(sc, dx, dy); bl = [bl[0] + dx, bl[1] + dy, bl[2] + dx, bl[3] + dy];
  sh.addResult(res);
  const P = (p) => proj.p(p);
  X.forEach((x, i) => { const q = P([x, yEnd, 0]), d = dirOf(P, [x, yEnd, 0], [x, yEnd - 1000, 0]); bubble(sh, [q[0] + d[0] * 2.3, q[1] + d[1] * 2.3], M.gridIds.x[i] || ('X' + (i + 1))); });
  Y.forEach((y, i) => { const q = P([xEnd, y, 0]), d = dirOf(P, [xEnd, y, 0], [xEnd - 1000, y, 0]); bubble(sh, [q[0] + d[0] * 2.3, q[1] + d[1] * 2.3], M.gridIds.y[i] || ('Y' + (i + 1))); });
  const yd = yEnd + 700;
  for (let i = 0; i < X.length - 1; i++) dimLine(sh, proj, [X[i], yd, 0], [X[i + 1], yd, 0], { text: fmtmm(X[i + 1] - X[i]), side: -1 });
  if (X.length > 1) dimLine(sh, proj, [X[0], yd - 600, 0], [X[X.length - 1], yd - 600, 0], { text: fmtmm(X[X.length - 1] - X[0]), side: -1, tpos: 0.68 });
  const xd = xEnd + 900;
  for (let i = 0; i < Y.length - 1; i++) dimLine(sh, proj, [xd, Y[i], 0], [xd, Y[i + 1], 0], { text: fmtmm(Y[i + 1] - Y[i]), side: 1, toff: 2.6 });
  if (Al) {
    const xa = X0 + (X1 - X0) * 0.25;
    dimLine(sh, proj, [xa, Al.y_far, 0], [xa, Al.y_near, 0], { text: (Al.width < 4000 ? '路地 ' : '道路 ') + fmtmm(Math.abs(Al.y_near - Al.y_far)), side: 1, toff: 5.6, tpos: 0.74 });
    if (Y0 - Al.y_near > 1) dimLine(sh, proj, [xa, Al.y_near, 0], [xa, Y0, 0], { text: '後退 ' + fmtmm(Y0 - Al.y_near), side: 1, toff: 5.0, tpos: 0.5 });
  }
  const zl = levels.map(([z]) => P([lx, yv, z])); sh.line(zl[0], zl[zl.length - 1], 0.13);
  levels.forEach(([z, name, val], i) => { const q = zl[i]; sh.line([q[0] - 0.6, q[1] + 0.6], [q[0] + 0.6, q[1] - 0.6], 0.25); sh.text(q[0] - 1.2, q[1] - 0.9, name + ' ' + val, 2.0, 400, 'end'); });
  // 引出線とラベル（右）：モデルにある要素だけ
  const R = [], ids = M.levelIds, topFl = ids[ids.length - 1], tw = fmtmm(M.tw);
  if (M.roof_open) { const [sx0, sy0, sx1, sy1] = M.roof_open.rect; R.push({ anchor: resolve(sc, P, [300, 0, 500].map(d => [(sx0 + sx1) / 2, (sy0 + sy1) / 2 + d, FL.RF + 230]), 'skylight'), lines: [['天窓', 2.0, 400], [fmtmm(sx1 - sx0) + '×' + fmtmm(sy1 - sy0), 2.0, 400]] }); }
  M.roofs.forEach(r => {
    const bbr = bbox2(r.polygon.map(p => [+p[0], +p[1]])), T = isFinite(+r.thickness) ? +r.thickness : 300, nh = arr(r.holes).length;
    const lines = [[r.name || '屋根の板', 2.0, 400], ['版 ' + fmtmm(T) + '・' + (Math.round((bbr[2] - bbr[0]) / 100) / 10).toFixed(1) + '×' + (Math.round((bbr[3] - bbr[1]) / 100) / 10).toFixed(1) + ' m・上端 GL+' + fmtmm(+r.fl), 2.0, 400]];
    if (nh) lines.push(['孔 ' + nh + ' か所' + (r.shell && r.shell.kind === 'curved' ? '・曲面は折れ線の近似' : ''), 2.0, 400]);
    else if (r.shell && r.shell.kind === 'curved') lines.push(['曲面の殻（折れ線の近似）', 2.0, 400]);
    R.push({ anchor: resolve(sc, P, [[bbr[2] - 300, bbr[1] + (bbr[3] - bbr[1]) * 0.35, +r.fl], [bbr[2] - 300, bbr[1] + 300, +r.fl]], 'roofplate_'), lines });
    const sup = M.columns.filter(c => arr(r.supports).indexOf(c.id) >= 0);
    if (sup.length) { const c = sup.slice().sort((p, q) => (q.at[0] - q.at[1]) - (p.at[0] - p.at[1]))[0], cz = columnZ(M, c); if (cz) R.push({ anchor: P([c.at[0] + (+c.w || 400) / 2, c.at[1], (cz[0] + cz[1]) / 2]), lines: [['独立柱 ' + sup.length + ' 本（屋根を受ける）', 2.0, 400], [(c.shape === 'round' ? 'φ' : '') + fmtmm(+c.w || 400) + (c.shape === 'round' ? '' : '×' + fmtmm(+c.d || +c.w || 400)), 2.0, 400]] }); }
  });
  if (!M.roofs.length && !M.roofIsLevel) R.push({ anchor: P([X1, Y1 - (Y1 - Y0) * 0.3, M.top]), lines: [['パラペット', 2.0, 400], ['RFL から ' + fmtmm(M.parapet), 2.0, 400]] });
  if (M.roofIsLevel) { const pw = joinedWalls(m, topFl).find(j => isExt(j.w) && isFinite(+j.w.h)); if (pw) R.push({ anchor: P([X1, Y1 - (Y1 - Y0) * 0.3, FL[topFl] + +pw.w.h]), lines: [['屋上の手摺壁', 2.0, 400], ['H ' + fmtmm(+pw.w.h), 2.0, 400]] }); }
  const scrTop = M.screens.filter(s => s.level === topFl)[0] || M.screens[0];
  if (scrTop) { const sa = [+scrTop.a[0], +scrTop.a[1]], sb = [+scrTop.b[0], +scrTop.b[1]], horiz = Math.abs(sb[1] - sa[1]) < Math.abs(sb[0] - sa[0]), fl = FL[scrTop.level]; const anc = horiz ? [Math.max(sa[0], sb[0]) - 600, Math.min(sa[1], sb[1]) - +scrTop.depth, fl + (+scrTop.from || 0) + +scrTop.height * 0.5] : [Math.min(sa[0], sb[0]) - +scrTop.depth, Math.min(sa[1], sb[1]) + 600, fl + (+scrTop.from || 0) + +scrTop.height * 0.5]; R.push({ anchor: P(anc), lines: [['ブリーズ・ソレイユ（' + { vertical: '縦の羽根', horizontal: '横の羽根', eggcrate: '格子' }[scrTop.kind || 'vertical'] + '）', 2.0, 400], ['奥行 ' + fmtmm(+scrTop.depth) + '・羽根 ' + fmtmm(+scrTop.thickness || 100) + ' @' + fmtmm(+scrTop.pitch || 1000) + '・' + M.screens.length + ' 面', 2.0, 400]] }); }
  const accW = M.accentWalls.filter(isExt)[0];
  if (accW) { const roadSide = Al ? Al.side : null, side = sideOfWall(M, accW), sideJa = { S: '南', N: '北', E: '東', W: '西' }[side]; R.push({ anchor: P([X1 - 500, Y0, FL[topFl] + 400]), lines: [[(accW.kind === 'fire' ? '耐火の外壁' : '外壁') + '（' + (roadSide === side ? (Al.width < 4000 ? '路地側' : '道路側') : sideJa + '面') + '）', 2.0, 400], ['厚 ' + tw + (m.materials && m.materials.exterior ? '・' + m.materials.exterior : ''), 2.0, 400]] }); }
  const sOps = M.openings.filter(o => o.wall === 'S').sort((a, b) => b.z0 - a.z0);
  const o2 = sOps.find(o => o.rail), o1 = M.openings.find(o => o.shutter);
  if (o2) R.push({ anchor: P([o2.a1 - 500, Y0 + 65, o2.z0 + 1300]), lines: [[o2.fire ? '防火設備の窓' : '窓', 2.0, 400], ['幅 ' + fmtmm(o2.a1 - o2.a0) + '・手すり FL+1,100', 2.0, 400]] });
  if (o1 && o1.wall === 'S') R.push({ anchor: P([o1.a1 - 400, Y0 + 65, o1.z0 + 1200]), lines: [['開口（' + (o1.panels || 2) + ' 枚引き）', 2.0, 400], ['幅 ' + fmtmm(o1.a1 - o1.a0) + '・高さ ' + fmtmm(o1.z1 - o1.z0), 2.0, 400], ['防火シャッター付き', 2.0, 400]] });
  else if (!o2 && sOps.length && !M.screens.length) { const o = sOps[0]; R.push({ anchor: P([o.a1 - 400, Y0 + 65, (o.z0 + o.z1) / 2]), lines: [['南面の開口', 2.0, 400], ['幅 ' + fmtmm(o.a1 - o.a0) + '・高さ ' + fmtmm(o.z1 - o.z0), 2.0, 400]] }); }
  if (opt.context !== false) { const nbE = M.neighbors.find(n => n.side === 'E'), nbN = M.neighbors.find(n => n.side === 'N'); const nb = nbE || nbN; if (nb) R.push({ anchor: nbE ? P([S.x1 + 2200, Y0 + 2000, 4200]) : P([(X0 + X1) / 2, S.y1 + 900, 4200]), lines: [['隣地' + (nb.kind ? '（' + nb.kind + '）' : ''), 2.0, 400]] }); }
  if (S.has) R.push({ anchor: P([S.x1, Y0 + 230, 0]), lines: [['敷地境界', 2.0, 400]] });
  const colR = Math.max(...sc.faces.map(f => f.bb[2])) + 5;
  drawLabels(sh, R, 'right', colR, 18, SH - 40);
  const Lf = [];
  if (M.downpipe) Lf.push({ anchor: P([M.downpipe.x, M.downpipe.y, 4500]), lines: [['縦樋', 2.0, 400], ['屋上の排水を西面で下ろす', 2.0, 400]] });
  if (Al && Y0 - Al.y_near > 1) Lf.push({ anchor: P([X0 - 1800, Y0, 0]), lines: [['後退線', 2.0, 400], [(Al.width < 4000 ? '路地' : '道路') + 'の中心線から ' + fmtmm(Y0 - (Al.y_near + Al.y_far) / 2), 2.0, 400]] });
  const ramp0 = M.ramps[0];
  if (ramp0 && !joinedWalls(m, ramp0.level).some(j => isExt(j.w))) { const p0 = ramp0.path[0]; Lf.push({ anchor: P([+p0[0], +p0[1], FL[ramp0.level] + 600]), lines: [['斜路', 2.0, 400], ['幅 ' + fmtmm(+ramp0.width) + (isFinite(+ramp0.slope) ? '・勾配 1:' + Math.round(1 / +ramp0.slope) : ''), 2.0, 400]] }); }
  if (Lf.length) drawLabels(sh, Lf, 'left', P([lx, yv, 0])[0] - 24, 18, SH - 40);
  if (Al) { const qc = P([xEnd + 300, (Al.y_near + Al.y_far) / 2, 0]); sh.text(qc[0] - 1.2, qc[1] + 0.7, (Al.width < 4000 ? '路地' : '道路') + 'の中心線', 2.0, 400, 'end'); }
  const yb = resBbox(res)[3];
  sh.north(proj, [bl[2] + 34, yb - 14], 9); sh.scalebar(18, yb + 10, 5, 1);
  if (opt.title !== false) {
    const what = M.name ? M.name : (ids.length + ' 階建ての建物');
    const elems = [].concat(M.roofs.length ? ['屋根の板' + (M.roofs.some(r => arr(r.holes).length) ? '（孔つき）' : '')] : [], M.screens.length ? ['ブリーズ・ソレイユ'] : [], M.columns.length ? ['独立柱'] : [], M.ramps.length ? ['斜路'] : []);
    sh.caption(18, yb + 22, '図1', opt.title || (what + 'の外観（' + PR.label + '、1:' + scale + '）'), opt.caption ? [].concat(opt.caption) : [
      '南西の上から見た外観。' + PR.how + (elems.length ? ' ' + elems.join('・') + 'はモデルの要素から描いた。' : ''),
      (accW ? '赤は' + (accW.kind === 'fire' ? '耐火の' : '') + '外壁（accent の壁）。' : '') + (opt.context !== false && (M.neighbors.length || Al) ? '灰の細線は周辺（敷地境界・' + (Al ? '路地・' : '') + (M.neighbors.length ? '隣地' : '') + '）。' : '') + '筆者作成' + (M.name ? '（題材：' + M.name + '）' : '') + '。']);
  }
  return finish(sh, '外観アクソメ', opt, res);
}
function finish(sh, title, opt, res) {
  if (opt && opt.page === false) { const b = resBbox(res).slice(); sh.texts.forEach(t => { b[0] = Math.min(b[0], t[0]); b[1] = Math.min(b[1], t[1]); b[2] = Math.max(b[2], t[2]); b[3] = Math.max(b[3], t[3]); }); return sh.svg(title, { crop: b }); }
  return sh.svg(title);
}

/* ═══════════════════════════════ 図 2　各階の分解（make_axon.fig2） ═══════════════════════════════ */
function layerKeys(M) { return [['基礎', 'found']].concat(M.levelIds.map(id => [id, id]), (M.roofIsLevel && !M.roofs.length) ? [] : [['屋根', 'roof']]); }
function buildLayer(sc, M, key, off) {
  if (key === 'found') return buildFoundationLayer(sc, M, off, 'L_found', false, false);
  if (key === 'roof') return buildRoofLayer(sc, M, off, 'L_roof');
  return buildFloorLayer(sc, M, key, off, 'L_' + key);
}
function layerPoints(M, key, proj) {
  const sc = new Scene(proj); buildLayer(sc, M, key, [0, 0, 0]);
  const allp = [], imp = [], h = M.tw / 2, zs = [];
  for (const s of sc.solids) {
    const pts = []; for (const f of s.faces) for (const q of f.P) { pts.push(proj.p(q)); zs.push(q[2]); }
    allp.push(...pts); const part = String(s.part); let farWall = false;
    if (part.indexOf('ext_') === 0 || part === 'parapet' || part === 'coping') { const xs = [], ys = []; for (const f of s.faces) for (const q of f.P) { xs.push(q[0]); ys.push(q[1]); } if (Math.min(...ys) >= M.Y[M.Y.length - 1] - h - 1 || Math.min(...xs) >= M.X[M.X.length - 1] - h - 1) farWall = true; }
    if (!farWall) imp.push(...pts);
  }
  let impOut = imp;
  if (key === 'found') { const X0 = M.X[0] - h, X1 = M.X[M.X.length - 1] + h, Y0 = M.Y[0] - h, Y1 = M.Y[M.Y.length - 1] + h; impOut = [[X0, Y0, 50], [X1, Y0, 50], [X0, Y1, 50], [X0, Y0, -450]].map(q => proj.p(q)); }
  return { all: allp, imp: impOut, zmin: Math.min(...zs), zmax: Math.max(...zs) };
}
/* 下の層の床・壁（奥の外壁を除く）が上の層に隠れない最小の間隔で積む */
function layerOffsets(M, proj, marginMm) {
  marginMm = marginMm == null ? 4 : marginMm; const LAYERS = layerKeys(M), info = LAYERS.map(([, key]) => layerPoints(M, key, proj)), offs = [0];
  for (let i = 1; i < LAYERS.length; i++) {
    const loImp = info[i - 1].imp.map(([x, y]) => [x, y - offs[i - 1] / proj.scale]), upAll = info[i].all, base = offs[i - 1];
    const loLim = base + info[i - 1].zmax - info[i].zmin + 1000, hiLim = loLim + 40000;
    const hidden = (dz) => { const s = -dz / proj.scale, hull = convexHull(upAll.map(([x, y]) => [x, y + s])); if (hull.length < 3) return false; for (const [x, y] of loImp) if (pointInConvex([x, y - marginMm], hull) || pointInConvex([x, y], hull)) return true; return false; };
    if (!hidden(loLim)) { offs.push(loLim); continue; }
    let a = loLim, b = hiLim; for (let k = 0; k < 40; k++) { const m = 0.5 * (a + b); if (hidden(m)) a = m; else b = m; }
    offs.push(b);
  }
  return { offs, info };
}
function placeRoomNames(sh, sc, res, P, M, offs, size, step) {
  size = size || 2.0; step = step || 100; const idx = new SegIndex(allSegments(res)), out = [], LAYERS = layerKeys(M);
  LAYERS.forEach(([, key], li) => {
    const dz = offs[li]; if (key === 'found' || key === 'roof') return;
    for (const r of (M.rooms[key] || [])) {
      if (!r.hasLabel && !r.label) continue;
      const poly = r.poly, z = M.FL[key] + dz, b = bbox2(poly), cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cy = poly.reduce((s, p) => s + p[1], 0) / poly.length, w = textWidth(r.name, size);
      let best = null;
      for (let y = b[1] + step / 2; y < b[3]; y += step) for (let x = b[0] + step / 2; x < b[2]; x += step) {
        if (!pointInPoly(x, y, poly)) continue; const q = P([x, y, z]), box = [q[0] - w / 2 - 0.5, q[1] - size * 0.5 - 0.5, q[0] + w / 2 + 0.5, q[1] + size * 0.5 + 0.5];
        const pts = [[box[0], box[1]], [box[2], box[1]], [box[0], box[3]], [box[2], box[3]], [q[0], q[1]], [(box[0] + box[2]) / 2, box[1]], [(box[0] + box[2]) / 2, box[3]]];
        if (pts.every(pt => visibleOn(sc, pt, 'floor_' + key)) && !idx.hits(box)) { const d = (x - cx) ** 2 + (y - cy) ** 2; if (!best || d < best[0]) best = [d, q, [x, y]]; }
      }
      if (best) { sh.text(best[1][0], best[1][1] + size * 0.36, r.name, size, 400, 'middle'); out.push({ key, name: r.name, state: true, at: best[2] }); }
      else {
        let anc = null;
        if (!r.small) for (let y = b[1] + step / 2; y < b[3]; y += step) for (let x = b[0] + step / 2; x < b[2]; x += step) { const q = P([x, y, z]); if (pointInPoly(x, y, poly) && visibleOn(sc, q, 'floor_' + key)) { const d = (x - cx) ** 2 + (y - cy) ** 2; if (!anc || d < anc[0]) anc = [d, q, [x, y]]; } }
        out.push({ key, name: r.name, state: anc ? 'leader' : (r.small ? 'omit' : false), at: anc ? anc[2] : null, q: anc ? anc[1] : null });
      }
    }
  });
  return out;
}
function roomSummary(M, key) { return (M.rooms[key] || []).filter(r => r.hasLabel !== false || r.label).map(r => r.name).filter((v, i, a) => a.indexOf(v) === i).slice(0, 4).join('・'); }
function fig2(M, opt) {
  opt = opt || {}; const PR = projOf(opt), scale = opt.scale || 200, proj = new Projection(PR.kind, PR.angle, scale);
  M.center = levelCenter(M);
  const { offs } = layerOffsets(M, proj), sc = new Scene(proj), LAYERS = layerKeys(M);
  LAYERS.forEach(([, key], i) => buildLayer(sc, M, key, [0, 0, offs[i]]));
  const FL = M.FL, fr = floorRect(M, M.levelIds[0]), X0 = fr[0], X1 = fr[2], Y0 = fr[1], Y1 = fr[3], ids = M.levelIds, m = M.raw;
  const roofTop = M.roofs.length ? Math.min(...M.roofs.map(r => +r.fl - (isFinite(+r.thickness) ? +r.thickness : 300))) : FL.RF - M.slab;
  const tops = { found: 50 }, bots = { roof: roofTop }; ids.forEach((id, i) => { tops[id] = FL[id] + M.cut; bots[id] = i === 0 ? FL[id] - 100 : FL[id] - M.slab; });
  for (let i = 1; i < LAYERS.length; i++) { const lk = LAYERS[i - 1][1], uk = LAYERS[i][1]; for (const [cx, cy] of [[X0, Y1], [X1, Y0]]) sc.line([cx, cy, tops[lk] + offs[i - 1]], [cx, cy, bots[uk] + offs[i]], 'guide'); }
  const res = sc.solve(), bb = resBbox(res), SW = 210, SH = 297;
  if ((opt._auto || !opt.scale) && scale < 1000 && ((bb[2] - bb[0]) > SW - 70 || (bb[3] - bb[1]) > SH - 60)) return fig2(M, Object.assign({}, opt, { scale: scale * 2, _auto: true }));
  const sh = new Sheet(SW, SH, scale);
  const dx = (SW - (bb[2] - bb[0])) / 2 - bb[0] - 8, dy = vcenterDy(bb, SH, 3, 10);
  translate(res, proj, dx, dy); shiftScene(sc, dx, dy); sh.addResult(res);
  const P = (p) => proj.p(p);
  const labels = [];
  LAYERS.forEach(([name, key], i) => {
    const dz = offs[i]; let a, lines;
    if (key === 'found') { a = P([X1 - 300, Y0, -300 + dz]); lines = [['基礎', 2.5, 700], ['べた基礎（底盤 200）', 2.0, 400], ['立上りは ' + ids[0] + ' に含める', 2.0, 400]]; }
    else if (key === 'roof') {
      if (M.roofs.length) { const r0 = M.roofs[0], rb = bbox2(r0.polygon.map(p => [+p[0], +p[1]])), T = isFinite(+r0.thickness) ? +r0.thickness : 300; a = P([rb[2] - 300, rb[1] + 300, +r0.fl + dz]); lines = [[r0.name || '屋根の板', 2.5, 700], ['版 ' + fmtmm(T) + (arr(r0.holes).length ? '・孔 ' + arr(r0.holes).length + ' か所' : '') + (r0.shell && r0.shell.kind === 'curved' ? '・曲面（折れ線の近似）' : ''), 2.0, 400], ['上端 GL+' + fmtmm(+r0.fl) + (M.roofs.length > 1 ? '　ほか ' + (M.roofs.length - 1) + ' 枚' : ''), 2.0, 400]]; }
      else { a = P([X1 - 300, Y0, FL.RF + 300 + dz]); lines = [['屋根', 2.5, 700], ['陸屋根・パラペット ' + fmtmm(M.parapet), 2.0, 400], ['RFL GL+' + fmtmm(FL.RF), 2.0, 400]]; }
    }
    else { const sum = roomSummary(M, key), el = []; if (M.columns.some(c => c.level === key)) el.push('柱 ' + M.columns.filter(c => c.level === key).length); if (M.voids.some(v => v.level === key)) el.push('吹抜'); if (M.ramps.some(r => r.level === key)) el.push('斜路'); if (M.screens.some(s => s.level === key)) el.push('ブリーズ・ソレイユ'); a = P([X1 - 220, Y0, FL[key] + 600 + dz]); lines = [[key, 2.5, 700], [sum || (el.length ? el.join('・') : '—'), 2.0, 400], [key + 'L GL+' + fmtmm(FL[key]) + '　階高 ' + fmtmm(M.story[key]), 2.0, 400]]; if (sum && el.length) lines.push([el.join('・'), 2.0, 400]); }
    labels.push({ anchor: a, lines });
  });
  const st1 = M.stairs.find(s => s.fl === ids[0]) || M.stairs[0];
  if (st1) {
    const steps = stairSteps(st1, FL), li = LAYERS.findIndex(L => L[1] === st1.fl), xm = (st1.x0 + st1.x1) / 2;
    const cands = [4, 3, 5, 2].filter(k => steps[k]).map(k => [xm + 150, (steps[k].ya != null ? steps[k].ya : steps[k].x0) + 110, steps[k].zt + offs[li]]);
    if (cands.length && li >= 0) labels.push({ anchor: resolve(sc, P, cands, 'stair'), lines: [['階段', 2.0, 400], ['幅 ' + fmtmm(st1.x1 - st1.x0) + '・蹴上 ' + fmtmm(st1.rise) + '・踏面 ' + fmtmm(st1.tread), 2.0, 400]] });
    const w2 = stairWell(M, st1), li2 = LAYERS.findIndex(L => L[1] === st1.to);
    if (li2 >= 0) labels.push({ anchor: resolve(sc, P, [90, 150, 250, 400].map(d => [w2[1] - d, w2[3], FL[st1.to] - 120 + offs[li2]]), 'floor_' + st1.to), lines: [['床の穴（下の階段の上）', 2.0, 400], ['頭上 2,000 以上を確保', 2.0, 400]] });
  }
  const v1 = M.voids.find(v => ids.indexOf(v.level) >= 0);
  if (v1) { const li = LAYERS.findIndex(L => L[1] === v1.level), vb = bbox2(v1.polygon.map(p => [+p[0], +p[1]])); if (li >= 0) labels.push({ anchor: P([vb[2] - 200, vb[1] + (vb[3] - vb[1]) * 0.4, FL[v1.level] - 60 + offs[li]]), lines: [['吹抜（床の孔）' + (M.voids.length > 1 ? ' ' + M.voids.length + ' か所' : ''), 2.0, 400], [fmtmm(vb[2] - vb[0]) + '×' + fmtmm(vb[3] - vb[1]) + (isAxisRect(v1.polygon) ? '' : '（曲線は折れ線）'), 2.0, 400]] }); }
  const r1 = M.ramps[0];
  if (r1) { const li = LAYERS.findIndex(L => L[1] === r1.level); if (li >= 0) { const p0 = r1.path[0], p1 = r1.path[1], pm = [(+p0[0] + +p1[0]) / 2, (+p0[1] + +p1[1]) / 2]; labels.push({ anchor: P([pm[0], pm[1], FL[r1.level] + Math.min(M.cut, (FL[r1.to] - FL[r1.level]) / 2) + offs[li]]), lines: [['斜路 ' + r1.level + '→' + r1.to, 2.0, 400], ['幅 ' + fmtmm(+r1.width) + (isFinite(+r1.slope) && +r1.slope > 0 ? '・勾配 1:' + Math.round(1 / +r1.slope) : ''), 2.0, 400]] }); } }
  if (M.roof_open) { const [sx0, sy0, sx1, sy1] = M.roof_open.rect; labels.push({ anchor: resolve(sc, P, [0, 400, -400].map(d => [(sx0 + sx1) / 2, (sy0 + sy1) / 2 + d, FL.RF + 230 + offs[offs.length - 1]]), 'skylight'), lines: [['天窓', 2.0, 400]] }); }
  drawLabels(sh, labels, 'right', bb[2] + dx + 8, 12, SH - 40, 2.4);
  const rooms = placeRoomNames(sh, sc, res, P, M, offs), L2 = [];
  for (const r of rooms) if (r.state === 'leader') L2.push({ anchor: r.q, lines: [[r.name, 2.0, 400]] });
  L2.push({ anchor: P([X0 + 75, Y0 + (Y1 - Y0) * 0.37, FL[ids[0]] + M.cut + offs[1]]), lines: [['切断の高さ FL+' + fmtmm(M.cut), 2.0, 400], ['黒は切った壁' + (M.columns.length ? 'と柱' : ''), 2.0, 400], ['外壁 ' + fmtmm(M.tw) + '・間仕切り ' + fmtmm(M.tp), 2.0, 400]] });
  const sc1 = M.screens[0];
  if (sc1) { const li = LAYERS.findIndex(L => L[1] === sc1.level); if (li >= 0) { const a = [+sc1.a[0], +sc1.a[1]], bq = [+sc1.b[0], +sc1.b[1]], horiz = Math.abs(bq[1] - a[1]) < Math.abs(bq[0] - a[0]); L2.push({ anchor: P(horiz ? [Math.min(a[0], bq[0]) + 600, Math.min(a[1], bq[1]) - +sc1.depth, FL[sc1.level] + Math.min(M.cut, +sc1.height) * 0.6 + offs[li]] : [Math.min(a[0], bq[0]) - +sc1.depth, Math.min(a[1], bq[1]) + 600, FL[sc1.level] + Math.min(M.cut, +sc1.height) * 0.6 + offs[li]]), lines: [['ブリーズ・ソレイユ', 2.0, 400], ['奥行 ' + fmtmm(+sc1.depth) + '・羽根 @' + fmtmm(+sc1.pitch || 1000), 2.0, 400]] }); } }
  drawLabels(sh, L2, 'left', bb[0] + dx - 6, 12, SH - 40, 2.4);
  const yb = resBbox(res)[3];
  sh.north(proj, [SW - 26, yb + 6], 8); sh.scalebar(14, yb + 8, scale >= 400 ? 20 : 10, scale >= 400 ? 2 : 1, scale >= 400 ? 10 : 5);
  if (opt.title !== false) {
    const acc = M.accentWalls.filter(isExt)[0], el = [].concat(M.columns.length ? ['柱'] : [], M.voids.length ? ['吹抜'] : [], M.ramps.length ? ['斜路'] : [], M.screens.length ? ['ブリーズ・ソレイユ'] : [], M.roofs.length ? ['屋根の板' + (M.roofs.some(r => arr(r.holes).length) ? 'と孔' : '')] : []);
    sh.caption(14, yb + 19, '図2', opt.title || ('各階の分解アクソメ（' + PR.label + '、1:' + scale + '）'), opt.caption ? [].concat(opt.caption) : [
      '基礎・' + ids.join('・') + (LAYERS.some(L => L[1] === 'roof') ? '・屋根' : '') + 'を上下に離して積んだ。各階は FL+' + fmtmm(M.cut) + ' で水平に切り、黒は切った壁' + (M.columns.length ? 'と柱' : '') + '、白は床と家具（細線）。',
      '破線は層の隅をそろえる案内線' + (M.stairs.length ? '、階段の細い矢印は上る向き' : '') + '。' + (acc ? '赤は' + (acc.kind === 'fire' ? '耐火の' : '') + '外壁（accent の壁）。' : '') + (el.length ? el.join('・') + 'はモデルの要素から描いた。' : ''),
      '層の間隔は、下の層の床と間仕切りが上の層に隠れない最小の値とした（基礎は手前の縁だけを見せる）。' + sourceOf(M) + '。']);
  }
  return finish(sh, '各階の分解アクソメ', opt, res);
}

/* ═══════════════════════════════ 図 3　構造と外皮の分解（make_axon.fig3） ═══════════════════════════════ */
function fig3(M, opt) {
  opt = opt || {}; const PR = projOf(opt), scale = opt.scale || 100, D = opt.D || 2700, DS = opt.DS || 4500, D2 = opt.D2 || 2700, D3 = opt.D3 || 3000;
  const proj = new Projection(PR.kind, PR.angle, scale), sc = new Scene(proj), b = new Builder(sc, M), FL = M.FL, ids = M.levelIds, last = ids[ids.length - 1], m = M.raw;
  M.center = levelCenter(M);
  const fr = floorRect(M, ids[0]), X0 = fr[0], X1 = fr[2], Y0 = fr[1], Y1 = fr[3], tw = M.tw, h = tw / 2, rcLike = M.rc || M.columns.length > 0;
  buildFoundationLayer(sc, M, [0, 0, 0], 'found', true, !rcLike);
  if (rcLike) {
    // RC：独立柱（全階）・床版（吹抜を抜く）・斜路・階段を元の位置に
    M.columns.forEach(c => { const z = columnZ(M, c); if (z) solidPoly(b, columnPoly(c), z[0], z[1], 'frame', 'fr_柱_' + c.id, { cap: 'mid' }); });
    ids.forEach((id, i) => { if (i === 0) return; floorSolid(b, M, id, FL[id] - M.slab, FL[id], 'deck', 'deck_' + id, null, { inset: tw }); });
    if (!M.roofIsLevel && !M.roofs.length) floorSolid(b, M, last, FL.RF - M.slab, FL.RF, 'deck', 'deck_RF', null, { inset: tw });
    M.ramps.forEach(r => rampSolids(b, M, r, 'deck', { part: 'ramp' }));
  } else {
    for (const [x0, x1, y0, y1, z0, z1, name] of frameMembers(M)) sc.box(x0, x1, y0, y1, z0, z1, 'frame', { part: 'fr_' + name + '_' + Math.round(x0) + '_' + Math.round(y0) + '_' + Math.round(z0), cap: 'mid', name });
    for (const [x0, x1, y0, y1, z0, z1, L] of deckBoxes(M)) sc.box(x0, x1, y0, y1, z0, z1, 'deck', { part: 'deck_' + L, cap: 'mid', name: 'deck' });
  }
  for (const st of M.stairs) b.stair(st, 'deck', { part: 'stair' });
  // 外皮：外壁を側ごとに引き離す（南はさらに遠く）。窓は南だけ外壁からさらに D2
  const offs = { S: [0, -DS, 0], N: [0, D, 0], W: [-D, 0, 0], E: [D, 0, 0] };
  buildLevelsGeneric(b, M, { exterior: true, screens: false, offFn: (w, side) => offs[side], groupFn: (w, side) => 'wall' + side, winOffFn: (w, side) => side === 'S' ? [0, -DS - D2, 0] : offs[side] });
  if (!M.roofs.length && !M.roofIsLevel) copingGeneric(b, M, 'wallS', null);
  M.screens.forEach(s => { const a = [+s.a[0], +s.a[1]], q = [+s.b[0], +s.b[1]], mid = [(a[0] + q[0]) / 2, (a[1] + q[1]) / 2], side = Math.abs(mid[0] - M.center[0]) / (X1 - X0) > Math.abs(mid[1] - M.center[1]) / (Y1 - Y0) ? (mid[0] > M.center[0] ? 'E' : 'W') : (mid[1] > M.center[1] ? 'N' : 'S'); screenSolids(b, M, s, 'wall' + side, { off: side === 'S' ? [0, -DS - D2, 0] : offs[side], part: 'screen' }); });
  // 屋根：roofs の板（孔つき）か、防水層と天窓を D3 持ち上げる
  const roff = [0, 0, D3], hc = 60;
  if (M.roofs.length) roofSolids(b, M, 'roof', roff, {});
  else if (!M.roofIsLevel) { const ring = M.roof_open ? [[M.roof_open.rect[0] - 100, Math.min(M.roof_open.rect[2] + 100, X1 - hc), M.roof_open.rect[1] - 100, M.roof_open.rect[3] + 100]] : []; for (const [a, c, ya, yc] of plateMinus(X0 + hc, X1 - hc, Y0 + hc, Y1 - hc, ring)) b.box(a, c, ya, yc, FL.RF, FL.RF + 40, 'roof', 'membrane', { off: roff }); skylight(b, M, 'roof', roff); }
  // 案内線（破線）：外壁の隅と窓の角、屋根の隅
  const G = [], zt2 = M.top, ft = Math.min(M.found_top, FL[ids[0]]), zTopWall = M.roofIsLevel ? FL[last] : (M.roofs.length ? FL.RF : zt2);
  for (const [x, z] of [[X0, zTopWall], [X1, zTopWall], [X1, ft]]) G.push([[x, Y0 - DS, z], [x, Y0, z]]);
  for (const [y, z] of [[Y1, zTopWall], [Y0, ft]]) G.push([[X0 - D, y, z], [X0, y, z]]);
  for (const [x, z] of [[X0, zTopWall], [X1, ft]]) G.push([[x, Y1, z], [x, Y1 + D, z]]);
  for (const [y, z] of [[Y0, zTopWall], [Y1, ft]]) G.push([[X1, y, z], [X1 + D, y, z]]);
  for (const o of M.openings) if (o.wall === 'S') for (const [x, z] of [[o.a0, o.z1], [o.a1, o.z0]]) G.push([[x, Y0 + 30 - DS - D2, z], [x, Y0 - DS, z]]);
  if (M.roofs.length) { const rb = bbox2([].concat(...M.roofs.map(r => r.polygon.map(p => [+p[0], +p[1]])))), zr = Math.min(...M.roofs.map(r => +r.fl - (isFinite(+r.thickness) ? +r.thickness : 300))); for (const [x, y] of [[rb[0], rb[3]], [rb[2], rb[1]]]) G.push([[x, y, zr + D3], [x, y, zr]]); }
  else if (!M.roofIsLevel) for (const [x, y] of [[X0 + hc, Y1 - hc], [X1 - hc, Y0 + hc]]) G.push([[x, y, FL.RF + D3], [x, y, FL.RF + 40]]);
  for (const [Aq, Bq] of G) sc.line(Aq, Bq, 'guide');
  const res = sc.solve(), bb = resBbox(res), SW = 297, SH = 420;
  if ((opt._auto || !opt.scale) && scale < 1000 && ((bb[2] - bb[0]) > SW - 80 || (bb[3] - bb[1]) > SH - 70)) return fig3(M, Object.assign({}, opt, { scale: scale * 2, _auto: true }));
  const sh = new Sheet(SW, SH, scale);
  const dx = (SW - (bb[2] - bb[0])) / 2 - bb[0], dy = vcenterDy(bb, SH, 3);
  translate(res, proj, dx, dy); shiftScene(sc, dx, dy); sh.addResult(res);
  const P = (p) => proj.p(p), mD = (v) => (v / 1000).toFixed(1) + ' m', Al = M.alley;
  const acc = M.accentWalls.filter(isExt)[0], accSide = acc ? sideOfWall(M, acc) : null, fireTxt = (side) => (acc && accSide === side && acc.kind === 'fire') ? '耐火の外壁 ' : '厚 ';
  const hasOps = (side) => M.openings.some(o => o.wall === side), opsTxt = (side) => hasOps(side) ? '窓あり' : '開口なし';
  const R = [];
  R.push({ anchor: P([X1 + D, Y0 + (Y1 - Y0) * 0.78, FL[last] - 500]), lines: [['外壁（東）', 2.5, 700], [opsTxt('E'), 2.0, 400]] });
  if (M.roofs.length) { const r0 = M.roofs[0], rb = bbox2(r0.polygon.map(p => [+p[0], +p[1]])); R.push({ anchor: P([rb[2] - 400, rb[1] + (rb[3] - rb[1]) * 0.3, +r0.fl + D3]), lines: [[r0.name || '屋根の板', 2.5, 700], ['版 ' + fmtmm(isFinite(+r0.thickness) ? +r0.thickness : 300) + (arr(r0.holes).length ? '・孔 ' + arr(r0.holes).length + ' か所' : '') + (arr(r0.supports).length ? '・柱 ' + arr(r0.supports).length + ' 本で受ける' : ''), 2.0, 400], [mD(D3) + ' 持ち上げた', 2.0, 400]] }); }
  else if (!M.roofIsLevel) R.push({ anchor: P([X1 - 400, Y0 + 2600, FL.RF + 40 + D3]), lines: [['屋根', 2.5, 700], ['防水層' + (M.roof_open ? '・天窓' : ''), 2.0, 400], [mD(D3) + ' 持ち上げた', 2.0, 400]] });
  R.push({ anchor: P([X1 - 500, Y0 - DS, FL[last] + Math.min(2350, M.story[last] * 0.8)]), lines: [['外壁（南' + (Al && Al.side === 'S' ? (Al.width < 4000 ? '・路地側' : '・道路側') : '') + '）', 2.5, 700], [fireTxt('S') + fmtmm(tw) + (m.materials && m.materials.exterior ? '・' + m.materials.exterior : ''), 2.0, 400], [mD(DS) + ' 引き離した', 2.0, 400]] });
  const oS = M.openings.filter(o => o.wall === 'S').sort((a, b2) => a.z0 - b2.z0)[1] || M.openings.find(o => o.wall === 'S');
  if (oS) R.push({ anchor: P([(oS.a0 + oS.a1) / 2 + 700, Y0 + 65 - DS - D2, oS.z0 + Math.min(1600, (oS.z1 - oS.z0) * 0.7)]), lines: [['開口', 2.5, 700], [(oS.fire ? '防火設備の窓' : '南面の建具') + (M.screens.length ? '・ブリーズ・ソレイユ' : ''), 2.0, 400], ['外壁からさらに ' + mD(D2), 2.0, 400]] });
  drawLabels(sh, R, 'right', bb[2] + dx + 6, 16, SH - 40, 3.0);
  const Lf = [];
  Lf.push({ anchor: P([X0 + 1200, Y1 + D, FL[last] - 300]), lines: [['外壁（北）', 2.5, 700], [hasOps('N') ? '窓は外壁に入れたまま' : '開口なし', 2.0, 400]] });
  if (rcLike) {
    Lf.push({ anchor: P([X0 + tw + 1500, Y1 - tw - 900, FL[ids[Math.min(1, ids.length - 1)]]]), lines: [['床版', 2.5, 700], ['RC t' + fmtmm(M.slab) + (M.voids.length ? '・吹抜 ' + M.voids.length + ' か所' : ''), 2.0, 400], [ids.slice(1).join('・'), 2.0, 400]] });
    const c0 = M.columns.slice().sort((p, q) => (p.at[0] + p.at[1]) - (q.at[0] + q.at[1]))[0];
    if (c0) { const cz = columnZ(M, c0); if (cz) Lf.push({ anchor: P([c0.at[0] - (+c0.w || 400) / 2, c0.at[1], (cz[0] + cz[1]) / 2]), lines: [['柱', 2.5, 700], [(c0.shape === 'round' ? 'φ' : '') + fmtmm(+c0.w || 400) + (c0.shape === 'round' ? '' : '×' + fmtmm(+c0.d || +c0.w || 400)) + '・' + M.columns.length + ' 本（全階）', 2.0, 400], [M.raw.structure ? String(M.raw.structure).slice(0, 24) : 'RC ラーメン', 2.0, 400]] }); }
    if (M.ramps.length) { const r1 = M.ramps[0], p0 = r1.path[0]; Lf.push({ anchor: P([+p0[0], +p0[1], FL[r1.level] + 400]), lines: [['斜路', 2.5, 700], ['幅 ' + fmtmm(+r1.width) + ' ' + r1.level + '→' + r1.to, 2.0, 400]] }); }
  } else {
    Lf.push({ anchor: P([X0 + 1500, Y1 - 900, FL.RF]), lines: [['床', 2.5, 700], ['構造用合板 t28＋仕上げ', 2.0, 400], [ids.slice(1).join('・') + '・屋上', 2.0, 400]] });
    const frCands = []; for (const z of [FL.RF - 650, FL.RF - 1250, FL.RF - 1850]) for (const y of [Y1 - 1800, Y1 - 2700, Y1 - 900]) frCands.push([X0 + h - 60, y, z]);
    Lf.push({ anchor: resolve(sc, P, frCands, 'fr_'), lines: [['軸組', 2.5, 700], ['柱 120 角・900 ごと', 2.0, 400], ['梁 120×300〜450', 2.0, 400]] });
  }
  Lf.push({ anchor: P([X0 - D, Y0 + 3000, FL[last]]), lines: [['外壁（西）', 2.5, 700], [opsTxt('W'), 2.0, 400]] });
  Lf.push({ anchor: P([X0 + 600, Y0, -250]), lines: [['基礎', 2.5, 700], ['べた基礎・立上り ' + fmtmm(Math.max(0, Math.min(M.found_top, FL[ids[0]]) - 50)), 2.0, 400]].concat(rcLike ? [] : [['土間コンクリート', 2.0, 400]]) });
  drawLabels(sh, Lf, 'left', bb[0] + dx - 6, 16, SH - 40, 3.0);
  const yb = resBbox(res)[3];
  sh.north(proj, [bb[2] + dx + 30, yb - 12], 9); sh.scalebar(18, yb + 10, scale >= 200 ? 10 : 5, scale >= 200 ? 2 : 1);
  if (opt.title !== false) sh.caption(18, yb + 22, '図3', opt.title || ('構造と外皮の分解アクソメ（' + PR.label + '、1:' + scale + '）'), opt.caption ? [].concat(opt.caption) : [
    '中央に基礎・' + (rcLike ? '柱・床版' : '軸組・床') + '（構造）を元の位置のまま置き、外壁を東西北へ ' + mD(D) + '・南へ ' + mD(DS) + '、南の建具' + (M.screens.length ? 'とブリーズ・ソレイユ' : '') + 'を外壁からさらに ' + mD(D2) + '、',
    '屋根' + (M.roofs.length ? 'の板' : 'の防水層') + 'を ' + mD(D3) + ' 引き離した。破線は元の位置への案内線。' + (rcLike ? '梁・配筋は省いた。' : '間柱・筋かい・断熱は省いた。') + (acc ? '赤は' + (acc.kind === 'fire' ? '耐火の' : '') + '外壁（accent の壁）。' : ''), sourceOf(M) + '。']);
  return finish(sh, '構造と外皮の分解アクソメ', opt, res);
}

/* ═══════════════════════════════ 階層の図（tools/archdraw/layers） ═══════════════════════════════
   archlib.py の SVG の部品（LSvg）と、model.py の判断（床の層・基礎・軸組・延焼ライン・立て管）を M から導く LM。 */
const W_GROUND = 0.70, W_CUT = 0.50, W_MID = 0.35, W_SEEN = 0.25, W_FAR = 0.18, W_FINE = 0.13;
/* ISO 128-20 の線種（破線 12d・3d、一点鎖線 24d・3d・0.5d。すき間 0.6・長い線分 4 を下限） */
function dasharray(kind, w) {
  if (!kind || kind === 'solid') return null;
  if (kind === 'hidden') return [Math.max(12 * w, 1.6), Math.max(3 * w, 0.6)];
  if (kind === 'chain') return [Math.max(24 * w, 4.0), Math.max(3 * w, 0.6), Math.max(0.5 * w, 0.25), Math.max(3 * w, 0.6)];
  if (kind === 'phantom') { const g = Math.max(3 * w, 0.6), d = Math.max(0.5 * w, 0.25); return [Math.max(24 * w, 4.0), g, d, g, d, g]; }
  return null;
}
const tw56 = (s, size) => textWidth(s, size, 0.56);
class LSvg {
  constructor(w, h, title, desc) { this.w = w; this.h = h; this.title = title; this.desc = desc || ''; this.body = []; this.defs = []; this.texts = []; this._id = 0; this.prefix = 'ly' + (++SOLID_SEQ) + '_'; this.bb = [1e18, 1e18, -1e18, -1e18]; }
  ext(pts) { for (const p of pts) { if (p[0] < this.bb[0]) this.bb[0] = p[0]; if (p[1] < this.bb[1]) this.bb[1] = p[1]; if (p[0] > this.bb[2]) this.bb[2] = p[0]; if (p[1] > this.bb[3]) this.bb[3] = p[1]; } }
  _st(w, color, kind, cap, join) { let a = 'stroke="' + color + '" stroke-width="' + fmt(w) + '"'; if (cap && cap !== 'butt') a += ' stroke-linecap="' + cap + '"'; if (join && join !== 'miter') a += ' stroke-linejoin="' + join + '"'; const da = dasharray(kind, w); if (da) a += ' stroke-dasharray="' + da.map(fmt).join(' ') + '"'; return a; }
  raw(s) { this.body.push(s); }
  open(cls) { this.body.push('<g class="' + cls + '">'); } close() { this.body.push('</g>'); }
  line(x1, y1, x2, y2, o) { o = o || {}; this.ext([[x1, y1], [x2, y2]]); this.body.push('<line x1="' + fmt(x1) + '" y1="' + fmt(y1) + '" x2="' + fmt(x2) + '" y2="' + fmt(y2) + '" fill="none" ' + this._st(o.w == null ? W_FINE : o.w, o.color || INK, o.kind, o.cap) + '/>'); }
  poly(pts, o) {
    o = o || {}; if (pts.length < 2) return; this.ext(pts); const w = o.w == null ? W_FINE : o.w, closed = o.closed !== false;
    this.body.push('<' + (closed ? 'polygon' : 'polyline') + ' points="' + pts.map(p => fmt(p[0]) + ',' + fmt(p[1])).join(' ') + '" fill="' + (o.fill || 'none') + '"' + (o.fillRule ? ' fill-rule="' + o.fillRule + '"' : '') + ' ' + (w ? this._st(w, o.color || INK, o.kind, o.cap, o.join) : 'stroke="none"') + '/>');
  }
  rect(x0, y0, x1, y1, o) { this.poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], o); }
  path(d, o) { o = o || {}; const w = o.w == null ? W_FINE : o.w; this.body.push('<path d="' + d + '" fill="' + (o.fill || 'none') + '"' + (o.fillRule ? ' fill-rule="' + o.fillRule + '"' : '') + ' ' + (w ? this._st(w, o.color || INK, o.kind) : 'stroke="none"') + '/>'); }
  circle(cx, cy, r, o) { o = o || {}; this.ext([[cx - r, cy - r], [cx + r, cy + r]]); const w = o.w == null ? W_FINE : o.w; this.body.push('<circle cx="' + fmt(cx) + '" cy="' + fmt(cy) + '" r="' + fmt(r) + '" fill="' + (o.fill || 'none') + '" ' + (w ? this._st(w, o.color || INK, o.kind) : 'stroke="none"') + '/>'); }
  /* 中心 (cx,cy)、紙の座標の角度 a0→a1（度、反時計回り＝y 上向きの数学の向き） */
  arc(cx, cy, r, a0, a1, o) {
    const R = Math.PI / 180, p0 = [cx + r * Math.cos(a0 * R), cy - r * Math.sin(a0 * R)], p1 = [cx + r * Math.cos(a1 * R), cy - r * Math.sin(a1 * R)], large = Math.abs(a1 - a0) > 180 ? 1 : 0, sweep = a1 > a0 ? 0 : 1;
    this.path('M' + fmt(p0[0]) + ',' + fmt(p0[1]) + ' A' + fmt(r) + ',' + fmt(r) + ' 0 ' + large + ' ' + sweep + ' ' + fmt(p1[0]) + ',' + fmt(p1[1]), o);
  }
  /* y は文字の基線。halo は白い縁取り（線の上の文字） */
  text(x, y, s, o) {
    o = o || {}; const size = o.size || T_NOTE, anchor = o.anchor || 'start', wdt = tw56(s, size), x0 = x - (anchor === 'middle' ? wdt / 2 : anchor === 'end' ? wdt : 0);
    this.body.push('<text' + (o.cls ? ' class="' + o.cls + '"' : '') + ' x="' + fmt(x) + '" y="' + fmt(y) + '" font-size="' + fmt(size) + '"' + (o.weight && o.weight !== 400 ? ' font-weight="' + o.weight + '"' : '') + (anchor !== 'start' ? ' text-anchor="' + anchor + '"' : '') + ' fill="' + (o.color || INK) + '"' + (o.halo ? ' stroke="' + WHITE + '" stroke-width="0.7" stroke-linejoin="round" paint-order="stroke"' : '') + (o.rot ? ' transform="rotate(' + o.rot + ' ' + fmt(x) + ' ' + fmt(y) + ')"' : '') + '>' + esc(s) + '</text>');
    const bb = [x0, y - size * 0.88, x0 + wdt, y + size * 0.12, s]; this.texts.push(bb); this.ext([[bb[0], bb[1]], [bb[2], bb[3]]]); return bb;
  }
  clipBegin(pts, d) { const cid = this.prefix + 'c' + (++this._id); if (d == null) d = 'M' + pts.map(p => fmt(p[0]) + ',' + fmt(p[1])).join(' L') + ' Z'; this.defs.push('<clipPath id="' + cid + '"><path d="' + d + '" clip-rule="evenodd"/></clipPath>'); this.body.push('<g clip-path="url(#' + cid + ')">'); return cid; }
  clipEnd() { this.body.push('</g>'); }
  /* 多角形 pts（または path d と bbox）の中に平行線を引く */
  hatch(pts, o) {
    o = o || {}; const angle = o.angle == null ? 45 : o.angle, spacing = o.spacing || 0.8, w = o.w == null ? W_FINE : o.w, color = o.color || INK;
    const bb = o.bbox || bbox2(pts), cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2, R = Math.hypot(bb[2] - bb[0], bb[3] - bb[1]) / 2 + spacing, a = angle * Math.PI / 180, ux = Math.cos(a), uy = -Math.sin(a), nx = -uy, ny = ux;
    this.clipBegin(pts, o.d); const n = Math.floor(R / spacing) + 1, segs = [];
    for (let i = -n; i <= n; i++) { const ox = cx + nx * i * spacing, oy = cy + ny * i * spacing; segs.push('M' + fmt(ox - ux * R) + ',' + fmt(oy - uy * R) + ' L' + fmt(ox + ux * R) + ',' + fmt(oy + uy * R)); }
    this.body.push('<path d="' + segs.join(' ') + '" fill="none" ' + this._st(w, color, null) + '/>'); this.clipEnd();
  }
  svg(opt) {
    opt = opt || {}; let X = 0, Y = 0, W = this.w, H = this.h;
    if (opt.crop === true) opt.crop = this.bb;
    if (opt.crop) { const b = opt.crop, m = opt.cropMargin == null ? 6 : opt.cropMargin; X = b[0] - m; Y = b[1] - m; W = b[2] - b[0] + 2 * m; H = b[3] - b[1] + 2 * m; }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + fmt(W) + 'mm" height="' + fmt(H) + 'mm" viewBox="' + fmt(X) + ' ' + fmt(Y) + ' ' + fmt(W) + ' ' + fmt(H) + '" font-family="' + FONT.replace(/"/g, '') + '">\n<title>' + esc(this.title) + '</title>\n<desc>' + esc(this.desc) + '</desc>\n' + (this.defs.length ? '<defs>' + this.defs.join('') + '</defs>\n' : '') + '<rect x="' + fmt(X) + '" y="' + fmt(Y) + '" width="' + fmt(W) + '" height="' + fmt(H) + '" fill="' + WHITE + '"/>\n' + this.body.join('\n') + '\n</svg>\n';
  }
}
/* 寸法線 p0→p1（紙の座標）。端末は 45° の斜線。ext0/ext1 は寸法補助線の起点。textSide=1 は線の「上（左）」 */
function ldim(svg, p0, p1, o) {
  o = o || {}; const [x0, y0] = p0, [x1, y1] = p1, L = Math.hypot(x1 - x0, y1 - y0); if (L === 0) return;
  const ux = (x1 - x0) / L, uy = (y1 - y0) / L; let nx = uy, ny = -ux; if (ny > 0 || (Math.abs(ny) < 1e-9 && nx > 0)) { nx = -nx; ny = -ny; }
  const w = o.w == null ? W_FINE : o.w, color = o.color || INK, tick = o.tick || 1.1, size = o.size || T_NOTE, ts = o.textSide == null ? 1 : o.textSide, off = o.offsetText == null ? 0.7 : o.offsetText;
  svg.open('ad-dim');
  svg.line(x0 - ux * 0.8, y0 - uy * 0.8, x1 + ux * 0.8, y1 + uy * 0.8, { w, color });
  for (const [px, py] of [p0, p1]) { const tx = (ux + nx) / Math.SQRT2 * tick / 2, ty = (uy + ny) / Math.SQRT2 * tick / 2; svg.line(px - tx, py - ty, px + tx, py + ty, { w: W_SEEN, color }); }
  [[o.ext0, p0], [o.ext1, p1]].forEach(([e, p]) => { if (!e) return; const dx = p[0] - e[0], dy = p[1] - e[1], d = Math.hypot(dx, dy); if (d > 0.01) { const gx = dx / d, gy = dy / d; svg.line(e[0] + gx * 0.8, e[1] + gy * 0.8, p[0] + gx * 1.0, p[1] + gy * 1.0, { w, color }); } });
  svg.close();
  if (o.text != null) {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    if (Math.abs(uy) < 1e-6) svg.text(mx, ts > 0 ? my - off : my + size + off - 0.3, o.text, { size, anchor: 'middle', color });
    else svg.text(mx - off - 0.2, my, o.text, { size, anchor: 'middle', color, rot: -90 });
  }
}
/* 連続寸法。axis='x' なら pts は x の列で y=at に水平に並べる。extFrom は寸法補助線の起点（各点の値か 1 つの値） */
function ldimChain(svg, pts, axis, at, o) {
  o = o || {}; const ev = (j) => o.extFrom == null ? null : Array.isArray(o.extFrom) ? o.extFrom[j] : o.extFrom;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], lab = o.labels ? o.labels[i] : null; let p0, p1, e0 = null, e1 = null;
    if (axis === 'x') { p0 = [a, at]; p1 = [b, at]; if (ev(i) != null) e0 = [a, ev(i)]; if (ev(i + 1) != null) e1 = [b, ev(i + 1)]; }
    else { p0 = [at, a]; p1 = [at, b]; if (ev(i) != null) e0 = [ev(i), a]; if (ev(i + 1) != null) e1 = [ev(i + 1), b]; }
    ldim(svg, p0, p1, { text: lab, ext0: e0, ext1: e1, w: o.w, size: o.size, textSide: o.textSide });
  }
}
/* 引出線。anchor に黒丸、elbow で折れて水平の肩 2mm、その先に文字。sub は 2 行目以降 */
function lleader(svg, anchor, elbow, text, o) {
  o = o || {}; const side = o.side || 'right', color = o.color || INK, lc = o.lineColor || color, size = o.size || T_NOTE, [ax, ay] = anchor, [ex, ey] = elbow, sx = ex + (side === 'right' ? 2.0 : -2.0);
  svg.open('ad-layer-label');
  svg.poly([[ax, ay], [ex, ey], [sx, ey]], { w: W_FINE, color: lc, closed: false });
  if (o.dot !== false) svg.circle(ax, ay, 0.32, { w: 0, fill: lc });
  const tx = sx + (side === 'right' ? 1.0 : -1.0), an = side === 'right' ? 'start' : 'end';
  svg.text(tx, ey + size * 0.35, text, { size, anchor: an, color, weight: o.weight, halo: o.halo });
  const subs = typeof o.sub === 'string' ? [o.sub] : (o.sub || []);
  subs.forEach((t, i) => svg.text(tx, ey + size * 0.35 + size * 1.3 * (i + 1), t, { size, anchor: an, color, halo: o.halo }));
  svg.close();
}
function lgridBubble(svg, cx, cy, label, r) { svg.open('ad-grid'); svg.circle(cx, cy, r || 2.4, { w: W_FINE, fill: WHITE }); svg.close(); svg.text(cx, cy + T_NOTE * 0.36, label, { anchor: 'middle', cls: 'ad-grid-label' }); }
/* 方位記号：細い縦線と片側だけ塗った矢じり、上に N */
function lnorth(svg, x, y, length) {
  length = length || 11; svg.open('ad-north'); svg.line(x, y + length / 2, x, y - length / 2, { w: W_SEEN }); const tip = [x, y - length / 2];
  svg.poly([tip, [x - 1.5, y - length / 2 + 4.0], [x, y - length / 2 + 3.0]], { w: W_SEEN, fill: INK }); svg.poly([tip, [x + 1.5, y - length / 2 + 4.0], [x, y - length / 2 + 3.0]], { w: W_SEEN, fill: WHITE }); svg.close();
  svg.text(x, y - length / 2 - 1.2, 'N', { size: T_ROOM, anchor: 'middle' });
}
/* 実寸の目盛り。黒と白の交互の帯（細線 0.13） */
function lscaleBar(svg, x, y, scale, meters, step, labelEvery, h) {
  step = step || 1; labelEvery = labelEvery || step; h = h || 1.0; const n = Math.round(meters / step), seg = step * 1000 / scale;
  svg.open('ad-scalebar'); for (let i = 0; i < n; i++) svg.rect(x + i * seg, y - h, x + (i + 1) * seg, y, { w: W_FINE, fill: i % 2 === 0 ? INK : WHITE }); svg.close();
  for (let k = 0; k * step <= meters + 1e-9; k++) { const v = k * step; if (Math.abs(v / labelEvery - Math.round(v / labelEvery)) < 1e-6) svg.text(x + k * seg, y + T_NOTE + 0.6, String(+v.toFixed(6)) + (Math.abs(v - meters) < 1e-9 ? ' m' : ''), { anchor: 'middle', cls: 'ad-scale-text' }); }
}
/* レベル記号：基準線の上に頂点を下にした白抜きの三角、右か左に名前と値 */
function llevelMark(svg, x, y, name, value, o) {
  o = o || {}; const s = 1.3, side = o.side || 'left'; svg.open('ad-level'); svg.poly([[x, y], [x - s, y - s * 1.6], [x + s, y - s * 1.6]], { w: W_SEEN, fill: WHITE }); svg.close();
  const tx = o.xText != null ? o.xText : (side === 'left' ? x - s - 1.0 : x + s + 1.0);
  return svg.text(tx, y - 0.6, name + '　' + value, { anchor: side === 'left' ? 'end' : 'start' });
}
/* 断面の位置：両端の太い短線・視る向きの塗り三角・記号 */
function lsectionMark(svg, p0, p1, letter, view, o) {
  o = o || {}; const w = o.w == null ? W_CUT : o.w, tick = o.tick || 4.0, [x0, y0] = p0, [x1, y1] = p1, L = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / L, uy = (y1 - y0) / L, [vx, vy] = view;
  svg.open('ad-section-mark'); if (o.full) svg.line(x0, y0, x1, y1, { w: W_FINE, kind: 'chain' });
  for (const [px, py, sgn, lab] of [[x0, y0, 1, letter], [x1, y1, -1, letter + "'"]]) {
    svg.line(px, py, px + ux * tick * sgn, py + uy * tick * sgn, { w }); svg.poly([[px, py], [px + ux * 1.8 * sgn, py + uy * 1.8 * sgn], [px + vx * 2.4, py + vy * 2.4]], { w: 0, fill: INK });
    const tx = px - ux * 2.4 * sgn, ty = py - uy * 2.4 * sgn; svg.text(tx + vx * 0.6, ty + T_ROOM * 0.36 + vy * 0.6, lab, { size: T_ROOM, weight: 700, anchor: 'middle' });
  }
  svg.close();
}
/* 線で描く人物（身長 heightMm）。x は紙、yFeet は足元（紙） */
function lhuman(svg, x, yFeet, heightMm, scale, o) {
  o = o || {}; const H = heightMm / scale, k = H / 1700, facing = o.facing || 1, w = o.w == null ? W_FAR : o.w, P = (px, py) => [x + px * k * facing, yFeet - py * k];
  svg.open('ad-person'); const hc = P(0, 1590); svg.circle(hc[0], hc[1], 105 * k, { w, fill: WHITE });
  svg.poly([P(-60, 1470), P(-210, 1400), P(-240, 1050), P(-215, 760), P(-170, 760), P(-160, 1030), P(-140, 900), P(-150, 0), P(-30, 0), P(0, 780), P(30, 0), P(150, 0), P(140, 900), P(160, 1030), P(170, 760), P(215, 760), P(240, 1050), P(210, 1400), P(60, 1470)], { w, fill: WHITE, join: 'round' });
  svg.close();
}
function polyAreaAbs(pts) { return Math.abs(area2(pts)); }

/* ── model.py の判断を M から導く ───────────────────────────────────────────── */
function layersModel(M) {
  const L = { M }, H = M.tw / 2, X_E = M.X[M.X.length - 1], Y_N = M.Y[M.Y.length - 1];
  L.H = H; L.X_E = X_E; L.Y_N = Y_N; L.XI0 = M.X[0] + H; L.XI1 = X_E - H; L.YI0 = M.Y[0] + H; L.YI1 = Y_N - H; L.XO0 = M.X[0] - H; L.XO1 = X_E + H; L.YO0 = M.Y[0] - H; L.YO1 = Y_N + H;
  L.ids = M.levelIds; L.n = L.ids.length; L.FL = L.ids.map(id => M.FL[id]); L.RFL = M.FL.RF; L.TOP = M.top; L.PARAPET_H = M.parapet;
  L.STORY = L.ids.map((id, i) => (i < L.n - 1 ? L.FL[i + 1] : L.RFL) - L.FL[i]);
  L.FLOOR_ZONE = 400; L.CH = L.STORY.map(s => s - L.FLOOR_ZONE); L.EAVE = L.RFL - 40;
  L.FDN_TOP = L.FL[0]; L.FDN_BOT = L.FL[0] - 200; L.STEM_TOP = 400; L.STEM_TOP_S = L.FL[0]; L.FOOTING_BOT = -350; L.SUTECON = [L.FDN_BOT - 50, L.FDN_BOT]; L.GRAVEL = [L.FDN_BOT - 150, L.FDN_BOT - 50]; L.SILL = 105;
  const Al = M.alley, alN = Al ? Al.y_near : M.site.y0, alF = Al ? Al.y_far : M.site.y0;   // 路地が無ければ敷地の南の境界で代える（文は描かない）
  L.noAlley = !Al; L.fireWall = arr(M.raw && M.raw.walls).some(w => w.kind === 'fire'); L.rc = !!M.rc;
  L.Y_BND_S = M.site.y0; L.Y_BND_N = M.site.y1; L.X_BND_W = M.site.x0; L.X_BND_E = M.site.x1; L.Y_ALLEY_FAR = alF; L.Y_ALLEY_CL = (alN + alF) / 2; L.ALLEY_W = Math.abs(alN - alF); L.SETBACK = L.YO0 - L.Y_BND_S;
  L.ENSHO = L.ids.map((id, i) => L.Y_ALLEY_CL + (i === 0 ? 3000 : 5000));
  // 開口：a/b は絶対座標、floor は添字（0..）、wside
  L.OPENINGS = M.openings.map(o => Object.assign({}, o, { a: o.a0, b: o.a1, floor: L.ids.indexOf(o.fl), wside: o.wall, axis: (o.wall === 'S' || o.wall === 'N') ? 'x' : 'y', ptype: o.kind === 'shop' ? 'shop_slide' : 'window_slide' }));
  L.DOORS = M.doors.map(d => Object.assign({}, d, { floor: L.ids.indexOf(d.fl) }));
  L.WALLS = L.ids.map(id => M.walls[id] || []); L.ROOMS = L.ids.map(id => (M.rooms[id] || []).map(r => Object.assign({}, r, { area: polyAreaAbs(r.poly) / 1e6 }))); L.FIXTURES = L.ids.map(id => M.fixtures[id] || []);
  L.USES = L.ids.map((id, i) => L.ROOMS[i].filter(r => r.hasLabel !== false && r.label !== null).map(r => r.name).filter((v, j, a) => a.indexOf(v) === j).join('・'));
  // 階段（北へ上る直階段。y_start・y_top・dir）
  L.FLIGHTS = M.stairs.filter(s => s.axis !== 'x').map(s => { const base = L.ids.indexOf(s.fl), to = L.ids.indexOf(s.to); return { name: s.id, base, to, z0: M.FL[s.fl], top_level: M.FL[s.to], n: s.risers, rise: (M.FL[s.to] - M.FL[s.fl]) / s.risers, tread: s.tread, y_start: s.y0, dir: s.dir, y_top: s.y0 + s.dir * (s.risers - 1) * s.tread, x0: s.x0, x1: s.x1 }; }).sort((a, b) => a.base - b.base);
  const F0 = L.FLIGHTS[0] || { tread: 220, x0: X_E - 875, x1: X_E - 75 };
  L.TREAD = F0.tread; L.STAIR_X0 = F0.x0; L.STAIR_X1 = F0.x1; L.HEADROOM = 2000;
  L.nosingY = (fl, k) => fl.y_start + fl.dir * (k - 1) * fl.tread;
  L.pitchZ = (fl, y) => fl.z0 + fl.rise + fl.dir * (y - fl.y_start) * fl.rise / fl.tread;
  L.openingEdge = (fl) => { const under = fl.top_level - L.FLOOR_ZONE; return fl.y_start + fl.dir * fl.tread * (under - L.HEADROOM - fl.z0 - fl.rise) / fl.rise; };
  L.FLOOR_OPEN = {};   // 上の床の開口（添字で引く）。頭上 2,000 の線で決め、10mm 単位で開口の側へ丸める
  for (const f of L.FLIGHTS) { let e = L.openingEdge(f); e = f.dir > 0 ? Math.floor(e / 10) * 10 : Math.ceil(e / 10) * 10; const ys = [e, f.y_top].sort((a, b) => a - b); L.FLOOR_OPEN[f.to] = [f.x0, ys[0], f.x1, ys[1]]; }
  L.SKYLIGHT = M.roof_open ? M.roof_open.rect.slice() : null;
  L.SECTION_A_Y = (M.sections.A && M.sections.A.axis === 'x') ? M.sections.A.at : (M.Y[0] + Y_N) / 2;
  L.SECTION_B_X = (M.sections.B && M.sections.B.axis === 'y') ? M.sections.B.at : (L.STAIR_X0 + L.STAIR_X1) / 2;
  // 軸組（判断）
  const sOpen = Array.from(new Set(L.OPENINGS.filter(o => o.wside === 'S').map(o => o.a + ',' + o.b))).map(s => s.split(',').map(Number)), nOpen = Array.from(new Set(L.OPENINGS.filter(o => o.wside === 'N').map(o => o.a + ',' + o.b))).map(s => s.split(',').map(Number));
  const clear = (x, spans, margin) => spans.every(([a, b]) => !(a - (margin || 60) < x && x < b + (margin || 60)));
  const posts = new Set(); const addP = (x, y) => posts.add(x + ',' + y);
  for (let y = M.Y[0]; y <= Y_N; y += 900) { addP(M.X[0], y); addP(X_E, y); }
  for (let x = M.X[0] + 900; x < X_E; x += 900) { if (clear(x, sOpen)) addP(x, M.Y[0]); if (clear(x, nOpen)) addP(x, Y_N); }
  for (const [a, b] of sOpen) { addP(a - 60, M.Y[0]); addP(b + 60, M.Y[0]); }
  L.POSTS = Array.from(posts).map(s => s.split(',').map(Number)).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  L.CORNER_POSTS = [[M.X[0], M.Y[0]], [X_E, M.Y[0]], [M.X[0], Y_N], [X_E, Y_N]];
  L.TRIMMER_X = L.STAIR_X0 - 60; L.BRACE_BAYS = [[M.Y[0] + 900, M.Y[0] + 1800], [Y_N - 900, Y_N]];
  L.braceBaysN = (floor) => { const wins = L.OPENINGS.filter(o => o.wside === 'N' && o.floor === floor).map(o => [o.a, o.b]), bays = []; for (let x = M.X[0]; x < X_E; x += 900) if (wins.every(([a, b]) => b <= x || a >= x + 900)) bays.push([x, x + 900]); return bays.slice(0, 2); };
  L.beamsFor = (open) => { const base = []; for (let y = M.Y[0] + 450; y < Y_N; y += 900) base.push(y); if (!open) return base.map(y => [y, false]); const [, y0, , y1] = open, hs = y0 - 60, hn = y1 + 60, out = []; for (const y of base) { if (Math.abs(y - hs) < 250 || Math.abs(y - hn) < 250) continue; out.push([y, y0 < y && y < y1]); } out.push([hs, false], [hn, false]); return out.sort((a, b) => a[0] - b[0]); };
  L.BEAMS = {}; for (let i = 1; i < L.n; i++) L.BEAMS[i] = L.beamsFor(L.FLOOR_OPEN[i]); L.BEAMS[L.n] = L.beamsFor(L.SKYLIGHT);
  // 設備の縦の通り（判断：西の界壁の内側）
  L.STACK = [L.XI0 + 90, M.Y[0] + (Y_N - M.Y[0]) * 0.72]; L.SUPPLY = [L.XI0 + 90, L.STACK[1] - 200]; L.ROOF_DRAIN = [M.X[0] + 650, Y_N - 400];
  L.floorArea = () => (X_E - M.X[0]) * (Y_N - M.Y[0]) / 1e6;
  L.gridIds = M.gridIds;
  return L;
}

/* ═══════════════════════════════ 階の並べ図（floors.py） ═══════════════════════════════
   各階と屋上を同じ縮尺・同じ向き（北が上）・同じ枠（敷地と路地）で横に並べる。Y の通り芯は全枚を貫く。
   赤は「上下の階をつなぐ所（階段・床の開口・天窓）」だけ。延焼ライン（1 階 3m・2 階以上 5m）を各階に引く。 */
function figFloors(M, opt) {
  opt = opt || {}; const L = layersModel(M), SCALE = opt.scale || 100, n = L.n, FLOORS = []; for (let i = 0; i < n; i++) FLOORS.push(i); FLOORS.push(n);   // n = 屋上
  const siteW = (L.X_BND_E - L.X_BND_W) / SCALE, pitch = Math.max(88, siteW + 34), SHEET_W = Math.max(420, 49 + pitch * (n + 1) + 20), SHEET_H = 297, DY = 10, OY = 131.75 + DY;
  const OX = FLOORS.map(i => 49 + pitch * i), NAMES = L.ids.map(id => id.replace(/F$/, '階')).concat(['屋上']), CUT_STEP = 5.5;
  const svg = new LSvg(SHEET_W, SHEET_H, '階の並べ図（各階平面図 1:' + SCALE + '）', '各階と屋上を同じ縮尺・同じ向き・同じ枠で並べた。赤は上下の階をつなぐ階段・床の開口・天窓。');
  const mkPl = (ox, oy) => ({ P: (x, y) => [ox + x / SCALE, oy - y / SCALE], pts(seq) { return seq.map(([x, y]) => this.P(x, y)); },
    rect(x0, y0, x1, y1, o) { svg.poly(this.pts([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]), o); }, line(x0, y0, x1, y1, o) { const a = this.P(x0, y0), b = this.P(x1, y1); svg.line(a[0], a[1], b[0], b[1], o); },
    circle(x, y, r, o) { const c = this.P(x, y); svg.circle(c[0], c[1], r / SCALE, o); }, ellipse(cx, cy, rx, ry, o) { const pts = []; for (let t = 0; t < 36; t++) pts.push(this.P(cx + rx * Math.cos(t * Math.PI / 18), cy + ry * Math.sin(t * Math.PI / 18))); svg.poly(pts, o || { w: W_FINE }); } });
  const cutRect = (rect, axis, spans) => { const [x0, y0, x1, y1] = rect, lo = axis === 'x' ? x0 : y0, hi = axis === 'x' ? x1 : y1, out = []; let p = lo; for (let [a, b] of spans.slice().sort((u, v) => u[0] - v[0])) { a = Math.max(a, lo); b = Math.min(b, hi); if (b <= a) continue; if (a > p) out.push([p, a]); p = Math.max(p, b); } if (p < hi) out.push([p, hi]); return out.map(([a, b]) => axis === 'x' ? [a, y0, b, y1] : [x0, a, x1, b]); };
  const wallPieces = (floor, kind) => { const pieces = []; for (const w of L.WALLS[floor]) { if (w.kind !== kind) continue; const ops = kind === 'struct' ? L.OPENINGS.filter(o => o.floor === floor && o.wside === w.side) : L.DOORS.filter(d => d.floor === floor && d.wall === w.id); if (!ops.length) pieces.push(w.rect); else pieces.push(...cutRect(w.rect, w.horiz ? 'x' : 'y', ops.map(o => [o.a, o.b]))); } return pieces; };
  function drawWalls(pl, floor) {
    if (floor === n) { for (const w of L.WALLS[n - 1]) if (w.kind === 'struct') pl.rect(...w.rect, { w: W_CUT, fill: INK }); return; }
    const parts = wallPieces(floor, 'part'), ins = W_CUT / 2 * SCALE;
    svg.open('ad-cut');
    for (const r of parts) pl.rect(...r, { w: W_CUT, fill: WHITE });
    for (const [x0, y0, x1, y1] of parts) if (x1 - x0 > 2 * ins && y1 - y0 > 2 * ins) pl.rect(x0 + ins, y0 + ins, x1 - ins, y1 - ins, { w: 0, fill: WHITE });
    for (const r of wallPieces(floor, 'struct')) pl.rect(...r, { w: W_CUT, fill: INK });
    svg.close();
  }
  function drawOpenings(pl, floor) {
    svg.open('ad-opening');
    for (const o of L.OPENINGS) {
      if (o.floor !== floor) continue; const wall = L.WALLS[floor].find(w => w.kind === 'struct' && w.side === o.wside); if (!wall) continue;
      const [x0, y0, x1, y1] = wall.rect, a = o.a, b = o.b, horiz = o.axis === 'x', lo = horiz ? y0 : x0, hi = horiz ? y1 : x1;
      const Rr = (u0, v0, u1, v1, oo) => horiz ? pl.rect(u0, v0, u1, v1, oo) : pl.rect(v0, u0, v1, u1, oo), Ll = (u0, v0, u1, v1, oo) => horiz ? pl.line(u0, v0, u1, v1, oo) : pl.line(v0, u0, v1, u1, oo);
      const yc = (lo + hi) / 2, np = o.panels || 2, wpan = (b - a) / np, ov = 40;
      for (let i = 0; i < np; i++) { const u0 = a + i * wpan - (i > 0 ? ov : 0), u1 = a + (i + 1) * wpan + (i < np - 1 ? ov : 0), off = np === 4 ? ((i === 0 || i === 3) ? -1 : 1) : (i % 2 === 0 ? -1 : 1); Rr(u0, yc + off * 5, u1, yc + off * 38, { w: W_SEEN, fill: WHITE }); }
      const outer = (o.wside === 'S' || o.wside === 'W') ? lo : hi, inner = outer === lo ? hi : lo;
      Ll(a, outer, b, outer, { w: W_FINE }); if (o.sill > 0) Ll(a, inner, b, inner, { w: W_FINE });
      if (o.rail) { const d = outer === lo ? -120 : 120; Ll(a, outer + d, b, outer + d, { w: W_SEEN }); Ll(a, outer + d, a, outer, { w: W_FINE }); Ll(b, outer + d, b, outer, { w: W_FINE }); }
    }
    for (const d of L.DOORS) {
      if (d.floor !== floor) continue; const wall = L.WALLS[floor].find(w => w.id === d.wall); if (!wall) continue;
      const [x0, y0, x1, y1] = wall.rect, horiz = wall.horiz, lo = horiz ? y0 : x0, hi = horiz ? y1 : x1, a = d.a, b = d.b, Lw = b - a;
      const Rr = (u0, v0, u1, v1, oo) => horiz ? pl.rect(u0, v0, u1, v1, oo) : pl.rect(v0, u0, v1, u1, oo), Ll = (u0, v0, u1, v1, oo) => horiz ? pl.line(u0, v0, u1, v1, oo) : pl.line(v0, u0, v1, u1, oo);
      if (d.type === 'swing') {
        const sgn = d.swing, hinge = d.hinge === 1 ? b : a, free = hinge === b ? a : b, face = sgn > 0 ? hi : lo;
        Ll(hinge, face, hinge, face + sgn * Lw, { w: W_SEEN });
        let c, aClosed, aOpen; if (horiz) { c = pl.P(hinge, face); aClosed = free > hinge ? 0 : 180; aOpen = sgn > 0 ? 90 : -90; } else { c = pl.P(face, hinge); aClosed = free > hinge ? 90 : -90; aOpen = sgn > 0 ? 0 : 180; }
        let [loA, hiA] = [aClosed, aOpen].sort((p, q) => p - q); if (hiA - loA > 180) [loA, hiA] = [hiA, loA + 360];
        svg.arc(c[0], c[1], Lw / SCALE, loA, hiA, { w: W_FINE });
      } else if (d.type === 'slide') { const side = d.side || 1, face = side > 0 ? hi : lo; Rr(a - 30, face + side * 15, b + 30, face + side * 45, { w: W_SEEN, fill: WHITE }); const [v0, v1] = d.park === 'b' ? [b, b + Lw] : [a - Lw, a]; Rr(v0, face + side * 15, v1, face + side * 45, { w: W_FINE, kind: 'hidden' }); }
      else { const yc = (lo + hi) / 2, half = Lw / 2; Rr(a, yc + 5, a + half + 20, yc + 38, { w: W_SEEN, fill: WHITE }); Rr(b - half - 20, yc - 38, b, yc - 5, { w: W_SEEN, fill: WHITE }); }
    }
    svg.close();
  }
  const arrow = (pl, yFrom, yTo, label, fl) => { const x = (fl.x0 + fl.x1) / 2, a = pl.P(x, yFrom), b = pl.P(x, yTo); svg.line(a[0], a[1], b[0], b[1], { w: W_FAR, color: ACCENT }); svg.circle(a[0], a[1], 0.45, { w: W_FAR, color: ACCENT, fill: WHITE }); const d = b[1] > a[1] ? 1 : -1; svg.poly([[b[0] - 0.6, b[1] - d * 1.2], [b[0], b[1]], [b[0] + 0.6, b[1] - d * 1.2]], { w: W_FAR, color: ACCENT, closed: false }); svg.text(a[0] - 2.2, a[1] + T_NOTE * 0.36, label, { anchor: 'middle', halo: true }); };
  const risers = (pl, fl, ks, w) => { for (const k of ks) { const y = L.nosingY(fl, k); pl.line(fl.x0, y, fl.x1, y, { w, color: ACCENT }); } };
  const breakLine = (pl, fl, y) => { const x0 = fl.x0 + 10, x1 = fl.x1 - 10, xm = (x0 + x1) / 2; svg.poly(pl.pts([[x0, y - 170], [xm - 60, y - 30], [xm - 10, y + 90], [xm + 40, y - 90], [xm + 90, y + 30], [x1, y + 170]]), { w: W_FAR, closed: false }); };
  const zoneHatch = (pl, x0, y0, x1, y1) => svg.hatch(pl.pts([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]), { angle: 45, spacing: 1.0, w: W_FINE, color: ACCENT });
  const flightFrom = (floor) => L.FLIGHTS.find(f => f.base === floor), flightTo = (floor) => L.FLIGHTS.find(f => f.to === floor);
  function drawStair(pl, floor) {
    const up = floor < n ? flightFrom(floor) : null, below = flightTo(floor);
    svg.open('ad-stair');
    if (up) zoneHatch(pl, up.x0, Math.min(up.y_start, up.y_top), up.x1, Math.max(up.y_start, up.y_top)); else if (floor < n && L.FLOOR_OPEN[floor]) zoneHatch(pl, ...L.FLOOR_OPEN[floor]); else if (floor === n && L.SKYLIGHT) zoneHatch(pl, ...L.SKYLIGHT);
    if (up) {
      const yc = L.nosingY(up, 1) + up.dir * CUT_STEP * up.tread, ks = []; for (let k = 1; k <= Math.min(6, up.n); k++) ks.push(k);
      const yEnd = below ? below.y_top : up.y_top; pl.rect(up.x0, Math.min(up.y_start, yEnd), up.x1, Math.max(up.y_start, yEnd), { w: W_MID, color: ACCENT });
      risers(pl, up, ks, W_SEEN);
      if (!below) pl.line(up.x1 - 400, yc + up.dir * 300, up.x1 - 400, up.y_top - up.dir * 150, { w: W_FAR, color: ACCENT, kind: 'hidden' });
      else { const ks2 = []; for (let k = 1; k <= below.n; k++) if (below.dir * (L.nosingY(below, k) - (yc + below.dir * 200)) > 0) ks2.push(k); risers(pl, below, ks2, W_FAR); }
      breakLine(pl, up, yc); arrow(pl, up.y_start, yc - up.dir * 260, '上', up);
      if (below) arrow(pl, below.y_top - below.dir * 120, yc + below.dir * 420, '下', below);
    } else if (floor < n && below) {
      const o = L.FLOOR_OPEN[floor]; pl.rect(o[0], o[1], o[2], o[3], { w: W_MID, color: ACCENT });
      const ks = []; for (let k = 1; k <= below.n; k++) { const y = L.nosingY(below, k); if (y > o[1] + 50 && y < o[3] - 50 + 1) ks.push(k); } risers(pl, below, ks, W_FAR);
      arrow(pl, below.y_top - below.dir * 120, below.dir > 0 ? o[1] + 500 : o[3] - 500, '下', below);
      if (L.SKYLIGHT) pl.rect(...L.SKYLIGHT, { w: W_FAR, color: ACCENT, kind: 'hidden' });
    } else if (floor === n && L.SKYLIGHT) { const [x0, y0, x1, y1] = L.SKYLIGHT; pl.rect(x0 - 100, y0 - 100, Math.min(x1 + 100, L.XI1), y1 + 100, { w: W_SEEN, color: ACCENT }); pl.rect(x0, y0, x1, y1, { w: W_MID, color: ACCENT }); pl.line(x0, (y0 + y1) / 2, x1, (y0 + y1) / 2, { w: W_FINE, color: ACCENT }); }
    svg.close();
  }
  function drawFixtures(pl, floor) {
    const w = W_FINE; svg.open('ad-visible');
    for (const fx of L.FIXTURES[floor]) {
      const t = fx.type; if (t === 'skylight') continue; let x0, y0, x1, y1; if (fx.rect) [x0, y0, x1, y1] = fx.rect;
      if (['bench', 'shoebox', 'fridge', 'lowtable', 'tvboard', 'desk', 'wardrobe', 'washer', 'vanity'].indexOf(t) >= 0) {
        pl.rect(x0, y0, x1, y1, { w }); if (t === 'fridge') pl.line(x0, y0, x1, y1, { w }); if (t === 'washer') pl.circle((x0 + x1) / 2, (y0 + y1) / 2, Math.min(x1 - x0, y1 - y0) * 0.35, { w });
        if (t === 'vanity') pl.ellipse((x0 + x1) / 2, (y0 + y1) / 2 - 40, (x1 - x0) * 0.3, (y1 - y0) * 0.3, { w }); if (t === 'wardrobe') pl.line(x0, (y0 + y1) / 2, x1, (y0 + y1) / 2, { w, kind: 'hidden' });
      } else if (t === 'shelf') { pl.rect(x0, y0, x1, y1, { w }); const div = fx.div || 900, longY = (y1 - y0) > (x1 - x0); for (let v = (longY ? y0 : x0) + div; v < (longY ? y1 : x1) - 10; v += div) { if (longY) pl.line(x0, v, x1, v, { w }); else pl.line(v, y0, v, y1, { w }); } }
      else if (t === 'counter') { pl.rect(x0, y0, x1, y1, { w }); if (fx.sink) pl.rect(...fx.sink, { w }); if (fx.hob) for (const dx of [-160, 160]) pl.circle(fx.hob[0] + dx, fx.hob[1], 110, { w }); }
      else if (t === 'hood') pl.rect(x0, y0, x1, y1, { w: W_FAR, kind: 'hidden' });
      else if (t === 'table') { pl.rect(x0, y0, x1, y1, { w }); const nc = fx.chairs || 2; for (let i = 0; i < nc; i++) { const cx = x0 + (x1 - x0) * (i + 0.5) / nc; for (const cy of [y0 - 230, y1 + 230]) pl.rect(cx - 210, cy - 200, cx + 210, cy + 200, { w }); } }
      else if (t === 'sofa') { pl.rect(x0, y0, x1, y1, { w }); pl.rect(x0, y0, x0 + 200, y1, { w }); }
      else if (t === 'bed') { pl.rect(x0, y0, x1, y1, { w }); const head = fx.head || 'N', np = fx.pillows || 1; for (let i = 0; i < np; i++) { let px0, px1, py0, py1; if (head === 'E' || head === 'W') { py0 = y0 + (y1 - y0) * i / np + 80; py1 = y0 + (y1 - y0) * (i + 1) / np - 80; [px0, px1] = head === 'E' ? [x1 - 420, x1 - 120] : [x0 + 120, x0 + 420]; } else { px0 = x0 + (x1 - x0) * i / np + 100; px1 = x0 + (x1 - x0) * (i + 1) / np - 100; [py0, py1] = head === 'N' ? [y1 - 420, y1 - 120] : [y0 + 120, y0 + 420]; } pl.rect(px0, py0, px1, py1, { w }); } }
      else if (t === 'tub') { pl.rect(x0, y0, x1, y1, { w }); pl.rect(x0 + 70, y0 + 70, x1 - 70, y1 - 70, { w }); }
      else if (t === 'shower') pl.circle(fx.x, fx.y - 80, 70, { w });
      else if (t === 'toilet' || t === 'handbasin') {
        const ang = (fx.rot + 90) * Math.PI / 180, ux = Math.cos(ang), uy = Math.sin(ang), vx = -uy, vy = ux, Q = (f_, s_) => pl.P(fx.x + ux * f_ + vx * s_, fx.y + uy * f_ + vy * s_);
        if (t === 'toilet') { svg.poly([Q(0, -230), Q(0, 230), Q(190, 230), Q(190, -230)], { w }); const pts = []; for (let k = 0; k < 36; k++) pts.push(Q(190 + 260 + 230 * Math.cos(k * Math.PI / 18), 190 * Math.sin(k * Math.PI / 18))); svg.poly(pts, { w }); }
        else { svg.poly([Q(0, -200), Q(0, 200), Q(300, 200), Q(300, -200)], { w }); const pts = []; for (let k = 0; k < 36; k++) pts.push(Q(150 + 100 * Math.cos(k * Math.PI / 18), 140 * Math.sin(k * Math.PI / 18))); svg.poly(pts, { w }); }
      } else if (t === 'rod') { const [[ax, ay], [bx, by]] = fx.line; pl.line(ax, ay, bx, by, { w: W_FAR, kind: 'hidden' }); }
    }
    svg.close();
  }
  /* 土間（モルタル金ごて）の砂目。決まった種の擬似乱数 */
  function stipple(pl, poly, holes) {
    let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const b = bbox2(poly), cnt = Math.floor((b[2] - b[0]) * (b[3] - b[1]) / SCALE / SCALE * 0.33), dots = [];
    for (let i = 0; i < cnt; i++) { const x = b[0] + 120 + rnd() * (b[2] - b[0] - 240), y = b[1] + 120 + rnd() * (b[3] - b[1] - 240); if (!pointInPoly(x, y, poly)) continue; if (holes.some(h => h[0] - 60 <= x && x <= h[2] + 60 && h[1] - 60 <= y && y <= h[3] + 60)) continue; dots.push(pl.P(x, y)); }
    svg.raw('<path d="' + dots.map(([px, py]) => 'M' + fmt(px) + ',' + fmt(py) + 'h0.01').join(' ') + '" fill="none" stroke="' + INK + '" stroke-width="0.22" stroke-linecap="round"/>');
  }
  function drawRoof(pl) {
    const c = pl.P(...L.ROOF_DRAIN); svg.circle(c[0], c[1], 0.9, { w: W_SEEN }); svg.circle(c[0], c[1], 0.45, { w: W_FINE });
    const v = pl.P(...L.STACK); svg.circle(v[0], v[1], 0.7, { w: W_SEEN });
    const a = pl.P(L.X_E * 0.55, (L.Y_N - M.Y[0]) * 0.17), b = pl.P(L.ROOF_DRAIN[0] + 500, L.ROOF_DRAIN[1] - 800); svg.line(a[0], a[1], b[0], b[1], { w: W_FINE });
    const Lg = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / Lg, uy = (b[1] - a[1]) / Lg;
    svg.poly([[b[0] - ux * 1.4 - uy * 0.6, b[1] - uy * 1.4 + ux * 0.6], [b[0], b[1]], [b[0] - ux * 1.4 + uy * 0.6, b[1] - uy * 1.4 - ux * 0.6]], { w: W_FINE, closed: false });
    const t = pl.P(L.X_E * 0.4, (L.Y_N - M.Y[0]) * 0.49); svg.text(t[0] + 1.2, t[1], '水勾配 1/50');
    svg.text(c[0] + 1.6, c[1] + T_NOTE * 0.36, 'ルーフドレン'); svg.text(v[0] + 1.4, v[1] + T_NOTE * 0.36 + 0.2, '通気管');
  }
  const drawGridX = (pl, topY) => { M.X.forEach((x, i) => { const p = pl.P(x, 0); svg.line(p[0], topY + 2.4, p[0], pl.P(0, L.Y_BND_S)[1] + 1.5, { w: W_FINE, kind: 'chain' }); lgridBubble(svg, p[0], topY, L.gridIds.x[i] || ('X' + (i + 1))); }); };
  const openingDims = (pl, floor, side, atY, extY) => { const xs = [M.X[0]]; for (const o of L.OPENINGS.filter(o => o.floor === floor && o.wside === side).sort((p, q) => p.a - q.a)) xs.push(o.a, o.b); xs.push(L.X_E); const labels = []; for (let i = 0; i < xs.length - 1; i++) { const lab = fmtmm(xs[i + 1] - xs[i]); labels.push((xs[i + 1] - xs[i]) / SCALE >= tw56(lab, T_NOTE) + 0.8 ? lab : null); } ldimChain(svg, xs.map(x => pl.P(x, 0)[0]), 'x', atY, { extFrom: pl.P(0, extY)[1], labels }); };
  const drawSectionMarks = (pl) => { lsectionMark(svg, pl.P(L.SECTION_B_X, L.YO1 + 260), pl.P(L.SECTION_B_X, L.Y_BND_S - 600), 'B', [-1, 0], { tick: 3 }); lsectionMark(svg, pl.P(L.XO0 - 420, L.SECTION_A_Y), pl.P(L.XO1 + 420, L.SECTION_A_Y), 'A', [0, -1], { tick: 3 }); };
  function roomLabels(pl, floor) {
    svg.open('ad-room-name');
    for (const r of L.ROOMS[floor] || []) {
      if (!r.label) continue; const p = pl.P(r.label[0], r.label[1]), size = r.small ? T_NOTE : T_ROOM;
      svg.text(p[0], p[1] + size * 0.35, r.name, { size, anchor: 'middle', halo: true }); let k = 1;
      if (r.sub) { svg.text(p[0], p[1] + size * 0.35 + T_NOTE * 1.3 * k, r.sub, { anchor: 'middle', halo: true }); k++; }
      if (r.area && !r.small) svg.text(p[0], p[1] + size * 0.35 + T_NOTE * 1.3 * k, r.area.toFixed(2) + ' m²', { anchor: 'middle', halo: true });
    }
    svg.close();
  }
  function drawPlan(idx, floor) {
    const pl = mkPl(OX[idx], OY), topBubble = 26 + DY, xa = L.XO0 - 900, xb = L.XO1 + 900;
    svg.open('ad-site');
    for (const [y, kind, w] of [[L.Y_BND_S, 'phantom', W_FAR], [L.Y_ALLEY_FAR, 'phantom', W_FAR], [L.Y_ALLEY_CL, 'chain', W_FINE], [L.Y_BND_N, 'phantom', W_FAR]]) pl.line(xa, y, xb, y, { w, kind });
    svg.close();
    drawGridX(pl, topBubble);
    if (floor < n && !L.noAlley) { const ye = L.ENSHO[floor]; svg.open('ad-hidden'); pl.line(xa, ye, L.XO1 + 300, ye, { w: W_FAR, kind: 'hidden' }); svg.close(); const e = pl.P(L.XO1 + 300, ye); svg.text(e[0] + 0.8, e[1] + 0.7, '延焼ライン ' + (floor === 0 ? 3 : 5) + ' m'); }
    if (floor < n) {
      for (const r of L.ROOMS[floor]) if (r.finish === 'doma') { const holes = L.FIXTURES[floor].filter(fx => fx.rect).map(fx => fx.rect); if (r.label) holes.push([r.label[0] - 900, r.label[1] - 650, r.label[0] + 900, r.label[1] + 250]); stipple(pl, r.poly, holes); }
      drawFixtures(pl, floor); drawStair(pl, floor); drawWalls(pl, floor); drawOpenings(pl, floor);
    } else { drawRoof(pl); drawStair(pl, n); drawWalls(pl, n); }
    drawSectionMarks(pl); roomLabels(pl, floor);
    if (floor === n) { const p = pl.P(L.X_E * 0.37, (L.Y_N - M.Y[0]) * 0.31); svg.text(p[0], p[1], '屋上', { size: T_ROOM, anchor: 'middle' }); }
    const hx = pl.P(L.XO0, 0)[0];
    svg.text(hx, 18.5 + DY, NAMES[floor], { size: T_ROOM, weight: 700 });
    svg.text(hx + tw56(NAMES[floor], T_ROOM) + 2.0, 18.5 + DY, floor < n ? ('FL＝GL＋' + fmtmm(L.FL[floor]) + '　CH ' + fmtmm(L.CH[floor])) : ('RFL＝GL＋' + fmtmm(L.RFL)));
    ldimChain(svg, [pl.P(M.X[0], 0)[0], pl.P(L.X_E, 0)[0]], 'x', 32 + DY, { labels: [fmtmm(L.X_E - M.X[0])] });
    ldimChain(svg, M.X.map(x => pl.P(x, 0)[0]), 'x', 36 + DY, { labels: M.X.slice(1).map((x, i) => fmtmm(x - M.X[i])) });
    if (floor < n) { openingDims(pl, floor, 'N', 41.5 + DY, L.YO1); openingDims(pl, floor, 'S', pl.P(0, L.YO0)[1] + 3.5, L.YO0); }
    const lx = pl.P(L.XO1, 0)[0] + 4.0, F0 = L.FLIGHTS[0];
    if (floor === 0) {
      if (F0) { const a = pl.P(F0.x1 - 150, F0.y_start + F0.dir * 550); lleader(svg, a, [lx + 1.0, a[1] + 4.0], '階段 W' + fmtmm(F0.x1 - F0.x0), { sub: '蹴上' + fmtmm(F0.rise) + ' 踏面' + fmtmm(F0.tread) }); }
      if (!L.noAlley) {
        const c = pl.P(L.X_E / 2, (L.Y_BND_S + L.Y_ALLEY_CL) / 2); svg.text(c[0], c[1] + T_ROOM * 0.35, L.ALLEY_W < 4000 ? '路地' : '道路', { size: T_ROOM, anchor: 'middle' });
        const c2 = pl.P(L.X_E / 2, (L.Y_ALLEY_CL + L.Y_ALLEY_FAR) / 2); svg.text(c2[0], c2[1] + T_NOTE * 0.35, '幅 ' + fmtmm(L.ALLEY_W), { anchor: 'middle' });
        const cl = pl.P(L.XO0 - 900, L.Y_ALLEY_CL); svg.text(cl[0] + 0.5, cl[1] - 0.8, '中心線');
        const xd = pl.P(L.XO1 + 620, 0)[0]; ldim(svg, [xd, pl.P(0, L.Y_ALLEY_CL)[1]], [xd, pl.P(0, L.YO0)[1]], { text: fmtmm(L.YO0 - L.Y_ALLEY_CL), ext0: [pl.P(L.XO1 + 900, 0)[0], pl.P(0, L.Y_ALLEY_CL)[1]], ext1: [pl.P(L.XO1, 0)[0], pl.P(0, L.YO0)[1]] });
        svg.text(pl.P(L.XO1, 0)[0] + 1.0, pl.P(0, L.YO0)[1] - 0.9, '後退線');
      } const nb = pl.P(L.XO1 + 900, L.Y_BND_N); svg.text(nb[0] + 0.8, nb[1] + 0.7, '隣地境界');
    }
    if (floor > 0 && floor < n && L.FLOOR_OPEN[floor]) { const o = L.FLOOR_OPEN[floor], a = pl.P(o[2] - 120, (o[1] + o[3]) / 2 + 300); lleader(svg, a, [lx + 1.0, a[1] - 3.5], '床の開口', { sub: fmtmm(o[2] - o[0]) + '×' + fmtmm(o[3] - o[1]) }); }
    if (floor === n - 1 && L.SKYLIGHT) { const a = pl.P(L.SKYLIGHT[2] - 120, L.SKYLIGHT[1] + 150); lleader(svg, a, [lx + 1.0, a[1] + 9.5], '天窓（上部）'); }
    if (floor === n && L.SKYLIGHT) { const a = pl.P(L.SKYLIGHT[2] - 150, (L.SKYLIGHT[1] + L.SKYLIGHT[3]) / 2); lleader(svg, a, [lx + 1.0, a[1] + 1.0], '天窓', { sub: fmtmm(L.SKYLIGHT[2] - L.SKYLIGHT[0]) + '×' + fmtmm(L.SKYLIGHT[3] - L.SKYLIGHT[1]) }); const a2 = pl.P(L.XI1 + 30, L.Y_N - 1100); lleader(svg, a2, [lx + 1.0, pl.P(0, L.Y_N - 1100)[1] - 3.0], 'パラペット', { sub: 'H' + fmtmm(L.PARAPET_H) }); }
    return pl;
  }
  function drawYGrid() {
    const left = OX[0], xsEnd = OX[OX.length - 1] + L.X_E / SCALE + 12, yp = (y) => OY - y / SCALE;
    M.Y.forEach((y, i) => { svg.open('ad-grid'); svg.line(left - 22.6, yp(y), xsEnd, yp(y), { w: W_FINE, kind: 'chain' }); svg.close(); lgridBubble(svg, left - 25, yp(y), L.gridIds.y[i] || ('Y' + (i + 1))); });
    ldimChain(svg, M.Y.map(yp), 'y', left - 8.5, { extFrom: left - 1.5, labels: M.Y.slice(1).map((y, i) => fmtmm(y - M.Y[i])) });
    ldimChain(svg, [yp(M.Y[0]), yp(L.Y_N)], 'y', left - 13.5, { labels: [fmtmm(L.Y_N - M.Y[0])] });
    ldimChain(svg, [yp(L.Y_ALLEY_FAR), yp(L.Y_BND_S), yp(L.YO0)], 'y', left - 13.5, { extFrom: [left - 7.5, left - 7.5, left - 1.5], labels: [fmtmm(L.ALLEY_W), fmtmm(L.SETBACK)] });
  }
  const openingText = (o) => (o.ptype === 'shop_slide' ? '引違い戸' : '引違い窓') + ' ' + (o.panels || 2) + ' 枚 W' + fmtmm(o.b - o.a) + '　H' + fmtmm(o.head - o.sill);
  function drawTable(y0) {
    const south = [], north = [];
    for (let fl = 0; fl < n; fl++) { const so = L.OPENINGS.filter(o => o.floor === fl && o.wside === 'S'), no = L.OPENINGS.filter(o => o.floor === fl && o.wside === 'N'); south[fl] = so.map(o => openingText(o) + (o.fire ? '　防火設備' : '')).join('・') || '—'; north[fl] = no.length ? '小窓 ' + no.map(o => fmtmm(o.b - o.a) + '×' + fmtmm(o.head - o.sill)).join('・') : '—'; }
    const conn = [];
    for (let fl = 0; fl < n; fl++) { const up = L.FLIGHTS.find(f => f.base === fl), o = L.FLOOR_OPEN[fl], parts = []; if (up) parts.push('階段 ' + up.n + ' 段で ' + NAMES[fl + 1] + 'へ' + (fl === 0 ? '（蹴上 ' + fmtmm(up.rise) + '）' : '')); if (o) parts.push('床の開口 ' + fmtmm(o[2] - o[0]) + '×' + fmtmm(o[3] - o[1])); if (fl === n - 1 && L.SKYLIGHT) parts.push('上部に天窓'); conn[fl] = parts.join('・') || '—'; }
    conn[n] = L.SKYLIGHT ? '天窓 ' + fmtmm(L.SKYLIGHT[2] - L.SKYLIGHT[0]) + '×' + fmtmm(L.SKYLIGHT[3] - L.SKYLIGHT[1]) + '（階段の真上）' : '—';
    const area = L.floorArea().toFixed(2) + ' m²', col = (f) => f, rows = [
      ['用途', FLOORS.map(fl => fl < n ? (L.USES[fl] || '—') : '屋上' + (L.SKYLIGHT ? '・天窓' : ''))],
      ['床面積（芯々）', FLOORS.map(fl => fl < n ? area : '—')],
      ['天井高', FLOORS.map(fl => fl < n ? fmtmm(L.CH[fl]) : 'パラペット ' + fmtmm(L.PARAPET_H))],
      ['南の開口' + (L.noAlley ? '' : '（延焼ラインの内）'), FLOORS.map(fl => fl < n ? south[fl] : '—')],
      ['北の開口', FLOORS.map(fl => fl < n ? north[fl] : '—')],
      ['上下のつながり', conn]];
    const rh = 6.2, xLabel = 15, xRight = OX[OX.length - 1] + L.X_E / SCALE + 18;
    svg.line(xLabel, y0, xRight, y0, { w: W_SEEN });
    rows.forEach(([lab, vals], i) => { const yb = y0 + (i + 1) * rh; svg.text(xLabel, yb - 1.9, lab, { weight: 700 }); FLOORS.forEach((fl, j) => svg.text(OX[j] - 0.75, yb - 1.9, col(vals[j]))); svg.line(xLabel, yb, xRight, yb, { w: i < rows.length - 1 ? W_FINE : W_SEEN }); });
    return y0 + rows.length * rh;
  }
  drawYGrid(); FLOORS.forEach((fl, i) => drawPlan(i, fl));
  const tableY = Math.max(186 + DY, OY + (-L.Y_ALLEY_FAR) / SCALE + 12), tEnd = drawTable(tableY);
  lnorth(svg, SHEET_W - 20, 72 + DY); lscaleBar(svg, 15, tEnd + 14, SCALE, 5, 1);
  if (opt.title !== false) {
    svg.text(15, tEnd + 28, opt.title || ('図1　階の並べ図（各階平面図 1:' + SCALE + '）'), { size: T_TITLE, weight: 700, cls: 'ad-title' });
    const cap = opt.caption ? [].concat(opt.caption) : [(n + 1) + ' 枚を同じ縮尺・同じ向き（北が上）・同じ枠（敷地と路地）で並べ、Y の通り芯を ' + (n + 1) + ' 枚に通した。赤の斜線は上下の階をつなぐ所（階段・床の開口・天窓）で、どの階も平面の同じ位置に重なる。',
      (L.noAlley ? '' : '破線は延焼ライン（路地の中心線から 1 階 3 m・2 階以上 5 m）。') + '断面の位置 A・B は積層断面と同じ。' + sourceOf(M) + '。'];
    cap.forEach((s, i) => svg.text(15, tEnd + 35 + i * 5, s));
  }
  return svg.svg(opt.page === false ? { crop: true } : null);
}

/* ═══════════════════════════════ 層の分解図（exploded.py） ═══════════════════════════════
   建物を 5 つの層（構造の軸組・床と階段・外皮・開口・設備の縦の通り）に分け、同じ視点（等角）・同じ枠（敷地）で 6 枚に描く。
   1〜5 枚目は層を 1 つずつ足す連続図で、その枚で加えた層だけを赤、それまでの層を灰の細線にする。6 枚目は全体を黒で隠れ線を消して描く。 */
function figSequence(M, opt) {
  opt = opt || {}; const L = layersModel(M), isoW0 = ((L.X_BND_E - L.X_BND_W) + (L.Y_BND_N - L.Y_ALLEY_FAR)) * Math.cos(Math.PI / 6), SCALE = opt.scale || (isoW0 / 200 > 100 ? (isoW0 / 400 > 100 ? 800 : 400) : 200), SHEET_W = 420, SHEET_H = 297, C30 = Math.cos(Math.PI / 6), S30 = 0.5;
  const CELL_X = [20, 150, 280], ROW_Y = [120, 238], OX_IN_CELL = 38, LAB_DX = 31, n = L.n, FL = L.FL, RFL = L.RFL, TOP = L.TOP;
  const TITLES = ['構造の軸組', '床と階段', L.fireWall ? '外皮（耐火の外壁）' : '外皮（外壁）', '開口', '設備の縦の通り', '重ねた全体'];
  const svg = new LSvg(SHEET_W, SHEET_H, '層の分解図（等角投影 1:' + SCALE + '）', '建物を 5 つの層に分け、同じ視点・同じ枠で 1 層ずつ足した連続図。赤はその枚で加えた層、灰はそれまでの層。');
  const mkAx = (ox, oy) => { const ax = { P: (x, y, z) => [ox + (x - y) * C30 / SCALE, oy - ((x + y) * S30 + z) / SCALE] }; ax.line = (a, b, o) => { const p = ax.P(...a), q = ax.P(...b); svg.line(p[0], p[1], q[0], q[1], o); }; ax.poly = (pts, o) => svg.poly(pts.map(p => ax.P(...p)), o); ax.hrect = (x0, y0, x1, y1, z, o) => ax.poly([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], o); return ax; };
  const Style = (kind) => ({ kind, color: { new: ACCENT, old: GREY, all: INK }[kind], main: kind !== 'old' ? W_MID : W_FINE, sub: kind !== 'old' ? W_FAR : W_FINE, showHidden: kind === 'new', kw(main) { return { w: main === false ? this.sub : this.main, color: this.color }; }, hid() { return { w: this.kind !== 'old' ? W_FAR : W_FINE, color: this.color, kind: 'hidden' }; } });
  const openingsOf = (side) => L.OPENINGS.filter(o => o.wside === side), zz = (o) => [FL[o.floor] + o.sill, FL[o.floor] + o.head];
  const beamLevels = () => { const zb = {}; for (let i = 1; i < n; i++) zb[i] = FL[i] - 43; zb[n] = RFL - 40; return zb; };
  // 層 1：構造の軸組
  function drawStructure(ax, st) {
    const k = st.kw(), ks = st.kw(false), zb = beamLevels(), top = zb[n], X_E = L.X_E, Y_N = L.Y_N, X0 = M.X[0], Y0 = M.Y[0];
    ax.poly([[X0, Y0, L.STEM_TOP_S], [X_E, Y0, L.STEM_TOP_S]], Object.assign({ closed: false }, ks));
    ax.poly([[X_E, Y0, L.STEM_TOP], [X_E, Y_N, L.STEM_TOP], [X0, Y_N, L.STEM_TOP], [X0, Y0, L.STEM_TOP]], Object.assign({ closed: false }, ks));
    ax.poly([[L.XO1, L.YO0, 0], [L.XO0, L.YO0, 0], [L.XO0, L.YO1, 0]], Object.assign({ closed: false }, ks));
    for (const [x, y] of [[L.XO0, L.YO0], [L.XO1, L.YO0], [L.XO0, L.YO1]]) ax.line([x, y, 0], [x, y, y < Y0 ? L.STEM_TOP_S : L.STEM_TOP], ks);
    for (const [x, y] of L.POSTS) { const z0 = y === Y0 ? L.STEM_TOP_S : L.STEM_TOP, isC = L.CORNER_POSTS.some(c => c[0] === x && c[1] === y); ax.line([x, y, z0], [x, y, top], { w: (isC || y === Y0) ? st.main : st.sub, color: st.color }); }
    const opens = {}; for (let i = 1; i < n; i++) opens[i] = L.FLOOR_OPEN[i] || null; opens[n] = L.SKYLIGHT;
    for (const lv in zb) { const z = zb[lv]; ax.hrect(X0, Y0, X_E, Y_N, z, k); for (const [y, cut] of L.BEAMS[lv]) ax.line([X0, y, z], [cut ? L.TRIMMER_X : X_E, y, z], ks); const o = opens[lv]; if (o) ax.line([L.TRIMMER_X, o[1] - 60, z], [L.TRIMMER_X, o[3] + 60, z], ks); }
    const levels = [L.STEM_TOP]; for (let i = 1; i <= n; i++) levels.push(zb[i]);
    for (let i = 0; i < n; i++) { const z0 = levels[i], z1 = levels[i + 1]; for (const x of [X0, X_E]) for (const [y0, y1] of L.BRACE_BAYS) { ax.line([x, y0, z0], [x, y1, z1], ks); ax.line([x, y1, z0], [x, y0, z1], ks); } for (const [x0, x1] of L.braceBaysN(i)) { ax.line([x0, Y_N, z0], [x1, Y_N, z1], ks); ax.line([x1, Y_N, z0], [x0, Y_N, z1], ks); } }
    const sO = openingsOf('S'), xa = sO.length ? Math.min(...sO.map(o => o.a)) - 60 : X0 + 900;
    return [[[X0, Y0, zb[Math.min(2, n)] + 600], '通し柱 120 角'], [[xa, Y0, zb[1] - 900], '門型フレーム（南）'], [[(X0 + X_E) / 2, Y0 + 2250, zb[Math.min(2, n)]], '床梁 120×330'], [[X0, Y0 + 1350, zb[1] - 1300], '筋かい（東西の壁）'], [[X_E, Y0, 200], 'べた基礎']];
  }
  // 層 2：床と階段
  function plate(ax, st, z, hole, thick) {
    thick = thick == null ? L.FLOOR_ZONE : thick; const k = st.kw(), ks = st.kw(false), x0 = L.XI0, y0 = L.YI0, x1 = L.XI1, y1 = L.YI1;
    ax.hrect(x0, y0, x1, y1, z, k); ax.poly([[x1, y0, z], [x1, y0, z - thick], [x0, y0, z - thick], [x0, y1, z - thick], [x0, y1, z]], Object.assign({ closed: false }, ks)); ax.line([x0, y0, z], [x0, y0, z - thick], ks);
    if (hole) { const [hx0, hy0, hx1, hy1] = hole; ax.hrect(hx0, hy0, hx1, hy1, z, k); svg.clipBegin([ax.P(hx0, hy0, z), ax.P(hx1, hy0, z), ax.P(hx1, hy1, z), ax.P(hx0, hy1, z)]); ax.poly([[hx0, hy1, z - thick], [hx1, hy1, z - thick], [hx1, hy0, z - thick]], Object.assign({ closed: false }, ks)); ax.line([hx1, hy1, z], [hx1, hy1, z - thick], ks); svg.clipEnd(); }
  }
  const flightPts = (fl, x) => { const pts = [[x, fl.y_start, fl.z0]]; let y = fl.y_start; for (let k = 1; k <= fl.n; k++) { const z = fl.z0 + k * fl.rise; pts.push([x, y, z]); if (k < fl.n) { y += fl.dir * fl.tread; pts.push([x, y, z]); } } return pts; };
  function drawStairs(ax, st) {
    for (const fl of L.FLIGHTS) {
      const pw = flightPts(fl, fl.x0); ax.poly(pw, { closed: false, w: st.main, color: st.color }); if (st.kind === 'old') continue;
      const pe = flightPts(fl, fl.x1); ax.poly(pe, { closed: false, w: W_FINE, color: st.color });
      for (let i = 1; i < pw.length; i += 2) ax.line(pw[i], [fl.x1, pw[i][1], pw[i][2]], { w: W_FINE, color: st.color });
      ax.line([fl.x0, fl.y_start, fl.z0], [fl.x0, fl.y_top, fl.top_level - 250], { w: st.sub, color: st.color });
    }
  }
  function drawFloors(ax, st) {
    plate(ax, st, FL[0], null, 200); for (let i = 1; i < n; i++) plate(ax, st, FL[i], L.FLOOR_OPEN[i] || null); plate(ax, st, RFL, L.SKYLIGHT); drawStairs(ax, st);
    const out = [[[M.X[0] + 1500, M.Y[0] + 1500, FL[0]], '土間 ' + L.ids[0] + 'L+' + fmtmm(FL[0])]];
    for (let i = 1; i < n; i++) out.push([[M.X[0] + 1500, M.Y[0] + 600, FL[i]], L.ids[i].replace(/F$/, ' 階') + 'の床 FL+' + fmtmm(FL[i])]);
    out.push([[M.X[0] + 1500, M.Y[0] + 600, RFL], '屋根 RFL+' + fmtmm(RFL)]);
    if (L.FLIGHTS.length) out.push([[L.STAIR_X0, L.FLIGHTS[0].y_start + L.FLIGHTS[0].dir * 1050, FL[0] + 1200], (L.FLIGHTS.length > 1 ? '重ねた直階段' : '直階段') + ' W' + fmtmm(L.STAIR_X1 - L.STAIR_X0)]);
    const o2 = L.FLOOR_OPEN[1]; if (o2) out.push([[L.STAIR_X1, (o2[1] + o2[3]) / 2, FL[1]], '床の開口 ' + fmtmm(o2[2] - o2[0]) + '×' + fmtmm(o2[3] - o2[1])]);
    return out;
  }
  // 層 3：外皮
  function wallFace(ax, st, plane, fixed, a0, a1, z0, z1, holes, hidden) {
    if (hidden && !st.showHidden) return; const kw = hidden ? st.hid() : st.kw(), Q = (a, z) => plane === 'y' ? [a, fixed, z] : [fixed, a, z];
    ax.poly([Q(a0, z0), Q(a1, z0), Q(a1, z1), Q(a0, z1)], kw); const kh = Object.assign({}, kw, { w: hidden ? kw.w : st.sub });
    for (const [h0, h1, hz0, hz1] of holes) ax.poly([Q(h0, hz0), Q(h1, hz0), Q(h1, hz1), Q(h0, hz1)], kh);
  }
  function drawEnvelope(ax, st) {
    const z0 = FL[0], z1 = TOP, hS = openingsOf('S').map(o => [o.a, o.b].concat(zz(o))), hN = openingsOf('N').map(o => [o.a, o.b].concat(zz(o))), hW = openingsOf('W').map(o => [o.a, o.b].concat(zz(o))), hE = openingsOf('E').map(o => [o.a, o.b].concat(zz(o)));
    wallFace(ax, st, 'y', L.YO1, L.XO0, L.XO1, z0, z1, hN, true); wallFace(ax, st, 'x', L.XO1, L.YO0, L.YO1, z0, z1, hE, true); wallFace(ax, st, 'x', L.XO0, L.YO0, L.YO1, z0, z1, hW, false); wallFace(ax, st, 'y', L.YO0, L.XO0, L.XO1, z0, z1, hS, false);
    const ks = st.kw(false); ax.hrect(L.XI0, L.YI0, L.XI1, L.YI1, z1, ks); ax.line([L.XI0, L.YI1, z1], [L.XI0, L.YI1, RFL], ks); ax.line([L.XI1, L.YI1, z1], [L.XI1, L.YI1, RFL], ks); ax.line([L.XI1, L.YI0, z1], [L.XI1, L.YI0, RFL], ks);
    ax.poly([[L.XI1, L.YI0, RFL], [L.XI1, L.YI1, RFL], [L.XI0, L.YI1, RFL]], Object.assign({ closed: false }, ks));
    for (let i = 1; i < n; i++) { const z = FL[i] - L.FLOOR_ZONE / 2; ax.poly([[L.XO1, L.YO0, z], [L.XO0, L.YO0, z], [L.XO0, L.YO1, z]], { closed: false, w: W_FINE, color: st.color }); }
    return [[[L.X_E - 450, L.YO0, FL[n - 1] - 200], (L.noAlley ? '南の外壁' : '路地側の外壁') + (L.fireWall ? '（耐火）' : '')], [[L.XO0, M.Y[0] + (L.Y_N - M.Y[0]) * 0.69, FL[n - 1] - 200], '西の外壁 ' + fmtmm(M.tw) + (L.fireWall ? '（耐火）' : '')], [[L.XO0, M.Y[0] + (L.Y_N - M.Y[0]) * 0.49, TOP], 'パラペット H' + fmtmm(L.PARAPET_H)], [[L.XI1, M.Y[0] + (L.Y_N - M.Y[0]) * 0.81, RFL], '屋上の防水']];
  }
  // 層 4：開口
  function drawOpenings(ax, st) {
    const k = st.kw(), ks = st.kw(false);
    for (const o of L.OPENINGS) {
      if (o.wside !== 'S' && o.wside !== 'N') continue; const [z0, z1] = zz(o), hidden = o.wside === 'N'; if (hidden && !st.showHidden) continue;
      const y = o.wside === 'S' ? M.Y[0] : L.Y_N, kk = hidden ? st.hid() : k, km = hidden ? st.hid() : ks;
      ax.poly([[o.a, y, z0], [o.b, y, z0], [o.b, y, z1], [o.a, y, z1]], kk); const np = o.panels || 2; for (let i = 1; i < np; i++) { const xm = o.a + (o.b - o.a) * i / np; ax.line([xm, y, z0], [xm, y, z1], km); }
      if (o.rail) ax.line([o.a, y - 195, z0 + 1100], [o.b, y - 195, z0 + 1100], ks);
      if (o.kind === 'shop') ax.hrect(o.a, y - 295, o.b, y - 75, z1 + 300, ks);
    }
    if (L.SKYLIGHT) { const [x0, y0, x1, y1] = L.SKYLIGHT, zt = RFL + 200; ax.hrect(x0 - 100, y0 - 100, x1, y1 + 100, zt, k); ax.line([x0 - 100, (y0 + y1) / 2, zt], [x1, (y0 + y1) / 2, zt], ks); for (const [x, y] of [[x0 - 100, y0 - 100], [x1, y0 - 100], [x0 - 100, y1 + 100]]) ax.line([x, y, RFL], [x, y, zt], ks); }
    const sO = openingsOf('S'), s1 = sO.find(o => o.floor === 1) || sO[0], s0 = sO.find(o => o.floor === 0), nO = openingsOf('N'), n2 = nO.filter(o => o.floor === n - 1).slice(-1)[0] || nO[0], out = [];
    if (s1) out.push([[s1.a + 400, M.Y[0], FL[s1.floor] + 1500], s1.fire ? '南の窓（防火設備）' : '南の窓']); if (s0) out.push([[s0.b - 400, M.Y[0], FL[0] + 1100], s0.kind === 'shop' ? '店先の引違い戸' : '南の開口']);
    if (n2) out.push([[(n2.a + n2.b) / 2, L.Y_N, zz(n2)[1]], '北の小窓']); if (L.SKYLIGHT) out.push([[L.SKYLIGHT[2], (L.SKYLIGHT[1] + L.SKYLIGHT[3]) / 2, RFL + 200], '天窓（階段の上）']);
    return out;
  }
  // 層 5：設備の縦の通り
  const box = (ax, st, x0, y0, z0, x1, y1, z1, main) => { const kw = st.kw(!!main); ax.hrect(x0, y0, x1, y1, z1, kw); ax.poly([[x1, y0, z1], [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1]], Object.assign({ closed: false }, kw)); ax.line([x0, y0, z0], [x0, y0, z1], kw); };
  const fixtureBoxes = () => { const out = []; for (let fl = 0; fl < n; fl++) for (const fx of L.FIXTURES[fl]) { const t = fx.type; if (['counter', 'tub', 'vanity', 'washer'].indexOf(t) >= 0) out.push([fl, fx.rect, { counter: 850, tub: 550, vanity: 800, washer: 900 }[t], t]); else if (t === 'toilet') { const d = fx.rot === 180 ? -1 : 1; out.push([fl, [fx.x - 230, Math.min(fx.y, fx.y + d * 700), fx.x + 230, Math.max(fx.y, fx.y + d * 700)], 400, t]); } } return out; };
  function drawServices(ax, st) {
    const k = st.kw(), ks = st.kw(false), [sx, sy] = L.STACK, [wx, wy] = L.SUPPLY;
    ax.line([sx, sy, -450], [sx, sy, RFL + 600], k); ax.line([wx, wy, -300], [wx, wy, FL[n - 1] + 600], k); ax.hrect(sx - 90, sy - 90, sx + 90, sy + 90, RFL + 600, ks);
    ax.line([sx, sy, -450], [sx, L.Y_BND_S + 300, -450], k); ax.line([wx, wy, -300], [wx, L.Y_BND_S + 300, -300], ks);
    box(ax, st, sx - 200, L.Y_BND_S - 100, -600, sx + 200, L.Y_BND_S + 300, 0);
    const [dx, dy] = L.ROOF_DRAIN; ax.poly([[dx, dy, RFL], [dx, dy, RFL - 250], [sx, dy, RFL - 250], [sx, sy, RFL - 250]], Object.assign({ closed: false }, ks));
    const anchors = {};
    for (const [fl, [x0, y0, x1, y1], h, t] of fixtureBoxes()) { const z = FL[fl]; box(ax, st, x0, y0, z, x1, y1, z + h); const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; ax.poly([[cx, cy, z + 80], [sx, cy, z + 80], [sx, sy, z + 80]], Object.assign({ closed: false }, ks)); if (!anchors[fl + ':' + t]) anchors[fl + ':' + t] = [t === 'counter' ? x1 : cx, cy, z + h]; }
    for (const [x, z] of [[M.X[0] + 800, FL[0] + 2300], [M.X[0] + 2850, FL[Math.min(1, n - 1)] + 2100]]) { ax.line([x, L.Y_N - 500, z], [x, L.YO1, z], ks); ax.hrect(x - 80, L.YO1, x + 80, L.YO1 + 120, z, ks); }
    const out = [[[sx, sy, FL[Math.min(1, n - 1)] + 1500], '排水・通気の立て管'], [[sx, sy, RFL + 600], '通気管（屋上へ）']];
    const PREF = ['tub', 'counter', 'toilet', 'vanity', 'washer'], NM = { tub: '浴室・洗面', counter: '台所', toilet: '便所', vanity: '洗面', washer: '洗濯' };
    for (let fl = n - 1; fl >= 0; fl--) { const t = PREF.find(tt => anchors[fl + ':' + tt]); if (t) out.push([anchors[fl + ':' + t], NM[t] + '（' + L.ids[fl].replace(/F$/, ' 階') + '）']); }
    out.push([[sx, L.Y_BND_S + 100, 0], L.noAlley ? '敷地の外へ' : '路地の下水へ']); return out;
  }
  const LAYERS = [drawStructure, drawFloors, drawEnvelope, drawOpenings, drawServices];
  // 6 枚目：重ねた全体（隠れ線を消す）
  const fillFace = (ax, outer, holes, w) => { const ring = (pts) => 'M' + pts.map(p => { const q = ax.P(...p); return fmt(q[0]) + ',' + fmt(q[1]); }).join(' L') + ' Z'; svg.path(ring(outer) + (holes || []).map(h => ' ' + ring(h)).join(''), { w: w == null ? W_MID : w, fill: WHITE, fillRule: 'evenodd' }); };
  function drawWhole(ax) {
    const kf = { w: W_FINE }, corners = []; for (const x of [L.XO0, L.XO1]) for (const y of [L.YO0, L.YO1]) for (const z of [0, TOP]) corners.push(ax.P(x, y, z));
    svg.poly(convexHull(corners), { w: 0, fill: WHITE });
    fillFace(ax, [[L.XI0, L.YI0, RFL], [L.XI1, L.YI0, RFL], [L.XI1, L.YI1, RFL], [L.XI0, L.YI1, RFL]], [], W_FINE);
    if (L.SKYLIGHT) { const [x0, y0, x1, y1] = L.SKYLIGHT, zt = RFL + 200, tx0 = x0 - 100, ty0 = y0 - 100, tx1 = x1, ty1 = y1 + 100; fillFace(ax, [[tx0, ty0, RFL], [tx1, ty0, RFL], [tx1, ty0, zt], [tx0, ty0, zt]], [], W_FINE); fillFace(ax, [[tx0, ty0, RFL], [tx0, ty1, RFL], [tx0, ty1, zt], [tx0, ty0, zt]], [], W_FINE); fillFace(ax, [[tx0, ty0, zt], [tx1, ty0, zt], [tx1, ty1, zt], [tx0, ty1, zt]], [], W_FINE); ax.line([tx0, (y0 + y1) / 2, zt], [tx1, (y0 + y1) / 2, zt], kf); }
    fillFace(ax, [[L.XI0, L.YI1, RFL], [L.XI1, L.YI1, RFL], [L.XI1, L.YI1, TOP], [L.XI0, L.YI1, TOP]], [], W_FINE); fillFace(ax, [[L.XI1, L.YI0, RFL], [L.XI1, L.YI1, RFL], [L.XI1, L.YI1, TOP], [L.XI1, L.YI0, TOP]], [], W_FINE);
    fillFace(ax, [[L.XO0, L.YO0, TOP], [L.XO1, L.YO0, TOP], [L.XO1, L.YO1, TOP], [L.XO0, L.YO1, TOP]], [[[L.XI0, L.YI0, TOP], [L.XI1, L.YI0, TOP], [L.XI1, L.YI1, TOP], [L.XI0, L.YI1, TOP]]], W_SEEN);
    const hW = openingsOf('W').map(o => { const [za, zb] = zz(o); return [[L.XO0, o.a, za], [L.XO0, o.b, za], [L.XO0, o.b, zb], [L.XO0, o.a, zb]]; });
    fillFace(ax, [[L.XO0, L.YO0, 0], [L.XO0, L.YO1, 0], [L.XO0, L.YO1, TOP], [L.XO0, L.YO0, TOP]], hW, W_MID);
    const sO = openingsOf('S'), holes = sO.map(o => { const [za, zb] = zz(o); return [[o.a, L.YO0, za], [o.b, L.YO0, za], [o.b, L.YO0, zb], [o.a, L.YO0, zb]]; });
    fillFace(ax, [[L.XO0, L.YO0, 0], [L.XO1, L.YO0, 0], [L.XO1, L.YO0, TOP], [L.XO0, L.YO0, TOP]], holes, W_MID);
    for (let i = 1; i < n; i++) { const z = FL[i] - L.FLOOR_ZONE / 2; ax.poly([[L.XO1, L.YO0, z], [L.XO0, L.YO0, z], [L.XO0, L.YO1, z]], { closed: false, w: W_FINE }); }
    ax.poly([[L.XO1, L.YO0, FL[0]], [L.XO0, L.YO0, FL[0]], [L.XO0, L.YO1, FL[0]]], { closed: false, w: W_FINE });
    sO.forEach((o, i) => { const [za, zb] = zz(o), h = holes[i]; svg.clipBegin(h.map(p => ax.P(...p))); const d = M.Y[0] + L.H; ax.poly([[o.a, d, za], [o.b, d, za], [o.b, d, zb], [o.a, d, zb]], { w: W_SEEN }); const np = o.panels || 2; for (let j = 1; j < np; j++) { const xm = o.a + (o.b - o.a) * j / np; ax.line([xm, d, za], [xm, d, zb], kf); } ax.line([o.a, L.YO0, za], [o.a, d, za], kf); svg.clipEnd(); if (o.rail) { ax.line([o.a, L.YO0 - 120, za + 1100], [o.b, L.YO0 - 120, za + 1100], { w: W_SEEN }); for (const x of [o.a, o.b]) ax.line([x, L.YO0 - 120, za], [x, L.YO0 - 120, za + 1100], kf); } });
    const out = [[[(M.X[0] + L.X_E) / 2, L.YO0, FL[0] + 1200], L.noAlley ? '南' : '路地側（南）'], [[L.XO0, M.Y[0] + (L.Y_N - M.Y[0]) * 0.74, FL[Math.min(1, n - 1)] + 600], '西の外壁']];
    if (L.SKYLIGHT) out.push([[L.SKYLIGHT[0] - 100, (L.SKYLIGHT[1] + L.SKYLIGHT[3]) / 2, RFL + 200], '天窓']); out.push([[M.X[0] + 1500, L.YO0, TOP], '最高高さ GL+' + fmtmm(TOP)]); return out;
  }
  const siteFrame = (ax) => { const g = { w: W_FINE, color: GREY }; ax.poly([[L.X_BND_W, L.Y_BND_S, 0], [L.X_BND_E, L.Y_BND_S, 0], [L.X_BND_E, L.Y_BND_N, 0], [L.X_BND_W, L.Y_BND_N, 0]], g); ax.line([L.X_BND_W - 1200, L.Y_BND_S, 0], [L.X_BND_E + 1200, L.Y_BND_S, 0], { w: W_FINE, color: GREY, kind: 'phantom' }); };
  const segCross = (p1, p2, p3, p4) => { const c = (a, b, q) => (q[1] - a[1]) * (b[0] - a[0]) - (b[1] - a[1]) * (q[0] - a[0]); const d1 = c(p3, p4, p1), d2 = c(p3, p4, p2), d3 = c(p1, p2, p3), d4 = c(p1, p2, p4); return d1 * d2 < 0 && d3 * d4 < 0; };
  /* 引出線のラベルを右の列にそろえ、重ならないよう間を空け、交わる引出線は入れ替える */
  function placeLabelsSeq(ax, items, xLab, yMin, yMax, spacing) {
    spacing = spacing || 5.2; const pts = items.map(([p3, text]) => ({ a: ax.P(...p3), y: ax.P(...p3)[1], text })).sort((p, q) => p.y - q.y); let ys = [];
    for (const t of pts) ys.push(Math.max(t.y, ys.length ? ys[ys.length - 1] + spacing : yMin));
    const over = ys.length ? ys[ys.length - 1] - yMax : 0; if (over > 0) { ys = ys.map(y => y - over); for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + spacing); }
    for (let it = 0; it < 20; it++) { let swapped = false; for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (segCross(pts[i].a, [xLab - 2.6, ys[i]], pts[j].a, [xLab - 2.6, ys[j]])) { [ys[i], ys[j]] = [ys[j], ys[i]]; swapped = true; } if (!swapped) break; }
    pts.forEach((t, i) => lleader(svg, t.a, [xLab - 2.6, ys[i]], t.text));
  }
  function drawCell(idx) {
    const col = idx % 3, row = Math.floor(idx / 3), ox = CELL_X[col] + OX_IN_CELL, oy = ROW_Y[row], ax = mkAx(ox, oy);
    siteFrame(ax); let items;
    if (idx < 5) { for (let j = 0; j < idx; j++) LAYERS[j](ax, Style('old')); items = LAYERS[idx](ax, Style('new')); } else items = drawWhole(ax);
    placeLabelsSeq(ax, items, ox + LAB_DX, oy - 84, oy - 2);
    const nS = openingsOf('S').length, nN = openingsOf('N').length, nFire = openingsOf('S').filter(o => o.fire).length, subs = ['柱 120 角・床梁 120×330 @900・筋かい（判断）', L.ids[0] + ' の床・' + L.ids.slice(1).map(s => s.replace(/F$/, ' 階')).join('・') + '・屋根と、同じ位置に重ねた階段', '外壁 ' + fmtmm(M.tw) + '・パラペット ' + fmtmm(L.PARAPET_H), '南 ' + nS + ' か所' + (nFire ? '（防火設備 ' + nFire + '）' : '') + '・北 ' + nN + ' か所' + (L.SKYLIGHT ? '・天窓' : ''), '水回りの排水を西の壁沿いの立て管 1 本で' + (L.noAlley ? '敷地の外へ' : '路地へ') + '（判断）', '1〜5 を重ねた建物　最高高さ GL+' + fmtmm(TOP)];
    const hx = ox - 34; svg.text(hx, oy + 9, (idx + 1) + '　' + TITLES[idx], { size: T_ROOM, weight: 700 }); svg.text(hx, oy + 13.2, subs[idx]);
  }
  svg.open('ad-visible'); for (let i = 0; i < 6; i++) drawCell(i); svg.close();
  for (let i = 0; i < 5; i++) { const col = i % 3, row = Math.floor(i / 3), sym = i === 4 ? '＝' : '＋'; let x, y; if (col < 2) { x = CELL_X[col + 1] - 6; y = ROW_Y[row] - 40; } else { x = CELL_X[0] - 8; y = ROW_Y[1] - 40; } svg.text(x, y, sym, { size: T_TITLE, weight: 700, anchor: 'middle' }); }
  lscaleBar(svg, 300, 270, SCALE, 10, 2); svg.text(354, 270, '軸の向きの縮尺 1:' + SCALE);
  if (opt.title !== false) {
    svg.text(20, 272, opt.title || ('図2　層の分解図（等角投影、軸の向きで 1:' + SCALE + '）'), { size: T_TITLE, weight: 700, cls: 'ad-title' });
    const cap = opt.caption ? [].concat(opt.caption) : ['住戸を構造の軸組・床と階段・外皮（耐火の外壁）・開口・設備の縦の通りの 5 層に分け、同じ視点と同じ枠（敷地）で 1 層ずつ足した。赤はその枚で足した層、灰はそれまでの層、6 枚目は 5 層を重ねた全体である。', '奥の面（北・東）の赤は破線。南西から見下ろす。' + sourceOf(M) + '（軸組・床の層・立て管は判断）'];
    cap.forEach((s, i) => svg.text(20, 279 + i * 5, s));
  }
  return svg.svg(opt.page === false ? { crop: true } : null);
}

/* ═══════════════════════════════ 積層断面 B–B′（stacksection.py） ═══════════════════════════════
   階段を通る断面（西を見る）で切り、階ごとの用途・レベル・天井高を重ねる。右の列には各階の帯を断面と同じ高さでそろえて置く。
   赤は「上下の階をつなぐ所」（切断した段板・奥の桁と手すり・天窓・縦の通りの斜線）だけ。 */
function figStack(M, opt) {
  opt = opt || {}; const L = layersModel(M), big = (L.TOP > 11000 || (L.Y_BND_N - L.Y_ALLEY_FAR) > 17000), SCALE = opt.scale || (big ? 100 : 50), SHEET_W = 420, SHEET_H = 297, n = L.n, FL = L.FL, RFL = L.RFL, TOP = L.TOP;
  const sec = (opt.section && M.sections[opt.section]) || M.sections.B, X_CUT = (sec && sec.axis === 'y') ? sec.at : L.SECTION_B_X, lookW = !sec || sec.look !== 'E';
  const Y_MIN = L.Y_ALLEY_FAR - 875, Y_MAX = L.Y_BND_N + 1225, depth = Y_MAX - Y_MIN, OX = 134 - (depth - 13800) / SCALE / 2, OY = 216, COL_X0 = 334, COL_X1 = 404;
  const OPP_FACE = L.Y_ALLEY_FAR - 75, NB_FACE = L.Y_BND_N + 500;
  const FIX_H = { bench: [0, 750], shelf: [0, 1800], shoebox: [0, 900], fridge: [0, 1800], counter: [0, 850], hood: [1800, 2350], table: [0, 700], sofa: [0, 750], lowtable: [0, 350], tvboard: [0, 450], bed: [0, 450], desk: [0, 720], wardrobe: [0, 1800], tub: [0, 550], vanity: [0, 800], washer: [0, 900] };
  const svg = new LSvg(SHEET_W, SHEET_H, '積層断面 B-B′（1:' + SCALE + '）', '階段を通り西を見る断面に、階ごとの用途・レベル・天井高を重ねた。赤は上下の階をつなぐ階段と天窓。');
  const P = (y, z) => [OX + y / SCALE, OY - z / SCALE], pts = (seq) => seq.map(([y, z]) => P(y, z));
  const rect = (y0, z0, y1, z1, o) => svg.poly(pts([[y0, z0], [y1, z0], [y1, z1], [y0, z1]]), o), line = (y0, z0, y1, z1, o) => { const a = P(y0, z0), b = P(y1, z1); svg.line(a[0], a[1], b[0], b[1], o); };
  const woodX = (y0, z0, y1, z1, w, color) => { rect(y0, z0, y1, z1, { w: w == null ? W_SEEN : w, color, fill: WHITE }); line(y0, z0, y1, z1, { w: W_FINE, color }); line(y0, z1, y1, z0, { w: W_FINE, color }); };
  const zigzag = (y0, y1, z0, z1, pitch, vertical) => { pitch = pitch || 60; const seq = []; if (vertical !== false) { const k = Math.max(2, Math.floor((z1 - z0) / pitch)); for (let i = 0; i <= k; i++) seq.push([i % 2 === 0 ? y0 : y1, z0 + (z1 - z0) * i / k]); } else { const k = Math.max(2, Math.floor((y1 - y0) / pitch)); for (let i = 0; i <= k; i++) seq.push([y0 + (y1 - y0) * i / k, i % 2 === 0 ? z0 : z1]); } svg.poly(pts(seq), { w: W_FINE, closed: false }); };
  // 地盤と基礎
  svg.open('ad-ground-hatch'); svg.hatch(pts([[Y_MIN, 0], [Y_MAX, 0], [Y_MAX, -520], [Y_MIN, -520]]), { angle: 45, spacing: 0.9 }); svg.close();
  svg.open('ad-ground'); line(Y_MIN, 0, L.YO0, 0, { w: W_GROUND }); line(L.YO1, 0, Y_MAX, 0, { w: W_GROUND }); svg.close();
  // 文脈（灰）：向かいの住宅・北の隣家
  const nbS = M.neighbors.some(nb => nb.side === 'S') && !L.noAlley, nbN = M.neighbors.some(nb => nb.side === 'N');
  (function context() { const g = { w: W_SEEN, color: GREY }, eave = 5600, over = 450, roofZ = eave + (OPP_FACE + over - Y_MIN) * 0.4; svg.open('ad-context');
    if (nbS) { svg.poly(pts([[OPP_FACE, 0], [OPP_FACE, eave - 120]]), { closed: false, w: W_CUT, color: GREY }); svg.poly(pts([[Y_MIN, roofZ], [OPP_FACE + over, eave - 60], [OPP_FACE + over, eave - 200], [Y_MIN, roofZ - 140]]), Object.assign({ closed: false }, g));
    line(Y_MIN, 0, OPP_FACE, 0, { w: W_GROUND, color: GREY }); line(Y_MIN, 2950, OPP_FACE, 2950, { w: W_FINE, color: GREY }); for (const [z0, z1] of [[900, 2000], [3800, 4900]]) rect(OPP_FACE - 60, z0, OPP_FACE, z1, { w: W_FINE, color: GREY }); }
    if (nbN) { svg.poly(pts([[NB_FACE, 0], [NB_FACE, 5800]]), { closed: false, w: W_CUT, color: GREY }); for (const zr of [5760, 5620]) svg.poly(pts([[NB_FACE - 400, zr], [Y_MAX, zr + (Y_MAX - NB_FACE + 400) * 0.4]]), Object.assign({ closed: false }, g));
    line(NB_FACE, 2950, Y_MAX, 2950, { w: W_FINE, color: GREY }); rect(NB_FACE, 1000, NB_FACE + 60, 2100, { w: W_FINE, color: GREY }); rect(NB_FACE, 3900, NB_FACE + 60, 5000, { w: W_FINE, color: GREY }); } svg.close(); })();
  (function foundation() { svg.open('ad-cut'); const seq = [[L.YO0, L.FOOTING_BOT], [L.YI0, L.FOOTING_BOT], [L.YI0, L.FDN_BOT], [L.YI1, L.FDN_BOT], [L.YI1, L.FOOTING_BOT], [L.YO1, L.FOOTING_BOT], [L.YO1, L.STEM_TOP], [L.YI1, L.STEM_TOP], [L.YI1, L.FDN_TOP], [L.YO0, L.FDN_TOP]], poly = pts(seq);
    svg.poly(poly, { w: 0, fill: WHITE }); svg.hatch(poly, { angle: 45, spacing: 0.7 }); svg.poly(poly, { w: W_CUT });
    rect(L.YI0, L.SUTECON[0], L.YI1, L.SUTECON[1], { w: W_FINE, fill: WHITE }); rect(L.YI0, L.GRAVEL[0], L.YI1, L.GRAVEL[1], { w: W_FINE, fill: WHITE });
    for (let y = L.YI0 + 60, k = 0; y < L.YI1 - 40; y += 130, k++) { const c = P(y, (L.GRAVEL[0] + L.GRAVEL[1]) / 2 + (k % 2 ? 25 : -25)); svg.circle(c[0], c[1], 0.32, { w: W_FINE }); }
    woodX(L.YI1 + 15, L.STEM_TOP, L.YO1 - 15, L.STEM_TOP + L.SILL); woodX(L.YO0 + 15, L.STEM_TOP_S, L.YI0 - 15, L.STEM_TOP_S + L.SILL); svg.close(); })();
  // 見えがかり（奥）：遠い順に白く塗って重ねる
  const seenItems = () => { const out = []; for (let fl = 0; fl < n; fl++) { const z = FL[fl], ceil = z + L.CH[fl];
      for (const w of L.WALLS[fl]) { if (w.kind !== 'part') continue; const [x0, y0, x1, y1] = w.rect; const behind = lookW ? (x1 <= X_CUT && !(x0 <= X_CUT && X_CUT <= x1)) : (x0 >= X_CUT && !(x0 <= X_CUT && X_CUT <= x1)); if (!behind) continue; const d = lookW ? X_CUT - x1 : x0 - X_CUT; const doors = L.DOORS.filter(dd => dd.floor === fl && dd.wall === w.id); if ((y1 - y0) >= (x1 - x0)) out.push([d, fl, 'wall', y0, y1, z, ceil, doors]); else out.push([d, fl, 'wall-end', y0, y1, z, ceil, []]); }
      for (const fx of L.FIXTURES[fl]) { const t = fx.type; if (FIX_H[t] && fx.rect) { const [x0, y0, x1, y1] = fx.rect; if (lookW ? x0 >= X_CUT : x1 <= X_CUT) continue; const [zb, zt] = FIX_H[t], d = lookW ? (x1 > X_CUT ? 0 : X_CUT - x1) : (x0 < X_CUT ? 0 : x0 - X_CUT); out.push([d, fl, t, y0, y1, z + zb, z + zt, fx]); }
        else if (t === 'toilet' || t === 'handbasin') { if (lookW ? fx.x >= X_CUT : fx.x <= X_CUT) continue; let ya, yb, xn; if (fx.rot % 180 === 0) { const d = fx.rot === 0 ? 1 : -1; [ya, yb] = [fx.y, fx.y + d * 700].sort((p, q) => p - q); xn = fx.x + 230; } else { ya = fx.y - 200; yb = fx.y + 200; xn = fx.x; } out.push([Math.abs(X_CUT - xn), fl, t, ya, yb, z + (t === 'toilet' ? 0 : 600), z + (t === 'toilet' ? 400 : 800), fx]); } } }
    return out.sort((a, b) => b[0] - a[0]); };
  svg.open('ad-visible');
  for (const [d, fl, t, y0, y1, z0, z1, extra] of seenItems()) { rect(y0, z0, y1, z1, { w: (t === 'wall' || t === 'wall-end' || d === 0) ? W_SEEN : W_FINE, fill: WHITE }); if (t === 'wall') for (const o of extra) rect(o.a, z0, o.b, z0 + o.head, { w: W_FINE }); if (t === 'bed') line(y0, z0 + 250, y1, z0 + 250, { w: W_FINE }); if (t === 'counter') line(y0, z1 - 40, y1, z1 - 40, { w: W_FINE }); }
  line(L.YI0, TOP - 30, L.YI1, TOP - 30, { w: W_SEEN }); line(L.YI0, TOP, L.YI1, TOP, { w: W_FINE });
  const sy = L.STACK[1]; rect(sy - 40, RFL, sy + 40, RFL + 600, { w: W_SEEN, fill: WHITE }); rect(sy - 90, RFL + 600, sy + 90, RFL + 660, { w: W_SEEN, fill: WHITE });
  svg.close();
  // 床・屋根
  svg.open('ad-cut');
  for (let level = 1; level <= n; level++) {
    const roof = level === n, top = roof ? RFL : FL[level], hole = roof ? L.SKYLIGHT : (L.FLOOR_OPEN[level] || null), spans = hole ? [[L.YI0, hole[1]], [hole[3], L.YI1]] : [[L.YI0, L.YI1]], zone = L.FLOOR_ZONE, tTop = roof ? 40 : 43, tCeil = roof ? 30 : 27, beamTop = top - tTop, beamBot = top - tTop - 330;
    for (const [y0, y1] of spans) { if (y1 <= y0) continue; rect(y0, top - tTop, y1, top, { w: 0, fill: WHITE }); line(y0, top - (roof ? 5 : 15), y1, top - (roof ? 5 : 15), { w: W_FINE }); rect(y0, top - zone, y1, top - zone + tCeil, { w: W_FINE, fill: WHITE }); line(y0, top - zone + tCeil / 2, y1, top - zone + tCeil / 2, { w: W_FINE }); line(y0, top, y1, top, { w: W_CUT }); line(y0, top - tTop, y1, top - tTop, { w: W_FINE }); line(y0, top - zone, y1, top - zone, { w: W_CUT }); if (roof) zigzag(y0 + 30, y1 - 30, beamBot + 40, beamTop - 20, 90, false); }
    for (const [yc, cut] of L.BEAMS[level]) { if (cut) continue; if (hole && yc > hole[1] && yc < hole[3]) continue; woodX(yc - 60, beamBot, yc + 60, beamTop); }
    if (hole) for (const ye of [hole[1], hole[3]]) line(ye, top - zone, ye, top, { w: W_CUT });
  }
  // 外壁（南・北）の切断：層（外装 15・柱と断熱 120・せっこうボード 15）と床の高さの胴差し
  const wallOpenings = (side) => L.OPENINGS.filter(o => o.wside === side && o.a <= X_CUT && X_CUT <= o.b).map(o => [FL[o.floor] + o.sill, FL[o.floor] + o.head, o]).sort((a, b) => a[0] - b[0]);
  for (const side of ['S', 'N']) {
    const yo = side === 'S' ? L.YO0 : L.YO1, yi = side === 'S' ? L.YI0 : L.YI1, sgn = side === 'S' ? 1 : -1, zBase = (side === 'S' ? L.STEM_TOP_S : L.STEM_TOP) + L.SILL, ops = wallOpenings(side), segs = []; let z = zBase;
    for (const [z0, z1] of ops) { if (z0 > z) segs.push([z, z0]); z = z1; } segs.push([z, TOP - 30]);
    const yOutB = yo + sgn * 15, yInB = yi - sgn * 15, ya = Math.min(yOutB, yInB), yb = Math.max(yOutB, yInB), beams = []; for (let i = 1; i < n; i++) beams.push(FL[i] - 43); beams.push(RFL - 40);
    for (const [z0, z1] of segs) { rect(yo, z0, yi, z1, { w: 0, fill: WHITE }); let zz = z0; const cuts = beams.filter(zb => z0 < zb && zb - 330 < z1).map(zb => [Math.max(z0, zb - 330), Math.min(z1, zb)]).sort((a, b) => a[0] - b[0]); for (const [c0, c1] of cuts) { if (c0 > zz + 40) zigzag(ya + 10, yb - 10, zz, c0); woodX(ya, c0, yb, c1); zz = c1; } if (z1 > zz + 40) zigzag(ya + 10, yb - 10, zz, z1); line(yOutB, z0, yOutB, z1, { w: W_FINE }); line(yInB, z0, yInB, z1, { w: W_FINE }); rect(yo, z0, yi, z1, { w: W_CUT }); }
    for (const [z0, z1, o] of ops) { const yc = (yo + yi) / 2; rect(yc - 35, z1 - 45, yc + 35, z1, { w: W_SEEN, fill: WHITE }); rect(yc - 35, z0, yc + 35, z0 + 45, { w: W_SEEN, fill: WHITE }); for (const dy of ((o.panels || 2) >= 2 ? [-18, 18] : [0])) { rect(yc + dy - 14, z0 + 45, yc + dy + 14, z1 - 45, { w: W_FINE, fill: WHITE }); line(yc + dy, z0 + 80, yc + dy, z1 - 80, { w: W_FINE }); } if (o.sill > 0) svg.poly(pts([[yo, z0 - 10], [yo - sgn * 40, z0 - 40], [yo - sgn * 40, z0 - 55], [yo, z0 - 30]]), { w: W_FINE, fill: WHITE }); }
    svg.poly(pts([[yo - sgn * 25, TOP - 60], [yo - sgn * 25, TOP], [yi + sgn * 25, TOP], [yi + sgn * 25, TOP - 60]]), { w: W_SEEN, closed: false }); line(yo, TOP - 30, yi, TOP - 30, { w: W_CUT }); line(yi + sgn * 8, RFL, yi + sgn * 8, RFL + 350, { w: W_FINE });
  }
  // 間仕切りの切断
  for (let fl = 0; fl < n; fl++) { const ceil = FL[fl] + L.CH[fl]; for (const w of L.WALLS[fl]) { const [x0, y0, x1, y1] = w.rect; if (w.kind !== 'part' || !(x0 <= X_CUT && X_CUT <= x1) || (x1 - x0) < (y1 - y0)) continue; const door = L.DOORS.filter(d => d.floor === fl && d.wall === w.id && d.a <= X_CUT && X_CUT <= d.b); rect(y0, door.length ? FL[fl] + door[0].head : FL[fl], y1, ceil, { w: W_CUT, fill: WHITE }); } }
  svg.close();
  // 上下をつなぐ縦の通り（赤の斜線）と階段・天窓
  svg.open('ad-stair');
  (function shaftHatch() { if (L.FLIGHTS.length < 1) return; const zf = L.FLOOR_ZONE, seq = []; const flights = L.FLIGHTS;
    flights.forEach((f, i) => { const o = L.FLOOR_OPEN[f.to]; const yS = f.dir > 0 ? f.y_start : f.y_start, oy0 = f.dir > 0 ? o[1] : o[3]; seq.push([yS, FL[f.base]], [yS, FL[f.to] - zf], [oy0, FL[f.to] - zf], [oy0, FL[f.to]]); if (i === flights.length - 1) seq.pop(); });
    const last = flights[flights.length - 1], oL = L.FLOOR_OPEN[last.to], oA = last.dir > 0 ? oL[1] : oL[3], oB = last.dir > 0 ? oL[3] : oL[1], lastTop = last.to === n - 1 ? RFL : FL[last.to + 1];
    if (last.to === n - 1 && L.SKYLIGHT) { const sk = L.SKYLIGHT; seq.push([oA, RFL - zf], [sk[1], RFL - zf], [sk[1], RFL + 260], [sk[3], RFL + 260], [sk[3], RFL - zf], [oB, RFL - zf]); } else seq.push([oA, lastTop - zf], [oB, lastTop - zf]);
    for (let i = flights.length - 1; i >= 0; i--) { const f = flights[i], o = L.FLOOR_OPEN[f.to], ob = f.dir > 0 ? o[3] : o[1]; seq.push([ob, FL[f.to] - zf]); if (i > 0) { const pf = flights[i - 1], po = L.FLOOR_OPEN[pf.to], pb = pf.dir > 0 ? po[3] : po[1]; seq.push([pb, FL[f.to] - zf]); } else seq.push([ob, FL[f.base]]); }
    svg.hatch(pts(seq), { angle: 45, spacing: 1.6, w: W_FINE, color: ACCENT }); })();
  for (const fl of L.FLIGHTS) {
    const r = fl.rise, t = fl.tread, ys = fl.y_start, z0 = fl.z0, d = fl.dir, top = fl.top_level, pz = (y) => L.pitchZ(fl, y), yLow = ys + d * t * (260 - r) / r, yb0 = ys - d * 20;
    svg.poly(pts([[yb0, z0], [yb0, pz(yb0) + 60], [fl.y_top, top], [fl.y_top, top - 320], [yLow, z0]]), { w: W_SEEN, color: ACCENT });
    const yA = ys + d * 2 * t, yB = fl.y_top - d * 2 * t; line(yA, pz(yA) + 850, yB, pz(yB) + 850, { w: W_FAR, color: ACCENT }); for (const yy of [yA, yB]) line(yy, pz(yy), yy, pz(yy) + 850, { w: W_FINE, color: ACCENT });
    for (let k = 1; k < fl.n; k++) { const zk = z0 + k * r, yn = L.nosingY(fl, k), [ya, yb] = [yn - d * 20, yn + d * t].sort((p, q) => p - q); rect(ya, zk - 30, yb, zk, { w: W_FINE, color: ACCENT, fill: ACCENT }); }
  }
  if (L.SKYLIGHT) { const [, y0, , y1] = L.SKYLIGHT, zt = RFL + 200; for (const [ya, yb] of [[y0 - 100, y0], [y1, y1 + 100]]) woodX(ya, RFL - 40, yb, zt, W_SEEN, ACCENT); rect(y0 - 120, zt, y1 + 120, zt + 50, { w: W_SEEN, color: ACCENT, fill: WHITE }); line(y0 - 100, zt + 70, y1 + 100, zt + 70, { w: W_FINE, color: ACCENT }); line(y0 - 100, zt + 90, y1 + 100, zt + 90, { w: W_FINE, color: ACCENT }); }
  svg.close();
  // 参照線
  svg.open('ad-hidden');
  if (!L.noAlley) { line(L.Y_ALLEY_CL, -300, L.Y_ALLEY_CL, TOP + 400, { w: W_FINE, kind: 'chain' }); const cc = P(L.Y_ALLEY_CL, 3600); svg.text(cc[0], cc[1] - 1.0, (L.ALLEY_W < 4000 ? '路地' : '道路') + 'の中心線', { anchor: 'middle', halo: true }); }
  for (const [y, lab, anc, dx] of [[L.Y_BND_S, '道路境界', 'end', -0.8], [L.Y_BND_N, '隣地境界', 'start', 0.8], [L.Y_ALLEY_FAR, '道路境界', 'start', 0.8]]) { line(y, -300, y, 1500, { w: W_FAR, kind: 'phantom' }); const b = P(y, 1500); svg.text(b[0] + dx, b[1] + 0.5, lab, { anchor: anc }); }
  const e1y = L.ENSHO[0], e2y = L.ENSHO[Math.min(1, n - 1)]; if (!L.noAlley) { svg.poly(pts(n > 1 ? [[e1y, FL[0]], [e1y, FL[1]], [e2y, FL[1]], [e2y, TOP + 150]] : [[e1y, FL[0]], [e1y, TOP + 150]]), { w: W_FAR, closed: false, kind: 'hidden' });
  const e1 = P(e1y, FL[0] + 2300); svg.text(e1[0] + 0.8, e1[1], '延焼ライン', { halo: true }); svg.text(e1[0] + 0.8, e1[1] + 2.6, '1 階 3 m', { halo: true }); }
  svg.close();
  const yt = P(0, TOP + 400)[1];
  if (!L.noAlley) { ldimChain(svg, [L.Y_ALLEY_CL, L.YO0, e2y].map(y => P(y, 0)[0]), 'x', yt, { extFrom: [null, P(0, TOP)[1], P(0, TOP + 150)[1]], labels: [fmtmm(L.YO0 - L.Y_ALLEY_CL), fmtmm(e2y - L.YO0)] });
  svg.text(P(e2y, 0)[0] + 2.0, yt + 0.7, '中心線から ' + fmtmm(e2y - L.Y_ALLEY_CL) + '＝延焼ライン（2 階以上）'); svg.text(P(L.YO0, 0)[0] - 0.6, yt + 4.2, '後退線', { anchor: 'end' }); }
  // レベル記号（左）・高さの寸法
  const X_LEVEL = 33 + Math.min(0, OX - 134), xDraw = P(Y_MIN, 0)[0], items = [[0, 'GL', '±0']]; L.ids.forEach((id, i) => items.push([FL[i], id + 'L', 'GL+' + fmtmm(FL[i])])); items.push([RFL, 'RFL', 'GL+' + fmtmm(RFL)], [TOP, '最高高さ', 'GL+' + fmtmm(TOP)]);
  for (const [z, name, val] of items) { const y = P(0, z)[1]; svg.line(X_LEVEL, y, xDraw, y, { w: W_FINE }); if (z > 0) svg.line(xDraw, y, P(L.YO0, 0)[0], y, { w: W_FINE, kind: 'hidden' }); llevelMark(svg, X_LEVEL, y, name, val, { side: 'left', xText: X_LEVEL - 2.4 }); }
  { const y = P(0, L.EAVE)[1], xa = P(L.YO1, 0)[0]; svg.line(xa, y, xa + 9.0, y, { w: W_FINE }); llevelMark(svg, xa + 6.0, y, '軒高', 'GL+' + fmtmm(L.EAVE), { side: 'right' }); }
  { const zs = [0].concat(FL, [RFL, TOP]), labels = [null].concat(L.STORY.map(fmtmm), [fmtmm(L.PARAPET_H)]), xd = X_LEVEL + 10; ldimChain(svg, zs.map(z => P(0, z)[1]), 'y', xd, { labels }); const t = P(0, FL[0] / 2); svg.text(xd + 1.2, t[1] + 0.8, fmtmm(FL[0])); ldimChain(svg, [P(0, 0)[1], P(0, TOP)[1]], 'y', X_LEVEL + 5.0, { labels: [fmtmm(TOP)] }); }
  // 下の寸法と通り芯
  { const yb = P(0, -900)[1]; ldimChain(svg, [L.Y_ALLEY_FAR, L.Y_ALLEY_CL, L.Y_BND_S, L.YO0, L.YO1, L.Y_BND_N].map(y => P(y, 0)[0]), 'x', yb, { labels: [fmtmm(L.Y_ALLEY_CL - L.Y_ALLEY_FAR), fmtmm(L.Y_BND_S - L.Y_ALLEY_CL), fmtmm(L.YO0 - L.Y_BND_S), fmtmm(L.YO1 - L.YO0), null] });
    if (!L.noAlley) { const c = P((L.Y_ALLEY_FAR + L.Y_BND_S) / 2, 0); svg.text(c[0], yb + 3.6, (L.ALLEY_W < 4000 ? '路地 ' : '道路 ') + fmtmm(L.ALLEY_W), { anchor: 'middle' }); }
    ldimChain(svg, M.Y.map(y => P(y, 0)[0]), 'x', yb + 5.0, { labels: M.Y.slice(1).map((y, i) => fmtmm(y - M.Y[i])) });
    M.Y.forEach((y, i) => { const p = P(y, 0); svg.open('ad-grid'); svg.line(p[0], yb + 5.0, p[0], yb + 9.0, { w: W_FINE, kind: 'chain' }); svg.line(p[0], P(0, -560)[1], p[0], yb - 0.5, { w: W_FINE, kind: 'chain' }); svg.close(); lgridBubble(svg, p[0], yb + 11.4, L.gridIds.y[i] || ('Y' + (i + 1))); });
    const t = P(L.Y_BND_N, 0); svg.text(t[0] + 0.6, yb - 0.7, fmtmm(L.Y_BND_N - L.YO1)); }
  // 室名・天井高・人物
  svg.open('ad-room-name');
  // 切断線 x=X_CUT が通る室を、通る区間ごとに名前で示す（同じ名前は 1 度）
  for (let fl = 0; fl < n; fl++) { const seen = new Set();
    for (const r of L.ROOMS[fl]) { if (r.hasLabel === false || seen.has(r.name)) continue; const xs = []; const poly = r.poly;
      for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; if ((p[0] < X_CUT) !== (q[0] < X_CUT)) xs.push(p[1] + (q[1] - p[1]) * (X_CUT - p[0]) / (q[0] - p[0])); }
      xs.sort((a, b) => a - b);
      for (let j = 0; j + 1 < xs.length; j += 2) { const span = xs[j + 1] - xs[j]; if (span < 900) continue; const nm = r.sub && span > 3000 ? r.name + '（' + r.sub + '）' : r.name; if (tw56(nm, T_ROOM) > span / SCALE - 1) continue; const p = P((xs[j] + xs[j + 1]) / 2, FL[fl] + (span > 3000 ? 1250 : 1500)); svg.text(p[0], p[1], nm, { size: T_ROOM, anchor: 'middle', halo: true }); seen.add(r.name); break; } } }
  for (let fl = 0; fl < n; fl++) { const y = M.Y[0] + (L.Y_N - M.Y[0]) * 0.42 - fl * 100; ldim(svg, P(y, FL[fl]), P(y, FL[fl] + L.CH[fl]), { text: 'CH ' + fmtmm(L.CH[fl]) }); }
  { const p = P(M.X[0] + 1500, RFL + 600); svg.text(p[0], p[1], '屋上', { size: T_ROOM, anchor: 'middle' }); }
  svg.close();
  lhuman(svg, P(L.Y_ALLEY_FAR + 700, 0)[0], P(0, 0)[1], 1650, SCALE, { facing: 1 }); lhuman(svg, P(M.Y[0] + 1000, 0)[0], P(0, FL[0])[1], 1700, SCALE, { facing: -1 }); if (n > 1) lhuman(svg, P(M.Y[0] + 2700, 0)[0], P(0, FL[1])[1], 1650, SCALE, { facing: 1 });
  // 注記（引出線）
  { const xr = P(L.YO0, 0)[0] - 8.0;
    lleader(svg, P(M.Y[0] + 1200, RFL - 200), [xr, P(0, TOP - 200)[1]], '屋根　FRP 防水', { side: 'left', sub: ['合板 24＋12', '屋根梁 120×330・断熱'] });
    if (n > 1) lleader(svg, P(M.Y[0] + 900, FL[n - 1] - 150), [xr, P(0, FL[n - 1] + 2350)[1]], '床　フローリング 15', { side: 'left', sub: ['構造用合板 28', '床梁 120×330 @900', '天井　強化せっこうボード'] });
    lleader(svg, P(L.YO0 + 70, FL[n - 1] - 250), [xr, P(0, FL[n - 1] + 800)[1]], (L.fireWall ? '耐火の外壁 ' : '外壁 ') + fmtmm(M.tw), { side: 'left', sub: [L.rc ? 'RC（判断）' : '外装・柱 120・断熱（判断）', '南の開口は切断面より' + (lookW ? '西' : '東')] });
    lleader(svg, P(L.YI1 - 300, -120), [COL_X0 - 2.0, P(0, -350)[1]], 'べた基礎 200', { side: 'right', sub: '砕石 100' });
    const S1 = L.FLIGHTS[0]; if (S1) { const a = P(L.nosingY(S1, 5) + 100, S1.z0 + 5 * S1.rise - 15); lleader(svg, a, [P(L.Y_N - 2800, 0)[0], P(0, FL[0] + 450)[1]], '直階段 W' + fmtmm(S1.x1 - S1.x0), { side: 'right', sub: ['蹴上 ' + fmtmm(S1.rise) + '・踏面 ' + fmtmm(S1.tread)], halo: true }); }
    if (L.SKYLIGHT) { const a = P(L.SKYLIGHT[3] - 200, RFL + 290); lleader(svg, a, [P(L.SKYLIGHT[3] + 600, 0)[0], P(0, RFL + 750)[1]], '天窓 ' + fmtmm(L.SKYLIGHT[2] - L.SKYLIGHT[0]) + '×' + fmtmm(L.SKYLIGHT[3] - L.SKYLIGHT[1]), { side: 'right' }); }
    const oN = wallOpenings('N'); if (oN.length) { const [z0, z1, op] = oN[oN.length - 1], a = P(L.YO1 - 75, (z0 + z1) / 2); lleader(svg, a, [P(L.YO1 + 200, 0)[0] + 3.0, P(0, z1 + 450)[1]], '北の小窓 ' + fmtmm(op.b - op.a), { side: 'right' }); } }
  // 右の列：各階の帯（境目の線は断面の FL と同じ高さ）
  { const x0 = COL_X0, x1 = COL_X1, bands = []; for (let fl = 0; fl < n; fl++) bands.push([fl, FL[fl], fl < n - 1 ? FL[fl + 1] : RFL]); bands.push([n, RFL, TOP]);
    for (const [fl, za, zb] of bands) { const ya = P(0, za)[1], yb = P(0, zb)[1]; svg.line(x0, ya, x1, ya, { w: fl === 0 ? W_SEEN : W_FINE }); svg.text(x0 + 1.0, yb + 4.2, fl < n ? L.ids[fl].replace(/F$/, ' 階') : '屋上', { size: T_ROOM, weight: 700 });
      let lines; if (fl < n) { lines = [L.USES[fl] || '—', 'CH ' + fmtmm(L.CH[fl]) + '　' + L.floorArea().toFixed(2) + ' m²']; const F = L.FLIGHTS.find(f => f.base === fl); if (F) lines.push('上へ：階段 ' + F.n + ' 段で' + L.ids[F.to].replace(/F$/, ' 階')); else if (L.SKYLIGHT) lines.push('上：天窓（階段の真上）'); } else lines = ['パラペット ' + fmtmm(L.PARAPET_H), L.SKYLIGHT ? '天窓 ' + fmtmm(L.SKYLIGHT[2] - L.SKYLIGHT[0]) + '×' + fmtmm(L.SKYLIGHT[3] - L.SKYLIGHT[1]) : ''];
      lines.forEach((s, i) => { if (s) svg.text(x0 + 1.0, yb + 8.0 + i * 3.0, s.length <= 24 ? s : s.slice(0, 24)); }); }
    svg.line(x0, P(0, TOP)[1], x1, P(0, TOP)[1], { w: W_FINE }); for (const z of FL.concat([RFL])) svg.line(P(Y_MAX, 0)[0] + 1.0, P(0, z)[1], x0, P(0, z)[1], { w: W_FINE, kind: 'hidden' });
    svg.text(x0 + 1.0, P(0, FL[0])[1] + 4.0, '断面と同じ高さでそろえた各階の帯'); }
  lscaleBar(svg, COL_X0, 262, SCALE, 2, 0.5, 1);
  if (opt.title !== false) {
    svg.text(14, 262, opt.title || ('図3　積層断面 B–B′（1:' + SCALE + '）'), { size: T_TITLE, weight: 700, cls: 'ad-title' });
    const cap = opt.caption ? [].concat(opt.caption) : ['階段の中心（x=' + fmtmm(X_CUT) + '）で切り' + (lookW ? '西' : '東') + 'を見た断面に、各階の用途・レベル・天井高を重ね、右に同じ高さの各階の帯を置いた。赤は上下の階をつなぐ所（斜線の面が階段と床の開口と天窓の縦の通り、塗りは切断した段板）。', (L.noAlley ? '' : '破線は延焼ライン（路地の中心線から 1 階 3 m・2 階以上 5 m）で、南の外壁と開口はすべてその内側にある。') + ((nbS || nbN) ? '灰は周辺の建物。' : '') + sourceOf(M) + '（床の層・基礎は判断）'];
    cap.forEach((s, i) => svg.text(14, 269 + i * 5, s));
  }
  return svg.svg(opt.page === false ? { crop: true } : null);
}

/* ═══════════════════════════════ 公開 ═══════════════════════════════ */
function errSvg(msg) { return '<svg xmlns="http://www.w3.org/2000/svg" width="120mm" height="20mm" viewBox="0 0 120 20" font-family="' + FONT + '"><rect width="120" height="20" fill="#fff"/><text x="4" y="11" font-size="3.5" fill="' + INK + '">' + esc(msg) + '</text></svg>'; }
function guard(fn) { return function (m, opt) { try { if (!m || !arr(m.levels).length) return errSvg('建物モデルに階がありません'); opt = Object.assign({}, opt || {}); if (opt.paper === false || opt.sheet === false) opt.page = false; return fn(toM(m), opt); } catch (e) { console.error('[archstudio-axon]', e); return errSvg('図を作れませんでした：' + (e && e.message || e)); } }; }
const views = A.views = A.views || {};
views.axon = guard((M, opt) => (opt.explode ? fig2(M, opt) : fig1(M, opt)));
views.layers = guard((M, opt) => (opt.kind === 'sequence' ? figSequence(M, opt) : opt.kind === 'floors' ? figFloors(M, opt) : fig2(M, opt)));
views.structure = guard(fig3);
views.stack = guard(figStack);
views.floors = guard(figFloors);
views.sequence = guard(figSequence);
views.axonVersion = 2;
views.axonKinds = [['axon', '外観アクソメ'], ['layers', '各階の分解'], ['structure', '構造と外皮の分解'], ['stack', '積層断面'], ['floors', '階の並べ図'], ['sequence', '層の分解図']];
A.axon = { toM, Projection, Scene, Sheet, Builder, fig1, fig2, fig3, figStack, figFloors, figSequence, PROJECTIONS };
})();
