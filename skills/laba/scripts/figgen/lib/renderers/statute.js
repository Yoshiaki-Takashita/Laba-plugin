'use strict';
/* 条文の構造図：本文・ただし書・各号、原則と例外を分け、それぞれの効果（意味）を右に置く。
   spec: { name:'民法○条', parts:[{kind:'本文', text, effect, accent, indent:0|1}], notes } */
const { S, wrap, measure, footNotes } = require('../core');
module.exports = function (spec, cv) {
  const kindW = 132, effW = 250, gap = 64; let y = cv.M;
  if (spec.name) { cv.text(cv.M, y + S.FL * 0.86, spec.name, { size: S.FL }); y += S.FL + 20; }
  spec.parts.forEach(p => { const ind = (p.indent || 0) * 44, x = cv.M + ind, tw = cv.W - cv.M - x - kindW - (p.effect ? effW + gap : 0);
    const tl = wrap(p.text, tw - S.PAD * 2, S.FS), el = p.effect ? wrap(p.effect, effW - S.PAD * 2, S.FS) : [], h = Math.max(measure(tl, S.FS).h, measure(el, S.FS).h, S.FS) + S.PAD * 2 + 2;
    cv.node(x, y, { w: kindW, h, head: p.kind, headBold: true });
    const T = cv.node(x + kindW, y, { w: tw, h, lines: tl, align: 'left', noLineWarn: true });
    if (p.effect) { const E = cv.node(cv.W - cv.M - effW, y, { w: effW, h, lines: el, accent: p.accent }); cv.poly([[T.x1, T.cy], [E.x0 - 6, E.cy]], { head: 'end', accent: p.accent }); }
    y += h + 16; });
  footNotes(cv, spec.notes, y - 16);
};
