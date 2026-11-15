---
name: laba-slides
description: 法学の発表スライド・復習スライド（PowerPoint）を作る、または点検する。「スライドにして」「発表資料を」「レジュメに合わせてスライドも」「このノートを復習スライドに」「このスライドを点検して」と頼まれたときに使う。
---

# LABA スライドモジュール

## 公式版（道具なし）での進め方

**最初に** `${CLAUDE_PLUGIN_ROOT}/skills/laba/scripts/slides/build_deck.js` があるかを確かめる。あれば（フル版）この節は飛ばす。**無ければ（公式版）**、下の `node …`・`python3 …` は実行せず、次のとおりにする。

1. 下の 1・2 の流れの選択、構成の作成、型（32 種）の選択はそのまま行う。下書きの道具（`resume_to_deck.py`・`note_to_deck.py`）は無いので、判例研究の発表は「レジュメの見出しと 1 対 1」の対応表を、ノートからの復習スライドは `references/slides/07-from-note.md` の手順を、自分で手作業でたどる。構成は、1 枚ごとに「型・見出し・本文・図の有無」を書いた Markdown の一覧にする。
2. **.pptx の作成**：環境に python-pptx（または Node の pptxgenjs）があれば、その場で短いコードを書いて作る。寸法・色・書体の数値は `references/slides/01-tokens.md`、型ごとの配置は `02-layouts.md`、関係図は `03-diagram-on-slide.md`、時系列の積み上げは `04-step-reveal.md` に従う。配色は、発表用は teal、復習用と白黒配布は三色（mono）。影・角丸・グラデーションなし。コードは作業用で、渡さなくてよい。ライブラリが無く、入れられないときは、.pptx が作れないと伝え、構成の一覧（Markdown）を渡す。
3. **点検**：機械の点検（`deck_lint.py`）は無い。`references/slides/09-quality-rubric.md`（体裁の 17 項目と採点表 10 項目）、`05-text-fitting.md`（本文 15pt 以上・文字を縮めて収めない・単語の途中で折らない）、`08-dont.md` を、1 枚ずつ当てる。LibreOffice（soffice）があれば PDF → 画像にして全枚を目で見る。無ければ「画像で見ていない」と報告する。
4. 報告では、自己採点と独立採点を分け、機械の点検は走らせていない（道具が入っていない版）と書く。

1. 入口は `${CLAUDE_PLUGIN_ROOT}/skills/laba/references/slides/README.md`。依頼で流れを分ける：
   - 判例研究の発表 → レジュメの見出しと1対1。`${CLAUDE_PLUGIN_ROOT}/skills/laba/scripts/hanrei/resume_to_deck.py` で下書き。
   - 講義ノートからの復習スライド → `${CLAUDE_PLUGIN_ROOT}/skills/laba/references/slides/07-from-note.md`、`python3 ${CLAUDE_PLUGIN_ROOT}/skills/laba/scripts/slides/note_to_deck.py`。1制度10〜12枚。
   - 点検だけ → `${CLAUDE_PLUGIN_ROOT}/skills/laba/references/slides/09-quality-rubric.md`。
2. 構成を JSON で書き、型32種（`${CLAUDE_PLUGIN_ROOT}/skills/laba/references/slides/02-layouts.md`）から選ぶ。作るのは `node ${CLAUDE_PLUGIN_ROOT}/skills/laba/scripts/slides/build_deck.js`（pptxgenjs が要る。`npm install -g pptxgenjs`）。
3. `python3 ${CLAUDE_PLUGIN_ROOT}/skills/laba/scripts/slides/deck_lint.py` を error 0 まで回す。全枚を画像にして目で見る。本文は 15pt 以上を目安、文字を縮めて収めない（`05-text-fitting.md`）。
4. 配色：発表用は teal、ノートから起こす復習用と白黒配布は三色（mono）。影・角丸・グラデーションなし。してはいけないことは `08-dont.md`。
5. 採点表10項目で採点するときは、自己採点と独立採点を分けて報告する。

図の一般論は laba-figures（`${CLAUDE_PLUGIN_ROOT}/skills/laba/references/figures/`）、共通の規則は `${CLAUDE_PLUGIN_ROOT}/skills/laba/SKILL.md`。
