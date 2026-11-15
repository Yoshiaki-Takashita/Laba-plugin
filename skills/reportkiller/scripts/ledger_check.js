#!/usr/bin/env node
/* ledger_check.js — 引用台帳（ID | 書誌 | URL | V0〜V3 | 使い方）と本文の突き合わせ（reportkiller）。依存なし。
 *   node ledger_check.js 本文.txt [--ledger 台帳.txt] [--level grad] [--json]
 * 見るもの：V0 の行／ID の重複／本文で引いたのに台帳に無い ID／台帳にあって本文で使わない行／V3 でない行への「」引用と頁数／同じ ID の頁数の食い違い／
 *   V2 以上で URL が空（論文・学会）／使い方の欄の印／段ごとの文献数・V1 の上限・V3 の下限・一次か査読の数。
 * 引用の実在と書誌の正しさは確かめない（URL を開き直すのは人か別の道具）。 */
'use strict';
const fs = require('fs'), path = require('path');
const R = require(path.join(__dirname, 'report_check.js'));
const a = process.argv.slice(2), opt = {}, files = [];
for (let i = 0; i < a.length; i++) { const k = a[i]; if (k === '--ledger' || k === '--level') opt[k.slice(2)] = a[++i]; else if (k === '--json') opt.json = true; else files.push(k); }
if (!files.length) { console.log('使い方: node ledger_check.js 本文.txt [--ledger 台帳.txt] [--level 段] [--json]'); process.exit(2); }
const text = fs.readFileSync(files[0], 'utf8');
const led = R.parseLedger(text);
const rows = led.rows.concat(opt.ledger ? R.parseLedger(fs.readFileSync(opt.ledger, 'utf8')).rows : []);
const prose = led.rest;
const lv = R.LEVELS.find(l => l.id === (R.levelOf(opt.level) || R.DEFAULT_LEVEL)), th = lv.th;
const out = [];
const add = (rule, severity, message, at) => out.push({ rule, severity, message, at: at || '' });
if (!rows.length) add('ledger-missing', 'error', '台帳の行（ID | 書誌 | URL | V0〜V3 | 使い方）が見つからない');
const byId = {}, dup = [];
rows.forEach(r => { if (byId[r.id]) dup.push(r.id); byId[r.id] = r; });
if (dup.length) add('ledger-dup', 'error', 'ID の重複：' + dup.join('・'));
rows.filter(r => r.v === 0).forEach(r => add('ledger-v0', 'error', 'V0（記憶のみ）：' + r.id + '（書かない。台帳からも外す）', r.bib));
/* 本文で使った ID：（ID）・（ID 12頁）・[ID]・ID: のどれか */
const used = {}, pages = {};
const reRef = /[（(［\[]\s*([A-Za-z][A-Za-z0-9_.\-]{0,23})\s*(?:[,，、:：]?\s*(?:p\.?|pp\.?|頁|第)?\s*([0-9０-９]{1,4}(?:\s*[-–〜]\s*[0-9０-９]{1,4})?)\s*(?:頁|ページ|頁以下|f\.|ff\.)?)?\s*[）)］\]]/g;
let m;
while ((m = reRef.exec(prose))) { const id = m[1]; if (!byId[id]) { if (/^[A-Z][0-9]/.test(id) || /^(?:R|S|E|L|C)\d/.test(id)) add('ref-unknown', 'error', '本文で引いた ID が台帳に無い：' + id, m[0]); continue; } used[id] = (used[id] || 0) + 1; if (m[2]) { pages[id] = pages[id] || {}; pages[id][m[2].replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xfee0)).replace(/\s/g, '')] = 1; } }
rows.forEach(r => { if (!used[r.id] && r.v >= 1) add('ledger-unused', 'info', '台帳にあるが本文で引いていない：' + r.id + '（参考文献に残すなら V2 以上で、本文で触れたものだけにする）', r.bib); });
/* V3 でない行への「」と頁 */
let q; const reQ = /「[^」]{2,}」\s*[（(［\[]\s*([A-Za-z0-9][A-Za-z0-9_.\-]{0,23})[^）)］\]]{0,24}[）)］\]]/g;
while ((q = reQ.exec(prose))) { const r = byId[q[1]]; if (r && r.v < 3) add('quote-low-v', 'error', 'V' + r.v + ' の文献に「」の引用：' + q[1] + '（「」は原文を読んだ V3 だけ）', q[0]); }
Object.keys(pages).forEach(id => { const r = byId[id]; if (r && r.v < 3) add('page-low-v', 'warn', 'V' + r.v + ' の文献に頁数：' + id + '（頁は V3 か、利用者が貼った資料にあるときだけ）'); });
/* 同じ ID の頁数の食い違い（ひとつの文献を 3 か所以上で、すべて違う頁で引く → 確かめる候補） */
Object.keys(pages).forEach(id => { const ps = Object.keys(pages[id]); if (ps.length >= 3) add('page-spread', 'info', id + ' の頁数が ' + ps.length + ' 通り（' + ps.join('・') + '）。台帳の書誌の頁と照合する'); });
/* 段の要求 */
const n = rows.length, v1 = rows.filter(r => r.v === 1).length, v3 = rows.filter(r => r.v === 3).length, tagged = rows.filter(r => r.core || r.primary || r.peer || r.secondary || r.textbook).length;
if (n && n < th.ledgerMin) add('ledger-count', 'error', '文献 ' + n + ' 件（' + lv.name.ja + 'の段は ' + th.ledgerMin + ' 件以上）');
if (n && v1 / n > th.v1Max) add('ledger-v1', 'error', 'V1 が ' + Math.round(v1 / n * 100) + '%（この段は ' + Math.round(th.v1Max * 100) + '% まで）');
if (n && th.v3Min > 0 && v3 / n < th.v3Min) add('ledger-v3', 'warn', 'V3 が ' + Math.round(v3 / n * 100) + '%（この段は ' + Math.round(th.v3Min * 100) + '% 以上）');
rows.filter(r => r.core && r.v < 3).forEach(r => add('ledger-core', th.coreV3 === 'none' ? 'info' : th.coreV3, '【中心】の文献が V3 でない：' + r.id + '（V' + r.v + '）'));
if (th.primaryMin > 0) { if (!tagged) add('ledger-tags', 'info', '使い方の欄に【中心】【一次】【査読】の印が無く、一次か査読の数（' + th.primaryMin + ' 件以上）を数えられない'); else { const pp = rows.filter(r => r.primary || r.peer).length; if (pp < th.primaryMin) add('ledger-primary', 'error', '一次資料か査読論文が ' + pp + ' 件（この段は ' + th.primaryMin + ' 件以上）'); } }
if (lv.order >= 5) rows.filter(r => r.v >= 2 && !/\S/.test(r.url)).forEach(r => add('ledger-url', 'warn', '確認に使った URL が空：' + r.id));
rows.filter(r => r.v === 2 && used[r.id] >= 2).forEach(r => add('v2-used', 'info', 'V2（書誌だけ）の文献を本文で ' + used[r.id] + ' 回引いている：' + r.id + '（V2 は参考文献に載せるだけで中身を書かない。読めたなら V3 に上げる）'));
const order = { error: 0, warn: 1, info: 2 }; out.sort((x, y) => order[x.severity] - order[y.severity]);
const nE = out.filter(x => x.severity === 'error').length;
if (opt.json) console.log(JSON.stringify({ level: lv.id, rows: n, byV: [0, 1, 2, 3].map(v => rows.filter(r => r.v === v).length), used: Object.keys(used).length, pass: nE === 0, findings: out }, null, 1));
else {
  console.log('台帳 ' + n + ' 件（V3 ' + v3 + '・V2 ' + rows.filter(r => r.v === 2).length + '・V1 ' + v1 + '・V0 ' + rows.filter(r => r.v === 0).length + '）・本文で引いた ID ' + Object.keys(used).length + '・段 ' + lv.id + ' → ' + (nE ? 'error ' + nE : '通過'));
  out.forEach(x => console.log('  ' + x.severity + ' [' + x.rule + '] ' + x.message + (x.at ? '  ← ' + String(x.at).slice(0, 60) : '')));
}
process.exit(nE ? 1 : 0);
