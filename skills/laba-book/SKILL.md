---
name: laba-book
description: 単語・分野・資料つきの題から、教科書の章（文章・図・紙面）を一続きで作り、続きの章を足していく。範囲 → 構成 → 本文 → 図 → 紙面（GNOTO の .gnoto）の順で、本文は教科書の文の数（文の長さ・段落・見出し・強調）に合わせ、道具で測って直す。「〜の教科書を作って」「〜について教科書の章を」「この分野の入門書を」「この資料から教科書の 1 節を」「続きの章を」と頼まれたときに使う。紙面の組みの規則と v:1（スロット）は laba-textbook、Word の講義ノートは laba、レポート・論文は reportkiller。
---

# 教科書の生成（Laba の本）

単語・分野・資料つきの題から、**教科書の章**を作る。1 回の呼び出しで **1 章**（重ければ 1 節）。本の状態は `book.json` に持ち、次の回はそれを読んで続ける。
この版（L4）でできるのは **文章・図・紙面まで**（P0 依頼の形・P1 範囲・P2 構成・P3 出典の台帳・P4 本文・P5 図・P6 紙面）。資料なしの題（単語・分野）は、標準の章立てを確認先つきで立て（P1）、主張ごとに台帳の ID を持つ（P3）。図は本文から「図にするか」を判断し、型・要素・SVG・検査のループで作る（P5）。紙面（P6）は `book_state.py page` で GNOTO の紙面ノート（v:2 読む順の塊）にする（`references/page.md`）。

## 1. 読む順（毎回全部は読まない）

| いつ | 読むもの |
|---|---|
| 最初の回 | `references/intake.md`（依頼の形・既定・`topic.json`） |
| 資料なしの題の範囲（単語・分野） | `references/scope.md`（標準の章立て・確認先・概念の地図 `map.json`） |
| 出典を確かめるとき（資料なしの題） | `references/sources.md`（台帳 V0〜V3・未確認の行・主張の印 `[R01]`・法学はコネクタ） |
| 構成を作るとき | `references/outline.md`（章立て・`outline.json`） |
| 図の候補を決めるとき | `references/figure-judgment.md`（判断の 12 行・今使える型） |
| 本文を書くとき | `references/writer-brief.md`（数の目標。担当に渡す） |
| 図を作るとき（本文の後） | `references/figures.md`（P5 のループ・置き場・`book_state.py figs`）と laba-textbook `references/figure-spec.md`（記述の欄） |
| 紙面にするとき（図の後） | `references/page.md`（P6・`book_state.py page`） |
| 2 回目以降・続きの章 | `references/book-state.md`（`book.json` の形と続け方）。**前の章の本文は読み直さない** |
| 文の規則の根拠が要るときだけ | `${CLAUDE_PLUGIN_ROOT}/skills/reportkiller/references/textbook-prose.md` の該当の節 |

法学の章で条文・判例を本文に出すときだけ、`${CLAUDE_PLUGIN_ROOT}/skills/laba/references/connector.md` と担当 `verifier` を使う。それ以外では laba 本体の文書を読まない。

## 2. 手順

