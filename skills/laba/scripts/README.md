# scripts（道具の一覧）

講義ノート・図・スライド・判例研究の道具をまとめて置いてある。機械の検査が見るのは形だけである。法的に正しいか、意味がずれていないかは、本文を書いていない点検者が見る（`../references/verification.md`）。

## 導入

| 要るもの | 入れ方 | 使う道具 |
|---|---|---|
| Python 3.9 以降 | — | 全部の `.py`（標準ライブラリだけで動くものが大半） |
| python-docx | `pip install python-docx` | `build_docx.py`、`hanrei/resume_build.py` |
| python-pptx | `pip install python-pptx` | `slides/deck_lint.py` |
| Node.js 18 以降 | — | `fig_build.js`、`figgen/`、`slides/build_deck.js` |
| sharp | `npm install -g sharp` | 図の PNG 化（`figgen/cli.js --png`、`fig_build.js`）。無くても SVG は出る |
| pptxgenjs | `npm install -g pptxgenjs` | `slides/build_deck.js` |
| 日本語の書体（Noto Sans CJK JP など） | OS の方法で | 図の PNG、スライドを画像にして見るとき |
| PDF→テキスト（pymupdf・pdfminer・pdftotext のどれか） | `pip install pymupdf` など | `case_lookup.py --save`（判決全文の保存） |
| LibreOffice（soffice） | OS の方法で | docx・pptx を PDF にして全頁を目で見るとき |

`npm install -g` で入れたものを Node が見つけないときは、`export NODE_PATH=$(npm root -g)` を先に実行する。`node_modules` はスキルのフォルダに入れない。

## 講義ノート

| 道具 | 何をするか |
|---|---|
| `inventory.py` | 資料から見出し・判例・条文・相互参照・問いを抜き出す |
| `coverage_check.py` | 一覧とノートを照合し、欠落を挙げる。`--ignore` で、機械の誤検知を理由つきで除く |
| `style_profile.py`／`style_check.py` | 資料の文体を数値にする（`profile.json`）／ノートの本文を資料の値（または既定値）と比べる |
| `match_check.py` | 資料と同じ文が続く箇所を数える（生の値と、術語などを除いた値の両方） |
| `word_swap_check.py` | 語の置き換えで済ませた文、資料に出ない語、解説書に出にくい言い回しを拾う |
| `certainty_check.py` | 確度の語が保たれているかを並べる。層つきで、足した層が留保を落とした候補も出す |
| `cite_check.py` | 判例の書誌・条文の表記ゆれと食い違いを見る |
| `statute_check.py` | ノートが引く条文を一覧にし、資料にない条文・限定語の落ちを挙げる（現行条文との照合の下準備） |
| `definition_check.py` | 資料とノートの定義文を術語ごとに並べた照合表。落ちた語の候補、ノートの中の食い違い |
| `density.py` | 論証密度・具体例密度・重複率・体系連関を測る |
| `argument_check.py` | 段落ごとの論証の型と、層ごとの論証密度。理由のない塊、根拠のない補足を挙げる |
| `info_efficiency.py` | 層の間の重複、言い直しの層、節ごとの分量比、削る候補。巻末（中身のない列、巻末どうしの重複、本編に対する比） |
| `summary_dup_check.py` | まとめの数と、言い直しの割合 |
| `xref_index.py` | 概念の索引、相互参照と対比の一覧、資料の ⇨ の欠落。巻末の索引の表を作る（`--terms` の語は1節だけでも載せる。載せた語の数を出す） |
| `reason_source_check.py` | 判例の表で、理由の出所が分かれているか、空欄がないか。`--reasons` で、判示を書いたセルごとに判決全文の該当箇所の控えがあるか |
| `reason_table.py` | 判例ごとの理由の出所表を作り、検査する。理由の1点ごとに、抜き書きが判決全文にあるか、該当箇所の控え（頁・段落の冒頭）があるか、欄の文の術語が判決文にあるかを照合する。`locate` で該当箇所を書き込む。巻末の表を作る |
| `case_lookup.py` | 裁判所の裁判例検索を日付で引き、事件の一覧と全文を取る（1件ずつ。上流に負荷をかけない） |
| `card_build.py` | 論点カードの JSON を検査し、1論点1行の表のブロックにする（見本：`sample_cards.json`）。`--tf` で短答の表との重なりを見る |
| `derived_check.py` | 派生物（論点カードの各欄・短答の命題と根拠・まとめ・索引）を、根拠にした本文の箇所と照合する。留保の脱落、根拠の条文のずれ、根拠の節 |
| `tf_items.py` | 短答式の命題の候補を本文から拾い、仕上げた一覧を検査し、巻末の表にする |
| `yoken_table.py` | 条文つきの規律を要件・効果に分けた候補と、その所見 |
| `build_docx.py` | ブロックの列を Word にする。本文だけのテキストも出す（見本：`sample_blocks.json`） |
| `pipeline.py` | 検査を全部回し、採点し、`report.md` に「9.5 に届く条件のうち未達」と「次に直す点」を書く。互いに独立な検査は同時に走らせる（`--jobs N`、既定は CPU の数で最大 8。`--jobs 1` で1本ずつ。`--timing` で検査ごとの秒を出す）。結果は順に走らせたときと同じ |
| `build_and_check.py` | 図の PNG（任意）→ docx と本文テキスト →（PDF 化 ‖ 全部の検査）を1回で。PDF 化と検査が重なる。`--source` など、残りの引数は `pipeline.py` に渡る |
| `verify_plan.py` | 条文・判例の確認を「まとめて呼ぶ」ための表（同じ条・判例を1件にまとめ、法令名つきで並べ、組に分ける）。ネットワークは使わない |
| `score.py` | 機械の結果と点検者の採点から、総合点と判定を出す |
| `report_numbers.py` | 報告に書く数値（字数、分量比、頁数、判例・条文・表・図の数、論点・短答・索引の数、下が空く頁）を、数え方つきで出す。報告の数値はこの出力を写す |
| `run_checks.sh` | 基本の検査だけをまとめて走らせる簡易版（独立な検査は背景で同時に。新しい検査は `pipeline.py`） |
| `laba_blocks.py`／`laba_common.py` | 検査が共有する部品（層つきの読み込み、判例・条文の正規表現） |
| `example_profile.json` | 文体の実測値の見本（数値だけ） |

