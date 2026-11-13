# BUILD_NOTES

- 版 1.0.1（2026-11-13）。本体 skills/laba は単体スキル laba と同じ中身（作業用の _integration、node_modules、__pycache__ は除いた）。
- 入口スキル4本（laba-hanrei／laba-slides／laba-figures／laba-score）は、本体の文書と道具を `${CLAUDE_PLUGIN_ROOT}/skills/laba/` で指すだけで、規則を複製していない。直すときは本体だけを直す。
- `.mcp.json` は置いていない。日本法コネクタの URL は秘密の経路を含むので、プラグインに入れず、Claude のカスタムコネクタとして各自で登録する（CONNECTORS.md）。
- スコアボードの数値は、講義ノートが独立採点（ノート v5）、図とスライドが独立採点 第4回（どちらも Opus の採点者）。図の照合とスライドの検査が新しい種類の誤りを半分ほどしか止めないことは、本体の文書（figures/06-traceability.md、slides/README.md）に書いてある。
- 残っている改善点：trace.py の検出できない種類（要件と効果、範囲の枠、小枝の帰属、時間軸）、右向き流れ図の小枝、スライド検査の見落とし（大項目名・図形の重なり・ピクト）、非表示スライドでの頁ずれ。
- 版 1.1.1（2026-11-13）：LICENSE（MIT）を置いた。アイコンを一番上の icon.png に移し、plugin.json に icon と license を足した。README に英語の説明（実行するもの・取りに行くものを含む）を足した。
