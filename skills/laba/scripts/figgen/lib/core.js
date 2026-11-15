'use strict';
/* figgen の共通部品：定数、文字幅の見積り、折り返し、SVG の組み立て、衝突の検出、矢印。
   単位は viewBox の単位。幅 1040 を本文幅 150mm に貼ると 1 単位 ≒ 0.41pt（文字 21 ≒ 8.6pt、24 ≒ 9.8pt、線 0.9 ≒ 0.37pt、2.5 ≒ 1.0pt）。 */
const C = { INK: '#1A1A1A', GRAY: '#8C9493', ACCENT: '#943522', WHITE: '#FFFFFF' };
const S = { W: 1040, M: 30, FS: 21, FL: 24, THIN: 0.9, THICK: 2.5, LH: 1.38, PAD: 14, GAP: 24,
  FONT: 'Noto Sans CJK JP, Noto Sans JP, sans-serif' };

/* ---------- 文字幅（em） ---------- */
function charW(ch) {
  const c = ch.codePointAt(0);
  if (c === 0x20) return 0.3;
  if (c < 0x80) {
    if ('ilI1.,:;\'|!'.includes(ch)) return 0.32;
    if ('mwMW@%'.includes(ch)) return 0.9;
    if (ch >= 'A' && ch <= 'Z') return 0.68;
    if (ch >= '0' && ch <= '9') return 0.58;
    if ('()[]/-'.includes(ch)) return 0.4;
    return 0.56;
  }
  if (c >= 0xFF61 && c <= 0xFF9F) return 0.5;      // 半角カナ
  if (c < 0x2000) return 0.6;                      // ラテン補助など
  return 1.0;                                      // 和文・全角・記号（→ × ⇨ 等）
}
function textW(str, size) { let w = 0; for (const ch of String(str)) w += charW(ch); return w * size; }

/* ---------- 折り返し ----------
   切ってよい位置の優先順（罰点が小さいほど先に選ぶ）：
     0  読点・句点・閉じ括弧・中黒・斜線・コロンの後      0.5 開き括弧の前
     1  助詞（は が を に で と の へ も や）の後で、次が漢字・カタカナ・数字   1.5 「について」「として」など機能語の後
     2  記号の前後、「を」の後                             6  助詞の後で次がひらがな
     9  熟語と熟語の間（「損害賠償｜請求権」）            16 ひらがなの語の途中   20 送り仮名の前（「取消｜し」）
   切らない（禁則）：条文番号（民法424条の2、203条1項、9条1項かっこ書）、判例の表記（最判昭和43・3・8、民集22巻3号551頁）、
     数字＋単位（24時間、3か月）、辞書の熟語と「二字＋接尾」（債権者、所有権、会計士）、カタカナの語、括弧の直後・閉じ括弧の直前、行頭の句読点・拗促音。
   罰点 14 以上の位置で折ったら wrapLog に残す（cli が warn にする）。 */
const NO_HEAD = '、。，．）」』】〕・ーぁぃぅぇぉっゃゅょァィゥェォッャュョ々：；？！％';
const NO_TAIL = '（「『【〔';
const GOOD_AFTER = '、。，）」・／：';
const PARTICLE = 'はがをにでとのへもや';
const BAD_BREAK = 14;
/* 二字ずつに切ると壊れる熟語（長い順に当てる）。三字の「二字＋接尾」は規則で拾うので、ここには入れない */
const WORDS = ('背信的悪意者 第三取得者 第三債務者 新株予約権 被保全債権 被担保債権 非公開会社 善管注意義務 被相続人 主債務者 未成年者 無権代理人 ' +
  '不動産 主債務 賃貸借 転貸借 無過失 重過失 不可分 不作為 不存在 無資力 未成年 相手方 被告人 被疑者 被害者 被保全 被担保 裁判所 名宛人 ' +
  '買受人 譲受人 競落人 仮処分 仮差押 非公開 大会社 小法廷 大法廷 再抗弁 再々抗弁 不法行為 不当利得 無権代理 意思表示 所有権 占有権 地上権 抵当権').split(' ').sort((x, y) => y.length - x.length);
/* 法律語の辞書（tools/build_words.py が作る lib/legal-words.json）。terms＝一つの術語、known2＝単独で語になる二字の語。
   漢字の連なりの途中の切れ目が「安全」かを決める（unsafeKK）。安全でない切れ目は罰点 14（BAD_BREAK）になり、使えば warn になる */
const LEX = (() => { try { return JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'legal-words.json'), 'utf8')); } catch (e) { return { fields: {}, harvested: [], known2: [] }; } })();
const TERMS = new Set([].concat(...Object.values(LEX.fields || {}), LEX.harvested || []));
const KNOWN2 = new Set(LEX.known2 || []);
const MID_SUFFIX = '者権性的力効犯罪庁官料額税費員状型説審人法化士役';
const END_SUFFIX = MID_SUFFIX + '上中後前内外間時所書物金等会';
/* 送り仮名つきの語・切りたくないひらがなの語（途中で折らない） */
const MIXED = ['買い受け', '取り消', '取消し', '引渡し', '引き渡', '差押え', '差し押さえ', '申立て', '申し立て', '明渡し', '明け渡', '払い戻', '払戻し', '受け取', '立て替', '取り立て', '取立て',
  '引き受け', '引受け', '譲り渡', '譲り受け', '割り当て', '割当て', '届け出', '貸し付け', '貸付け', '借り入れ', '借入れ', '繰り返', '当てはめ', '手続き', '仕組み', '見出し', '言い渡', '言渡し',
  '読み方', '考え方', '分かれ目', 'ただし書', 'かっこ書', 'なお書', '但書', '見比べ', '組み替え', '書き分け', '使い分け', '振り分け', '積み上げ', '打ち切', '取り下げ', '取下げ', '差し戻', '差戻し', '受け', '向き', '決め手', '置き', '負け', '勝ち'];
const FUNC = ['に対する', 'に関する', 'に基づいて', 'に基づく', 'に基づき', 'による', 'という', 'に対して', 'に対し', 'について', 'において', 'によって', 'により', 'として', 'とともに', 'にとって', 'のために', 'ための', 'ために', 'ので', 'から', 'まで', 'より', 'では', 'には', 'とは', 'でも', 'にも', 'ても',
  'ならば', 'なら', 'とき', 'ときは', 'ときに', '場合', 'だけ', 'のみ', 'など', 'ほか', 'かつ', '又は', '及び', '並びに', '若しくは', 'または', 'および', 'あるいは', 'ただし', 'もっとも', 'したがって', 'さらに', 'すでに', 'まだ', 'かどうか',
  'できない', 'できる', 'しない', 'される', 'させる', 'されない', 'である', 'ではない', 'でない', 'がない', 'がある', 'ならない', 'なければ', 'られる', 'られない', 'している', 'していた', 'された', 'した', 'する', 'れる', 'ない', 'ある', 'いる', 'なる', 'うる', 'この', 'その', 'これ', 'それ', 'どちら', 'どれ', 'すべて', 'いずれ', 'それぞれ', 'ごと', 'ごとに', 'こと', 'もの', 'ところ', 'あった', 'あったか', 'かつて'];
