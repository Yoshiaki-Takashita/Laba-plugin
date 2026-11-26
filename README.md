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
| **reportkiller** | 学術レポート・小論文・論文・研究報告を、どの分野でも書く・直す（Word＋図）。読んでいない文献は書かない引用台帳（V0〜V3）、レベル6段（高校生〜学会）、文体と図の点検、建築の作品研究・建築図（ライトとル・コルビュジエの研究つき） | 「レポートを書いて」「論文を直して」「AI っぽさを消して」「この図を直して」 |
| **gnoto-lite** | GNOTO のノート（.gnoto。ノーマルとスライドだけ）を Claude の中で作る・直す・見る。法律モードは、コネクタ（なければ e-Gov・裁判所サイト）から条文・判例を取り、出典つきで書く | 「ノートを作って」「このノートに条文を入れて」「判例を入れて」 |
| **laba-textbook** | 教科書どおりの紙面：文章を役割（本文・事例・補足・要点・図）に分け、教科書の組みの規則で GNOTO の紙面ノート（.gnoto・スロットと文だけ）に書き出す。文章から教科書の図（フロー・木・表・年表・関係図）の記述を作って検査する。画像も本文も持たず、数値と規則だけで学習した | 「教科書のように組んで」「教科書の配置で」「図を教科書の形式で」 |
| **laba-book** | 単語・分野・資料つきの題から、教科書の章（文章）を範囲 → 構成 → 本文の順に作り、続きの章を足していく（本の状態は book.json・1 回に 1 章）。本文は教科書の文の数（文の長さ・段落・見出し・強調）に合わせ、道具で測って直す。教科書の文章は持たず、数と規則だけ | 「〜の教科書を作って」「この分野の入門書を」「この資料から教科書の 1 節を」「続きの章を」 |

4つの入口スキル（laba-hanrei・laba-slides・laba-figures・laba-score）は、本体（skills/laba）の該当部分を開くための入口で、規則と道具は本体に一つだけある。reportkiller は独立したスキルで、自分の規則と道具を持つ（講義ノート・判例研究・スライドの依頼には使わず、それらは上の各スキルが受ける）。判例研究とスライドの「ゼミ報告の型」（引用の格付け・文体・体裁）と、講義ノートの「請求→抗弁→再抗弁」の型は、それぞれ laba-hanrei・laba・laba-slides の中にある。ゼミ名・報告者名・教員名は、スキルに決め打ちせず、利用者が答えるか設定ファイルに書く。

Cowork と Claude Code では、`agents/` の15の担当（確認・節の執筆・教科書の節の執筆・図・巻末・統一・法的点検・足した文の点検・文体の点検・図の点検と、合議の裁判官5人）が読み込まれ、段階を分けて同時に進められる（claude.ai のチャットでは読み込まれない）。

## 速く進める（1.3.0）

claude.ai のチャットでは、全部の段階を順に回すと時間がかかる。そこで、正確さの守りを減らさずに待ち時間を減らす決まりを入れた（`skills/laba/references/speed.md`）。

- **条文・判例の確認をまとめて呼ぶ**：結果に頼らない呼び出しを、同じ回に全部出す（1件ずつ呼ばない）。
- **スクリプトを一度に走らせる**：検査（`pipeline.py`）は互いに独立なものを同時に、図（`figgen/cli.js batch`）は何枚も1回で（PNG は同時に変換）、`build_and_check.py` は docx・PDF 化・検査を1回で。
- **速さ優先**：主題が1つで資料が短い依頼は、段階を縮める（「急ぎ」と言われても、重い依頼は縮めない）。条文・判例の確認、「未確認」の表示、足した説明の規則、網羅の照合は省かない。
- **⑨〜⑪（検査→直し→採点）は既定で最大2回。**
- **Cowork・Claude Code では担当（`agents/`）に分けて同時に進める**：確認、節の執筆、図、巻末、統一、点検（法的・足した文・文体・図）、合議（立場の違う5人の裁判官が、見解の分かれる点で多数意見・反対意見と分かれ目を出す）。チャットでは `agents/` は読み込まれない（公式の仕様）ので、同じ分担を1人で進める。

