'use strict';
/* 座標図：二つの観点（あり／なし）の組合せで類型が決まる。各セルに類型名＋その位置から出る規律。
   spec: { xAxis:{title,values:[a,b]}, yAxis:{title,values:[a,b]}, cells:[[{title,lines,accent,na}, ..],[..]], notes } */
const { S, wrap, measure, footNotes } = require('../core');
module.exports = function (spec, cv) {
  const X = spec.xAxis, Y = spec.yAxis, cells = spec.cells;
  const yl = Y.values.map(v => wrap(v, 120, S.FS)), yt = wrap(Y.title, 150, S.FS);
  const labW = Math.max(measure(yt, S.FS).w, ...yl.map(l => measure(l, S.FS).w)) + 22;
  const gx = cv.M + labW, gw = cv.W - cv.M - gx, cw = gw / 2;
  let y = cv.M + S.FS; cv.text(gx + gw / 2, y, X.title, { anchor: 'middle' }); y += S.FS * 1.5;
  X.values.forEach((v, i) => cv.text(gx + cw * i + cw / 2, y, v, { anchor: 'middle' })); y += 14;
  cv.text(cv.M, cv.M + S.FS, yt);
  const prep = cells.map(row => row.map(c => ({ t: wrap(c.title || '', cw - 36, S.FL), l: wrap(c.lines || [], cw - 36, S.FS) })));
  const rh = prep.map(row => Math.max(...row.map(p => measure(p.t, S.FL).h + (p.l.length ? 12 + measure(p.l, S.FS).h : 0))) + 44);
  const gy = y, gh = rh[0] + rh[1];
  cv.rect(gx, gy, gw, gh, { obst: false }); cv.line(gx + cw, gy, gx + cw, gy + gh, { obst: false }); cv.line(gx, gy + rh[0], gx + gw, gy + rh[0], { obst: false });
  let ry = gy;
  cells.forEach((row, r) => {
    cv.textCenter(cv.M + (labW - 22) / 2, ry + rh[r] / 2, yl[r]);
    row.forEach((c, k) => {
      const p = prep[r][k], cx = gx + cw * k + cw / 2, th = measure(p.t, S.FL).h, lh = p.l.length ? 12 + measure(p.l, S.FS).h : 0;
      let ty = ry + (rh[r] - th - lh) / 2;
      if (c.accent) cv.rect(gx + cw * k + 6, ry + 6, cw - 12, rh[r] - 12, { accent: true, obst: false });
      if (p.t.length) cv.text(cx, ty + S.FL * 0.8, p.t, { size: S.FL, anchor: 'middle' });
      if (p.l.length) cv.text(cx, ty + th + 12 + S.FS * 0.8, p.l, { anchor: 'middle' });
    });
    ry += rh[r];
  });
  footNotes(cv, spec.notes, ry);
};
