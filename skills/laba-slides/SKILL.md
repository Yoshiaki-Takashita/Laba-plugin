---
name: laba-slides
description: 法学の発表スライド・復習スライド（PowerPoint）を作る、または点検する。「スライドにして」「発表資料を」「レジュメに合わせてスライドも」「このノートを復習スライドに」「このスライドを点検して」と頼まれたときに使う。
---

# LABA スライドモジュール

1. 入口は `${CLAUDE_PLUGIN_ROOT}/skills/laba/references/slides/README.md`。依頼で流れを分ける：
   - 判例研究の発表 → レジュメの見出しと1対1。`${CLAUDE_PLUGIN_ROOT}/skills/laba/scripts/hanrei/resume_to_deck.py` で下書き。
   - 講義ノートからの復習スライド → `${CLAUDE_PLUGIN_ROOT}/skills/laba/references/slides/07-from-note.md`、`python3 ${CLAUDE_PLUGIN_ROOT}/skills/laba/scripts/slides/note_to_deck.py`。1制度10〜12枚。
   - 点検だけ → `${CLAUDE_PLUGIN_ROOT}/skills/laba/references/slides/09-quality-rubric.md`。
2. 構成を JSON で書き、型32種（`${CLAUDE_PLUGIN_ROOT}/skills/laba/references/slides/02-layouts.md`）から選ぶ。作るのは `node ${CLAUDE_PLUGIN_ROOT}/skills/laba/scripts/slides/build_deck.js`（pptxgenjs が要る。`npm install -g pptxgenjs`）。
3. `python3 ${CLAUDE_PLUGIN_ROOT}/skills/laba/scripts/slides/deck_lint.py` を error 0 まで回す。全枚を画像にして目で見る。本文は 15pt 以上を目安、文字を縮めて収めない（`05-text-fitting.md`）。
4. 配色：発表用は teal、ノートから起こす復習用と白黒配布は三色（mono）。影・角丸・グラデーションなし。してはいけないことは `08-dont.md`。
5. 採点表10項目で採点するときは、自己採点と独立採点を分けて報告する。

図の一般論は laba-figures（`${CLAUDE_PLUGIN_ROOT}/skills/laba/references/figures/`）、共通の規則は `${CLAUDE_PLUGIN_ROOT}/skills/laba/SKILL.md`。
