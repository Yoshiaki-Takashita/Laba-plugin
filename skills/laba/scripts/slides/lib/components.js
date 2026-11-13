// LABA スライドの部品。どの部品も「白地＋枠線」「大きな太字」「図形で描く」を守る。
// 影・角丸・グラデーション・丸で囲んだアイコン・bullet 機能は使わない。
"use strict";
const { SLIDE, FONT, SIZE, LINE, GRID, LEADING, PARA_GAP } = require("./tokens");
const SEV = require("./severity.json");   // deck_lint.py と共通の重さ（空きの閾値など）
const tf = require("./textfit");

// 行頭記号（◎・）の直後が半角の字なら、詰まって見えないよう空きを入れる
const markGap = (t) => String(t).replace(/^(◎|・)(?=[A-Za-z0-9])/, "$1 ");

class Kit {
  constructor(pres, theme, opt = {}) {
    this.pres = pres; this.K = theme; this.opt = opt;
    this.warnings = [];   // 直さないと渡せないもの（収まらない文字、語の途中の改行、置けないラベル、仮の文字）。作成が止まる
    this.notes = [];      // 確かめるもの（余白が多い、ラベルが長い、本文が小さい）。作成は止まらない
    this.cur = null;      // 作業中のスライドの名前（警告に付ける）
    this.chars = 0;       // 作業中のスライドに置いた文字の数（見出し・大項目名を除く。deck_lint.py と同じ数え方）
    this.minBody = 99;    // 作業中のスライドの本文のいちばん小さい文字
  }
  warn(msg) { this.warnings.push(`${this.cur || "?"}: ${msg}`); }
  note(msg) { this.notes.push(`${this.cur || "?"}: ${msg}`); }
  // スライドに置く文字を数える（addText・addTable を包む）。見出し・大項目名は数えない。
  track(s) {
    const kit = this, addText = s.addText.bind(s), addTable = s.addTable.bind(s);
    const len = (t) => String(t).replace(/[\s\u3000]/g, "").length;
    const count = (t) => (Array.isArray(t) ? t.reduce((a, r) => a + count(r.text), 0) : len(t ?? ""));
    s.addText = (t, o = {}) => { if (!["heading", "section"].includes(o.objectName)) kit.chars += count(t); return addText(t, o); };
    s.addTable = (rows, o = {}) => { rows.forEach((r) => r.forEach((c) => { kit.chars += count(c.text); })); return addTable(rows, o); };
    return s;
  }
  // 語の途中で切れた・1〜2字の行ができた、を知らせる
  // 文字の候補から、役割の下限（本文・条文 SIZE.bodyFloor＝15pt。deck_lint の下限 14.5pt より 0.5pt 上に余裕を取る。参考文献 11pt、small は 9pt）より小さいものを除く。textfit が下限より小さくして収めることはしない
  floored(sizes, o = {}) {
    const fl = o.small ? SIZE.floor : o.name === "refs" ? 11 : SIZE.bodyFloor;
    const ok = sizes.filter((x) => x >= fl);
    return ok.length ? ok : [fl];
  }
  badBreak(f, lines) { if (f.bad) this.warn(`語の途中で改行するか、1〜2字だけの行ができる（${f.size}pt）：「${tf.strip(String([].concat(lines)[0])).slice(0, 18)}…」。文を短くするか、言い回しを変える`); }
  color(name) { return this.K[name] || name || this.K.ink; }

  // ---- 文字 ----
  // 装飾つきの1行を run の配列にする。{r:…} 強調色、{b:…} 基調色、{g:…} 灰、{n:…} 太字にしない。
  runs(line, size, o = {}) {
    const out = []; const re = /\{([rbgn]):([^{}]*)\}/g; let m, last = 0;
    const base = { fontSize: size, bold: o.bold !== false, color: this.color(o.color || "ink"), fontFace: FONT };
    const push = (t, extra) => { if (t !== "") out.push({ text: t, options: { ...base, ...extra } }); };
    while ((m = re.exec(line))) {
      push(line.slice(last, m.index));
      const tag = m[1];
      push(m[2], tag === "r" ? { color: this.K.accent } : tag === "b" ? { color: this.K.base } : tag === "g" ? { color: this.K.gray } : { bold: false });
      last = re.lastIndex;
    }
    push(line.slice(last));
    if (!out.length) out.push({ text: " ", options: { ...base } });
    return out;
  }

