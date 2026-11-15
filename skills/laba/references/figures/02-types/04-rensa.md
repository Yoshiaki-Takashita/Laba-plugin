# 04　権利移転の連鎖

権利や物が人から人へ移っていく順を、左から右へ一列に描く。

- レンダラ：`chain`（`scripts/figgen/lib/renderers/chain.js`）
- 用例：`scripts/figgen/specs/chain-tenbai.json`

## いつ使うか

- 転売・転得者が出てくる事案（詐欺取消しと第三者、即時取得、善意の第三者）
- 「誰の時点で権利が止まるか」「誰までさかのぼれるか」が問題のとき
- 承継人の範囲（口頭弁論終結後の承継人）を示すとき

## 使わないとき

- 移転が一回だけ（文で足りる）
- 同じ人から二人に移る場合の優劣（対抗関係の図を使う）

## 要素

- 箱＝権利を持つ（持っていた）人。左がもとの権利者
- 実線の矢印＝移転。矢印の上に原因（売買・相続）、下に後の出来事（取消し）
- えんじの箱＝保護されるかどうかが問われる人（転得者・第三者）
- 注＝その人が保護される要件（善意・無過失など）を条文とともに

## 作り方

1. `nodes` を移転の順に並べる
2. `links` に移転を書き、`label` に原因、`sub` に後の出来事を書く
3. 保護が問われる人に `accent`
4. 注に、保護の要件と根拠条文を一文で書く

## よくある失敗

| 失敗 | 直し方 |
|---|---|
| 取消し・解除を、移転の矢印と同じ見た目で逆向きに描いた | 取消しは移転ではない。もとの矢印の下に「のちに取消し」と語で書く |
| 「善意の第三者」の「善意」を落とした | 限定語は箱か注に必ず書く（trace.py の T05） |
| 時点の前後（取消しの前か後か）が図から読めない | 矢印の語に「取消しの前」と書く。前後で結論が分かれるなら複合図にする |

## 最小の仕様

`chain` で図になる最小の形。ここから項目を足す（全部の項目は `scripts/figgen/README.md` 5 節）。

```json
{"type":"chain","message":"…。","caption":"図N　…",
 "nodes":[{"id":"a","label":"売主"},{"id":"b","label":"買主"},{"id":"c","label":"転得者"}],
 "links":[{"from":"a","to":"b","label":"売買"},{"from":"b","to":"c","label":"転売","accent":true}]}
```

## 仕様を書くときに迷う所

| 迷う所 | 答え |
|---|---|
| `links` と `relations` の違い | `links`＝権利が移る（左から右へ並ぶ）。`relations`＝移転でない関係（対抗・優劣。縦の線） |
| `relations` の `head` | 矢じりの付く側。「b が a に対抗できる」なら `head:"a"`。`both`（既定）・`none` もある |
| 確定した帰結を破線で描きたくない | `solid:true` |
| 線の横の語が入らない | `rowGap`（上下の箱の間隔）・`nodeWidth` を調える。条文番号は `sub` へ |

## 仕様の例

そのまま `node cli.js` に渡せば生成できる（図題の「図N」は、ノートでの番号に置き換える）。

```json
{
  "type": "chain",
  "message": "詐欺による取消しの前に目的物が転売されていると、取消しの効果を転得者に主張できるかが問題になる。",
  "caption": "図N　この図で分かること：詐欺を理由に売買を取り消しても、取消し前に現れた善意無過失の第三者には取消しを対抗できない（民法96条3項）。左から右へ権利が移る。強調は保護される第三者。",
  "nodes": [
    {"id": "a", "label": "売主", "sub": "だまされて売った"},
    {"id": "b", "label": "買主", "sub": "詐欺をした者"},
    {"id": "c", "label": "転得者", "sub": "取消し前の第三者", "accent": true}
  ],
  "links": [
    {"from": "a", "to": "b", "label": "① 売買", "sub": "のちに取消し"},
    {"from": "b", "to": "c", "label": "② 転売", "sub": "取消しの前"}
  ],
  "notes": ["転得者が善意かつ無過失であれば、売主は取消しを対抗できない（96条3項）。"]
}
```

```
node scripts/figgen/cli.js check scripts/figgen/specs/chain-tenbai.json      # 仕様の検証
node scripts/figgen/cli.js scripts/figgen/specs/chain-tenbai.json out.svg --png
python3 scripts/fig_lint.py out.svg --spec scripts/figgen/specs/chain-tenbai.json
python3 scripts/figgen/trace.py scripts/figgen/specs/chain-tenbai.json --body 本文.md --fig N --strict
```

## 分野別の用例

- 民法：詐欺取消しと第三者（96条3項）、解除と第三者（545条1項ただし書）、即時取得（192条）、94条2項の類推適用
- 民訴：口頭弁論終結後の承継人（115条1項3号）
- 会社法：株式の譲渡と名義書換
- 刑法：盗品等の移転