測った値（自作の架空の資料。4コアの計算機）：検査20本が 0.87 秒から 0.27 秒、図45本（PNG つき）が 12.2 秒（1本ずつ呼ぶ）から 2.3 秒。Claude 側の往復の減り方（約110回から約30回）は見込みで、実測ではない。詳しくは speed.md の7。

## 到達点

本体の SKILL.md の「スコアボード」を参照（独立採点・機械測定・自己採点を分けて記載）。

## 入れ方

- **claude.ai・デスクトップアプリ**：公式の一覧に載ったあとは、「Customize」→「Plugins」→「Discover」で laba を探して追加する。載る前は、このリポジトリを zip にして「Customize」→「Plugins」→「Add」→「Upload plugin」から入れる。
- **Claude Code**：公式の一覧に載ったあとは `/plugin directory` から入れる。手元で試すときは `claude --plugin-dir <このフォルダ>`。
- **フル版（スクリプトつき）を GitHub から入れる**（公式ドキュメント：https://code.claude.com/docs/en/plugins/create-marketplace 、claude.ai・Cowork は https://claude.com/docs/plugins/overview ）：
  - Claude Code：`/plugin marketplace add Yoshiaki-Takashita/Laba-plugin@release` → `/plugin install laba@laba-marketplace`（シェルでは `claude plugin marketplace add …`・`claude plugin install …`）。`release` は、試験を外した配布版の枝。`main`（開発用）を指定すると試験・試験の資料も入る。
  - claude.ai・デスクトップアプリ・Cowork：「Customize」→「Plugins」→「Add」→「Add marketplace」に `Yoshiaki-Takashita/Laba-plugin` を入れる、または `bash tools/build-dist.sh out.zip` で作った zip を「Add」→「Upload plugin」から入れる。ブランチの指定が通るかは不明。
- **公式版（手順書のみ）**：Anthropic のディレクトリには、スクリプトを含まない版（`directory` ブランチ。`bash tools/build-dist.sh --directory [out.zip]` で作る）を出す。内容は同じ手順書で、Word・スライド・図・GNOTO のノートは Claude がその場でコードを書いて作り、機械の検査は確認表で代える。違いは `directory` ブランチの README.md に書いてある。公式版とフル版は同じ名前（laba）なので、両方は入れない。
- 条文・判例をツールで確かめたいときは、コネクタを別に登録する（CONNECTORS.md）。登録しなくても動く。

## 必要なもの

- **Python 3 と Node.js**：Claude Code で自分のパソコンで使うときは、先に入れておく。claude.ai やデスクトップアプリでは、ふつうは Claude の作業用の環境に入っている（無ければ Claude が知らせる）。
- **python-docx・python-pptx・pptxgenjs・sharp**：足りなければ、Claude が作業の途中で入れる（Claude Code では、入れてよいか聞かれたら許可する）。前もって入れておくなら `pip install python-docx python-pptx`、`npm install -g pptxgenjs sharp`。sharp が無くても図は SVG で出る（PNG にできないだけ）。
- **日本語の書体**：無い環境では、Noto Sans CJK などを入れる。
- gnoto-lite だけを使うなら、Python 3 の標準ライブラリで足りる（Word に出すときだけ python-docx。PNG のサムネイルは Chromium 系のブラウザがあるときだけ）。

## ネットにつなぐ道具（1 つだけ）

- `skills/laba/scripts/case_lookup.py` だけは、頼まれたときに**裁判所ウェブサイト（www.courts.go.jp）の判例検索**を日付で引き、検索結果の頁と、判決全文の PDF を取ってくる（Python の標準ライブラリで取り、取れない環境ではパソコンに入っている curl で取り直す）。送るのは検索の条件（裁判の年月日・裁判所の種類）だけで、利用者の文章や個人の情報は送らない。
- 取った PDF は、手元の pdftotext などで**文字にするだけ**で、実行はしない。全文は作業用で、ノートやスキルには貼らない。
- ほかの道具は、ネットにつながない。

## レポート・論文（reportkiller）の道具

- `skills/reportkiller/scripts` は、渡された本文・台帳・図（SVG）を読んで所見を出す点検の道具（Node.js と Python 3 標準ライブラリだけ）と、建物のデータ（JSON）から建築図の SVG を書く道具。ネットワークには接続せず、ほかのプログラムも起動しない。
- 文献の検索（J-STAGE・CiNii・出版社の書誌頁など）は Claude が手順書に従って行い、公開の頁を読むだけで、利用者の文章や個人の情報は送らない。
- `references/arch-masters-data` は、ライトとル・コルビュジエについての公開資料の事実・数値の要約（出典つき。図や写真は入れていない）。

