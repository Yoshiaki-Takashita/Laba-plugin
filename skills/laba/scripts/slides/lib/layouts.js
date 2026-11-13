// LABA スライドの型。1つの型は「何を伝える1枚か」で決まる。配置は references/slides/02-layouts.md と対応する。
"use strict";
const SEV = require("./severity.json");   // deck_lint.py と共通の重さ
const { SLIDE, FONT, SIZE, GRID, LINE } = require("./tokens");
const { relationDiagram } = require("./diagram");
const tf = require("./textfit");

const B = GRID.body;
const arr = (v) => (v == null ? [] : [].concat(v));
// 行頭記号を付ける。記号の直後が半角の字なら、詰まって見えないよう空きを入れる
const sp = (t) => t.replace(/^(◎|・)(?=[A-Za-z0-9])/, "$1 ");
const pts = (items, mark = "◎") => arr(items).map((t) => sp(/^[◎・→①-⑳（]/.test(t) ? t : mark + t));

// 見出しつきの白いスライドを作る
function base(ctx, sl) {
  const s = ctx.kit.track(ctx.pres.addSlide({ masterName: "CONTENT" }));
  ctx.kit.cur = `${ctx.no}枚目「${(sl.heading || sl.type).slice(0, 14)}」`;
  ctx.kit.header(s, sl.heading || "", sl.section ?? ctx.section);
  return s;
}
// 本文の領域。枚の隅に置く注（note：専門用語の説明など。9pt・灰・太字にしない）があれば、下にその分を空ける
function regionOf(ctx, s, sl) {
  if (!sl.note) return B;
  const lines = arr(sl.note).map((t) => `{g:${t}}`);
  const h = tf.fit(lines, B.w, 1.2, [SIZE.floor], { gap: 1 }).height + 0.04;
  ctx.kit.text(s, lines, { x: B.x, y: B.y + B.h - h, w: B.w, h }, { sizes: [SIZE.floor], bold: false, gap: 1, small: true, name: "note" });
  return { ...B, h: B.h - h - 0.1 };
}
// 縦に積む型の共通の締め：下の1行（key）と注（note）を足して積む
function stackL(ctx, s, sl, blocks, o) {
  const bl = blocks.filter(Boolean);
  if (sl.key && !bl.some((b) => b._key)) bl.push({ kind: "text", lines: pts(sl.key, "→ "), _key: true });
  return ctx.kit.stack(s, bl, regionOf(ctx, s, sl), o);
}

const L = {};

// 1 表紙
L.cover = (ctx, sl) => {
  const { kit, cfg } = ctx, K = kit.K, s = kit.track(ctx.pres.addSlide({ masterName: "PLAIN" }));
  kit.cur = "表紙";
  const T = (t, o) => s.addText(t, { fontFace: FONT, bold: true, color: K.ink, margin: 0, isTextBox: true, fit: "none", ...o });
  const aff = sl.affiliation ?? cfg.affiliation ?? "", who = sl.presenter ?? cfg.presenter ?? "", date = sl.date ?? cfg.date ?? "";
  if (aff) T(aff, { x: 0.5, y: 0.4, w: 9, h: 0.45, fontSize: 18, color: K.dark, objectName: "affiliation" });
  T(sl.kind || "判例研究", { x: 0.5, y: 1.2, w: 9, h: 0.8, fontSize: SIZE.coverTitle, color: K.dark, align: "center", objectName: "coverTitle" });
  const theme = sl.theme || "", tSize = tf.widthIn(theme, SIZE.coverTheme) > 9.2 ? 22 : SIZE.coverTheme;
  T(theme, { x: 0.3, y: 2.08, w: 9.4, h: 0.6, fontSize: tSize, color: K.dark, align: "center", objectName: "coverTheme" });
  T(arr(sl.info).join("\n"), { x: 0.5, y: 2.85, w: 9, h: 0.75, fontSize: SIZE.coverInfo, align: "center", valign: "top", objectName: "coverInfo" });
  T(who || "（報告者）", { x: 2.0, y: 4.05, w: 6, h: 0.5, fontSize: SIZE.coverName, color: who ? K.dark : K.gray, align: "center", objectName: "presenter" });
  T(date || "（発表日）", { x: 7.0, y: 5.03, w: 2.7, h: 0.35, fontSize: 16, color: date ? K.ink : K.gray, align: "right", objectName: "date" });
  if (!who) kit.warn("報告者が未設定（config の presenter）。仮の文字を入れた");
  if (!date) kit.warn("発表日が未設定（config の date）。仮の文字を入れた");
  return s;
};

