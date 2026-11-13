# LABA（法的学術書アルゴリズム／Legal Academic Book Algorithm）

法学のレジュメ・教科書・判例資料を、復習と答案と発表に使える形に作り替えるプラグイン。

## 入っているスキル

| スキル | 何をするか | こんな依頼で動く |
|---|---|---|
| **laba**（本体） | 講義ノート（Word）を12段階で作る。網羅・文体の模倣・ざっくり理解・図・設例の論証と結論・巻末の論点カードと短答式の命題・独立点検 | 「まとめて」「ノートにして」「解説を足して」「各ケースの結論は」 |
| **laba-hanrei** | 判例研究・評釈のレジュメと引用台帳 | 「この判決で判例研究を」「ゼミ報告のレジュメを」 |
| **laba-slides** | 発表スライド・復習スライドの作成と点検（型32種・検査28項目） | 「スライドにして」「このスライドを点検して」 |
| **laba-figures** | 図を仕様から生成し、本文と照合（型25種） | 「図にして」「関係図を描いて」 |
| **laba-score** | 16指標で採点し、教科書や他の本と比べる | 「採点して」「教科書と比べて」 |
| **gnoto-lite** | GNOTO のノート（.gnoto。ノーマルとスライドだけ）を Claude の中で作る・直す・見る。法律モードは、コネクタ（なければ e-Gov・裁判所サイト）から条文・判例を取り、出典つきで書く | 「ノートを作って」「このノートに条文を入れて」「判例を入れて」 |

4つの入口スキル（laba-hanrei・laba-slides・laba-figures・laba-score）は、本体（skills/laba）の該当部分を開くための入口で、規則と道具は本体に一つだけある。

## 到達点

本体の SKILL.md の「スコアボード」を参照（独立採点・機械測定・自己採点を分けて記載）。

## 入れ方

- **claude.ai・デスクトップアプリ**：公式の一覧に載ったあとは、「Customize」→「Plugins」→「Discover」で laba を探して追加する。載る前は、このリポジトリを zip にして「Customize」→「Plugins」→「Add」→「Upload plugin」から入れる。
- **Claude Code**：公式の一覧に載ったあとは `/plugin directory` から入れる。手元で試すときは `claude --plugin-dir <このフォルダ>`。
- 条文・判例をツールで確かめたいときは、コネクタを別に登録する（CONNECTORS.md）。登録しなくても動く。

## 必要なもの

- **Python 3 と Node.js**：Claude Code で自分のパソコンで使うときは、先に入れておく。claude.ai やデスクトップアプリでは、ふつうは Claude の作業用の環境に入っている（無ければ Claude が知らせる）。
- **python-docx・python-pptx・pptxgenjs・sharp**：足りなければ、Claude が作業の途中で入れる（Claude Code では、入れてよいか聞かれたら許可する）。前もって入れておくなら `pip install python-docx python-pptx`、`npm install -g pptxgenjs sharp`。sharp が無くても図は SVG で出る（PNG にできないだけ）。
- **日本語の書体**：無い環境では、Noto Sans CJK などを入れる。
- gnoto-lite だけを使うなら、Python 3 の標準ライブラリで足りる（Word に出すときだけ python-docx。PNG のサムネイルは Chromium 系のブラウザがあるときだけ）。

## GNOTO Lite（gnoto-lite）の使い方

1. 「GNOTO のノートにして」「このノートに民法709条を入れて」のように頼む。Claude が .gnoto ファイルを作業フォルダに書き、静的なプレビュー（HTML）を作って見せる。
2. できた .gnoto は GNOTO のノート一覧の読み込みで開く（「インポート」ジャンルに新しいノートができる。上書きはされない）。
3. 条文・判例は、各自が自分の Claude に登録したコネクタ（CONNECTORS.md）から取り、出典つきで書く。コネクタが無ければ e-Gov・裁判所サイトの頁から、読めた分だけを書く。「全部の条文・全部の判例」は取れない（最高裁で、裁判所のサイトが公開しているものまで）。
4. laba で作る講義ノートの出力先を、Word のほかに GNOTO のノートにもできる。
5. スクリプトは作業フォルダのファイルを読み書きするだけで、ネットワークには接続しない。ただし、利用者が https の画像 URL をノートに入れた場合は、プレビュー（や PNG を作るブラウザ）を開いたときに、その画像をブラウザが読み込む。

## コネクタ

CONNECTORS.md を参照。コネクタなしでも動く。コネクタの URL・鍵はこのプラグインに入っていない（各自が自分の設定に登録する）。

## ライセンス

プラグイン全体は MIT（LICENSE）。ただし **skills/gnoto-lite フォルダには別のライセンス**（skills/gnoto-lite/LICENSE。ソースは読めるが、Claude の外での再利用を禁じる条件）がある。

---

# LABA (Legal Academic Book Algorithm) — English

LABA is a plugin that turns Japanese law course materials (lecture handouts, textbooks, and case materials) into study aids you can use for review, exam answers, and presentations. It works with Japanese-language sources and produces Japanese-language output.

## Included skills