## GNOTO Lite（gnoto-lite）の使い方

1. 「GNOTO のノートにして」「このノートに民法709条を入れて」のように頼む。Claude が .gnoto ファイルを作業フォルダに書き、静的なプレビュー（HTML）を作って見せる。
2. できた .gnoto は GNOTO のノート一覧の読み込みで開く（「インポート」ジャンルに新しいノートができる。上書きはされない）。
3. 条文・判例は、各自が自分の Claude に登録したコネクタ（CONNECTORS.md）から取り、出典つきで書く。コネクタが無ければ e-Gov・裁判所サイトの頁から、読めた分だけを書く。「全部の条文・全部の判例」は取れない（最高裁で、裁判所のサイトが公開しているものまで）。
4. laba で作る講義ノートの出力先を、Word のほかに GNOTO のノートにもできる。
5. gnoto-lite のスクリプトは作業フォルダのファイルを読み書きするだけで、ネットワークには接続しない。ただし、利用者が https の画像 URL をノートに入れた場合は、プレビュー（や PNG を作るブラウザ）を開いたときに、その画像をブラウザが読み込む。

## コネクタ

CONNECTORS.md を参照。コネクタなしでも動く。コネクタの URL・鍵はこのプラグインに入っていない（各自が自分の設定に登録する）。

## ライセンス

プラグイン全体は MIT（LICENSE）。これには skills/reportkiller（レポート・論文の規則と道具、建築図の道具、ライトとル・コルビュジエの研究ノート）も含まれる。建築の研究ノートは公開資料の事実・数値の要約で、図や写真は含まない（出典は各ファイルに書いてある）。ただし **skills/gnoto-lite フォルダには別のライセンス**（skills/gnoto-lite/LICENSE。ソースは読めるが、Claude の外での再利用を禁じる条件）がある。

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
| **reportkiller** | Writes and revises academic reports, essays and papers in any field (Word plus figures): a citation ledger that forbids citing what was not read (levels V0 to V3), six levels from high school to conference paper, style and figure checks, and architecture case studies with drawings (with notes on Frank Lloyd Wright and Le Corbusier) | "Write a report", "Fix this paper", "Remove the AI tone", "Fix this figure" |
| **gnoto-lite** | Creates, edits and previews GNOTO notes (.gnoto files; normal and slide styles only) inside Claude. Its law mode fetches statutes and court decisions through a connector (or, without one, the official e-Gov and courts pages) and writes them with their sources | "Make a note", "Add this article to the note", "Add this decision" |
| **laba-textbook** | Lays text out as a textbook page: splits it into roles (body, worked example, side note, key points, figure) and writes a GNOTO page note (.gnoto, slots and text only) following textbook layout rules; builds and checks textbook-style figure descriptions (flow, tree, table, timeline, relation). It holds no textbook images or text, only measured numbers and rules | "Lay this out like a textbook", "Make the figure textbook-style" |
| **laba-book** | Writes a textbook chapter from a word, a field or a titled source, in the order scope, outline, text, and keeps adding chapters (the book state lives in book.json, one chapter per run). The text is held to measured textbook numbers (sentence length, paragraphs, headings, bold) and checked and revised with a script. It holds no textbook text, only numbers and rules | "Make a textbook on ...", "An introductory chapter on this field", "Write a textbook section from this source", "Write the next chapter" |

The four entry skills (laba-hanrei, laba-slides, laba-figures and laba-score) only open the relevant part of the main skill (skills/laba). The rules and tools exist in one place, in the main skill. reportkiller is a separate skill with its own rules and tools; it is not used for lecture notes, case studies or slides, which the skills above handle. The seminar-report conventions (citation grading, style, layout), the slide style and the claim-defence-rebuttal rules for worked cases live inside laba-hanrei, laba-slides and laba; seminar, presenter and teacher names are never built in but asked for or read from a settings file.

## Faster runs (1.3.0)

Running every stage one after another in a claude.ai chat is slow. The plugin now shortens the waiting without weakening the accuracy safeguards (see skills/laba/references/speed.md, written in Japanese):

