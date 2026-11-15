// 文字の幅を見積り、切ってよい位置で改行し、枠に収まる文字サイズを決める。
// 日本語の行の折り返しは描画側の書体で変わる。ここで先に改行を入れておき、描画側には折り返させない。
// 決まり（deck_lint.py の break_prio と同じ。片方を変えたら両方を直す）：
//   ・語、複合語、条文番号（41条1項・2項）、判例の表記（民集22巻3号551頁）、数と単位、短い括弧の中では切らない
//   ・切ってよい位置には優先順位がある（句点 4 ＞ 読点・閉じ括弧・「→」の前 3 ＞ 格助詞の後 2 ＞ そのほかの助詞・活用語尾の後 1）
//   ・和文と英数字の境には 0.25 字分の空きを見込む（LibreOffice は自動で空ける。見込まないと描画側でもう一度折れる）
//   ・1〜2字だけの行を作らない
"use strict";
const { LEADING, PARA_GAP } = require("./tokens");

const BOUNDARY = 0.25;   // 和文と英数字の境の空き（全角を1とした比）
const MARGIN = 0.6;      // 1行の字数から引く余裕（全角）。描画側の書体の違いを吸収する

const isHira = (c) => c >= "ぁ" && c <= "ゖ";
const isKata = (c) => (c >= "゠" && c <= "ヿ") || c === "ー";
const isKanji = (c) => (c >= "一" && c <= "鿿") || "々〇ヶ".includes(c);
const isAscii = (c) => c >= "!" && c <= "~";
const isAlnum = (c) => /[A-Za-z0-9０-９Ａ-Ｚａ-ｚ]/.test(c);
const isJa = (c) => isHira(c) || isKata(c) || isKanji(c);

// 1文字の幅（全角を1とした比）。
function charW(ch) {
  const c = ch.codePointAt(0);
  if (c <= 0x20) return 0.3;
  if (c < 0x7f) {
    if ("ilI.,:;'|!".includes(ch)) return 0.28;
    if ("MW@".includes(ch)) return 0.85;
    if (ch >= "0" && ch <= "9") return 0.56;
    if (ch >= "A" && ch <= "Z") return 0.66;
    return 0.54;
  }
  if (c >= 0xff61 && c <= 0xff9f) return 0.5; // 半角カナ
  return 1.0;
}
// 文字列の幅。和文と英数字が隣り合う所に空きを足す。
function textW(s) {
  let w = 0, prev = "";
  for (const ch of Array.from(String(s))) {
    w += charW(ch);
    if (prev && ((isAscii(prev) && isJa(ch)) || (isAscii(ch) && isJa(prev)))) w += BOUNDARY;
    prev = ch;
  }
  return w;
}
// pt → インチでの幅
const widthIn = (s, pt) => (textW(s) * pt) / 72;

// 装飾の記法 {r:…}（強調色）{b:…}（基調色）{g:…}（灰）{n:…}（太字にしない）を外した素の文字列
const strip = (s) => String(s).replace(/\{[rbgn]:([^{}]*)\}/g, "$1");

// 行頭に置けない字・行末に置けない字
const NO_HEAD = "、。，．・）〕］｝」』】〉》：；！？ー―…‥々ゝゞぁぃぅぇぉっゃゅょァィゥェォッャュョ)]}%％";
const NO_TAIL = "（〔［｛「『【〈《([{";
const COMPOUND_KANA = "きりしいちみびぎえけせてれめべげね";   // 漢字＋この1字＋漢字 は複合語とみる（建て替え・取り消し・引き渡し）
const STRONG = "はがをにへでともや";                            // 格助詞など。この後はよい切れ目
// 途中で切らない言い回し。構成の meta.keep で足せる（setKeep）。
const KEEP_BASE = ["特段の事情", "背信的行為", "信頼関係", "善意の第三者", "悪意の第三者", "権利の濫用", "信義則", "公序良俗", "正当な理由", "正当の事由", "相当の期間",
  "訴えの利益", "法律上の利益", "当事者の一方", "第三者", "被上告人", "被控訴人", "上告人", "控訴人", "法定地上権", "根抵当権", "抵当権", "一部判決",
  "共同訴訟", "必要的共同訴訟", "通常共同訴訟", "合一確定", "既判力", "弁論の分離", "訴訟資料", "証拠共通", "主張共通", "利益相反", "代理権の濫用"];
let KEEP = KEEP_BASE.slice();
const setKeep = (extra) => { KEEP = KEEP_BASE.concat((extra || []).filter((x) => typeof x === "string" && x.length > 1)); };

