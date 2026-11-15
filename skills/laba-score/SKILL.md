---
name: laba-score
description: 法学の講義ノート・解説・教科書の章を16指標（基本4＋独自12）で採点し、資料や他の本と比べる。「採点して」「教科書と比べて」「他の本と比べてどう」「どこが弱い」と頼まれたときに使う。
---

# LABA 採点モジュール

## 公式版（道具なし）での進め方

**最初に** `${CLAUDE_PLUGIN_ROOT}/skills/laba/scripts/pipeline.py` があるかを確かめる。あれば（フル版）この節は飛ばす。**無ければ（公式版）**、下の 2 の `python3 …` は実行できない。次のとおりにする。

1. 定義・算式・合格線（`references/scoring.md`）と、指標ごとの測り方（`references/metrics/` の 16 本）を読む。
2. **機械の値は取れない**。数えられる指標（網羅の件数、判例・条文の件数、20 字一致の丸写し、字数など）は、その場で標準ライブラリだけの短い Python を書いて数えてよい。ただし数え方（何を何として数えたか）を報告に付ける。数えられないものは数値を書かず「未測定」と書く。
3. 意味の採点（判例理由の忠実度、確度の保存、書き手の判定、教科書との比較）は、本文を書いていない点検者にさせる（`references/reviewer-prompts/`）。点検者を立てられないときは、同じ指示文の項目で自分が確かめ、**自己採点であって独立採点ではない**と書く。
4. 総合点（`scoring.md` の算式）は、機械の値がそろわないので出さない。採点できた指標だけを個別に、独立採点・機械測定・自己採点のどれかを明記して報告する。素材・採点者の数・照合の抜き取り範囲という前提も添える。
5. 低い指標は `references/algorithms/next-fix.md` で次に直す点を決める。スコアボードの数値（本体 SKILL.md）はフル版で測った値で、公式版には当てはまらない。

1. 定義・算式・合格線は `${CLAUDE_PLUGIN_ROOT}/skills/laba/references/scoring.md`、指標ごとの測り方と上げ方は `${CLAUDE_PLUGIN_ROOT}/skills/laba/references/metrics/`（16本）。
2. 機械の値は `python3 ${CLAUDE_PLUGIN_ROOT}/skills/laba/scripts/pipeline.py`（検査22本→`score.py`→次に直す点）で取る。数は自分で数えず、機械で数える（20字一致は `match_check.py`、文体は `style_check.py`）。
3. 意味の採点（判例理由の忠実度、確度の保存、書き手の判定、教科書との比較）は、本文を書いていない点検者にさせる。指示文は `${CLAUDE_PLUGIN_ROOT}/skills/laba/references/reviewer-prompts/`（16指標、法的正確さ、書き手の判定）。
4. 報告では **独立採点・機械測定・自己採点** を必ず分けて書く。自分で付けた点を成果として報告しない。素材・採点者の数・照合の抜き取り範囲という前提も添える。
5. 低い指標は `${CLAUDE_PLUGIN_ROOT}/skills/laba/references/algorithms/next-fix.md` で次に直す点を決める。
