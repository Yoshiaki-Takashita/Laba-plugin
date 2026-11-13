# scripts/slides：発表スライドを作る道具

| ファイル | 役目 |
|---|---|
| `build_deck.js` | 構成（JSON）から .pptx を作る。切ってよい位置での改行（語・条文番号・判例の表記の途中では切らない）、収まる最大の文字サイズ、関係図・相関図の自動配置、時系列の段ごとの展開、進行表（`--outline`）。下書きの印・仮の文字・語の途中の改行があれば止まる |
| `deck_lint.py` | 出来た .pptx の体裁を検査する。29項目（役割ごとの文字の下限、作る人への指示文、小さな図の画像、濃い塗りを含む）。PDF にして描画した後の行も読む（指定していない改行、1〜2字の行、枠の外の文字、文字の重なり）。ほかに、はみ出し、文字の下限、文字量、余白、枠の中の空き、色、画像、装飾、指定した改行の位置、仮の文字、見出しの番号・有無・長さ、太字の割合、強調の多すぎ、太い矢印の数、原稿の抜け。閾値は、完成版として認められた資料が error 0 で通るように較正してある。悪い例 34 件の回帰試験は `tests/bad_cases.py` |
| `note_to_deck.py` | 講義ノート（ブロックの JSON・.py・.docx・全文テキスト .txt）から、復習用スライドの構成の下書きを作る。ざっくり理解・表（論点カード、正誤の表を見分ける）・図（図題の語から型を選ぶ）・結論を型に当てはめ、直す所に `_todo` を付ける |
| `lib/severity.json` | 作成（build_deck.js）と検査（deck_lint.py）が共通に読む重さの決まり（余白の閾値、参考文献の枚は warn どまり） |
| `lib/tokens.js` | 寸法・書体・文字サイズ・線・色の定数（`references/slides/01-tokens.md` と対応） |
| `lib/textfit.js` | 文字の幅の見積り（和文と英数字の境の空きを含む）、切ってよい位置と優先順位、枠に収める文字サイズの決定 |
| `lib/components.js` | 部品13種：文字、枠、条文の枠、見出しと区切り線、帯、ピクト（18種類の絵柄）、当事者、当事者の箱（相関図）、矢印・線、表、流れの箱、縦に積む配置（横に並べる枠を含む）、関係図（lib/diagram.js） |
| `lib/diagram.js` | 関係図（当事者の格子配置、矢印の切り詰め、ラベルの重ならない配置、線が当事者の上を通る配置・注記の重なりの検出） |
| `lib/layouts.js` | スライドの型33種（`references/slides/02-layouts.md`） |
| `specs/hanrei_sample.json` | 見本：架空の事件の判例研究（24枚、teal、1枚平均 170 字前後。相関図 → 当事者 → 時系列 → 争点の順。`scripts/hanrei/samples/resume_sample.json` と番号が1対1） |
| `specs/note_review_sample.json` | 見本：講義ノートから起こした復習スライド（10枚、mono、1枚平均 190 字前後） |
| `specs/more_layouts_sample.json` | 見本：2つの見本に出てこない型を集めたもの（11枚、teal、1枚平均 160 字前後。整理軸・場合分け・正誤・時間軸など） |
| `specs/config.example.json` | 利用者ごとの値（所属・報告者・発表日・配色・途中で切らない言い回し）の見本。既定は空欄 |
| `tests/textfit_test.js`、`tests/lint_regress.py`、`tests/midword_spec.json` | 回帰試験。改行の決まり（語の途中で切らない、1〜2字の行を作らない）と、検査が語の途中の改行・仮の文字を見つけること。独立の採点で語の途中で折れた3枚と同じ文を使う |

## 用意

```
npm install -g pptxgenjs          # スライドを作る（Node.js 18 以上）
pip install python-pptx           # 検査
# 描画した後の検査と、画像にして目で見るとき：LibreOffice（soffice）と poppler（pdftotext・pdftoppm）
```

スキルには node_modules を入れていない。`require('pptxgenjs')` が通らないときは、`NODE_PATH` に全体導入先（`npm root -g` の出力）を入れる。

## 使い方