// 条文番号・判例の表記・数と単位・短い括弧。この中では切らない。
const UNIT_RE = new RegExp([
  "(?:[一-鿿]{1,5}法)?[0-9０-９]+条(?:の[0-9０-９]+)*(?:第?[0-9０-９]+項)?(?:第?[0-9０-９]+号)?(?:本文|ただし書|前段|後段|柱書)?(?:[・〜～][0-9０-９]+(?:条|項|号)(?:の[0-9０-９]+)*)*",
  "(?:最大?[判決]|大判|大決|[一-鿿]{2,3}[高地]判)?(?:昭和|平成|令和|大正|明治)[0-9０-９元○]+[・.．年][0-9０-９○]+[・.．月][0-9０-９○]+日?",
  "(?:民集|刑集|集民|判時|判タ|金法|金判|民録|刑録)[0-9０-９]+(?:巻[0-9０-９]+)?号?[0-9０-９]*頁?",
  "[0-9０-９][0-9０-９,，.．]*(?:億|万|千)*(?:円|人|件|個|回|年|か月|ヶ月|箇月|月|日|時間|分|秒|％|%|歳|枚|字|行|点|倍|割|審|号|巻|頁|条|項)",
  "[（(][^（）()]{1,8}[）)]|「[^「」]{1,8}」",
].join("|"), "g");
const REPORTER = /^(?:民集|刑集|集民|判時|判タ|金法|金判|民録|刑録)/;

// 切ってはいけない位置（i-1 と i の間）の集合
function keepMask(s) {
  const mask = new Set(); let m;
  UNIT_RE.lastIndex = 0;
  while ((m = UNIT_RE.exec(s))) { for (let i = m.index + 1; i < m.index + m[0].length; i++) mask.add(i); if (m[0].length === 0) UNIT_RE.lastIndex++; }
  for (const k of KEEP) { let i = s.indexOf(k); while (i >= 0) { for (let j = i + 1; j < i + k.length; j++) mask.add(j); i = s.indexOf(k, i + 1); } }
  return mask;
}

// chars[i-1] と chars[i] の間で切ってよいか。0＝切らない、1〜4＝切ってよい（大きいほどよい切れ目）
function breakPrio(chars, i, mask) {
  if (i <= 0 || i >= chars.length) return 4;
  const a = chars[i - 1], b = chars[i], p = i >= 2 ? chars[i - 2] : "";
  if (NO_HEAD.includes(b) || NO_TAIL.includes(a)) return 0;
  if (a === " " || a === "　") return 3;
  if (mask && mask.has(i)) return 0;
  if ("。．！？".includes(a)) return 4;
  if ("、，：；".includes(a)) return 3;
  if ("）」』】〉》］〕)".includes(a)) return isHira(b) ? 0 : 3;
  if ("→⇒⇨".includes(b)) return 3;
  if ("／＝".includes(a)) return 2;
  if ("→⇒⇨◎・●○◆■□※".includes(a) || (a >= "①" && a <= "⑳")) return a === "・" && i >= 2 && !isAlnum(p) ? 1 : 0;
  if (isHira(a)) {
    if (isHira(b)) return 0;
    if (isKanji(b) && isKanji(p) && COMPOUND_KANA.includes(a)) return 0;
    if ("おご".includes(a) && !isHira(p)) return 0;
    return STRONG.includes(a) ? 2 : 1;
  }
  if (isAlnum(a)) return REPORTER.test(chars.slice(i, i + 2).join("")) ? 1 : 0;
  if (isKanji(a) || isKata(a)) return "（「『〈【".includes(b) ? 1 : 0;
  return 0;
}

// 行頭記号（◎・→・①・（1）・1.）と、その後ろの空き。続きの行はこの幅だけ字下げする。
const LEAD_RE = /^(?:◎|・|→|⇒|⇨|[①-⑳]|（[0-9０-９]+）|\([0-9]+\)|[0-9]+[.．])[ 　]*/;
function indentFor(plain) {
  const m = LEAD_RE.exec(plain); if (!m) return "";
  const w = textW(m[0]); const full = Math.floor(w + 0.05), rest = w - full;
  return "　".repeat(full) + (rest > 0.2 ? " " : "");
}

