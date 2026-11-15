# 19　座標図

二つの観点（あり／なし）の組合せで類型が決まるとき、2×2 の枠に類型を置き、その位置から出る規律を各欄に書く。

- レンダラ：`quadrant`（`scripts/figgen/lib/renderers/quadrant.js`）
- 用例：`scripts/figgen/specs/quadrant-kyodososho.json`

## いつ使うか

- 類型が二つの観点で整理できるとき（訴訟共同の必要×合一確定の必要）
- 「なぜその規律になるか」を、観点の有無から導かせたいとき
- 存在しない組合せがあることを示したいとき

## 使わないとき

- 観点が一つ（比較図）、三つ以上（表）
- 観点が「あり／なし」で割り切れないとき（程度の問題は文で書く）
- 類型を並べるだけで、軸に意味がないとき（表）

## 要素

- 横の軸と縦の軸。軸の名前と、二つの値
- 欄＝類型の名前（太字）と、その位置から出る規律を一行か二行
- えんじ＝その節の主題の類型
- 斜線や灰色＝存在しない組合せ（`na`）。理由を一行

## 作り方

1. 二つの観点を、定義できる言葉で決める
2. `xAxis`・`yAxis` に `title` と `values`
3. `cells` を行ごとに書く。`title` と `lines`
4. 主題の欄に `accent`、ない組合せに `na`
5. 図題に、横と縦が何かを書く

## よくある失敗

| 失敗 | 直し方 |
|---|---|
| 軸の向き（あり／なし）が横と縦で逆で読みにくい | 図題に書き、本文と同じ順にする |
| 欄に類型の名前だけを書いた | 規律を一行入れる。軸から規律が導けることが、この型の値打ち |
| 存在しない組合せを空欄のままにした | `na` にして理由を書く |

## 最小の仕様

`quadrant` で図になる最小の形。ここから項目を足す（全部の項目は `scripts/figgen/README.md` 5 節）。

```json
{"type":"quadrant","message":"…。","caption":"図N　…","xAxis":{"title":"結果","values":["発生した","発生しない"]},"yAxis":{"title":"故意","values":["ある","ない"]},
 "cells":[[{"title":"既遂"},{"title":"未遂","accent":true}],[{"title":"過失犯"},{"title":"不可罰","na":true}]]}
```

## 仕様の例

そのまま `node cli.js` に渡せば生成できる（図題の「図N」は、ノートでの番号に置き換える）。

```json
{
  "type": "quadrant",
  "message": "共同訴訟の三類型は、訴訟共同の必要と合一確定の必要という二つの観点の組合せで決まる。",
  "caption": "図N　この図で分かること：共同訴訟の類型は二つの観点の有無で決まり、各類型の規律もその位置から導ける。横が訴訟共同の必要（全員が当事者にならなければ不適法か）、縦が合一確定の必要。強調は両方が必要な類型。",
  "xAxis": {"title": "訴訟共同の必要", "values": ["ない", "ある"]},
  "yAxis": {"title": "合一確定の必要", "values": ["ある", "ない"]},
  "cells": [
    [{"title": "類似必要的共同訴訟", "lines": ["一人でも訴えられる", "共同で訴えた以上は判決をそろえる（40条）"]}, {"title": "固有必要的共同訴訟", "lines": ["全員がそろわなければ却下", "判決もそろえる（40条）"], "accent": true}],
    [{"title": "通常共同訴訟", "lines": ["各自が独立に訴訟を追行する（39条）", "判決が分かれてもよい"]}, {"title": "この組合せはない", "lines": ["全員の関与を求めるなら、判決もそろえることになる（補足）"], "na": true}]
  ]
}
```

```
node scripts/figgen/cli.js check scripts/figgen/specs/quadrant-kyodososho.json      # 仕様の検証
node scripts/figgen/cli.js scripts/figgen/specs/quadrant-kyodososho.json out.svg --png
python3 scripts/fig_lint.py out.svg --spec scripts/figgen/specs/quadrant-kyodososho.json
python3 scripts/figgen/trace.py scripts/figgen/specs/quadrant-kyodososho.json --body 本文.md --fig N --strict
```

## 分野別の用例

- 民訴：共同訴訟の三類型、判決効の主観的範囲と客観的範囲
- 刑法：故意・過失×既遂・未遂、作為・不作為×故意・過失
- 民法：有償・無償×双務・片務、物権・債権×対抗要件の要否
- 憲法：規制の目的×規制の態様
- 行政法：処分の名宛人か第三者か×侵害的か授益的か