const END_OK = new Set(['に対して', 'に対し', 'について', 'において', 'によって', 'により', 'として', 'とともに', 'にとって', 'のために', 'ために', 'ので', 'から', 'まで', 'より', 'では', 'には', 'とは', 'でも', 'にも', 'ても', 'ならば', 'なら', 'ときは', 'ときに', 'かつ', '又は', '及び', '並びに', '若しくは', 'または', 'および', 'あるいは', 'ただし', 'もっとも', 'したがって', 'さらに', 'すでに', 'ごとに']);
const escRe = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const D = '[0-9０-９]';
const LAW = '(?:[\\p{Script=Han}]{1,7}法|民訴|刑訴|行訴|行手|民執|民保|会社|国賠|憲|民|刑|商)';
const ERA = '(?:昭和|平成|令和|大正|明治|昭|平|令|大|明)';
const TOKEN_RE = new RegExp([
  `(?:最大?|最[一二三]小|[\\p{Script=Han}]{1,3}[高地簡家])(?:判|決)${ERA}(?:${D}+|元)[・.年]${D}+[・.月]${D}+日?`,          // 判例：最判昭和43・3・8
  `(?:民集|刑集|集民|集刑|民録|刑録|判時|判タ|金法|金判|裁時|訟月|行集|労判)${D}+[巻号](?:${D}+号)?${D}+頁`,                 // 登載誌：民集22巻3号551頁
  `(?:${LAW})?${D}+条(?:の${D}+)*(?:第?${D}+項)?(?:第?${D}+号)?`,            // 条文：民法424条の2、203条1項
  `第?${D}+[項号]`,
  `[A-Za-z0-9０-９.,%+\\-]+(?:か月|箇月|ヶ月|週間|時間|年間|日間|万円|億円|分の${D}+|[年月日円件人回審％巻頁時分秒歳倍割名個社点版章節編年度]|番目)?(?:以内|以上|以下|未満|超)?`,
  '(?:' + MIXED.slice().sort((x, y) => y.length - x.length).map(escRe).join('|') + ')',
  '(?:(?!又は|及び|並びに|若しくは)[\\p{Script=Han}々〇])+',
  '[\\p{Script=Katakana}ー]{2,9}',
  '(?:' + FUNC.slice().sort((x, y) => y.length - x.length).map(escRe).join('|') + ')',
  '[①-⑳]\\s?', '.'
].join('|'), 'gu');
const HAN_RUN = /^[\p{Script=Han}々〇]+$/u;
/** 漢字の連なりを、切ってよい単位（熟語）に分ける。辞書→二字＋接尾→二字、の順 */
function splitKanji(run) {
  const ch = Array.from(run), out = []; let i = 0;
  while (i < ch.length) {
    const rest = ch.slice(i).join(''), w = WORDS.find(d => rest.startsWith(d));
    let n = w ? Array.from(w).length : Math.min(2, ch.length - i);
    const left = () => ch.length - i - n;
    if (left() >= 1 && MID_SUFFIX.includes(ch[i + n]) && (left() !== 2 || END_SUFFIX.includes(ch[i + n + 1]) === false)) {
      if (left() === 1 || left() >= 3) n += 1;                                 // 債権者｜代位権、所有権｜移転｜登記
      else if (left() === 2 && !MID_SUFFIX.includes(ch[i + n + 1])) n += 1;      // 代理権｜授与 は不可（left=2 は下で扱う）
    }
    if (left() === 2 && MID_SUFFIX.includes(ch[i + n]) && END_SUFFIX.includes(ch[i + n + 1]) && !w) n += 2;   // 請求権者、訴訟法上
    if (left() === 1) n += 1;                                                    // 一字だけ残さない（会計士、監査人）
    out.push(ch.slice(i, i + n).join('')); i += n;
  }
  return out;
}
/** 漢字の連なり run の k 字目の前で折るのが安全でないか。
    術語（TERMS）の途中なら、両側がそれぞれ術語か「二字＋接尾」（債権者｜代位権）、または片側が四字以上の術語で他方が単独の二字語（株主総会｜決議）のときだけ安全。
    術語に掛からない切れ目は、両側の語（splitKanji の単位）の少なくとも一方が分かる語（術語・二字＋接尾・単独の二字語・旧辞書）なら安全（「司法｜警察員」「所有権｜移転」）。
    「共同｜正犯」「株主｜総会」「非業務執｜行取締役等」は安全でない（辞書にない語でも、分からない二字ずつの切れ目は warn にする） */