```
# 1 作る（config.json は構成と同じフォルダにあれば自動で読む）
node build_deck.js specs/hanrei_sample.json out.pptx --outline outline.md
node build_deck.js specs/note_review_sample.json out.pptx --theme teal      # 配色を変える

# 2 検査する（error があれば終了コード 1。PDF にして、描画した後の行も読む）
python3 deck_lint.py out.pptx --json lint.json

# 3 画像にして全枚を見る
soffice --headless --convert-to pdf out.pptx && pdftoppm -r 60 -png out.pdf page

# ノートから下書きを起こす（.json・.py・.docx・.txt を読める）。下書きは _todo が残るので --draft で見る
python3 note_to_deck.py ../sample_blocks.json draft.json && node build_deck.js draft.json draft.pptx --draft --allow-warn
python3 note_to_deck.py ノート.txt draft.json --only 12-3-4                 # 全文テキストから、1節だけ

# 回帰試験
node tests/textfit_test.js && python3 tests/lint_regress.py
python3 note_to_deck.py ノート.json draft.json --only 12-3 --tf 正誤.json     # 章を絞る。正誤の問いを末尾に足す
```

`note_to_deck.py` の主な指定：`--only 見出しの先頭`（その章・節だけ）、`--max-points 4`（1枚の要点の数）、`--budget 30`（枚数の目安。超えると知らせる）、`--with-advanced`（「発展」の小見出しも入れる）、`--tf FILE`（`{"items":[{"q","a","basis","why"}]}` を正誤の枚にする）、`--hide-answers`（正誤の印を「？」にする）。下書きは、長い文がそのまま入っている。`_todo` を片づけてから仕上げの作成に掛ける。

`deck_lint.py` の指定：`--json 出力`、`--theme teal|mono`（省くと使われている色から推定）、`--strict`（warn でも終了コード 1）、`--draft`（仮の文字を warn にとどめる。渡す資料には付けない）、`--no-render`（描画後の検査を省く）、`--keep-pdf フォルダ`（検査で作った PDF を残す）、`--allow-pictures`（画像をすべて許す）、`--no-pictos`（小さいピクト画像も error にする）。

`build_deck.js` の知らせは3種類ある。

| 種類 | 中身 | 終了コード |
|---|---|---|
| 直す所 | 収まらない文字、語の途中の改行・1〜2字だけの行、置けないラベル、線が当事者の上を通る、注記の重なり、無い型、420字を超える枚 | 1（`--allow-warn` で続行） |
| 下書きの印・仮の文字 | `_todo`、「（役割）」「（関係）」「（…を書く）」「（…を1行で）」「（…確認して書く）」「【要確認】」 | 1（`--draft` で続行） |
| 確かめる所 | 余白が多い枚、75字未満の枚、330字を超える枚、15pt 未満の本文、全角8字を超えるラベル、図の片寄り、参考文献の枚の空き、平均 150字未満 | 0（作成は続く） |

表紙の報告者・発表日が未設定のときは、仮の文字を入れて知らせるだけで止まらない。`--draft`・`--allow-warn` で作ったものは渡さない。

指定：`--config ファイル`（探す順：指定 → 構成と同じフォルダの `config.json` → 環境変数 `LABA_CONFIG` → `~/.config/laba/slides.json`）、`--theme teal|mono`、`--kit kit_profile.json`（利用者の完成版に色と書体を合わせる。`scripts/hanrei/kit_measure.py` で作る）、`--outline 進行表.md`（枚ごとの文字数・本文の最小 pt・原稿の字数・目安の秒）。構成の `meta.keep` に、途中で改行させたくない言い回しを書ける。

文字数の数え方は、`build_deck.js`（進行表）と `deck_lint.py` で同じ（見出し・大項目名・頁番号を除き、空白を数えない）。

## 構成の書き方（最小の例）

```json
{ "meta": { "title": "…", "theme": "teal" },
  "slides": [
    { "type": "cover", "kind": "判例研究", "theme": "〜…〜", "info": ["最高裁判所　…判決"] },
    { "type": "section", "name": "１．前提知識" },
    { "type": "statute", "heading": "1. …", "statutes": [{ "name": "民法○条", "text": ["…"] }], "points": ["…"], "here": ["…"] }
  ] }
```

型と項目の一覧は `references/slides/02-layouts.md`。

## 型を足すとき

`lib/layouts.js` に `L.名前 = (ctx, sl) => { const s = base(ctx, sl); … return s; }` を足す。配置は `kit.stack()`（上から積む）で書けることが多い。足したら `references/slides/02-layouts.md` に項目を書き、見本の構成に1枚入れて、作成→検査→画像で確かめる。色・文字サイズ・線の太さは `lib/tokens.js` の値だけを使う。
