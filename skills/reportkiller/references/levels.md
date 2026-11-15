# レベル表（6 段）と、しきい値の唯一の元

レベルは「どこまで厳しく求めるか」だけを変える。手順（インテーク→主張マップ→調査と台帳→構成→本文→図→体裁→検証→渡し方）は全段で同じ。**上の段は下の段の要求（根拠の格・文献数・反論・射程・査読）をすべて含む。** ただし**文体の数値だけは「段」ではなく「型」で決まる**（§3）。上の段ほど文を短くそろえる設計は、2026-10-22 の研究で AI の文の形に近づくと分かったのでやめた。

確度の印：**確**＝一次資料で確かめた／**判**＝設計上の判断／**較**＝較正用の完成版（判例研究の発表レジュメ）で較正／**数**＝公開論文の実測から。

## 1. 6 段の要求

| 段 | id | 一言 | 読者 | 中心主張を支える根拠 | 文献（最低） | 反論と射程 | 構成 | 査読（本文を見ていない別の担当・読むだけ） | スライド |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `hs` 高校生 | 根拠つきの意見文 | 教科の先生 | V3 か V1（教科書・公的資料の整理） | 3 | 反対意見 1 つに答える | 序論・本論・結論 | 1 回（根拠なし・AI らしさ） | 頼まれたら 5〜8 枚 |
| 2 | `ug` 学部生 | 自分の論点が 1 つあるレポート | 採点者 | V3 を 1 件以上。V1 は 3 割以下 | 5（一次か査読 1） | 最も強い反論 1 つ＋射程 | 分野の標準＋冒頭の構成 | 1 回（5 観点） | 頼まれたら 10〜15 枚（判例研究は 45〜50） |
| 3 | `grad` 大学院生 | 先行研究の隙間を埋める | 指導教員・ゼミ | 一次か査読の V3 を 2 件以上。V1 は 1 割以下 | 10（一次か査読 3） | 反論 2 つ以上＋残る問題＋射程の外 | ＋方法の節 | 2 回（引用／反対を別々に） | 頼まれたら 15〜20 枚 |
| 4 | `pro` 専門家 | 意思決定に使える報告 | 決裁者 | grad ＋根拠の時点と確認日。V1 は 0 | 10（一次中心） | ＋前提が変わったときの結論の変化 | ＋要旨（結論先出し）＋推奨 | 2 回＋数値・日付・時点の再確認 | 頼まれたら 10〜15 枚 |
| 5 | `paper` 論文 | 先行研究に無い寄与 | 査読者 | 中心主張の文献はすべて V3。全行 V2 以上 | 15（査読・一次中心） | ＋限界の節 | 分野の標準を厳密に＋要旨・キーワード・投稿規定 | 3 回（引用・反対・文体＝査読者の目） | 頼まれたら 15〜20 枚 |
| 6 | `conf` 学会 | 寄与を 1 枚で言える | 会場の研究者 | paper と同じ | 15 | ＋想定問答 5 問 | 予稿は投稿先の書式＋スライドと 1 対 1 | 3 回＋全スライドの画像点検 | **必須**（1 分 1 枚が目安） |

根拠：学部生＝中央教育審議会「学士課程教育の構築に向けて」（2008）の学士力 (4)(5)（確）。大学院生＝大学院設置基準 3 条・4 条（確）。論文＝ICMJE Recommendations の IMRaD（確）。高校生・専門家・学会は判。詳しい次元ごとの差（先行研究の扱い・新規性・用語の密度・インテークで聞くこと）は `structure.md` §1。

## 2. 呼び方

`/reportkiller 〔レベル〕〔分野〕 課題文`。レベルの語：高校生・高校・hs／学部生・学部・大学生・ug・undergrad／大学院生・院生・修士・博士・grad・phd／専門家・実務・報告書・pro／論文・査読・投稿・paper・journal／学会・発表・予稿・conf・conference。省けば既定（学部生）。

## 3. 文体の型（数値はここが唯一の元）

