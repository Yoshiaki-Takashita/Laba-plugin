# 25　複合図（同じ枠のくり返し）

同じ型・同じ枠の図を上下に並べ、違う所だけを強調して比べる。「成立する場合」と「しない場合」を一枚で見せる。

- レンダラ：`panel`（`scripts/figgen/lib/renderers/panel.js`）
- 用例：`scripts/figgen/specs/panel-hoteichijoken.json`

## いつ使うか

- 同じ時間軸・同じ当事者で、一つの事実だけが違う二つの場合
- 成立する場合と成立しない場合、原則と例外
- 比較図では入らない、図どうしの比較

## 使わないとき

- 違う型の図を並べること（比べられない。別の図にする）
- 三つ以上の場合（紙面が足りない。表か、二枚に分ける）
- 違いが多すぎるとき（どこを比べるかが分からなくなる）

## 要素

- 区画＝下位の図。区画の見出しに「（a）〜の場合：結論」
- 下位の図は同じ型・同じ並び・同じ言い回し
- えんじ＝二つの区画で違う所だけ
- 注＝全体で一つ。要件と、違いが結論を分ける理由

## 作り方

1. 先に一つの場合の図を作る
2. それを写して、違う事実だけを変える
3. `panels` に `title` と `spec` を入れる。下位の `caption`・`message` は不要
4. 違う所に `accent`（両方の区画の対応する位置）
5. 全体の図題に、上下を見比べることを書く

## よくある失敗

| 失敗 | 直し方 |
|---|---|
| 上下で出来事の並びや言い回しが違い、違いが探せない | 一方を写して作る。同じ所は一字も変えない |
| 区画の見出しに結論がない | 「：成立する」「：成立しない」まで書く |
| 図が縦に長くなりすぎた（高さ 900 単位超） | 段を減らすか、二つの図に分けて見開きに置く |

## 最小の仕様

`panel` で図になる最小の形。ここから項目を足す（全部の項目は `scripts/figgen/README.md` 5 節）。

```json
{"type":"panel","message":"…。","caption":"図N　…",
 "panels":[{"title":"（a）建物がある場合：成立する","spec":{"type":"timeline","events":[{"date":"設定時","label":"建物がある","accent":true},{"date":"競売後","label":"成立する"}]}},
           {"title":"（b）更地の場合：成立しない","spec":{"type":"timeline","events":[{"date":"設定時","label":"更地である","accent":true},{"date":"競売後","label":"成立しない"}]}}]}
```

## 仕様の例

そのまま `node cli.js` に渡せば生成できる（図題の「図N」は、ノートでの番号に置き換える）。

```json
{
  "type": "panel",
  "message": "法定地上権は、抵当権を設定した時に建物があった場合に成立し、更地であった場合には成立しない。",
  "caption": "図N　この図で分かること：法定地上権（民法388条）が成立するかは抵当権設定時の状態で決まり、設定時に建物があれば成立し、更地であれば後に建物を建てても成立しない。上下の図を同じ時点どうしで見比べる。左から右へ時間が進む。強調は判断の基準時と、結論を分ける設定時の状態。点線は基準時を下の帯まで下ろした補助線、破線の帯は「ない」状態。",
  "panels": [
    {"title": "（a）設定時に建物がある場合：成立する", "spec": {"type": "timeline", "events": [{"date": "当初", "label": "Aが土地と建物を所有"}, {"date": "抵当権設定時", "label": "土地にBの抵当権を設定", "accent": true, "mark": "基準時：建物があるか、|同じ人の所有かを見る"}, {"date": "設定後", "label": "建物はそのまま"}, {"date": "競売後", "label": "Cが競売で土地を買い受ける"}], "tracks": [{"name": "土地の上の建物", "segments": [{"from": 0, "label": "設定時にすでにある（Aが所有）", "accent": true}]}, {"name": "建物のための利用権", "segments": [{"from": 0, "to": 3, "label": "不要（自分の土地）", "gray": true}, {"from": 3, "label": "法定地上権が成立"}]}]}},
    {"title": "（b）設定時に更地であった場合：成立しない", "spec": {"type": "timeline", "events": [{"date": "当初", "label": "Aが土地を所有（更地）"}, {"date": "抵当権設定時", "label": "土地にBの抵当権を設定", "accent": true, "mark": "基準時：建物があるか、|同じ人の所有かを見る"}, {"date": "設定後", "label": "Aが建物を建てる"}, {"date": "競売後", "label": "Cが競売で土地を買い受ける"}], "tracks": [{"name": "土地の上の建物", "segments": [{"from": 0, "to": 2, "label": "設定時にはない", "accent": true, "dash": true}, {"from": 2, "label": "設定後に築造（Aが所有）"}]}, {"name": "建物のための利用権", "segments": [{"from": 3, "label": "成立しない", "dash": true}]}]}}
  ],
  "notes": ["法定地上権の要件は、抵当権設定時に土地の上に建物があること、設定時に土地と建物が同じ人の所有であること、土地・建物の一方または双方に抵当権が設定されたこと、競売によって所有者が別々になったことの四つ。", "（b）で成立しないのは、抵当権者が土地を更地として評価して担保に取っているからである。"]
}
```

```
node scripts/figgen/cli.js check scripts/figgen/specs/panel-hoteichijoken.json      # 仕様の検証
node scripts/figgen/cli.js scripts/figgen/specs/panel-hoteichijoken.json out.svg --png
python3 scripts/fig_lint.py out.svg --spec scripts/figgen/specs/panel-hoteichijoken.json
python3 scripts/figgen/trace.py scripts/figgen/specs/panel-hoteichijoken.json --body 本文.md --fig N --strict
```

## 分野別の用例

- 民法：法定地上権の成否（設定時に建物がある・ない）、有権代理と無権代理、取消しの前の第三者と後の第三者
- 民訴：既判力が及ぶ場合・及ばない場合
- 刑法：正当防衛が成立する場合・過剰防衛になる場合
- 行政法：原告適格が認められる場合・認められない場合
- 会社法：承認のある利益相反取引・承認のない利益相反取引
