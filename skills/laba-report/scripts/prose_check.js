#!/usr/bin/env node
/* prose_check.js — 本文の文体・構成・台帳を、レベル（段）としきい値の型で点検する（laba-report）。依存なし。
 *   node prose_check.js [--level ug|grad|paper|...] [--lang ja|en] [--field law|imrad|hum] [--ledger 台帳.txt] [--json] 本文.txt
 * 中身は同じフォルダの report_check.js（しきい値の唯一の元は references/levels.md）。
 * 所見は「直す候補」。内容の正しさ・引用の実在・数値の再計算は判定しない。人の文を「AI が書いた」と判定する道具ではない。 */
'use strict';
const fs = require('fs'), path = require('path');
const R = require(path.join(__dirname, 'report_check.js'));

function usage() {
  console.log('使い方: node prose_check.js [--level 段] [--lang ja|en] [--field law|imrad|hum] [--ledger 台帳.txt] [--json] 本文.txt\n' +
    '  段: ' + R.LEVELS.map(l => l.id + '=' + l.name.ja).join('・') + '（省けば ' + R.DEFAULT_LEVEL + '）\n' +
    '  型: 日本語は 高校生=意見文・学部生=発表レジュメ・大学院生以上=論文。英語は段ごと（references/levels.md §3）');
}
const a = process.argv.slice(2), opt = {}, files = [];
for (let i = 0; i < a.length; i++) {
  const k = a[i];
  if (k === '--level' || k === '--lang' || k === '--field' || k === '--ledger') opt[k.slice(2)] = a[++i];
  else if (k === '--json') opt.json = true;
  else if (k === '-h' || k === '--help') { usage(); process.exit(0); }
  else files.push(k);
}
if (!files.length) { usage(); process.exit(2); }
if (opt.level && !R.levelOf(opt.level)) { console.error('知らないレベル: ' + opt.level); usage(); process.exit(2); }
const ledger = opt.ledger ? fs.readFileSync(opt.ledger, 'utf8') : undefined;
let exitCode = 0;
files.forEach(f => {
  const text = fs.readFileSync(f, 'utf8');
  const r = R.checkReport(text, { level: opt.level, lang: opt.lang, field: opt.field, ledger });
  if (r.errors) exitCode = 1;
  if (opt.json) { console.log(JSON.stringify(r, null, 1)); return; }
  const S = r.stats;
  console.log('== ' + f + ' — レベル ' + r.level + '（' + r.level_name.ja + '）・' + r.lang + '・型 ' + r.profile + '・分野 ' + r.field + ' — ' + (r.pass ? '通過（error 0）' : 'error ' + r.errors) + '・warn ' + r.warnings);
  const s = S.sentences;
  console.log('文 ' + s.n + '・平均 ' + s.avg + ' ' + s.unit + '・中央値 ' + s.median + '・変動係数 ' + s.cv + '・' + (r.lang === 'ja' ? '100 字超 ' : '40 語超 ') + s.over + '（' + Math.round(s.overRatio * 100) + '%）' + (r.lang === 'en' ? '・10 語未満 ' + Math.round(s.shortRatio * 100) + '%' : '') +
    '／段落 ' + S.paragraphs.n + '・2〜4 文 ' + Math.round(S.paragraphs.okRatio * 100) + '%・1 文 ' + Math.round(S.paragraphs.oneRatio * 100) + '%' +
    (S.endings && S.endings.plainRatio != null ? '／語尾 4 形 ' + Math.round(S.endings.plainRatio * 100) + '%・推量と問い ' + Math.round(S.endings.inferRatio * 100) + '%' : '') +
    (S.hedge ? '／ヘッジ ' + S.hedge.per1000 + '／1,000' : '') + '／台帳 ' + S.ledger.n + ' 件（V3 ' + S.ledger.byV[3] + '・V2 ' + S.ledger.byV[2] + '・V1 ' + S.ledger.byV[1] + '・V0 ' + S.ledger.byV[0] + '）' +
    (S.machineSignals ? '／目印 ' + (S.machineSignals.length ? S.machineSignals.join('・') : 'なし') : '') + (S.claudeSignals != null ? '／Claude の印 ' + S.claudeSignals + '／窓 ' + JSON.stringify(S.windows.hits) : ''));
  ['error', 'warn', 'info'].forEach(sv => {
    const fl = r.findings.filter(x => x.severity === sv); if (!fl.length) return;
    console.log('-- ' + sv + ' (' + fl.length + ')');
    fl.forEach(x => console.log('  [' + x.rule + '] ' + x.message + (x.at ? '  ← ' + x.at : '')));
  });
  console.log(r.note);
});
process.exit(exitCode);