| 型 | 使う段 | 何を手本にしたか | 根拠 |
|---|---|---|---|
| `essay`（意見文） | 高校生 | 短く断定する意見文 | 判（高校の文章は未測定） |
| `resume`（発表レジュメ） | 学部生 | 較正用の完成版（判例研究のレジュメ・約 1.4 万字）の実測 | 較（研究ノート EXEMPLAR-UNDERGRAD §6.2。このプラグインには入っていない） |
| `paper`（論文） | 大学院生・専門家・論文・学会 | 人の法律論文 39 本（学部〜研究者）の文書ごとの分布の 10〜90% 点と、学者出身の判事の個別意見 39 件 | 数（研究ノート WRITING-JA-LAW-PAPERS §8・WRITING-JA-LAW-JUDGE §5。このプラグインには入っていない）。法律以外の分野は未測定で、同じ値を仮に使う（判）。専門家の段は実務の報告書を測っていない（判） |
| 英語（段ごと） | 全段 | 英語の公開論文 99 本（一流誌・大学院・学部の優秀作）の 5〜95 パーセンタイル | 数（研究ノート WRITING-EN §7・§8.2）。高校生・専門家は判 |

学部生の段で**論文（読ませる文章）を書くとき**は `resume` の数値を上限として使い、目標値（平均 48 字）にはしない（研究ノート EXEMPLAR-UNDERGRAD §6.0）。判例研究の発表レジュメなら目標値でよい。

### 3.1 しきい値（機械可読）

`scripts/report_check.js` の `LEVELS` と、`references/` の prose-ja・prose-ja-law・prose-en・figures の数値は、この JSON の写し。**数値を変えるときはここを直してから写す。**

