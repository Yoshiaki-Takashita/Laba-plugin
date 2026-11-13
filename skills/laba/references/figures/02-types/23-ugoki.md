# 23　動きの図

同じ二者の間で、あるものは相手に及び、あるものは及ばないことを、届く矢印と止まる線で並べて見せる。

- レンダラ：`movement`（`scripts/figgen/lib/renderers/movement.js`）
- 用例：`scripts/figgen/specs/movement-shucho-shoko.json`

## いつ使うか

- 効力が及ぶもの・及ばないものが並ぶ規律（絶対的効力と相対的効力）
- 「これは共通に扱われるが、これは別々」という規律（主張と証拠）
- 承認・放棄・中断などの効果が誰に及ぶか

## 使わないとき

- 及ぶ・及ばないが一組だけ（文で足りる）
- 及ぶ相手が複数いるとき（表にする）

## 要素

- 左の箱＝事由が生じた人。右の箱＝影響が問題になる人
- 届く矢印＝及ぶ。止め線で切れた線＝及ばない
- 線の上＝事由の名前。線の下＝根拠（条文・原則の名前）
- えんじ＝取り違えやすい方（多くは「及ばない」側）

## 作り方

1. `from`・`to` に二者
2. `items` に事由を並べる。`pass:true` は及ぶ、`false` は及ばない。`why` に根拠
3. 取り違えやすい一つに `accent`
4. 注に、例外（別段の意思表示など）を書く

## よくある失敗

| 失敗 | 直し方 |
|---|---|
| 及ぶ・及ばないを逆にした | 条文で一つずつ確かめる。改正で変わった事由に注意する |
| 根拠を書かず、結論だけ並べた | `why` に条文か原則の名前を書く |
| 改正前の規律を書いた | 現行の条文で確かめる |

## 最小の仕様

`movement` で図になる最小の形。ここから項目を足す（全部の項目は `scripts/figgen/README.md` 5 節）。

```json
{"type":"movement","message":"…。","caption":"図N　…","from":{"label":"連帯債務者の一人"},"to":{"label":"他の連帯債務者"},
 "items":[{"label":"弁済","pass":true},{"label":"請求","pass":false,"accent":true}]}
```

## 仕様の例

そのまま `node cli.js` に渡せば生成できる（図題の「図N」は、ノートでの番号に置き換える）。

```json
{
  "type": "movement",
  "message": "通常共同訴訟では、一人の主張は他の共同訴訟人に及ばないが、一人が出した証拠は全員の請求の判断に使われる。",
  "caption": "図N　この図で分かること：通常共同訴訟で共同被告の一人がした主張は他の被告に及ばないが、提出した証拠は他の被告の関係でも使われる。左の被告から右の被告へ及ぶかどうかを見る。止め線は及ばないこと、強調は及ばない主張。",
  "from": {"label": "共同被告その一", "sub": "出席して争う"},
  "to": {"label": "共同被告その二", "sub": "欠席"},
  "items": [
    {"label": "主張（弁済の抗弁）", "pass": false, "why": "共同訴訟人独立の原則（民訴法39条）", "accent": true},
    {"label": "証拠（弁済の領収書）", "pass": true, "why": "共同訴訟人間の証拠共通"}
  ],
  "notes": ["主張も及ぶとする見解（主張共通）があるが、判例は当然の補助参加を認めていない。"]
}
```

```
node scripts/figgen/cli.js check scripts/figgen/specs/movement-shucho-shoko.json      # 仕様の検証
node scripts/figgen/cli.js scripts/figgen/specs/movement-shucho-shoko.json out.svg --png
python3 scripts/fig_lint.py out.svg --spec scripts/figgen/specs/movement-shucho-shoko.json
python3 scripts/figgen/trace.py scripts/figgen/specs/movement-shucho-shoko.json --body 本文.md --fig N --strict
```

## 分野別の用例

- 民法：連帯債務者の一人に生じた事由（438条以下）、保証人に生じた事由、時効の完成猶予・更新の及ぶ範囲（153条）
- 民訴：共同訴訟人独立の原則と証拠共通、補助参加人の行為
- 刑法：共犯と身分（65条）、中止の効果
- 会社法：決議取消判決の効力
- 行政法：取消判決の第三者効
