# LABA（法的学術書アルゴリズム／Legal Academic Book Algorithm）公式版（手順書のみ）

法学のレジュメ・教科書・判例資料を、復習と答案と発表に使える形に作り替えるプラグイン。

**この版は「公式版（手順書のみ）」です。** Anthropic のプラグインの一覧（ディレクトリ）に載せるための版で、中に入っているのは Markdown の手順書と規則集、JSON 1 つ、アイコンだけです。プログラム（スクリプト）は 1 つも入っていません。スクリプトつきの「フル版」は GitHub から入れられます（下の「フル版の入れ方」）。

## 入っているスキル

| スキル | 何をするか | こんな依頼で動く |
|---|---|---|
| **laba**（本体） | 講義ノート（Word）を12段階で作る。網羅・文体の模倣・ざっくり理解・図・設例の論証と結論・巻末の論点カードと短答式の命題・独立点検 | 「まとめて」「ノートにして」「解説を足して」「各ケースの結論は」 |
| **laba-hanrei** | 判例研究・評釈のレジュメと引用台帳 | 「この判決で判例研究を」「ゼミ報告のレジュメを」 |
| **laba-slides** | 発表スライド・復習スライドの作成と点検（型32種・点検の項目つき） | 「スライドにして」「このスライドを点検して」 |
| **laba-figures** | 図を型に沿って作り、本文と照合する（型25種） | 「図にして」「関係図を描いて」 |
| **laba-score** | 16指標で採点し、教科書や他の本と比べる | 「採点して」「教科書と比べて」 |
| **reportkiller** | 学術レポート・小論文・論文・研究報告を、どの分野でも書く・直す（Word＋図）。読んでいない文献は書かない引用台帳（V0〜V3）、レベル6段（高校生〜学会）、文体と図の点検、建築の作品研究（ライトとル・コルビュジエの研究つき） | 「レポートを書いて」「論文を直して」「AI っぽさを消して」「この図を直して」 |
| **gnoto-lite** | GNOTO のノート（.gnoto。ノーマルとスライドだけ）を Claude の中で作る・直す・見る。法律モードは、コネクタ（なければ e-Gov・裁判所サイト）から条文・判例を取り、出典つきで書く | 「ノートを作って」「このノートに条文を入れて」「判例を入れて」 |
| **laba-textbook** | 教科書どおりの紙面：文章を役割に分け、教科書の組みの規則で GNOTO の紙面ノート（.gnoto・スロットと文だけ）に書き出す。教科書の図（フロー・木・表・年表・関係図）の記述を作る | 「教科書のように組んで」「教科書の配置で」「図を教科書の形式で」 |
| **laba-book** | 単語・分野・資料つきの題から、教科書の章（文章）を範囲 → 構成 → 本文の順に作り、続きの章を足していく（本の状態は book.json・1 回に 1 章）。本文は教科書の文の数に合わせて書く | 「〜の教科書を作って」「この分野の入門書を」「続きの章を」 |

4つの入口スキル（laba-hanrei・laba-slides・laba-figures・laba-score）は、本体（skills/laba）の該当部分を開くための入口で、規則は本体に一つだけある。reportkiller は独立したスキルで、自分の規則を持つ（講義ノート・判例研究・スライドの依頼には使わず、それらは上の各スキルが受ける）。

Cowork と Claude Code では、`agents/` の15の担当（確認・節の執筆・教科書の節の執筆・図・巻末・統一・法的点検・足した文の点検・文体の点検・図の点検と、合議の裁判官5人）が読み込まれる。claude.ai のチャットでは読み込まれない。

## 公式版（手順書のみ）とフル版の違い

| | 公式版（この版） | フル版（GitHub から入れる） |
|---|---|---|
| 中身 | 手順書・規則集（Markdown）、担当の定義、判例研究などの規則 | 公式版のすべて＋検査・作成のスクリプト（Python・Node.js） |
| Word・スライド・図・GNOTO のノート | Claude がその場で自分でコードを書いて作る（同じ規則に従う）。環境に python-docx・python-pptx などが無ければ、作れる形が限られる | 同梱のスクリプトで作る。毎回同じ形に仕上がる |
| 機械の検査（22本の検査・図の照合・スライドの検査・引用台帳の検査・文体の検査） | 無い。手順書の中の確認表（`references/checklists/` など）と、本文を書いていない点検者の目で代える。「機械では測っていない」と報告に書く | ある。数は機械で数える |
| 仕上がり | 毎回少しずつ違う。体裁と数値の安定はフル版より劣る | そろう |
| ネットワーク | スクリプトが無いので、プラグイン自身は何にも接続しない。条文・判例の確認で Claude が公開の頁（e-Gov・裁判所サイトなど）を読むだけ | 判例検索の道具 `case_lookup.py` が裁判所サイトに接続する（フル版の README 参照） |
| スコアボードの数値（本体 SKILL.md） | フル版で測った値。**公式版の成果物には当てはまらない**（測っていない） | フル版で測った値 |

