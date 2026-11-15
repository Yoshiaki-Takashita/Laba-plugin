#!/usr/bin/env node
// 構成（JSON）から発表用の .pptx を作る。
// usage: node build_deck.js SPEC.json OUT.pptx [--config config.json] [--theme teal|mono] [--kit kit_profile.json] [--outline outline.md] [--draft] [--allow-warn]
// SPEC：{ "meta": {title, theme, keep:[途中で切らない言い回し]}, "slides": [ {type, heading, ...}, {type:"section", name}, ... ] }
//   type:"section" はスライドを作らず、右上の大項目名を切り替えるだけ（部の扉スライドは作らない）。
//   型の一覧と各型の項目は references/slides/02-layouts.md。
// 止まるもの（終了コード 1）：収まらない文字、語の途中の改行・1〜2字だけの行、置けないラベル、線が当事者の上を通る、無い型、
//   下書きの印（_todo）、仮の文字（「（役割）」「（関係）」「（…を1行で）」「（…確認して書く）」など）。
//   --draft：下書きの印と仮の文字が残っていても作る（渡す資料には使わない）。--allow-warn：ほかの直す所があっても作る（見るだけ）。
// 止まらずに知らせるもの：余白が多い枚、長いラベル、15pt 未満の本文、文字の多い枚、表紙の未設定。
"use strict";
const fs = require("fs");
const path = require("path");
// --kit：利用者の完成版を scripts/hanrei/kit_measure.py で測った値。書体と色をそれに合わせる（tokens を読む前に書体を決める）
const KIT = (() => { const i = process.argv.indexOf("--kit"); if (i < 0) return null; try { return (JSON.parse(fs.readFileSync(process.argv[i + 1], "utf8")).pptx || {}).apply || {}; } catch (e) { console.error(`--kit を読めない：${e.message}`); process.exit(2); } })();
if (KIT && KIT.font) process.env.LABA_SLIDE_FONT = KIT.font;
let pptxgen;
try { pptxgen = require("pptxgenjs"); } catch (e) { console.error("pptxgenjs が見つからない。`npm install -g pptxgenjs` を実行し、NODE_PATH に `npm root -g` の出力を入れる（README.md 参照）。"); process.exit(2); }
const { SLIDE, THEMES, FONT, SIZE, GRID, DENSITY, SPEECH } = require("./lib/tokens");
const { Kit } = require("./lib/components");
const { layouts } = require("./lib/layouts");
const tf = require("./lib/textfit");

const argv = process.argv.slice(2);
const VALUED = ["--config", "--theme", "--outline", "--kit"];
const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const pos = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && VALUED.includes(argv[i - 1])));
if (pos.length < 2) { console.error("usage: node build_deck.js SPEC.json OUT.pptx [--config config.json] [--theme teal|mono] [--outline outline.md] [--draft] [--allow-warn]"); process.exit(2); }
const DRAFT = argv.includes("--draft"), ALLOW = argv.includes("--allow-warn");
const spec = JSON.parse(fs.readFileSync(pos[0], "utf8"));
// 利用者ごとの値（所属・報告者・発表日・配色）を探す順：--config → 構成と同じフォルダの config.json → 環境変数 LABA_CONFIG → ~/.config/laba/slides.json
const cfgPath = [flag("--config"), path.join(path.dirname(pos[0]), "config.json"), process.env.LABA_CONFIG, path.join(require("os").homedir(), ".config", "laba", "slides.json")].find((p) => p && fs.existsSync(p));
const cfg = cfgPath ? JSON.parse(fs.readFileSync(cfgPath, "utf8")) : {};
const themeName = flag("--theme") || (spec.meta && spec.meta.theme) || cfg.theme || "teal";
let K = THEMES[themeName];
if (!K) { console.error(`theme は teal か mono：${themeName}`); process.exit(2); }
if (KIT && KIT.colors) { K = { ...K, ...Object.fromEntries(Object.entries(KIT.colors).filter(([k, v]) => k in K && /^[0-9A-Fa-f]{6}$/.test(v))) }; if (KIT.colors.base && themeName === "teal") K.headFill = KIT.colors.base; }
tf.setKeep([].concat((spec.meta && spec.meta.keep) || [], cfg.keep || []));

