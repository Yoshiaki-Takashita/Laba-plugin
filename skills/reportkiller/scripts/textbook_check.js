#!/usr/bin/env node
/* textbook_check.js：教科書型・解説書型の日本語の本文を、形（長さ・順序・密度）で点検する。
 * 使い方: node textbook_check.js [--json] [--tags ,．] 本文.md
 * 入力：段落は空行で区切る。見出しは行頭の # ～ ###。太字は **語**。箇条（- ・1.）は箇条として数える。
 *   役割の印（行頭の :::box ～ 行頭の :::）は地の文から外し、役割ごとの数と字数だけを出す（所見は出さない）。
 *   引用・注・図題の行は、行頭が > ／ [^ ／ 「図」「表」＋空白で始まるものを地の文から外す。
 * 出す：測った値と、範囲（references/textbook-prose.md の TS1〜）の外にある所見。
 * これは「AI が書いた」と判定する道具ではない。直す候補を出すだけ。文の正しさ・論理は見ない。ファイルは書かず、ネットワークに接続しない。
 * 数値の根拠：教科書の書き起こし 122 ページの形の測定（文・段落・見出し・強調の分布）。教科書の文は入っていない。 */
'use strict';
const fs = require('fs');
const args = process.argv.slice(2);
const json = args.includes('--json');
const file = args.filter(a => !a.startsWith('--'))[0];
if (!file) { console.log('使い方: node textbook_check.js [--json] 本文.md'); process.exit(2); }
const raw = fs.readFileSync(file, 'utf8').replace(/\r/g, '');
// 役割の印（:::box・:::aside・:::point・:::fig … :::）は地の文から外し、長さだけを測る（laba-book の出力の形）
const roles = {};
const src = raw.replace(/^:::(\w+)[^\n]*\n([\s\S]*?)^:::[ \t]*$/gm, (m, r, body) => { (roles[r] = roles[r] || []).push(body.replace(/\s/g, '').length); return ''; });

const CONN = [['逆接', /^(しかし|ただし|もっとも|だが|他方|これに対し)/], ['例示', /^(例えば|たとえば)/], ['帰結', /^(したがって|そこで|このため|このように|その結果|そのため|以上)/],
  ['添加', /^(また|さらに|なお|そして|加えて)/], ['順序', /^(まず|次に|最後に|第[1-9１-９一二三])/], ['言い換え', /^(すなわち|つまり)/]];
const q = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.round(p * (s.length - 1)))]; };
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const cv = xs => { if (xs.length < 5) return null; const m = mean(xs); return Math.sqrt(mean(xs.map(x => (x - m) ** 2))) / m; };
const len = s => s.replace(/\s/g, '').length;