```json
{"_": "reportkiller-thresholds-v2.1",
 "ja": {
  "essay":  {"profile": "essay",  "avgMax": 55, "avgTarget": null, "over100Max": 0.05, "over120Max": null, "para24Min": 0.5,  "para24Max": null, "plainMin": 0.8,  "hedgeMax": 1,   "enumMax": 5, "signpostMax": 3},
  "resume": {"profile": "resume", "avgMax": 55, "avgTarget": 48,   "over100Max": 0.02, "over120Max": 0,    "para24Min": 0.6,  "para24Max": 0.9,  "plainMin": 0.85, "hedgeMax": 0.5, "enumMax": 5, "signpostMax": 3},
  "paper":  {"profile": "paper", "medianMin": 54, "medianMax": 95, "meanMin": 60, "over100Min": 0.08, "over100Max": 0.4, "over200Max": 0.03, "over300Max": 0, "cvMin": 0.45,
             "oneParaMin": 0.08, "paraCharsMax": 600, "inferMin": 0.025, "inferMax": 0.2, "sameEndRunMax": 0.02, "judgmentEndMax": 0.01, "daiichiMax": 2, "mittsuMax": 2, "enumMax": 5, "signpostMax": 3, "mottomoMax": 1.8,
             "headingsMax": 25, "headingCharsMax": 25, "bulletsMax": 0}
 },
 "enRules": {
  "ug":   {"ptail": 0.7, "moreover": 1.0, "headings": 3.0,  "ratherThan": 1.1,  "aiWords3": 7,   "quoteShare": 0.18, "triad": 7,   "wordLen": 6.0, "emdash": 8, "passive": 0.40, "neitherNor": 0.5,  "reframe": 0.3,  "enumeration": 2.5,  "paraWords": [70, 200], "paraLong": 0.50, "howeverInitial": 0.85, "notOnly": 0.5, "notXbutY": 1.0, "restate": 0.2},
  "grad": {"ptail": 0.5, "moreover": 0.8, "headings": 2.85, "ratherThan": 1.03, "aiWords3": 5.7, "quoteShare": 0.15, "triad": 6.5, "wordLen": 5.9, "emdash": 7, "passive": 0.35, "neitherNor": 0.42, "reframe": 0.25, "enumeration": 2.43, "paraWords": [75, 190], "paraLong": 0.45, "howeverInitial": 0.80, "notOnly": 0.5, "notXbutY": 1.0, "restate": 0.2}
 },
 "levels": {
  "hs":    {"ja": "essay",  "en": {"meanMin": 14, "meanMax": 26, "cvMin": 0.30, "over40Max": 0.15, "under10Min": null, "under10Max": 0.15, "hedgeMin": null, "hedgeMax": null, "rules": "ug"},
            "ledgerMin": 3,  "v1Max": 0.5, "v3Min": 0,   "primaryMin": 0, "coreV3": "warn",  "fig": "warn",  "counter": "warn",  "scope": "info",  "structure": "three",  "outline": "none",  "method": false, "abstract": false, "limitations": false, "sensitivity": false, "qa": false, "reviews": 1, "slides": {"req": false, "min": 5,  "max": 8},  "chars": [1200, 2000]},
  "ug":    {"ja": "resume", "en": {"meanMin": 16, "meanMax": 30, "cvMin": 0.35, "over40Max": 0.25, "under10Min": null, "under10Max": 0.15, "hedgeMin": 1.5,  "hedgeMax": 15,   "rules": "ug"},
            "ledgerMin": 5,  "v1Max": 0.3, "v3Min": 0.3, "primaryMin": 1, "coreV3": "error", "fig": "error", "counter": "error", "scope": "warn",  "structure": "field",  "outline": "warn",  "method": false, "abstract": false, "limitations": false, "sensitivity": false, "qa": false, "reviews": 1, "slides": {"req": false, "min": 10, "max": 15}, "chars": [2000, 6000]},
  "grad":  {"ja": "paper",  "en": {"meanMin": 18, "meanMax": 32, "cvMin": 0.38, "over40Max": 0.25, "under10Min": 0.02, "under10Max": 0.14, "hedgeMin": 2.5,  "hedgeMax": 15,   "rules": "grad"},
            "ledgerMin": 10, "v1Max": 0.1, "v3Min": 0.5, "primaryMin": 3, "coreV3": "error", "fig": "error", "counter": "error", "scope": "error", "structure": "field",  "outline": "error", "method": true,  "abstract": false, "limitations": false, "sensitivity": false, "qa": false, "reviews": 2, "slides": {"req": false, "min": 15, "max": 20}, "chars": [8000, 20000]},
  "pro":   {"ja": "paper",  "en": {"meanMin": 16, "meanMax": 28, "cvMin": 0.38, "over40Max": 0.20, "under10Min": 0.02, "under10Max": 0.14, "hedgeMin": 2.5,  "hedgeMax": 12,   "rules": "grad"},
            "ledgerMin": 10, "v1Max": 0,   "v3Min": 0.5, "primaryMin": 3, "coreV3": "error", "fig": "error", "counter": "error", "scope": "error", "structure": "field",  "outline": "error", "method": true,  "abstract": true,  "limitations": false, "sensitivity": true,  "qa": false, "reviews": 2, "slides": {"req": false, "min": 10, "max": 15}, "chars": [4000, 12000]},
  "paper": {"ja": "paper",  "en": {"meanMin": 18, "meanMax": 32, "cvMin": 0.40, "over40Max": 0.25, "under10Min": 0.03, "under10Max": 0.14, "hedgeMin": 3,    "hedgeMax": 12,   "rules": "grad"},
            "ledgerMin": 15, "v1Max": 0,   "v3Min": 0.7, "primaryMin": 5, "coreV3": "error", "fig": "error", "counter": "error", "scope": "error", "structure": "strict", "outline": "error", "method": true,  "abstract": true,  "limitations": true,  "sensitivity": true,  "qa": false, "reviews": 3, "slides": {"req": false, "min": 15, "max": 20}, "chars": [8000, 16000]},
  "conf":  {"ja": "paper",  "en": {"meanMin": 18, "meanMax": 32, "cvMin": 0.40, "over40Max": 0.25, "under10Min": 0.03, "under10Max": 0.14, "hedgeMin": 3,    "hedgeMax": 12,   "rules": "grad"},
            "ledgerMin": 15, "v1Max": 0,   "v3Min": 0.7, "primaryMin": 5, "coreV3": "error", "fig": "error", "counter": "error", "scope": "error", "structure": "strict", "outline": "error", "method": true,  "abstract": true,  "limitations": true,  "sensitivity": true,  "qa": true,  "reviews": 3, "slides": {"req": true,  "min": 12, "max": 15}, "chars": [3000, 12000]}
 }}
```