公式版でも、規則（読んでいない文献は書かない、足した説明は「（補足）」、確かめていない判例は「未確認」、自分で付けた点を成果として報告しない）は変わらない。

## フル版の入れ方（スクリプトつき）

スクリプトつきの全部入りは GitHub（Yoshiaki-Takashita/Laba-plugin）の `release` ブランチにある。この版（directory ブランチ）とは別のブランチで、同じ名前（laba）のプラグインなので、**両方は入れない**（先に公式版を外してから入れる）。

- **Claude Code**（公式ドキュメント：https://code.claude.com/docs/en/plugins/create-marketplace 、https://code.claude.com/docs/en/plugins/publish ）：
  1. `/plugin marketplace add Yoshiaki-Takashita/Laba-plugin@release` （シェルでは `claude plugin marketplace add Yoshiaki-Takashita/Laba-plugin@release`）
  2. `/plugin install laba@laba-marketplace` （シェルでは `claude plugin install laba@laba-marketplace`）
  - 1 回で済ませるとき：`claude plugin install laba --marketplace Yoshiaki-Takashita/Laba-plugin@release`（Claude Code v2.1.292 以降。`@release` の付け方がこの 1 回の形でも通るかは未確認＝不明。通らなければ上の 2 回に分ける）。
  - 手元で試すだけなら、リポジトリを取ってきて `claude --plugin-dir <フォルダ>`。
- **claude.ai・デスクトップアプリ・Cowork**（公式ドキュメント：https://claude.com/docs/plugins/overview ）：「Customize」→「Plugins」→「Add」→「Add marketplace」に `Yoshiaki-Takashita/Laba-plugin` を入れる、または、フル版の zip を「Add」→「Upload plugin」から入れる（zip か .plugin のファイル。中に `.claude-plugin/plugin.json` が 1 つだけあればよい）。zip は GitHub の `release` ブランチの「Download ZIP」、またはリポジトリで `bash tools/build-dist.sh out.zip` を実行して作る。claude.ai のチャットでスクリプトが実際に動くか（Claude の作業用の環境にそれが使えるか）は、環境による。`Add marketplace` でブランチを指定できるか（`@release` が通るか）は不明。
- 条文・判例をツールで確かめたいときは、コネクタを別に登録する（CONNECTORS.md）。登録しなくても動く。

## 必要なもの（公式版）

- 特別なものは要らない。Word（.docx）を作るときは、Claude の作業用の環境に python-docx があること、スライド（.pptx）は python-pptx または pptxgenjs があることが前提。無ければ Claude が入れられるか試し、入れられなければ、できない旨を伝えて、別の形（Markdown・SVG・構成案）で渡す。
- 日本語の書体：無い環境では、Noto Sans CJK などを入れる。
- 図の PNG 化は、環境に SVG を PNG にできる道具（cairosvg・rsvg-convert・ブラウザなど）があるときだけ。無ければ SVG のまま渡す。

## ネットにつなぐ道具

- 公式版には、ネットにつなぐ道具はない（スクリプトがない）。
- 条文・判例・文献の確認では、Claude が手順書に従って、e-Gov 法令検索・裁判所の裁判例検索・J-STAGE・CiNii・出版社の書誌頁などの**公開の頁を読む**だけで、利用者の文章や個人の情報は送らない。

## レポート・論文（reportkiller）

- 引用台帳（V0〜V3）の検査、文体・構成の点検、図の点検は、手順書（`references/verification.md`・`citation-ledger.md`・`figures.md`）の確認表を使って Claude が行う。機械の点検は走らない。
- 建築図は、図の作成の道具が入っていないので、Claude が SVG を手で書く。精密さはフル版に劣るので、資料・推定・創作の 3 層の見分けを必ず付ける（`references/arch-creative.md`）。
- `references/arch-masters-data` は、ライトとル・コルビュジエについての公開資料の事実・数値の要約（出典つき。図や写真は入れていない）。

## GNOTO Lite（gnoto-lite）の使い方

