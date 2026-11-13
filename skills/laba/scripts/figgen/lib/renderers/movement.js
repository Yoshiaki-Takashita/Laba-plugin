'use strict';
/* 動きの図：あるものは及び（渡り）、あるものは及ばない。渡るものは矢印、渡らないものは矢印を止め線で切る。
   spec: { from:{label,sub}, to:{label,sub}, items:[{label, pass:true|false, why, accent}], notes } */
const { S, wrap, measure, footNotes } = require('../core');
module.exports = function (spec, cv) {
  const nodeW = 210, xa = cv.M, xb = cv.W - cv.M - nodeW, gx0 = xa + nodeW, gx1 = xb, gw = gx1 - gx0;
  const prep = spec.items.map(it => ({ l: wrap(it.label, gw - 50, S.FS), w: it.why ? wrap(it.why, gw - 50, S.FS) : [] }));
  const rh = prep.map(p => measure(p.l, S.FS).h + 14 + 14 + (p.w.length ? measure(p.w, S.FS).h : 0) + 34); const H = rh.reduce((a, b) => a + b, 0);
  const A = cv.node(xa, cv.M, { w: nodeW, h: H, head: spec.from.label, headBold: true, lines: spec.from.sub || [] });
  const B = cv.node(xb, cv.M, { w: nodeW, h: H, head: spec.to.label, headBold: true, lines: spec.to.sub || [] });
  let y = cv.M;
  spec.items.forEach((it, i) => { const p = prep[i], ly = y + 17 + measure(p.l, S.FS).h + 14;
    cv.text(gx0 + gw / 2, y + 17 + S.FS * 0.86, p.l, { anchor: 'middle' });
    if (it.pass) cv.poly([[gx0, ly], [gx1 - 6, ly]], { head: 'end', accent: it.accent });
    else { const sx = gx0 + gw * 0.62; cv.poly([[gx0, ly], [sx, ly]], { accent: it.accent }); cv.stopBar(sx, ly, false, { accent: it.accent }); }
    if (p.w.length) cv.text(gx0 + gw / 2, ly + 14 + S.FS * 0.86, p.w, { anchor: 'middle' });
    y += rh[i]; });
  footNotes(cv, spec.notes, cv.M + H);
};
