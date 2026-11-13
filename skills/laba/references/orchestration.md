# 担当に分けて進める（Cowork・Claude Code）

担当（`agents/`）が読み込まれる環境（Cowork、Claude Code）だけの手順。claude.ai のチャットでは `agents/` は読み込まれないので、`speed.md` の「まとめて呼ぶ」「まとめて走らせる」で進める。担当は、別の担当を立てられない。**立てるのは親（この会話の Claude）だけ**で、担当どうしの受け渡しは `work/` のファイルで行う。

## 目次
1. 担当の一覧　2. 流れ（波）　3. 受け渡しのファイル　4. 親が決めてから立てるもの　5. 担当に渡す指示　6. うまくいかないとき

## 1. 担当の一覧（名前は名詞）

| 担当（`agents/`） | 段階 | 数 | 読む／書く |
|---|---|---|---|
| `verifier`（確認） | ②⑤の前 | 組ごとに1人（条文20件・判例8件前後ごと） | 書く：`work/verified/*.json` |
| `section-writer`（節の執筆） | ⑤⑥⑧の設例 | 節ごとに1人 | 読む：資料・文体の指示・術語表・確認済み／書く：`work/sections/<節>.json` |
| `figure-maker`（図） | ⑦ | 図ごとに1人 | 読む：節の本文／書く：`work/figures/` |
| `backmatter-builder`（巻末） | ⑧ | 1人 | 読む：全節・確認済み／書く：`work/backmatter.json` など |
| `harmonizer`（統一） | ⑤〜⑧のあと | 1人 | 全節・図・巻末→`work/blocks.json` |
| `legal-reviewer`（法的点検） | ⑩ | 1人 | 読むだけ→`work/review/legal.md` |
| `added-text-reviewer`（足した文の点検） | ⑩ | 1人 | 同上 |
| `style-reviewer`（文体の点検） | ⑩ | 1人（教科書型、または節を分けて書いたとき） | 同上 |
| `figure-reviewer`（図の点検） | ⑩ | 1人（図が3枚以上） | 同上 |

担当の名前は、利用者との会話では「確認」「節の執筆」「図」「巻末」「統一」「点検」と呼んでよい。

## 2. 流れ（波）

同時に走らせるのは、同じ波の中。波と波の間は、親が結果を読んでから次へ進む。

| 波 | 誰が | すること | 同時にしてよいこと |
|---|---|---|---|
| 0 | 親（1人） | ①取り込み、②一覧化（`inventory.py`）、③文体の測定（`style_profile.py`）、④構成。**`work/outline.json`・`style-guide.md`・`glossary.json` を作る**（4節）。`verify_plan.py` で確認の計画を作る | — |
| 1 | `verifier` × 組の数 | 条文・判例を確かめる（組ごとに1人。担当の中でも「まとめて呼ぶ」） | 親は、確認が要らない節（判例を引かない節）の `section-writer` を先に立ててよい |
| 2 | `section-writer` × 節の数 | 節の本文（設例の論証・結論、ざっくり理解を含む） | 1人あたりの節は、資料の1〜3頁ぶんを目安に（長い節は分ける）。同時に立てる数は、最初は6人まで（上限は**不明**。失敗が出たら減らす） |
| 3 | `figure-maker` × 図の数 ＋ `backmatter-builder` | 図と巻末。どちらも本文が先（本文を読んで作る） | 同時 |
| 4 | `harmonizer`（1人） → 親 | 節・図・巻末を結合し、術語・体・参照・重複をそろえる。続けて親が `build_and_check.py`（⑨） | — |
| 5 | 点検の担当（最大4人） | ⑩の独立点検。全員が読むだけなので、同時に立てる | 同時 |
| 6 | 親 | 点検の指摘を、重大・中程度から直す。再検査（`build_and_check.py`）。⑫の報告 | 回数の上限は `speed.md` 5 |

