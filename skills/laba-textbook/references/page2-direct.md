# GNOTO の紙面（page2）へ直接出す手順：スロット経由と座標つきの 2 経路

Laba の文章を GNOTO の紙面ノート（style=`page`）にする経路は 2 つある。**既定は 1（スロット経由）**。2 は「いま GNOTO が `lite`（スロットの控え）から箱を置かない」ことの回避と、配置の細部を詰めたいときの手順。
教科書の文・画像・図のデータは入っていない（座標・形・数値だけ）。印：［測］／［推］／［不明］。

| 経路 | Laba が書くもの | 組むのは | 使うとき | 検査 |
|---|---|---|---|---|
| **1 スロット経由**（既定） | フォーマット・変種・ページの種類・スロットと文・図の記述（座標なし） | GNOTO（フォーマットから箱・部品・柱を決める） | 通常。座標を間違えない・短い・付け替えできる | `textbook_page.py build`／`check` |
| **2 座標つき（直接 page2）** | ＋ページごとの部品（`page2.parts`）と箱（`page.pages[].boxes`）の座標 | Laba（式で計算）。GNOTO は描くだけ | GNOTO が `lite` を解決しない版で、組んだ後の見た目まで出したいとき | `page2_direct_check.py`＋GNOTO で開いて見る |

`output-format.md` の 4 のとおり、GNOTO の版しだいで 1 の出力は「未配置」で開く。そのときは 1 の `.gnoto` を渡したうえで、利用者が望めば 2 を作る（**2 は GNOTO で開いて目で確かめるまで「確かめていない」と書く**。この環境では GNOTO を開けない）。

## 1. 直接 page2 の形（観察した形・G44〜G55 の変換が書く）

```
note.style = "page"
note.content.rows[]            文の正本（1 段落＝1 行・{html, htype, pid}）。空の行＝全角空白 1 字
note.content.page              v1 の影：{v:1, paper, margin[上,外,下,内], pages:[{id, boxes:[…], rules:[]}]}
note.content.page2             {v:5, paper{ratio,widthMm}, margin{top,bottom,inner,outer}, unit:"mm", origin:"tl",
                                tgrid{on,chars,lines,em(pt),pitch(行送り÷字),snap:"line",hang:true}, sideCol{on,w,gap},
                                folio{y,size,run,dot}, masters[body・bodynf・plain・free], styles{body,h2,h3,note},
                                pages:[{id,master,off?{x,y}}], parts:[{pg,id,part,x,y,w,h,z,prm{…}}],
                                fmt{id,variant,pages:{<ページ id>:"body｜bodyfig｜bodybox｜chapter｜figonly"}}, figs{…}, tx{…}, psface{…}}
```
- **本文の流し込み**：master が `body` のページの本文は、`page.pages[].boxes` の先頭の text 箱（x=0・y=0・w=10・h=10 の印）に `src.rows`（行の pid の並び）を入れる。GNOTO がマスターの枠（版面）に流す。箱の座標を自分で計算しない［観察］。
- **本文以外の文字**（事例の中の文・傍注・見出し以外の小さい字）は、**座標つきの text 箱**（`kind:"text"`・x・y・w・h・size（pt）・lead（行送り÷字）・align）に `src.rows` を入れる。
- **飾り**（見出しの数字・罫・丸・枠・図の札・章扉の帯）は `page2.parts`。`part` は次の 24 種だけ：band-title・outline-num・rule-dot・bar-pair・case-frame・fig-tag・fig-frame・folio・chapter-band・side-note・column-box・note-rule・toc-line・toc-chapter・fig-shadow・gray-head・dotted-box・corner-box・gray-column・shaded-table・foot-rule・model-frame・photo-band・fig-box。知らない名前は落ちる。
- **図**：`fig-box`（`prm.fig`＝`page2.figs` の id・`kind`・`frame`）が箱を作り、中身は図の記述（`figs`）を GNOTO の `pgFigSVG` が描く。記述の型・規模・プリミティブ（rect・line・poly・curve・ellipse・text・pict・group・table・graph）は `figure-spec.md` と GLYPH の `FIGURE-PRIMITIVES.md`。**Laba は型（G1〜G7）の記述までで、プリミティブの座標は書かない**（`figure_svg.py` の SVG を別に添える）［推］。
- ページの骨組みの実例（B1 の本の型・文なし）：`templates/page2-types.json`（chapter・body・bodyfig・bodybox）。

