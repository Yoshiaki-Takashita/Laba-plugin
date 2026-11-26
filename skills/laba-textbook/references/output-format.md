# 教科書どおりの配置の出力：スロットと文だけの .gnoto

## 1. 方式

Laba は `.gnoto` に **フォーマット名・変種・ページごとのスロットと文・図の記述** だけを書く。座標・色・書体・字の大きさ・番号・柱は書かない（GNOTO が開いたとき、フォーマットから箱・部品・柱を決める）。利点：Laba が座標を間違えない／フォーマットを付け替えても文が欠けない／出力が短い。代償：**Laba の側では、組んだ後の見た目が見えない**。確認は ①機械の検査（`textbook_page.py check`）②スロットの一覧（`preview`）③GNOTO で開いた画面。

## 2. 入力 JSON（Laba が書くもの）

スキーマ `schema/laba-page-input.schema.json`・見本 `samples/f1-b1-input.json`（意味のない文）。

```jsonc
{"format":"fam-f1","variant":"b1","title":"…",
 "figs":{"f1":{"kind":"flow", …}},                        // figure-spec.md の記述
 "pages":[
  {"master":"chapter","slots":{"title":{"text":"…"},"overview":{"text":"- 論点 1\n- 論点 2"}}},
  {"master":"body","slots":{                               // master 省略＝body。スロットは読む順に書く
     "h2":{"text":"…"},
     "body":{"text":"本文。**定義語**は太字。[^n1]\n\n次の段落。"},
     "aside":{"items":[{"ref":"n1","no":"1","text":"補足。"}]},
     "box":{"text":"事例。"},
     "fig":{"fig":"f1"} }}]}
```
- 値は `text`（`md`・`text` の種類）／`items`（`notes`。`ref` は本文の印 `[^キー]`。`no` は省略可）／`fig`（`figs` の id）。座標・色・`html`・`style` は入力のスキーマが拒否する。
- 知らないスロットの文は捨てず本文の末尾に入れ、警告する。必須スロットの欠けは誤り。目安の字数の超過は警告（誤りにしない）。

## 3. 出力 .gnoto の形（`textbook_page.py build` が書く）

```jsonc
{"glyph":"note","version":1,"app":"GNOTO","note":{"title":"…","style":"page","n":0,
 "content":{"title":"…",
  "rows":[[{"html":"…","htype":"2","pid":"r_195f8c"}], …],      // 文の正本。各ブロックに pid（r_＋6 字）
  "page":{"v":1,"paper":{"size":"custom","orient":"portrait","w":148,"h":210.46},
          "pages":[{"id":"p1","boxes":[],"rules":[]}, …]},         // v1 の影：箱は空・ページの数と id だけ
  "page2":{"v":2,"paper":{"ratio":1.422,"widthMm":148},
           "fmt":{"id":"fam-f1","variant":"b1","v":1,"widthMm":148},
           "pages":[{"id":"p1","master":"chapter"}, …],
           "lite":{"v":1,"pages":[{"id":"p1","master":"chapter","title":["r_…"],"overview":["r_…"]},
                                  {"id":"p2","master":"body","h2":["r_…"],"body":["r_…"],"box":["r_…"],"fig":"f1",
                                   "aside":[{"ref":"r_…","no":"1","rows":"r_…"}]}]},
           "figs":{"f1":{…}}}},
 "books":[],"pen":[]}}
```
- **`page2.lite` が「スロットの控え」**：スロット名ごとの pid の並び。GNOTO の読み込みが残す形に合わせてある（キー名は英字で始まる 32 字以内・`style` `src` `href` `html` は不可・文字列に `<` `>` を含めない・入れ子は 5 段まで）ので、注の rows は空白区切りの 1 つの文字列、図の木は平らな `parent` 形にしている。`check` がこの規則を先に見る。
- **注の参照**：本文の `[^キー]` を `<sup>番号</sup>` に置き換え、`aside[].ref` は印のある段落の pid（GNOTO が傍注を行の高さに置くため）。印の無い注は `ref` を省き警告。
- **pid** は入力の位置から決まる（同じ入力は同じ出力）。GNOTO は乱数で付けるが形は同じ。
- 文のマークダウンは最小限（`#`〜`###`・`- `・`1. `・太字）。GNOTO の `mdToRows` とは同じではない［不明な差が出うる］。

## 4. GNOTO で開いたときの現状（確かめた範囲）

| 項目 | 結果 |
|---|---|
| 開ける（style=page として）・文が全部残る | 確認済み（ヘッドレスのブラウザで、F1〜F3 の見本を読み込み。GNOTO の版は検査した時点のもの） |
| `page2.fmt`・`pages`・`lite`・`figs`（図の線種 `line` を含む）が読み込みの無害化を通って残る | 確認済み |
| **`lite` を読んで箱を置く（スロット→箱の解決）** | **GNOTO はまだしない**。開くと箱 0・文は「未配置」の段落として出る。GNOTO 側で、`lite` と `fmt` からフォーマットを当て、ページの種類（章扉・本文・本文＋図・本文＋囲み）を選び、スロットの箱へ pid を入れる処理が要る（検査では、公開されている関数だけでその処理を書いて、箱が置かれ全 pid が入り文が欠けないことまで確かめた） |
| 図（`figs`）を GNOTO が描く | 確かめていない［不明］。描けない版では、`figure_svg.py` の SVG を別に渡す |
| 傍注の列が無い変種（b2・b5）での `aside` の置き場所 | 不明 |
| 目次（toc）・節末の要点（point）の専用の箱 | 無い（point は本文の流れに入る） |

**だから、いま Laba が利用者に伝えること**：「文・ページの種類・図の記述は .gnoto に入っている。GNOTO の版によっては、開いた直後は箱が置かれず文が『未配置』で出る（GNOTO 側のスロットの解決が入った版で、教科書どおりの配置になる）」。見た目を確かめていないものを、確かめたとは書かない。

## 5. 渡し方

- `.gnoto` ファイルとして渡す（Claude の中の GNOTO Lite（`gnoto_open` のコネクタの道具）は **normal と slide だけ**。紙面スタイル `page` は開けない）。`preview` の HTML（スロットの一覧）を添えてよい。**一覧は見た目の確認ではない**と書く。
- 利用者が GNOTO の読み込みで開くと、「インポート」ジャンルに新しいノートができる（上書きしない）。
- Word にも欲しいと言われたときは、ノーマルの講義ノート（laba 本体）として別に作る。紙面の `.gnoto` を Word に変換する道具は無い。

## 6. 走らせたもの・不明

- 検査：`python3 textbook_page.py check`（形・pid・HTML の許可・GNOTO が落とす形）。`tests/test_textbook.py`。
- GNOTO を実際に開く確認は、GNOTO の開発側の試験（`laba-textbook-open.test.js`）にある。Claude の実行環境（チャット）では GNOTO を開けないので、そこでは「開く確認は走らせていない」と書く。
- 不明：GNOTO の将来の版が `lite` を別の形で読むかもしれない。その版の仕様が出たら、このファイルと `schema/page2-lite.schema.json` を直す。