const pres = new pptxgen();
pres.layout = SLIDE.layout;
pres.theme = { headFontFace: FONT, bodyFontFace: FONT };
pres.title = (spec.meta && spec.meta.title) || "";
pres.defineSlideMaster({ title: "CONTENT", background: { color: K.paper }, objects: [], slideNumber: { ...GRID.pageNo, fontSize: SIZE.pageNo, color: K.gray, align: "right", fontFace: FONT } });
pres.defineSlideMaster({ title: "PLAIN", background: { color: K.paper }, objects: [] });

const kit = new Kit(pres, K);
const ctx = { pres, kit, cfg, section: "", no: 0 };
const outline = [];
// 仮の文字（deck_lint.py の PLACEHOLDER と同じ）
const PLACEHOLDER = /（役割）|（関係）|（説明）|（題）|（見出し）|（[^（）]{0,30}(?:1行|１行|一行|2行|２行)で[^（）]{0,8}）|（[^（）]{0,40}(?:確認して書く|確かめて書く|を書く|を足す|を入れる|に直す|を選ぶ|未定|未記入|要確認)[^（）]{0,10}）|TODO|【要確認】|【未確認】|〔要確認〕|【仮】/;
const strings = (v, acc) => { if (typeof v === "string") acc.push(v); else if (Array.isArray(v)) v.forEach((x) => strings(x, acc)); else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => { if (!k.startsWith("_") && k !== "notes") strings(x, acc); }); return acc; };
// 見出しの番号の直後が数字なら、空きを広げる（「5. 110条」が「5.110条」に読めるのを防ぐ）
const normHeading = (h) => (typeof h === "string" ? h.replace(/^(\d+)[.．][ 　]*(?=[0-9０-９])/, "$1.  ") : h);   // 半角の空き2つ
const draftMarks = [];

for (const sl0 of spec.slides) {
  if (sl0.type === "section") { ctx.section = sl0.name || ""; continue; }
  const sl = { ...sl0, heading: normHeading(sl0.heading) };
  const fn = layouts[sl.type];
  if (!fn) { kit.cur = sl.heading || sl.type; kit.warn(`型が無い：${sl.type}`); continue; }
  const variants = sl.type === "timeline" ? sl.steps.map((_, i) => ({ ...sl, _step: i + 1 })) : [sl];
  // 下書きの印・仮の文字
  const where = sl.heading || sl.type;
  if (sl._todo) draftMarks.push(`${where}：_todo が残っている（${String(sl._todo).slice(0, 40)}…）`);
  const ph = strings(sl, []).map((t) => PLACEHOLDER.exec(tf.strip(t))).filter(Boolean);
  if (ph.length) draftMarks.push(`${where}：仮の文字が残っている（「${ph[0][0]}」${ph.length > 1 ? ` ほか ${ph.length - 1} か所` : ""}）`);
  for (const v of variants) {
    ctx.no += 1; kit.chars = 0; kit.minBody = 99;
    const s = fn(ctx, v);
    const st = v._step ? v.steps[v._step - 1] : null;
    const notes = st ? st.notes : v.notes;
    if (notes) s.addNotes([].concat(notes).join("\n"));
    const heading = v._step ? `${v.heading}${v.steps.length > 1 ? "①②③④⑤⑥⑦⑧⑨⑩⑪⑫"[v._step - 1] : ""}` : v.heading || (v.type === "cover" ? "表紙" : v.type === "toc" ? "目次" : "");
    const chars = kit.chars;   // 実際に置いた文字（deck_lint.py と同じ数え方）
    const noteChars = notes ? [].concat(notes).join("").length : 0;
    const sec = v.time || (noteChars ? Math.max(SPEECH.minSec, Math.min(SPEECH.maxSec, Math.round((noteChars / SPEECH.charsPerMin) * 60))) : null);
    if (!["cover", "toc", "references"].includes(v.type)) {
      if (chars > DENSITY.error) kit.warn(`文字が多すぎる（${chars}字 > ${DENSITY.error}）。2枚に分ける`);
      else if (chars > DENSITY.warn) kit.note(`文字が多い（${chars}字。目標は ${DENSITY.target} 字前後）`);
      else if (chars < DENSITY.thin) kit.note(`文字が少ない（${chars}字。目標は ${DENSITY.target} 字前後）。前後の枚とまとめるか、「本件では」・→ の1行を足す`);
      if (kit.minBody < SIZE.bodyMin) kit.note(`本文が ${kit.minBody}pt になる（基準は ${SIZE.bodyMin}〜${SIZE.bodyMax}pt）。文字を減らすか、2枚に分ける`);
    }
    outline.push({ no: ctx.no, type: v.type, section: ctx.section, heading, chars, noteChars, sec, minBody: kit.minBody === 99 ? null : kit.minBody });
  }
}