## 図

| 道具 | 何をするか |
|---|---|
| `figgen/cli.js` | 図の仕様（JSON）から SVG と 600dpi の PNG を作る。レンダラ17、用例43（`figgen/specs/`）。使い方は `figgen/README.md`。`batch 仕様… --outdir DIR --png`（と `all`）は、何枚もを1回で作り、PNG は同時に N 枚（`--jobs`） |
| `figgen/trace.py` | 図のラベル・数字・条文番号・言い切りが本文にあるかを照合する |
| `fig_lint.py` | 図（SVG）の規則の検査（error 10・warn 10） |
| `fig_build.js` | 手で書いた SVG を PNG にする |
| `templates/*.svg` | 手で書くときのひな形（7型）。エンジンにない形が要るときだけ |

## スライド（`slides/`）と判例研究（`hanrei/`）

| 道具 | 何をするか |
|---|---|
| `slides/build_deck.js` | スライドの構成（JSON）から pptx を作る。型32、部品12。見本は `slides/specs/`。使い方は `slides/README.md` |
| `slides/deck_lint.py` | pptx の体裁の検査（17項目） |
| `slides/note_to_deck.py` | 講義ノートのブロックから、スライドの構成の下書きを起こす |
| `hanrei/resume_build.py` | 判例研究のレジュメ（docx）を作る。使い方は `hanrei/README.md` |
| `hanrei/ledger.py` | 引用台帳の検査（13項目）。読んでいない文献の「」と頁を止める |
| `hanrei/resume_to_deck.py` | レジュメから、発表スライドの構成の下書きを起こす |
| `hanrei/sync_check.py` | レジュメとスライドの見出し・当事者・時系列が対応しているかを照らす（14項目） |

## まとめて走らせる

```
# 講義ノート：Word を作り、検査を全部回す
python3 scripts/build_docx.py work/blocks.py out/note.docx --comma-full --body-out work/body.txt --text-out work/note.txt
python3 scripts/pipeline.py --note work/note.txt --body work/body.txt --source work/source.txt --out work/checks \
  --blocks work/blocks.py --cards work/cards.json --reasons work/reasons.json --fulltext work/fulltext --tf work/items.json \
  [--default-law 民事訴訟法] [--coverage-ignore work/ignore.json] [--certainty-ignore work/certainty_ignore.json] [--reviewer work/reviewer.json] \
  [--index work/index.json] [--pdf out/note.pdf] \
  [--figs 'work/figs/*.svg'] [--fig-specs 'work/figs/*.json']

# 図：仕様から作り、検査し、本文と照合する
node scripts/figgen/cli.js work/fig1.json work/fig1.svg --png
python3 scripts/fig_lint.py work/fig1.svg --spec work/fig1.json
python3 scripts/figgen/trace.py work/fig1.json --body work/body.txt --fig 1 --strict

# スライド：構成から作り、検査する
node scripts/slides/build_deck.js work/deck.json out/deck.pptx --outline work/outline.md
python3 scripts/slides/deck_lint.py out/deck.pptx --json work/deck_lint.json

# 判例研究：レジュメを作り、台帳を検査し、スライドと照らす
python3 scripts/hanrei/resume_build.py work/resume.json out/draft.docx --text-out work/draft.txt
python3 scripts/hanrei/ledger.py work/draft.txt --ledger work/ledger.tsv
python3 scripts/hanrei/sync_check.py work/resume.json work/deck.json
```

`pipeline.py` は、図・スライド・判例研究の検査も任意の段として回せる（`--figs`、`--fig-specs`、`--deck`、`--ledger`＋`--resume-text`、`--sync-resume`＋`--sync-deck`）。渡したものだけ回る。

## 確かめ方（直したあとの回帰）

- 検査：`sample_blocks.json`・`sample_cards.json` と `../evals/materials/` の資料で `pipeline.py` を通す。
- 図：`figgen/specs/` の43本を全部生成し、`fig_lint.py` で error 0 を確かめ、PNG を目で見る。
- スライド：`slides/specs/` の見本3本を作り、`deck_lint.py` で error 0 を確かめ、全枚を画像にして見る。
- 判例研究：`hanrei/samples/` の見本で、`resume_build.py`→`ledger.py`→`sync_check.py`。
