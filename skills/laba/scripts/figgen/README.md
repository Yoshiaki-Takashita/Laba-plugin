# figgen：図の仕様（JSON）から法学の図を作る

図に入れる中身（誰と誰が、どういう関係か）を JSON で書くと、配置・折り返し・矢印の経路・ラベルの置き場を決めて、SVG と 600dpi の PNG を出す。色・線・文字の決まり（`references/figures/`）は、エンジンが守る。書く人は「どの型か」「何を入れるか」「どこを強調するか」だけを考える。

この文書の順：導入 → はじめての一枚 → 型の選び方の早見 → 型ごとの最小の仕様 → 項目の一覧 → よくある間違い → 線の経路・折り返し・部品 → 検査 → 回帰試験。

## 1　導入

- Node.js 18 以上。SVG を出すだけなら、ほかに何も要らない。
- PNG にするには sharp が要る。スキルのフォルダには入れていないので、作業用のフォルダで一度入れる。

```
mkdir -p ~/laba-work && cd ~/laba-work && npm init -y && npm i sharp
export NODE_PATH=~/laba-work/node_modules      # figgen から sharp が見えるようにする
```

- 和文の書体（Noto Sans CJK JP）が要る。`fc-list | grep -i "noto sans cjk"` で確かめる。無いと、PNG の字幅が見積りとずれる。
- 検査（`../fig_lint.py`、`trace.py`）と回帰試験（`tests/run_tests.py`）は、Python 3 の標準ライブラリだけで動く。

## 2　はじめての一枚

まず、下の六行を `fig1.json` に保存して動かす。これが、当事者関係図の最小の仕様である。

```json
{
  "type": "parties",
  "message": "買主は、売主に目的物の引渡しを請求できる。",
  "caption": "図1　この図で分かること：買主は、売主に目的物の引渡しを請求できる。矢印は請求の向き。強調は引渡しの請求。",
  "nodes": [{"id": "x", "label": "買主"}, {"id": "y", "label": "売主", "pos": [1, 0]}],
  "edges": [{"from": "x", "to": "y", "label": "引渡しを請求", "accent": true}]
}
```

```
node cli.js check fig1.json                        # 仕様の検証だけ（図は作らない）
node cli.js fig1.json fig1.svg --png               # 作る。PNG は 150mm 幅・600dpi
python3 ../fig_lint.py fig1.svg --spec fig1.json   # 機械の点検（error 0 にする）
python3 trace.py fig1.json --body 本文.md --fig 1 --strict   # 本文との照合（所見を出す補助。一致の保証ではない）
```

そのあとは、`specs/` から近い用例を写し、中身を入れ替える。型ごとの最小の仕様は 4 節、全部の項目は 5 節。

ほかの使い方：

```
node cli.js list                                   # 型の一覧（17 のレンダラ）
node cli.js spec.json out.svg --png --width-mm 120 --density 600
node cli.js spec.json out.svg --steps --png        # 積み上げ図：step ごとに out_1.svg、out_2.svg…（スライド用）
node cli.js spec.json out.svg --step 2             # step 2 までを描き、step 2 を強調
node cli.js all specs/ out/ --png                  # フォルダの仕様を全部（SVG を先に全部作り、PNG は同時に。--jobs N）
node cli.js batch a.json b.json --outdir out/ --png   # 指定した仕様をまとめて（誤りのある仕様は飛ばして残りを作る。終了コード 1）
```

`cli.js` の出力は三種類ある。

| 出力 | 意味 | すること |
|---|---|---|
| `error: 仕様に誤りがある（図は作っていない）` | 必須の項目がない、型の名前が違う、`from`・`to` が `nodes` にない、列の数が合わない、など | 下に並ぶ理由のとおりに仕様を直す。図は作られていない |
| `warn:` | 図は作ったが、直す所がある（知らない項目、図題の形、強調なし、文字が版面の外、ラベルの置き場なし、線が箱を貫通する・別の線に重なる、語の途中で折れた、箱の語が四行以上、「ない」状態の帯が実線） | 仕様を直してやり直す。warn を残したまま出さない |
| （何も出ない） | エンジンから見た問題はない | `fig_lint.py`、`trace.py`、PNG の目視に進む |

## 3　型の選び方の早見

メッセージ（この図で分かること）の一文の形で決める。詳しい決定表は `references/algorithms/figure-type.md`。