// 装飾つきの1行を、幅 maxW（全角換算の字数）に収まるよう分ける。装飾 {x:…} は保つ。
// 戻り値：行の配列。配列には bad（語の途中で切った数＋1〜2字だけの行の数）を付ける。
function wrapLine(line, maxW, opt = {}) {
  const tokens = []; let m, last = 0; const re = /\{([rbgn]):([^{}]*)\}/g;
  while ((m = re.exec(line))) {
    if (m.index > last) tokens.push({ text: line.slice(last, m.index), tag: null });
    tokens.push({ text: m[2], tag: m[1] }); last = re.lastIndex;
  }
  if (last < line.length) tokens.push({ text: line.slice(last), tag: null });
  const chars = [], tags = [];
  tokens.forEach((t) => Array.from(t.text).forEach((ch) => { chars.push(ch); tags.push(t.tag); }));
  const plain = chars.join("");
  if (textW(plain) <= maxW) { const r = [line]; r.bad = 0; return r; }
  const mask = keepMask(plain);
  const prio = chars.map((_, i) => breakPrio(chars, i, mask));
  const indent = opt.noIndent ? "" : indentFor(plain), indW = textW(indent);
  const bonus = [0, 0, 0.1, 0.18, 0.24];
  const run = (shrink) => {
    const cuts = []; let start = 0, bad = 0;
    while (start < chars.length) {
      const room = (cuts.length ? maxW - indW : maxW) - shrink;
      // start から room に収まる最後の位置 i を求める
      let i = start, w = 0, prev = "";
      while (i < chars.length) {
        let cw = charW(chars[i]);
        if (prev && ((isAscii(prev) && isJa(chars[i])) || (isAscii(chars[i]) && isJa(prev)))) cw += BOUNDARY;
        if (w + cw > room && i > start) break;
        w += cw; prev = chars[i]; i++;
      }
      if (i >= chars.length) { cuts.push(chars.length); break; }
      // 切ってよい位置のうち、行がよく埋まり、切れ目の質が高いものを選ぶ
      let best = -1, bestScore = -1, low = -1;
      for (let k = start + 1; k <= i; k++) {
        if (!prio[k]) continue;
        const fill = textW(chars.slice(start, k).join("")) / room;
        if (fill < 0.35) { low = k; continue; }   // 短すぎる行になる切れ目は、ほかに無いときだけ使う
        const score = fill + bonus[prio[k]];
        if (score > bestScore) { bestScore = score; best = k; }
      }
      if (best < 0 && low > start + 2) best = low;
      if (best < 0) { // 切ってよい位置がない：禁則と「切らない範囲」だけは守って切る（語の途中になる）
        best = i; while (best > start + 1 && (NO_HEAD.includes(chars[best]) || NO_TAIL.includes(chars[best - 1]) || mask.has(best) || (isAlnum(chars[best - 1]) && isAlnum(chars[best])))) best--;
        if (best <= start + 1) best = i;
        bad++;
      }
      cuts.push(best); start = best;
    }
    // 1〜2字だけの行（句読点・括弧は数えない）
    let s0 = 0; const lens = cuts.map((c) => { const t = chars.slice(s0, c).join("").replace(/[、。，．）」』（「『・…\s　]/g, ""); s0 = c; return t.length; });
    const shortN = opt.allowShort ? 0 : lens.filter((n, k) => n <= 2 && cuts.length > 1).length;
    return { cuts, bad: bad + shortN, forced: bad, shortN };
  };
  // 1〜2字だけの行ができたら、行の幅を少しずつ狭めて切り直す（行数は増やさない）
  let res = run(0);
  if (res.shortN) for (const sh of [1, 2, 3, 4, 5]) { const r2 = run(sh); if (r2.cuts.length === res.cuts.length && r2.bad < res.bad) { res = r2; if (!res.bad) break; } }
  const out = []; let start = 0;
  res.cuts.forEach((cut, n) => {
    let s = "", cur = null, buf = "";
    const flush = () => { if (buf) s += cur ? `{${cur}:${buf}}` : buf; buf = ""; };
    for (let k = start; k < cut; k++) { if (tags[k] !== cur) { flush(); cur = tags[k]; } buf += chars[k]; }
    flush();
    if (n > 0) s = s.replace(/^[ 　]+/, "");
    out.push((n > 0 ? indent : "") + s);
    start = cut;
  });
  out.bad = res.bad;
  return out;
}

// 複数行（配列）を枠（w×h インチ）に収める。sizes は大きい順の候補。
// 戻り値：{ size, lines（改行済み）, paraEnd, height（インチ）, fits, fill, bad（語の途中で切った数など）}
// 高さに収まる候補のうち、語の途中で切らずに済む最大のサイズを選ぶ。どのサイズでも切れてしまうなら、収まる最大のサイズにして bad を返す。
function fit(lines, w, h, sizes, opt = {}) {
  const gap = opt.gap ?? PARA_GAP, leading = opt.leading ?? LEADING;
  let firstFit = null, lastTry = null;
  for (const size of sizes) {
    const maxW = (w * 72) / size - MARGIN;
    const wrapped = []; const paraEnd = []; let bad = 0;
    lines.forEach((ln) => { const parts = ln === "" ? [""] : wrapLine(String(ln), maxW, opt); bad += parts.bad || 0; parts.forEach((p, i) => { wrapped.push(p); paraEnd.push(i === parts.length - 1); }); });
    const height = (wrapped.length * size * leading + Math.max(0, paraEnd.filter(Boolean).length - 1) * gap) / 72;
    lastTry = { size, lines: wrapped, paraEnd, height, fits: height <= h + 1e-6, fill: height / h, bad };
    if (lastTry.fits && !bad) return lastTry;
    if (lastTry.fits && !firstFit) firstFit = lastTry;
  }
  return firstFit || lastTry;
}

// 1行に収まるか（ラベル用）。収まらなければ分けた配列を返す（3行まで）。
function label2(text, maxIn, pt) {
  if (widthIn(strip(text), pt) <= maxIn) return [text];
  const r = wrapLine(text, (maxIn * 72) / pt, { noIndent: true, allowShort: true });   // ラベルは「所有／権」のような語の途中は不可だが、2字の行（「移す」）は可
  const out = r.slice(0, 3); out.bad = r.bad || 0;
  return out;
}

module.exports = { charW, textW, widthIn, strip, wrapLine, fit, label2, breakPrio, keepMask, setKeep, indentFor, MARGIN, BOUNDARY };
