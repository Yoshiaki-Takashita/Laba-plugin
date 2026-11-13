'use strict';
/* 複合図：同じ型・同じ枠の図を上下に並べ、違う所だけを強調して比べる（「同じ枠のくり返し」）。
   spec: { panels:[{ title:'（a）…', spec:{ type, … } }], legend, notes }　下位の仕様に caption・message は要らない。全体で一つの図題を付ける。
   区画の題は 24。長くて三行以上に折れるなら語を減らす。 */
const { S, wrap, measure, footNotes } = require('../core');
module.exports = function (spec, cv) {
  let oy = 0;
  spec.panels.forEach((p, i) => {
    cv.beginPanel(oy);
    if (i > 0) cv.line(cv.M, cv.M - 14, cv.W - cv.M, cv.M - 14, { gray: true, obst: false });
    let top = cv.M;
    if (p.title) { const tl = wrap(p.title, cv.W - cv.M * 2, S.FL); cv.text(cv.M, top + S.FL * 0.86, tl, { size: S.FL }); top += measure(tl, S.FL).h + 16; }
    const M0 = cv.M, sub = Object.assign({}, p.spec);
    // 下位の図は題の下から始める：区画の原点をさらに下げる
    const titleH = top - M0; cv.oy = oy + titleH; cv.texts = []; cv.boxes = []; cv.segs = [];
    cv.inPanel = true; require('./' + sub.type)(sub, cv); cv.inPanel = false;
    const h = cv.maxY; cv.oy = oy; cv.maxY = h + titleH;
    oy = cv.endPanel() + 26;
  });
  if (spec.notes || (cv.legendItems && cv.legendItems.length)) { cv.beginPanel(oy - 26 - cv.M + 14); footNotes(cv, spec.notes, cv.M - 12); cv.endPanel(); }
};
