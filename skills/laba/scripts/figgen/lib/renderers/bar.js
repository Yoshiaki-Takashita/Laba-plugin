'use strict';
/* 価値配分：一つの価値・数量を、複数の者が分け合う。全体を帯で描き、誰がどの部分を把握するかを区切る。複数の帯を上下に並べて比べられる。
   spec: { rows:[{label, parts:[{label, share, holder, accent, gray}]}], notes }　share は各行で合計 1 にする。 */
const { S, wrap, measure, footNotes } = require('../core');
module.exports = function (spec, cv) {
  const rows = spec.rows, labW = Math.min(190, Math.max(...rows.map(r => measure(wrap(r.label || '', 170, S.FS), S.FS).w)) + 22), x0 = cv.M + labW, bw = cv.W - cv.M - x0, bh = 58; let y = cv.M;
  rows.forEach(r => { const sum = r.parts.reduce((a, p) => a + p.share, 0); if (Math.abs(sum - 1) > 0.01) cv.warn.push(`share の合計が 1 でない（${r.label}：${sum.toFixed(2)}）`);
    const inner = r.parts.map(p => wrap(p.label || '', bw * p.share / sum - 14, S.FS)); const ih = Math.max(bh, ...inner.map(l => measure(l, S.FS).h + 24));
    cv.textCenter(cv.M + (labW - 22) / 2, y + ih / 2, wrap(r.label || '', labW - 22, S.FS));
    let x = x0; const hold = [];
    r.parts.forEach((p, i) => { const w = bw * p.share / sum; cv.rect(x, y, w, ih, { gray: p.gray, obst: false }); if (p.accent) cv.rect(x + 4, y + 4, w - 8, ih - 8, { accent: true, obst: false });
      cv.textCenter(x + w / 2, y + ih / 2, inner[i]); if (p.holder) hold.push({ x, w, ls: wrap(p.holder, Math.max(110, w - 10), S.FS), acc: p.accent }); x += w; });
    let hh = 0; hold.forEach(h => { const by = y + ih + 14; cv.line(h.x + 5, by, h.x + h.w - 5, by, { obst: false, accent: h.acc }); cv.line(h.x + 5, by - 6, h.x + 5, by, { obst: false, accent: h.acc }); cv.line(h.x + h.w - 5, by - 6, h.x + h.w - 5, by, { obst: false, accent: h.acc });
      cv.text(h.x + h.w / 2, by + 10 + S.FS * 0.86, h.ls, { anchor: 'middle' }); hh = Math.max(hh, measure(h.ls, S.FS).h + 26); });
    y += ih + hh + 34; });
  footNotes(cv, spec.notes, y - 34);
};