読み方：`avgMax`＝1 文の平均（字）の上限、`over100Max`＝100 字超の文の割合の上限、`para24Min`＝地の文の段落のうち 2〜4 文のものの割合の下限、`para24Max`＝同じ割合の上限（そろいすぎ。完成版は 73%。v2.1）、`plainMin`＝語尾 4 形（た・る・である・ない）の割合の下限、`hedgeMax`＝ヘッジ（1,000 字あたり）の上限、`enumMax`＝数え上げの族（第一に・一つは／もう一つ・二つの点・〇つある…）の 1 万字あたりの上限（4 回以上で見る。v2.1）、`signpostMax`＝章の頭と末の道案内（本章では〜を確認する・次章では〜）の 1 万字あたりの上限（4 文以上で見る。v2.1）。`paper` 型は `prose-ja-law.md` §2、英語は `prose-en.md` §4 に列ごとの意味と根拠がある。`coreV3`・`fig`・`counter`・`scope`・`outline` は所見の重さ（none／info／warn／error）。`chars` は分量の目安（課題・投稿先の指定が優先、要求ではない）。

### 3.2 日本語の 3 つの型（人が読む表）

| 型 | 1 文 | 100 字超 | 段落 | 語尾・推量 | 見出し・箇条・結び |
|---|---|---|---|---|---|
| essay（高校生） | 平均 55 字以下 | 5% 以下 | 2〜4 文の段落が 5 割以上 | 4 形 8 割以上。ヘッジ 1,000 字に 1 回まで | 序論・本論・結論。「今後」の結びは info |
| resume（学部生・較） | 平均 55 字以下（目標 約 48） | 2% 以下。120 字超は 0 | 2〜4 文の段落が 6 割以上・9 割以下（1 文の段落は 3 割まで。完成版 73%） | 4 形 85% 以上。ヘッジ 0.5 回まで。推論は「〜と読める」「〜とみられる」 | 箇条書きは構造が本質のところだけ（3 割まで）。数え上げの族 1 万字に 5 まで。道案内（本章では〜）1 万字に 3 まで |
| paper（院以上・数） | 中央値 54〜95 字・平均 60 字以上。**100 字超を 8〜40% 混ぜる**。200 字超 3% まで・300 字超 0。変動係数 0.45 以上 | 同左 | 1〜5 文。1 文の段落も 8% 以上使う。600 字超は分ける候補 | 断定と推論を書き分ける：推量・問いの文末（であろう・と思われる・と考えられる・ではないか・〜か）2.5〜20%。各節の結論は言い切る。判決の定型（というべきである）は 1% 以下。同じ文末の 3 連続 2% 以下 | 数え上げの族（第一に・一つは／もう一つ・二つの点・〇つある）1 万字に 5 まで（うち「第一に」2・「三つに分ける」5,000 字に 2）・文頭「もっとも」100 文に 1.8 まで。道案内 1 万字に 3 まで。見出し 1 万字に 25 まで・題は 25 字以内。箇条書き 0。「今後…が課題」で締めない。作業の記録（検索先・読めなかった資料）を本文に書かない |

### 3.3 英語（段ごと）

| 段 | 1 文の平均（語） | 変動係数 | 40 語超 | 10 語未満 | 中核ヘッジ（1,000 語） |
|---|---|---|---|---|---|
| 高校生 | 14〜26 | ≥ 0.30 | ≤ 15% | ≤ 15% | — |
| 学部生 | 16〜30 | ≥ 0.35 | ≤ 25% | ≤ 15% | 1.5〜15 |
| 大学院生 | 18〜32 | ≥ 0.38 | ≤ 25% | 2〜14% | 2.5〜15 |
| 専門家（判） | 16〜28 | ≥ 0.38 | ≤ 20% | 2〜14% | 2.5〜12 |
| 論文・学会 | 18〜32 | ≥ 0.40 | ≤ 25% | 3〜14% | 3〜12 |

一流の分布は平均 25.6 語・変動係数 0.47・40 語超 11%・10 語未満 6%。以前の「平均 15〜22 語・40 語超を作らない」は 40 語超が 2% しかない GPT-4o の形に近い（研究ノート WRITING-EN §8.2）。10 語未満の上限 14〜15% は Claude の下書き（18〜19%）を直すため。

## 4. 単調性

上の段は下の段の要求を含む：文献の最低数は増え、V1 の上限は減り、V3 の下限は増え、所見の重さは上がり、項目（方法・要旨・限界・感度・想定問答）は足されるだけで外れない。**文体の数値は型で決まるので、学部生（resume）→大学院生（paper）で「短くそろえる」要求は外れる**（型が変わる）。英語は変動係数の下限と短い文の上限が段ごとに締まる。専門家の英語だけ、読者が決裁者なので平均と 40 語超が少し短い（判）。