1. 「GNOTO のノートにして」「このノートに民法709条を入れて」のように頼む。Claude が `references/SPEC.md` の形式に従って .gnoto ファイル（UTF-8 の JSON 1 つ）を作業フォルダに書く。
2. できた .gnoto は GNOTO のノート一覧の読み込みで開く（「インポート」ジャンルに新しいノートができる。上書きはされない）。
3. 条文・判例は、各自が自分の Claude に登録したコネクタ（CONNECTORS.md）から取り、出典つきで書く。コネクタが無ければ e-Gov・裁判所サイトの頁から、読めた分だけを書く。「全部の条文・全部の判例」は取れない（最高裁で、裁判所のサイトが公開しているものまで）。
4. 静的なプレビュー（HTML）や Word への書き出しは、Claude がその場でコードを書いて作れる環境のときだけ。作れなければ .gnoto だけ渡す。

## コネクタ

CONNECTORS.md を参照。コネクタなしでも動く。コネクタの URL・鍵はこのプラグインに入っていない（各自が自分の設定に登録する）。

## プライバシー

PRIVACY.md を参照。

## ライセンス

プラグイン全体は MIT（LICENSE）。これには skills/reportkiller（レポート・論文の規則、ライトとル・コルビュジエの研究ノート）も含まれる。建築の研究ノートは公開資料の事実・数値の要約で、図や写真は含まない（出典は各ファイルに書いてある）。ただし **skills/gnoto-lite フォルダには別のライセンス**（skills/gnoto-lite/LICENSE。読めるが、Claude の外での再利用を禁じる条件）がある。

---

# LABA (Legal Academic Book Algorithm) — Directory edition (instructions only)

LABA is a plugin that turns Japanese law course materials (lecture handouts, textbooks, and case materials) into study aids you can use for review, exam answers, and presentations. It works with Japanese-language sources and produces Japanese-language output.

**This is the "directory edition (instructions only)".** It is the version submitted to Anthropic's plugin directory. It contains Markdown instructions and reference rules, one JSON data file, and the icon. It contains **no scripts or programs of any kind**. The full edition, with bundled scripts, can be installed from GitHub (see "Getting the full edition" below).

## Included skills

| Skill | What it does | Typical requests |
|---|---|---|
| **laba** (main) | Builds lecture notes as a Word document in 12 stages: full coverage of the source, writing in the source author's style, plain-language overviews before difficult passages, diagrams, worked hypotheticals with reasoning and conclusions, issue cards and true-or-false propositions at the end, and an independent review | "Summarize this", "Turn this into notes", "Answer the hypotheticals" |
| **laba-hanrei** | Prepares case-study and case-commentary handouts, with a citation ledger | "Write a case study on this judgment", "Prepare a seminar handout" |
| **laba-slides** | Creates and checks presentation and review slides (32 layout types, with a checklist) | "Make slides from this", "Check these slides" |
| **laba-figures** | Builds diagrams by type and checks them against the text (25 diagram types) | "Make a diagram", "Draw a relationship chart" |
| **laba-score** | Scores a note on 16 measures and compares it with a textbook or another book | "Score this", "Compare it with the textbook" |
| **reportkiller** | Writes and revises academic reports, essays and papers in any field (Word plus figures): a citation ledger that forbids citing what was not read (levels V0 to V3), six levels from high school to conference paper, style and figure checks, and architecture case studies (with notes on Frank Lloyd Wright and Le Corbusier) | "Write a report", "Fix this paper", "Remove the AI-sounding style" |
| **gnoto-lite** | Creates, edits and previews GNOTO notes (.gnoto files; normal and slide styles only) inside Claude. Its law mode fetches statutes and court decisions through a connector (or, without one, the official e-Gov and courts pages) and writes them with their sources | "Make a note", "Add this article to the note", "Add this decision" |
| **laba-textbook** | Lays text out as a textbook page: splits it into roles and writes a GNOTO page note (.gnoto, slots and text only) following textbook layout rules; describes textbook-style figures (flow, tree, table, timeline, relation) | "Lay this out like a textbook", "Make the figure textbook-style" |
| **laba-book** | Writes a textbook chapter from a word, a field or a titled source (scope, outline, text) and keeps adding chapters (book state in book.json, one chapter per run), held to measured textbook numbers | "Make a textbook on ...", "Write the next chapter" |

The four entry skills (laba-hanrei, laba-slides, laba-figures and laba-score) only open the relevant part of the main skill (skills/laba); the rules exist in one place. reportkiller is a separate skill with its own rules; it is not used for lecture notes, case studies or slides.

## What "instructions only" means

