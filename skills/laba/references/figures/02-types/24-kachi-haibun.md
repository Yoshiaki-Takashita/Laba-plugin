# 24　価値配分の図

一つの価値・数量を、誰がどれだけ把握するかを、帯の区切りで見せる。

- レンダラ：`bar`（`scripts/figgen/lib/renderers/bar.js`）
- 用例：`scripts/figgen/specs/bar-hoteichijoken.json`

## いつ使うか

- 担保価値の把握（土地の価値と法定地上権の価値）
- 相続分・持分・配当の割合
- 場合によって分け方が変わるとき（帯を上下に並べて比べる）

## 使わないとき

- 計算の過程を見せたいとき（表）
- 割合が設例で決まっていないのに、帯の長さで割合を示してしまうとき（概念図であると注に書くか、文にする）

## 要素

- 帯＝価値の全体。左に帯の名前
- 区切り＝各人の取り分。区切りの中に名前
- 括り線＝帯の下に、誰が把握するか
- えんじ＝主題の取り分

## 作り方

1. `rows` に帯。`parts` に区切り。`share` の合計を 1 にする
2. `holder` に把握する人
3. 主題の区切りに `accent`
4. 割合が概念上のものなら、注に「長さは説明のための例」と書く

## よくある失敗

| 失敗 | 直し方 |
|---|---|
| share の合計が 1 にならない | エンジンが warn を出す。直す |
| 割合を設例の事実のように描いた | 注で断る |
| 円グラフにした | 帯にする。円は割合を比べにくい |

## 最小の仕様

`bar` で図になる最小の形。ここから項目を足す（全部の項目は `scripts/figgen/README.md` 5 節）。

```json
{"type":"bar","message":"…。","caption":"図N　…",
 "rows":[{"label":"遺産","parts":[{"label":"配偶者","share":0.5,"holder":"二分の一","accent":true},{"label":"子","share":0.5,"holder":"二分の一"}]}]}
```

## 仕様の例

そのまま `node cli.js` に渡せば生成できる（図題の「図N」は、ノートでの番号に置き換える）。

```json
{
  "type": "bar",
  "message": "法定地上権が成立すると、土地の価値のうち地上権に当たる部分は建物の側に移る。",
  "caption": "図N　この図で分かること：法定地上権が成立すると、土地の買受人が得るのは地上権の負担が付いた土地の価値にとどまり、残りは建物所有者の側に帰属する。上下の帯を見比べる。強調は建物の側に移る部分。帯の割合は説明のための仮の比率。",
  "rows": [
    {"label": "更地としての土地の価値", "parts": [{"label": "土地の価値の全部", "share": 1.0, "holder": "法定地上権が成立しない場合に|土地の買受人が得る"}]},
    {"label": "法定地上権が成立する場合", "parts": [{"label": "地上権の負担が付いた土地の価値", "share": 0.4, "holder": "土地の買受人"}, {"label": "法定地上権の価値", "share": 0.6, "holder": "建物所有者", "accent": true}]}
  ]
}
```

```
node scripts/figgen/cli.js check scripts/figgen/specs/bar-hoteichijoken.json      # 仕様の検証
node scripts/figgen/cli.js scripts/figgen/specs/bar-hoteichijoken.json out.svg --png
python3 scripts/fig_lint.py out.svg --spec scripts/figgen/specs/bar-hoteichijoken.json
python3 scripts/figgen/trace.py scripts/figgen/specs/bar-hoteichijoken.json --body 本文.md --fig N --strict
```

## 分野別の用例

- 民法：法定地上権と担保価値、共同抵当の配当、法定相続分・遺留分、共有持分
- 民事執行：配当の順位と額
- 会社法：剰余金の配当、残余財産の分配、持株比率と決議要件
- 租税・倒産：債権の優先順位（補助的に）