- **Batched lookups.** Statute, decision and bibliography lookups that do not depend on each other are issued together in one turn instead of one by one, within the connector limits (at most 15 calls per turn, at most 5 of them for court decisions; the connector allows 30 requests per minute).
- **Concurrent scripts.** The check pipeline runs its independent checks at the same time; diagram generation and PNG conversion handle many figures in one call; one script builds the Word file, converts it to PDF and runs the checks in one call.
- **Fast path.** For light requests (one topic and a short source; a request for speed alone does not qualify) some stages are shortened. Statute and decision verification, the "unverified" marking, the rules for added text and the coverage check are never skipped.
- **Capped revision loop.** The check, fix and score loop runs at most twice by default.
- **Agents in Cowork and Claude Code.** The agents folder defines a verifier, section writers, a figure maker, a back-matter builder, a harmonizer, four independent reviewers, and a five-member deliberation panel (five agents with different interpretive methods who write separate opinions on open questions; the note then shows the vote, majority and dissenting opinions, and the premise on which they divide, labelled as the plugin's own analysis and not as the view of any court or scholar). In claude.ai chat, plugin agents and hooks are not loaded (documented platform behaviour), so the same split is done by one assistant.

Measured on a made-up sample on a 4-core machine: the 20 checks went from 0.87 s to 0.27 s, and 45 diagrams with PNG output from 12.2 s (one call per diagram) to 2.3 s. The reduction in assistant round trips (about 110 to about 30) is an estimate, not a measurement.

## Results so far

See the scoreboard in the main skill's SKILL.md. It keeps three kinds of figures apart: scores given by an independent grader who did not write the note, figures measured by the bundled check scripts, and self-assessment by the author (which is not reported as a result).

## Installation

- **claude.ai and the desktop app**: once the plugin is listed in the directory, find laba under Customize, then Plugins, then Discover, and add it. Before it is listed, zip this repository and add it under Customize, then Plugins, then Add, then Upload plugin.
- **Claude Code**: once listed, install it from `/plugin directory`. To try it locally, run `claude --plugin-dir <this folder>`.
- **Full edition (with scripts) from GitHub** (docs: https://code.claude.com/docs/en/plugins/create-marketplace; claude.ai and Cowork: https://claude.com/docs/plugins/overview):
  - Claude Code: `/plugin marketplace add Yoshiaki-Takashita/Laba-plugin@release`, then `/plugin install laba@laba-marketplace` (in a shell: `claude plugin marketplace add ...` and `claude plugin install ...`). The `release` branch is the distribution build without tests; `main` is the development branch and also holds the tests and their materials.
  - claude.ai, the desktop app and Cowork: under Customize, Plugins, Add, choose Add marketplace and enter `Yoshiaki-Takashita/Laba-plugin`, or upload a zip made with `bash tools/build-dist.sh out.zip` through Add, Upload plugin. Whether a branch can be named there is unknown.
- **Directory edition (instructions only)**: the version submitted to Anthropic's directory contains no scripts (the `directory` branch, built with `bash tools/build-dist.sh --directory [out.zip]`). It has the same instructions; Claude writes its own code in the session to build Word, slide, figure and GNOTO files, and checklists replace the automated checks. Its README.md on the `directory` branch explains the differences. Both editions have the same plugin name (laba), so install only one.
- To check statutes and court decisions with tools, register a connector separately (see CONNECTORS.md). The plugin also works without one.

## Requirements

- **Python 3 and Node.js**: install them first if you use Claude Code on your own computer. On claude.ai and in the desktop app, Claude's sandbox normally has them (Claude tells you if not).
- **python-docx, python-pptx, pptxgenjs and sharp**: if any are missing, Claude installs them during the task (in Claude Code, allow it when asked). To install them in advance, run `pip install python-docx python-pptx` and `npm install -g pptxgenjs sharp`. Without sharp, diagrams are still produced as SVG; only the PNG conversion is skipped.
- **A Japanese font**: install one, for example Noto Sans CJK, if none is available.
- gnoto-lite alone needs only the Python 3 standard library (python-docx only for Word export; a Chromium-based browser only for PNG thumbnails).

## What the plugin runs and accesses

- **Local scripts.** The skills ask Claude to run the Python and Node.js scripts bundled under skills/laba/scripts. They read your source files and write Word documents, slide files, and images in your working folder. Several of them are started at the same time as separate local processes (the check pipeline, and diagram conversion with the sharp library). build_and_check.py also runs LibreOffice (soffice) in headless mode on the Word file it just wrote, to make a PDF, if LibreOffice is installed. None of these make network requests.
- **Agents.** The agents folder holds fifteen plain-text agent definitions (Markdown files) (a verifier, section writers, a textbook section writer, a figure maker, a back-matter builder, a harmonizer, reviewers, and five deliberation-panel members). They are loaded only in Cowork and Claude Code. The reviewers and the panel members are given no file-editing tools: they can only read files (the style reviewer can also run the local text checks). They report findings and never change the note. The verifier uses whatever connector you registered, or the public web pages named in the next item.
- **One script that goes online.** skills/laba/scripts/case_lookup.py, when Claude runs it for you, queries the Courts of Japan case-law search (www.courts.go.jp) by decision date and downloads the result page and the decision's PDF (Python standard library, falling back to your installed curl). It sends only the search conditions (date and court level), never your text or personal data. The PDF is only converted to text locally (pdftotext or a Python PDF library); nothing downloaded is executed. All other bundled scripts make no network connections.
- **Web access for verification.** To check statutes and court decisions, the skills tell Claude to look up the official e-Gov law database (Japanese Digital Agency) and the Courts of Japan case-law search. They read public pages only and send no personal data.
- **gnoto-lite scripts.** skills/gnoto-lite/scripts is a plain note-file writer and renderer in Python 3 (standard library only). It reads and writes .gnoto files you name, writes a self-contained static HTML preview, and, only if a Chromium-based browser is installed and you ask for a PNG, starts that browser in headless mode on a temporary local file. For Word export it calls the bundled build_docx.py. The scripts make no network requests and contain no statute or case data and no citation parsing. Statutes and decisions are fetched by Claude through your own connector or the official public pages, saved as JSON by Claude, and the scripts only format that JSON into ordinary note blocks with its provenance.
- **reportkiller scripts.** skills/reportkiller/scripts holds plain-text checkers in Node.js (no packages) and Python 3 (standard library only). They read the manuscript, ledger or SVG files you name and print findings. One tool, archstudio/cli.js, writes architectural drawings (SVG) from a building-data JSON file to the output folder you give it. None of them make network requests or start other programs. Literature searches (for example J-STAGE, CiNii and publishers' bibliographic pages) are done by Claude, as the skill's instructions describe, and read public pages only; your text and personal data are not sent. The folder also contains reference notes (Markdown and JSON) on two modern architects: summaries of public facts with their source URLs, and no copied drawings or photographs. The notes for each work are plain text read by Claude when needed.
- **No hooks, no bundled servers.** The plugin contains no hooks and no MCP server configuration. It sends nothing anywhere on its own.

## Using gnoto-lite

1. Ask, for example, "Put this in a GNOTO note" or "Add this article to the note". Claude writes a .gnoto file in your working folder and builds a static HTML preview to show you.
2. Open the .gnoto file with the import function in the GNOTO note list. It creates a new note in the Imported genre and never overwrites an existing one.
3. Statutes and decisions come from the connector you registered in your own Claude (see CONNECTORS.md) and are written with their sources. Without a connector, Claude reads the official e-Gov and courts pages and writes only what it could read. "Every statute and every decision" is not available: only what the official sites publish (Supreme Court decisions on the courts site).
4. The main laba skill can also deliver a lecture note as a GNOTO note, next to Word.
5. The gnoto-lite scripts only read and write files in your working folder and make no network connections. If you put an https image URL into a note, the browser loads that image when you open the preview (or when a PNG is made).

## Connector (optional)

The plugin works without any connector. If you have a connector for Japanese legal data that you set up yourself, see CONNECTORS.md (written in Japanese). Never put a connector URL that contains a secret into this plugin.

## License

The plugin as a whole is MIT (see LICENSE), including skills/reportkiller (its rules and tools, the architectural drawing tool, and the research notes on Wright and Le Corbusier, which summarize public facts with sources and contain no copied drawings or photographs). The skills/gnoto-lite folder has its own, separate licence (skills/gnoto-lite/LICENSE): a source-available licence that allows use inside Claude as part of this plugin and forbids extracting, porting or reusing it to provide note or law-mode features outside Claude.
