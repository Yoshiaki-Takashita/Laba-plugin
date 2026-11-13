'use strict';
/* 請求・抗弁・再抗弁の積み上げ図。左が請求する側、右が相手方。上から順に階段状に下りる。各段に「誰が何を証明し、何が起きるか」。
   spec: { left:{title}, right:{title}, levels:[{side:'left'|'right', name, items:[..], effect, against, accent}], notes } */
const { S, wrap, measure, footNotes } = require('../core');
module.exports = function (spec, cv) {
  const gap = 96, colW = (cv.W - cv.M * 2 - gap) / 2, xL = cv.M, xR = cv.M + colW + gap;
  let y = cv.M + S.FL; const tl = wrap(spec.left.title, colW, S.FL), tr = wrap(spec.right.title, colW, S.FL);
  cv.text(xL + colW / 2, y, tl, { size: S.FL, anchor: 'middle' }); cv.text(xR + colW / 2, y, tr, { size: S.FL, anchor: 'middle' });
  y += Math.max(measure(tl, S.FL).h, measure(tr, S.FL).h) - S.FL + 22;
  let prev = null; const top = y;
  spec.levels.forEach((lv, i) => {
    const x = lv.side === 'right' ? xR : xL, lines = [].concat(lv.items || []); if (lv.effect) lines.push('⇒ ' + lv.effect);
    const nd = cv.node(x, y, { w: colW, head: lv.name, headBold: true, lines, align: 'left', accent: lv.accent, noLineWarn: true });
    if (prev) { const py = prev.y1 - 22, fromX = prev.x0 < nd.x0 ? prev.x1 : prev.x0;
      const pts = cv.poly([[fromX, py], [nd.cx, py], [nd.cx, nd.y0 - 6]], { head: 'end', accent: lv.accent });
      if (lv.against) cv.label(wrap(lv.against, colW - 60, S.FS), [{ x: nd.cx + 12, y: py + (nd.y0 - py) / 2 + 2, anchor: 'start' }, { x: nd.cx - 12, y: py + (nd.y0 - py) / 2 + 2, anchor: 'end' }, { x: (fromX + nd.cx) / 2, y: py - 10 }]); }
    prev = nd; y = nd.y1 + 44;
  });
  footNotes(cv, spec.notes, cv.maxY);
};
