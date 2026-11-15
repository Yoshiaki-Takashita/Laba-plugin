---
name: laba-figures
description: 法律の関係図・流れ図・時系列・比較表などの図を、仕様（JSON）から生成し、本文と照合する。「図にして」「関係図を描いて」「当事者の関係を図で」「手続の流れを図に」と頼まれたとき、講義ノートや判例研究の図を作るときに使う。
---

# LABA 図モジュール

## 公式版（道具なし）での進め方

**最初に** `${CLAUDE_PLUGIN_ROOT}/skills/laba/scripts/figgen/cli.js` があるかを確かめる。あれば（フル版）この節は飛ばし、下の手順どおり進める。**無ければ（公式版）**、下の 3〜4 の `node …`・`python3 …` は実行せず、次のとおりにする。

1. 下の 1・2（入口、型の決定、型のファイルを読む）はそのまま行う。用例の仕様（`scripts/figgen/specs/`）は入っていないので、`references/figures/02-types/` の型の文書の説明と、`references/figures/01-grammar.md`・`03-layout.md`・`04-typography-color.md`・`05-caption.md` の規則を見て、中身を自分で組む。
2. **生成**：図の仕様を作るのではなく、SVG をその場で直接書く（利用者の作業フォルダに .svg）。色は #1A1A1A・#8C9493・#943522 の三色、文字は黒、角丸・影・グラデーションなし、矢印は向きが分かる形、ラベルは図だけで意味が取れる語にする。図題は「この図で分かること」。**画像を貼らず、図形で描く。** 日本語の書体が SVG で崩れる環境では、その旨を伝える。
3. **PNG**：環境に SVG を PNG にできる道具（cairosvg・rsvg-convert・ブラウザなど）があるときだけ変換する（600dpi を目安）。無ければ SVG のまま渡し、PNG は「未作成」と報告する。Word や PowerPoint に入れるときに PNG が要るなら、その場で変換できるか確かめてから約束する。
4. **検査**：機械の検査（`fig_lint.py`・`trace.py`）は無い。代わりに、(a) `references/figures/09-anti-patterns.md` の「してはいけない図」を 1 つずつ当てる、(b) `references/figures/06-traceability.md` の手順で、**本文を先に書き**、図の矢印・ラベル・条文番号・主体・例示を本文と 1 つずつ照合して表にする、(c) PNG（または SVG を画像にしたもの）を開いて矢印を 1 本ずつ読み、`references/figures/10-quality-rubric.md` の六観点で採点し、どれかが 3 以下なら直す。照合は「手作業で行った」と報告し、機械の検査は走らせていないと書く。
5. 図に足した内容は図の中でも「（補足）」と書く。法的な正しさは、図を作っていない点検者が見る（`references/reviewer-prompts/figure-check.md`）。立てられないときは「自己点検」と書く。

1. 入口は `${CLAUDE_PLUGIN_ROOT}/skills/laba/references/figures.md`。難所ごとに「この図で分かること」を一文で書き、`${CLAUDE_PLUGIN_ROOT}/skills/laba/references/algorithms/figure-type.md` の決定表で型（25種）を選ぶ。
2. `${CLAUDE_PLUGIN_ROOT}/skills/laba/references/figures/02-types/` の該当する型のファイルと、`${CLAUDE_PLUGIN_ROOT}/skills/laba/scripts/figgen/specs/` の用例の仕様を写し、中身を入れ替える。
3. 生成：`node ${CLAUDE_PLUGIN_ROOT}/skills/laba/scripts/figgen/cli.js <spec.json>`（SVG と 600dpi の PNG。sharp が要る：`npm install -g sharp`）。
4. 検査：`python3 ${CLAUDE_PLUGIN_ROOT}/skills/laba/scripts/fig_lint.py` を error 0 に。本文がある場合は **本文を先に書き**、`python3 ${CLAUDE_PLUGIN_ROOT}/skills/laba/scripts/figgen/trace.py --strict` で矢印・ラベル・条文番号・主体を本文と照合する。
5. PNG を開いて矢印を一本ずつ読み、`${CLAUDE_PLUGIN_ROOT}/skills/laba/references/figures/10-quality-rubric.md` の六観点で見る。どれかが3以下なら直す。図に足した内容は図の中でも「（補足）」。
6. 色は #1A1A1A・#8C9493・#943522 の三色、文字は黒。してはいけない図は `09-anti-patterns.md`。

機械の検査は形しか見ない。法的に正しいかは、図を作っていない点検者が見る（`${CLAUDE_PLUGIN_ROOT}/skills/laba/references/reviewer-prompts/figure-check.md`）。
