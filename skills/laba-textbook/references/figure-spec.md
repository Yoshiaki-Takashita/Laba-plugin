# 図の生成の仕様：文章から図の記述（型＋要素）を作る

Laba が書くのは「型と要素」だけ。**座標・色・線の太さ・箱の大きさは書かない**（スキーマ `schema/figure.schema.json` が拒否する）。絵は GNOTO が型の規則から描く。.gnoto の外（Word・プレビュー）に図が要るときは `scripts/figure_svg.py` が同じ記述から SVG を書く（灰の濃さだけ・平ら・細い罫）。
図は画像（PNG）にしない（検索・修正・付け替えが効かなくなる）。印：［測］＝教科書の測定／［推］＝判断／［不明］＝未測定。教科書の個別の座標は測っておらず、**型の規則から描いた図が教科書の図と同じ見た目かは確かめていない**。

## 1. 流れ

```
文章 →(G1〜G6) 図の記述 JSON →(G7) figure_check.py →(確認) figure_svg.py で SVG にして目で見る → 入力 JSON の figs に入れる → textbook_page.py build
```
- 図の id は英小文字で始まる 16 字以内（`f1`・`flow_a`。数字で始まると GNOTO の読み込みで落ちる）。
- **使えないキー名**：`style`・`src`・`href`・`html`（GNOTO の読み込みが落とす）。辺の線種は `line`。文字列に `<` `>` を含めない。入れ子は 5 段まで（木は `root` の入れ子でなく、`nodes[].parent` の平らな形）。

## 2. 入力の仕様

全型の共通：`kind`（必須）・`caption{title, no?}`（題は名詞句・10 字以内が目安。`no` は書かない＝GNOTO が採番）・`width`（`text`／`wide`／`page`。表は wide、他は text が既定）・`note`（80 字まで）。

| kind | 必須 | 欄と上限 |
|---|---|---|
| flow | `nodes`・`edges` | `direction`（`down`／`right`）・`nodes[]`（≤14・`id`・`label`≤24・`shape`＝box/round/ellipse・`tone`＝base/key/mute・`group`）・`edges[]`（≤24・`from`・`to`・`label`≤12・`line`＝solid/dashed・`head`＝arrow/none/both）・`groups[]`（≤6・`id`・`label`≤16） |
| tree | `nodes` | `treeStyle`（bracket／nested／region）・`nodes[]`（≤24・`id`・`label`・`parent`＝親の id・根だけ parent なし・`tone`）。**根は 1 つ・3 階層まで・子は 6 まで** |
| table | `head`（2〜6 列）・`rows`（≤12 行） | `rowHead`・セル ≤40 字（目安 ≤20）。各行のセル数＝列数 |
| matrix | `head`・`rows`・`rowAxis`・`colAxis` | `corner`＝diag。各行のセル数＝列数＋1（先頭が行見出し） |
| timeline | `events` | `events[]`（≤8・`when`≤16・`what`≤30・`to`＝期間の終わり） |
| concept | `nodes` | `nodes[].group`＝入れ子の外側（groups の id か外側のノードの id）・`groups[]`・`edges`（任意） |
| relation | `nodes`・`edges` | `nodes[].pict`（person／building／land／none）・`edges[].line`（thick＝太い灰線／dashed／wedge＝楔／cancel＝取消線）・`head` |

辺の端は `nodes` の `id` と一致すること。`id` は `^[a-z0-9_]{1,16}$`。

例（flow・短縮。語は意味のない語）：
```json
{"kind":"flow","direction":"down","caption":{"title":"判断の流れ"},
 "nodes":[{"id":"a","label":"出発点"},{"id":"b","label":"条件を満たす"},
          {"id":"c","label":"結論 甲","shape":"ellipse","tone":"key"},{"id":"d","label":"結論 乙","shape":"ellipse"}],
 "edges":[{"from":"a","to":"b"},{"from":"b","to":"c","label":"はい"},{"from":"b","to":"d","label":"いいえ","line":"dashed"}]}
```
全型の見本：`samples/figs-examples.json`。

## 3. 描き方の規則（GNOTO・figure_svg.py が従う）

