'use strict';
/* 数直線：期間・金額・順位を位置と長さで示す。目盛りは値に比例（proportional:false で等間隔）。範囲は軸の上に括って名前を付ける。
   spec: { ticks:[{v, value:'5年', label, accent, guide}], ranges:[{from, to, label, accent, gray, dash}], proportional:true, arrow:true, breaks:[i], notes }
   v＝位置を決める数、value＝目盛りの上に出す語、label＝目盛りの下に出す語。from/to は v の値。ranges は重ならないように自動で段を分ける。
   proportional:false＝等間隔に置く（値の差が大きく、比例させると詰まるとき。間が長い所には breaks で省略の印を置く）。
   breaks:[i]＝小さい順に i 番目と i+1 番目の目盛りの間に省略の印（//）。arrow:false＝軸の右端の矢じりを付けない（時間でなく金額・順位の軸）。
   guide:true（または accent の目盛り）＝目盛りから上の範囲の括りまで灰の点線を上げる（どの括りの切れ目かを目で追える）。 */
const { S, wrap, measure, footNotes } = require('../core');
const NONE = /(しない|がない|はない|できない|及ばない|なし|消滅|不成立|無効)(（[^）]*）)?$/;
module.exports = function (spec, cv) {
  const tk = spec.ticks.slice().sort((a, b) => a.v - b.v), n = tk.length, ax0 = cv.M + 30, ax1 = cv.W - cv.M - 30, padX = 70;
  const vmin = tk[0].v, vmax = tk[n - 1].v;
  const X = v => spec.proportional === false ? (() => { const i = tk.findIndex(t => t.v >= v); if (i <= 0) return ax0 + padX; const a = tk[i - 1], b = tk[i], st = (ax1 - ax0 - padX * 2) / (n - 1); return ax0 + padX + st * (i - 1 + (v - a.v) / (b.v - a.v || 1)); })() : ax0 + padX + (ax1 - ax0 - padX * 2) * (v - vmin) / (vmax - vmin || 1);
  const xs = tk.map(t => X(t.v));
  for (let i = 1; i < n; i++) if (xs[i] - xs[i - 1] < 80) cv.warn.push(`目盛り「${tk[i - 1].value || tk[i - 1].v}」と「${tk[i].value || tk[i].v}」が近すぎる。proportional:false にするか、省略の印を使う`);
  const ranges = (spec.ranges || []).map(r => ({ r, x0: X(r.from), x1: X(r.to) })); const lv = [];
  ranges.forEach(g => { let k = 0; while ((lv[k] || []).some(o => g.x0 < o.x1 - 2 && g.x1 > o.x0 + 2)) k++; (lv[k] = lv[k] || []).push(g); g.k = k; g.ls = wrap(g.r.label || '', Math.max(120, g.x1 - g.x0 - 10), S.FS); });
  const lvH = lv.map(row => Math.max(...row.map(g => measure(g.ls, S.FS).h)) + 30);
  let y = cv.M; const lvY = []; for (let k = lv.length - 1; k >= 0; k--) { lvY[k] = y; y += lvH[k]; }
  const vh = S.FS + 8, axY = y + vh + 12;
  ranges.forEach(g => { const by = lvY[g.k] + lvH[g.k] - 10, o = { accent: g.r.accent, gray: g.r.gray, dash: g.r.dash, thick: !g.r.gray, obst: false }; g.by = by;
    if (!g.r.dash && !g.r.gray && NONE.test(String(g.r.label || '').replace(/\|/g, ''))) cv.warn.push(`「${String(g.r.label).replace(/\|/g, '').slice(0, 12)}」の括りが太い実線。ない・できない状態は dash:true か gray:true にする`);
    cv.line(g.x0, by, g.x1, by, o); cv.line(g.x0, by - 8, g.x0, by + 8, o); cv.line(g.x1, by - 8, g.x1, by + 8, o);
    cv.text((g.x0 + g.x1) / 2, by - 12 - measure(g.ls, S.FS).h + S.FS * 0.86, g.ls, { anchor: 'middle' }); });
  cv.poly([[ax0, axY], [ax1, axY]], { head: spec.arrow === false ? undefined : 'end', obst: false });
  tk.forEach((t, i) => { const slot = Math.min(i ? xs[i] - xs[i - 1] : 1e9, i < n - 1 ? xs[i + 1] - xs[i] : 1e9, 260, 2 * (xs[i] - cv.M), 2 * (cv.W - cv.M - xs[i])) - 12;
    cv.line(xs[i], axY - 10, xs[i], axY + 10, { accent: t.accent, thick: t.accent, obst: false });
    if (t.value != null) cv.text(xs[i], axY - 16, String(t.value), { anchor: 'middle' });
    if (t.label) cv.text(xs[i], axY + 18 + S.FS * 0.86, wrap(t.label, slot, S.FS), { anchor: 'middle' }); });
  (spec.breaks || []).forEach(i => cv.breakMark((xs[i] + xs[i + 1]) / 2, axY));
  // 補助線：強調した目盛りから、その値で切れる括りまで
  tk.forEach((t, i) => { if (!(t.guide || (t.accent && t.guide !== false))) return; const hit = ranges.filter(g => Math.abs(g.x0 - xs[i]) < 1 || Math.abs(g.x1 - xs[i]) < 1); if (!hit.length) return;
    const top = Math.min(...hit.map(g => g.by)) + 10, bot = axY - (t.value != null ? S.FS + 22 : 12); if (bot - top > 6) cv.guide(xs[i], top, bot); });
  footNotes(cv, spec.notes, cv.maxY);
};