// 2 目次：左に基調色の縦帯、右に章立て（8項目以上は2列）
L.toc = (ctx, sl) => {
  const { kit } = ctx, K = kit.K, s = kit.track(ctx.pres.addSlide({ masterName: "PLAIN" })); kit.cur = "目次";
  s.addShape(ctx.pres.shapes.RECTANGLE, { x: 0, y: 0, w: 1.6, h: SLIDE.h, fill: { color: K.base }, line: { color: K.base, width: 0 }, objectName: "tocBar" });
  s.addText("目次", { x: 0.2, y: 0.25, w: 1.2, h: 0.5, fontSize: 20, bold: true, color: K.paper, fontFace: FONT, margin: 0, isTextBox: true, objectName: "tocLabel" });
  const lines = [];
  arr(sl.items).forEach((it) => { lines.push(`{b:${it.title}}`); arr(it.sub).forEach((t) => lines.push("　" + t)); });
  const two = lines.length > 9, half = two ? Math.ceil(lines.length / 2) : lines.length;
  // 2列のときは、章の見出しの直前で分ける
  let cut = half; if (two) { while (cut < lines.length && !lines[cut].startsWith("{b:")) cut++; if (cut >= lines.length) cut = half; }
  const colsL = [lines.slice(0, cut), lines.slice(cut)].filter((c) => c.length);
  const w = two ? 3.85 : 7.7;
  // 行が少ないときは大きく、上下の中央に置く（下半分を空けない）。節の行は章より 1.5〜2pt 小さくする（14pt を下回らない）
  colsL.forEach((c, i) => kit.text(s, c, { x: 2.0 + i * 4.0, y: 0.4, w, h: 4.85 }, { sizes: two ? [17, 16.5, 16, 15.5] : [20, 19, 18, 17, 16], gap: two ? 7 : 9, valign: two ? "top" : "middle", sizeOf: (k, sz) => (c[0] && !tf.strip(c[k] || "").startsWith("　") ? sz : Math.max(14, sz - (two ? 1.5 : 2))), name: "tocText" }));
  return s;
};

// 3 条文：条文の枠 → ◎要点 → 「本件では」の枠
L.statute = (ctx, sl) => {
  const s = base(ctx, sl), blocks = [];
  arr(sl.statutes).forEach((st) => blocks.push({ kind: "statute", name: st.name, text: st.text }));
  if (sl.points) blocks.push({ kind: "text", lines: pts(sl.points) });
  if (sl.here) blocks.push({ kind: "accent", lines: [`{r:${sl.hereLabel || "本件では"}}`].concat(arr(sl.here)) });
  stackL(ctx, s, sl, blocks);
  return s;
};

// 4 定義：用語と定義の枠（強調色）→ 要点 → 例
L.definition = (ctx, sl) => {
  const s = base(ctx, sl), blocks = [{ kind: "accent", lines: [`{r:${sl.term}}`].concat(arr(sl.definition)) }];
  if (sl.points) blocks.push({ kind: "text", lines: pts(sl.points) });
  if (sl.example) blocks.push({ kind: "frame", lines: [`{b:${sl.exampleLabel || "たとえば"}}`].concat(arr(sl.example)) });
  stackL(ctx, s, sl, blocks);
  return s;
};

// 5 関係図：左に図形で描いた関係図、右に解説の枠
L.relation = (ctx, sl) => {
  const s = base(ctx, sl), kit = ctx.kit, R = regionOf(ctx, s, sl);
  const wide = !sl.side, dw = wide ? R.w : 5.3, keyH = sl.key ? tf.fit(pts(sl.key, "→ "), R.w, 2, [17]).height + 0.08 : 0, dh = R.h - keyH - (sl.key ? 0.12 : 0);
  relationDiagram(kit, s, sl.diagram, { x: R.x, y: R.y + 0.05, w: dw, h: dh - 0.1 }, null, { past: "ink", box: sl.box || sl.diagram.box });
  if (sl.side) {
    const lines = (sl.side.title ? [`{${sl.side.accent === false ? "b" : "r"}:${sl.side.title}}`] : []).concat(arr(sl.side.lines));
    const need = tf.fit(lines, 3.7 - GRID.pad.x * 2, 9, [17]).height + 0.35, h = Math.min(dh - 0.15, Math.max(need * 1.15, 1.2));
    kit.frame(s, lines, { x: 5.9, y: R.y + 0.1 + (dh - 0.15 - h) / 2, w: 3.7, h }, { color: sl.side.accent === false ? "base" : "accent", sizes: [17, 16, 15, 14], gap: 8 });
  }
  if (sl.key) kit.text(s, pts(sl.key, "→ "), { x: R.x, y: R.y + R.h - keyH, w: R.w, h: keyH }, { sizes: [17, 16, 15], valign: "middle" });
  return s;
};

// 6 当事者：ピクト＋記号＋立場（基調色）＋説明を格子に並べる（4人までは2列で大きく、5人以上は3列）
L.parties = (ctx, sl) => {
  const s = base(ctx, sl), kit = ctx.kit, ps = arr(sl.parties), per = sl.cols || (ps.length <= 4 ? 2 : 3);
  const R = regionOf(ctx, s, sl), rows = Math.ceil(ps.length / per), cw = R.w / per, rh = Math.min(2.1, R.h / rows);
  const big = per === 2, pic = big ? 0.75 : 0.62, sym = big ? 34 : SIZE.symbol;
  ps.forEach((p, i) => {
    const x = R.x + (i % per) * cw, y = R.y + Math.floor(i / per) * rh;
    kit.picto(s, p.kind || "person", x + 0.1, y + 0.08, pic, "ink");
    s.addText(p.symbol || "", { x: x + pic + 0.2, y: y + 0.03, w: Math.max(0.9, tf.widthIn(p.symbol || "", sym) + 0.1), h: pic + 0.1, fontSize: sym, bold: true, color: p.accent ? kit.K.accent : kit.K.ink, fontFace: FONT, margin: 0, valign: "middle", isTextBox: true, objectName: "symbol" });
    // 1行目は立場（role。基調色）。lines は説明（黒）
    const lines = (p.role ? [`{b:${p.role}}`] : []).concat(arr(p.lines));
    kit.text(s, lines, { x: x + 0.1, y: y + pic + 0.2, w: cw - 0.25, h: rh - pic - 0.26 }, { sizes: big ? [17, 16, 15] : [15.5, 15, 14, 13], gap: 2, name: "partyText" });
  });
  return s;
};