const blocks = src.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
const heads = [], paras = [], bullets = [];
for (const b of blocks) {
  const lines = b.split('\n');
  if (/^#{1,4}\s/.test(lines[0]) && lines.length === 1) { heads.push(lines[0].replace(/^#+\s*/, '').replace(/^(\d+|[(（]\d+[)）]|[(（][a-zａ-ｚ][)）])[\s　]*/, '')); continue; }
  if (/^(>|\[\^|[図表]\s|[図表][0-9０-９])/.test(lines[0])) continue;
  if (lines.every(l => /^\s*([-*・]|\d+[.)])\s/.test(l))) { bullets.push(lines.length); continue; }
  const t = lines.join('').trim();
  if (/^#{1,4}\s/.test(lines[0])) { heads.push(lines[0].replace(/^#+\s*/, '')); paras.push(lines.slice(1).join('').trim()); continue; }
  paras.push(t);
}
const bodyChars = paras.reduce((a, p) => a + len(p), 0);
const sentences = [];
const paraSent = [], paraOpen = { none: 0 }, ends = {};
let commas = [], bold = [], boldPerPara = [], quest = 0;
for (const p of paras) {
  const plain = p.replace(/\*\*/g, '');
  const ss = plain.replace(/．/g, '。').split(/(?<=。)/).map(s => s.trim()).filter(s => len(s) > 1);
  paraSent.push(ss.length);
  const c = CONN.find(([, re]) => re.test(plain)); const k = c ? c[0] : 'none'; paraOpen[k] = (paraOpen[k] || 0) + 1;
  for (const s of ss) {
    sentences.push(len(s)); commas.push((s.match(/[，、]/g) || []).length);
    const e = /である。$/.test(s) ? 'である' : /か。$/.test(s) ? '問い' : /(ます|です)。$/.test(s) ? 'です・ます' : /ない。$/.test(s) ? 'ない' : /た。$/.test(s) ? 'た' : /る。$/.test(s) ? 'る' : 'その他';
    ends[e] = (ends[e] || 0) + 1; if (e === '問い') quest++;
  }
  const bs = [...p.matchAll(/\*\*([^*]+)\*\*/g)].map(m => len(m[1])); boldPerPara.push(bs.length); bold.push(...bs);
}
const nS = sentences.length, nP = paras.length;
const M = {
  字数: bodyChars, 段落数: nP, 文数: nS, 見出し数: heads.length,
  文の長さ: { 平均: +mean(sentences).toFixed(1), 中央値: q(sentences, .5), p10: q(sentences, .1), p90: q(sentences, .9), 変動係数: cv(sentences) == null ? null : +cv(sentences).toFixed(2),
    '40字以下の割合': nS ? +(sentences.filter(x => x <= 40).length / nS).toFixed(2) : null, '81字以上の割合': nS ? +(sentences.filter(x => x > 80).length / nS).toFixed(2) : null },
  読点_1文: +mean(commas).toFixed(2),
  段落: { 字の中央値: q(paras.map(len), .5), 文数の中央値: q(paraSent, .5), '1文だけの段落の割合': nP ? +(paraSent.filter(x => x <= 1).length / nP).toFixed(2) : null },
  段落の頭の接続語の割合: nP ? +(1 - (paraOpen.none || 0) / nP).toFixed(2) : null,
  文末: Object.fromEntries(Object.entries(ends).map(([k, v]) => [k, +(v / nS).toFixed(2)])),
  問いの割合: nS ? +(quest / nS).toFixed(3) : null,
  太字: { 語数: bold.length, '1000字あたり': bodyChars ? +(bold.length * 1000 / bodyChars).toFixed(1) : 0, 長さの最大: bold.length ? Math.max(...bold) : 0, '1段落の最大': boldPerPara.length ? Math.max(...boldPerPara) : 0 },
  見出し: { 字数の中央値: q(heads.map(len), .5), 最大: heads.length ? Math.max(...heads.map(len)) : 0, '1万字あたり': bodyChars ? +(heads.length * 10000 / bodyChars).toFixed(1) : 0,
    名詞止めの割合: heads.length ? +(heads.filter(h => !/[ぁ-ん。？?]$/.test(h.trim())).length / heads.length).toFixed(2) : null },
  本文の箇条書き: bullets.length,
  役割の印: Object.fromEntries(Object.entries(roles).map(([k, v]) => [k, { 数: v.length, 字数: v }])),
};
const F = [];
const add = (lv, id, msg) => F.push({ level: lv, id, msg });
if (nS >= 8) {
  const md = M.文の長さ.中央値;
  if (md < 48) add('warn', 'sent-short', `文の中央値 ${md} 字（教科書型は 55〜68 が目安）。短文がそろうと機械の形（TS1）`);
  if (md > 80) add('warn', 'sent-long', `文の中央値 ${md} 字。長すぎる（TS1）`);
  if (M.文の長さ.p90 > 140) add('warn', 'sent-p90', `p90 ${M.文の長さ.p90} 字。125 字以下を目安に分ける（TS1）`);
  if (M.文の長さ.変動係数 != null && M.文の長さ.変動係数 < 0.40) add('warn', 'sent-uniform', `長さの変動係数 ${M.文の長さ.変動係数}（測定 0.46〜0.73）。長短を混ぜる（TS2）`);
  if (M.文の長さ['40字以下の割合'] < 0.08) add('warn', 'sent-no-short', `40 字以下の文が ${(M.文の長さ['40字以下の割合'] * 100).toFixed(0)}%（測定 22%）。短い文を混ぜる（TS2）`);
  if (M.読点_1文 < 1.4 || M.読点_1文 > 3.8) add('warn', 'comma', `読点 1 文に ${M.読点_1文}（測定 2.6）（TS3）`);
  const top = Math.max(...Object.values(ends)) / nS;
  if (top > 0.6) add('warn', 'ending-mono', `文末の同じ型が ${(top * 100).toFixed(0)}%（TS6）`);
  if ((ends['である'] || 0) / nS > 0.35) add('warn', 'dearu-heavy', `「である。」が ${(ends['である'] / nS * 100).toFixed(0)}%（測定 13%）。「と解される」「と呼ぶ」など終止形を混ぜる（TS6）`);
  if (M.問いの割合 === 0 && bodyChars > 2500) add('info', 'no-question', '問いの文が 0（測定 5%。論点の提起に 1〜2 回）（TS7）');
  if (M.問いの割合 > 0.12) add('warn', 'question-heavy', `問いの文が ${(M.問いの割合 * 100).toFixed(0)}%（TS7）`);
}
if (nP >= 4) {
  if (M.段落.字の中央値 < 110 || M.段落.字の中央値 > 280) add('warn', 'para-len', `段落の中央値 ${M.段落.字の中央値} 字（測定 199・p10 54・p90 364）（TS4）`);
  if (M.段落['1文だけの段落の割合'] > 0.3) add('warn', 'para-1sent', `1 文だけの段落が ${(M.段落['1文だけの段落の割合'] * 100).toFixed(0)}%（TS4）`);
  if (M.段落の頭の接続語の割合 > 0.35) add('warn', 'para-open', `段落の頭が接続語で始まる割合 ${(M.段落の頭の接続語の割合 * 100).toFixed(0)}%（測定 24%・4 段落に 1 つまで）（TS5）`);
  if (paraSent.length && paraSent.every(x => x >= 2 && x <= 4)) add('info', 'para-all-2to4', '全段落が 2〜4 文。そろいすぎは機械の形（TS4）');
}
if (bold.length) {
  if (M.太字['1000字あたり'] > 12) add('warn', 'bold-dense', `太字が 1000 字に ${M.太字['1000字あたり']}（測定 B1 約 6・全体 3）（TS9）`);
  if (M.太字.長さの最大 > 12) add('warn', 'bold-long', `太字の最長 ${M.太字.長さの最大} 字。用語の名前（9 字以下）だけにする（TS9）`);
  if (M.太字['1段落の最大'] > 2) add('warn', 'bold-per-para', `1 段落に太字 ${M.太字['1段落の最大']} 語（0〜2）（TS9）`);
}
if (heads.length) {
  if (M.見出し.最大 > 24) add('warn', 'head-long', `見出しの最長 ${M.見出し.最大} 字（節 20・項 8 を超える。測定の p90 は 21）（TS11）`);
  if (M.見出し.字数の中央値 > 14) add('warn', 'head-median', `見出しの中央値 ${M.見出し.字数の中央値} 字（測定 8）（TS11）`);
  if (M.見出し.名詞止めの割合 < 0.8) add('warn', 'head-noun', `名詞止めの見出し ${(M.見出し.名詞止めの割合 * 100).toFixed(0)}%（測定 90%）（TS11）`);
  if (M.見出し['1万字あたり'] > 30 && bodyChars > 2000) add('warn', 'head-dense', `見出し 1 万字に ${M.見出し['1万字あたり']}（教科書型は 11〜27）（TS12）`);
  if (heads.length >= 3 && M.見出し['1万字あたり'] < 6 && bodyChars > 4000) add('info', 'head-sparse', `見出し 1 万字に ${M.見出し['1万字あたり']}（測定 11 以上）（TS12）`);
}
if (bullets.length) add('info', 'bullets', `箇条書きのブロック ${bullets.length}（本文では使わない。要点・要件の列挙だけ。教科書型では point・要件の番号に限る）`);
if (json) console.log(JSON.stringify({ file, 測定: M, 所見: F }, null, 1));
else {
  console.log(`# ${file}\n字数 ${bodyChars}・段落 ${nP}・文 ${nS}・見出し ${heads.length}`);
  console.log(`文の長さ 中央値 ${M.文の長さ.中央値}・p90 ${M.文の長さ.p90}・変動係数 ${M.文の長さ.変動係数}・読点/文 ${M.読点_1文}`);
  console.log(`段落 字の中央値 ${M.段落.字の中央値}・文数の中央値 ${M.段落.文数の中央値}・頭の接続語 ${M.段落の頭の接続語の割合}`);
  console.log(`文末 ${JSON.stringify(M.文末)}`);
  console.log(`太字 ${JSON.stringify(M.太字)}・見出し ${JSON.stringify(M.見出し)}`);
  if (!F.length) console.log('所見なし（形の範囲内。正しさ・読みやすさは別に確かめる）');
  for (const f of F) console.log(`[${f.level}] ${f.id}: ${f.msg}`);
}
process.exit(F.some(f => f.level === 'error') ? 1 : 0);