const total = outline.reduce((a, o) => a + (o.sec || 0), 0);
const outPath = flag("--outline");
if (outPath) {
  const md = ["# 発表の進行表", "", `スライド ${outline.length} 枚。原稿の字数から見積もった時間は合計 ${Math.floor(total / 60)} 分 ${total % 60} 秒（原稿のあるスライドだけ）。`, "", "| 枚 | 大項目 | 見出し | 型 | 文字数 | 本文の最小pt | 原稿の字数 | 目安の秒 |", "|---:|---|---|---|---:|---:|---:|---:|"]
    .concat(outline.map((o) => `| ${o.no} | ${o.section} | ${o.heading} | ${o.type} | ${o.chars} | ${o.minBody || ""} | ${o.noteChars || ""} | ${o.sec || ""} |`));
  fs.writeFileSync(outPath, md.join("\n") + "\n");
}
pres.writeFile({ fileName: pos[1] }).then(() => {
  const bodySl = outline.filter((o) => !["cover", "toc", "references"].includes(o.type));
  const avg = Math.round(bodySl.reduce((a, o) => a + o.chars, 0) / Math.max(1, bodySl.length));
  console.log(`作成：${pos[1]}（${outline.length} 枚、配色 ${themeName}、本文の枚の平均 ${avg} 字${DRAFT ? "、下書き" : ""}）`);
  if (avg < DENSITY.avgMin) console.error(`  注意：1枚平均 ${avg} 字は少ない（完成版の実測は平均 190 字。${DENSITY.avgMin} 字以上を目安に、枚をまとめるか内容を足す）`);
  if (kit.notes.length) { console.error(`\n確かめる所が ${kit.notes.length} 件ある（作成は続けた）：`); kit.notes.forEach((w) => console.error("  ・" + w)); }
  let stop = false;
  if (draftMarks.length) {
    console.error(`\n下書きの印・仮の文字が ${draftMarks.length} 件ある${DRAFT ? "（--draft なので作成は続けた。渡す前に片づける）" : "（片づけてから作り直す。下書きを見るだけなら --draft）"}：`);
    draftMarks.forEach((w) => console.error("  - " + w));
    if (!DRAFT) stop = true;
  }
  const hard = kit.warnings.filter((w) => !/未設定/.test(w)), soft = kit.warnings.filter((w) => /未設定/.test(w));
  if (soft.length) { console.error("\n表紙の未設定（仮の文字を入れた。渡すときに伝える）："); soft.forEach((w) => console.error("  ・" + w)); }
  if (hard.length) {
    console.error(`\n直す所が ${hard.length} 件ある：`);
    hard.forEach((w) => console.error("  - " + w));
    if (!ALLOW) stop = true;
  }
  if (stop) process.exit(1);
});
