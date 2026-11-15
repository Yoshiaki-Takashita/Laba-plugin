'use strict';
/* 当事者関係図（二者・三者間・多数当事者）。格子に当事者を置き、関係を矢印で結ぶ。同じ二者の間の矢印は平行にずらして積む。
   spec: { nodes:[{id,label,sub,pos:[列,行],kind,accent,gray,note}], edges:[{from,to,label,sub,accent,dash,head:'end'|'both'|'none',stop,step,port,straight,elbow:'vh'|'hv'}],
           groups:[{members:[id,…], label, accent}]（範囲の枠）, legend:[{sample,text}]（凡例）, nodeWidth, rowGap,
           pict:true（線の人型＋語。スライド向け）, showStep:n（step<=n だけ描き、step==n を強調）, band:[下部の帯の行], notes }
   nodes[].kind：人でない対象の描き分け。'thing'（物・書類）／'right'（権利・地位）／'proc'（手続・行為）／'organ'（機関）。省略＝人。
   経路はエンジンが決める：端点でない箱を貫通せず、別の線と同じ筋に重ならない形を、直線・L 字・Z 字・迂回の候補から選ぶ。
   形を自分で決めたいときだけ elbow（vh＝出る側の上下の辺から縦に出て、入る側の横腹に入る／hv＝横に出て、上下の辺に入る）、port（-1〜1。出る位置を辺の上でずらす）、straight を書く。
   どの候補でも貫通・重なりが残ると warn が出る。そのときは pos を入れ替えるか、図を分ける。
   矢じりは移転・請求など向きのある関係だけ。向きのない関係（身分・対抗）は head:'none' か 'both'。 */