| メッセージの形 | 型 | `type` |
|---|---|---|
| 「A のときは X、B のときは Y」（似た場面で帰結が分かれる） | 比較図 | `compare` |
| 「同じ枠組みで、一つの事実が違うと結論が逆になる」 | 複合図（同じ図を上下に並べる） | `panel` |
| 「まず P、次に Q、外れたら Z」（関門を順に通る） | 流れ図 | `flow` |
| 「P なら X、P でなく Q なら Y、…」（問いで三つ以上に分かれる。条件→義務の条文の束も） | 決定木 | `tree` |
| 「P は、Q・R・S がそろって成立する」 | 要件効果の木 | `tree`（`direction:"down"`、`noHeads`） |
| 「P の時点で Q であれば R」（基準時・先後） | 時間軸 | `timeline` |
| 「P から Q か月以内」（期間・金額の長さや重なり） | 数直線 | `numberline` |
| 「原告が P を言い、被告が Q を言い、原告が R を言う」 | 積み上げ図 | `stack` |
| 「P は相手に及ぶが、Q は及ばない」 | 動きの図 | `movement` |
| 「二つの観点の組合せで類型が決まる」 | 座標図 | `quadrant` |
| 「本文は X、ただし書は Y」 | 条文の構造図 | `statute` |
| 「甲が乙に P を請求し、乙が丙に Q を請求する」（事案の地図） | 当事者関係図 | `parties` |
| 「甲から乙、乙から丙へ権利が移る／二人のどちらが優先するか」 | 連鎖図・対抗関係の図 | `chain` |
| 「第一審は X、控訴審は Y、上告審は Z」 | 審級の流れ | `instances` |
| 「誰が、どの順に、何をするか」（手続） | スイムレーン | `swimlane` |
| 「判例が、誰が誰に・何を求めたかで分かれる」 | 判例マトリクス | `matrix` |
| 「広い概念の中に狭い概念が入る」 | 包含図 | `nest` |
| 「一つの価値を、誰がどれだけ取るか」 | 価値配分の図 | `bar` |

当事者を並べたくなったら、先に「その図で結論の理由が見えるか」を問う。見えないなら、上の表の上半分の型にする。

## 4　型ごとの最小の仕様

どの型にも `message`（この図で分かること：主語と述語のある一文）と `caption`（図題。「図N　この図で分かること：…。読み方。強調は…。」）が要る。下では省いてある。

