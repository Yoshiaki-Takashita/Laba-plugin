'use strict';
/* 時間軸：時点・期間・順序が決め手のとき。出来事は軸の上に日付、下に内容。状態の帯（誰がいつ持つか・期間）を下に重ねる。
   spec: { events:[{date, label, accent, mark, guide}], tracks:[{name, segments:[{from,to,label,accent,gray,dash}]}], scale:'ordinal'|'time', breaks:[i], guides:true|false, notes }
   from/to は events の番号（0始まり）。to を省くと右端まで。scale:'time' は date（YYYY-MM-DD）に比例して置く。
   breaks:[i]＝ events の i 番目と i+1 番目の間に省略の印（//）を置く（等間隔に置いた軸で、間が長く空くことを示す）。
   基準時の補助線：accent か mark か guide:true の出来事から、下の帯まで灰の点線を下ろす（その時点が、どの帯の切れ目かを目で追える）。帯がなければ引かない。guides:false で全部やめる。
   帯の線種：続いている状態＝太い実線、ない・成立しない・消滅した状態＝破線（dash:true）か灰の細線（gray:true）。「ない」を太い実線で描くと、形が意味と逆になる（warn が出る）。 */
const { S, wrap, measure, footNotes } = require('../core');
const NONE = /(しない|がない|はない|できない|及ばない|なし|消滅|不成立|失う|失った|無効)(（[^）]*）)?$/;
module.exports = function (spec, cv) {
  const ev = spec.events, n = ev.length, tracks = spec.tracks || [];
  const nameW = tracks.length ? Math.min(170, Math.max(...tracks.map(t => measure(wrap(t.name, 150, S.FS), S.FS).w)) + 20) : 0;
  const ax0 = cv.M + nameW + 10, ax1 = cv.W - cv.M - 10, span = ax1 - ax0;
  let xs;
  if (spec.scale === 'time' && ev.every(e => !isNaN(Date.parse(e.date)))) {
    const t = ev.map(e => Date.parse(e.date)), t0 = Math.min(...t), t1 = Math.max(...t), pad = span * 0.08;
    xs = t.map(v => ax0 + pad + (span - pad * 2) * (v - t0) / (t1 - t0 || 1));
    for (let i = 1; i < n; i++) if (xs[i] - xs[i - 1] < 96) { cv.warn.push('time 目盛りでは出来事が詰まりすぎる。ordinal にするか、省略の印を使う'); }
  } else { const tail = tracks.some(t => t.segments.some(g => g.to == null && g.from === n - 1)) ? 0.7 : 0; const step = span / (n + tail); xs = ev.map((e, i) => ax0 + step * (i + 0.5)); }
  const slot = i => Math.min(i > 0 ? xs[i] - xs[i - 1] : 1e9, i < n - 1 ? xs[i + 1] - xs[i] : 1e9, span / n) - 14;
  const dl = ev.map((e, i) => wrap(e.date || '', slot(i), S.FS)), ll = ev.map((e, i) => wrap(e.label || '', slot(i), S.FS)), ml = ev.map((e, i) => { if (!e.mark) return [];
    // 印（基準時など）は日付の上の段に置くので、隣の出来事に印がなければ両隣の半分まで広げてよい
    const nb = [i - 1, i + 1].filter(k => k >= 0 && k < n && ev[k].mark).map(k => Math.abs(xs[k] - xs[i]) - 14);
    const w = Math.min(nb.length ? Math.min(...nb) : 1e9, 2 * (xs[i] - cv.M - nameW * 0), 2 * (cv.W - cv.M - xs[i]), Math.max(slot(i), 340));
    return wrap(e.mark, w, S.FS); });
  const dh = Math.max(...dl.map(l => measure(l, S.FS).h)), mh = Math.max(0, ...ml.map(l => measure(l, S.FS).h));
  let y = cv.M + (mh ? mh + 10 : 0) + dh; const axY = y + 20;
  ev.forEach((e, i) => {
    if (ml[i].length) cv.text(xs[i], axY - 20 - dh - 10 - measure(ml[i], S.FS).h + S.FS * 0.86, ml[i], { anchor: 'middle' });
    cv.text(xs[i], axY - 20 - measure(dl[i], S.FS).h + S.FS * 0.86, dl[i], { anchor: 'middle' });
    cv.line(xs[i], axY - 10, xs[i], axY + 10, { accent: e.accent, thick: e.accent, obst: false });
    cv.text(xs[i], axY + 18 + S.FS * 0.86, ll[i], { anchor: 'middle' });
  });
  cv.poly([[ax0, axY], [ax1, axY]], { head: 'end', obst: false });
  (spec.breaks || []).forEach(i => cv.breakMark((xs[i] + xs[i + 1]) / 2, axY));
  const labBottom = ll.map(l => axY + 18 + measure(l, S.FS).h + 6), bandY = [];
  y = axY + 18 + Math.max(...ll.map(l => measure(l, S.FS).h)) + 26;
  tracks.forEach(t => {
    const segs = t.segments.map(s => ({ s, x0: s.from == null ? ax0 : xs[s.from], x1: s.to == null ? ax1 : xs[s.to] }));
    const prep = segs.map(g => wrap(g.s.label || '', g.x1 - g.x0 - 16, S.FS)); const lh = Math.max(...prep.map(l => measure(l, S.FS).h));
    const by = y + lh + 12;
    cv.textCenter(cv.M + nameW / 2, by - (lh + 12) / 2 + 6, wrap(t.name, nameW - 10, S.FS));
    segs.forEach((g, k) => {
      const o = { accent: g.s.accent, gray: g.s.gray, dash: g.s.dash, thick: !g.s.gray, obst: false };
      if (!g.s.dash && !g.s.gray && NONE.test(String(g.s.label || '').replace(/\|/g, ''))) cv.warn.push(`「${String(g.s.label).replace(/\|/g, '').slice(0, 12)}」の帯が太い実線。ない・成立しない状態は dash:true（破線）か gray:true にする`);
      cv.line(g.x0 + 3, by, g.x1 - 3, by, o); cv.line(g.x0 + 3, by - 8, g.x0 + 3, by + 8, o); if (g.s.to != null) cv.line(g.x1 - 3, by - 8, g.x1 - 3, by + 8, o);
      cv.text((g.x0 + g.x1) / 2, by - 12 - measure(prep[k], S.FS).h + S.FS * 0.86, prep[k], { anchor: 'middle' });
    });
    bandY.push({ by, segs, prep }); y = by + 26;
  });
  // 基準時の補助線：強調・印つきの時点から、いちばん下の帯まで。帯の上の語を横切る所は避ける
  if (spec.guides !== false && bandY.length) ev.forEach((e, i) => {
    if (!(e.guide || ((e.accent || e.mark) && e.guide !== false))) return; const x = xs[i]; let y0 = labBottom[i];
    bandY.forEach(b => { const hit = b.segs.some((g, k) => { const w = measure(b.prep[k], S.FS).w, cx = (g.x0 + g.x1) / 2; return b.prep[k].length && Math.abs(cx - x) < w / 2 + 6; });
      const top = b.by - 12 - Math.max(...b.prep.map(l => measure(l, S.FS).h)) - 4;
      if (hit) { if (top - y0 > 6) cv.guide(x, y0, top); y0 = b.by - 9; } });
    const end = bandY[bandY.length - 1].by + 10; if (end - y0 > 6) cv.guide(x, y0, end);
  });
  footNotes(cv, spec.notes, y - 14);
};
