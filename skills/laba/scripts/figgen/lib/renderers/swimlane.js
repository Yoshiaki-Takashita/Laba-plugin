'use strict';
/* 手続のスイムレーン：誰が（当事者・裁判所・第三者）、どの順に、何をするか。横の帯が主体、左から右へ時間が進む。
   spec: { lanes:['原告','裁判所','被告'], steps:[{lane:0, text, sub, accent, via:'矢印の横の語'}], notes }
   段の幅は中身から決める（短い段は狭く、長い段は広く）。帯をまたぐ段は、前の段の真下（真上）から下ろして横から入れるので、
   前の段と横に重ねて置ける（七段まで版面の幅に入る）。帯の見出しは「|」で折れる。via は矢印の横の区間の上に置く（帯の境界にかからない）。
   入らないときの順：①段の語を 3 行まで折る ②帯をまたぐ段を前の段に重ねる ③それでも入らなければ warn（段を分けるか、語を短くする）。 */
const { S, wrap, measure, footNotes, textW, atoms, fitWidth, wrapLog } = require('../core');
const PAD = 10, LEG = 30, GAP = 26, MAXW = 250;
module.exports = function (spec, cv) {
  const lanes = spec.lanes, st = spec.steps, n = st.length;
  // 帯の見出し：語の途中で折れない最小の幅（120 まで）。括弧の中でも助詞の後なら折ってよい（「会社（監査役が／代表）」）。「|」で折る位置を決めてもよい
  const labIn = Math.min(120, Math.max(...lanes.map(l => fitWidth([l], 64, 120, { pad: 0, maxLines: 3 }))));
  const labRaw = lanes.map(l => { const n0 = wrapLog.length, ls = wrap(l, labIn, S.FS);
    if (wrapLog.length > n0 && ls.slice(0, -1).every((x, k) => /[がはをにのとでへも、）・]$/.test(x) || ls[k + 1][0] === '（')) wrapLog.length = n0; return ls; });
  const labW = Math.max(64, ...labRaw.map(ls => measure(ls, S.FS).w)) + 26, X0 = cv.M + labW, XR = cv.W - cv.M;
  // 段ごとの幅の候補：wmin＝折れない単位が入る最小、w3＝3 行以内、wp＝2 行以内（どれも語の途中で折らない）
  const texts = st.map(s => [s.text, s.sub].filter(Boolean));
  const minW = st.map((s, i) => Math.max(76, ...texts[i].flatMap(t => atoms(t)).map(a => textW(a, S.FS))) + PAD * 2 + 2);
  const w3 = st.map((s, i) => Math.max(minW[i], fitWidth(texts[i], 80, MAXW, { pad: PAD + 2, maxLines: 3 })));
  const wp = st.map((s, i) => Math.max(w3[i], fitWidth(texts[i], 80, MAXW, { pad: PAD + 2, maxLines: 2 })));
  const wq = st.map((s, i) => Math.max(wp[i], Math.min(MAXW, textW(String(s.text).replace(/\|/g, ''), S.FS) + (PAD + 2) * 2 + 4)));      // 段の名前が一行に入る幅
  const w4 = st.map((s, i) => Math.min(w3[i], Math.max(minW[i], fitWidth(texts[i], 80, MAXW, { pad: PAD + 2, maxLines: 4 }))));
  // via の幅：同じ帯の矢印の上に置くので、長い語は二行に折った幅で見積もる
  const viaLines = st.map(s => (s.via ? wrap(s.via, fitWidth([s.via], 50, Math.ceil(textW(s.via, S.FS)) + 2, { pad: 0, maxLines: 2 }), S.FS) : []));
  const viaW = viaLines.map(ls => (ls.length ? measure(ls, S.FS).w + 8 : 0));
  // 置き方：同じ帯なら前の段の右へ、別の帯なら前の段の中央から縦に下ろして（上げて）横から入る。
  // 縦の線が通る帯と、行き先の帯に、もっと前の段が残っていれば重ねずに右へ送る
  function place(ws, extra) {
    const x = [], comp = [];
    for (let i = 0; i < n; i++) {
      if (!i) { x.push(X0); comp.push(false); continue; }
      const a = st[i - 1], b = st[i], ax0 = x[i - 1], ax1 = ax0 + ws[i - 1], acx = (ax0 + ax1) / 2;
      let ok = a.lane !== b.lane;
      if (ok) { const lo = Math.min(a.lane, b.lane), hi = Math.max(a.lane, b.lane);
        for (let j = 0; j < i - 1; j++) { const lj = st[j].lane; if (lj === a.lane) continue; if (lj >= lo && lj <= hi && x[j] + ws[j] > acx - 14) ok = false; } }
      const g = GAP + extra + Math.max(0, viaW[i] - GAP + 6);
      if (ok) { x.push(Math.max(acx + LEG + extra, ...Array.from({ length: i - 1 }, (_, j) => st[j].lane === b.lane ? x[j] + ws[j] + 20 : -1e9))); comp.push(true); }
      else { x.push(Math.max(ax1 + g, ...Array.from({ length: i - 1 }, (_, j) => st[j].lane === b.lane ? x[j] + ws[j] + g : -1e9))); comp.push(false); }
    }
    return { x, comp, right: Math.max(...x.map((v, i) => v + ws[i])) };
  }
  const mix = (A, B, t) => A.map((a, i) => a + (B[i] - a) * t);
  let ws = null, P = null;
  for (const [A, B] of [[wp, wq], [w3, wp], [w4, w3], [minW, w4]]) {           // 2 行の幅から 3 行の幅へ、4 行の幅へ、それでも入らなければ最小の幅へ
    let lo = 0, hi = 1, best = null;
    if (place(A, 0).right > XR) continue;
    for (let k = 0; k < 14; k++) { const t = (lo + hi) / 2, p = place(mix(A, B, t), 0); if (p.right <= XR) { best = t; lo = t; } else hi = t; }
    ws = mix(A, B, best == null ? 0 : (place(B, 0).right <= XR ? 1 : best)); break;
  }
  if (!ws) { ws = minW.slice(); cv.warn.push(`スイムレーンの段が版面の幅に入らない（${n} 段）。段の語を短くするか、図を二つに分ける`); }
  P = place(ws, 0);
  if (P.right < XR - 2 && n > 1) {                                   // 余った幅は段の間に配る（間が開きすぎないよう一つあたり 70 まで）
    let lo = 0, hi = 70; for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (place(ws, m).right <= XR) lo = m; else hi = m; }
    P = place(ws, lo);
  }
  const off = Math.max(0, (XR - P.right) / 2); P.x = P.x.map(v => v + off);
  const prep = st.map((s, i) => ({ h: wrap(s.text, ws[i] - PAD * 2 - 4, S.FS), l: wrap(s.sub || [], ws[i] - PAD * 2 - 4, S.FS) }));
  const bh = prep.map(p => measure(p.h, S.FS).h + (p.l.length ? S.FS * 0.55 + measure(p.l, S.FS).h : 0) + PAD * 2 + 4);
  // 帯をまたぐ矢印の via は、前の段の真下（真上）、縦の線の左に置く。そのための余白を、出ていく帯に足す
  const viaDn = lanes.map(() => 0), viaUp = lanes.map(() => 0);
  for (let i = 1; i < n; i++) if (st[i].via && P.comp[i] && st[i].lane !== st[i - 1].lane) { if (st[i].lane > st[i - 1].lane) viaDn[st[i - 1].lane] = 34; else viaUp[st[i - 1].lane] = 34; }
  const laneH = lanes.map((l, k) => Math.max(66, measure(labRaw[k], S.FS).h + 24, ...st.map((s, i) => (s.lane === k ? bh[i] : 0))) + 40 + viaDn[k] + viaUp[k]);
  const laneY = []; let y = cv.M; laneH.forEach((h, k) => { laneY[k] = y; y += h; });
  cv.line(cv.M, cv.M, cv.W - cv.M, cv.M, { gray: true, obst: false });
  const hasNotes = spec.notes && spec.notes.length;
  lanes.forEach((l, k) => { cv.textCenter(cv.M + (labW - 14) / 2, laneY[k] + laneH[k] / 2, labRaw[k]);
    if (k < lanes.length - 1 || !hasNotes) cv.line(cv.M, laneY[k] + laneH[k], cv.W - cv.M, laneY[k] + laneH[k], { gray: true, obst: false }); });
  cv.line(cv.M + labW - 12, cv.M, cv.M + labW - 12, y, { gray: true, obst: false });
  const nodes = st.map((s, i) => cv.node(P.x[i], laneY[s.lane] + (laneH[s.lane] - viaDn[s.lane] + viaUp[s.lane]) / 2, { middle: true, w: ws[i], pad: PAD, head: prep[i].h, headBold: true, lines: prep[i].l, accent: s.accent }));
  for (let i = 1; i < n; i++) {
    const a = nodes[i - 1], b = nodes[i], acc = st[i].accent; let pts, hseg;
    if (Math.abs(a.cy - b.cy) < 2) { pts = [[a.x1, a.cy], [b.x0 - 6, b.cy]]; hseg = pts; }
    else if (P.comp[i]) { const down = b.cy > a.cy; pts = [[a.cx, down ? a.y1 : a.y0], [a.cx, b.cy], [b.x0 - 6, b.cy]]; hseg = [[a.cx, b.cy], [b.x0 - 6, b.cy]]; }
    else { const xm = (Math.max(a.x1, ...nodes.slice(0, i - 1).filter((_, j) => st[j].lane === st[i].lane).map(nd => nd.x1)) + b.x0) / 2;
      pts = [[a.x1, a.cy], [xm, a.cy], [xm, b.cy], [b.x0 - 6, b.cy]]; hseg = [[xm, b.cy], [b.x0 - 6, b.cy]]; }
    cv.poly(pts, { head: 'end', accent: acc });
    if (st[i].via && P.comp[i] && Math.abs(a.cy - b.cy) >= 2) {
      const ls = wrap(st[i].via, 150, S.FS), m = measure(ls, S.FS), down = b.cy > a.cy, ty = down ? a.y1 + 10 + S.FS * 0.86 : a.y0 - 10 - m.h + S.FS * 0.86;
      const bb = { x0: a.cx - 8 - m.w, y0: ty - S.FS * 0.86, x1: a.cx - 8, y1: ty - S.FS * 0.86 + m.h };
      if (cv.free(bb, 2)) { cv.text(a.cx - 8, ty, ls, { anchor: 'end', role: 'edge-label' }); continue; }
    }
    if (st[i].via) { const room = Math.max(60, hseg[1][0] - hseg[0][0] - 10); cv.edgeLabel(hseg, viaLines[i], { fit: { raw: st[i].via, widths: [Math.max(room, viaW[i] - 8), 110] } }); }
  }
  footNotes(cv, spec.notes, y - (hasNotes ? 18 : 6));
};