```json
{"type":"parties","nodes":[{"id":"x","label":"債権者"},{"id":"y","label":"債務者","pos":[1,0]}],"edges":[{"from":"x","to":"y","label":"貸金の返還を請求","accent":true}]}
{"type":"chain","nodes":[{"id":"a","label":"売主"},{"id":"b","label":"買主"},{"id":"c","label":"転得者"}],"links":[{"from":"a","to":"b","label":"売買"},{"from":"b","to":"c","label":"転売","accent":true}]}
{"type":"compare","columns":[{"title":"善意の場合"},{"title":"悪意の場合"}],"rows":[{"label":"要件","cells":["知らなかった","知っていた"]},{"label":"帰結","cells":["保護される","保護されない"],"accent":[1]}]}
{"type":"flow","steps":[{"text":"訴訟要件を満たすか","exit":{"label":"満たさない","text":"訴えの却下"}}],"pass":"満たす","end":{"text":"本案の審理","accent":true}}
{"type":"tree","root":{"text":"実行に着手したか","children":[{"edge":"した","text":"未遂か既遂","accent":true},{"edge":"しない","text":"予備にとどまる"}]}}
{"type":"timeline","events":[{"date":"契約時","label":"売買契約"},{"date":"引渡し時","label":"目的物の引渡し","accent":true}],"tracks":[{"name":"危険の負担","segments":[{"from":0,"to":1,"label":"売主が負う"},{"from":1,"label":"買主が負う","accent":true}]}]}
{"type":"numberline","ticks":[{"v":0,"label":"送達"},{"v":14,"value":"2週間","label":"満了","accent":true}],"ranges":[{"from":0,"to":14,"label":"控訴できる期間","accent":true}]}
{"type":"stack","left":{"title":"原告"},"right":{"title":"被告"},"levels":[{"side":"left","name":"請求原因","items":["金銭の交付","返還の合意"]},{"side":"right","name":"抗弁","items":["弁済"],"against":"請求原因に対して","accent":true}]}
{"type":"instances","stages":[{"court":"第一審","result":"請求棄却"},{"court":"控訴審","result":"請求認容","accent":true}],"links":["控訴"]}
{"type":"swimlane","lanes":["原告","裁判所"],"steps":[{"lane":0,"text":"訴えの提起"},{"lane":1,"text":"訴状の審査","accent":true}]}
{"type":"movement","from":{"label":"連帯債務者の一人"},"to":{"label":"他の連帯債務者"},"items":[{"label":"弁済","pass":true},{"label":"請求","pass":false,"accent":true}]}
{"type":"statute","name":"民法○条","parts":[{"kind":"本文","text":"……のときは、……できる","effect":"原則"},{"kind":"ただし書","text":"……のときは、この限りでない","effect":"例外","accent":true}]}
{"type":"quadrant","xAxis":{"title":"結果","values":["発生した","発生しない"]},"yAxis":{"title":"故意","values":["ある","ない"]},"cells":[[{"title":"既遂"},{"title":"未遂","accent":true}],[{"title":"過失犯"},{"title":"不可罰","na":true}]]}
{"type":"matrix","corner":"訴えの向き","cols":["持分権に基づく請求","共有関係についての請求"],"rows":[{"label":"第三者へ","cells":["単独でできる",{"lines":["全員が原告になる"],"accent":true}]}]}
{"type":"nest","root":{"label":"法律行為","children":[{"label":"契約","accent":true},{"label":"単独行為"}]}}
{"type":"bar","rows":[{"label":"遺産","parts":[{"label":"配偶者","share":0.5,"holder":"二分の一","accent":true},{"label":"子","share":0.5,"holder":"二分の一"}]}]}
{"type":"panel","panels":[{"title":"（a）建物がある場合：成立する","spec":{"type":"timeline","events":[{"date":"設定時","label":"建物がある","accent":true},{"date":"競売後","label":"成立する"}]}},{"title":"（b）更地の場合：成立しない","spec":{"type":"timeline","events":[{"date":"設定時","label":"更地である","accent":true},{"date":"競売後","label":"成立しない"}]}}]}
```

## 5　項目の一覧

### どの型にも共通

| 項目 | 中身 |
|---|---|
| `type` | 型の名前（必須） |
| `message` | この図で分かること。主語と述語のある一文。言えないなら図にしない |
| `caption` | 図題。「図N　この図で分かること：…。読み方。強調は…。」 |
| `notes` | 図の下の注（主語のある完全な文。二つまで）。版面の幅いっぱいで折る |
| `legend` | 凡例：`[{sample, text}]`。`sample` は `line`・`dash`・`dot`・`accent`・`both`・`stop`・`group`・`guide`・`thing`・`right`・`proc`・`organ`・`under`・`box`。箱の形や点線の矢印を使った図にだけ付ける |
| `width` | 図の幅（単位）。既定 1040＝150mm。ふつうは書かない |

文字列の中の `|` は、そこで必ず折る印。`accent: true` は強調（太いえんじの枠・線。文字は黒のまま）。`dash: true` は破線（争い・仮定）。`dash: "dot"` は点線（手続上の行為）。`gray: true` は文脈（灰色の枠・線）。

### 型ごと

