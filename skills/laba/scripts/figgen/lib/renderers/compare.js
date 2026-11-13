'use strict';
/* 比較図：似た場面を左右（2〜3列）に並べ、同じ段に同じ問いを置く。違いが出る段だけ強調。
   spec: { columns:[{title}], rows:[{label, cells:[str|[lines]|{split:[str|{text,accent}]}], accent:[列番号], dash:[列番号], arrow:false}], arrows:true, notes:[] }
   cells の一つを {split:[…]} にすると、その列の中をさらに左右に割る（例：被告ごとに分ける）。上下の段で割り方が同じなら矢印は半分どうしを結ぶ。
   arrows:false＝段の間の矢印を全部やめる（上から下への推論でなく、観点ごとの見比べのとき）。rows[].arrow:false＝その段の上の矢印だけやめる。
   rows[].under:true＝結論の段（箱の下辺を太くする）。rows[].align:'left'＝その段の語を左寄せ。
   列の見出しは 24。三行以上に折れるときは、字を 21 の太字に下げる（収まらないときの順序：語を減らす→箱を広げる→見出しの字を下げる）。
   見出しの帯：列の見出しの下に、列の幅いっぱいの太い線を引く（罫線の表と見分ける。色は増やさない）。header:'plain' でやめる。
   セルを {text, except} にすると、箱の下の部分に細い点線で区切って例外の一行（ただし書・適用除外）を置く（注を図に戻す）。 */
const { S, C, wrap, measure, footNotes } = require('../core');
module.exports = function (spec, cv) {
  const cols = spec.columns, n = cols.length, rows = spec.rows || [];
  const labW = Math.min(150, Math.max(0, ...rows.map(r => r.label ? measure(wrap(r.label, 130, S.FS), S.FS).w : 0)) + (rows.some(r => r.label) ? 18 : 0));
  const gap = 40, x0 = cv.M + labW, colW = (cv.W - cv.M - x0 - gap * (n - 1)) / n, sg = 12;
  let y = cv.M + S.FL;
  let tl = cols.map(c => wrap(c.title, colW, S.FL)), ts = S.FL;
  if (tl.some(l => l.length >= 3)) { ts = S.FS; tl = cols.map(c => wrap(c.title, colW, S.FS)); y = cv.M + S.FS; }
  const th = Math.max(...tl.map(l => measure(l, ts).h));
  cols.forEach((c, i) => cv.text(x0 + i * (colW + gap) + colW / 2, y, tl[i], { size: ts, anchor: 'middle', bold: ts === S.FS }));
  y += th - ts + 22; const top = y;
  if (spec.header !== 'plain') { cols.forEach((c, i) => cv.line(x0 + i * (colW + gap), y - 4, x0 + i * (colW + gap) + colW, y - 4, { thick: true, obst: false, role: 'shape' })); y += 10; }
  // 一つのセルを「部分」の並びにそろえる（割らないセルは部分が一つ）
  const parts = (r, i) => { const c = r.cells[i]; const list = (c && typeof c === 'object' && !Array.isArray(c) && Array.isArray(c.split)) ? c.split : [c];
    const w = (colW - sg * (list.length - 1)) / list.length;
    return list.map((p, k) => { const o = (p && typeof p === 'object' && !Array.isArray(p)) ? p : { text: p };
      const ex = o.except ? wrap(o.except, w - S.PAD * 2, S.FS) : [];
      return { x: x0 + i * (colW + gap) + k * (w + sg), w, lines: wrap(o.text, w - S.PAD * 2, S.FS), ex, rb: ex.length ? measure(ex, S.FS).h + 22 : 0, accent: o.accent != null ? o.accent : (r.accent || []).includes(i), dash: o.dash != null ? o.dash : (r.dash || []).includes(i) }; }); };
  let prev = null;
  rows.forEach((r, ri) => {
    const ps = r.cells.map((t, i) => parts(r, i)); const h = Math.max(...ps.map(l => Math.max(...l.map(p => measure(p.lines, S.FS).h + p.rb)))) + S.PAD * 2 + 4;
    const arrow = spec.arrows !== false && r.arrow !== false && ri > 0;
    if (ri > 0) y += arrow ? 46 : 16;
    if (r.label) cv.textCenter(cv.M + (labW - 18) / 2, y + h / 2, wrap(r.label, labW - 18, S.FS));
    const nodes = ps.map(l => l.map(p => { const nd = cv.node(p.x, y, { w: p.w, h, lines: p.lines, accent: p.accent, dash: p.dash, align: r.align, under: r.under, reserveBottom: p.rb });
      if (p.ex.length) { const ly = nd.y1 - p.rb; cv.line(nd.x0 + S.PAD, ly, nd.x1 - S.PAD, ly, { gray: true, obst: false, role: 'shape', dash: 'dot' }); cv.text(nd.cx, ly + 10 + S.FS * 0.8, p.ex, { anchor: 'middle' }); }
      return nd; }));
    if (prev && arrow) nodes.forEach((l, i) => { const up = prev[i];
      // 上下で割り方が同じ→一対一。違う→割れている側の各部分から（へ）一本ずつ
      const xs = l.length === up.length ? l.map(nd => nd.cx) : (l.length > up.length ? l : up).map(nd => nd.cx);
      xs.forEach(x => cv.poly([[x, up[0].y1], [x, l[0].y0 - 6]], { head: 'end' })); });
    prev = nodes; y += h;
  });
  for (let i = 1; i < n; i++) { const x = x0 + i * (colW + gap) - gap / 2; cv.line(x, top - 6, x, y + 6, { gray: true, obst: false }); }
  footNotes(cv, spec.notes, y);
};
