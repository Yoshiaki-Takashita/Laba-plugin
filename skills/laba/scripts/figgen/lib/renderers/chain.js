'use strict';
/* 権利移転の連鎖・対抗関係。左から右へ権利が移る。枝分かれ（二重譲渡）も描ける。移転でない関係（対抗・優劣）は破線の両矢印で結ぶ。
   spec: { nodes:[{id,label,sub,kind,accent,gray,note}], links:[{from,to,label,sub,accent,dash}], relations:[{a,b,label,sub,accent,head:'both'|'a'|'b'|'none',side,solid}],
           groups:[{members:[id,…],label}], nodeWidth, rowGap, notes }
   links＝権利が移る向き（from から to へ）。relations＝移転でない関係（対抗・優劣）。head は矢じりの付く側：'a'＝ b から a へ（「b が a に対抗できる」なら head:'a'）、
   'b'＝ a から b へ、'both'＝互いに、'none'＝向きなし。矢印は「元の者が、先の者に、label する」と読める向きに付ける。
   relations は破線（まだ争いうる関係）。確定した帰結として描くなら solid:true（細い実線）。nodeWidth＝箱の幅、rowGap＝上下の箱の間隔（線の横の語が入らないとき広げる）。
   nodes[].kind：'thing'（物）／'right'（権利）／'proc'（手続）／'organ'（機関）。nodes[].note＝箱のそばに置く短い注（灰の引出線）。groups＝範囲の枠。 */
const { S, wrap, measure, footNotes } = require('../core');
module.exports = function (spec, cv) {
  const nodes = spec.nodes, links = spec.links || [], byId = {}; nodes.forEach(n => { byId[n.id] = n; n._ch = []; n._depth = 0; });
  links.forEach(l => { if (byId[l.from] && byId[l.to]) { byId[l.from]._ch.push(byId[l.to]); byId[l.to]._par = byId[l.from]; } });
  const roots = nodes.filter(n => !n._par); const setD = (n, d) => { n._depth = d; n._ch.forEach(c => setD(c, d + 1)); }; roots.forEach(r => setD(r, 0));
  const depths = Math.max(...nodes.map(n => n._depth)) + 1, colW = (cv.W - cv.M * 2) / depths, nodeW = spec.nodeWidth || Math.min(220, colW - 150);
  nodes.forEach(n => { n._l = wrap(n.label, nodeW - S.PAD * 2, S.FS); n._s = wrap(n.sub || [], nodeW - S.PAD * 2, S.FS); n._h = measure(n._l, S.FS).h + (n._s.length ? S.FS * 0.55 + measure(n._s, S.FS).h : 0) + S.PAD * 2 + 2; });
  const rowGap = spec.rowGap || 104; const segW0 = colW - nodeW - 26 - 14;
  const labH = Math.max(0, ...links.map(l => measure(wrap([].concat(l.label || [], l.sub || []), segW0, S.FS), S.FS).h));
  const minH = Math.min(...nodes.map(n => n._h)); let cursor = cv.M + Math.max(0, labH + 12 - minH / 2);
  const place = n => { if (!n._ch.length) { n._cy = cursor + n._h / 2; cursor += n._h + rowGap; } else { n._ch.forEach(place); n._cy = (n._ch[0]._cy + n._ch[n._ch.length - 1]._cy) / 2; } };
  roots.forEach(place);
  const box = {}; nodes.forEach(n => { box[n.id] = cv.node(cv.M + colW * n._depth + (colW - nodeW) / 2, n._cy, { middle: true, w: nodeW, head: n._l, headBold: true, lines: n._s, accent: n.accent, gray: n.gray, kind: n.kind }); });
  (spec.groups || []).forEach(g => { const bbs = (g.members || []).map(id => box[id]).filter(Boolean); if (bbs.length) cv.group(bbs, g.label, { accent: g.accent }); });
  const paths = links.map(l => { const a = box[l.from], b = box[l.to]; const xm = a.x1 + 26;
    const pts = Math.abs(a.cy - b.cy) < 2 ? [[a.x1, a.cy], [b.x0 - 6, b.cy]] : [[a.x1, a.cy], [xm, a.cy], [xm, b.cy], [b.x0 - 6, b.cy]];
    cv.poly(pts, { head: 'end', accent: l.accent, dash: l.dash }); return { l, pts, a, b }; });
  const rel = (spec.relations || []).map(r => { const a = box[r.a], b = box[r.b]; let pts;
    if (Math.abs(a.cx - b.cx) < 2) { const up = a.cy < b.cy ? a : b, dn = a.cy < b.cy ? b : a; pts = [[up.cx, up.y1 + 6], [up.cx, dn.y0 - 6]]; } else pts = cv.route(a, b);
    // head: 'both'（既定・対抗しあう）／'a'（b から a へ：b が a に対抗できる 等）／'b'／'none'
    const A = box[r.a], hd = r.head === 'none' ? undefined : (r.head === 'a' || r.head === 'b') ? ((Math.hypot(pts[pts.length - 1][0] - A.cx, pts[pts.length - 1][1] - A.cy) < Math.hypot(pts[0][0] - A.cx, pts[0][1] - A.cy)) === (r.head === 'a') ? 'end' : 'start') : 'both';
    cv.poly(pts, { head: hd, dash: !r.solid, accent: r.accent }); return { r, pts }; });
  paths.forEach(p => { const lines = [].concat(p.l.label || [], p.l.sub || []); if (!lines.length) return; const last = p.pts.slice(-2), segW = Math.abs(last[1][0] - last[0][0]);
    const ls = wrap(lines, segW - 14, S.FS), mx = (last[0][0] + last[1][0]) / 2, yy = last[0][1], h = measure(ls, S.FS).h;
    cv.label(ls, [{ x: mx, y: yy - 10 - h + S.FS * 0.86 }, { x: mx, y: yy + 8 + S.FS * 0.86 }]); });
  rel.forEach(q => { const lines = wrap([].concat(q.r.label || [], q.r.sub || []), 250, S.FS); cv.edgeLabel(q.pts, lines, { side: q.r.side }); });
  nodes.forEach(n => { if (n.note && box[n.id]) cv.callout(box[n.id], n.note); });
  footNotes(cv, spec.notes, cv.maxY);
};