const unitOk = p => TERMS.has(p) || WORDS.includes(p) || (Array.from(p).length >= 3 && END_SUFFIX.includes(Array.from(p).slice(-1)[0]));
const known = p => unitOk(p) || KNOWN2.has(p);
function unsafeKK(run, k, left, right) {
  const ch = Array.from(run), cov = [];
  for (let s0 = 0; s0 < k; s0++) for (let e = k + 1; e <= ch.length; e++) if (TERMS.has(ch.slice(s0, e).join(''))) cov.push([s0, e]);
  const maximal = cov.filter(([s0, e]) => !cov.some(([s1, e1]) => s1 <= s0 && e <= e1 && (e1 - s1) > (e - s0)));      // いちばん長い術語で決める（「債権者代位」より「債権者代位権」）
  for (const [s0, e] of maximal) {
    const a = ch.slice(s0, k).join(''), b = ch.slice(k, e).join('');
    const ok = (unitOk(a) && unitOk(b)) || (TERMS.has(a) && Array.from(a).length >= 4 && KNOWN2.has(b)) || (TERMS.has(b) && Array.from(b).length >= 4 && KNOWN2.has(a));
    if (!ok) return true;
  }
  if (maximal.length) return false;
  return !(known(left) || known(right));                     // 術語に掛からない連なり：どちらの側も分からない語（二字ずつの機械的な区切り）なら安全でない
}
function tokenize(s) {
  const out = [];
  for (const t of String(s).match(TOKEN_RE) || []) { if (HAN_RUN.test(t) && Array.from(t).length > 3) out.push(...splitKanji(t)); else out.push(t); }
  return out;
}
function cls(ch) {
  if (/\p{Script=Han}|々|〇/u.test(ch)) return 'K';
  if (/\p{Script=Hiragana}/u.test(ch)) return 'H';
  if (/\p{Script=Katakana}|ー/u.test(ch)) return 'T';
  if (ch.codePointAt(0) < 0x80 || /[０-９Ａ-Ｚａ-ｚ]/.test(ch)) return 'A';
  return 'P';
}
/** a の後・b の前で改行するときの罰点（小さいほど良い切れ目）。Infinity は禁則 */
function breakCost(a, b) {
  const x = a.slice(-1), y = b[0];
  if (NO_HEAD.includes(y) || NO_TAIL.includes(x)) return Infinity;
  if (GOOD_AFTER.includes(x)) return 0;
  if (NO_TAIL.includes(y)) return 0.5;
  if (END_OK.has(a)) return 1.5;
  if (/[条項号頁日]$/.test(a) && cls(a[0]) !== 'H' && (cls(y) === 'K' || /^(ただし書|かっこ書|但書|なお書)/.test(b))) return 3;         // 「424条1項｜ただし書」「…8日｜民集」
  const cx = cls(x), cy = cls(y), part = a.length === 1 && PARTICLE.includes(x);
  if (cx === 'P' || cy === 'P') return 2;
  if (cx === 'H' && cy !== 'H') return part ? 1 : 2.5;
  if (cx === 'H' && cy === 'H') return x === 'を' && a.length === 1 ? 2 : part ? 6 : 16;
  if (cx === 'K' && cy === 'H') return /^(など|ほか|のみ|だけ|又は|及び|または|および|かつ|並びに|若しくは|まで|から|より)/.test(b) ? 7 : 20;
  if (cx === 'K' && cy === 'K') return 9;
  if (cx === 'T' && cy === 'T') return 40;
  return 6;
}
/** 折れない単位（禁則でつながる語をまとめたもの）の並び。箱や線の横に最低限要る幅を見積もるのに使う */
function atoms(str) { const out = []; for (const part of String(str).split(/\n|\|/)) { const t = []; for (const k of tokenize(part)) { if (t.length && breakCost(t[t.length - 1], k) === Infinity) t[t.length - 1] += k; else t.push(k); } out.push(...t); } return out; }
const wrapLog = [];
/** 行数を最小にしたうえで、行の長さをそろえ、語の途中で切らない位置を選ぶ（動的計画法）。語の途中でしか切れないなら1行増やす */
function wrapOne(s, maxW, size, fill) {
  // 禁則でつながる語（「（」＋語、語＋「）」など）は先にひとかたまりにする。かたまりが幅を超えるときは、そのかたまりだけで一行にする
  const toks = []; for (const t of tokenize(s)) { if (toks.length && breakCost(toks[toks.length - 1], t) === Infinity) toks[toks.length - 1] += t; else toks.push(t); }
  const n = toks.length, w = toks.map(t => textW(t, size));
  if (w.some(x => x > maxW + 0.5)) wrapLog.push({ s, lines: [toks[w.findIndex(x => x > maxW + 0.5)]], cost: 99 });
  const pre = [0]; for (let i = 0; i < n; i++) pre.push(pre[i] + w[i]);
  let L = 1, cur = 0; for (let i = 0; i < n; i++) { if (cur + w[i] > maxW && cur > 0) { L++; cur = 0; } cur += w[i]; }
  // 短い括弧（中身 12 字以内）の途中は、切れ目として最後に回す（+13：ほかに切れ目がないときだけ使われ、warn になる）
  const inPar = new Array(n + 1).fill(0); { let open = -1, acc = ''; for (let i = 0; i < n; i++) { const t = toks[i]; if (NO_TAIL.includes(t[0])) { open = i; acc = ''; } if (open >= 0) { acc += t; if ('）」』】〕'.includes(t.slice(-1))) { if (acc.length <= 14) for (let j = open + 1; j <= i; j++) inPar[j] = 13; open = -1; } } } }
  // 漢字の連なりの途中の切れ目：安全でなければ罰点を足す（9＋5＝14：ほかに切れ目がないときだけ使われ、warn になる）
  for (let j = 1; j < n; j++) {
    if (!HAN_RUN.test(toks[j - 1]) || !HAN_RUN.test(toks[j])) continue;
    let a = j - 1, b = j; while (a > 0 && HAN_RUN.test(toks[a - 1])) a--; while (b < n - 1 && HAN_RUN.test(toks[b + 1])) b++;
    const run = toks.slice(a, b + 1).join(''), k = Array.from(toks.slice(a, j).join('')).length;
    if (unsafeKK(run, k, toks[j - 1], toks[j])) inPar[j] += BAD_BREAK - 9;
  }
  let best = null;
  for (let lines = L; lines <= L + 2; lines++) {
    const f = Array.from({ length: lines + 1 }, () => new Array(n + 1).fill(Infinity)), bk = Array.from({ length: lines + 1 }, () => new Array(n + 1).fill(-1));
    f[0][0] = 0;
    for (let k = 1; k <= lines; k++) for (let j = k; j <= n; j++) for (let i = k - 1; i < j; i++) {
      if (f[k - 1][i] === Infinity) continue; const lw = pre[j] - pre[i];
      if (lw > maxW + 0.5 && j - i > 1) continue;
      const slack = Math.max(0, maxW - lw) / maxW, bc = j < n ? breakCost(toks[j - 1], toks[j]) + inPar[j] : 0;
      if (bc === Infinity) continue;
      const c = f[k - 1][i] + (fill && j === n ? 0 : slack * slack * (fill ? 40 : 14)) + bc + (lw > maxW + 0.5 ? 60 : 0);
      if (c < f[k][j]) { f[k][j] = c; bk[k][j] = i; }
    }
    if (f[lines][n] < Infinity) {
      const out = [], cuts = []; let j = n; for (let k = lines; k >= 1; k--) { const i = bk[k][j]; out.unshift(toks.slice(i, j).join('')); if (j < n) cuts.push(breakCost(toks[j - 1], toks[j]) + inPar[j]); j = i; }
      const cost = f[lines][n] + (lines - L) * 5, bad = Math.max(0, ...cuts);
      if (!best || cost < best.cost) best = { out, cost, bad };
      if (bad < BAD_BREAK) break;                                       // 自然な位置だけで折れたら、それ以上行を増やさない
    }
  }
  if (best) { if (best.bad >= BAD_BREAK) wrapLog.push({ s, lines: best.out, cost: best.bad }); return best.out; }
  const out = []; let c2 = [], cw2 = 0;           // 最後の手段：貪欲法
  for (let i = 0; i < n; i++) { if (cw2 + w[i] > maxW && c2.length) { out.push(c2.join('')); c2 = []; cw2 = 0; } c2.push(toks[i]); cw2 += w[i]; }
  if (c2.length) out.push(c2.join('')); wrapLog.push({ s, lines: out, cost: 99 }); return out;
}
/** 文字列（\n か | で明示改行）または配列を、幅 maxW に収まる行の配列にする */
function wrap(str, maxW, size, o) {
  if (str == null) return [];
  const arr = (Array.isArray(str) ? str : [str]).flatMap(t => String(t).split(/\n|\|/));
  return arr.flatMap(s => (textW(s, size) <= maxW ? [s] : wrapOne(s, maxW, size, o && o.fill)));
}
/** 箱の内側の幅に入る和文の字数の目安 */
const fitChars = (w, pad, size) => Math.floor((w - (pad == null ? S.PAD : pad) * 2) / (size || S.FS));
/** 収まらないときの順序の一段目「箱を広げる」：どの語も、語の途中で折れず maxLines 行以内に収まる最小の幅を w0〜wMax から選ぶ。なければ wMax */
function fitWidth(texts, w0, wMax, o) {
  o = o || {}; const size = o.size || S.FS, pad = o.pad == null ? S.PAD : o.pad, maxLines = o.maxLines || 3;
  const list = texts.flat().filter(t => t != null && t !== '').flatMap(t => String(t).split(/\n|\|/));
  for (let w = w0; w <= wMax + 0.5; w += 10) {
    const n0 = wrapLog.length; let ok = true;
    for (const t of list) { if (textW(t, size) <= w - pad * 2) continue; const ls = wrapOne(t, w - pad * 2, size); if (ls.length > maxLines || wrapLog.length > n0) { ok = false; break; } }
    wrapLog.length = n0; if (ok) return w;
  }
  return Math.max(w0, wMax);
}
function measure(lines, size, lh) {
  lh = lh || S.LH; const w = Math.max(0, ...lines.map(l => textW(l, size)));
  return { w, h: lines.length ? size * (1 + (lines.length - 1) * lh) : 0 };
}

/* ---------- 幾何 ---------- */
const r1 = n => Math.round(n * 10) / 10;
function segHitsBox(a, b, bx, pad) {
  pad = pad || 0; const x0 = bx.x0 - pad, y0 = bx.y0 - pad, x1 = bx.x1 + pad, y1 = bx.y1 + pad;
  let t0 = 0, t1 = 1; const dx = b[0] - a[0], dy = b[1] - a[1];
  const clip = (p, q) => { if (p === 0) return q >= 0; const r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } return true; };
  return clip(-dx, a[0] - x0) && clip(dx, x1 - a[0]) && clip(-dy, a[1] - y0) && clip(dy, y1 - a[1]) && t0 < t1;
}
/** 縦どうし・横どうしの線分が同じ筋に重なる長さ（tol：筋のずれの許容）。重ならなければ 0 */
function collinear(a, b, c, d, tol) {
  tol = tol == null ? 5 : tol;
  const h1 = Math.abs(a[1] - b[1]) < 0.6, v1 = Math.abs(a[0] - b[0]) < 0.6, h2 = Math.abs(c[1] - d[1]) < 0.6, v2 = Math.abs(c[0] - d[0]) < 0.6;
  if (h1 && h2 && Math.abs(a[1] - c[1]) < tol) return Math.max(0, Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) - Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])));
  if (v1 && v2 && Math.abs(a[0] - c[0]) < tol) return Math.max(0, Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1])) - Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])));
  return 0;
}
/** 二つの線分が途中で交わるか（端点で触れるだけは数えない） */
function crosses(a, b, c, d) {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return ((d1 > 0.5 && d2 < -0.5) || (d1 < -0.5 && d2 > 0.5)) && ((d3 > 0.5 && d4 < -0.5) || (d3 < -0.5 && d4 > 0.5));
}
const overlap = (p, q, pad) => Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0) > -(pad || 0) && Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0) > -(pad || 0);