// 7 時系列（段ごとに1枚ずつ積む）。build_deck が steps の数だけ呼ぶ（sl._step が現在の段）
// 段ごとに side:{title, lines, accent} を書くと、図の右に解説の枠を置く（図は左 6 割に収まるように当事者を置く）
L.timeline = (ctx, sl) => {
  const st = sl.steps[sl._step - 1], kit = ctx.kit;
  const mark = sl.steps.length > 1 ? (st.mark || "①②③④⑤⑥⑦⑧⑨⑩⑪⑫"[sl._step - 1]) : "";
  const s = base(ctx, { ...sl, heading: `${sl.heading}${mark}` });
  const items = arr(st.items);
  // 帯の高さは、いちばん行の多い段に合わせて全段でそろえる（段を送っても、図の当事者の位置が動かないように）
  const bandLines = 1 + Math.max(...sl.steps.map((x) => arr(x.items).length)), bandH = Math.max(1.45, Math.min(GRID.band.h, 0.55 + bandLines * 0.34));
  const bandY = SLIDE.h - bandH, side = st.side || null, sideW = side ? side.w || 3.3 : 0;
  const dg = { x: GRID.diagram.x, y: GRID.diagram.y, w: GRID.diagram.w - (side ? sideW + 0.25 : 0), h: bandY - GRID.diagram.y - 0.05 };
  relationDiagram(kit, s, sl, dg, st.step ?? sl._step, { past: sl.past, box: sl.box });
  if (side) {
    const lines = (side.title ? [`{${side.accent ? "r" : "b"}:${side.title}}`] : []).concat(arr(side.lines));
    const need = tf.fit(lines, sideW - GRID.pad.x * 2, 9, [16]).height + 0.3, h = Math.min(dg.h - 0.2, Math.max(need, 1.1));
    kit.frame(s, lines, { x: SLIDE.w - GRID.marginX - sideW, y: dg.y + 0.12 + (dg.h - 0.2 - h) / 2, w: sideW, h }, { color: side.accent ? "accent" : "base", sizes: [16, 15, 14, 13], gap: 3 });
  }
  // label の頭に丸数字を書くと「① ① 平成元年」と重なる。丸数字は段の番号から付けるので、label には書かない
  const lbl = String(st.label || "").replace(/^[①-⑳]\s*/, "");
  if (lbl !== String(st.label || "")) kit.note(`時系列の label の頭の丸数字は外した（段の番号から付く）：「${st.label}」`);
  kit.band(s, `${mark ? mark + " " : ""}${lbl}`, items, { y: bandY });
  return s;
};

// 8 時系列のまとめ表
L.timeline_table = (ctx, sl) => {
  const s = base(ctx, sl);
  stackL(ctx, s, sl, [{ kind: "table", rows: [sl.head || ["時期", "出来事"]].concat(sl.rows), colW: sl.colW || [2.2, 7] }, sl.here && { kind: "accent", lines: [`{r:${sl.hereLabel || "本件では"}}`].concat(arr(sl.here)) }]);
  return s;
};

// 9 審級：裁判所と日付 → 主張の枠 → 判断の枠（強調色）→ 1行の要点
L.instance = (ctx, sl) => {
  const s = base(ctx, sl), blocks = [];
  if (sl.court) blocks.push({ kind: "text", lines: [`{g:${sl.court}}`], sizes: [13], small: true });
  if (sl.claim) blocks.push({ kind: "frame", lines: [`{b:${sl.claim.title}}`].concat(arr(sl.claim.lines)) });
  if (sl.judgment) blocks.push({ kind: "accent", lines: [`{r:${sl.judgment.title || "判断"}}`].concat(arr(sl.judgment.lines)) });
  stackL(ctx, s, sl, blocks);
  return s;
};

// 10 判旨の構造（表）
L.holding_structure = (ctx, sl) => {
  const s = base(ctx, sl);
  stackL(ctx, s, sl, [{ kind: "table", rows: [sl.head || ["段階", "内容"]].concat(sl.rows), colW: sl.colW || [2, 7.2] }, sl.here && { kind: "accent", lines: [`{r:${sl.hereLabel || "本件では"}}`].concat(arr(sl.here)) }]);
  return s;
};

// 11 審級の流れ：横に並ぶ箱と矢印 → 下に解説
L.instance_flow = (ctx, sl) => {
  const s = base(ctx, sl), blocks = [{ kind: "flow", items: sl.items, h: sl.flowH || 1.55 }];
  if (sl.frame) blocks.push({ kind: sl.frame.accent ? "accent" : "frame", lines: arr(sl.frame.lines) });
  stackL(ctx, s, sl, blocks);
  return s;
};

// 12 比較表
L.compare_table = (ctx, sl) => {
  const s = base(ctx, sl), blocks = [];
  if (sl.lead) blocks.push({ kind: "text", lines: arr(sl.lead), sizes: [16] });
  blocks.push({ kind: "table", rows: sl.rows, colW: sl.colW, h: sl.tableH });
  if (sl.here) blocks.push({ kind: "accent", lines: [`{r:${sl.hereLabel || "本件では"}}`].concat(arr(sl.here)) });
  stackL(ctx, s, sl, blocks);
  return s;
};