| `type` | 項目（太字は必須） | 説明 |
|---|---|---|
| `parties` | **`nodes`** `[{id, label, sub, pos:[列,行], kind, accent, gray, note}]` | 当事者。`pos` を省くと左から順に一列。`kind`：`thing`（物・書類）・`right`（権利）・`proc`（手続）・`organ`（会議体の機関）。`note`：箱のそばの短い注 |
| | `edges` `[{from, to, label, sub, accent, dash, head, stop, step, port, straight, elbow}]` | 関係。`head`：`end`（既定）・`both`・`none`。`stop:true`：途中で止めて止め線（及ばない）。`step`：積み上げの段の番号 |
| | `groups` `[{members:[id…], label, accent}]` | 範囲の枠（灰の破線）。判決の効力が及ぶ者、同じ側の当事者など |
| | `nodeWidth` | 箱の幅（単位）。省くと、語の途中で折れない最小の幅をエンジンが選ぶ |
| | `rowGap` | 行と行の間隔。省くと、線の横の語が入る間隔（112・150・190）をエンジンが選ぶ |
| | `port`・`straight`・`elbow`（`edges` の中） | 経路を自分で決めたいときだけ。`elbow:"vh"`＝縦に出て横から入る、`"hv"`＝横に出て縦から入る。`port`：出る位置を辺の上でずらす（-1〜1）。`straight:true`：斜めの直線 |
| | `pict`、`band`、`showStep` | `pict:true`：線の人型＋語（スライド向け）。`band`：下の帯の文。`showStep`：`--step`・`--steps` が入れる（自分では書かない） |
| `chain` | **`nodes`** `[{id, label, sub, kind, accent, gray, note}]`、`links` `[{from, to, label, sub, accent, dash}]` | 左から右へ権利が移る。枝分かれ（二重譲渡）も描ける |
| | `relations` `[{a, b, label, sub, accent, head, side, solid}]` | 移転でない関係（対抗・優劣）。`head`：`a`＝ b から a へ（「b が a に対抗できる」）、`b`、`both`（既定）、`none`。`solid:true`：確定した帰結（細い実線。既定は破線） |
| | `groups`、`nodeWidth`、`rowGap` | `parties` と同じ |
| `compare` | **`columns`** `[{title}]`、**`rows`** `[{label, cells, accent:[列], dash:[列], arrow, under, align}]` | `cells` は列の数だけ。一つを `{split:[…]}` にすると、その列の中を左右に割る |
| | `arrows` | `false`：段の間の矢印を全部やめる（観点ごとの見比べ）。`rows[].arrow:false`：その段の上だけやめる。`rows[].under:true`：結論の段（下辺を太く） |
| | `header`、セルの `{text, except}` | 列の見出しの下に太い線（見出しの帯）を引くのが既定。`header:"plain"` でやめる。セルを `{text, except}` にすると、箱の下に点線で区切って例外の一行（ただし書・適用除外）を置く |
| `flow` | **`steps`** `[{text, sub, pass, kind, accent, exit:{label, text, sub, eg, accent}}]` | `exit.label`：枝の上の語、`exit.text`：出口の箱、`exit.sub`：出口の二行目（帰結を一行で）、`exit.eg`：枝の下の一行（落ちる例・理由） |
| | `pass`、`end` `{text, sub, accent}`、`direction` | `pass`：段から段への矢印の語（段ごとに変えるなら `steps[].pass`）。`direction:"right"`：左から右へ（`steps[].pass` も描く） |
| | `steps[].branch` `[{label, text, sub, accent}]` | 段の中の小さな分岐（例外の小枝）。下向きは段の箱の下の部分に「枝の語 →［小さな箱］」を、右向きは「枝の語 ↓［小さな箱］」を縦に積む。二つまで（三つ目以降は warn を出して描かない）。ただし書・例外を注でなく図に出す |
| | `mergeExits`、`exitStyle` | 出口がどれも同じ語なら一本の縦線に集める（既定）。`mergeExits:false`：段ごとに箱を置く。`exitStyle:"box"`：一つの縦長の箱にまとめる |
| `tree` | **`root`** `{text, sub, kind, accent, dash, children:[{edge, …}]}` | `edge`：枝の語。葉（`children` のない節）が結論 |
| | `direction`、`gapY`、`noHeads`、`leafUnder` | `direction`：`right`（既定）・`down`。枝の語が四字を超えるなら `down`。`gapY`：兄弟の箱の間隔（`right`）。`noHeads:true`：矢じりなし（要件効果の木・組織図）。`leafUnder:false`：葉の下辺を太くしない |
| `timeline` | **`events`** `[{date, label, accent, mark, guide}]`、`tracks` `[{name, segments:[{from, to, label, accent, gray, dash}]}]` | `from`・`to` は `events` の番号（0 始まり）。`to` を省くと右端まで。`mark`：基準時などの印 |
| | `scale`、`breaks`、`guides` | `scale:"time"`：`date`（YYYY-MM-DD）に比例。`breaks:[i]`：i 番目と i+1 番目の間に省略の印（//）。`guides:false`：基準時の補助線をやめる |
| `numberline` | **`ticks`** `[{v, value, label, accent, guide}]`、`ranges` `[{from, to, label, accent, gray, dash}]` | `v`：位置を決める数、`value`：目盛りの上の語、`label`：下の語。`from`・`to` は `v` の値 |
| | `proportional`、`arrow`、`breaks` | `proportional:false`：等間隔。`arrow:false`：右端の矢じりなし。`breaks:[i]`：小さい順に i 番目と i+1 番目の目盛りの間に省略の印 |
| `stack` | **`levels`** `[{side, name, items, effect, against, accent}]`、`left` `{title}`、`right` `{title}` | `side`：`left`・`right`。`against`：前の段のどれに対する主張か |
| `instances` | **`stages`** `[{court, date, result, reason, accent, dash}]`、`links` | `links`：段の間の語（「控訴」「上告」） |
| `swimlane` | **`lanes`**、**`steps`** `[{lane, text, sub, accent, via}]` | `lane`：`lanes` の番号。`via`：前の段からの矢印の語。段の幅は中身から決まり、帯をまたぐ段は前の段の真下（真上）から下ろして重ねて置くので、七段まで入る。帯の見出しは `|` で折る位置を決められる |
| `movement` | **`from`** `{label, sub}`、**`to`** `{label, sub}`、**`items`** `[{label, pass, why, accent}]` | `pass:true`：届く矢印、`false`：止め線 |
| `statute` | **`parts`** `[{kind, text, effect, accent, indent}]`、`name` | `kind`：「本文」「ただし書」「1号」。`indent:1`：一段下げる |
| `quadrant` | **`xAxis`**・**`yAxis`** `{title, values:[a,b]}`、**`cells`** `[[{title, lines, accent, na}]]` | `na:true`：その組合せはない |
| `matrix` | **`rows`** `[{label, cells}]`、**`cols`**、`corner`、`labelWidth` | セルは文字列か `{lines, accent, note}`。`labelWidth`：行の見出しの幅 |
| `nest` | **`root`** `{label, lines, accent, children}` | 深さは三段まで |
| `bar` | **`rows`** `[{label, parts:[{label, share, holder, accent, gray}]}]` | `share` は行ごとに合計 1 |
| `panel` | **`panels`** `[{title, spec:{type, …}}]` | 下位の `spec` に `caption`・`message` は要らない |

