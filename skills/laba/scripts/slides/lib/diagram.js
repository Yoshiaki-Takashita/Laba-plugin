// 図形で描く関係図。当事者を格子に置き、線・矢印とラベルを重ならない位置に自動で置く。
// 図の型と文法の一般論は references/figures/ を参照。ここはスライド固有の描き方だけを扱う（references/slides/03-diagram-on-slide.md）。
"use strict";
const { SIZE, FONT } = require("./tokens");
const tf = require("./textfit");

const overlap = (a, b, pad = 0.02) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
// 線分と箱が交わるか（線分上の点を刻んで調べる）
const segHits = (seg, box, t0 = 0.08, t1 = 0.92) => { for (let t = t0; t <= t1; t += 0.04) { const x = seg.x1 + (seg.x2 - seg.x1) * t, y = seg.y1 + (seg.y2 - seg.y1) * t; if (x > box.x && x < box.x + box.w && y > box.y && y < box.y + box.h) return true; } return false; };

// 中心同士を結ぶ線を、当事者の箱の縁で切る
function clip(from, to) {
  const edge = (b, tx, ty) => {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, dx = tx - cx, dy = ty - cy;
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return { x: cx, y: cy };
    const sx = dx !== 0 ? (b.w / 2) / Math.abs(dx) : Infinity, sy = dy !== 0 ? (b.h / 2) / Math.abs(dy) : Infinity, k = Math.min(sx, sy);
    return { x: cx + dx * k, y: cy + dy * k };
  };
  const fc = { x: from.x + from.w / 2, y: from.y + from.h / 2 }, tc = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
  const a = edge(from, tc.x, tc.y), b = edge(to, fc.x, fc.y);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

/**
 * kit      : 部品（Kit）
 * s        : スライド
 * spec     : { actors:[{id,kind,symbol,role,col,row,step?,box?,sub?,color?,fill?}],
 *              relations:[{from,to,label,step?,both?,dash?,emphasis?,arrow?(false＝矢じりなしの線),color?("base")}],
 *              notes:[{text,col,row,step?,small?}] }
 * region   : 図を置く領域 {x,y,w,h}
 * step     : 表示する段（この段で初めて出る関係を強調色で描く）。省略時は emphasis:true の関係だけを強調色で描く
 * opt.past : "ink"（既定。前の段の関係は黒のまま残す）か "gray"（関係が多いとき灰色に落とす）
 * opt.box  : true なら当事者を箱（白地＋枠線）で描く（相関図）
 * opt.cols / opt.rows : 格子の大きさを外から決める（省略時は当事者の col・row の最大から決める）
 */
function relationDiagram(kit, s, spec, region, step, opt = {}) {
  const all = spec.actors || [];
  const actors = all.filter((a) => step == null || (a.step || 1) <= step);
  const cols = opt.cols || Math.max(...all.map((a) => a.col)) + 1, rows = opt.rows || Math.max(...all.map((a) => a.row)) + 1;
  const cw = region.w / cols, rh = region.h / rows;
  const boxes = {};
  actors.forEach((a) => {
    const cx = region.x + cw * (a.col + 0.5), cy = region.y + rh * (a.row + 0.5) - (opt.box || a.box ? 0 : 0.08);
    boxes[a.id] = kit.actor(s, a, cx, cy, { size: opt.pictoSize || (rows >= 3 ? 0.5 : 0.6), roleW: Math.min(1.8, cw - 0.1), box: opt.box, maxW: Math.min(2.4, cw * 1.25) });
  });
  // 当事者が左に片寄っていないか（その段で出ている当事者が、格子の左半分だけにある）
  if (step != null && cols >= 3 && actors.length && Math.max(...actors.map((a) => a.col)) < (cols - 1) / 2) kit.note(`図が左に片寄る（${step}段目の当事者が左の列だけにある）。最初の段から出る当事者を中央寄りの列に置くか、右に解説の枠（side）を置く`);
  const rels = (spec.relations || []).filter((r) => step == null || (r.step || 1) <= step).filter((r) => boxes[r.from] && boxes[r.to]);
  const pastState = opt.past === "gray" || (opt.past !== "ink" && rels.length > 7) ? "muted" : "past";
  // 同じ2者の間に複数の関係があれば、線を平行にずらす
  const pairCount = {}, pairIdx = {};
  rels.forEach((r) => { const k = [r.from, r.to].sort().join("|"); pairCount[k] = (pairCount[k] || 0) + 1; });
  const segs = rels.map((r) => {
    const k = [r.from, r.to].sort().join("|"); const i = (pairIdx[k] = (pairIdx[k] || 0) + 1) - 1, n = pairCount[k];
    const sg = clip(boxes[r.from], boxes[r.to]);
    if (n > 1) { const dx = sg.x2 - sg.x1, dy = sg.y2 - sg.y1, len = Math.hypot(dx, dy) || 1, off = (i - (n - 1) / 2) * 0.26; const sign = r.from < r.to ? 1 : -1; sg.x1 += (-dy / len) * off * sign; sg.x2 += (-dy / len) * off * sign; sg.y1 += (dx / len) * off * sign; sg.y2 += (dx / len) * off * sign; }
    return sg;
  });
  const isNewRel = (r) => r.emphasis === true || (step != null && r.emphasis !== false && (r.step || 1) === step);
  // 先に線を全部描き、後からラベルを置く
  rels.forEach((r, i) => {
    const state = isNewRel(r) ? "new" : r.color === "base" ? "base" : pastState;
    kit.arrow(s, segs[i].x1, segs[i].y1, segs[i].x2, segs[i].y2, { state, both: r.both, dash: r.dash, noHead: r.arrow === false, width: r.width });
    // 線が、ほかの当事者の上を通っていないか
    Object.entries(boxes).forEach(([id, b]) => { if (id !== r.from && id !== r.to && (b.parts || [b]).some((q) => segHits(segs[i], q, 0.04, 0.96))) kit.warn(`線（${r.from}→${r.to}${r.label ? "「" + r.label + "」" : ""}）が、当事者「${id}」の上を通る。当事者の位置（col・row）を変える`); });
  });
  const placed = [];
  const actorBoxes = Object.values(boxes).flatMap((b) => b.parts || [b]);   // 絵・文字のある所
  rels.forEach((r, i) => {
    if (!r.label) return;
    const isNew = isNewRel(r), size = r.small ? SIZE.note : isNew ? SIZE.labelNew : SIZE.labelPast;
    const plain = tf.strip(r.label);
    if (tf.textW(plain) > 8.5 && !r.small) kit.note(`線のラベルが長い（「${plain}」は全角 ${Math.round(tf.textW(plain))} 字分。8字まで）。短くするか、下の帯・右の枠に書く`);
    const sg = segs[i], dx = sg.x2 - sg.x1, dy = sg.y2 - sg.y1, len = Math.hypot(dx, dy) || 1;
    const horiz = Math.abs(dx) >= Math.abs(dy) * 2, vert = Math.abs(dy) >= Math.abs(dx) * 2;
    // 1行 → 幅 1.25 で折る → 線の長さに収まる幅で折る、の順に試す（当事者の間が狭いときは2行にして線の上下に置く）
    const segRoom = Math.max(0.6, (horiz ? len : 1.9) - 0.12);
    const tryLines = [tf.label2(r.label, Math.max(1.0, segRoom), size), tf.label2(r.label, 1.25, size), tf.label2(r.label, segRoom, size)];
    let done = false;
    for (const lines of tryLines) {
      if (lines.bad) continue;   // 語の途中で折れる分け方は使わない
      const w = Math.max(...lines.map((l) => tf.widthIn(tf.strip(l), size))) + 0.1, h = lines.length * size * 1.25 / 72 + 0.04;
      const cands = [];
      // 線の法線の向きに、ラベルの箱が線にかからない距離だけ離す（横の線なら上下、縦の線なら左右、斜めなら斜め上下）
      const nx = -dy / len, ny = dx / len, d = (w * Math.abs(nx) + h * Math.abs(ny)) / 2 + (isNew ? 0.1 : 0.08) + (vert ? 0.05 : 0);
      for (const t of [0.5, 0.36, 0.64, 0.25, 0.75]) {
        const mx = sg.x1 + dx * t, my = sg.y1 + dy * t;
        // 上（または右）を先に試す
        const first = ny < 0 || (Math.abs(ny) < 1e-6 && nx > 0) ? 1 : -1;
        for (const sign of [first, -first]) cands.push({ x: mx + nx * d * sign - w / 2, y: my + ny * d * sign - h / 2, align: vert ? (nx * sign > 0 ? "left" : "right") : "center" });
      }
      for (const c of cands) {
        const b = { x: c.x, y: c.y, w, h };
        if (b.x < region.x - 0.2 || b.x + b.w > region.x + region.w + 0.2 || b.y < region.y - 0.05 || b.y + b.h > region.y + region.h + 0.02) continue;
        if (actorBoxes.some((ab) => overlap(b, ab, 0))) continue;
        if (placed.some((pb) => overlap(b, pb, 0.03))) continue;
        if (segs.some((o, j) => j !== i && segHits(o, b))) continue;
        const color = isNew ? kit.K.accent : r.color === "base" ? kit.K.base : pastState === "muted" ? kit.K.gray : kit.K.ink;
        s.addText(lines.join("\n"), { x: b.x, y: b.y, w: b.w, h: b.h, fontSize: size, bold: true, color, fontFace: FONT, margin: 0, align: c.align || "center", valign: "middle", isTextBox: true, fit: "none", objectName: "arrowLabel" });
        placed.push(b); done = true; break;
      }
      if (done) break;
    }
    if (!done) kit.warn(`線のラベルを置けない：「${plain}」（当事者の配置を広げるか、ラベルを短くする）`);
  });
  // 図の中の短い注記（その段で出たものは強調色）。当事者・ラベルに重なるなら知らせる
  (spec.notes || []).filter((n) => step == null || (n.step || 1) <= step).forEach((n) => {
    const isNew = n.emphasis === true || (step != null && (n.step || 1) === step), size = n.small ? SIZE.note : SIZE.labelNew;
    const lines = String(n.text).split("\n");
    const w = Math.max(...lines.map((l) => tf.widthIn(tf.strip(l), size))) + 0.15, h = lines.length * size * 1.3 / 72 + 0.06;
    const x = region.x + cw * (n.col + 0.5) - w / 2 + (n.dx || 0), y = region.y + rh * (n.row + 0.5) - h / 2 + (n.dy || 0);
    const b = { x, y, w, h };
    if (actorBoxes.some((ab) => overlap(b, ab, 0)) || placed.some((pb) => overlap(b, pb, 0)) || segs.some((o) => segHits(o, b))) kit.warn(`図の中の注記「${tf.strip(lines[0])}」が、当事者・線・ラベルに重なる。col・row（小数で書ける）か dx・dy でずらす`);
    s.addText(lines.join("\n"), { x, y, w, h, fontSize: size, bold: true, color: isNew ? kit.K.accent : n.color === "base" ? kit.K.base : n.color === "gray" ? kit.K.gray : kit.K.ink, fontFace: FONT, margin: 0, align: "center", valign: "middle", isTextBox: true, fit: "none", objectName: "diagramNote" });
    placed.push(b);
  });
  return boxes;
}

module.exports = { relationDiagram, clip, overlap, segHits };