// 13 争点：条文や制度の箱を流れで並べ、争点を1つに絞る
// items:[{head（条文・制度の名）, lines（その箱の問い）, answer（その箱の答え）, accent（最後に残る争点の箱）}]、conclusion（下の1〜2行）、here（強調の枠）
L.issues = (ctx, sl) => {
  const s = base(ctx, sl), n = arr(sl.items).length;
  const rowsMax = Math.max(...arr(sl.items).map((it) => 1 + arr(it.lines).length + arr(it.answer).length));
  const blocks = [{ kind: "flow", items: sl.items, h: sl.flowH || Math.min(2.7, 0.75 + rowsMax * 0.36), gapW: n >= 4 ? 0.26 : 0.34 }];
  if (sl.conclusion) blocks.push({ kind: "text", lines: arr(sl.conclusion) });
  if (sl.here) blocks.push({ kind: "accent", lines: [`{r:${sl.hereLabel || "本件では"}}`].concat(arr(sl.here)) });
  stackL(ctx, s, sl, blocks);
  return s;
};

// 14 意義：①②③ の枠を縦に積む
L.significance = (ctx, sl) => {
  const s = base(ctx, sl), blocks = arr(sl.points).map((p, i) => ({ kind: p.accent ? "accent" : "frame", lines: arr(p.lines).map((t, k) => (k === 0 ? `{b:${p.n || "①②③④⑤"[i]}}　${t}` : "　　" + t)) }));
  stackL(ctx, s, sl, blocks);
  return s;
};

// 15 解説の要点：出典の1行 → 見出しつきの枠
L.commentary = (ctx, sl) => {
  const s = base(ctx, sl), blocks = [];
  if (sl.source) blocks.push({ kind: "text", lines: [`{g:${sl.source}}`], sizes: [12], small: true });
  arr(sl.items).forEach((it) => blocks.push({ kind: it.accent ? "accent" : "frame", lines: [`{${it.accent ? "r" : "b"}:${it.title}}`].concat(arr(it.lines)) }));
  stackL(ctx, s, sl, blocks);
  return s;
};

// 16 学説の左右対比：導入 → 左右の枠（高さは中身に合わせ、文字は上下中央）→ 「本件では」の枠 → 下の1行
L.doctrine_lr = (ctx, sl) => {
  const s = base(ctx, sl), blocks = [];
  if (sl.lead) blocks.push({ kind: "text", lines: arr(sl.lead), sizes: [17, 16, 15] });
  blocks.push({ kind: "cols", items: [sl.left, sl.right].map((d) => ({ accent: d.accent, lines: [`{${d.accent ? "r" : "b"}:${d.title}}`].concat(arr(d.lines)) })) });
  if (sl.here) blocks.push({ kind: "accent", lines: [`{r:${sl.hereLabel || "本件では"}}`].concat(arr(sl.here)) });
  stackL(ctx, s, sl, blocks);
  return s;
};

// 17 反対する立場：導入 → 立場の枠 → 評価の枠（強調色）
L.opposition = (ctx, sl) => {
  const s = base(ctx, sl), blocks = [];
  if (sl.lead) blocks.push({ kind: "text", lines: arr(sl.lead), sizes: [16] });
  blocks.push({ kind: "frame", lines: [`{b:${sl.position.title}}`].concat(pts(sl.position.lines)) });
  if (sl.evaluation) blocks.push({ kind: "accent", lines: [`{r:${sl.evaluation.title || "評価"}}`].concat(arr(sl.evaluation.lines)) });
  stackL(ctx, s, sl, blocks);
  return s;
};

// 18 考察の矢印：ラベルと内容の行を、下向きの矢印でたどる
L.reasoning_chain = (ctx, sl) => {
  const s = base(ctx, sl), kit = ctx.kit, rows = arr(sl.rows), keyH = sl.key ? 0.7 : 0;
  const gap = 0.24, h = (B.h - keyH - gap * (rows.length - 1) - (sl.key ? 0.1 : 0)) / rows.length, lw = sl.labelW || 2.6;
  rows.forEach((r, i) => {
    const y = B.y + i * (h + gap), acc = r.accent || (i === rows.length - 1 && sl.accentLast !== false);
    kit.frame(s, [`{${acc ? "r" : "b"}:${r.label}}`], { x: B.x, y, w: lw, h }, { color: acc ? "accent" : "base", sizes: [16, 15, 14], align: "center" });
    kit.frame(s, arr(r.lines), { x: B.x + lw, y, w: B.w - lw, h }, { color: acc ? "accent" : "base", sizes: [16, 15, 14] });
    if (i < rows.length - 1) kit.arrow(s, B.x + lw / 2, y + h + 0.02, B.x + lw / 2, y + h + gap - 0.02, { state: "past", width: 2.5 });
  });
  if (sl.key) kit.text(s, pts(sl.key, "→ "), { x: B.x, y: B.y + B.h - keyH, w: B.w, h: keyH }, { sizes: [16, 15], valign: "middle" });
  return s;
};

// 19 結論：強調色の大きな枠に、言い切りの結論
L.conclusion = (ctx, sl) => {
  const s = base(ctx, sl), blocks = [{ kind: "accent", lines: [`{r:${sl.label || "結論"}}`].concat(arr(sl.lines)), sizes: [20, 19, 18, 17] }];
  if (sl.reasons) blocks.push({ kind: "text", lines: pts(sl.reasons) });
  if (sl.caveat) blocks.push({ kind: "frame", lines: [`{b:${sl.caveatLabel || "ただし"}}`].concat(arr(sl.caveat)) });
  stackL(ctx, s, sl, blocks);
  return s;
};

