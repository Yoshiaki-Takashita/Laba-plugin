## 公式版（道具なし）での進め方

**最初に** `${CLAUDE_PLUGIN_ROOT}/skills/laba-textbook/scripts/textbook_page.py` があるかを確かめる。あれば（フル版）この節は飛ばし、下の手順どおり進める。**無ければ（公式版）**、下の `python3 …` は実行せず、次のとおりにする。

1. フォーマットは `formats/fam-f1.json`（・f2・f3）を読む（数値と構造だけの JSON）。スロットの要約は `references/page-slots.md`。字数の目安は、字詰め×行数（`base.chars`・`variants.<変種>.chars`×`base.lines`）。
2. 文章を役割に分けてスロットに入れるところまでは、そのまま行う（`references/rules-short.md`）。図の記述（`references/figure-spec.md` の G1〜G7）も同じ。**機械の検査は無い**ので、図は G7 の ①〜⑤ を手で 1 つずつ確かめ、キー名（`style`・`src`・`href`・`html` は使わない）・図の id の形・孤立ノード・辺の端の一致を目で見る。
3. .gnoto は Claude が直接書く。形は `references/output-format.md` の 3（`rows` に pid つきの文、`page` は箱が空のページの数だけ、`page2` に `fmt`・`pages`・`lite`・`figs`）。`pid` は `r_` ＋英小文字と数字 6 字で、重複させない。HTML は `<b>`・`<sup>`・段落だけにし、`&` `<` `>` はエスケープする。
4. 書いたら JSON として読み直し、ページの id が `page`・`page2.pages`・`page2.lite.pages` でそろっていること、`lite` の pid がすべて `rows` にあること、同じ pid が 2 回置かれていないこと、`lite` の入れ子が 5 段以内であることを確かめる。結果は「手作業で確かめた」と報告し、機械の検査（`check`）と GNOTO で開く確認は走らせていないと書く。
5. 図の SVG が要るときは、Claude がその場で SVG を直接書く（灰の濃さだけ・角丸と影は最小・矢印は向きが分かる形）。