## 2. 手順（経路 2）

**S1 本の型を読む**：`textbook_page.py slots --format fam-f1 --variant b1` と `formats/fam-f1.json` の `base`・`variants` から、紙の幅（148 mm）・縦横比・字詰め・行数・字の大きさ（pt）・行送り比・余白（上・下・内・外）・傍注の列（w・gap）を取る。**行の高さ（mm）＝em(pt)×pitch×0.3528**（B1：9.06×1.805×0.3528＝5.77 mm）。本文の幅＝字詰め×em×0.3528（89.5 mm）。
**S2 役割に分けて長さを数える**：`placement-judgment.md` §1〜3。各段落の行数＝ceil(字数÷字詰め)（句読点・約物で超える行は 1 行足す）。
**S3 ページに割り当てる**：§3 の容量の計算で、1 ページに入る見出し・枠・図・本文の行を決める。ページの種類（§2）を決める。章の最初は chapter。
**S4 行（rows）を作る**：本文の段落は字下げ 1 字（全角空白）で 1 行 1 段落。**見出し・枠・図がかかる行ぶん、全角空白だけの段落を入れる**（§5）。見出しの 1 行見出し（項・目）は見出しの段落（`htype` は水準：`"2"`＝節・`"3"`＝項。`output-format.md`）で入れ、部品にしない（RX8）。
**S5 部品を置く**：本文の天（`margin.top`）から**行番号**で y を出す：y＝margin.top＋（行番号−1）×行の高さ（偶数ページの x は鏡像：内余白が右になる）。`templates/page2-types.json` の部品の `prm` を写し、`text`・`no`・`label` だけ差し替える（罫の太さ・色・丸の径は変えない＝装置の値・RX9）。
- 節見出し（outline-num）：x＝本文の左端・y＝見出しの行の上端。事例の枠（case-frame）：x＝本文の左端・w＝本文の幅・h＝（枠の中の行数×枠内の行送り）＋上下の内余白。枠の中の文は text 箱（0.885 字・行送り 1.57 倍）。
- 傍注（side-note）：x＝外側の傍注の列・y＝参照のある行の高さ。傍注の文は text 箱（0.7 倍・行送り 1.65 倍）。
- 図の札（fig-tag）：本文の左端・図の上。図の箱（fig-box）：本文の幅・高さ＝本文の 6〜8 行。
**S6 ページの対応を書く**：`page.pages[]` と `page2.pages[]` に同じ id を入れ、`page2.fmt.pages` に id→種類。偶数ページ・奇数ページで `margin.inner` と `outer` の向きが入れ替わる（GNOTO が `masters[].mirror` で処理）。ページごとのずれは `page2.pages[].off`（mm・±5.5・RX25）。
**S7 検査する**：`python3 ${CLAUDE_PLUGIN_ROOT}/skills/laba-textbook/scripts/page2_direct_check.py ノート.gnoto`（部品の名前・矩形が紙の中・id の対応・箱が指す行の存在・pid の重複）。誤りがあれば直す。**見た目は GNOTO で開いて確かめるまで「確かめていない」**。
**S8 渡す**：`.gnoto`。経路 1 の `lite` も併せて持たせてよい（GNOTO が解決する版になったときの正本）。報告に、使った経路・検査・確かめていないこと（GNOTO で開いて見たか）を書く。

## 3. やってはいけないこと

- 部品の `prm` の数値（罫の太さ・丸の径・色）を目分量で変える。装置の値を正にする（RX9）。
- 本文の箱の座標を自分で決める（マスターの枠に流す）。
- 空の行を入れずに飾りを置く（本文が飾りの下に入って位置がずれる・RX5）。
- GNOTO が描けない `part` 名を作る（落ちる）。
- 教科書の文・図の中の語を書き写す。
- GNOTO で開いていないのに「配置を確かめた」と書く。

## 4. 不明・確かめていないこと

- GNOTO が将来 `lite` を解決する版で、経路 2 の部品と二重に描かれるか（`lite` を持たせたまま部品も置くと重なるかもしれない。［不明］。経路 2 で渡すときは `page2.lite` を外すのが安全）。
- 傍注の各注の頭の細罫・番号の位置・目次（toc）・節末の要点の箱。
- 偶数ページの鏡像（B4 は標本が無い）。
- 座標の式は B1 で確かめた。B2〜B5 は `formats` の値から同じ式で計算できるはずだが、見た目は確かめていない。