  // 改行済みの行の列を、段落の区切りを保って run にする。
  paragraphs(fitResult, o = {}) {
    const all = []; const { lines, paraEnd, size } = fitResult;
    lines.forEach((ln, i) => {
      const rs = this.runs(ln, o.sizeOf ? o.sizeOf(i, size) : size, o.styleOf ? { ...o, ...o.styleOf(i) } : o);
      const startsPara = i === 0 || paraEnd[i - 1];
      if (!startsPara) rs[0].options.softBreakBefore = true;
      if (paraEnd[i] && i < lines.length - 1) rs[rs.length - 1].options.breakLine = true;
      rs.forEach((r) => { r.options.paraSpaceAfter = o.gap ?? PARA_GAP; });
      all.push(...rs);
    });
    return all;
  }

  // 文字の枠（線なし）。lines は文字列の配列。sizes は大きい順の候補。
  text(s, lines, box, o = {}) {
    const sizes = this.floored(o.sizes || [SIZE.bodyMax, SIZE.body, 16, SIZE.bodyMin], o);
    lines = [].concat(lines).map(markGap);
    const f = tf.fit([].concat(lines), box.w, box.h, sizes, { gap: o.gap });
    if (!f.fits) this.warn(`文字が枠に収まらない（下限の ${f.size}pt でも高さ ${f.height.toFixed(2)} > ${box.h.toFixed(2)}）：「${tf.strip(String([].concat(lines)[0])).slice(0, 16)}…」。縮めずに、文を要約するか2枚に分ける`);
    this.badBreak(f, lines);
    if (!o.small) this.minBody = Math.min(this.minBody, f.size);
    s.addText(this.paragraphs(f, o), {
      x: box.x, y: box.y, w: box.w, h: box.h, margin: 0, valign: o.valign || "top", align: o.align || "left",
      lineSpacing: Math.round(f.size * LEADING * 10) / 10, fit: "none", isTextBox: true, objectName: o.name,
    });
    return f;
  }

  // 白地＋枠線の囲み。文字は枠の中で上下中央。color: base（既定）か accent（結論・定義・「本件では」）
  frame(s, lines, box, o = {}) {
    const col = this.color(o.color || "base");
    const padX = o.padX ?? GRID.pad.x, padY = o.padY ?? GRID.pad.y;
    const inner = { w: box.w - padX * 2, h: box.h - padY * 2 };
    const sizes = this.floored(o.sizes || [SIZE.bodyMax, SIZE.body, 16, SIZE.bodyMin], o);
    lines = [].concat(lines).map(markGap);
    const f = tf.fit([].concat(lines), inner.w, inner.h, sizes, { gap: o.gap });
    if (!f.fits) this.warn(`枠に収まらない（下限の ${f.size}pt でも入らない）：「${tf.strip(String([].concat(lines)[0])).slice(0, 16)}…」。縮めずに、文を要約するか2枚に分ける`);
    this.badBreak(f, lines);
    if (!o.small && o.name !== "statute") this.minBody = Math.min(this.minBody, f.size);
    // o.color は枠線の色。文字の色は o.textColor（既定は黒）で、強調は {r:…} で語だけに付ける
    s.addText(this.paragraphs(f, { ...o, color: o.textColor }), {
      shape: this.pres.shapes.RECTANGLE, x: box.x, y: box.y, w: box.w, h: box.h,
      fill: { color: this.K.paper }, line: { color: col, width: o.lineWidth || LINE.frame },
      margin: [padX * 72, padX * 72, padY * 72, padY * 72] /* 左・右・下・上（pptxgenjs の並び） */, valign: o.valign || "middle", align: o.align || "left",
      lineSpacing: Math.round(f.size * LEADING * 10) / 10, fit: "none", objectName: o.name || "frame",
    });
    return f;
  }

  // 条文の枠：条文名（基調色・太字）＋条文本文（太字にしない）
  statute(s, st, box) {
    const lines = [`{b:${st.name}}`].concat([].concat(st.text).map((t) => `{n:${t}}`));
    return this.frame(s, lines, box, { sizes: st.sizes || [SIZE.statute, SIZE.statuteMin], gap: 3, valign: "middle", name: "statute" });
  }

