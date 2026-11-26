# 本の状態 `book.json` と、続きの章の作り方（1 回の呼び出しで 1 章）

「生み出し続ける」は、1 回の会話で本を全部作ることではなく、**状態を持って 1 章ずつ足す**こと。1 回で全部を作ると、文脈が溢れて点検が回らない。

## 1. 形

```json
{"v": 1,
 "topic": {"seed": "<単語や分野>", "kind": "word", "level": "ug", "lang": "ja"},
 "map": null,
 "chapters": [
  {"no": 1, "title": "…", "status": "done", "outline": "ch1/outline.json", "text": "ch1/chapter.md",
   "summary": ["要点 1", "要点 2", "要点 3"]}
 ],
 "glossary": "glossary.json",
 "ledger": "ledger.tsv",
 "next": {"chapter": 2, "why": "前の章の続き"}}
```
- `status`：`planned`・`writing`・`done`。`done` の章には `summary`（3〜5 項目）が要る（`book_state.py check` が見る）。
- `map`：概念の地図（L2 で足す予定。今は `null` か、範囲の一覧のファイル）。
- `glossary.json`：`{"用語": {"ch": 1, "sec": "s2", "def": "1 文の定義"}}`。章をまたいで表記と定義の場所をそろえる。
- `ledger.tsv`：出典の台帳（reportkiller `citation-ledger.md` の形）。紙面には出さない。

## 2. 続きの回の読み方（トークンを抑える）

1. `book_state.py next work/book.json` の出力（次の章・済んだ章の題と要点）だけを読む。
2. 術語表と台帳は、その章で使う語・出典の行だけを引く。
3. **前の章の本文（`chapter.md`）は読み直さない**。重複の確認が要るときは、見出しと用語の一覧だけを見る。
4. 新しい章の `outline.json` で、前の章で定義した用語を `terms` に入れない（`glossary.json` を見る）。前の章の用語は「第 n 章で見た〜」と参照する。

## 3. 回の終わりにすること

`book_state.py chapter work/book.json --no <n> --status done --title "<題>" --summary "a;b;c" --outline ch<n>/outline.json --text ch<n>/chapter.md`。`next` が次の章に進む。章立てを先に作った（`size: book`）ときは、各章を `--status planned` で先に登録しておく。
