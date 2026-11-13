---
name: laba-score
description: 法学の講義ノート・解説・教科書の章を16指標（基本4＋独自12）で採点し、資料や他の本と比べる。「採点して」「教科書と比べて」「他の本と比べてどう」「どこが弱い」と頼まれたときに使う。
---

# LABA 採点モジュール

1. 定義・算式・合格線は `${CLAUDE_PLUGIN_ROOT}/skills/laba/references/scoring.md`、指標ごとの測り方と上げ方は `${CLAUDE_PLUGIN_ROOT}/skills/laba/references/metrics/`（16本）。
2. 機械の値は `python3 ${CLAUDE_PLUGIN_ROOT}/skills/laba/scripts/pipeline.py`（検査22本→`score.py`→次に直す点）で取る。数は自分で数えず、機械で数える（20字一致は `match_check.py`、文体は `style_check.py`）。
3. 意味の採点（判例理由の忠実度、確度の保存、書き手の判定、教科書との比較）は、本文を書いていない点検者にさせる。指示文は `${CLAUDE_PLUGIN_ROOT}/skills/laba/references/reviewer-prompts/`（16指標、法的正確さ、書き手の判定）。
4. 報告では **独立採点・機械測定・自己採点** を必ず分けて書く。自分で付けた点を成果として報告しない。素材・採点者の数・照合の抜き取り範囲という前提も添える。
5. 低い指標は `${CLAUDE_PLUGIN_ROOT}/skills/laba/references/algorithms/next-fix.md` で次に直す点を決める。
