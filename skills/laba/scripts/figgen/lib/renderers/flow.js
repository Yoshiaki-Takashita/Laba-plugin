'use strict';
/* 流れ図：段階を踏み、途中で枝分かれする手続・判断。矢印を省かない。分岐の答えは矢印の横に語で。
   spec: { direction:'down'|'right', steps:[{text, sub, pass, kind, exit:{label,text,sub,eg,accent}, accent}], pass:'満たす', end:{text,sub,accent}, mergeExits, exitStyle:'rail'|'box', notes }
   出口がどれも同じ（例：却下）なら一本の縦線に集めて、終点と同じ段の箱へ落とす。出口が段ごとに違えば、段の右に箱を一つずつ置く。
   exit.label＝枝の上の語（「当たらない」）、exit.text＝出口の箱の語（「訴えの却下」）、exit.sub＝出口の箱の二行目（帰結を一行で）、
   exit.eg＝枝の下に置く一行（その段で落ちる例・理由。合流のとき右の列が空くので、ここに中身を置く）。
   mergeExits:false＝出口が同じ語でも段ごとに箱を置く。exitStyle:'box'＝出口を一つの縦長の箱にまとめる（既定の 'rail' は一本の縦線に集める）。
   問いの箱は細い枠、結論の箱（出口・終点）は下辺を太くして見分ける（終点を accent にしたときは枠全体が太い）。出口の箱の高さは中身に合わせる。
   steps[].branch:[{label, text, sub, accent}]＝段の中の小さな分岐（例外の小枝）。段の箱の下の部分に、細い区切りの下に
   「label →［text／sub］」を一行ずつ置く（ただし書・適用除外・例外を、注でなく図の中に出す）。小枝は二つまで（三つ目以降は warn を出して描かない）。
   右向き（direction:'right'）でも、段ごとの pass と小枝を描く（箱が狭いので、枝の語→短い矢印→小箱を縦に積む）。 */
