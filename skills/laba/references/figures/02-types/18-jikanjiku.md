# 18　時間軸

出来事の順と、その間に続く状態（誰が持つか、時効が進むか）を、軸と帯で描く。基準時が決め手の制度に向く。

- レンダラ：`timeline`（`scripts/figgen/lib/renderers/timeline.js`）
- 用例：`scripts/figgen/specs/timeline-jiko.json`

## いつ使うか

- 基準時がある制度（抵当権設定時、口頭弁論終結時、行為時）
- 期間の進行・猶予・更新
- 事実の先後で結論が分かれる事案（取消しの前後、登記の先後）

## 使わないとき

- 出来事が二つだけ（文で足りる）
- 関係が増えていく様子を見せたいとき（積み上げ図）
- 期間の長さを比べたいとき（数直線）

## 要素

- 軸＝左から右へ時間。目盛りの上に時点の名前、下に出来事
- 帯（`tracks`）＝状態。帯の名前を左に書く。続く状態は右端を開ける
- 印（`mark`）＝基準時。「基準時：〜を見る」と語で書く
- えんじ＝基準時の目盛りと、結論を決める帯。省略の印（`breaks`）＝長い期間

## 作り方

1. 出来事を時の順に並べ、`events` に書く
2. 見せたい状態を `tracks` に書く。`from`・`to` は出来事の番号（0 から）
3. 基準時に `accent` と `mark`
4. 成立する場合としない場合を比べるなら、同じ軸の図を二つ作って複合図にする

## よくある失敗

| 失敗 | 直し方 |
|---|---|
| 基準時が図のどこか分からない | `mark` で語にする |
| 状態の帯がなく、出来事の列だけになった | 結論を左右する状態（建物があるか、所有者が同じか）を帯にする |
| 日付を詰めて書き、隣と重なった | `scale` は ordinal のままにし、日付は短く書く |

## 最小の仕様

`timeline` で図になる最小の形。ここから項目を足す（全部の項目は `scripts/figgen/README.md` 5 節）。

```json
{"type":"timeline","message":"…。","caption":"図N　…",
 "events":[{"date":"契約時","label":"売買契約"},{"date":"引渡し時","label":"目的物の引渡し","accent":true}],
 "tracks":[{"name":"危険の負担","segments":[{"from":0,"to":1,"label":"売主が負う"},{"from":1,"label":"買主が負う","accent":true}]}]}
```

## 仕様を書くときに迷う所

| 迷う所 | 答え |
|---|---|
| `from`・`to` に何を書くか | `events` の番号（0 始まり）。`to` を省くと右端まで |
| 間が長く空く所を示したい | `breaks:[i]`＝ i 番目と i+1 番目の間に省略の印 |
| 基準時から下へ線を下ろしたい | 強調・印（`mark`）つきの出来事からは自動。ほかは `guide:true`。やめるなら `guides:false` |
| 「ない」状態の帯 | `dash:true` か `gray:true`。太い実線で描くと warn |

## 仕様の例

そのまま `node cli.js` に渡せば生成できる（図題の「図N」は、ノートでの番号に置き換える）。

```json
{
  "type": "timeline",
  "message": "訴えを起こすと時効の完成が猶予され、判決が確定すると時効は更新されて新たに進行を始める。",
  "caption": "図N　この図で分かること：裁判上の請求があると、その手続の間は時効が完成せず、確定判決で権利が確定すると時効は新たに進行を始める（民法147条）。左から右へ時間が進む。強調は完成が猶予される期間。",
  "events": [
    {"date": "弁済期", "label": "権利を行使できるようになる"},
    {"date": "訴えの提起", "label": "裁判上の請求", "accent": true},
    {"date": "判決の確定", "label": "権利が確定する"}
  ],
  "tracks": [
    {"name": "時効", "segments": [{"from": 0, "to": 1, "label": "進行する"}, {"from": 1, "to": 2, "label": "完成が猶予される（147条1項）", "accent": true}, {"from": 2, "label": "更新：新たに進行を始める（147条2項）"}]}
  ],
  "notes": ["訴えの却下や取下げで手続が終わったときは更新されず、終了の時から6か月を経過するまで完成が猶予されるにとどまる（147条1項かっこ書）。"]
}
```

```
node scripts/figgen/cli.js check scripts/figgen/specs/timeline-jiko.json      # 仕様の検証
node scripts/figgen/cli.js scripts/figgen/specs/timeline-jiko.json out.svg --png
python3 scripts/fig_lint.py out.svg --spec scripts/figgen/specs/timeline-jiko.json
python3 scripts/figgen/trace.py scripts/figgen/specs/timeline-jiko.json --body 本文.md --fig N --strict
```

## 分野別の用例

- 民法：法定地上権（388条）、消滅時効の完成猶予と更新（147条以下）、取消しと第三者、相殺と差押えの先後
- 民訴：既判力の基準時、訴訟係属と二重起訴
- 刑法：行為時法と裁判時法、共犯関係からの離脱の時期
- 行政法：処分時説と判決時説、出訴期間
- 会社法：基準日と株主の権利行使
