'use strict';
/* 包含図：ある概念が別の概念に含まれる関係（広い概念の中の狭い概念）。入れ子の四角で示す。
   spec: { root:{label, lines, accent, children:[..]}, notes }　深さは3段まで。 */
const { S, wrap, measure, footNotes } = require('../core');
module.exports = function (spec, cv) {
  const pad = 16, gap = 14;
  const size = (n, w) => { n._w = w; n._l = wrap(n.label, w - pad * 2, S.FS); n._t = wrap(n.lines || [], w - pad * 2, S.FS); const ch = n.children || [];
    const head = measure(n._l, S.FS).h + (n._t.length ? 8 + measure(n._t, S.FS).h : 0);
    if (!ch.length) { n._h = head + pad * 2; return; }
    const cw = (w - pad * 2 - gap * (ch.length - 1)) / ch.length; ch.forEach(c => size(c, cw)); n._h = pad + head + 14 + Math.max(...ch.map(c => c._h)) + pad; };
  const draw = (n, x, y) => { const ch = n.children || []; cv.rect(x, y, n._w, n._h, { accent: n.accent, dash: n.dash, obst: false });
    const head = measure(n._l, S.FS).h + (n._t.length ? 8 + measure(n._t, S.FS).h : 0);
    if (!ch.length) { let ty = y + (n._h - head) / 2; cv.text(x + n._w / 2, ty + S.FS * 0.8, n._l, { anchor: 'middle' }); if (n._t.length) cv.text(x + n._w / 2, ty + measure(n._l, S.FS).h + 8 + S.FS * 0.8, n._t, { anchor: 'middle' }); return; }
    cv.text(x + pad, y + pad + S.FS * 0.8, n._l); if (n._t.length) cv.text(x + pad, y + pad + measure(n._l, S.FS).h + 8 + S.FS * 0.8, n._t);
    const cw = ch[0]._w, mh = Math.max(...ch.map(c => c._h)); ch.forEach((c, i) => { c._h = mh; draw(c, x + pad + i * (cw + gap), y + pad + head + 14); }); };
  size(spec.root, cv.W - cv.M * 2); draw(spec.root, cv.M, cv.M);
  footNotes(cv, spec.notes, cv.maxY);
};
