---
name: laba-textbook
description: 教科書どおりの紙面を作る。文章を役割（本文・事例・補足・要点・図）に分け、教科書の組みの規則で GNOTO の紙面ノート（.gnoto・スロットと文だけ）に書き出し、文章から教科書の図（フロー・木・表・年表・関係図など）の記述を作って検査する。「教科書のように組んで」「教科書の配置で」「教科書風の紙面に」「図を教科書の形式で」「紙面ノートにして」と頼まれたときに使う。Word の講義ノートは laba、PowerPoint は laba-slides。
---

# 教科書どおりの紙面（Laba）

Laba が作った（または利用者が渡した）文章を、**教科書の組みの規則**で紙面にする。座標・色・書体は書かない：Laba は「どの役割の文を、どのスロットに入れるか」だけを決め、組み方（位置・大きさ・柱）は GNOTO がフォーマットから決める。

## 学習の中身（画像も本文も持たない）

数値・構造・言語化した規則だけ（`references/learning.md`）。フォーマットは `formats/`（F1 法学教科書・F2 UNIT 型・F3 入門書。測定値の中央値・変種の差分・スロット）。**教科書の文章・図の中の語は書き写さない。** 新しい本の画像を受け取ったときの手順も `references/learning.md` にある。

## 読む順と量（毎回全部は読まない）

1. 毎回：`references/rules-short.md`（20 行）と `references/page-slots.md`（スロットの要約）。
2. 文を書くとき：`references/text-structure.md`（量と順序の 1 枚。本体は reportkiller の `textbook-prose.md`）。置き場所・ページの種類・容量の判断：`references/placement-judgment.md`。
3. 図を作るとき：`references/figure-spec.md` の 2 章と 4 章。
4. 出力の形・GNOTO での現状を確かめるとき：`references/output-format.md`（v:2 は 7）。座標つきで直接 page2 に出す手順：`references/page2-direct.md`（部品・箱の座標・検査 `scripts/page2_direct_check.py`・骨組み `templates/page2-types.json`）。
5. 規則の根拠・例外：`references/rules.md` の該当の章だけ。
`formats/*.json` の全文は渡さない（要約は `textbook_page.py slots`）。

## 手順

1. **内容を先に作る**：本文は laba・reportkiller の規則で書く（引用・出典の確認はそちらの規則。この手順は組み方だけ）。出典・条文・判例を、確認していないまま紙面に入れない。
2. **フォーマットを決める**：`python3 ${CLAUDE_PLUGIN_ROOT}/skills/laba-textbook/scripts/textbook_page.py formats`。利用者が指定しなければ、F1 の b1（測定済み）。変種が `provisional` なら、見た目を確かめきれていないと伝える。
3. **スロットを読む**：`… textbook_page.py slots --format fam-f1 --variant b1`（字数の目安つき）。
4. **文章を役割に分ける**（量と順序は `text-structure.md`）：1 段落＝1 役割（本文・事例＝box・補足＝aside・要点＝point・図＝fig）。章の頭は `chapter` ページ（`title`・`overview`）。規則は `rules-short.md`。
5. **図を作る**（条件に当たるときだけ）：`figure-spec.md` の G1〜G7。記述を JSON にして `figure_check.py` を通し、`figure_svg.py` で SVG にして目で見る。
6. **入力 JSON を書く**：形は `output-format.md` の 2。スロットは読む順。節・項・図・注の番号は書かない。
7. **書き出して検査する**：`… textbook_page.py build --in input.json --out ノート名.gnoto`（誤りがあれば書かない。警告は読む）。`… textbook_page.py check ノート名.gnoto`。字数の超過・仮の変種・使われない図などの警告は、報告に書く。
8. **スロットの一覧を見る**：`… textbook_page.py preview ノート名.gnoto 一覧.html`。**これは組んだ後の見た目ではない**。
9. **渡す**：`.gnoto` を渡し（Claude の中の GNOTO Lite は normal と slide だけで、紙面は開けない）、`output-format.md` の 4 のとおり、GNOTO で開いたときの現状（箱の解決は GNOTO の版しだい・未配置で出ることがある）を一言添える。返事を終える前に、成果物を必ず渡す（点検は同じ返事の中で）。

## 報告に必ず書く

- 使ったフォーマット・変種と、その状態（measured／provisional）。
- 警告（字数・使われない図・知らないスロット）と、直したもの・残したもの。
- 走らせなかった検査：GNOTO で実際に開いて見た目を確かめたか（チャットでは開けない＝「確かめていない」）、図の SVG を目で見たか、図の根拠（G7 の②）を点検者が見たか。
- 分からないことは「不明」。「問題なし」と書かない。

## 道具（Python 3 の標準ライブラリだけ・ネットに接続しない）

| 道具 | 役目 |
|---|---|
| `scripts/textbook_page.py` | `formats`・`slots`・`build`（v:1 スロット）・`build2`（v:2 読む順の塊。laba-book の章から。`page_v2.py`）・`check`・`preview` |
| `scripts/figure_check.py` | 図の記述の検査（型・規模・長さ・辺の端・孤立・GNOTO が落とす形・本文との突き合わせ）と、SVG の形式と幾何の検査（`--svg`：色・文字の重なり・はみ出し・文字に掛かる線・縦横比・余白） |
| `scripts/figure_svg.py` | 図の記述から灰の濃さだけの SVG（10 型・幅は傍注 154／本文 600／張り出し 790） |
| `scripts/page2_direct_check.py` | 座標つきで直接書いた紙面ノートの形の検査（部品の名前・矩形が紙の中・id の対応・行の存在）。`references/page2-direct.md` |
| `schema/` | 入力・図・page2 のスキーマ（座標・色・`html`・`style` は拒否） |
| `samples/` | 見本（意味のない文）：`f1-b1-input.json`・`figs-examples.json` |
| `tests/` | `python3 -m unittest discover -s skills/laba-textbook/tests`（開発用の main にだけある） |

## 他のスキルとの使い分け

- laba（本体）：Word の講義ノート。内容の規則（網羅・引用台帳・点検）はそちら。教科書の紙面にしたいときに、この手順へ渡す。
- gnoto-lite：ノーマル・スライドの .gnoto。紙面（style=page）はここ。
- laba-figures：Word・PDF 用の図（25 型・三色・PNG）。教科書の紙面用の図の記述はこのスキル。
- reportkiller：レポート・論文。図・配置を教科書どおりにしたいときは、本文を書いたあとにこのスキルへ。