const { S, wrap, measure, footNotes } = require('../core');
module.exports = function (spec, cv) {
  const steps = spec.steps.slice(); if (spec.end) steps.push(Object.assign({ isEnd: true }, spec.end));
  if ((spec.direction || 'down') === 'right') return right(spec, cv, steps);
  const hasExit = steps.some(s => s.exit), mainW = hasExit ? 430 : 520, exW = 250, gapX = 160;
  const mx = hasExit ? (cv.W - mainW - gapX - exW) / 2 : (cv.W - mainW) / 2, ex = mx + mainW + gapX;
  const exits = steps.filter(s => s.exit), same = exits.length > 1 && exits.every(s => s.exit.text === exits[0].exit.text) && spec.mergeExits !== false;
  let y = cv.M, prev = null; const nodes = [];
  // 段ごとに出口の箱を置くとき：出口の箱が段の箱より高ければ、段の箱をその高さにそろえる（出口の箱が上下にはみ出さない）
  const exH = s => { if (!s.exit || same) return 0; const a = wrap(s.exit.text, exW - S.PAD * 2, S.FS), b = wrap(s.exit.sub || [], exW - S.PAD * 2, S.FS); return measure(a, S.FS).h + (b.length ? S.FS * 0.55 + measure(b, S.FS).h : 0) + S.PAD * 2; };
  steps.forEach((s, i) => {
    const br = branchBlock(cv, s, mainW);
    const nd = cv.node(mx, y, { w: mainW, head: s.text, headBold: true, lines: s.sub || [], accent: s.accent, minH: Math.max(64, exH(s)), kind: s.kind, under: !!s.isEnd, reserveBottom: br.h });
    if (br.h) drawBranch(cv, nd, br);
    if (prev) { const p = cv.poly([[nd.cx, prev.y1], [nd.cx, nd.y0 - 6]], { head: 'end' }); if (spec.pass || steps[i - 1].pass) cv.edgeLabel(p, steps[i - 1].pass || spec.pass, { side: 'right' }); }
    nodes.push(nd); prev = nd; y = nd.y1 + 58;
  });
  if (same) {
    const endNode = spec.end && !spec.end.exit ? nodes[nodes.length - 1] : null;
    if (endNode && spec.exitStyle !== 'box') {
      // 合流：出口の線を一本の縦線に集め、終点の箱と同じ段に置いた箱へ落とす（背の高い空箱を作らない）
      // 出口の箱は中身の高さにし、終点の箱と中心をそろえる。二行目に帰結（exit.sub）を一行で
      const esub = (exits.find(s => s.exit.sub) || { exit: {} }).exit.sub || [];
      const en = cv.node(ex, endNode.cy, { middle: true, w: exW, minH: 56, head: exits[0].exit.text, headBold: true, lines: esub, accent: exits[0].exit.accent, under: true });
      const rail = en.cx;
      exits.forEach((s, k) => { const nd = nodes[steps.indexOf(s)];
        const pts = k === 0 ? [[nd.x1, nd.cy], [rail, nd.cy], [rail, en.y0 - 6]] : [[nd.x1, nd.cy], [rail, nd.cy]];
        cv.poly(pts, k === 0 ? { head: 'end' } : {});
        cv.edgeLabel([[nd.x1, nd.cy], [rail - 20, nd.cy]], wrap(s.exit.label, rail - nd.x1 - 30, S.FS));
        if (s.exit.eg) { const ls = wrap(s.exit.eg, rail - nd.x1 - 30, S.FS); cv.label(ls, [{ x: (nd.x1 + rail) / 2, y: nd.cy + 9 + S.FS * 0.86 }], { role: 'edge-note' }); } });
    } else {
      const first = nodes[steps.indexOf(exits[0])], last = nodes[steps.indexOf(exits[exits.length - 1])];
      const en = cv.node(ex, first.y0, { w: exW, h: last.y1 - first.y0, head: exits[0].exit.text, headBold: true, lines: exits[0].exit.sub || [], accent: exits[0].exit.accent });
      exits.forEach(s => { const nd = nodes[steps.indexOf(s)]; const p = cv.poly([[nd.x1, nd.cy], [en.x0 - 6, nd.cy]], { head: 'end' }); cv.edgeLabel(p, s.exit.label); });
    }
  } else exits.forEach(s => {
    const nd = nodes[steps.indexOf(s)]; const en = cv.node(ex, nd.cy, { w: exW, middle: true, head: s.exit.text, headBold: true, lines: s.exit.sub || [], accent: s.exit.accent, minH: 56, under: true });
    const p = cv.poly([[nd.x1, nd.cy], [en.x0 - 6, nd.cy]], { head: 'end' }); cv.edgeLabel(p, wrap(s.exit.label, gapX - 22, S.FS));
    if (s.exit.eg) cv.label(wrap(s.exit.eg, gapX - 22, S.FS), [{ x: (nd.x1 + en.x0) / 2, y: nd.cy + 9 + S.FS * 0.86 }], { role: 'edge-note' });
  });
  footNotes(cv, spec.notes, cv.maxY);
};
function right(spec, cv, steps) {
  // 右向き：段の箱を横に並べる。段ごとの通過の語（steps[].pass）と、段の中の小枝（steps[].branch）も描く（以前は黙って落ちていた）
  const anyPass = spec.pass || steps.some(s => s.pass);
  const n = steps.length, gap = anyPass ? 78 : 50, w = (cv.W - cv.M * 2 - gap * (n - 1)) / n; let y = cv.M;
  const prep = steps.map(s => ({ h: wrap(s.text, w - S.PAD * 2, S.FS), l: wrap(s.sub || [], w - S.PAD * 2, S.FS) }));
  const brs = steps.map(s => branchNarrow(cv, s, w));
  const h0 = Math.max(...prep.map(p => measure(p.h, S.FS).h + (p.l.length ? S.FS * 0.55 + measure(p.l, S.FS).h : 0))) + S.PAD * 2 + 6;
  const ay = y + h0 / 2;                                     // 段をつなぐ矢印の高さ：問いの部分の中央（小枝のある箱だけ下に伸びる）
  let prev = null; const nodes = [];
  steps.forEach((s, i) => {
    const nd = cv.node(cv.M + i * (w + gap), y, { w, h: h0 + brs[i].h, head: s.text, headBold: true, lines: s.sub || [], accent: s.accent, kind: s.kind, under: !!s.isEnd, reserveBottom: brs[i].h });
    if (brs[i].h) drawBranchNarrow(cv, nd, brs[i], brs[i].h);
    if (prev) { const p = cv.poly([[prev.x1, ay], [nd.x0 - 6, ay]], { head: 'end' }); const ps = steps[i - 1].pass || spec.pass; if (ps) cv.edgeLabel(p, wrap(ps, gap - 12, S.FS)); }
    nodes.push(nd); prev = nd;
  });
  const ey = Math.max(...nodes.map(nd => nd.y1)) + 62;
  steps.forEach((s, i) => { if (!s.exit) return; const nd = nodes[i];
    const en = cv.node(nd.cx, ey, { center: true, w, head: s.exit.text, headBold: true, lines: s.exit.sub || [], accent: s.exit.accent, minH: 52, under: true });
    const p = cv.poly([[nd.cx, nd.y1], [nd.cx, en.y0 - 6]], { head: 'end' }); cv.edgeLabel(p, s.exit.label, { side: 'right' }); });
  footNotes(cv, spec.notes, cv.maxY);
}
/* 右向きの小枝：箱が狭いので、枝の語 → 下向きの短い矢印 → 小さな箱、を縦に積む */
function branchNarrow(cv, s, W) {
  const list = branchList(cv, s);
  if (!list.length) return { h: 0, rows: [] };
  const inW = W - S.PAD * 2;
  const rows = list.map(b => {
    const lab = wrap(b.label || '', inW, S.FS), head = wrap(b.text || '', inW - BR_PAD * 2, S.FS), sub = wrap(b.sub || [], inW - BR_PAD * 2, S.FS);
    const bh = measure(head, S.FS).h + (sub.length ? S.FS * 0.45 + measure(sub, S.FS).h : 0) + BR_PAD * 2;
    return { b, lab, head, sub, bh, lh: measure(lab, S.FS).h, h: measure(lab, S.FS).h + 22 + bh };
  });
  return { rows, inW, h: rows.reduce((a, r) => a + r.h + 10, 0) + 14 };
}
function drawBranchNarrow(cv, nd, br, area) {
  let y = nd.y1 - area + 4;
  cv.line(nd.x0 + S.PAD, y, nd.x1 - S.PAD, y, { gray: true, obst: false, role: 'shape', dash: 'dot' });
  y += 10;
  for (const r of br.rows) {
    cv.text(nd.cx, y + S.FS * 0.8, r.lab, { anchor: 'middle', role: 'edge-label' }); y += r.lh + 4;
    cv.poly([[nd.cx, y], [nd.cx, y + 13]], { head: 'end', obst: false, role: 'shape', accent: r.b.accent }); y += 18;
    const bx = nd.x0 + S.PAD;
    cv.rect(bx, y, br.inW, r.bh, { role: 'shape', obst: false, accent: r.b.accent });
    let ty = y + BR_PAD + S.FS * 0.8;
    cv.text(nd.cx, ty, r.head, { anchor: 'middle', bold: true }); ty += measure(r.head, S.FS).h + S.FS * 0.45;
    if (r.sub.length) cv.text(nd.cx, ty, r.sub, { anchor: 'middle' });
    y += r.bh + 10;
  }
}
/* 小枝の一覧。三つ目以降は描かない（図が読めなくなる）が、黙って落とさず warn にする */
function branchList(cv, s) {
  const list = Array.isArray(s.branch) ? s.branch : [];
  if (list.length > 2) cv.warn.push(`小枝は一つの段に二つまで：段「${String(s.text || '').slice(0, 12)}」の三つ目以降（${list.slice(2).map(b => b.label || b.text).join('・').slice(0, 20)}）は描かない。段を分けるか、注に回す`);
  return list.slice(0, 2);
}