型ごとの詳しい書き方・用例・よくある失敗は `references/figures/02-types/`（25 の型）。項目の定義の元は、各レンダラ（`lib/renderers/*.js`）の冒頭の注釈。

## 6　よくある間違い

| 間違い | どうなるか | 直し方 |
|---|---|---|
| `type` の書き間違い（`party`、`timline`） | error。近い型の名前を示す | `node cli.js list` で確かめる |
| `edges` の `from`・`to` が `nodes` の `id` にない | error（その線は描けない） | `id` をそろえる。`label` ではなく `id` を書く |
| 項目の書き間違い（`nodeWith`、`accnet`） | warn「知らない項目…は無視される。「nodeWidth」の書き間違いではないか」 | 5 節の名前に直す |
| 比較図で、`cells` の数が `columns` の数と違う | error | 列の数だけ書く |
| 時間軸の `segments` の `from`・`to` に、日付や語を書いた | error | `events` の番号（0 始まり）を書く |
| 数直線の `ticks[].v` に「5年」と書いた | error | `v` は数。表示する語は `value` に書く |
| `breaks` に、省略したい区間の右側の番号を書いた | 印が一つ右にずれる | 左側の番号を書く |
| 連鎖図の `relations` の `head` を逆にした | 対抗の向きが逆になる（`trace.py` の T06） | 「b が a に対抗できる」なら `head:"a"`（矢じりは a の側） |
| 斜めの位置の二者の真下に、別の箱を置いた | 線が回り道になる。回れなければ warn「線が箱を貫通する」 | `pos` を入れ替える |
| 線の横の語に条文番号まで書いて三行になった | warn「線の横の語が 3 行」 | 条文番号を `sub` か `notes` へ。`rowGap`・`nodeWidth` を調える |
| 「成立しない」の帯を、そのまま書いた | warn「帯が太い実線」 | `dash:true` か `gray:true` |
| 物（計算書類・土地）の置き場がなく、人の箱へ矢印を向けた | 相手が人に見える（`trace.py` の T07） | `kind:"thing"` の箱を置く |
| `message`・`caption` を書かなかった | warn | 一文で書く。書けないなら図にしない |
| 強調（`accent`）が一つもない／多すぎる | warn／`fig_lint` の W01 | 争点・分かれ目・変わった所の一つに絞る |
| JSON のかっこ・カンマの誤り | error「JSON として読めない」と場所 | その行を直す |

## 7　線の経路・折り返し・部品