  // 左上の見出し、右上の大項目名、区切り線、頁番号
  header(s, heading, section) {
    const g = GRID;
    s.addText(heading, { x: g.heading.x, y: g.heading.y, w: section ? g.heading.w : 9.2, h: g.heading.h, fontSize: SIZE.heading, bold: true, color: this.K.ink, fontFace: FONT, margin: 0, valign: "middle", fit: "none", isTextBox: true, objectName: "heading" });
    if (tf.widthIn(heading, SIZE.heading) > (section ? g.heading.w : 9.2)) this.warn(`見出しが長すぎる：「${heading.slice(0, 20)}…」`);
    if (section) s.addText(section, { x: g.section.x, y: g.section.y, w: g.section.w, h: g.section.h, fontSize: SIZE.section, bold: true, color: this.K.gray, fontFace: FONT, margin: 0, align: "right", valign: "middle", isTextBox: true, objectName: "section" });
    s.addShape(this.pres.shapes.LINE, { x: 0, y: g.rule.y, w: SLIDE.w, h: 0, line: { color: this.K.rule, width: LINE.rule }, objectName: "rule" });
  }

  // 下部の帯：見出し1行＋「・」の箇条
  band(s, head, items, o = {}) {
    const y = o.y ?? GRID.band.y, h = SLIDE.h - y;
    s.addShape(this.pres.shapes.RECTANGLE, { x: 0, y, w: SLIDE.w, h, fill: { color: this.K.band }, line: { color: this.K.band, width: 0 }, objectName: "band" });
    const lines = [head].concat((items || []).map((t) => (/^[・→◎]/.test(t) ? t : "・" + t)));
    const box = { x: 0.3, y: y + 0.1, w: 9.2, h: h - 0.45 };
    return this.text(s, lines, box, { sizes: [SIZE.band, 16, SIZE.bandItem, 14], sizeOf: (i, sz) => (i === 0 ? sz : sz - 2 < 13 ? 13 : sz - 2), gap: 3, name: "bandText" });
  }

