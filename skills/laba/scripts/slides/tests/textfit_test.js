#!/usr/bin/env node
// 改行の決まりの回帰試験。語・条文番号・判例の表記の途中で切らないこと、1〜2字だけの行を作らないことを確かめる。
// usage: node tests/textfit_test.js   （失敗があれば終了コード 1）
// 文は、独立の採点で実際に語の途中で折れた3枚（「…3号／551／頁）」「41条1項・2／項」「Y2に／は／抗弁」）と、見本で折れた語から採った。
"use strict";
const path = require("path");
const tf = require(path.join(__dirname, "..", "lib", "textfit"));
const CASES = [
  "必要的共同訴訟では、合一確定のため、弁論を分離することはできない（最判昭和43・3・8民集22巻3号551頁）",
  "◎同時審判の申出（41条1項・2項）があれば、弁論と裁判は分離できない",
  "代理権は、Y1には請求原因、Y2には抗弁として問題になる",
  "背信的行為と認めるに足りない特段の事情があるときは解除できない",
  "→ 要件をみたしているかを、建物が建て替えられた場合について検討する",
  "実権がY以外に移った場合にまで及ぶとは読めない",
  "{b:①}　そのうえで特段の事情を認めるという、{r:判断の順序}を示した",
  "個人で営んでいた店を会社にしただけで、使う人も使い方も変わらない場合",
];
// 切れてはいけない所（この文字列が、行をまたいで分かれてはいけない）
const KEEP = ["昭和43・3・8", "22巻3号551頁", "41条1項・2項", "Y1", "Y2", "特段の事情", "建て替え", "みたして", "請求原因", "背信的行為"];
let fail = 0, n = 0;
for (const text of CASES) {
  for (let w = 10; w <= 40; w += 1) {
    const lines = tf.wrapLine(text, w);
    const plain = lines.map((l) => tf.strip(l).replace(/^[ 　]+/, ""));
    n++;
    // 1) 行の幅が上限を超えない
    plain.forEach((l, i) => { if (tf.textW(l) > w + 0.01 && !lines.bad) { fail++; console.log(`幅超過 w=${w}: ${l}`); } });
    // 2) 切らない語が行をまたがない（語の途中で切ったと自己申告した場合 bad>0 は、作成側が警告して止めるので除く）
    if (!lines.bad) {
      const joined = plain.join("\u0001");
      for (const k of KEEP) {
        if (!tf.strip(text).includes(k)) continue;
        for (let i = 1; i < k.length; i++) if (joined.includes(k.slice(0, i) + "\u0001" + k.slice(i))) { fail++; console.log(`語の途中 w=${w}: 「${k}」 ← ${plain.join("／")}`); }
      }
      // 3) 1〜2字だけの行がない
      if (plain.length > 1) plain.forEach((l) => { if (l.replace(/[、。，．）」』（「『・…\s　]/g, "").length <= 2) { fail++; console.log(`短い行 w=${w}: ${plain.join("／")}`); } });
      // 4) 行頭の禁則
      plain.slice(1).forEach((l) => { if ("、。，．・）」』】：；".includes(l[0])) { fail++; console.log(`行頭の禁則 w=${w}: ${plain.join("／")}`); } });
    }
  }
}
// 和文と英数字の境の空き：境のある文字列は、境のない同じ字数の文字列より広い
if (!(tf.textW("民法612条2項") > tf.textW("民法") + tf.textW("612") + tf.textW("条") + tf.textW("2") + tf.textW("項") - 1e-9 + 0.9)) { fail++; console.log("和文と英数字の境の空きが足されていない"); }
console.log(`textfit の回帰試験：${n} 通りを調べ、失敗 ${fail} 件`);
process.exit(fail ? 1 : 0);