### 線の経路

`parties`（と `chain` の `relations`）の線の経路は、エンジンが決める。二つの箱の位置から、直線・L 字・Z 字・迂回の候補を作り、接続点を辺の中央と左右 0.3 に振り分けて、「端点でない箱を貫通する ＞ 別の線と同じ筋に重なる ＞ 文字を通る ＞ 接続点が混み合う ＞ 別の線の脇を長く並走する ＞ 交差する ＞ 折れが多い ＞ 長い」の順に悪いものを捨てる。どの候補でも貫通・重なりが残るときは warn を出すので、`pos` を入れ替えるか、図を分ける。規則の全体は `references/figures/03-layout.md` 7 節。

### 折り返しと、一行の字数

- 一行に入る和文の字数は「（箱の幅 − 28）÷ 21」。幅 150 で 5 字、180 で 7 字、230 で 9 字、250 で 10 字、430 で 19 字。
- 条文番号（「民法424条の2」「203条1項」）、判例の表記（「最判昭和43・3・8」「民集22巻3号551頁」）、数字と単位、熟語、送り仮名つきの語、短い括弧の途中では折らない。切ってよい位置の優先順と禁則の表は `references/figures/03-layout.md` 11 節。
- 入らないときの順：語を減らす → 箱を広げる（`parties` は自動）→ 見出しの字を下げる（`compare` の列の見出しは自動）→ 図を分ける。
- 辞書に無い語が途中で折れたら（warn「語の途中で折れた」）、`|` で折る位置を決める。

### 部品

| 部品 | 書き方 | 使える型 |
|---|---|---|
| 人でない対象の箱（物・権利・手続・会議体の機関） | `kind: "thing"`・`"right"`・`"proc"`・`"organ"` | `parties`・`chain`・`tree`・`flow` |
| 範囲の枠 | `groups: [{members:[id…], label}]` | `parties`・`chain` |
| 基準時の補助線 | 強調・印つきの出来事から自動。`guide:true` で足す、`guides:false` でやめる | `timeline`・`numberline` |
| 凡例 | `legend: [{sample, text}]` | 全部の型 |
| 注記の吹き出し | `nodes[].note` | `parties`・`chain` |
| 結論の箱（下辺を太く） | 流れ図の出口・終点、木の葉は自動。比較図は `rows[].under` | `flow`・`tree`・`compare` |
| 手続上の行為の線 | `edges[].dash: "dot"` | `parties` |
| 確定した対抗関係の線 | `relations[].solid: true` | `chain` |

意味と使い分けは `references/figures/01-grammar.md` 11 節。用例は `specs/parties-hanketsuko-hani.json`（範囲の枠・物の箱・凡例）、`specs/parties-daihyososho.json`（機関の箱・手続の箱・吹き出し）。

## 8　検査

```
python3 ../fig_lint.py out.svg --spec spec.json     # 図そのもの：error 12 項目（E01〜E12）、warn 13 項目（W01〜W13）
python3 trace.py spec.json --body 本文.md --fig 3 --strict              # 本文との照合：所見（T01〜T08）、照合できなかった要素、機械で見ない種類
python3 trace.py spec.json --body 本文.md --relations 関係の表.md       # 関係の表とも突き合わせる
python3 trace.py spec.json --body 本文.md --dismiss 退ける所見.md       # 偽陽性と読んだ所見を、図を変えずに理由つきで退ける
```

- `fig_lint.py`：色・字・線幅、文字の重なり、文字と線の交差、矢印の届き、**線が端点でない箱を貫通する（E11）**、**線が別の線と同じ筋に重なる（E12）**、空白率（型で基準を変える）、行数、語の途中の折れ（W13：法律語の辞書 `lib/legal-words.json` の術語の途中、辞書にない漢字の連なりを分からない二字ずつで折った所、送り仮名の前、判例の日付の途中を含む）、など。項目の全部はファイルの冒頭。
- `trace.py`：**所見を出す補助であって、一致を保証する検査ではない。** ラベルの語が本文にあるか（語あり・語あり（語ごと）・一部の語・なし）に加え、関係の組合せ（矢印の向き、勝ち負け・成否の語が誰について言われているか、効果の語がどの類型のものか）を本文の文と照らし、逆・取り違えの疑いを T06、本文にない組合せを T07、機械で決められないものを T08（要読み比べ）として出す。図ごとのまとめは「所見なし（機械で見られる範囲で）」か「要確認（所見 n 件）」で、「一致」「通過」とは書かない。毎回、照合できなかった要素の一覧と、型ごとの機械で見ない種類を出す。独立採点（第4回）で新しい誤りの約半分が所見なしで通ったので、所見なしを正確さの根拠にしない。**所見を消すために要件の語・限定語を削らない**（偽陽性は `--dismiss` の表に理由を書いて退ける）。書式と判定のしかたは `references/figures/06-traceability.md`。
- 照合の中心は、点検役の読み上げの表（`references/reviewer-prompts/figure-check.md`）。矢印・止め線・枠・枝・小枝・時点・条文番号を一つずつ文にして本文と並べる。機械の結果にかかわらず省かない。最後は PNG を 150mm 幅で見る。