/* ---------- キャンバス ---------- */
class Canvas {
  constructor(o) { o = o || {}; this.W = o.width || S.W; this.M = o.margin || S.M; this.parts = []; this.texts = []; this.boxes = []; this.segs = []; this.nodes = []; this.ends = []; this.maxY = 0; this.minY = 1e9; this.warn = []; this.meta = { labels: [] }; this.oy = 0; this.total = 0; }
  /** 複合図（panel）用：以後の描画を下へ oy ずらし、衝突判定と高さを区画ごとに取り直す */
  beginPanel(oy) { this.total = Math.max(this.total, this.oy + this.maxY); this.oy = oy; this.texts = []; this.boxes = []; this.segs = []; this.nodes = []; this.ends = []; this.maxY = 0; }
  endPanel() { this.total = Math.max(this.total, this.oy + this.maxY); return this.total; }
  static esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  _ext(y0, y1) { if (y1 > this.maxY) this.maxY = y1; if (y0 < this.minY) this.minY = y0; }
  /** 文字。y は1行目のベースライン。lines は配列。anchor: start|middle|end */
  text(x, y, lines, o) {
    o = o || {}; if (!Array.isArray(lines)) lines = [lines]; lines = lines.filter(l => l != null && l !== '');
    if (!lines.length) return { x0: x, y0: y, x1: x, y1: y };
    const size = o.size || S.FS, lh = (o.lh || S.LH) * size, a = o.anchor || 'start';
    const w = Math.max(...lines.map(l => textW(l, size)));
    const x0 = a === 'middle' ? x - w / 2 : a === 'end' ? x - w : x;
    const bb = { x0, y0: y - size * 0.86, x1: x0 + w, y1: y + (lines.length - 1) * lh + size * 0.22, s: lines.join('') };
    const attr = `x="${r1(x)}" y="${r1(y + this.oy)}" font-size="${size}" text-anchor="${a}"` + (a !== 'start' ? ` style="text-anchor:${a}"` : '') + ` fill="${C.INK}"` + (o.bold ? ' font-weight="700"' : '') + (o.role ? ` data-role="${o.role}"` : '');
    if (lines.length === 1) this.parts.push(`<text ${attr}>${Canvas.esc(lines[0])}</text>`);
    else this.parts.push(`<text ${attr}>` + lines.map((l, i) => `<tspan x="${r1(x)}" dy="${i ? r1(lh) : 0}">${Canvas.esc(l)}</tspan>`).join('') + '</text>');
    if (bb.x0 < this.M - 0.5 || bb.x1 > this.W - this.M + 0.5) this.warn.push(`文字が版面の外に出る：「${bb.s.slice(0, 14)}」`);
    for (const t of this.texts) if (overlap(t, bb, -1)) this.warn.push(`文字の重なり：「${t.s.slice(0, 10)}」と「${bb.s.slice(0, 10)}」`);
    this.texts.push(bb); this._ext(bb.y0, bb.y1); if (!o.noTrace) this.meta.labels.push(lines.join('')); return bb;
  }
  /** 縦横の中央に置く文字ブロック */
  textCenter(cx, cy, lines, o) {
    o = o || {}; if (!Array.isArray(lines)) lines = [lines]; const size = o.size || S.FS, lh = (o.lh || S.LH) * size;
    const blockH = size * 0.74 + (lines.length - 1) * lh;           // 字面の高さ
    return this.text(cx, cy - blockH / 2 + size * 0.74, lines, Object.assign({ anchor: 'middle' }, o));
  }
  rect(x, y, w, h, o) {
    o = o || {}; const st = o.accent ? C.ACCENT : o.gray ? C.GRAY : C.INK, sw = o.thick || o.accent ? S.THICK : S.THIN;
    this.parts.push(`<rect x="${r1(x)}" y="${r1(y + this.oy)}" width="${r1(w)}" height="${r1(h)}" fill="${o.fill || 'none'}" stroke="${o.noStroke ? 'none' : st}"` + (o.noStroke ? '' : ` stroke-width="${sw}"`) + (o.dash ? ` stroke-dasharray="${o.dash === 'dot' ? '2 5' : '7 5'}"` : '') + (o.role ? ` data-role="${o.role}"` : '') + '/>');
    const bb = { x0: x, y0: y, x1: x + w, y1: y + h }; if (o.obst !== false) this.boxes.push(bb); this._ext(y, y + h); return bb;
  }
  line(x1, y1, x2, y2, o) { return this.poly([[x1, y1], [x2, y2]], o); }
  /** 折れ線。head: 'end'|'start'|'both'|undefined。dash: true|'dot' */
  poly(pts, o) {
    o = o || {}; const col = o.accent ? C.ACCENT : o.gray ? C.GRAY : C.INK, sw = o.thick || o.accent ? S.THICK : S.THIN;
    const mk = id => `url(#ah-${col === C.ACCENT ? 'a' : col === C.GRAY ? 'g' : 'k'})`;
    let a = `fill="none" stroke="${col}" stroke-width="${sw}"`;
    if (o.dash) a += ` stroke-dasharray="${o.dash === 'dot' ? '2 5' : '7 5'}"`;
    if (o.head === 'end' || o.head === 'both') a += ` marker-end="${mk()}"`;
    if (o.head === 'start' || o.head === 'both') a += ` marker-start="${mk()}"`;
    if (o.role) a += ` data-role="${o.role}"`;
    const oy = this.oy;
    if (pts.length === 2) this.parts.push(`<line x1="${r1(pts[0][0])}" y1="${r1(pts[0][1] + oy)}" x2="${r1(pts[1][0])}" y2="${r1(pts[1][1] + oy)}" ${a}/>`);
    else this.parts.push(`<polyline points="${pts.map(p => r1(p[0]) + ',' + r1(p[1] + oy)).join(' ')}" ${a}/>`);
    if (o.obst !== false && o.wire !== false) this.ends.push(pts[0], pts[pts.length - 1]);
    for (let i = 0; i < pts.length - 1; i++) { if (o.obst !== false) this.segs.push([pts[i], pts[i + 1]]); this._ext(Math.min(pts[i][1], pts[i + 1][1]), Math.max(pts[i][1], pts[i + 1][1])); }
    return pts;
  }
  /** 止め線（渡らない矢印の先に置く短い直交線） */
  stopBar(x, y, vertical, o) { const d = 11; return vertical ? this.line(x - d, y, x + d, y, Object.assign({ thick: true }, o)) : this.line(x, y - d, x, y + d, Object.assign({ thick: true }, o)); }
  /** その矩形に文字を置いてよいか（既存の文字・枠・線と重ならない） */
  free(bb, pad) {
    pad = pad == null ? 4 : pad;
    if (bb.x0 < this.M || bb.x1 > this.W - this.M || bb.y0 < this.M - 6) return false;
    for (const t of this.texts) if (overlap(t, bb, pad)) return false;
    for (const b of this.boxes) {           // 枠線と交差しない（内側に完全に入るのは可、ただしここでは避ける）
      if (overlap(b, bb, pad)) return false;
    }
    for (const s of this.segs) if (segHitsBox(s[0], s[1], bb, pad)) return false;
    return true;
  }
  /** 候補位置 [{x,y,anchor}] のうち最初に空いている所へラベルを置く。全部ふさがっていれば先頭に置いて警告 */
  label(lines, cands, o) {
    o = o || {}; if (!Array.isArray(lines)) lines = [lines]; const size = o.size || S.FS, m = measure(lines, size, o.lh);
    for (const c of cands) {
      const a = c.anchor || 'middle', x0 = a === 'middle' ? c.x - m.w / 2 : a === 'end' ? c.x - m.w : c.x;
      const bb = { x0, y0: c.y - size * 0.86, x1: x0 + m.w, y1: c.y - size * 0.86 + m.h + size * 0.08 };
      if (this.free(bb, o.pad)) return this.text(c.x, c.y, lines, Object.assign({}, o, { anchor: a }));
    }
    this.warn.push(`ラベルの置き場が見つからない：「${lines.join('').slice(0, 14)}」`);
    const c = cands[0]; return this.text(c.x, c.y, lines, Object.assign({}, o, { anchor: c.anchor || 'middle' }));
  }
  /** 文字入りの箱。w を与えなければ文字に合わせる。戻り値に辺の中点を持つ。
      kind：人でない対象の描き分け（色は増やさず、形で分ける）。'thing'＝物・書類（右上の角を折る）／'right'＝権利・地位（上下の罫だけ）／
            'proc'＝手続・行為（右を山形にする）／'organ'＝機関・組織（二重の枠）。省略＝人・立場（ふつうの箱）。
      under:true＝結論の箱（下辺を太くする）。箱の主従は、線の太さ（under）・枠の有無（plain）・灰の細枠（gray）で付け、見出し帯は使わない。 */
  node(x, y, o) {
    o = o || {}; const size = o.size || S.FS, kind = o.kind || '', pad = (o.pad == null ? S.PAD : o.pad) + (kind === 'organ' ? 4 : 0), ex = kind === 'proc' || kind === 'thing' ? 12 : 0;
    let lines = o.lines || []; let head = o.head ? (Array.isArray(o.head) ? o.head : [o.head]) : [];
    const innerW = (o.w ? o.w : (o.maxW || 300)) - pad * 2 - ex;
    lines = wrap(lines, innerW, size); head = wrap(head, innerW, o.headSize || size);
    const mh = measure(head, o.headSize || size), ml = measure(lines, size);
    const w = o.w || Math.max(mh.w, ml.w, o.minW || 0) + pad * 2 + ex;
    const gap = head.length && lines.length ? size * 0.55 : 0;
    const rb = o.reserveBottom || 0, h = Math.max(o.h || 0, o.minH || 0, mh.h + gap + ml.h + pad * 2 - size * 0.1 + rb);     // reserveBottom：箱の下の部分を空けておく（段の中の小枝を描く）
    const X = o.center ? x - w / 2 : x, Y = o.middle ? y - h / 2 : y, st = { accent: o.accent, dash: o.dash, gray: o.gray, thick: o.thick };
    const name = (head[0] || lines[0] || '').slice(0, 12);
    if (!o.noBox && !o.plain) {
      if (kind === 'thing') { const c = 15;
        this.rect(X, Y, w, h, { fill: o.fill || C.WHITE, noStroke: true, role: 'node' });
        this.poly([[X, Y], [X + w - c, Y], [X + w, Y + c], [X + w, Y + h], [X, Y + h], [X, Y]], Object.assign({ obst: false, role: 'shape' }, st));
        this.poly([[X + w - c, Y], [X + w - c, Y + c], [X + w, Y + c]], { obst: false, role: 'shape', accent: o.accent, gray: o.gray });
      } else if (kind === 'right') {
        this.rect(X, Y, w, h, { fill: o.fill || C.WHITE, noStroke: true, role: 'node' });
        this.line(X, Y, X + w, Y, Object.assign({ obst: false, role: 'shape' }, st)); this.line(X, Y + h, X + w, Y + h, Object.assign({ obst: false, role: 'shape' }, st));
      } else if (kind === 'proc') { const c = 13;
        this.rect(X, Y, w, h, { fill: o.fill || C.WHITE, noStroke: true, role: 'node' });
        this.poly([[X, Y], [X + w - c, Y], [X + w, Y + h / 2], [X + w - c, Y + h], [X, Y + h], [X, Y]], Object.assign({ obst: false, role: 'shape' }, st));
      } else {
        this.rect(X, Y, w, h, Object.assign({ fill: o.fill || C.WHITE, role: 'node' }, st));
        if (kind === 'organ') this.rect(X + 4, Y + 4, w - 8, h - 8, { obst: false, role: 'shape', accent: false, gray: o.gray });
      }
      if (o.under && !o.accent) this.line(X, Y + h, X + w, Y + h, { thick: true, obst: false, role: 'shape' });
    } else if (o.plain) { this.rect(X, Y, w, h, { fill: C.WHITE, noStroke: true, role: 'node' }); this.line(X, Y, X, Y + h, { gray: true, obst: false, role: 'shape' }); }
    const contentH = mh.h + gap + ml.h; let ty = Y + (h - rb - contentH) / 2 + (rb ? 2 : 0);
    const cx = X + (w - (kind === 'proc' ? 8 : 0)) / 2;
    if (head.length) { this.text(cx, ty + (o.headSize || size) * 0.8, head, { anchor: 'middle', size: o.headSize || size, bold: o.headBold }); ty += mh.h + gap; }
    if (lines.length) {
      if (o.align === 'left') this.text(X + pad, ty + size * 0.8, lines, { size }); else this.text(cx, ty + size * 0.8, lines, { anchor: 'middle', size });
    }
    if (!o.noLineWarn) { const nl = Math.max(head.length, lines.length); if (nl >= 4) this.warn.push(`箱の語が ${nl} 行：「${name}」。語を減らすか、箱を広げる（1行の目安は ${fitChars(w, pad, size)} 字）`); }
    const nd = { x: X, y: Y, w, h, cx: X + w / 2, cy: Y + h / 2, x0: X, y0: Y, x1: X + w, y1: Y + h, name,
      L: [X, Y + h / 2], R: [X + w, Y + h / 2], T: [X + w / 2, Y], B: [X + w / 2, Y + h] };
    if (o.register !== false) this.nodes.push(nd);
    return nd;
  }
  /** 箱でない当事者（人型など）を、経路が避ける対象として登録する */
  addNode(bb, name) { const nd = Object.assign({ name: name || '' }, bb); this.nodes.push(nd); return nd; }
  /** 経路の候補を採点する。貫通（端点でない箱を通る）＞ 別の線と同じ筋に重なる ＞ 文字を通る ＞ 接続点の混み合い ＞ 別の線のすぐ脇を長く並走 ＞ 交差 ＞ 折れの数 ＞ 長さ */
  _score(pts, a, b) {
    let hits = 0, over = 0, cross = 0, txt = 0, crowd = 0, len = 0, side = 0; const hitNames = [];
    const shrink = (bx, d) => ({ x0: bx.x0 + d, y0: bx.y0 + d, x1: bx.x1 - d, y1: bx.y1 - d });
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1]; len += Math.hypot(q[0] - p[0], q[1] - p[1]);
      for (const nd of this.nodes) {
        const self = nd === a || nd === b || (a && nd.x0 === a.x0 && nd.y0 === a.y0 && nd.x1 === a.x1) || (b && nd.x0 === b.x0 && nd.y0 === b.y0 && nd.x1 === b.x1);
        if (segHitsBox(p, q, self ? shrink(nd, 3) : nd, self ? 0 : 5)) { hits++; if (!hitNames.includes(nd.name)) hitNames.push(nd.name); }
      }
      for (const sg of this.segs) { if (collinear(p, q, sg[0], sg[1], 6) > 6) over++; else if (collinear(p, q, sg[0], sg[1], 28) > 40) side++; else if (crosses(p, q, sg[0], sg[1])) cross++; }
      for (const t of this.texts) if (segHitsBox(p, q, t, 2)) txt++;
    }
    for (const e of this.ends) for (const p of [pts[0], pts[pts.length - 1]]) if (Math.hypot(e[0] - p[0], e[1] - p[1]) < 13) crowd++;
    return { cost: hits * 1000 + over * 400 + txt * 150 + crowd * 60 + side * 30 + cross * 25 + (pts.length - 2) * 6 + len * 0.01, hits, over, hitNames };
  }
  /** 2つの箱をつなぐ経路。候補（直線・L 字・Z 字・迂回、接続点を辺の中央と左右 0.3 に振る）を作り、_score が最小のものを選ぶ。
      shift で平行にずらす（同じ二者の間の矢印の積み上げ）。elbow・straight・port を指定すればその形を先頭の候補にする。
      どの候補でも貫通・重なりが残るときは warn（配置 pos を入れ替えるか、図を分ける）。戻り値は点列 */
  route(a, b, o) {
    o = o || {}; const sh = o.shift || 0, g = 6;       // g：箱と矢印の先の間隔
    const sepX = a.x1 + 10 <= b.x0 || b.x1 + 10 <= a.x0, sepY = a.y1 + 10 <= b.y0 || b.y1 + 10 <= a.y0;
    const right = b.cx > a.cx, down = b.cy > a.cy, aw = a.x1 - a.x0, ah = a.y1 - a.y0, bw = b.x1 - b.x0, bh = b.y1 - b.y0, P = [0, -1, 1], cand = [];
    const add = (pts, pref) => cand.push({ pts, pref });
    if (sepX && sepY) {
      const vh = (p, q) => { const x = a.cx + p * aw * 0.3 + sh; const y = b.cy + q * bh * 0.3; return [[x, down ? a.y1 : a.y0], [x, y], [right ? b.x0 - g : b.x1 + g, y]]; };
      const hv = (p, q) => { const y = a.cy + p * ah * 0.3 + sh; const x = b.cx + q * bw * 0.3; return [[right ? a.x1 : a.x0, y], [x, y], [x, down ? b.y0 - g : b.y1 + g]]; };
      if (o.elbow === 'vh') add(vh(0, 0), -50); if (o.elbow === 'hv') add(hv(0, 0), -50);
      if (o.straight) add([[right ? a.x1 : a.x0, a.cy], [right ? b.x0 - g : b.x1 + g, b.cy]], -50);
      // 従来の既定：上の箱の下辺から下り、下の箱の横腹に入る
      { const up = a.y1 <= b.y0 ? a : b, lo = up === a ? b : a, port = o.port || 0, vx = up.cx + port * (up.x1 - up.x0) * 0.35 + sh, hy = lo.cy + sh, toRight = lo.cx > up.cx;
        add(up === a ? [[vx, a.y1], [vx, hy], [toRight ? b.x0 - g : b.x1 + g, hy]] : [[toRight ? a.x0 : a.x1, hy], [vx, hy], [vx, b.y1 + g]], 0); }
      for (const p of P) for (const q of P) { add(vh(p, q), 3 + Math.abs(p) + Math.abs(q)); add(hv(p, q), 3 + Math.abs(p) + Math.abs(q)); }
      const y0 = down ? a.y1 : a.y0, y1 = down ? b.y0 : b.y1, x0 = right ? a.x1 : a.x0, x1 = right ? b.x0 : b.x1;
      for (const f of [0.5, 0.34, 0.66]) for (const p of P) for (const q of P) {
        const ym = y0 + (y1 - y0) * f, xa = a.cx + p * aw * 0.3 + sh, xb = b.cx + q * bw * 0.3;
        add([[xa, y0], [xa, ym], [xb, ym], [xb, down ? b.y0 - g : b.y1 + g]], 8 + Math.abs(p) + Math.abs(q) + Math.abs(f - 0.5) * 4);
        const xm = x0 + (x1 - x0) * f, ya = a.cy + p * ah * 0.3 + sh, yb = b.cy + q * bh * 0.3;
        add([[x0, ya], [xm, ya], [xm, yb], [right ? b.x0 - g : b.x1 + g, yb]], 9 + Math.abs(p) + Math.abs(q) + Math.abs(f - 0.5) * 4);
      }
    } else if (sepX) {                                 // 左右に離れている
      const ltr = a.x1 <= b.x0, xa = ltr ? a.x1 : a.x0, xb = ltr ? b.x0 - g : b.x1 + g;
      const yo0 = Math.max(a.y0, b.y0), yo1 = Math.min(a.y1, b.y1);
      const y = Math.max(yo0 + 8, Math.min(yo1 - 8, (yo0 + yo1) / 2 + sh)); add([[xa, y], [xb, y]], 0);
      const mid = this.nodes.filter(n => n !== a && n !== b && n.x1 > Math.min(a.x1, b.x1) && n.x0 < Math.max(a.x0, b.x0));
      const top = Math.min(a.y0, b.y0, ...mid.map(n => n.y0)) - 30, bot = Math.max(a.y1, b.y1, ...mid.map(n => n.y1)) + 30;
      for (const p of [ltr ? 1 : -1, 0]) { const x1 = a.cx + p * aw * 0.3, x2 = b.cx - p * bw * 0.3;   // 間に箱がある：上か下を回る
        add([[x1, a.y0], [x1, top], [x2, top], [x2, b.y0 - g]], 12); add([[x1, a.y1], [x1, bot], [x2, bot], [x2, b.y1 + g]], 12); }
    } else {                                           // 上下に離れている
      const utd = a.y1 <= b.y0, ya = utd ? a.y1 : a.y0, yb = utd ? b.y0 - g : b.y1 + g;
      const xo0 = Math.max(a.x0, b.x0), xo1 = Math.min(a.x1, b.x1);
      const x = Math.max(xo0 + 8, Math.min(xo1 - 8, (xo0 + xo1) / 2 + sh)); add([[x, ya], [x, yb]], 0);
      const mid = this.nodes.filter(n => n !== a && n !== b && n.y1 > Math.min(a.y1, b.y1) && n.y0 < Math.max(a.y0, b.y0));
      const lef = Math.min(a.x0, b.x0, ...mid.map(n => n.x0)) - 30, rig = Math.max(a.x1, b.x1, ...mid.map(n => n.x1)) + 30;
      for (const p of [utd ? 1 : -1, 0]) { const y1 = a.cy + p * ah * 0.3, y2 = b.cy - p * bh * 0.3;   // 間に箱がある：左か右を回る
        if (lef > this.M) add([[a.x0, y1], [lef, y1], [lef, y2], [b.x0 - g, y2]], 12); if (rig < this.W - this.M) add([[a.x1, y1], [rig, y1], [rig, y2], [b.x1 + g, y2]], 12); }
    }
    let best = null; for (const c of cand) { const sc = this._score(c.pts, a, b); sc.cost += c.pref; if (!best || sc.cost < best.cost - 1e-6) best = Object.assign(sc, { pts: c.pts }); }
    if (best.hits) this.warn.push(`線が箱「${best.hitNames.join('・')}」を貫通する（${a.name || ''}→${b.name || ''}）。pos を入れ替えるか、関係を二枚に分ける`);
    else if (best.over) this.warn.push(`線が別の線と同じ筋に重なる（${a.name || ''}→${b.name || ''}）。pos を入れ替えるか、elbow で折れ方を変える`);
    return best.pts;
  }
  /** 範囲の枠：複数の箱を灰の細い破線で囲み、左上に範囲の名前を置く（例：判決の効力が及ぶ範囲）。枠は経路の障害にしない（線は枠をまたいでよい） */
  group(bbs, label, o) {
    o = o || {}; const pad = o.pad == null ? 18 : o.pad, x0 = Math.min(...bbs.map(b => b.x0)) - pad, y0 = Math.min(...bbs.map(b => b.y0)) - pad, x1 = Math.max(...bbs.map(b => b.x1)) + pad, y1 = Math.max(...bbs.map(b => b.y1)) + pad;
    this.rect(x0, y0, x1 - x0, y1 - y0, { gray: !o.accent, accent: o.accent, dash: true, obst: false, role: 'group' });
    for (const [p, q] of [[[x0, y0], [x1, y0]], [[x1, y0], [x1, y1]], [[x1, y1], [x0, y1]], [[x0, y1], [x0, y0]]]) this.segs.push([p, q]);
    const fr = { x0, y0, x1, y1 };
    if (label) { const ls = wrap(label, Math.max(120, x1 - x0 - 8), S.FS), m = measure(ls, S.FS);
      this.label(ls, [{ x: x0 + 2, y: y0 - 8 - (m.h - S.FS), anchor: 'start' }, { x: x1 - 2, y: y0 - 8 - (m.h - S.FS), anchor: 'end' }, { x: x0 + 2, y: y1 + 8 + S.FS * 0.86, anchor: 'start' }, { x: x1 - 2, y: y1 + 8 + S.FS * 0.86, anchor: 'end' }], { role: 'group-label', pad: 3 }); }
    return fr;
  }
  /** 注記の吹き出し：箱のそばの空いた所に短い注を置き、灰の細線で箱につなぐ。枠は付けない */
  callout(nd, text, o) {
    o = o || {}; const ls = wrap(text, o.maxW || 270, S.FS), m = measure(ls, S.FS), d = 26, c = [];
    const put = (x, y, anchor, px, py, qx, qy) => c.push({ x, y, anchor, lead: [[px, py], [qx, qy]] });
    put(nd.x1 + d, nd.cy - m.h / 2 + S.FS * 0.8, 'start', nd.x1, nd.cy, nd.x1 + d - 5, nd.cy);
    put(nd.x0 - d, nd.cy - m.h / 2 + S.FS * 0.8, 'end', nd.x0, nd.cy, nd.x0 - d + 5, nd.cy);
    put(nd.cx, nd.y1 + d + S.FS * 0.8, 'middle', nd.cx, nd.y1, nd.cx, nd.y1 + d - 5);
    put(nd.cx, nd.y0 - d - (m.h - S.FS) - S.FS * 0.14, 'middle', nd.cx, nd.y0, nd.cx, nd.y0 - d + 5);
    for (const f of [0.25, 0.75]) { const x = nd.x0 + (nd.x1 - nd.x0) * f;     // 辺の中央に線が出ているとき：四分の一の所から引き出す
      put(x, nd.y0 - d - (m.h - S.FS) - S.FS * 0.14, f < 0.5 ? 'end' : 'start', x, nd.y0, x, nd.y0 - d + 5); put(x, nd.y1 + d + S.FS * 0.8, f < 0.5 ? 'end' : 'start', x, nd.y1, x, nd.y1 + d - 5); }
    for (const k of c) { const x0 = k.anchor === 'middle' ? k.x - m.w / 2 : k.anchor === 'end' ? k.x - m.w : k.x, bb = { x0, y0: k.y - S.FS * 0.86, x1: x0 + m.w, y1: k.y - S.FS * 0.86 + m.h + 2 };
      if (!this.free(bb, 4)) continue; if (this.segs.some(sg => crosses(k.lead[0], k.lead[1], sg[0], sg[1]) || collinear(k.lead[0], k.lead[1], sg[0], sg[1], 6) > 2)) continue;
      this.poly(k.lead, { gray: true, role: 'leader' }); return this.text(k.x, k.y, ls, { anchor: k.anchor, role: 'callout' }); }
    this.warn.push(`注記の吹き出しの置き場がない：「${ls.join('').slice(0, 14)}」。notes（図の下の注）に回す`); return null;
  }
  /** 縦の補助線（基準時など）。灰の細い点線。文字は避けて引く側で長さを決める */
  guide(x, y0, y1) { return this.poly([[x, y0], [x, y1]], { gray: true, dash: 'dot', obst: false, role: 'guide' }); }
  /** 凡例：線・箱の見本と語を一行に並べる。items: [{ sample:'line'|'dash'|'dot'|'accent'|'both'|'group'|'guide'|'stop'|'thing'|'right'|'proc'|'organ'|'under'|'box', text }]。戻り値は下端の y */
  legend(items, y) {
    if (!items || !items.length) return y; let x = this.M; const sw = 46, sh = 20; y += 16; let rowH = sh;
    for (const it of items) {
      const tw = textW(it.text, S.FS), need = sw + 8 + tw;
      if (x + need > this.W - this.M && x > this.M) { x = this.M; y += rowH + 12; }
      const cy = y + sh / 2, k = it.sample || 'line', lo = { obst: false, role: 'legend' };
      if (k === 'line') this.poly([[x, cy], [x + sw - 2, cy]], Object.assign({ head: 'end' }, lo));
      else if (k === 'dash') this.poly([[x, cy], [x + sw - 2, cy]], Object.assign({ head: 'end', dash: true }, lo));
      else if (k === 'dot') this.poly([[x, cy], [x + sw - 2, cy]], Object.assign({ head: 'end', dash: 'dot' }, lo));
      else if (k === 'accent') this.poly([[x, cy], [x + sw - 2, cy]], Object.assign({ head: 'end', accent: true }, lo));
      else if (k === 'both') this.poly([[x + 2, cy], [x + sw - 2, cy]], Object.assign({ head: 'both', dash: true }, lo));
      else if (k === 'stop') { this.poly([[x, cy], [x + sw - 10, cy]], lo); this.line(x + sw - 10, cy - 9, x + sw - 10, cy + 9, Object.assign({ thick: true }, lo)); }
      else if (k === 'group') this.rect(x, y, sw, sh, { gray: true, dash: true, obst: false, role: 'legend' });
      else if (k === 'guide') this.poly([[x + sw / 2, y - 2], [x + sw / 2, y + sh + 2]], Object.assign({ gray: true, dash: 'dot' }, lo));
      else if (k === 'thing') { this.poly([[x, y], [x + sw - 9, y], [x + sw, y + 9], [x + sw, y + sh], [x, y + sh], [x, y]], lo); this.poly([[x + sw - 9, y], [x + sw - 9, y + 9], [x + sw, y + 9]], lo); }
      else if (k === 'right') { this.line(x, y, x + sw, y, lo); this.line(x, y + sh, x + sw, y + sh, lo); }
      else if (k === 'proc') this.poly([[x, y], [x + sw - 9, y], [x + sw, y + sh / 2], [x + sw - 9, y + sh], [x, y + sh], [x, y]], lo);
      else if (k === 'organ') { this.rect(x, y, sw, sh, { obst: false, role: 'legend' }); this.rect(x + 4, y + 4, sw - 8, sh - 8, { obst: false, role: 'legend' }); }
      else if (k === 'under') { this.rect(x, y, sw, sh, { obst: false, role: 'legend' }); this.line(x, y + sh, x + sw, y + sh, Object.assign({ thick: true }, lo)); }
      else this.rect(x, y, sw, sh, { obst: false, role: 'legend', accent: k === 'accentbox' });
      this.text(x + sw + 8, cy + S.FS * 0.36, it.text, { role: 'legend' }); x += need + 30;
    }
    this._ext(y, y + rowH); return y + rowH;
  }
  /** 経路の最長区間のそばにラベルを置く。o.fit = { raw:[語], widths:[幅の候補] } を渡すと、空いた所に収まるまで折り幅を狭めて試す
      （横の区間：線の上→下→両端寄せ。縦の区間：線の右→左、上寄り・下寄り）。どこにも置けなければ warn */
  edgeLabel(pts, lines, o) {
    o = Object.assign({ role: 'edge-label' }, o || {}); if (!lines || !lines.length) return; if (!Array.isArray(lines)) lines = [lines];
    const size = o.size || S.FS; let best = 0, bl = -1;
    for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); if (l > bl) { bl = l; best = i; } }
    const p = pts[best], q = pts[best + 1], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    const horiz = Math.abs(q[1] - p[1]) < Math.abs(q[0] - p[0]);
    const cands = ls => { const m = measure(ls, size); let c;
      if (horiz) { const up = my - 9 - (m.h - size), dn = my + size + 6; c = o.side === 'below' ? [{ x: mx, y: dn }, { x: mx, y: up }] : [{ x: mx, y: up }, { x: mx, y: dn }];
        c.push({ x: mx - bl * 0.22, y: up }, { x: mx + bl * 0.22, y: up }, { x: mx - bl * 0.22, y: dn }, { x: mx + bl * 0.22, y: dn });
        const xl = Math.min(p[0], q[0]) + 8, xr = Math.max(p[0], q[0]) - 12; c.push({ x: xr, y: up, anchor: 'end' }, { x: xl, y: up, anchor: 'start' }, { x: xr, y: dn, anchor: 'end' }, { x: xl, y: dn, anchor: 'start' }); }
      else { const yy = my - m.h / 2 + size * 0.8, R = dy => ({ x: mx + 9, y: yy + dy, anchor: 'start' }), L = dy => ({ x: mx - 9, y: yy + dy, anchor: 'end' });
        c = o.side === 'left' ? [L(0), R(0)] : [R(0), L(0)];
        for (const f of [0.2, 0.3]) c.push(R(-bl * f), R(bl * f), L(-bl * f), L(bl * f)); }
      return c; };
    const widths = o.fit ? o.fit.widths : [null]; let first = null, prevKey = null;
    for (const w of widths) { const n0 = wrapLog.length, ls = w == null ? lines : wrap(o.fit.raw, w, size), m = measure(ls, size), key = ls.join('|');
      if (!first) first = ls; if (key === prevKey) continue; prevKey = key;
      for (const c of cands(ls)) { const a = c.anchor || 'middle', x0 = a === 'middle' ? c.x - m.w / 2 : a === 'end' ? c.x - m.w : c.x;
        if (this.free({ x0, y0: c.y - size * 0.86, x1: x0 + m.w, y1: c.y - size * 0.86 + m.h + size * 0.08 }, o.pad)) {
          if (ls.length >= 3) this.warn.push(`線の横の語が ${ls.length} 行：「${ls.join('').slice(0, 14)}」。語を減らす（条文番号は注へ回す）か、線を長くする`);
          return this.text(c.x, c.y, ls, Object.assign({}, o, { anchor: a, fit: undefined })); } }
      if (ls !== first) wrapLog.length = n0; }                       // 使わなかった折り方の記録は残さない
    this.warn.push(`ラベルの置き場が見つからない：「${first.join('').slice(0, 14)}」。箱の間隔（rowGap）を広げるか、語を減らすか、配置を変える`);
    const c = cands(first)[0]; return this.text(c.x, c.y, first, Object.assign({}, o, { anchor: c.anchor || 'middle', fit: undefined }));
  }
  /** 線で描いた人（ピクト）。黒一色、丸で囲まない */
  person(cx, top, o) {
    o = o || {}; const k = o.scale || 1, col = o.gray ? C.GRAY : C.INK, t0 = top; top += this.oy;
    this.parts.push(`<circle cx="${r1(cx)}" cy="${r1(top + 10 * k)}" r="${r1(9 * k)}" fill="${col}" stroke="none"/>`);
    this.parts.push(`<path d="M${r1(cx - 15 * k)},${r1(top + 50 * k)} L${r1(cx - 15 * k)},${r1(top + 32 * k)} L${r1(cx - 8 * k)},${r1(top + 23 * k)} L${r1(cx + 8 * k)},${r1(top + 23 * k)} L${r1(cx + 15 * k)},${r1(top + 32 * k)} L${r1(cx + 15 * k)},${r1(top + 50 * k)} Z" fill="${col}" stroke="none"/>`);
    top = t0; const bb = { x0: cx - 15 * k, y0: top, x1: cx + 15 * k, y1: top + 50 * k }; this.boxes.push(bb); this._ext(bb.y0, bb.y1); return bb;
  }
  /** 省略の印（//） */
  breakMark(x, y) { this.line(x - 7, y + 9, x - 1, y - 9, { obst: false }); this.line(x + 1, y + 9, x + 7, y - 9, { obst: false }); }
  svg(o) {
    o = o || {}; const H = Math.ceil((o.height || Math.max(this.total, this.oy + this.maxY) + this.M));
    const mk = (id, col) => `<marker id="ah-${id}" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="12" refX="12.5" refY="6" orient="auto-start-reverse"><path d="M1,1 L13,6 L1,11" fill="none" stroke="${col}" stroke-width="1.3"/></marker>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.W} ${H}" font-family="${S.FONT}"` + (o.type ? ` data-type="${o.type}"` : '') + '>\n' +
      (o.desc ? `<desc>${Canvas.esc(o.desc)}</desc>\n` : '') +
      `<defs>${mk('k', C.INK)}${mk('a', C.ACCENT)}${mk('g', C.GRAY)}</defs>\n` +
      `<rect x="0" y="0" width="${this.W}" height="${H}" fill="${C.WHITE}" stroke="none"/>\n` + this.parts.join('\n') + '\n</svg>\n';
  }
}
/** 下端の注記（留保・補足）。主語つきの1〜2行。細い灰の罫の下に置く。注は版面の幅いっぱいで折る（行をそろえず、前の行から詰める） */
function footNotes(cv, notes, y) {
  if (cv.legendItems && cv.legendItems.length && !cv.inPanel) { y = cv.legend(cv.legendItems, y + 6); cv.legendItems = null; }   // 凡例は注の上に一行で
  if (!notes || !notes.length) return y; notes = Array.isArray(notes) ? notes : [notes];
  y += 18; cv.line(cv.M, y, cv.W - cv.M, y, { gray: true, obst: false }); y += 12;
  for (const n of notes) { const ls = wrap(n, cv.W - cv.M * 2, S.FS, { fill: true }); cv.text(cv.M, y + S.FS * 0.86, ls); y += measure(ls, S.FS).h + 12; }
  return y;
}
module.exports = { unsafeKK, TERMS, KNOWN2, C, S, Canvas, charW, textW, wrap, measure, footNotes, segHitsBox, overlap, r1, breakCost, tokenize, splitKanji, atoms, wrapLog, fitChars, fitWidth, collinear, crosses, BAD_BREAK };