// 20 参考文献・参考判例。items は文字列か {group:"判例", items:[…]}（小見出しつき）。件数が少なければ大きい字にする
L.references = (ctx, sl) => {
  const s = base(ctx, sl), lines = [];
  arr(sl.items).forEach((it) => { if (typeof it === "string") lines.push(`{n:${it}}`); else { lines.push(`{b:${it.group}}`); arr(it.items).forEach((t) => lines.push(`{n:・${t}}`)); } });
  const R = regionOf(ctx, s, sl);
  const f = ctx.kit.text(s, lines, R, { sizes: [16, 15, 14, 13, 12, 11], gap: 5, name: "refs" });
  if (1 - f.height / R.h > SEV.sparse.warn) ctx.kit.note(`参考文献の枚の下 ${Math.round((1 - f.height / R.h) * 100)}% が空く（参考文献の枚は deck_lint でも warn どまり。lib/severity.json）。判例・条文・文献を小見出し（group）で分けて載せるか、前の枚の下にまとめる`);
  return s;
};

// 21 ざっくり理解：場面 → 何が困るのか → そこで（制度）→ ひとことで
L.zakkuri = (ctx, sl) => {
  const s = base(ctx, sl), blocks = [];
  if (sl.scene) blocks.push({ kind: "text", lines: arr(sl.scene) });
  if (sl.trouble) blocks.push({ kind: "frame", lines: [`{b:${sl.troubleLabel || "何が困るのか"}}`].concat(pts(sl.trouble, "・")) });
  if (sl.so) blocks.push({ kind: "frame", lines: [`{b:${sl.soLabel || "そこで"}}`].concat(arr(sl.so)) });
  if (sl.oneLine) blocks.push({ kind: "accent", lines: [`{r:ひとことで}`].concat(arr(sl.oneLine)) });
  stackL(ctx, s, sl, blocks);
  return s;
};

// 22 請求→抗弁→再抗弁：段階を右にずらしながら積む
L.yoken = (ctx, sl) => {
  const s = base(ctx, sl), kit = ctx.kit, st = arr(sl.stages), keyH = sl.conclusion ? 0.72 : 0;
  const gap = 0.12, h = (B.h - keyH - (sl.conclusion ? 0.14 : 0) - gap * (st.length - 1)) / st.length, tagW = 1.55, step = Math.min(0.3, 1.2 / Math.max(1, st.length - 1));
  st.forEach((g, i) => {
    const x = B.x + i * step, y = B.y + i * (h + gap), w = B.w - i * step;
    kit.frame(s, [`{b:${g.tag}}`].concat(g.who ? [`{g:${g.who}}`] : []), { x, y, w: tagW, h }, { sizes: [16, 15, 14], align: "center", gap: 0, padY: 0.04, padX: 0.05 });
    kit.frame(s, arr(g.lines).concat(g.result ? [`→ {r:${g.result}}`] : []), { x: x + tagW, y, w: w - tagW, h }, { sizes: [17, 16, 15, 14], gap: 2, padY: 0.05 });
  });
  if (sl.conclusion) kit.frame(s, [`{r:結論}　${arr(sl.conclusion)[0]}`].concat(arr(sl.conclusion).slice(1)), { x: B.x, y: B.y + B.h - keyH, w: B.w, h: keyH }, { color: "accent", sizes: [17, 16, 15], padY: 0.05 });
  return s;
};

// 23 論点カード：問題の所在／規範／理由／当てはめ
L.ronten_card = (ctx, sl) => {
  const s = base(ctx, sl);
  const rows = [["問題の所在", sl.problem], ["規範", sl.norm], ["理由", sl.reason], ["当てはめ", sl.application]].filter((r) => r[1]).map((r) => [r[0], arr(r[1]).join("\n")]);
  stackL(ctx, s, sl, [{ kind: "text", lines: [`{r:論点}　${sl.issue}`], sizes: [18, 17, 16] }, { kind: "table", rows, colW: [1.9, 7.3], header: false }]);
  return s;
};

// 24 判例マトリクス（誰が誰に×何を求めるか）
L.case_matrix = (ctx, sl) => {
  const s = base(ctx, sl), blocks = [];
  if (sl.lead) blocks.push({ kind: "text", lines: arr(sl.lead), sizes: [16] });
  blocks.push({ kind: "table", rows: sl.rows, colW: sl.colW, sizes: [15, 14.5, 14, 13], h: sl.tableH });
  stackL(ctx, s, sl, blocks);
  return s;
};

// 25 想定問答
L.qa = (ctx, sl) => {
  const s = base(ctx, sl);
  stackL(ctx, s, sl, [{ kind: "frame", lines: [`{b:問}　${sl.q}`] }, { kind: "accent", lines: [`{r:答}　${arr(sl.a)[0]}`].concat(arr(sl.a).slice(1)) }].concat(sl.basis ? [{ kind: "text", lines: pts(sl.basis, "・"), sizes: [16, 15, 14] }] : []));
  return s;
};

// 26 要点（汎用）：導入 → ◎ の要点 → 強調の枠
L.points = (ctx, sl) => {
  const s = base(ctx, sl), blocks = [];
  if (sl.lead) blocks.push({ kind: "text", lines: arr(sl.lead) });
  if (sl.points) blocks.push({ kind: sl.framed === false ? "text" : "frame", lines: pts(sl.points) });
  if (sl.accent) blocks.push({ kind: "accent", lines: arr(sl.accent) });
  stackL(ctx, s, sl, blocks);
  return s;
};