同梱の用例 45 本の結果（作り直すたびに確かめる）：`cli.js` の warn 0、`fig_lint.py` の error 0・warn 0。別の点検（ReportKiller の `fig_check.py`、幅 150mm）でも error 0。そちらで残る warn と、残す理由は次のとおり。

| 符号 | 件数 | 中身 | 残す理由 |
|---|---|---|---|
| F19 | 73 | ラベルが長い（二行・十六字を超える） | 49 件は図の下の注（主語のある完全な文で書く決まり）。24 件は、項目を並べる箱（審級・積み上げ・条文の構造図）と、三行に折れた目盛りの語。箱の語が四行以上・線の横の語が三行以上は、こちらの W11・W12 で別に止めている |
| F24 | 2 | 見出しの語に、枠のあるものと無いものが混じる | 物の箱・手続の箱は、四角でなく折れ線で枠を描くので、枠なしと数えられる。見た目には枠がある |
| AR-B2 | 1 | 箱の形が三種 | 人型（スライド向けの `pict`）の用例。人型は円と多角形で描く |

## 9　回帰試験

```
python3 -B scripts/figgen/tests/run_tests.py        # laba のフォルダで。-v で一本ずつ表示
```

過去に実際に起きた失敗を、二度と通さないための試験（129 本）。エンジン・検査を直したら必ず回す。

| 組 | 本数 | 中身 |
|---|---|---|
| routing | 3 | 機関設計の五者の図、2×2 の対角二本、下向きの木の長い枝の語が、貫通・重なりなしで描ける |
| lint | 3 | 旧エンジンの出力（`tests/broken/`）から、E11・E12・E07 を見つける |
| trace | 10 | 誤りを注入した四つの図（勝ち負けの入替え、対抗の矢印の逆向き、効果の取り違え、条文番号の誤り）で所見が出て、正しい図では出ない。関係の表との照合 |
| inject | 55 | 過去の独立採点で注入した誤り（`tests/inj/`）で所見が出て、もとの正しい図では出ない。ここに合わせて規則を足すと過学習になる（新しい誤りでは約半分しか止まらなかった）ので、検出率を上げる目的では使わない |
| advisory | 24 | 正しい図 18 枚（`tests/fp/`：独立採点者の図の法的な書き方を直した版と、作成側が新しく作った図）で所見（T06・T07・T01・なし）が出ない。出力に「一致」「通過」を出さず、照合できなかった要素・機械で見ない種類・「一致の保証ではない」を毎回出す（`--quiet` でも）。止め線を照合したことにしない。退ける表（理由つきなら退け、空なら退けない）。否定の問いの流れ図 |
| swimlane | 3 | 段の幅を中身から決め、6 段・7 段のスイムレーンが warn なし・箱の語 3 行以内で入る |
| wrap | 12 | 条文番号・判例の表記・熟語・短い括弧・数字と単位の途中で折らない。法律語の辞書の術語の途中（共同｜正犯・株主｜総会・代表｜取締役・非業務執行取締役等）で折ったら warn、語の切れ目（債権者｜代位権・損害賠償｜請求権・司法｜警察員）では warn にしない、辞書にない連なりの一般則、辞書が作り直したものと同じ、lint の W13 |
| validate | 5 | 型の書き間違い、参照先のない id、知らない項目、列の数、帯の番号 |
| parts | 9 | 範囲の枠・箱の形・凡例・吹き出し・補助線・「ない」状態の帯・流れ図の出口の箱・段の中の小枝・比較図の例外。右向きの流れ図で小枝と段ごとの通過の語が全部描かれる。三つ目の小枝は右向き・下向きとも warn |
| bundle | 5 | 同梱の用例が warn なしで作れて lint の error が 0、この README に全項目がある、4 節の最小の仕様がそのまま作れる、古い文言が残っていない |

