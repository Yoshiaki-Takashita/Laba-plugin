'use strict';
/* 判例マトリクス：行＝誰が誰に、列＝何を求めるか。セルに結論と判例の年月日。横罫だけ。強調セルは枠。
   spec: { corner, cols:[..], rows:[{label, cells:[{lines:[..], accent, note}|str]}], notes } */
const { S, wrap, measure, footNotes } = require('../core');
module.exports = function (spec, cv) {
  const cols = spec.cols, rows = spec.rows, n = cols.length;
  const labW = spec.labelWidth || 190, x0 = cv.M + labW, cw = (cv.W - cv.M - x0) / n, pad = 12;
  let y = cv.M; cv.line(cv.M, y, cv.W - cv.M, y, { thick: true, obst: false });
  const hl = cols.map(c => wrap(c, cw - pad * 2, S.FS)), hh = Math.max(...hl.map(l => measure(l, S.FS).h), spec.corner ? measure(wrap(spec.corner, labW - pad, S.FS), S.FS).h : 0) + 22;
  if (spec.corner) cv.textCenter(cv.M + labW / 2, y + hh / 2, wrap(spec.corner, labW - pad, S.FS));
  cols.forEach((c, i) => cv.textCenter(x0 + cw * i + cw / 2, y + hh / 2, hl[i]));
  y += hh; cv.line(cv.M, y, cv.W - cv.M, y, { obst: false });
  rows.forEach((r, ri) => {
    const cl = r.cells.map(c => { c = typeof c === 'string' || Array.isArray(c) ? { lines: c } : (c || {}); const l = wrap(c.lines || [], cw - pad * 2 - 8, S.FS), nt = c.note ? wrap(c.note, cw - pad * 2 - 8, S.FS) : []; return { c, l, nt }; });
    const ll = wrap(r.label, labW - pad, S.FS);
    const h = Math.max(measure(ll, S.FS).h, ...cl.map(p => measure(p.l, S.FS).h + (p.nt.length ? 10 + measure(p.nt, S.FS).h : 0))) + 30;
    cv.textCenter(cv.M + labW / 2, y + h / 2, ll);
    cl.forEach((p, i) => {
      const cx = x0 + cw * i, lh = measure(p.l, S.FS).h, nh = p.nt.length ? 10 + measure(p.nt, S.FS).h : 0; let ty = y + (h - lh - nh) / 2;
      if (p.c.accent) cv.rect(cx + 4, y + 5, cw - 8, h - 10, { accent: true, obst: false });
      if (p.l.length) cv.text(cx + pad + 4, ty + S.FS * 0.8, p.l);
      if (p.nt.length) cv.text(cx + pad + 4, ty + lh + 10 + S.FS * 0.8, p.nt);
    });
    y += h;
    if (ri < rows.length - 1) cv.line(cv.M, y, cv.W - cv.M, y, { gray: true, obst: false });
  });
  cv.line(cv.M, y, cv.W - cv.M, y, { thick: true, obst: false });
  footNotes(cv, spec.notes, y);
};