  // ---- 図形のピクト（画像を使わない） ----
  picto(s, kind, x, y, sz, colorName) {
    const P = this.pres.shapes, ink = this.color(colorName || "ink"), paper = this.K.paper;
    const put = (shape, a, b, c, d, fill, extra = {}) => s.addShape(shape, { x: x + a * sz, y: y + b * sz, w: (c - a) * sz, h: (d - b) * sz, fill: { color: fill }, line: { color: fill, width: 0 }, objectName: "picto", ...extra });
    const person = (ox, oy, k) => {
      put(P.OVAL, ox + 0.33 * k, oy, ox + 0.67 * k, oy + 0.32 * k, ink);
      put(P.ROUND_2_SAME_RECTANGLE, ox + 0.2 * k, oy + 0.37 * k, ox + 0.8 * k, oy + 1.0 * k, ink);
    };
    const pillars = (n) => {
      put(P.ISOSCELES_TRIANGLE, 0.04, 0.0, 0.96, 0.3, ink);
      put(P.RECTANGLE, 0.1, 0.33, 0.9, 0.41, ink);
      for (let i = 0; i < n; i++) { const cx = 0.16 + (0.68 / (n - 1)) * i; put(P.RECTANGLE, cx - 0.05, 0.45, cx + 0.05, 0.85, ink); }
      put(P.RECTANGLE, 0.04, 0.89, 0.96, 1.0, ink);
    };
    switch (kind) {
      case "person": person(0, 0, 1); break;
      case "woman":
        put(P.OVAL, 0.33, 0, 0.67, 0.32, ink); put(P.TRAPEZOID, 0.14, 0.37, 0.86, 1.0, ink); break;
      case "child": person(0.14, 0.28, 0.72); break;
      case "suit": // 背広の人（会社の代表者・叔父など）。胸元に白い襟とネクタイ
        person(0, 0, 1); put(P.ISOSCELES_TRIANGLE, 0.38, 0.4, 0.62, 0.62, paper, { flipV: true }); put(P.RECTANGLE, 0.47, 0.44, 0.53, 0.8, ink); break;
      case "group": person(-0.02, 0.18, 0.62); person(0.4, 0.18, 0.62); person(0.17, 0.0, 0.66); break;
      case "company":
        put(P.RECTANGLE, 0.18, 0.04, 0.82, 1.0, ink);
        for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) put(P.RECTANGLE, 0.29 + c * 0.26, 0.14 + r * 0.22, 0.45 + c * 0.26, 0.27 + r * 0.22, paper);
        put(P.RECTANGLE, 0.42, 0.8, 0.58, 1.0, paper); break;
      case "bank": pillars(4); break;
      case "court": pillars(3); put(P.RECTANGLE, 0.0, 0.96, 1.0, 1.0, ink); break;
      case "landmark": pillars(5); break;                      // 保証協会・公的な機関
      case "gavel": // 裁判（木槌）
        put(P.RECTANGLE, 0.1, 0.12, 0.62, 0.4, ink, { rotate: -35 }); put(P.RECTANGLE, 0.34, 0.42, 0.9, 0.52, ink, { rotate: 40 }); put(P.RECTANGLE, 0.04, 0.86, 0.6, 1.0, ink); break;
      case "scale": // 比べる・衡量（天秤）
        put(P.RECTANGLE, 0.47, 0.08, 0.53, 0.9, ink); put(P.RECTANGLE, 0.1, 0.14, 0.9, 0.2, ink); put(P.RECTANGLE, 0.28, 0.9, 0.72, 1.0, ink);
        put(P.ISOSCELES_TRIANGLE, 0.02, 0.36, 0.34, 0.56, ink, { flipV: true }); put(P.ISOSCELES_TRIANGLE, 0.66, 0.36, 0.98, 0.56, ink, { flipV: true }); break;
      case "landpin": // 土地（地面＋位置の印）
        put(P.PARALLELOGRAM, 0.0, 0.62, 1.0, 1.0, ink); put(P.OVAL, 0.32, 0.0, 0.68, 0.36, ink); put(P.ISOSCELES_TRIANGLE, 0.36, 0.26, 0.64, 0.66, ink, { flipV: true }); put(P.OVAL, 0.43, 0.1, 0.57, 0.24, paper); break;
      case "agency":
        put(P.RECTANGLE, 0.42, 0.06, 0.58, 0.36, ink); put(P.RECTANGLE, 0.08, 0.34, 0.92, 1.0, ink);
        for (let c = 0; c < 4; c++) put(P.RECTANGLE, 0.17 + c * 0.18, 0.48, 0.28 + c * 0.18, 0.64, paper);
        put(P.RECTANGLE, 0.43, 0.76, 0.57, 1.0, paper); break;
      case "land":
        put(P.PARALLELOGRAM, 0.0, 0.5, 1.0, 0.92, ink); break; // 斜めから見た地面
      case "house":
        put(P.ISOSCELES_TRIANGLE, 0.04, 0.04, 0.96, 0.46, ink); put(P.RECTANGLE, 0.18, 0.46, 0.82, 1.0, ink); put(P.RECTANGLE, 0.42, 0.68, 0.58, 1.0, paper); break;
      case "document":
        put(P.RECTANGLE, 0.2, 0.04, 0.8, 1.0, ink);
        for (let r = 0; r < 4; r++) put(P.RECTANGLE, 0.3, 0.2 + r * 0.18, r === 3 ? 0.55 : 0.7, 0.26 + r * 0.18, paper); break;
      case "money":
        put(P.RECTANGLE, 0.04, 0.24, 0.96, 0.8, ink); put(P.OVAL, 0.36, 0.36, 0.64, 0.68, paper); break;
      case "goods":
        put(P.RECTANGLE, 0.14, 0.3, 0.86, 1.0, ink); put(P.RECTANGLE, 0.14, 0.44, 0.86, 0.48, paper); put(P.RECTANGLE, 0.46, 0.3, 0.54, 0.44, paper); break;
      default: person(0, 0, 1);
    }
  }

  // 当事者：ピクト＋大きな記号＋下に小さく役割。中心 (cx, cy)。戻り値は外形（矢印を当てる箱）。
  actor(s, a, cx, cy, o = {}) {
    if (a.box || o.box) return this.actorBox(s, a, cx, cy, o);
    const sz = o.size || 0.6, sym = a.symbol || "", symSize = o.symbolSize || SIZE.symbol;
    const symW = sym ? Math.max(0.42, tf.widthIn(sym, symSize) + 0.06) : 0;
    const totalW = sz + (sym ? 0.08 + symW : 0);
    const x0 = cx - totalW / 2, y0 = cy - sz / 2 - 0.12;
    this.picto(s, a.kind || "person", x0, y0, sz, a.muted ? "gray" : "ink");
    if (sym) s.addText(sym, { x: x0 + sz + 0.08, y: y0 - 0.05, w: symW, h: sz + 0.1, fontSize: symSize, bold: true, color: a.muted ? this.K.gray : this.K.ink, fontFace: FONT, margin: 0, valign: "middle", isTextBox: true, objectName: "symbol" });
    let roleH = 0;
    if (a.role) {
      const rl = tf.label2(a.role, o.roleW || 1.7, SIZE.role); roleH = rl.length * 0.2 + 0.06;
      s.addText(rl.join("\n"), { x: cx - (o.roleW || 1.7) / 2, y: y0 + sz + 0.04, w: o.roleW || 1.7, h: roleH, fontSize: SIZE.role, bold: true, color: this.K.gray, fontFace: FONT, margin: 0, align: "center", valign: "top", isTextBox: true, objectName: "role" });
    }
    const half = Math.max(totalW / 2, 0.45);
    // 外形（線を当てる箱）と、実際に絵・文字がある所（parts：ピクト＋記号、役割の文字）。ラベルは parts を避けて置く
    const roleLinesW = a.role ? Math.max(...tf.label2(a.role, o.roleW || 1.7, SIZE.role).map((t) => tf.widthIn(tf.strip(t), SIZE.role))) + 0.06 : 0;
    const parts = [{ x: cx - totalW / 2 - 0.04, y: y0 - 0.04, w: totalW + 0.08, h: sz + 0.1 }];
    if (a.role) parts.push({ x: cx - roleLinesW / 2, y: y0 + sz + 0.04, w: roleLinesW, h: roleH });
    return { x: cx - half - 0.06, y: y0 - 0.06, w: half * 2 + 0.12, h: sz + roleH + 0.16, cx, cy: y0 + sz / 2, parts };
  }

  // 相関図の箱：白地＋黒の細い枠に、記号（名前）と、小さい灰色の説明。色は a.color（accent＝争いの中心、base＝基調）。a.fill:true で帯の色の地。
  actorBox(s, a, cx, cy, o = {}) {
    const sym = a.symbol || a.label || "", symSize = o.symbolSize || 17, subSize = SIZE.note;
    const subs = [].concat(a.sub || a.role || []).filter(Boolean);
    const maxW = o.maxW || 2.2;
    const subLines = []; subs.forEach((t) => subLines.push(...tf.label2(t, maxW - 0.2, subSize)));
    const w = Math.min(maxW, Math.max(a.w || 0.95, tf.widthIn(sym, symSize) + 0.36, ...subLines.map((t) => tf.widthIn(tf.strip(t), subSize) + 0.24)));
    const h = a.h || 0.36 + subLines.length * 0.17 + (subLines.length ? 0.1 : 0.04);
    const col = this.color(a.color || "ink"), strong = a.color === "accent";
    const runs = this.runs(sym, symSize, { color: strong ? "accent" : "ink" });
    subLines.forEach((t, i) => { const rs = this.runs(t, subSize, { color: "gray" }); if (i === 0) runs[runs.length - 1].options.breakLine = true; else rs[0].options.softBreakBefore = true; runs.push(...rs); });
    s.addText(runs, { shape: this.pres.shapes.RECTANGLE, x: cx - w / 2, y: cy - h / 2, w, h, fill: { color: a.fill ? this.K.band : this.K.paper }, line: { color: col, width: strong || a.color === "base" ? LINE.frame : LINE.rule },
      margin: 2, align: "center", valign: "middle", fit: "none", objectName: "actorBox" });
    return { x: cx - w / 2, y: cy - h / 2, w, h, cx, cy };
  }

  // 矢印（線）。state: new（強調色・太い）／past（黒・細め）／muted（灰）／base（基調色）。noHead で矢じりなし（結びつきを表す線）
  arrow(s, x1, y1, x2, y2, o = {}) {
    const state = o.state || "past";
    const color = state === "new" ? this.K.accent : state === "muted" ? this.K.gray : state === "base" ? this.K.base : this.K.ink;
    const width = o.width || (state === "new" ? LINE.arrowNew : LINE.arrowPast);
    s.addShape(this.pres.shapes.LINE, {
      x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1) || 0.001, h: Math.abs(y2 - y1) || 0.001, flipH: x2 < x1, flipV: y2 < y1,
      line: { color, width, endArrowType: o.noHead ? undefined : "triangle", beginArrowType: o.both ? "triangle" : undefined, dashType: o.dash ? "dash" : undefined }, objectName: "arrow",
    });
  }

  // 表の行の高さを見積もる（size pt のとき）
  tablePlan(rows, colW, size) {
    let bad = 0;
    const cells = rows.map((r) => r.map((c, j) => { const lines = []; String(c).split("\n").forEach((ln) => { const w = tf.wrapLine(ln, ((colW[j] - 0.27) * 72) / size - tf.MARGIN, { noIndent: false }); bad += w.bad || 0; lines.push(...w); }); return lines; }));
    const rowH = cells.map((r) => Math.max(...r.map((l) => l.length)) * (size * LEADING) / 72 + 0.15);
    return { size, cells, rowH, total: rowH.reduce((a, b) => a + b, 0), bad };
  }
  tableColW(rows, box, o) {
    const n = rows[0].length;
    return o.colW ? o.colW.map((w) => (w / o.colW.reduce((a, b) => a + b, 0)) * box.w) : Array(n).fill(box.w / n);
  }

  // 表：1行目が見出し行（teal は基調色の塗り＋白の太字、mono は薄い帯＋黒の太字）。セルは装飾の記法を使える。
  table(s, rows, box, o = {}) {
    let colW = this.tableColW(rows, box, o);
    const sizes = o.sizes || [SIZE.table, 15, 14, SIZE.tableMin];
    let plan = null;
    let firstFit = null;
    for (const size of sizes) { plan = this.tablePlan(rows, colW, size); if (plan.total <= box.h + 0.005) { if (!plan.bad) { firstFit = plan; break; } firstFit = firstFit || plan; } }
    plan = firstFit || plan;
    // 15pt を下回るときは、縮める前に列の幅を中身の長さに合わせて配り直して試す（長い列を広く、短い列を狭く。1列 0.9in 以上）
    if (plan.size < 15 && rows[0].length > 1) {
      const need = rows[0].map((_, j) => Math.max(...rows.map((r) => tf.textW(tf.strip(String(r[j] ?? ""))))) + 1);
      const root = need.map((n) => Math.sqrt(n)), sum = root.reduce((a, b) => a + b, 0);
      let alt = root.map((r) => Math.max(0.9, (box.w * r) / sum)); const k = box.w / alt.reduce((a, b) => a + b, 0); alt = alt.map((w) => w * k);
      for (const size of sizes.filter((x) => x > plan.size)) {
        const p2 = this.tablePlan(rows, alt, size);
        if (p2.total <= box.h + 0.005 && !p2.bad) { plan = p2; colW = alt; this.note(`表の列の幅を配り直して ${size}pt にした（指定の colW では ${firstFit ? firstFit.size : "?"}pt になる）`); break; }
      }
    }
    if (plan.total > box.h + 0.01) this.warn(`表が枠に収まらない（${plan.size}pt、高さ ${plan.total.toFixed(2)} > ${box.h.toFixed(2)}）`);
    if (plan.bad) this.warn(`表のセルで、語の途中の改行か1〜2字だけの行ができる（${plan.size}pt）。セルの文を短くするか、列の幅（colW）を変える`);
    this.minBody = Math.min(this.minBody, plan.size + 2);   // 表は本文より 2pt 小さくてよい
    const extra = Math.max(0, Math.min(box.h - plan.total, plan.total * 0.4)) / rows.length; // 余れば行を少し広げる
    const border = { type: "solid", color: this.K.base, pt: LINE.table };
    const hasHead = o.header !== false;
    // 列ごとの揃え：本文のセルがどれも短い（1行で全角10字以内）列は中央、それ以外は左
    const shortCol = rows[0].map((_, j) => rows.slice(hasHead ? 1 : 0).every((r) => tf.textW(tf.strip(String(r[j]))) <= 10 && !String(r[j]).includes("\n")));
    const data = plan.cells.map((r, i) => r.map((lines, j) => {
      const head = i === 0 && hasHead;
      const runs = [];
      lines.forEach((ln, k) => { const rs = this.runs(ln, plan.size, {}); if (head) rs.forEach((r2) => { r2.options.color = this.K.headText; }); if (k > 0) rs[0].options.softBreakBefore = true; runs.push(...rs); });
      return { text: runs, options: { fill: { color: head ? this.K.headFill : this.K.paper }, align: head || shortCol[j] ? "center" : "left", valign: "middle", border: [border, border, border, border], margin: [4, 8, 4, 10] /* 上・右・下・左（表のセルはこの並び） */ } };
    }));
    s.addTable(data, { x: box.x, y: box.y, w: box.w, colW, rowH: plan.rowH.map((h) => h + extra), fontFace: FONT, lineSpacing: Math.round(plan.size * LEADING * 10) / 10, objectName: "table" });
    return { height: plan.total + extra * rows.length, size: plan.size };
  }

  // 横に並ぶ箱と矢印（審級の流れ、争点の流れ）。items: [{head, lines, accent}]
  flow(s, items, box, o = {}) {
    const n = items.length, gapW = o.gapW || 0.34, w = (box.w - gapW * (n - 1)) / n;
    items.forEach((it, i) => {
      const x = box.x + i * (w + gapW);
      // head＝箱の題（基調色。強調の箱は強調色）、lines＝中身（黒）、answer＝その箱の答え（題と同じ色）
      const tag = it.accent ? "r" : "b";
      const lines = (it.head ? [`{${tag}:${it.head}}`] : []).concat(it.lines || []).concat([].concat(it.answer || []).map((t) => `{${tag}:${tf.strip(t)}}`));
      this.frame(s, lines, { x, y: box.y, w, h: box.h }, { color: it.accent ? "accent" : "base", align: "center", sizes: o.sizes || [17, 16, 15, 14, 13], gap: it.answer ? 7 : 4, name: "flowBox" });
      if (i < n - 1) this.arrow(s, x + w + 0.04, box.y + box.h / 2, x + w + gapW - 0.04, box.y + box.h / 2, { state: "past", width: 2.5 });
    });
  }

  // 縦に積む汎用の配置。blocks: [{kind, ...}] を body 領域に上から置く。
  // kind: text（線なし）, frame, accent（強調色の枠）, statute, table, flow, spacer
  stack(s, blocks, region = GRID.body, o = {}) {
    const gap = o.gap ?? GRID.gap;
    const ladders = { // 縮める段（0＝大きい）
      text: [[18, 17, 16, 15], [17, 16, 15], [16, 15, 14], [15, 14, 13]],
      frame: [[18, 17, 16, 15], [17, 16, 15], [16, 15, 14], [15, 14, 13]],
      statute: [[15, 14.5, 14, 13.5], [14.5, 14, 13.5], [14, 13.5, 13], [13.5, 13, 12.5]],
    };
    // 内容が少ない枚のための大きい段（-1）。見出し（20pt）は超えない
    const big = { frame: [20, 19, 18], statute: [16, 15.5, 15], table: [17, 16, SIZE.table] };
    const tableSizes = (b, lv) => (lv < 0 ? big.table : (b.sizes || [SIZE.table, 15, 14, SIZE.tableMin]).slice(lv));
    const ladderOf = (b, lv) => (lv < 0 ? (b.kind === "statute" ? big.statute : big.frame) : (b.kind === "statute" ? ladders.statute : ladders.frame)[lv]);
    const measure = (b, lv) => {
      if (b.kind === "spacer") return b.h || 0.1;
      if (b.kind === "table") { // その段の文字サイズで実際に要る高さ
        const sz = tableSizes(b, lv)[0];
        return this.tablePlan(b.rows, this.tableColW(b.rows, { w: b.w || region.w }, b), sz).total + 0.01;
      }
      if (b.kind === "flow") return b.h || 1.3;
      if (b.h) return b.h;
      if (b.kind === "cols") { // 横に並べる枠（学説の左右対比など）。高さは、いちばん行の多い枠に合わせる
        const n = b.items.length, w = ((b.w || region.w) - (b.gapW ?? 0.3) * (n - 1)) / n - GRID.pad.x * 2;
        const size = this.floored([lv < 0 ? big.frame[0] : ladders.frame[lv][0]])[0];
        return Math.max(...b.items.map((it) => tf.fit([].concat(it.lines).map(markGap), w, 99, [size]).height)) + GRID.pad.y * 2 + 0.05;
      }
      const isFrame = b.kind !== "text";
      const w = (b.w || region.w) - (isFrame ? GRID.pad.x * 2 : 0);
      const lines = b.kind === "statute" ? [b.name].concat([].concat(b.text)) : [].concat(b.lines).map(markGap);
      const size = this.floored([b.sizes && lv >= 0 ? b.sizes[0] : ladderOf(b, lv)[0]], { name: b.name })[0];   // 描く時と同じ下限で見積もる
      const f = tf.fit(lines, w, 99, [size], { gap: b.kind === "statute" ? 3 : undefined });
      return f.height + (isFrame ? GRID.pad.y * 2 + 0.05 : 0.02);
    };
    // 大きい文字から試す。同じ大きさなら、先にふつうの間隔、次に詰めた間隔を試してから、1段小さくする
    let lv = 0, hs = [], gapUse = gap, ok = false;
    for (; lv < 4 && !ok; lv++) {
      hs = blocks.map((b) => measure(b, lv));
      for (const g of [gap, 0.12]) { if (hs.reduce((a, b) => a + b, 0) + g * (blocks.length - 1) <= region.h) { gapUse = g; ok = true; break; } }
      if (ok) break;
    }
    if (!ok) { lv = 3; gapUse = 0.12; this.warn("本文の領域に収まらない（文字を減らすか2枚に分ける）"); }
    let used = hs.reduce((a, b) => a + b, 0) + gapUse * (blocks.length - 1);
    // いちばん大きい段でも領域の 6 割に届かないときは、大きい段（-1）を試す。入るならそちらを使う
    if (lv === 0 && o.big !== false && used <= region.h * 0.6) {
      const hb = blocks.map((b) => measure(b, -1)), ub = hb.reduce((a, b) => a + b, 0) + gap * (blocks.length - 1);
      if (ub <= region.h * 0.9) { lv = -1; hs = hb; used = ub; gapUse = gap; }
    }
    let spare = Math.max(0, region.h - used);
    // 余った高さの配り方（完成版は、本文の領域を下まで使い、段落の間を広めにとっている）
    //  1 枠・要点の段落の間を広げる（6pt → 最大 12pt）
    //  2 枠を広げる（枠は最大 35%・0.6 インチまで、表 35%、流れの箱 30%、条文 15%）
    //  3 枠と枠の間を広げる（最大 ＋0.2）
    //  4 それでも領域の 30% を超えて余るなら、内容が少ない枚として知らせる（文字を大きくしても埋まらない）
    const paraN = blocks.map((b) => (["text", "frame", "accent"].includes(b.kind) && !b.h ? Math.max(0, [].concat(b.lines).length - 1) : 0));
    const paraSum = paraN.reduce((a, b) => a + b, 0);
    const gapAdd = paraSum ? Math.min(6, (spare * 72 * 0.5) / paraSum) : 0;            // pt
    hs = hs.map((h, i) => h + (paraN[i] * gapAdd) / 72); spare -= (paraSum * gapAdd) / 72;
    const grow = blocks.map((b, i) => (["frame", "accent", "cols"].includes(b.kind) ? Math.min(0.6, hs[i] * 0.35) : b.kind === "statute" ? hs[i] * 0.15 : b.kind === "table" ? hs[i] * 0.35 : b.kind === "flow" ? hs[i] * 0.3 : 0));
    const growSum = grow.reduce((a, b) => a + b, 0);
    const growUse = Math.min(spare, growSum); spare -= growUse;
    const gExtra = blocks.length > 1 ? Math.min(0.2, spare / (blocks.length - 1)) : 0;
    const g2 = gapUse + gExtra; spare -= gExtra * (blocks.length - 1);
    if (spare > region.h * SEV.sparse.warn && o.noteSparse !== false) this.note(`本文の領域の下 ${Math.round((spare / region.h) * 100)}% が空く${spare > region.h * SEV.sparse.error ? "（deck_lint では error）" : "（deck_lint では warn）"}。内容（「本件では」の枠、→ の1行）を足すか、前後の枚とまとめる`);
    let y = region.y + (o.center ? spare / 2 : 0);
    blocks.forEach((b, i) => {
      const h = hs[i] + (growSum ? (grow[i] / growSum) * growUse : 0);
      const box = { x: b.x ?? region.x, y, w: b.w || region.w, h };
      const lad = ladderOf(b, lv);
      if (lv < 0 && b.sizes) b = { ...b, sizes: null };
      const gp = PARA_GAP + (paraN[i] ? gapAdd : 0);
      if (b.kind === "text") this.text(s, b.lines, box, { sizes: b.sizes || lad, valign: "middle", color: b.color, align: b.align, gap: gp, small: b.small, bold: b.bold, name: b.name });
      else if (b.kind === "frame") this.frame(s, b.lines, box, { sizes: b.sizes || lad, align: b.align, gap: gp });
      else if (b.kind === "accent") this.frame(s, b.lines, box, { sizes: b.sizes || lad, color: "accent", align: b.align, gap: gp });
      else if (b.kind === "statute") this.statute(s, lv < 0 ? { ...b, sizes: big.statute } : b, box);
      else if (b.kind === "table") this.table(s, b.rows, box, { ...b, sizes: tableSizes(b, lv) });
      else if (b.kind === "flow") this.flow(s, b.items, box, lv < 0 ? { ...b, sizes: [19, 18, 17, 16, 15] } : b);
      else if (b.kind === "cols") {
        const n = b.items.length, gw = b.gapW ?? 0.3, w = (box.w - gw * (n - 1)) / n;
        b.items.forEach((it, k) => this.frame(s, it.lines, { x: box.x + k * (w + gw), y, w, h }, { sizes: lad, color: it.accent ? "accent" : "base", valign: "middle" }));
      }
      y += h + g2;
    });
    return y - g2;
  }
}

module.exports = { Kit };
