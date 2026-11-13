# laba-jp-connector での確認（コネクタがつながっているとき）

条文・判例・会議録・文献の確認は、コネクタがあればツールを先に使い、無ければ `statute-verification.md`・`case-verification.md` の手作業（ウェブ検索・取得）で行う。ツールの名前は、Claude の画面では `Laba` などコネクタに付けた名前が前に付く（例 `mcp__Laba__law_get_article`）。つながっているかは、ツール一覧に `law_get_article` があるかで見る。`health` で各情報源の状態が分かる。

ここに書いた振る舞いは、2026-11-13 に実際に呼び出して確かめたもの。

## 1. 使い分け

| 確かめること | 使うツール | 確かめた振る舞い・注意 |
|---|---|---|
| 条文の表記→法令 | `law_resolve_citation`（`default_law`） | 略称の辞書で読む（民訴・行手法・国賠など）。**法令名の無い条（「177条」）は、直前の表記の法令を受け継ぐ。`default_law` より前の表記が優先される**。並べて渡すときは、法令名を省かない（下の4） |
| 条文の文言 | `law_get_article`（`paragraph`・`item`・`asof`） | 原文のまま返る。見出し（`caption`）、版（`revision`）、施行日つき。`asof` の日に無い条は `no_match`（例：民法587条の2は2019-01-01の版に無い。2017年改正で入り2020-04-01施行）。`asof` が2017-04-01より前、附則・別表は対象外 |
| 改正の経緯 | `law_revision_history` | 版の ID・改正法令・公布日・施行日。差分は返さない |
| 判例の書誌 | `case_verify_citation` | 項目ごとに `match`／`mismatch`。巻号頁が合わなければ `no_match` と**同じ日の候補とその巻号頁**が返る（誤記を直せる）。最高裁で裁判所サイト掲載のものだけ |
| 判例の要旨・主文の結果 | `case_get` | 判示事項・裁判要旨・参照法条・原審・結果（棄却など）・PDF の URL |
| 判決の理由・主文 | `case_get_fulltext`（`find`・`pages`） | PDF のテキスト。`find` で語の前後の段落だけ |
| 「」の引用 | `case_quote_check` | 下の3 |
| 立法趣旨 | `diet_search_speeches` | 抜粋と会議録の URL。全文は URL で読む |
| 文献の実在・書誌 | `biblio_search` | NDL サーチ。CiNii は鍵が無く使っていない（`sources_skipped` に理由） |
| 表記の抜き出し | `citation_parse` | 上流に問い合わせない。実在は確かめない |

## 2. 状態の読み方

| status | ノートでの扱い |
|---|---|
| `found` | 使う。根拠として `provenance.source_urls` の頁を点検の記録に残す |
| `multiple` | 事件名・登載誌で一つに絞る。絞れなければ候補を利用者に示す |
| `no_match` | 入力（日付・巻号頁・条番号・時点）の誤りをまず疑う。直して引き直す。**「存在しない」と書かない** |
| `not_covered` | 「このコネクタでは確認できない」。手作業の確認に回すか「未確認」と書く |
| `upstream_error` | 時間をおく。結果を推測しない。続けば手作業に切り替える |

## 3. 引用（「」）の照合は「どこで一致したか」まで見る

`case_quote_check` は、裁判要旨・判示事項で一致すると全文を見ずに `exact` を返す（`where.part: "summary"`）。**裁判要旨は裁判所が編集した文で、判決の文ではない。** 実例：最判昭43・3・8（民集22巻3号551頁）の要旨は「訴の主観的予備的併合は不適法である」、判決の文は「訴の主観的予備的併合は不適法であつて許されないとする原審の判断は正当であり」。

- 判旨（判決の文）として「」で引くときは、`scope: "fulltext"` で照合する。`where.part` が `fulltext` であることを確かめる。
- 要旨を引くなら「裁判要旨は」と書き分ける。
- `normalized` のときは `matched_text`（原文の表記。「あつて」など旧かなのまま）で引く。
- `not_found` のとき、`nearest` は最も近い箇所であって一致ではない。「」を外して地の文で書くか、原文に合わせて直す。

## 4. 条文の表記の渡し方

`law_resolve_citation` に「国賠1条1項、177条」と渡すと、177条は国家賠償法として読まれた（`default_law: "民法"` を付けていても）。返り値の `law_title` を必ず見る。

- 一つの表記ごとに法令名を付けて渡す（「民法177条」）。
- 返った `confidence` が `dict` でも、法令の取り違えは起こりうる。`law_title` と条番号を目で見る。
- 表記の解決は「その条があるか」を確かめていない。文言は `law_get_article` で取る。

## 5. 点検の記録

独立点検（`verification.md`）では、条文と判例ごとに、使ったツール、status、`source_urls` の1件、取得日時を表にする。コネクタで確かめたものと、手作業で確かめたもの、未確認のものを分ける。

## 6. コネクタが使えないとき

ツールが無い、`upstream_error` が続く、`not_covered` だった、のどれかなら、従来の手順に戻る（`statute-verification.md` 2・4節、`case-verification.md` 2節）。コネクタの結果を推測で補わない。

## 7. まとめて呼ぶ（速くするため）

条文・判例・文献を1件ずつ呼んで待つと、件数だけ往復が増える。**結果に頼らない呼び出しは、同じ回に全部出す**。

1. 先に `scripts/verify_plan.py --statute work/statute.json --inventory work/inventory.json` で、条文を法令名つきの表記で1件ずつ、判例を1件ずつ並べた表を作る（4の取り違えを防ぐため、法令名は省かない）。
2. 1回目：条文ごとの `law_get_article`、判例ごとの `case_verify_citation`、文献ごとの `biblio_search` を、同じ回に全部。
3. 2回目：1回目で `found` だった判例の `case_get`、理由を書く判例の `case_get_fulltext`（`find`）、「」で引く箇所の `case_quote_check`（`scope: "fulltext"`）を、同じ回に全部。
4. 3回目：`no_match`・`multiple`・`upstream_error` だけ、入力を直して引き直す。

コネクタは、同じ上流への呼び出しを自分で順番に処理する。まとめて出すと待つ時間は短くなるが、結果は1件ずつ呼んだときと同じ（各結果の `status`・`provenance` は、1件ずつ見る）。1回に出す数は20件前後を目安にし、`upstream_error` が増えたら半分にして引き直す。同時数の上限は不明。
