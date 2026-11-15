---
name: laba-figures
description: 法律の関係図・流れ図・時系列・比較表などの図を、仕様（JSON）から生成し、本文と照合する。「図にして」「関係図を描いて」「当事者の関係を図で」「手続の流れを図に」と頼まれたとき、講義ノートや判例研究の図を作るときに使う。
---

# LABA 図モジュール

1. 入口は `${CLAUDE_PLUGIN_ROOT}/skills/laba/references/figures.md`。難所ごとに「この図で分かること」を一文で書き、`${CLAUDE_PLUGIN_ROOT}/skills/laba/references/algorithms/figure-type.md` の決定表で型（25種）を選ぶ。
2. `${CLAUDE_PLUGIN_ROOT}/skills/laba/references/figures/02-types/` の該当する型のファイルと、`${CLAUDE_PLUGIN_ROOT}/skills/laba/scripts/figgen/specs/` の用例の仕様を写し、中身を入れ替える。
3. 生成：`node ${CLAUDE_PLUGIN_ROOT}/skills/laba/scripts/figgen/cli.js <spec.json>`（SVG と 600dpi の PNG。sharp が要る：`npm install -g sharp`）。
4. 検査：`python3 ${CLAUDE_PLUGIN_ROOT}/skills/laba/scripts/fig_lint.py` を error 0 に。本文がある場合は **本文を先に書き**、`python3 ${CLAUDE_PLUGIN_ROOT}/skills/laba/scripts/figgen/trace.py --strict` で矢印・ラベル・条文番号・主体を本文と照合する。
5. PNG を開いて矢印を一本ずつ読み、`${CLAUDE_PLUGIN_ROOT}/skills/laba/references/figures/10-quality-rubric.md` の六観点で見る。どれかが3以下なら直す。図に足した内容は図の中でも「（補足）」。
6. 色は #1A1A1A・#8C9493・#943522 の三色、文字は黒。してはいけない図は `09-anti-patterns.md`。

機械の検査は形しか見ない。法的に正しいかは、図を作っていない点検者が見る（`${CLAUDE_PLUGIN_ROOT}/skills/laba/references/reviewer-prompts/figure-check.md`）。
