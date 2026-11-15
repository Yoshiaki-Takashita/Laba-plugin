'use strict';
/* 審級の流れ：第一審→控訴審→上告審（→差戻審）。各段に裁判所・日付・結論・理由の要点。結論が変わった段を強調。
   spec: { stages:[{court, date, result, reason:[..], accent}], links:['控訴','上告'], notes } */
const { S, wrap, measure, footNotes } = require('../core');
module.exports = function (spec, cv) {
  const st = spec.stages, n = st.length, gap = n >= 4 ? 78 : 104, w = (cv.W - cv.M * 2 - gap * (n - 1)) / n;
  const prep = st.map(s => wrap([].concat(s.date || [], s.result ? '結論：' + s.result : [], s.reason || []), w - S.PAD * 2, S.FS));
  const h = Math.max(...prep.map((p, i) => measure(wrap(st[i].court, w - S.PAD * 2, S.FS), S.FS).h + S.FS * 0.55 + measure(p, S.FS).h)) + S.PAD * 2 + 4;
  const top = cv.M + (spec.links && spec.links.length ? S.FS * 1.6 : 0); let prev = null;
  st.forEach((s, i) => {
    const nd = cv.node(cv.M + i * (w + gap), top, { w, h, head: s.court, headBold: true, lines: prep[i], align: 'left', accent: s.accent, dash: s.dash, noLineWarn: true });
    if (prev) { const p = cv.poly([[prev.x1, prev.cy], [nd.x0 - 6, nd.cy]], { head: 'end', accent: s.accent }); const lb = (spec.links || [])[i - 1]; if (lb) cv.edgeLabel(p, wrap(lb, gap - 10, S.FS)); }
    prev = nd;
  });
  footNotes(cv, spec.notes, cv.maxY);
};