1. **P0 依頼の形**：`intake.md` のとおり、題の種類（単語・分野・資料つき）・読者の段・分量・言語を 1 回だけまとめて聞く。聞けない（自動・急ぎ）ときは既定で進め、報告に既定を書く。
2. **作業の場所**：`work/` を作り、`python3 ${CLAUDE_PLUGIN_ROOT}/skills/laba-book/scripts/book_state.py init work/book.json --seed "<題>" --kind <word|field|sourced> --level ug`。資料があれば `work/source.txt` に置く。続きの回は `book_state.py next work/book.json` で次の章を知る。
3. **P1 範囲**：資料つきの題は `outline.md` 1。資料なしの題は `scope.md` のとおり、標準の章立てを種類の違う 2 つ以上の確認先で見て `work/map.json` を書き、`book_state.py map work/map.json --ledger work/ledger.tsv` で検査する。
4. **P3 出典の台帳**（資料なしの題）：`sources.md` のとおり、書く節の主張の根拠を確かめて `work/ledger.tsv` に行を作る（V0 は載せない。確かめられないものは未確認の行にし、本文に書かない）。`book_state.py ledger work/ledger.tsv` で検査する。
5. **P2 構成**：`outline.md` 2〜3 のとおり `work/ch<n>/outline.json` を書き（図の候補は `figure-judgment.md`）、`book_state.py outline work/ch<n>/outline.json` で検査する（誤りが 0 になるまで直す）。
6. **P4 本文**：節ごとに担当 `textbook-writer` を 1 人ずつ同時に立てる。渡すのは、節の id・`outline.json` の場所・`writer-brief.md` の場所・資料（その節の分）か台帳（`work/ledger.tsv`）・術語表（`work/glossary.json`）だけ。担当が立てられない環境（チャット）では、自分で `writer-brief.md` の手順を節ごとに行う。
7. **測って直す**：各節は `book_state.py gate work/ch<n>/s1.md --level ug` が通るまで直す（担当の中で最大 2 回）。資料なしの題は `book_state.py claims work/ch<n>/s1.md --ledger work/ledger.tsv` も通す（台帳に無い ID・未確認や V2 を根拠にした文・ID の無い主張の候補が 0）。2 回で通らない項目は直さずに残し、報告に書く（点数を上げるための書き直しをしない）。
8. **P5 図**：`figures.md` のとおり、書いた本文を読み直して図にするかを決め（`figure-judgment.md` の 12 行）、候補ごとに型 → 要素（`work/ch<n>/figs.json`）→ `figure_svg.py` で描く（記述と幾何の検査）→ 本文に `:::fig id=… kind=…` を置く。`book_state.py figs work/ch<n>` が誤り 0 で通るまで直す（2 回で直らない図はやめ、`fig.dropped` に理由）。
9. **章にまとめる**：節を順に `work/ch<n>/chapter.md` に連ね、`book_state.py chapter work/book.json --no <n> --status done --title "<章の題>" --summary "<要点 3〜5 項目を ; で>"` で状態を更新する。術語は `glossary.json` に足す（表記をそろえる）。
10. **P6 紙面**：`page.md` のとおり `book_state.py page work/ch<n> --out out/book-ch<n>.gnoto --plan work/ch<n>/plan.json`。誤り 0 で書けるまで直す（見積りのために本文を削らない）。
11. **渡す**：章の本文（役割の印つき Markdown。`[R01]` の印は `claims --strip` で外す）と台帳と図（`figs.json`・`figs/*.svg`）と紙面（`.gnoto`）を渡す。返事を終える前に、成果物を必ず渡す。

## 3. 守ること（破ると誤りに直結する）

- **資料にない事実・数・条文・判例・人名・年を足さない**。資料つきの題は資料の範囲だけで書き、分からないことは「不明」と書く。資料なしの題は、**台帳の ID の無い主張を書かない**（`sources.md` 1）。V0（記憶のみ）は台帳に載せない。見つからない・開けないことを「存在しない」と書かない（未確認の行にする）。
- 本文は**役割の印つき Markdown**（`outline.md` 3）。座標・色・書体は書かない。
- 数の目標は `writer-brief.md` の表（元は `textbook-prose.md` §1）。目標に合わせるために、内容のない文を足さない。
- 作業の記録（読んだ・測った・直した）を本文に書かない。報告にだけ書く。

## 4. 報告に必ず書く

- 題の種類・段・既定で決めたこと。章と節の数・本文の字数。
- 節ごとの `gate` の結果（通った項目・通らなかった項目と理由）。直した回数。
- 資料なしの題：標準の章立ての確認先・台帳の行の数（V3・V1・V2・未確認）・`claims` の結果（ID の無い主張の候補の数）。コネクタが無かった・ウェブが使えなかったときは、その旨と未確認の数を冒頭に。
- 図：候補の数・図にした数（型ごと）・やめた数と理由・`figs` の記述と SVG の誤りと警告の数。図の点検者を立てたか（立てないなら「自己点検」）。
- 紙面：本の型・ページ数・ページごとの見積りの行・分けた段落と送った図の数・GNOTO で開いて見たか（開けなければ「見た目は確かめていない」）。
- 走らせなかった検査（出典の確認・図の点検者・紙面を GNOTO で開くこと・人の採点）と理由。分からないことは「不明」。「問題なし」と書かない。

## 5. 他のスキル・担当の使い分け

| 工程 | 使うもの |
|---|---|
| 文の規則（教科書型） | reportkiller `references/textbook-prose.md`・道具 `scripts/textbook_check.js`（`gate` が中で呼ぶ） |
| 出典の確認（法学） | 担当 `verifier`・laba `references/connector.md` |
| 出典の台帳（資料なしの題） | `references/sources.md`・`book_state.py ledger`／`claims`（元の規則は reportkiller `citation-ledger.md`） |
| 図 | 判断は `references/figure-judgment.md`、手順は `references/figures.md`、記述の欄・描き手・検査は laba-textbook（`figure-spec.md`・`figure_svg.py`・`figure_check.py`） |
| 紙面 | `book_state.py page`（中で laba-textbook の `page_v2.py`・`textbook_page.py check`）。手で組むスロット方式（v:1）は laba-textbook |
| 独立の点検 | 担当 `style-reviewer`（文体）・`added-text-reviewer`（資料にない文） |