// 27 参考判例：〈判例名〉／事案／判断／→ 本件との関係
L.case_ref = (ctx, sl) => {
  const s = base(ctx, sl), blocks = [];
  arr(sl.cases || [sl]).forEach((c) => blocks.push({ kind: "frame", lines: [`{b:〈${c.name}〉}${c.tag ? "　" + c.tag : ""}`, `事案：${c.facts}`, `判断：${c.holding}`].concat(c.relation ? [`→ ${c.relation}`] : []) }));   // 本件・設例との関係。強調は語に {r:…} で付ける（行全体を強調色にしない）
  if (sl.here) blocks.push({ kind: "accent", lines: [`{r:${sl.hereLabel || "本件では"}}`].concat(arr(sl.here)) });
  stackL(ctx, s, sl, blocks);
  return s;
};

// 28 汎用：ブロックを縦に積む
L.blocks = (ctx, sl) => { const s = base(ctx, sl); stackL(ctx, s, sl, sl.blocks); return s; };

// 29 整理軸（2×2）：横軸と縦軸の有無で類型を置く
L.axis = (ctx, sl) => {
  const s = base(ctx, sl), kit = ctx.kit, keyH = sl.key ? 0.7 : 0;
  const lw = 1.05, vw = 0.6, x0 = B.x + lw + vw, y0 = B.y + 0.45, w = (B.w - lw - vw - 0.15) / 2, h = (B.h - 0.45 - keyH - 0.15 - (sl.key ? 0.1 : 0)) / 2;
  const lab = (t, box, o = {}) => s.addText(t, { ...box, fontSize: 15, bold: true, color: kit.K.base, fontFace: FONT, margin: 0, align: "center", valign: "middle", isTextBox: true, fit: "none", objectName: "axisLabel", ...o });
  lab(sl.xLabel, { x: x0, y: B.y - 0.02, w: w * 2 + 0.15, h: 0.22 });
  sl.xValues.forEach((v, i) => lab(v, { x: x0 + i * (w + 0.15), y: B.y + 0.2, w, h: 0.24 }, { color: kit.K.ink }));
  lab(tf.wrapLine(sl.yLabel, (lw * 72) / 15, { noIndent: true }).join("\n"), { x: B.x, y: y0, w: lw, h: h * 2 + 0.15 });
  sl.yValues.forEach((v, j) => lab(v, { x: B.x + lw, y: y0 + j * (h + 0.15), w: vw, h }, { color: kit.K.ink }));
  sl.cells.forEach((row, j) => row.forEach((c, i) => {
    const box = { x: x0 + i * (w + 0.15), y: y0 + j * (h + 0.15), w, h };
    if (!c || c.none) kit.frame(s, [`{g:${(c && c.none) || "この組合せはない"}}`], box, { color: "rule", align: "center", sizes: [15, 14, 13], lineWidth: LINE.rule, small: true });
    else kit.frame(s, [`{${c.accent ? "r" : "b"}:${c.title}}`].concat(arr(c.lines)), box, { color: c.accent ? "accent" : "base", sizes: [16, 15, 14, 13], gap: 2 });
  }));
  if (sl.key) kit.text(s, pts(sl.key, "→ "), { x: B.x, y: B.y + B.h - keyH, w: B.w, h: keyH }, { sizes: [16, 15], valign: "middle" });
  return s;
};

// 30 正誤の確認（短答式の命題）：左に ○／×、右に命題と根拠。answers:false なら「？」にして根拠を出さない（問いの枚）
L.tf_check = (ctx, sl) => {
  const s = base(ctx, sl), kit = ctx.kit, K = kit.K, items = arr(sl.items), show = sl.answers !== false, keyH = sl.key ? 0.65 : 0;
  let y = B.y;
  if (sl.lead) { const lh = tf.fit(arr(sl.lead), B.w, 0.8, [16, 15]).height + 0.04; kit.text(s, arr(sl.lead), { x: B.x, y, w: B.w, h: lh }, { sizes: [16, 15], valign: "middle" }); y += lh + 0.1; }
  const gap = 0.14, n = Math.max(1, items.length), h = Math.min(1.25, (B.y + B.h - y - keyH - (sl.key ? 0.1 : 0) - gap * (n - 1)) / n), mw = 0.95;
  items.forEach((it, i) => {
    const yy = y + i * (h + gap), wrong = /^[×✕xX]/.test(String(it.answer || ""));
    const mark = show ? (wrong ? "×" : "○") : "？";
    // 正誤は形（○・×）で区別する。色では区別しない（白黒の印刷・色の見分けにくい人でも分かるように。10-accessibility-print.md）
    s.addText(mark, { shape: ctx.pres.shapes.RECTANGLE, x: B.x, y: yy, w: mw, h, fill: { color: K.paper }, line: { color: K.base, width: LINE.frame }, fontSize: 28, bold: true, color: show ? K.ink : K.gray, fontFace: FONT, align: "center", valign: "middle", margin: 0, fit: "none", objectName: "tfMark" });
    const lines = [`{b:${it.no || "①②③④⑤⑥"[i]}}　${it.statement}`].concat(show && it.basis ? arr(it.basis).map((t) => `{n:→ ${t}}`) : []);
    kit.frame(s, lines, { x: B.x + mw, y: yy, w: B.w - mw, h }, { color: "base", sizes: [16, 15, 14, 13], gap: 2, padY: 0.05, name: "tfBody" });
  });
  if (sl.key) kit.text(s, pts(sl.key, "→ "), { x: B.x, y: B.y + B.h - keyH, w: B.w, h: keyH }, { sizes: [16, 15], valign: "middle" });
  return s;
};

