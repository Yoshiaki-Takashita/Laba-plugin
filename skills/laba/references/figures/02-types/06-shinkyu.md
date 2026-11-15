# 06　審級の流れ

一つの事件が、第一審・控訴審・上告審でどう判断されたかを横に並べ、結論が変わった段を強調する。

- レンダラ：`instances`（`scripts/figgen/lib/renderers/instances.js`）
- 用例：`scripts/figgen/specs/instances-minji.json`

## いつ使うか

- 判例を読むとき。各審級の結論と理由の要点を一目で比べる
- 破棄差戻し・破棄自判など、上級審が結論を変えた事件
- 判例研究のレジュメ・スライドの「各審級の判断」の導入

## 使わないとき

- 最高裁の結論だけが問題のとき（文で足りる）
- 審級ごとの理由を詳しく比べたいとき（表にする。図の箱には要点一行しか入らない）

## 要素

- 箱＝審級。一行目に審級（太字）、次に日付、結論、理由の要点
- 矢印＝上訴。横に「控訴」「上告」と、誰が上訴したか
- えんじ＝結論が変わった審級
- 破線の箱＝まだ判断が出ていない段（差戻後の審理が続いているとき）

## 作り方

1. `stages` に審級を順に書く。`court`・`date`・`result`・`reason`
2. `links` に上訴の種類（「原告が控訴」「検察官が上告」）
3. 結論が変わった段に `accent`、まだ判断が出ていない段に `dash`
4. 裁判所名・日付・結論は、判決文か裁判所の公表資料で確かめてから入れる（`../../case-verification.md`）

## よくある失敗

| 失敗 | 直し方 |
|---|---|
| 結論を確かめずに「棄却」「破棄」を書いた | 主文で確かめる。確かめられない段は、図に入れない |
| 書き込み用の文言（「理由の要点を…」）を残したまま出した | 箱の中は、完成した語だけにする |
| 理由を箱に詰め込みすぎた | 要点を一行にする。詳しい理由は本文か表 |
| 誰が上訴したかが書いていない | 矢印の横に書く。結論の意味（誰が勝ったか）が変わる |

## 最小の仕様

`instances` で図になる最小の形。ここから項目を足す（全部の項目は `scripts/figgen/README.md` 5 節）。

```json
{"type":"instances","message":"…。","caption":"図N　…",
 "stages":[{"court":"第一審","result":"請求棄却"},{"court":"控訴審","result":"請求認容","accent":true}],"links":["控訴"]}
```

## 仕様の例

そのまま `node cli.js` に渡せば生成できる（図題の「図N」は、ノートでの番号に置き換える）。

```json
{
  "type": "instances",
  "message": "上告審が原判決を破棄して差し戻すと、事件は控訴審に戻り、上告審の判断に従って審理がやり直される。",
  "caption": "図N　この図で分かること：第一審と控訴審で請求が退けられても、上告審が破棄差戻しをすれば、控訴審で審理がやり直され、結論が変わりうる（説明のための設例）。左から右へ審級が進む。強調は結論が変わった上告審。",
  "stages": [
    {"court": "第一審", "result": "請求棄却", "reason": ["被告に過失がない"]},
    {"court": "控訴審", "result": "控訴棄却", "reason": ["第一審と同じ理由"]},
    {"court": "上告審", "result": "破棄差戻し", "reason": ["過失の判断の枠組みが誤り", "事実をさらに審理させる"], "accent": true},
    {"court": "差戻後の控訴審", "result": "請求認容", "reason": ["上告審の判断に従い、過失を認めた"]}
  ],
  "links": ["控訴", "上告", "差戻し"],
  "notes": ["差戻しを受けた裁判所は、上告審が破棄の理由とした事実上及び法律上の判断に拘束される（民訴法325条3項）。"]
}
```

```
node scripts/figgen/cli.js check scripts/figgen/specs/instances-minji.json      # 仕様の検証
node scripts/figgen/cli.js scripts/figgen/specs/instances-minji.json out.svg --png
python3 scripts/fig_lint.py out.svg --spec scripts/figgen/specs/instances-minji.json
python3 scripts/figgen/trace.py scripts/figgen/specs/instances-minji.json --body 本文.md --fig N --strict
```

## 分野別の用例

- 民事：請求棄却→控訴棄却→破棄差戻し
- 刑事：有罪→破棄自判・無罪→上告棄却
- 行政：却下（原告適格なし）→取消し（原告適格あり）
- 憲法：下級審の違憲判断と最高裁の判断