- **パレット**［測］：面＝薄灰 #c0c0c0〜#d8d8d8（大きい地ベタ #e7e7e7）／強調の面＝濃灰 #868686／楔＝#787878／線＝#222／表のヘッダ＝#d4d4d4〜#efefef／文字＝黒。**色相のある色は使わない**。`tone`＝base（白地＋細縁）・key（太い縁または薄灰ベタ）・mute（薄灰ベタ）。**1 図に key は 1 つまで**［推］。
- **線の太さ**［測・w1000］：枠・箱の縁 1.0〜1.5／表の罫 1.0／時間軸 約 3／関係図の太い灰線 9〜17／矢印の軸 1.0〜1.3。角の丸め・矢じりの大きさは［不明］。
- **図内の字**：本文の 0.77〜0.9 倍。箱の中は 1〜3 行で折り返し、3 行を超えたら「…」で切る。
- **枠と題**：図の上に太い黒帯＋題＋細罫（図表題の帯）。題は「図表 章-通番 題」「CHART 章.通番 題」（語は変種の `figWord`）。番号は GNOTO が付ける。
- **矢印**：向きは from→to。矢じりは to 側の黒い塗り三角。`solid`＝はい（肯定・主たる流れ）、`dashed`＝いいえ（否定・例外）［測］。ラベルは辺の中点に白地の札。
- **配置**：flow は上から下。段が 5 を超えるときは 2 つの図に分けるか `groups` で束ねる。`direction:"right"` は分岐のない一直線で 5 段までのときだけ。`nodes` の並び順＝読む順（同じ層は左→右）。
- 型別：flow＝角丸・楕円（結論）・グループの薄灰の地／tree＝罫線の括り（bracket）・角丸の入れ子（nested）・領域区分（region）／table・matrix＝灰ベタのヘッダと先頭列・内罫 1・matrix は左上セルに斜線／timeline＝矢印つきの軸（太さ約 3）・点＋時点（太字）＋出来事・期間は薄灰の帯／concept＝入れ子の枠（外＝濃い灰・内＝白）／relation＝人物・建物・土地のピクトと太い灰線・楔・点線・取消線。

## 4. 文章から図の記述を作る手順（G1〜G7）

**G1 候補を拾う**：本文の段落ごとに、図にする条件（`rules.md` R9）を当てる。当事者 3 人以上＝relation／判断が「はい／いいえ」で 2 回以上分かれる＝flow／上位・下位＝tree／入れ子の包含＝concept／日付・期間 3 つ以上＝timeline／同じ観点で 2 つ以上を比べる＝table（2 軸なら matrix）。当たった段落だけ候補。1 ページに 1〜2 図・章に 3〜8 図が上限の目安［推］。
**G2 型を決める**（R10 の決定表を上から）：順序・分岐→flow／親が 1 つの木→tree／時間軸→timeline／1 軸の比較→table／行と列の両方に意味→matrix／入れ子・包含→concept／人や物の間の関係→relation。2 つ当たったら読者が先に知りたい方。決められなければ**作らない**。
**G3 要素を取る**：ノード＝**本文で使っている語そのまま**の名詞句（言い換えない・動詞や文を入れない）／エッジ＝本文の動詞を名詞形にして `label`（「譲渡」「通知」「いいえ」）。意味が分かる辺には付けない／並び順＝本文での登場順（flow・timeline は時間順）／グループ＝本文で「第 1 段階」「（ア）（イ）」のようにまとめて語られているものだけ。
**G4 長さを整える**：flow のノード ≤14 字（上限 24）・辺のラベル ≤6 字（上限 12）・tree のノード ≤12 字・table のセル ≤20 字・timeline の `when` ≤8 字・`what` ≤20 字・`caption.title` ≤10 字・matrix の軸名 ≤6 字［推］。超える語は本文側に残して図は短い語にする。
**G5 規模を確かめる**（R12）：flow は箱 5〜9・tree は 3 階層・timeline は出来事 3〜8・relation は当事者 3〜6・table は 5 列×12 行まで。超えたら 2 つに分ける。
**G6 強調**：`tone:"key"` は 1 図に 1 つ（結論・主題）。他は base。
**G7 自己検査**（出す前に）：①全ノードが本文のどこかに語として出てくる ②全エッジの根拠となる文が本文にある（図で初めて出る事実を作らない）③孤立ノードがない ④ラベルが上の長さ以内 ⑤図の前後の本文で、図が何を示すかを 1 文で言っている（R13）⑥`figure_check.py` を通す。①と③と④は機械が見る：

```
python3 ${CLAUDE_PLUGIN_ROOT}/skills/laba-textbook/scripts/figure_check.py figs.json --text 本文.txt
python3 ${CLAUDE_PLUGIN_ROOT}/skills/laba-textbook/scripts/figure_svg.py figs.json out_dir      # SVG を書き、SVG 自体も検査する
python3 ${CLAUDE_PLUGIN_ROOT}/skills/laba-textbook/scripts/figure_check.py --svg out_dir/f1.svg
```
機械が見ないもの：②（辺の根拠）と図の法的な正しさ。図を作っていない点検者に見させる（`skills/laba/references/reviewer-prompts/figure-check.md`）。立てられないときは「自己点検」と書く。

## 5. 既存の図（laba-figures）との使い分け

- 法律の関係図・流れ図を Word・PDF に入れる図（25 型・三色・PNG）は `laba-figures`。**教科書どおりの紙面（GNOTO の紙面ノート）に入れる図は、この文書の記述**。同じ内容を両方に出すときは、先に本文と図の語をそろえ、それぞれの検査（`fig_lint.py`／`figure_check.py`）を通す。2 つの検査の色の規則は別（laba-figures は三色、教科書は灰の濃さだけ）。
- グラフ（棒・折れ線）の型は無い［不明］。必要なら画像でなく表（table）にする。

## 6. 満たされていない所

- 図の内部の座標の大半は未測定。角丸・矢じり・ピクト・波括弧の形は［不明］。GNOTO の描き手は現時点で、これらの型を描く実装が入っているかを確かめていない（`output-format.md` 4）。
- `tone` の見た目（key・mute）は測定の裏付けが弱い［推］。