速さ優先のとき：波1は条文・判例の数が少なければ `verifier` 1人。波3の巻末は縮約。波5は `legal-reviewer` と `added-text-reviewer` の2人だけ。

## 3. 受け渡しのファイル（`work/`）

```
work/
  source.txt  inventory.json  profile.json        波0（親）
  outline.json  style-guide.md  glossary.json     波0（親）。全担当が同じものを読む
  verify-plan.md                                   波0（verify_plan.py）
  verified/<組>.json                               波1（verifier）
  sections/<節>.json                               波2（section-writer）。1人1ファイル
  figures/<番号>.json .svg .png .trace.md          波3（figure-maker）
  backmatter.json cards.json items.json reasons.json index.json   波3（backmatter-builder）
  blocks.json  harmonize-log.md  harmonize-conflicts.md           波4（harmonizer）
  note.docx note.txt body.txt note.pdf checks/     波4（build_and_check.py）
  review/legal.md added-text.md style.md figures.md               波5
```

**同じファイルに2人が書かない。** 担当は自分のファイルだけを書く（競合を避けるため）。

## 4. 親が決めてから立てるもの

担当が同時に書くと、節の間でずれる。ずれを防ぐものを、波0で親が作る。

- **`outline.json`**：節の一覧。節ごとに、見出し・資料の対応箇所（頁・見出し）・型（教科書型／レジュメ型／設例）・**担当表**（この節で説明する語・判例・条文／ほかの節に任せるもの）。**判例は1つの節にだけ割り当てる**（ほかの節は「前述の」と参照だけ）。
- **`style-guide.md`**：体（である／です・ます）、読点（、か，）、言い回しの型（`style_profile.py` と `style-imitation.md` 2〜3）、禁止（翻訳調・説明過剰・資料が使わない語）、ざっくり理解の体。**数値**（1文の長さの平均、`profile.json` の値）を添える。
- **`glossary.json`**：術語の表記の表（`{"term": "譲受人", "avoid": ["譲り受けた者"], "def_source": "資料の頁"}`）。資料の術語は資料の表記。節の担当が見つけた新しい語は、`new_terms` で親に返り、親が足す（次の波の担当には、足した版を渡す）。
- **`verify-plan.md`**：`verify_plan.py` の出力（条文・判例を、法令名つきで1件ずつ並べ、組に分けたもの）。

## 5. 担当に渡す指示

担当は、会話の経緯を知らない。次を指示文に書く（担当の定義に、読むものと出力の形は書いてある）。

- `LABA`（skills/laba の絶対パス）、`work/` の絶対パス、担当する番号（節・図・組）。
- `section-writer`：節の番号、速さ優先かどうか、新しく確認が要る判例・条文の扱い（`needs_verification`）。
- `verifier`：組の番号、`asof`（条文の時点）、コネクタの有無（ツール名は `Laba` などコネクタに付けた名前が前に付く）。
- 点検の担当：**作成の経緯・自己評価は渡さない**（`verification.md` 2）。ノートと資料と見てほしい点だけ。

担当の返事は短い（3行以内、件数と一覧だけ）。本文は `work/` のファイルで読む。

## 6. うまくいかないとき

- 担当が落ちた・途中で止まった：その担当のファイルを読み、途中の成果から、同じ担当を立て直す（確認なしに再開してよい）。ほかの担当の結果は捨てない。
- `needs_verification` が出た：親が `verifier` を追加で立て、その節の `section-writer` に直させる（その節だけ）。
- `harmonize-conflicts.md` に食い違いが出た：親が原典（`work/verified/`）で照らし、どちらが正しいか決めて、該当の節を直す。
- 担当の機能が無い（チャット）：`speed.md` の1人で進める手順に切り替える。担当の指示（`agents/*.md`）は、そのまま自分の手順のチェックリストとして読める。
- トークンの使用量は、担当が増えるぶん増える。軽い依頼（`speed.md` 4）では、担当を立てず、1人で進めてよい。