const { S, Canvas, wrap, measure, footNotes, fitWidth, wrapLog, atoms, textW } = require('../core');
function layout(spec, cv, rowGap, oneLine) {
  const nodes = spec.nodes.map((n, i) => Object.assign({ pos: [i, 0] }, n));
  const edges = (spec.edges || []).filter(e => spec.showStep == null || e.step == null || e.step <= spec.showStep);
  const cols = Math.max(...nodes.map(n => n.pos[0])) + 1, rows = Math.max(...nodes.map(n => n.pos[1])) + 1;
  const cellW = (cv.W - cv.M * 2) / cols, inset = spec.pict ? 0 : S.PAD * 2;
  // 箱の幅：指定がなければ、どの語も語の途中で折れない最小の幅に広げる（上限は格子の幅から線の分を引いた所まで）
  const base = Math.min(230, Math.max(150, cellW * 0.46));
  // 隣り合う箱を結ぶ横の矢印には、その語のいちばん長い「折れない単位」が入る幅を残す
  const pos = {}; nodes.forEach(n => { pos[n.id] = n.pos; });
  const need = Math.max(0, ...edges.map(e => { const a = pos[e.from], b = pos[e.to]; if (!a || !b || a[1] !== b[1] || Math.abs(a[0] - b[0]) !== 1) return 0; return Math.max(0, ...[].concat(e.label || [], e.sub || []).flatMap(t => atoms(t).map(x => textW(x, S.FS)))) + 30; }));
  const nodeW = spec.nodeWidth || (spec.pict ? base : fitWidth(nodes.map(n => [n.label, n.sub || []]), base, Math.max(base, Math.min(270, cellW - 96, cellW - need)), { maxLines: oneLine ? 1 : 2 }));
  const prep = nodes.map(n => { const ex = n.kind === 'thing' || n.kind === 'proc' ? 12 : n.kind === 'organ' ? 8 : 0, l = wrap(n.label, nodeW - inset - ex, S.FS), s = wrap(n.sub || [], nodeW - inset - ex, S.FS);
    const h = spec.pict ? 56 + 8 + measure(l, S.FS).h + (s.length ? 8 + measure(s, S.FS).h : 0) : measure(l, S.FS).h + (s.length ? S.FS * 0.55 + measure(s, S.FS).h : 0) + S.PAD * 2 + 2 + (n.kind === 'organ' ? 8 : 0); return { l, s, h }; });
  const rowH = []; for (let r = 0; r < rows; r++) rowH[r] = Math.max(0, ...nodes.map((n, i) => n.pos[1] === r ? prep[i].h : 0));
  const groups = spec.groups || [], topPad = groups.some(g => (g.members || []).some(id => (nodes.find(n => n.id === id) || { pos: [0, 1] }).pos[1] === 0)) ? S.FS + 30 : 0;
  const noteTop = Math.max(0, ...nodes.map(n => n.note && n.pos[1] === 0 ? measure(wrap(n.note, 270, S.FS), S.FS).h + 34 : 0));
  // 一段目の横の矢印の上に語を置く余地：語の高さが箱の上半分より高ければ、その分だけ全体を下げる
  const byId = {}; nodes.forEach(n => { byId[n.id] = n; });
  const labTop = Math.max(0, ...edges.map(e => { const a = byId[e.from], b = byId[e.to]; if (!a || !b || a.pos[1] !== 0 || b.pos[1] !== 0) return 0;
    const n0 = wrapLog.length, ls = wrap([].concat(e.label || [], e.sub || []), Math.max(110, Math.abs(a.pos[0] - b.pos[0]) * cellW - nodeW - 24), S.FS); wrapLog.length = n0;
    return measure(ls, S.FS).h + 12 - rowH[0] / 2 + 34 * ((edges.filter(x => [x.from, x.to].sort().join() === [e.from, e.to].sort().join()).length - 1) / 2); }));
  const rowY = []; let y = cv.M + Math.max(topPad, noteTop, labTop); for (let r = 0; r < rows; r++) { rowY[r] = y; y += rowH[r] + rowGap; }
  const box = {};
  nodes.forEach((n, i) => {
    const p = prep[i], cx = cv.M + cellW * n.pos[0] + cellW / 2, top = rowY[n.pos[1]] + (rowH[n.pos[1]] - p.h) / 2;
    if (spec.pict) {
      cv.person(cx, top, { gray: n.gray }); let ty = top + 56 + 8;
      cv.text(cx, ty + S.FS * 0.86, p.l, { anchor: 'middle', bold: true }); ty += measure(p.l, S.FS).h + 8;
      if (p.s.length) cv.text(cx, ty + S.FS * 0.86, p.s, { anchor: 'middle' });
      const w = Math.max(40, measure(p.l, S.FS).w, measure(p.s, S.FS).w) + 16;
      box[n.id] = cv.addNode({ x0: cx - w / 2, x1: cx + w / 2, y0: top - 4, y1: top + p.h + 4, cx, cy: top + p.h / 2 }, p.l[0]);
    } else box[n.id] = cv.node(cx, rowY[n.pos[1]], { center: true, w: nodeW, h: rowH[n.pos[1]], head: p.l, headBold: true, lines: p.s, gray: n.gray, accent: n.accent, kind: n.kind, under: n.under });
  });
  // 範囲の枠は線より先に描く（線は枠をまたいでよいが、枠の辺と同じ筋には乗せない）
  groups.forEach(g => { const bbs = (g.members || []).map(id => box[id]).filter(Boolean); if (bbs.length < (g.members || []).length) cv.warn.push(`groups の members に nodes にない id がある：${(g.members || []).filter(id => !box[id]).join('・')}`); if (bbs.length) cv.group(bbs, g.label, { accent: g.accent }); });
  const pair = {}; edges.forEach(e => { const k = [e.from, e.to].sort().join('|'); (pair[k] = pair[k] || []).push(e); });
  // 経路は、まっすぐ結べる組（同じ行・同じ列）を先に決め、斜めの組を後から通す
  const aligned = e => { const a = box[e.from], b = box[e.to]; return a && b && (Math.abs(a.cx - b.cx) < 2 || Math.abs(a.cy - b.cy) < 2) ? 0 : 1; };
  const order = edges.map((e, i) => i).sort((i, j) => aligned(edges[i]) - aligned(edges[j]) || i - j), drawn = [];
  order.forEach(i => {
    const e = edges[i], g = pair[[e.from, e.to].sort().join('|')], k = g.indexOf(e), m = g.length, a = box[e.from], b = box[e.to];
    if (!a || !b) { cv.warn.push(`edges の from/to が nodes にない：${e.from}→${e.to}（この線は描かれない）`); return; }
    const shift = (k - (m - 1) / 2) * 34;
    let pts = cv.route(a, b, { shift, port: e.port, straight: e.straight, elbow: e.elbow });
    const acc = e.accent || (spec.showStep != null && e.step === spec.showStep);
    if (e.stop) { const p = pts[0], q = pts[pts.length - 1], t = 0.6, sx = p[0] + (q[0] - p[0]) * t, sy = p[1] + (q[1] - p[1]) * t; pts = [p, [sx, sy]]; cv.poly(pts, { accent: acc, dash: e.dash }); cv.stopBar(sx, sy, Math.abs(q[0] - p[0]) < Math.abs(q[1] - p[1]), { accent: acc }); }
    else cv.poly(pts, { accent: acc, dash: e.dash, head: e.head === 'none' ? undefined : (e.head || 'end') });
    drawn[i] = { e, pts, k, m };
  });
  drawn.forEach(d => {
    if (!d) return; const lines = [].concat(d.e.label || [], d.e.sub || []); if (!lines.length) return;
    let bl = 0, bi = 0; for (let i = 0; i < d.pts.length - 1; i++) { const l = Math.hypot(d.pts[i + 1][0] - d.pts[i][0], d.pts[i + 1][1] - d.pts[i][1]); if (l > bl) { bl = l; bi = i; } }
    const horiz = Math.abs(d.pts[bi + 1][1] - d.pts[bi][1]) < 1;
    const widths = horiz && d.pts.length === 2 ? [Math.max(110, bl - 18)] : horiz ? [250, Math.max(110, bl - 18)] : [250, 190, 150, 120];
    cv.edgeLabel(d.pts, wrap(lines, widths[0], S.FS), { side: d.m > 1 && d.k % 2 === 1 ? (horiz ? 'below' : 'left') : undefined, fit: { raw: lines, widths } });
  });
  nodes.forEach(n => { if (n.note && box[n.id]) cv.callout(box[n.id], n.note); });
  let by = cv.maxY;
  if (cv.legendItems && cv.legendItems.length && !cv.inPanel && spec.band && spec.band.length) { by = cv.legend(cv.legendItems, by + 6); cv.legendItems = null; }
  if (spec.band && spec.band.length) { by += 22; cv.line(cv.M, by, cv.W - cv.M, by, { thick: true, obst: false }); by += 12;
    spec.band.forEach((t, i) => { const ls = wrap(t, cv.W - cv.M * 2, S.FS); cv.text(cv.M, by + S.FS * 0.86, ls, { bold: i === 0 && spec.pict }); by += measure(ls, S.FS).h + 10; }); }
  footNotes(cv, spec.notes, by);
}
module.exports = function (spec, cv) {
  // 箱の幅（語が一行に入る幅／二行に折る幅）と、行の間隔（線の横の語が入る広さ）は、試し描きで warn の少ない組を選ぶ。指定があればそれを使う
  const gaps = spec.rowGap ? [spec.rowGap] : [112, 150, 190], modes = spec.nodeWidth || spec.pict ? [false] : [true, false]; let best = null;
  if (gaps.length * modes.length > 1) for (const one of modes) { for (const g of gaps) { const t = new Canvas({ width: cv.W }), n0 = wrapLog.length; layout(spec, t, g, one); const bad = t.warn.reduce((k, w) => k + (/置き場|貫通|同じ筋|重なり|版面の外/.test(w) ? 10 : 1), 0) + (wrapLog.length - n0); wrapLog.length = n0;   // 重い warn（置けない・貫通・重なり）は 10 倍に数える
    if (!best || bad < best.bad) best = { g, one, bad }; if (!bad) break; } if (best && !best.bad) break; }
  else best = { g: gaps[0], one: modes[0] };
  layout(spec, cv, best.g, best.one);
};