`tests/trace/`・`tests/inj/` の仕様と本文は、照合の感度を確かめるための材料で、図の見本ではない（`*.bad.json` はわざと誤らせてある）。`tests/fp/` は正しい図で、偽陽性を出さないことを確かめる材料（照合の規則を直したら、ここにない新しい正しい図でも確かめる）。図の見本は `specs/`。

新しい失敗を見つけたら、先に試験を足し（`tests/routing/`・`tests/trace/` に仕様と本文を置く）、落ちるのを確かめてから直す。

## 10　手順（一枚の図）

1. 難所を一つ選び、メッセージを一文で書く（`references/figures/00-principles.md`）。図が示す関係を述べる本文の段落を、先に書く。
2. 型を決める（3 節、`references/algorithms/figure-type.md`）。
3. `specs/` の用例を写して中身を入れ替える。語は本文と同じ言い回しにする。条文・判例は原文で確かめる。
4. `node cli.js spec.json out.svg --png`。error・warn を直す。
5. `python3 ../fig_lint.py out.svg --spec spec.json`。error 0 にする。
6. PNG を開いて見る：線が箱を通っていないか、矢印の元と先、強調の位置、折り返し、空白の片寄り。
7. `python3 trace.py spec.json --body 本文.md --fig N --strict`。所見を一つずつ読み、図の誤りは図を、本文の説明不足は本文を直し、偽陽性は図を変えずに `--dismiss` の表に理由を書く。所見を消すために語を削らない。
7'. 読み上げの表を作る（照合できなかった要素・機械で見ない種類を含めて、全部の要素）。
8. 別の点検役に `references/reviewer-prompts/figure-check.md` で見てもらい、`references/figures/10-quality-rubric.md` の点を付けてもらう。3 以下の観点を直す。

## 11　中身

| ファイル | 働き |
|---|---|
| `cli.js` | 入口。仕様を検証し、型のレンダラを呼び、SVG と PNG を書く |
| `lib/core.js` | 共通部品：定数（色・線幅・文字の大きさ）、字幅の見積り、折り返し（禁則の辞書・切ってよい位置の罰点）、箱（`kind`）、経路の候補と採点、ラベルの置き場探し、範囲の枠、吹き出し、補助線、凡例、人型、注 |
| `lib/renderers/*.js` | 型ごとの描き方（17） |
| `specs/*.json` | 用例（45）。どれも `cli.js` で warn なしに作れ、`fig_lint.py` の error は 0。条文は法令の現行の原文と照合してある（`references/figures/08-field-gallery.md` 11 節） |
| `trace.py` | 図と本文の照合の補助（語：語あり・一部の語・なし、T01〜T05。関係：T06〜T08。照合できなかった要素、機械で見ない種類、退ける表）。一致の保証ではない |
| `lib/legal-words.json` | 折り返しの法律語の辞書（術語 404・二字の語 334）。`tools/build_words.py` が作る |
| `tools/build_words.py` | 辞書を作る（分野別の手書きの術語＋`references/fields/*.md` から集めた語）。`--check` で最新か確かめる |
| `tests/` | 回帰試験（`run_tests.py`、`routing/`・`trace/`・`inj/`・`fp/`・`parts/`・`swimlane/` の仕様と本文、`broken/` の旧エンジンの出力） |

## 12　自分で型を足すとき

`lib/renderers/名前.js` を作り、`module.exports = function (spec, cv) { … }` を書く。`cv.node`（箱）、`cv.poly`（線・矢印）、`cv.route`（箱と箱の経路。貫通・重なりを避ける）、`cv.edgeLabel`（線の横の語）、`cv.group`（範囲の枠）、`cv.callout`（吹き出し）、`cv.guide`（補助線）、`cv.text`、`footNotes`（凡例と注）を使えば、色・線幅・字の大きさは自動でそろう。`cli.js` の `TYPES` と `SCHEMA`（必須の項目・使える項目）に一行ずつ足し、この README の 4 節・5 節に書く。用例を `specs/` に二つ以上置き、`tests/run_tests.py` と目視で確かめる。色や線幅をレンダラの中で直接書かない。
