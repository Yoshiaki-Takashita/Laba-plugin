# 13　数直線

期間・金額・順位を、位置と長さで見せる。二つの期間のどちらが先に満了するか、どの範囲が規律の対象かが一目で分かる。

- レンダラ：`numberline`（`scripts/figgen/lib/renderers/numberline.js`）
- 用例：`scripts/figgen/specs/numberline-jiko.json`

## いつ使うか

- 起算点が二つある期間（「知った時から」と「行使できる時から」）
- 期間の計算（上訴期間、出訴期間、除斥期間）
- 金額の範囲（上限・下限、利息の制限）、順位（配当の順）

## 使わないとき

- 時点ごとの出来事と状態の変化を見せたいとき（時間軸）
- 数量を複数の者が分け合うとき（価値配分）

## 要素

- 軸＝値に比例した目盛り（比例させないときは `proportional:false`）
- 目盛りの上＝値（「5年」）、下＝その時点の意味
- 括り線＝範囲。軸の上に、名前を付けて置く。重なる範囲は自動で段を分ける
- えんじ＝先に満了する・実際に効く方の範囲

## 作り方

1. `ticks` に `v`（数値）・`value`（表示）・`label`
2. `ranges` に `from`・`to`（v の値）と `label`（根拠条文）
3. 結論を決める範囲に `accent`
4. 説明用の数値を使ったときは、注に「年数は説明のための例」と書く

## よくある失敗

| 失敗 | 直し方 |
|---|---|
| 目盛りの間隔が値に比例していないのに、比例しているように見えた | 比例させる。させないなら省略の印を入れる |
| 説明用の数値を、設例の事実のように書いた | 注で断る |
| 期間の起算日（初日を入れるか）を図で決めつけた | 本文で条文とともに説明し、図は概念だけにする |

## 最小の仕様

`numberline` で図になる最小の形。ここから項目を足す（全部の項目は `scripts/figgen/README.md` 5 節）。

```json
{"type":"numberline","message":"…。","caption":"図N　…",
 "ticks":[{"v":0,"label":"送達"},{"v":14,"value":"2週間","label":"満了","accent":true}],
 "ranges":[{"from":0,"to":14,"label":"控訴できる期間","accent":true}]}
```

## 仕様を書くときに迷う所

| 迷う所 | 答え |
|---|---|
| `v`・`value`・`label` の違い | `v`＝位置を決める数、`value`＝目盛りの上の語（「5年」）、`label`＝下の語 |
| 目盛りが詰まる | `proportional:false`（等間隔）にし、長い区間に `breaks:[i]` |
| `breaks` の番号 | 小さい順に数えた、区間の左側の目盛りの番号 |
| 軸の矢じりを消したい | `arrow:false`（金額・順位の軸） |

## 仕様の例

そのまま `node cli.js` に渡せば生成できる（図題の「図N」は、ノートでの番号に置き換える）。

```json
{
  "type": "numberline",
  "message": "債権の消滅時効には二つの期間があり、どちらか早く満了した方で時効が完成する。",
  "caption": "図N　この図で分かること：債権は、権利を行使できると知った時から5年、または行使できる時から10年の、早い方で時効が完成する（民法166条1項）。左から右へ時間が進み、長さは年数に比例する。強調は先に満了する5年の期間（知ったのが2年後の例）。",
  "ticks": [
    {"v": 0, "value": "0年", "label": "権利を行使できる時"},
    {"v": 2, "value": "2年", "label": "行使できると知った時"},
    {"v": 7, "value": "7年", "label": "知った時から5年", "accent": true},
    {"v": 10, "value": "10年", "label": "行使できる時から10年"}
  ],
  "ranges": [
    {"from": 2, "to": 7, "label": "知った時から5年（166条1項1号）", "accent": true},
    {"from": 0, "to": 10, "label": "行使できる時から10年（同項2号）"}
  ],
  "notes": ["年数は説明のための例。知った時が遅く、5年の満了が10年の満了より後になるときは、10年の方で完成する。"]
}
```

```
node scripts/figgen/cli.js check scripts/figgen/specs/numberline-jiko.json      # 仕様の検証
node scripts/figgen/cli.js scripts/figgen/specs/numberline-jiko.json out.svg --png
python3 scripts/fig_lint.py out.svg --spec scripts/figgen/specs/numberline-jiko.json
python3 scripts/figgen/trace.py scripts/figgen/specs/numberline-jiko.json --body 本文.md --fig N --strict
```

## 分野別の用例

- 民法：消滅時効（166条1項）、取消権の期間（126条）、不法行為の期間（724条）、即時取得と盗品の回復（193条）
- 民訴：控訴期間（285条）・上告期間
- 刑訴：勾留の期間、公訴時効
- 行政法：出訴期間（行訴法14条）、審査請求期間
- 会社法：株主総会の招集通知の期間、決議取消しの訴えの提訴期間
