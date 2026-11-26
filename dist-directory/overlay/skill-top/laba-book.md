## 公式版（道具なし）での進め方

**最初に** `${CLAUDE_PLUGIN_ROOT}/skills/laba-book/scripts/book_state.py` があるかを確かめる。あれば（フル版）この節は飛ばし、下の手順どおり進める。**無ければ（公式版）**、下の `python3 …` は実行せず、次のとおりにする。

1. `book.json` は Claude が直接書く（形は `references/book-state.md` 1）。`done` の章には要点 3〜5 項目を必ず入れる。
2. 構成の検査（`outline`）は手で行う：節の題 20 字まで・項の題 8 字まで・名詞止め・同じ用語を 2 つの節で定義しない・図の型は 10 のどれか（`references/figure-judgment.md`）。
3. 本文の数の検査（`gate`）は無いので、`references/writer-brief.md` 1 の表を確認表にして、書いた節の文の長さ（中央値）・段落の長さ・太字・見出しを目で数え、外れた項目を直す（最大 2 回）。結果は「手作業で確かめた（機械の測定なし）」と報告する。
4. 資料なしの題の検査（`map`・`ledger`・`claims`）も手で行う：`map.json` は概念 5〜15・前提が循環しない・各概念に台帳の ID か `todo`。台帳は V0 の行が無い・URL がある・未確認の行は `U` で始まる。本文は主張の文に `[R01]` があり、その ID が台帳の V1 か V3 の行にあるかを目で照合する。結果は「手作業で確かめた（機械の測定なし）」と報告する。
5. 図（P5・`references/figures.md`）の描き手と検査（`figure_svg.py`・`figure_check.py`・`book_state.py figs`）は無いので、図の記述（`figs.json`）だけを書き、`figure-spec.md` の欄と上限・本文の語そのまま・1 節 1 図を目で確かめる。SVG は作らない。結果は「図は記述だけ・描いて検めていない」と報告する。
