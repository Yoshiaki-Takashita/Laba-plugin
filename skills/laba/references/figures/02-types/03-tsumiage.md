# 03　時系列の積み上げ図

当事者関係が時間とともに増えていく事案を、同じ配置のまま一段ずつ足して見せる。発表スライドの作法をノートに持ち込んだ型。

- レンダラ：`parties`（`scripts/figgen/lib/renderers/parties.js`）。この型は専用のレンダラを持たず、上のレンダラの使い方で作る
- 用例：`scripts/figgen/specs/parties-pict-hosho.json`

## いつ使うか

- 契約→担保の設定→弁済→求償のように、関係が順に増える事案
- 発表・勉強会のスライドで、一枚ずつ関係を足して説明するとき
- 長い事実関係を、節目ごとに切って見せたいとき

## 使わないとき

- 関係が増えず、時点だけが問題のとき（時間軸を使う）
- ノートの紙面に全部の段を載せると場所を取りすぎるとき（最後の段だけを載せ、途中は本文で書く）

## 要素

- 人型（黒一色の線画）＋その下に立場の語。丸で囲まない
- 矢印に `step` の番号。`--step n` で n までを描き、n の矢印だけを強調する
- 前の段までの関係は黒のまま残す（消さない・動かさない）
- 下の帯（`band`）：太い罫の下に、その段の事実を一行目は太字で書く

## 作り方

1. 全部の段が入った最終形の配置を先に決める（途中で人を動かさない）
2. `pict: true` にし、`edges` に `step` を 1 から振る
3. `node cli.js spec.json out.svg --steps --png` で段ごとの図を出す
4. 各段の `band` に、その段で起きた事実を一文で書く（ノートでは最後の段だけ使うことが多い）
5. スライドでは図形で描き直す（`references/slides/`）。ここでの配置と強調の決まりはそのまま使う

## よくある失敗

| 失敗 | 直し方 |
|---|---|
| 段ごとに人の位置が変わり、同じ人だと分からない | 最終形の配置を固定する |
| 前の段の矢印を灰色にしすぎて読めない | 黒のまま残し、新しい関係だけをえんじにする |
| 帯の文が図と別のことを言っている | 帯は、その段で足した矢印の説明だけにする |

## 最小の仕様

`parties` で図になる最小の形。ここから項目を足す（全部の項目は `scripts/figgen/README.md` 5 節）。

```json
{"type":"parties","message":"…。","caption":"図N　この図で分かること：…。矢印は請求の向き。強調は…。",
 "nodes":[{"id":"x","label":"債権者"},{"id":"y","label":"債務者","pos":[1,0]}],
 "edges":[{"from":"x","to":"y","label":"貸金の返還を請求","accent":true}]}
```

## 仕様を書くときに迷う所

| 迷う所 | 答え |
|---|---|
| `pos` は何を書くか | `[列, 行]`。左上が `[0,0]`。省くと左から順に一列に並ぶ |
| `from`・`to` に何を書くか | `nodes` の `id`（`label` ではない）。請求する人・渡す人が `from` |
| 箱の幅を決めたい | `nodeWidth`。省くと、語の途中で折れない最小の幅になる |
| 線の横の語が入らない | 条文番号を `sub` に分ける。`rowGap` を広げる（省くと 112・150・190 から選ばれる） |
| 線の折れ方を変えたい | ふつうは任せる。`elbow:"vh"`／`"hv"`、`port`（-1〜1）、`straight` は、形を自分で決めたいときだけ |
| 人でないものを置きたい | `kind`：`thing`（物・書類）、`right`（権利）、`proc`（手続）、`organ`（会議体の機関）。`legend` も付ける |
| 範囲を示したい | `groups:[{members:[id…], label}]` |
| 手続上の行為（告知・通知）を権利と分けたい | `dash:"dot"`（点線の矢印） |
| 段ごとに出したい（スライド） | `edges[].step` に番号。`--steps` で段ごとの図 |

## 仕様の例

そのまま `node cli.js` に渡せば生成できる（図題の「図N」は、ノートでの番号に置き換える）。

```json
{
  "type": "parties",
  "pict": true,
  "message": "保証では、債権者と主債務者の間の債務を、保証人が債権者との契約で担保する。",
  "caption": "図N　この図で分かること：保証は債権者と保証人の間の契約で成立し、保証人が弁済すれば主債務者に求償できる。矢印は請求の向き。強調はこの段で新しく加わった関係。",
  "nodes": [
    {"id": "g", "label": "債権者", "pos": [0, 0]},
    {"id": "s", "label": "主債務者", "pos": [2, 0]},
    {"id": "h", "label": "保証人", "pos": [1, 1]}
  ],
  "edges": [
    {"from": "g", "to": "s", "label": "貸金の返還を請求", "step": 1},
    {"from": "g", "to": "h", "label": "保証債務の履行を請求", "step": 2},
    {"from": "h", "to": "s", "label": "求償", "sub": "（弁済したとき）", "step": 3}
  ],
  "showStep": 3,
  "band": ["③ 保証人が弁済したとき", "・保証人は、主債務者に対して求償することができる（民法459条など）"]
}
```

```
node scripts/figgen/cli.js check scripts/figgen/specs/parties-pict-hosho.json      # 仕様の検証
node scripts/figgen/cli.js scripts/figgen/specs/parties-pict-hosho.json out.svg --png
python3 scripts/fig_lint.py out.svg --spec scripts/figgen/specs/parties-pict-hosho.json
python3 scripts/figgen/trace.py scripts/figgen/specs/parties-pict-hosho.json --body 本文.md --fig N --strict
```

## 分野別の用例

- 民法：保証（貸付け→保証契約→弁済→求償）、抵当権（設定→譲渡→実行）、債権譲渡と相殺
- 民訴：訴えの提起→参加→上訴
- 会社法：設立の手続、組織再編の当事者の移り変わり
- 刑法：共犯の関与の時系列（共謀→実行→離脱）
