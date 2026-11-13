# 17　包含図

広い概念の中に狭い概念が入っている関係を、入れ子の四角で描く。

- レンダラ：`nest`（`scripts/figgen/lib/renderers/nest.js`）
- 用例：`scripts/figgen/specs/nest-kenri.json`

## いつ使うか

- 上位概念と下位概念（財産権→物権→担保物権）
- ある概念が別の概念の一部であることを示したいとき
- 用語の位置づけを最初に示すとき

## 使わないとき

- 二つの概念が一部だけ重なるとき（入れ子にならない。文か表）
- 三段を超える分類（表か、木）
- 分類の基準が二つあるとき（座標図）

## 要素

- 外の四角＝広い概念。左上に名前と定義
- 中の四角＝狭い概念。同じ段の概念は同じ高さ
- えんじ＝その節の主題の概念

## 作り方

1. `root.label` に最も広い概念
2. `children` に下位の概念。`lines` に定義や例
3. 主題に `accent`
4. 三段までにする

## よくある失敗

| 失敗 | 直し方 |
|---|---|
| 並列の概念を入れ子にした | 含む・含まれるの関係があるかを定義で確かめる |
| 例を概念と同じ箱にした | 例は `lines` に「例：」と書く |
| 円を重ねた図にして、重なりの意味が曖昧になった | 入れ子の四角にする。重なりを言いたいなら文で書く |

## 最小の仕様

`nest` で図になる最小の形。ここから項目を足す（全部の項目は `scripts/figgen/README.md` 5 節）。

```json
{"type":"nest","message":"…。","caption":"図N　…","root":{"label":"法律行為","children":[{"label":"契約","accent":true},{"label":"単独行為"}]}}
```

## 仕様の例

そのまま `node cli.js` に渡せば生成できる（図題の「図N」は、ノートでの番号に置き換える）。

```json
{
  "type": "nest",
  "message": "財産権は物権と債権に分かれ、物権はさらに所有権・用益物権・担保物権に分かれる。",
  "caption": "図N　この図で分かること：担保物権は物権の一種であり、物権は債権と並ぶ財産権の一種であるという包含関係が分かる。外側の枠ほど広い概念。強調はこの回で扱う担保物権。",
  "root": {"label": "財産権", "children": [{"label": "物権（物を直接に支配する権利）", "children": [{"label": "所有権"}, {"label": "用益物権", "lines": ["地上権など"]}, {"label": "担保物権", "lines": ["抵当権など"], "accent": true}]}, {"label": "債権", "lines": ["特定の人に行為を求める権利"]}]}
}
```

```
node scripts/figgen/cli.js check scripts/figgen/specs/nest-kenri.json      # 仕様の検証
node scripts/figgen/cli.js scripts/figgen/specs/nest-kenri.json out.svg --png
python3 scripts/fig_lint.py out.svg --spec scripts/figgen/specs/nest-kenri.json
python3 scripts/figgen/trace.py scripts/figgen/specs/nest-kenri.json --body 本文.md --fig N --strict
```

## 分野別の用例

- 民法：法律行為（契約・単独行為・合同行為）、財産権（物権・債権）、無効と取消し
- 刑法：犯罪論の体系、共犯（広義・狭義）
- 憲法：基本的人権の分類、国民主権
- 行政法：行政行為の分類、行政救済法の体系
- 民訴：訴訟行為の種類