// 31 時間軸：出来事を左から右へ並べ、期間（いつからいつまで）を軸の上に両矢印で示す。起算点・期間・満了を見せる1枚
L.time_axis = (ctx, sl) => {
  const s = base(ctx, sl), kit = ctx.kit, K = kit.K, ev = arr(sl.events), spans = arr(sl.spans), keyH = sl.key ? 0.65 : 0;
  let yTop = B.y;
  if (sl.lead) { const lh = tf.fit(arr(sl.lead), B.w, 0.8, [16, 15]).height + 0.04; kit.text(s, arr(sl.lead), { x: B.x, y: yTop, w: B.w, h: lh }, { sizes: [16, 15], valign: "middle" }); yTop += lh + 0.08; }
  const n = Math.max(1, ev.length), x0 = B.x + 0.2, x1 = B.x + B.w - 0.3, cw = (x1 - x0) / n, cx = (i) => x0 + cw * (i + 0.5);
  const idx = (id) => { const k = ev.findIndex((e) => e.id === id); if (k < 0) kit.warn(`時間軸：期間の端の出来事が無い（${id}）`); return Math.max(0, k); };
  const rowsN = spans.reduce((a, sp) => Math.max(a, sp.row || 1), 0), spanH = 0.6;
  const yBottom = B.y + B.h - keyH - (sl.key ? 0.1 : 0);
  // 図全体（期間の行＋軸＋出来事の文字およそ 1.2）が領域の中ほどに来るよう、上を少し空ける
  yTop += Math.min(0.45, Math.max(0, (yBottom - yTop - (rowsN * spanH + 0.42 + 1.2)) / 2));
  const yAxis = yTop + rowsN * spanH + 0.42;                     // 軸の高さ（上に期間の行、その下に「いつ」のラベル）
  // 期間（上の行ほど長い期間を置くと読みやすい）
  spans.forEach((sp) => {
    const a = idx(sp.from), b = idx(sp.to), row = sp.row || 1, ly = yTop + (row - 1) * spanH + 0.42, xa = cx(Math.min(a, b)), xb = cx(Math.max(a, b));
    [xa, xb].forEach((x) => s.addShape(ctx.pres.shapes.LINE, { x, y: ly + 0.1, w: 0.001, h: Math.max(0.01, yAxis - 0.44 - ly - 0.1), line: { color: K.rule, width: LINE.thin, dashType: "dash" }, objectName: "guide" }));
    kit.arrow(s, xa, ly, xb, ly, { state: sp.accent ? "new" : "past", both: true, width: sp.accent ? 3 : LINE.arrowPast, dash: sp.dash });
    const size = 14, lw = xb - xa - 0.1;
    if (tf.widthIn(tf.strip(sp.label || ""), size) > lw) kit.warn(`時間軸：期間のラベルが長い（「${tf.strip(sp.label).slice(0, 12)}…」）。短くするか、出来事の間隔を空ける`);
    s.addText(kit.runs(sp.accent ? `{r:${tf.strip(sp.label || "")}}` : sp.label || "", size, {}), { x: xa + 0.05, y: ly - 0.36, w: lw, h: 0.3, margin: 0, align: "center", valign: "bottom", fontFace: FONT, isTextBox: true, fit: "none", objectName: "axisLabel" });
  });
  // 軸と出来事
  kit.arrow(s, x0, yAxis, x1 + 0.15, yAxis, { state: "past", width: LINE.arrowPast });
  ev.forEach((e, i) => {
    const x = cx(i);
    s.addShape(ctx.pres.shapes.LINE, { x, y: yAxis - 0.09, w: 0.001, h: 0.18, line: { color: e.accent ? K.accent : K.ink, width: e.accent ? LINE.arrowNew : LINE.arrowPast }, objectName: "tick" });
    if (e.when) s.addText(e.when, { x: x - cw / 2 + 0.04, y: yAxis - 0.4, w: cw - 0.08, h: 0.26, fontSize: 13, bold: true, color: K.gray, fontFace: FONT, margin: 0, align: "center", valign: "bottom", isTextBox: true, fit: "none", objectName: "axisLabel" });
    const lines = [e.accent ? `{r:${e.label}}` : e.label].concat(arr(e.sub).map((t) => `{n:${t}}`));
    kit.text(s, lines, { x: x - cw / 2 + 0.06, y: yAxis + 0.16, w: cw - 0.12, h: Math.max(0.5, yBottom - yAxis - 0.2) }, { sizes: [16, 15, 14, 13], align: "center", gap: 2, name: "axisEvent" });
  });
  if (sl.key) kit.text(s, pts(sl.key, "→ "), { x: B.x, y: B.y + B.h - keyH, w: B.w, h: keyH }, { sizes: [16, 15], valign: "middle" });
  return s;
};