/* 段の中の小枝：左に枝の語、右に小さな箱。箱は細い枠（主の箱より軽く）、強調すれば太いえんじ */
const BR_LAB = 150, BR_PAD = 10;
function branchBlock(cv, s, W) {
  const list = branchList(cv, s);
  if (!list.length) return { h: 0, rows: [] };
  const inW = W - S.PAD * 2, boxW = inW - BR_LAB - 34;
  const rows = list.map(b => {
    const lab = wrap(b.label || '', BR_LAB - 6, S.FS), head = wrap(b.text || '', boxW - BR_PAD * 2, S.FS), sub = wrap(b.sub || [], boxW - BR_PAD * 2, S.FS);
    const bh = measure(head, S.FS).h + (sub.length ? S.FS * 0.45 + measure(sub, S.FS).h : 0) + BR_PAD * 2;
    return { b, lab, head, sub, bh, h: Math.max(bh, measure(lab, S.FS).h + 8) };
  });
  return { rows, boxW, h: rows.reduce((a, r) => a + r.h + 10, 0) + 14 };
}
function drawBranch(cv, nd, br) {
  let y = nd.y1 - br.h + 4;
  cv.line(nd.x0 + S.PAD, y, nd.x1 - S.PAD, y, { gray: true, obst: false, role: 'shape', dash: 'dot' });
  y += 10;
  for (const r of br.rows) {
    const cy = y + r.h / 2, lx = nd.x0 + S.PAD, bx = nd.x0 + S.PAD + BR_LAB + 34;
    const lm = measure(r.lab, S.FS); cv.text(lx, cy - lm.h / 2 + S.FS * 0.8, r.lab, { role: 'edge-label' });
    cv.poly([[lx + Math.min(BR_LAB, lm.w) + 8, cy], [bx - 5, cy]], { head: 'end', obst: false, role: 'shape', accent: r.b.accent });
    const by = cy - r.bh / 2;
    cv.rect(bx, by, br.boxW, r.bh, { role: 'shape', obst: false, accent: r.b.accent });
    let ty = by + BR_PAD + S.FS * 0.8;
    cv.text(bx + br.boxW / 2, ty, r.head, { anchor: 'middle', bold: true }); ty += measure(r.head, S.FS).h + S.FS * 0.45;
    if (r.sub.length) cv.text(bx + br.boxW / 2, ty, r.sub, { anchor: 'middle' });
    y += r.h + 10;
  }
}