| Skill | What it does | Typical requests |
|---|---|---|
| **laba** (main) | Builds lecture notes as a Word document in 12 stages: full coverage of the source, writing in the source author's style, plain-language overviews before difficult passages, diagrams, worked hypotheticals with reasoning and conclusions, issue cards and true-or-false propositions for short-answer exams at the end, and an independent review | "Summarize this", "Turn this into notes", "Add explanations", "What is the conclusion for each case?" |
| **laba-hanrei** | Prepares case-study and case-commentary handouts, with a citation ledger | "Write a case study on this judgment", "Prepare a seminar handout" |
| **laba-slides** | Creates and checks presentation and review slides (32 layout types, 28 checks) | "Make slides from this", "Check these slides" |
| **laba-figures** | Generates diagrams from a specification and checks them against the text (25 diagram types) | "Make a diagram", "Draw a relationship chart" |
| **laba-score** | Scores a note on 16 measures and compares it with a textbook or another book | "Score this", "Compare it with the textbook" |
| **gnoto-lite** | Creates, edits and previews GNOTO notes (.gnoto files; normal and slide styles only) inside Claude. Its law mode fetches statutes and court decisions through a connector (or, without one, the official e-Gov and courts pages) and writes them with their sources | "Make a note", "Add this article to the note", "Add this decision" |

The four entry skills (laba-hanrei, laba-slides, laba-figures and laba-score) only open the relevant part of the main skill (skills/laba). The rules and tools exist in one place, in the main skill.

## Results so far

See the scoreboard in the main skill's SKILL.md. It keeps three kinds of figures apart: scores given by an independent grader who did not write the note, figures measured by the bundled check scripts, and self-assessment by the author (which is not reported as a result).

## Installation

- **claude.ai and the desktop app**: once the plugin is listed in the directory, find laba under Customize, then Plugins, then Discover, and add it. Before it is listed, zip this repository and add it under Customize, then Plugins, then Add, then Upload plugin.
- **Claude Code**: once listed, install it from `/plugin directory`. To try it locally, run `claude --plugin-dir <this folder>`.
- To check statutes and court decisions with tools, register a connector separately (see CONNECTORS.md). The plugin also works without one.

## Requirements

- **Python 3 and Node.js**: install them first if you use Claude Code on your own computer. On claude.ai and in the desktop app, Claude's sandbox normally has them (Claude tells you if not).
- **python-docx, python-pptx, pptxgenjs and sharp**: if any are missing, Claude installs them during the task (in Claude Code, allow it when asked). To install them in advance, run `pip install python-docx python-pptx` and `npm install -g pptxgenjs sharp`. Without sharp, diagrams are still produced as SVG; only the PNG conversion is skipped.
- **A Japanese font**: install one, for example Noto Sans CJK, if none is available.
- gnoto-lite alone needs only the Python 3 standard library (python-docx only for Word export; a Chromium-based browser only for PNG thumbnails).

## What the plugin runs and accesses

- **Local scripts.** The skills ask Claude to run the Python and Node.js scripts bundled under skills/laba/scripts. They read your source files and write Word documents, slide files, and images in your working folder.
- **Web access for verification.** To check statutes and court decisions, the skills tell Claude to look up the official e-Gov law database (Japanese Digital Agency) and the Courts of Japan case-law search. They read public pages only and send no personal data.
- **gnoto-lite scripts.** skills/gnoto-lite/scripts is a plain note-file writer and renderer in Python 3 (standard library only). It reads and writes .gnoto files you name, writes a self-contained static HTML preview, and, only if a Chromium-based browser is installed and you ask for a PNG, starts that browser in headless mode on a temporary local file. For Word export it calls the bundled build_docx.py. The scripts make no network requests and contain no statute or case data and no citation parsing. Statutes and decisions are fetched by Claude through your own connector or the official public pages, saved as JSON by Claude, and the scripts only format that JSON into ordinary note blocks with its provenance.
- **No hooks, no bundled servers.** The plugin contains no hooks and no MCP server configuration. It sends nothing anywhere on its own.

## Using gnoto-lite

1. Ask, for example, "Put this in a GNOTO note" or "Add this article to the note". Claude writes a .gnoto file in your working folder and builds a static HTML preview to show you.
2. Open the .gnoto file with the import function in the GNOTO note list. It creates a new note in the Imported genre and never overwrites an existing one.
3. Statutes and decisions come from the connector you registered in your own Claude (see CONNECTORS.md) and are written with their sources. Without a connector, Claude reads the official e-Gov and courts pages and writes only what it could read. "Every statute and every decision" is not available: only what the official sites publish (Supreme Court decisions on the courts site).
4. The main laba skill can also deliver a lecture note as a GNOTO note, next to Word.
5. The scripts only read and write files in your working folder and make no network connections. If you put an https image URL into a note, the browser loads that image when you open the preview (or when a PNG is made).

## Connector (optional)

The plugin works without any connector. If you have a connector for Japanese legal data that you set up yourself, see CONNECTORS.md (written in Japanese). Never put a connector URL that contains a secret into this plugin.

## License

The plugin as a whole is MIT (see LICENSE). The skills/gnoto-lite folder has its own, separate licence (skills/gnoto-lite/LICENSE): a source-available licence that allows use inside Claude as part of this plugin and forbids extracting, porting or reusing it to provide note or law-mode features outside Claude.
