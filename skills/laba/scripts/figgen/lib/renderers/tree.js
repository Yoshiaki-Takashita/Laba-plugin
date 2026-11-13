'use strict';
/* 決定木（場合分け）・要件効果の木・組織図。direction:'right'（左から右へ分かれる）か 'down'（上から下へ）。
   spec: { direction, root:{text, sub, kind, children:[{edge:'はい', text, sub, accent, accentEdge, dash, kind, children:[..]}]}, gapY, noHeads, leafUnder, notes }
   葉（結論）は children を持たない節。分岐の答えは枝の横に語で書く。
   gapY：兄弟の箱の間隔（right）。noHeads:true：矢じりを付けない（組織図など、向きのない上下関係）。
   leafUnder:false：葉（結論）の下辺を太くしない（既定は太くする。問いの箱と結論の箱を、色を使わずに見分けるため）。
   枝の語は、down では枝の右の空き（隣の枝まで）に置き、長ければ段の間隔を広げる。right では枝の上に置き、長ければ列の間隔を広げる。 */
const { S, wrap, measure, textW, footNotes, wrapLog } = require('../core');
module.exports = function (spec, cv) {
  const dir = spec.direction || 'right', all = []; let maxD = 0, leaves = 0;
  const walk = (n, d, par) => { n._d = d; n._par = par; all.push(n); maxD = Math.max(maxD, d); (n.children || []).forEach(c => walk(c, d + 1, n)); if (!(n.children || []).length) leaves++; };
  walk(spec.root, 0, null);
  const isLeaf = n => !(n.children || []).length, under = n => isLeaf(n) && spec.leafUnder !== false && !spec.noHeads;
  if (dir === 'right') {
    const edgeW = Math.max(0, ...all.map(n => n.edge ? Math.max(...String(n.edge).split('|').map(t => textW(t, S.FS))) : 0));
    // 列の間隔は枝の語に合わせて広げるが、箱の幅が 150（6字）を割らない所まで。それでも語が入らなければ折る（cli が warn を出す。down にすると枝の語を長く書ける）
    const cap = maxD ? (cv.W - cv.M * 2 - 150 * (maxD + 1)) / maxD : 170;
    const gapX = Math.max(96, Math.min(170, cap, Math.max(112, edgeW + 36))), colW = (cv.W - cv.M * 2 + gapX) / (maxD + 1), nodeW = colW - gapX, gapY = spec.gapY || 26;
    all.forEach(n => { n._w = (n.children || []).length ? nodeW : Math.min(430, cv.W - cv.M - (cv.M + colW * n._d)); n._l = wrap(n.text, n._w - S.PAD * 2, S.FS); n._s = wrap(n.sub || [], n._w - S.PAD * 2, S.FS); n._h = Math.max(54, measure(n._l, S.FS).h + (n._s.length ? S.FS * 0.55 + measure(n._s, S.FS).h : 0) + S.PAD * 2 + 2); });
    let cur = cv.M; const place = n => { const ch = n.children || []; if (!ch.length) { n._c = cur + n._h / 2; cur += n._h + gapY; } else { const s0 = cur; ch.forEach(place); n._c = (ch[0]._c + ch[ch.length - 1]._c) / 2; if (cur - s0 < n._h + gapY) cur = s0 + n._h + gapY; } };
    place(spec.root);
    all.forEach(n => { n._b = cv.node(cv.M + colW * n._d, n._c, { middle: true, w: n._w, head: n._l, headBold: !!(n.children || []).length, lines: n._s, accent: n.accent, dash: n.dash, kind: n.kind, under: under(n) }); });
    const E = []; all.forEach(n => { if (!n._par) return; const a = n._par._b, b = n._b, xm = a.x1 + 18;
      const pts = Math.abs(a.cy - b.cy) < 2 ? [[a.x1, a.cy], [b.x0 - 6, b.cy]] : [[a.x1, a.cy], [xm, a.cy], [xm, b.cy], [b.x0 - 6, b.cy]]; cv.poly(pts, { head: 'end', accent: n.accentEdge }); E.push({ n, pts }); });
    E.forEach(e => { if (!e.n.edge) return; const last = e.pts.slice(-2), ls = wrap(e.n.edge, Math.abs(last[1][0] - last[0][0]) - 12, S.FS), mx = (last[0][0] + last[1][0]) / 2, yy = last[0][1];
      cv.label(ls, [{ x: mx, y: yy - 9 - measure(ls, S.FS).h + S.FS * 0.86 }, { x: mx, y: yy + 7 + S.FS * 0.86 }], { role: 'edge-label' }); });
  } else {
    const gapX = 26, leafW = Math.min(250, (cv.W - cv.M * 2 - gapX * (leaves - 1)) / leaves);
    all.forEach(n => { n._l = wrap(n.text, leafW - S.PAD * 2, S.FS); n._s = wrap(n.sub || [], leafW - S.PAD * 2, S.FS); n._h = Math.max(50, measure(n._l, S.FS).h + (n._s.length ? S.FS * 0.55 + measure(n._s, S.FS).h : 0) + S.PAD * 2 + 2); });
    const total = leaves * leafW + (leaves - 1) * gapX; let cur = (cv.W - total) / 2;
    const place = n => { const ch = n.children || []; if (!ch.length) { n._c = cur + leafW / 2; cur += leafW + gapX; } else { ch.forEach(place); n._c = (ch[0]._c + ch[ch.length - 1]._c) / 2; } };
    place(spec.root);
    // 枝の語：枝（子の箱に入る縦線）の右、隣の枝までの空きに置く。行数に合わせて、その段の上の間隔を広げる
    const byD = []; all.forEach(n => { (byD[n._d] = byD[n._d] || []).push(n); });
    byD.forEach(row => row.sort((p, q) => p._c - q._c).forEach((n, i) => { const nx = row[i + 1]; n._lw = Math.max(60, Math.min(nx ? nx._c - n._c - 22 : 1e9, cv.W - cv.M - n._c - 10, 260)); const w0 = wrapLog.length; n._e = n.edge ? wrap(n.edge, n._lw, S.FS) : [];
      // 右端の枝：右の空きに一行で入らなければ、枝の左（手前の枝の語との間）に置く
      const pv = row[i - 1]; if (n.edge && !nx && n._e.length > 1 && pv) { const lw = n._c - pv._c - 22 - (pv._e.length ? measure(pv._e, S.FS).w + 16 : 0); if (lw >= Math.max(...String(n.edge).split('|').map(t => textW(t, S.FS)))) { wrapLog.length = w0; n._e = wrap(n.edge, lw, S.FS); n._left = true; } } }));
    const dh = []; all.forEach(n => { dh[n._d] = Math.max(dh[n._d] || 0, n._h); });
    const gY = d => Math.max(74, 22 + 8 + Math.max(0, ...(byD[d] || []).map(n => measure(n._e, S.FS).h)) + 16);
    const dy = []; let y = cv.M; dh.forEach((h, d) => { dy[d] = y; y += h + gY(d + 1); });
    all.forEach(n => { n._b = cv.node(n._c, dy[n._d], { center: true, w: leafW, h: dh[n._d], head: n._l, headBold: !!(n.children || []).length, lines: n._s, accent: n.accent, dash: n.dash, kind: n.kind, under: under(n) }); });
    const E = []; all.forEach(n => { if (!n._par) return; const a = n._par._b, b = n._b, ym = a.y1 + 22;
      const pts = Math.abs(a.cx - b.cx) < 2 ? [[a.cx, a.y1], [b.cx, b.y0 - 6]] : [[a.cx, a.y1], [a.cx, ym], [b.cx, ym], [b.cx, b.y0 - 6]]; cv.poly(pts, { head: spec.noHeads ? undefined : 'end', accent: n.accentEdge }); E.push({ n, pts, ym }); });
    E.forEach(e => { if (!e.n._e.length) return; const b = e.n._b, x = b.cx, top = e.ym + 8 + S.FS * 0.86, m = measure(e.n._e, S.FS);
      const Rt = { x: x + 10, y: top, anchor: 'start' }, Lt = { x: x - 10, y: top, anchor: 'end' };
      cv.label(e.n._e, (e.n._left ? [Lt, Rt] : [Rt, Lt]).concat([{ x: x + 10, y: b.y0 - 12 - (m.h - S.FS), anchor: 'start' }]), { role: 'edge-label' }); });
  }
  footNotes(cv, spec.notes, cv.maxY);
};
