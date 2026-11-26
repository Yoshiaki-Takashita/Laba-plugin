---
name: laba-book
description: 単語・分野・資料つきの題から、教科書の章（文章）を一続きで作り、続きの章を足していく。範囲 → 構成 → 本文の順で、本文は教科書の文の数（文の長さ・段落・見出し・強調）に合わせ、道具で測って直す。「〜の教科書を作って」「〜について教科書の章を」「この分野の入門書を」「この資料から教科書の 1 節を」「続きの章を」と頼まれたときに使う。紙面（.gnoto）に組むのは laba-textbook、Word の講義ノートは laba、レポート・論文は reportkiller。
---

# 教科書の生成（Laba の本）

単語・分野・資料つきの題から、**教科書の章**を作る。1 回の呼び出しで **1 章**（重ければ 1 節）。本の状態は `book.json` に持ち、次の回はそれを読んで続ける。
この版（L1）でできるのは **文章まで**（P0 依頼の形・P1 範囲〔資料つきは資料の範囲〕・P2 構成・P4 本文）。出典の台帳（P3）・図（P5）・紙面（P6）は既存のスキルへ渡す（下の 5）。

## 1. 読む順（毎回全部は読まない）

| いつ | 読むもの |
|---|---|
| 最初の回 | `references/intake.md`（依頼の形・既定・`topic.json`） |
| 構成を作るとき | `references/outline.md`（範囲と章立て・`outline.json`） |
| 本文を書くとき | `references/writer-brief.md`（数の目標。担当に渡す） |
| 2 回目以降・続きの章 | `references/book-state.md`（`book.json` の形と続け方）。**前の章の本文は読み直さない** |
| 文の規則の根拠が要るときだけ | `${CLAUDE_PLUGIN_ROOT}/skills/reportkiller/references/textbook-prose.md` の該当の節 |

法学の章で条文・判例を本文に出すときだけ、`${CLAUDE_PLUGIN_ROOT}/skills/laba/references/connector.md` と担当 `verifier` を使う。それ以外では laba 本体の文書を読まない。

## 2. 手順

1. **P0 依頼の形**：`intake.md` のとおり、題の種類（単語・分野・資料つき）・読者の段・分量・言語を 1 回だけまとめて聞く。聞けない（自動・急ぎ）ときは既定で進め、報告に既定を書く。
2. **作業の場所**：`work/` を作り、`python3 ${CLAUDE_PLUGIN_ROOT}/skills/laba-book/scripts/book_state.py init work/book.json --seed "<題>" --level ug`。資料があれば `work/source.txt` に置く。続きの回は `book_state.py next work/book.json` で次の章を知る。
3. **P1 範囲・P2 構成**：`outline.md` のとおり `work/ch<n>/outline.json` を書き、`book_state.py outline work/ch<n>/outline.json` で検査する（誤りが 0 になるまで直す）。
4. **P4 本文**：節ごとに担当 `textbook-writer` を 1 人ずつ同時に立てる。渡すのは、節の id・`outline.json` の場所・`writer-brief.md` の場所・資料（その節の分）・術語表（`work/glossary.json`）だけ。担当が立てられない環境（チャット）では、自分で `writer-brief.md` の手順を節ごとに行う。
5. **測って直す**：各節は `book_state.py gate work/ch<n>/s1.md --level ug` が通るまで直す（担当の中で最大 2 回）。2 回で通らない項目は直さずに残し、報告に書く（点数を上げるための書き直しをしない）。
6. **章にまとめる**：節を順に `work/ch<n>/chapter.md` に連ね、`book_state.py chapter work/book.json --no <n> --status done --title "<章の題>" --summary "<要点 3〜5 項目を ; で>"` で状態を更新する。術語は `glossary.json` に足す（表記をそろえる）。
7. **渡す**：章の本文（役割の印つき Markdown）を渡し、紙面にするなら laba-textbook へ。返事を終える前に、成果物を必ず渡す。

## 3. 守ること（破ると誤りに直結する）

- **資料にない事実・数・条文・判例・人名・年を足さない**。資料つきの題は資料の範囲だけで書き、分からないことは「不明」と書く。資料なしの題は、確かめられない事実を断定しない（出典の台帳は reportkiller の `citation-ledger.md`。V0 は書かない）。
- 本文は**役割の印つき Markdown**（`outline.md` 3）。座標・色・書体は書かない。
- 数の目標は `writer-brief.md` の表（元は `textbook-prose.md` §1）。目標に合わせるために、内容のない文を足さない。
- 作業の記録（読んだ・測った・直した）を本文に書かない。報告にだけ書く。

## 4. 報告に必ず書く

- 題の種類・段・既定で決めたこと。章と節の数・本文の字数。
- 節ごとの `gate` の結果（通った項目・通らなかった項目と理由）。直した回数。
- 走らせなかった検査（出典の確認・図・紙面・人の採点）と理由。分からないことは「不明」。「問題なし」と書かない。

## 5. 他のスキル・担当の使い分け

| 工程 | 使うもの |
|---|---|
| 文の規則（教科書型） | reportkiller `references/textbook-prose.md`・道具 `scripts/textbook_check.js`（`gate` が中で呼ぶ） |
| 出典の確認（法学） | 担当 `verifier`・laba `references/connector.md` |
| 出典の台帳（他分野） | reportkiller `references/citation-ledger.md`・`scripts/ledger_check.js` |
| 図・紙面 | laba-textbook（`figure-spec.md`・`textbook_page.py`） |
| 独立の点検 | 担当 `style-reviewer`（文体）・`added-text-reviewer`（資料にない文） |