- **No bundled scripts.** The full edition ships Python and Node.js scripts that build Word, slide and figure files and run automated checks. This edition does not. Each skill starts with a short section, "公式版（道具なし）での進め方" (how to proceed without the tools). It tells Claude to check whether the scripts exist and, if not, to follow the same rules by writing the needed code itself during the session (python-docx, python-pptx or plain SVG, only if the environment has them).
- **Checkers are replaced by checklists.** The automated checks (the 22-check pipeline, figure tracing, slide lint, citation-ledger check, style check) are replaced by the checklists in `references/` and by an independent reader who did not write the text. Reports say "not measured by machine". The scoreboard figures in the main SKILL.md were measured with the full edition and do not apply to output made with this edition.
- **Results are less uniform.** Layout, numbers and file structure can vary from run to run more than with the full edition.
- The rules do not change: nothing unread is cited, added explanations are marked, unverified decisions are marked "unverified", and a self-assigned score is never reported as a result.

## Getting the full edition (with scripts)

The full edition is on the `release` branch of GitHub Yoshiaki-Takashita/Laba-plugin. It has the same plugin name (laba), so do not install both; remove this edition first.

- **Claude Code** (docs: https://code.claude.com/docs/en/plugins/create-marketplace and https://code.claude.com/docs/en/plugins/publish):
  1. `/plugin marketplace add Yoshiaki-Takashita/Laba-plugin@release` (in a shell: `claude plugin marketplace add Yoshiaki-Takashita/Laba-plugin@release`)
  2. `/plugin install laba@laba-marketplace` (in a shell: `claude plugin install laba@laba-marketplace`)
  - To try it without installing: clone the repository and run `claude --plugin-dir <folder>`.
- **claude.ai, the desktop app and Cowork** (docs: https://claude.com/docs/plugins/overview): under Customize, then Plugins, then Add, either choose Add marketplace and enter `Yoshiaki-Takashita/Laba-plugin`, or choose Upload plugin and upload a zip of the full edition (a .zip or .plugin file whose contents hold one `.claude-plugin/plugin.json`). Whether scripts actually run in a chat depends on the environment; whether Add marketplace accepts a branch such as `@release` is unknown.

## Requirements (this edition)

- Nothing special. To produce a Word file the environment needs python-docx; for a .pptx, python-pptx or pptxgenjs; for PNG diagrams, a tool that converts SVG to PNG. If something is missing Claude tries to install it, and otherwise says so and hands over another form (Markdown, SVG, an outline).
- A Japanese font (for example Noto Sans CJK) if none is available.

## What the plugin runs and accesses (directory edition)

- **No scripts, no programs.** The plugin runs nothing on its own. The skills are instructions Claude reads. When the instructions say to produce a file, Claude writes and runs short code of its own in your session, in your working folder, to build that file.
- **No network access of its own.** The `case_lookup` tool of the full edition does not exist here. To verify statutes and court decisions, the skills tell Claude to read public pages only (the official e-Gov law database, the Courts of Japan case-law search, J-STAGE, CiNii and similar). They send no personal data.
- **Agents.** The agents folder holds fifteen plain-text agent definitions (Markdown files), loaded only in Cowork and Claude Code. The reviewers and the five deliberation-panel members are given no file-editing tools.
- **No hooks, no bundled servers.** The plugin contains no hooks and no MCP server configuration. It sends nothing anywhere on its own.

## Using gnoto-lite

1. Ask, for example, "Put this in a GNOTO note" or "Add this article to the note". Claude writes a .gnoto file (one UTF-8 JSON document, format in `skills/gnoto-lite/references/SPEC.md`) in your working folder.
2. Open the .gnoto file with the import function in the GNOTO note list. It creates a new note in the Imported genre and never overwrites an existing one.
3. Statutes and decisions come from the connector you registered in your own Claude (see CONNECTORS.md) and are written with their sources. Without a connector, Claude reads the official e-Gov and courts pages and writes only what it could read. "Every statute and every decision" is not available.
4. A static HTML preview or a Word export is made only when the environment lets Claude write the code for it; otherwise only the .gnoto file is handed over.

## Connector (optional)

The plugin works without any connector. If you have a connector for Japanese legal data that you set up yourself, see CONNECTORS.md (written in Japanese). Never put a connector URL that contains a secret into this plugin.

## Privacy

See PRIVACY.md.

## License

The plugin as a whole is MIT (see LICENSE), including skills/reportkiller (its rules and the research notes on Wright and Le Corbusier, which summarize public facts with sources and contain no copied drawings or photographs). The skills/gnoto-lite folder has its own, separate licence (skills/gnoto-lite/LICENSE): a source-available licence that allows use inside Claude as part of this plugin and forbids extracting, porting or reusing it to provide note or law-mode features outside Claude.
