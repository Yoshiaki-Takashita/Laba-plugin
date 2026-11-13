// LABA スライドの定数（寸法はインチ、文字は pt）。数値は完成済みの発表資料 48 枚の実測に基づく。
// 変えるときは references/slides/01-tokens.md も合わせて直す。
"use strict";

const SLIDE = { w: 10, h: 5.625, layout: "LAYOUT_16x9" };

// 配色。teal＝発表用の既定。mono＝講義ノートの図（黒・灰・強調1色）とそろえた印刷向け。
const THEMES = {
  teal: { ink: "1A1A1A", base: "2F6F6C", dark: "17403F", accent: "C2543A", band: "E3EDEB", gray: "8A9493", rule: "D0D6D5", paper: "FFFFFF", headFill: "2F6F6C", headText: "FFFFFF" },
  mono: { ink: "1A1A1A", base: "1A1A1A", dark: "1A1A1A", accent: "943522", band: "EDEFEF", gray: "8C9493", rule: "C9CECD", paper: "FFFFFF", headFill: "EDEFEF", headText: "1A1A1A" },
};

// 書体。利用者のキットに合わせるときは、build_deck.js の --kit が環境変数 LABA_SLIDE_FONT で差し替える。
const FONT = process.env.LABA_SLIDE_FONT || "Yu Gothic";

// 文字サイズの段階。実測では 15〜18pt が約 7 割、太字が 96%。
const SIZE = {
  coverTitle: 40, coverTheme: 26, coverName: 22, coverInfo: 16,
  heading: 20,       // 左上の見出し
  section: 11,       // 右上の大項目名
  bodyMax: 18, body: 17, bodyMin: 15,   // 枠内・要点の本文（太字）
  bodyFloor: 15,     // 作成時の本文・条文の下限。これより小さくしないと収まらないなら、縮めずに要約か分割
  lintFloor: 14.5,   // deck_lint の font-small の下限（完成版の最小値）。作成時は 0.5pt の余裕を取って bodyFloor を使う
  statute: 15.5, statuteMin: 15,        // 条文本文（非太字）
  table: 15.5, tableMin: 13,
  symbol: 30,        // 当事者の記号（X・A・Y）
  role: 12,          // 記号の下の役割
  labelNew: 15, labelPast: 12,          // 矢印のラベル（新しい関係／前からの関係）
  band: 17, bandItem: 15,               // 下部の帯
  note: 10.5, pageNo: 10, labelMin: 10,  // 図の中の短い注の下限
  floor: 9,          // これ未満は使わない
};

const LINE = { frame: 2.25, rule: 1.5, table: 1.5, arrowPast: 2.5, arrowNew: 4, thin: 1 };

// 共通の配置
const GRID = {
  marginX: 0.4,                         // 左右の余白
  heading: { x: 0.4, y: 0.15, w: 6.7, h: 0.55 },
  section: { x: 7.2, y: 0.22, w: 2.4, h: 0.4 },
  rule: { y: 0.78 },
  body: { x: 0.4, y: 0.95, w: 9.2, h: 4.2 },   // 本文の領域（y 0.95〜5.15）
  pageNo: { x: 9.15, y: 5.28, w: 0.6, h: 0.25 },
  band: { y: 3.72, h: 1.905 },          // 事案スライド下部の帯
  diagram: { x: 0.25, y: 0.9, w: 9.5, h: 2.75 }, // 帯の上の図の領域
  gap: 0.2,                             // 枠と枠の間
  pad: { x: 0.18, y: 0.09 },            // 枠の内側の余白（左右 0.18、上下 0.09。実測に合わせた）
};

// 行の高さ（文字サイズに対する倍率）と段落の間隔（pt）
const LEADING = 1.32;
const PARA_GAP = 6;

// 1枚あたりの文字量。完成版 48 枚の実測（deck_lint.py と同じ数え方）：平均 189 字、中央値 181 字、最小 76 字、最大 304 字。
// thin＝これ未満の枚は内容が少ない（知らせる）。avgMin＝資料全体の平均がこれ未満なら少ない。
const DENSITY = { target: 190, warn: 330, error: 420, thin: 75, avgMin: 150, min: 15 };

// 発表の時間配分（06-speech-sync.md）。1分あたりに読める原稿の字数と、1枚の下限・上限の秒数。
const SPEECH = { charsPerMin: 300, minSec: 15, maxSec: 90 };

module.exports = { SLIDE, THEMES, FONT, SIZE, LINE, GRID, LEADING, PARA_GAP, DENSITY, SPEECH };
