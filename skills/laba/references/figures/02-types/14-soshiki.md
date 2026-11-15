# 14　組織図

機関と機関の関係（選任・監督・報告）を、上から下への木で描く。

- レンダラ：`tree`（`scripts/figgen/lib/renderers/tree.js`）。この型は専用のレンダラを持たず、上のレンダラの使い方で作る
- 用例：`scripts/figgen/specs/tree-kikan.json`

## いつ使うか

- 会社の機関設計（株主総会・取締役会・監査役など）
- 国の機関・行政組織の関係
- 裁判所の構成、捜査機関の関係

## 使わないとき

- 機関の権限の中身を比べたいとき（表）
- 選任と監督が双方向で、木にならないとき。監査の線が横に走るとき、監査の相手が書類のとき（当事者関係図で描き、`kind:"organ"`・`"thing"` で箱の形を分ける。`parties-daihyososho`）

## 要素

- 箱＝機関。一行目に名前、二行目に役割
- 矢印＝選任・監督。選ぶ側から選ばれる側へ。横に「選任」「選定・監督」
- えんじ＝その節の主題になる機関

## 作り方

1. `direction:"down"`
2. `root` に最上位の機関、`children` に下位の機関。`edge` に関係の語
3. 主題の機関に `accent`
4. 機関設計の型（監査役設置会社など）を図題に書く。型が違えば図も違う

## よくある失敗

| 失敗 | 直し方 |
|---|---|
| 選任と監督を一本の矢印にまとめ、誰が誰を監督するか分からない | 語を「選定・監督」と並べるか、別の線にする |
| 機関設計の型を書かず、どの会社にも当てはまるように見えた | 図題に型を書く |
| 条文で確かめずに権限を書いた | 根拠条文を本文に書き、図はそれに合わせる |

## 最小の仕様

`tree` で図になる最小の形。ここから項目を足す（全部の項目は `scripts/figgen/README.md` 5 節）。

```json
{"type":"tree","message":"…。","caption":"図N　…",
 "root":{"text":"実行に着手したか","children":[{"edge":"した","text":"未遂か既遂","accent":true},{"edge":"しない","text":"予備にとどまる"}]}}
```

## 仕様を書くときに迷う所

| 迷う所 | 答え |
|---|---|
| 向き | `direction:"right"`（既定。決定木）・`"down"`（要件効果の木・組織図）。枝の語が四字を超えるなら `down` |
| 矢じりを消したい | `noHeads:true`（要件効果の木・組織図） |
| 葉の下辺が太いのは | 結論の印。やめるなら `leafUnder:false` |
| 兄弟の箱の間を広げたい | `gapY`（`right` のとき） |

## 仕様の例

そのまま `node cli.js` に渡せば生成できる（図題の「図N」は、ノートでの番号に置き換える）。

```json
{
  "type": "tree",
  "direction": "down",
  "message": "取締役会を置く会社では、株主総会が取締役と監査役を選び、取締役会が代表取締役を選ぶ。",
  "caption": "図N　この図で分かること：監査役設置会社では、株主総会が取締役と監査役を選任し、取締役の全員で組織する取締役会が代表取締役を選定して監督する。上から下へ、選ぶ側から選ばれる側へ読む。強調は業務を執行する代表取締役。",
  "root": {"text": "株主総会", "children": [{"edge": "選任", "text": "取締役", "sub": "全員で取締役会を|組織する", "children": [{"edge": "選定・監督", "text": "代表取締役", "sub": "業務を執行し会社を代表する", "accent": true}]}, {"edge": "選任", "text": "監査役", "sub": "取締役の職務の執行を監査する"}]},
  "leafUnder": false
}
```

```
node scripts/figgen/cli.js check scripts/figgen/specs/tree-kikan.json      # 仕様の検証
node scripts/figgen/cli.js scripts/figgen/specs/tree-kikan.json out.svg --png
python3 scripts/fig_lint.py out.svg --spec scripts/figgen/specs/tree-kikan.json
python3 scripts/figgen/trace.py scripts/figgen/specs/tree-kikan.json --body 本文.md --fig N --strict
```

## 分野別の用例

- 会社法：監査役設置会社、指名委員会等設置会社、監査等委員会設置会社
- 憲法：国会・内閣・裁判所の関係（抑制と均衡は両矢印になるので当事者関係図）
- 行政法：行政組織（大臣・外局・地方支分部局）、国と地方公共団体
- 刑訴：司法警察職員・検察官・裁判官
