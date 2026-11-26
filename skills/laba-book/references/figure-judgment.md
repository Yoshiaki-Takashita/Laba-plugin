# 図にするか・どの型か（構成の `fig` を決めるときの判断の 12 行）

`outline.json` の節の `fig` を決めるときに読む。描き方・記述の形は laba-textbook の `references/figure-spec.md`（G1〜G7）。この 12 行は G1〜G7 の前に置く「選ぶ・選ばない」の判断で、元は GLYPH 側の図の設計（76 図の分析）の案。

```
図は「文で追いにくい」ときだけ。1 文で言えるなら作らない。本文のあるページに図は 1 つまで。
前と後・説の違いで関係が変わる → compare（面 2〜3・同じ当事者は同じ位置・消えた者も残す）。1 枚の relation に詰めない。
数の推移・内訳 → chart（本文の数だけ・単位と出典を書く・格子と凡例は描かない）。数を作らない。
「強い〜弱い」の順序だけ → scale（項目 2〜5・位置は順序の印で値ではない）。
分類は tree：並べて束ねるだけなら brace、要件の組み立てなら bracket。flow にしない（矢印は順序に見える）。
はい／いいえの分岐 2 回以上 → flow（実線＝はい・点線＝いいえ・段 5 を超えたら束ねる）。
図の中の語は本文の語そのまま・4〜8 字（長くて 15 字）。図題は名詞句（番号込み 12〜34 字）。
色は灰の濃さだけ。強調（key）は 1 図に 1 つ。凡例を作らず、記号の意味は注の 1 行で。
表と横に長い図は張り出し幅、傍注の場面の絵は side、他は本文幅。
図は参照する段落の直後に置き、本文では図が何を示すかを 1 文で 1 回だけ言う。
決められない・語が本文に無い・根拠の文が無い → 作らない。
出す前に figure_check（記述）→ figure_svg（描く）→ 幾何の検査。通らなければ直すか作らない。
```

## この版で使える型と、まだ使えない型

- **使える型は 10**：`flow`・`tree`（`treeStyle`＝`bracket`・`brace`・`nested`・`region`）・`table`・`matrix`・`timeline`・`concept`・`relation`・`compare`・`chart`・`scale`（laba-textbook の `figure.schema.json`。記述の検査・描き手・幾何の検査がある）。
- **まだ描けない型**：`scene`・`venn`・`family`・`ledger`。当たったら `fig` に `"want": "venn"` のように残し、`kind` は近いもの（venn → `table`・ledger → `table`・scene → 図にしない）か、図をやめて `"dropped": "型が無い"`。**当たらない型に無理に入れない**。
- 紙面（GNOTO の `pgFigSVG`）が compare・chart・scale・tree の brace／region を描くかは GNOTO の版による（描き手は別の担当が足す）。描けない版の GNOTO では、その図は空の枠になる［不明：版ごとに未確認］。`figure_svg.py` の SVG はどの版でも見られる。
- chart は「本文の数」が資料の数か、台帳の ID つきで確かめた数のときだけ（`sources.md` 1）。
- 図にする手順（描く・検める・本文に置く）は `figures.md`。