// 32 場合分け：問いを上から順に並べ、「はい」なら右の結論へ、「いいえ」なら下の問いへ進む
L.branch = (ctx, sl) => {
  const s = base(ctx, sl), kit = ctx.kit, K = kit.K, qs = arr(sl.questions), keyH = sl.key ? 0.5 : 0;
  const last = qs[qs.length - 1] || {}, rows = qs.length + (last.no ? 1 : 0), gap = 0.26;
  const h = Math.min(1.25, (B.h - keyH - (sl.key ? 0.08 : 0) - gap * (rows - 1)) / Math.max(1, rows));
  const qw = sl.questionW || 4.3, aw = 0.95, ow = B.w - qw - aw, yesL = sl.yesLabel || "はい", noL = sl.noLabel || "いいえ";
  const small = (t, box, o = {}) => s.addText(t, { ...box, fontSize: 13, bold: true, color: K.ink, fontFace: FONT, margin: 0, align: "center", valign: "middle", isTextBox: true, fit: "none", objectName: "axisLabel", ...o });
  const outcome = (o, box) => kit.frame(s, [`{${o.accent ? "r" : "b"}:${o.title}}`].concat(arr(o.lines)), box, { color: o.accent ? "accent" : "base", sizes: [16, 15, 14, 13], gap: 2, padY: 0.05 });
  qs.forEach((q, i) => {
    const y = B.y + i * (h + gap);
    kit.frame(s, [`{b:${q.tag || "問" + "①②③④⑤"[i]}}　${q.q}`].concat(arr(q.lines)), { x: B.x, y, w: qw, h }, { sizes: [16, 15, 14, 13], gap: 2, padY: 0.05 });
    if (q.yes) {
      kit.arrow(s, B.x + qw + 0.05, y + h / 2, B.x + qw + aw - 0.05, y + h / 2, { state: "past", width: 2.5 });
      small(q.yesLabel || yesL, { x: B.x + qw + 0.05, y: y + h / 2 - 0.3, w: aw - 0.1, h: 0.24 });
      outcome(q.yes, { x: B.x + qw + aw, y, w: ow, h });
    }
    if (i < rows - 1) {
      kit.arrow(s, B.x + qw / 2, y + h + 0.03, B.x + qw / 2, y + h + gap - 0.03, { state: "past", width: 2.5 });
      small(q.noLabel || noL, { x: B.x + qw / 2 + 0.1, y: y + h + 0.03, w: 0.9, h: gap - 0.06 }, { align: "left" });
    }
  });
  if (last.no) outcome(last.no, { x: B.x, y: B.y + qs.length * (h + gap), w: qw, h });
  if (sl.key) kit.text(s, pts(sl.key, "→ "), { x: B.x, y: B.y + B.h - keyH, w: B.w, h: keyH }, { sizes: [16, 15], valign: "middle" });
  return s;
};

// 33 相関図：当事者を箱（白地＋黒の枠）で描き、左右を「親族関係｜取引関係」のように縦線で分ける。
// 争いの中心になる関係だけを強調色にする（emphasis:true）。結びつき（親子・所有）は矢じりのない線（arrow:false）、世話などは点線（dash:true）。
// 時系列（timeline）の前に置き、全体の地図として見せる。段を追う図は timeline に任せる。
L.sokan = (ctx, sl) => {
  const s = base(ctx, sl), kit = ctx.kit, K = kit.K, R = regionOf(ctx, s, sl), d = sl.diagram || sl;
  const cap = sl.caption ? arr(sl.caption) : null, capH = cap ? 0.34 * cap.length + 0.12 : 0, keyH = sl.key ? tf.fit(pts(sl.key, "→ "), R.w, 2, [16]).height + 0.06 : 0;
  const groups = arr(sl.groups), titleH = groups.length ? 0.3 : 0;
  const area = { x: R.x - 0.1, y: R.y + titleH, w: R.w + 0.2, h: R.h - titleH - keyH - (sl.key ? 0.1 : 0) };
  const cols = d.cols || Math.max(...d.actors.map((a) => a.col)) + 1, cw = area.w / cols;
  // 区切りの縦線と、左右の題（基調色・小さめ）
  let x0 = area.x;
  groups.forEach((g, i) => {
    const span = g.cols || cols / groups.length, w = span * cw;
    s.addText(g.title, { x: x0 + 0.08, y: R.y - 0.04, w: w - 0.16, h: 0.28, fontSize: SIZE.role, bold: true, color: K.base, fontFace: FONT, margin: 0, valign: "middle", isTextBox: true, fit: "none", objectName: "groupTitle" });
    if (i < groups.length - 1) s.addShape(ctx.pres.shapes.LINE, { x: x0 + w, y: R.y - 0.02, w: 0, h: area.h + titleH - capH, line: { color: K.rule, width: LINE.rule }, objectName: "divider" });
    x0 += w;
  });
  relationDiagram(kit, s, d, { x: area.x, y: area.y, w: area.w, h: area.h - capH }, null, { past: "ink", box: true, cols });
  // 図の右下の注（帯の色の地）。争いの中心になる事実を1行で
  if (cap) {
    const w = Math.min(area.w * 0.6, Math.max(...cap.map((t) => tf.widthIn(tf.strip(t), 12))) + 0.5);
    s.addShape(ctx.pres.shapes.RECTANGLE, { x: area.x + area.w - w, y: area.y + area.h - capH + 0.06, w, h: capH - 0.06, fill: { color: K.band }, line: { color: K.band, width: 0 }, objectName: "captionBand" });
    s.addText(cap.map((t) => tf.strip(t)).join("\n"), { x: area.x + area.w - w, y: area.y + area.h - capH + 0.06, w, h: capH - 0.06, fontSize: 12, bold: true, color: K.ink, margin: 0, align: "center", valign: "middle", fontFace: FONT, isTextBox: true, fit: "none", objectName: "diagramNote" });
  }
  if (sl.key) kit.text(s, pts(sl.key, "→ "), { x: R.x, y: R.y + R.h - keyH, w: R.w, h: keyH }, { sizes: [16, 15], valign: "middle" });
  return s;
};

module.exports = { layouts: L };
