# コネクタ

LABA はコネクタがなくても動く（判例・条文は裁判所サイトと e-Gov をウェブ検索・取得で確かめる）。次のコネクタがあると、確認の手作業がツールの呼び出しに置き換わる。

| コネクタ | 用途 | 状態 | つなぎ方 |
|---|---|---|---|
| laba-jp-connector（自作・Supabase） | 条文の取得と時点指定（e-Gov 法令API v2）、判例の書誌照合・引用の一字一句照合（裁判所 裁判例検索）、国会会議録、NDL サーチ・CiNii の書誌 | **稼働中**（2026-11-13 に13ツールを実際に呼び出して確認） | 完成後、Claude の「設定 > コネクタ > カスタムコネクタを追加」に、秘密の経路つき URL を「サインインなし」で登録する。URL はこのプラグインに入れない（漏れたら使われるため） |
| Google ドライブ | 講義資料・教科書の PDF を読む、できたノートを置く | 任意 | コネクタの一覧から追加 |

## gnoto-lite（GNOTO ノート）とコネクタ

gnoto-lite の法律モードは、上の laba-jp-connector を**各自が自分の設定に登録して**使う。プラグインに URL・鍵は入っていないし、入れない。スクリプトはネットワークに接続せず、コネクタの返答（Claude が JSON に保存したもの）を普通のブロックと出典に整形するだけ。

| 依頼 | 呼ぶツール | 注意 |
|---|---|---|
| 条文を入れる | `law_resolve_citation` → `law_get_article` | `ambiguous`・`unresolved` は利用者に聞く（または法令名を明示して再呼び出し）。2017-04-01 以降の版だけ |
| 判例を入れる | `case_search_by_date` → `case_get`（照合は `case_verify_citation`） | 最高裁で裁判所サイトに載るものだけ。大審院・下級審は `not_covered` |
| 判旨の「」引用 | `case_quote_check`（判旨は `scope: "fulltext"`） | 要旨で一致しただけなら判決の文ではない |
| 立法趣旨・文献 | `diet_search_speeches`・`biblio_search` | 発言・書誌だけ |

コネクタが無い人は、e-Gov・裁判所サイトの頁をウェブ取得で読み、読めたものだけを出典つきで書く（読めなければ【未確認】）。「全部の条文・全部の判例」とは書かない。

## laba-jp-connector がつながったときの使い分け

| 確かめること | 先に使うツール | ツールが使えないとき |
|---|---|---|
| 条文の文言（現行・ある時点） | `law_resolve_citation` → `law_get_article`（`asof`） | e-Gov の頁を取得 |
| 判例の書誌（民集○巻○号○頁） | `case_verify_citation` | 裁判所サイトの日付検索 → 詳細頁 |
| 判旨の「」引用 | `case_quote_check`（判決の文として引くなら `scope: "fulltext"`。`normalized` なら原文の表記で引く） | 判決全文 PDF を読んで照合 |
| 立法趣旨・改正の経緯 | `diet_search_speeches` | 国会会議録検索システム |
| 文献の実在・書誌 | `biblio_search` | NDL サーチ・CiNii を検索 |

詳しい使い分けと、確かめた振る舞い（引用の照合が要旨で止まる件、条文の表記の受け継ぎ）は `skills/laba/references/connector.md`。

`not_covered`・`no_match` は「実在しない」という意味ではない。ノートには「このコネクタでは確認できない（未確認）」と書く。
