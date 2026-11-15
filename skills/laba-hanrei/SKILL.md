---
name: laba-hanrei
description: 判例研究・判例評釈・ゼミ報告のレジュメ（Word）と引用台帳を作る。「この判決で判例研究を」「判例評釈を書いて」「ゼミ報告のレジュメを」「判旨と射程を整理して」と頼まれたときに使う。発表スライドまで要るときは laba-slides と組み合わせる。
---

# LABA 判例研究モジュール

## 公式版（道具なし）での進め方

**最初に** `${CLAUDE_PLUGIN_ROOT}/skills/laba/scripts/hanrei/ledger.py` があるかを確かめる。あれば（フル版）この節は飛ばす。**無ければ（公式版）**、下の `python3 …` は実行せず、次のとおりにする。

1. 13 段階（`references/hanrei/README.md`）はそのまま。ゼミ名・報告者名・指導教員名・年度・発表日の見本ファイル（`config.example.json`）は入っていないので、最初の確認で利用者に聞く。空欄は表紙に仮の文字（（所属・演習名）（報告者）（発表日））を入れ、渡すときに知らせる。
2. **引用台帳**：1 文献 1 行の表（Markdown の表、またはタブ区切りのテキスト）を自分で作る。列は「ID・書誌・確認に使った資料・格付け（A＝原文を自分で読んだ／B＝二次資料の要約で知った／C＝書誌だけ確かめた／X＝記憶だけ。書かない）・使い方（頁・【中心】【一次】【二次】【指導教員】【要入手】）」（`references/hanrei/02-citation-grade.md`）。
3. **台帳の検査（`ledger.py` の代わり）**：仕上げの前に、本文と台帳を見比べて次を 1 つずつ確かめる。X の文献を本文で使っていないか／A でない文献の近くに「」の引用（20 字以上）がないか／A でない文献に頁を付けていないか／【指導教員】の文献が A か／C の文献を本文で使わず参考文献だけにしているか／B の文献を使う段落に「（〜の整理による）」があるか／本文の ID がすべて台帳にあるか／同じ ID に別の頁が付いていないか／【要入手】が残っていれば報告の冒頭に書くか／【要確認】などの作業の印が本文に残っていないか。機械では確かめていないと報告に書く。
4. **レジュメ（Word）**：環境に python-docx があれば、その場で短いコードを書いて作る。体裁と文体は `references/hanrei/08-style.md`、構成は `03-structure.md`。python-docx が無く、入れられないときは Markdown で渡す。
5. **スライド**：レジュメの見出しと 1 対 1 の対応表を自分で作り（`resume_to_deck.py`・`sync_check.py` の代わり）、`skills/laba-slides/SKILL.md` の手作業の道で作る。
6. 書く前に `references/hanrei/failure-catalog.md`、渡す前に `10-checklist.md` と `references/verification.md` の独立点検（立てられないときは「自己点検」と書く）。

判例研究は LABA 本体の一部として作る。この入口は、判例研究の依頼で LABA の該当部分を直接開くためのもの。

1. 最初に `${CLAUDE_PLUGIN_ROOT}/skills/laba/references/hanrei/README.md` を読み、13段階（聞く→調査→台帳→構成→事実→審級→学説→考察→文体→Word→スライド→点検→渡す）に従う。利用者への確認は最初に1回だけまとめて行う。ゼミ名・演習名・報告者名・指導教員名・年度・発表日は、スキルの中に決め打ちせず、利用者に聞くか `config.json`（`${CLAUDE_PLUGIN_ROOT}/skills/laba/scripts/hanrei/samples/config.example.json` が見本。探す順は README の「利用者ごとの値」）から読む。空欄は仮の文字で作り、渡すときに知らせる。
2. 判例の書誌・判旨は `${CLAUDE_PLUGIN_ROOT}/skills/laba/references/case-verification.md` の手順で、裁判所サイトの詳細頁と判決全文で確かめる。「」で引く文は判決文と一字一句一致するときだけ。日本法コネクタ（laba-jp-connector）がつながっていれば、`case_verify_citation`・`case_quote_check` を先に使う（CONNECTORS.md）。
3. 引用は `${CLAUDE_PLUGIN_ROOT}/skills/laba/references/hanrei/02-citation-grade.md` の格付けで台帳に記録し、`python3 ${CLAUDE_PLUGIN_ROOT}/skills/laba/scripts/hanrei/ledger.py` で検査する。読んでいない文献を「」つきで引かない。
4. レジュメは `python3 ${CLAUDE_PLUGIN_ROOT}/skills/laba/scripts/hanrei/resume_build.py` で作る。スライドも作るなら `resume_to_deck.py` で下書きし、`sync_check.py` でレジュメと照合する。
5. 書く前に `${CLAUDE_PLUGIN_ROOT}/skills/laba/references/hanrei/failure-catalog.md` を読み、渡す前に `${CLAUDE_PLUGIN_ROOT}/skills/laba/references/hanrei/10-checklist.md` で確かめる。独立点検（`${CLAUDE_PLUGIN_ROOT}/skills/laba/references/verification.md`）は省かない。

6. 「検討」（判旨に賛成か反対か、射程はどこまでか）は、合議（`${CLAUDE_PLUGIN_ROOT}/skills/laba/references/gogi.md`）を材料にできる：立場の違う5人の意見から、多数意見を報告者の採る立場の候補に、反対意見を想定される批判に使う。報告者の結論は利用者が決める。合議の意見を、学説・判例として引用しない。

学術レポート・小論文など判例研究でない文章は reportkiller（`${CLAUDE_PLUGIN_ROOT}/skills/reportkiller/SKILL.md`）の仕事で、ここでは扱わない。

共通の規則（足した説明、条文の確認、渡し方、独立採点と自己採点を混ぜないこと）は `${CLAUDE_PLUGIN_ROOT}/skills/laba/SKILL.md` に従う。
