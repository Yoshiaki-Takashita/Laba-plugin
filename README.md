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

4つの入口スキルは、本体（skills/laba）の該当部分を開くための入口で、規則と道具は本体に一つだけある。

## 到達点

本体の SKILL.md の「スコアボード」を参照（独立採点・機械測定・自己採点を分けて記載）。

## 必要なもの

- Python 3（python-docx、python-pptx）
- Node.js（sharp、pptxgenjs を `npm install -g`）
- 日本語の書体（無い環境では Noto Sans CJK などを入れる）

## コネクタ

CONNECTORS.md を参照。コネクタなしでも動く。

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

The four entry skills only open the relevant part of the main skill (skills/laba). The rules and tools exist in one place, in the main skill.

## Results so far

See the scoreboard in the main skill's SKILL.md. It keeps three kinds of figures apart: scores given by an independent grader who did not write the note, figures measured by the bundled check scripts, and self-assessment by the author (which is not reported as a result).

## Requirements

- Python 3 with python-docx and python-pptx
- Node.js with sharp and pptxgenjs (installed with `npm install -g`)
- A Japanese font (for example, Noto Sans CJK if none is installed)

## What the plugin runs and accesses

- **Local scripts.** The skills ask Claude to run the Python and Node.js scripts bundled under skills/laba/scripts. They read your source files and write Word documents, slide files, and images in your working folder.
- **Web access for verification.** To check statutes and court decisions, the skills tell Claude to look up the official e-Gov law database (Japanese Digital Agency) and the Courts of Japan case-law search. They read public pages only and send no personal data.
- **No hooks, no bundled servers.** The plugin contains no hooks and no MCP server configuration. It sends nothing anywhere on its own.

## Connector (optional)

The plugin works without any connector. If you have a connector for Japanese legal data that you set up yourself, see CONNECTORS.md (written in Japanese). Never put a connector URL that contains a secret into this plugin.

## License

MIT. See LICENSE.
