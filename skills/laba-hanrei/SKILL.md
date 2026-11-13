---
name: laba-hanrei
description: 判例研究・判例評釈・ゼミ報告のレジュメ（Word）と引用台帳を作る。「この判決で判例研究を」「判例評釈を書いて」「ゼミ報告のレジュメを」「判旨と射程を整理して」と頼まれたときに使う。発表スライドまで要るときは laba-slides と組み合わせる。
---

# LABA 判例研究モジュール

判例研究は LABA 本体の一部として作る。この入口は、判例研究の依頼で LABA の該当部分を直接開くためのもの。

1. 最初に `${CLAUDE_PLUGIN_ROOT}/skills/laba/references/hanrei/README.md` を読み、13段階（聞く→調査→台帳→構成→事実→審級→学説→考察→文体→Word→スライド→点検→渡す）に従う。利用者への確認は最初に1回だけまとめて行う。
2. 判例の書誌・判旨は `${CLAUDE_PLUGIN_ROOT}/skills/laba/references/case-verification.md` の手順で、裁判所サイトの詳細頁と判決全文で確かめる。「」で引く文は判決文と一字一句一致するときだけ。日本法コネクタ（laba-jp-connector）がつながっていれば、`case_verify_citation`・`case_quote_check` を先に使う（CONNECTORS.md）。
3. 引用は `${CLAUDE_PLUGIN_ROOT}/skills/laba/references/hanrei/02-citation-grade.md` の格付けで台帳に記録し、`python3 ${CLAUDE_PLUGIN_ROOT}/skills/laba/scripts/hanrei/ledger.py` で検査する。読んでいない文献を「」つきで引かない。
4. レジュメは `python3 ${CLAUDE_PLUGIN_ROOT}/skills/laba/scripts/hanrei/resume_build.py` で作る。スライドも作るなら `resume_to_deck.py` で下書きし、`sync_check.py` でレジュメと照合する。
5. 書く前に `${CLAUDE_PLUGIN_ROOT}/skills/laba/references/hanrei/failure-catalog.md` を読み、渡す前に `${CLAUDE_PLUGIN_ROOT}/skills/laba/references/hanrei/10-checklist.md` で確かめる。独立点検（`${CLAUDE_PLUGIN_ROOT}/skills/laba/references/verification.md`）は省かない。

共通の規則（足した説明、条文の確認、渡し方、独立採点と自己採点を混ぜないこと）は `${CLAUDE_PLUGIN_ROOT}/skills/laba/SKILL.md` に従う。
