# BUILD_NOTES

- 版 1.0.1（2026-11-13）。本体 skills/laba は単体スキル laba と同じ中身（作業用の _integration、node_modules、__pycache__ は除いた）。
- 入口スキル4本（laba-hanrei／laba-slides／laba-figures／laba-score）は、本体の文書と道具を `${CLAUDE_PLUGIN_ROOT}/skills/laba/` で指すだけで、規則を複製していない。直すときは本体だけを直す。
- `.mcp.json` は置いていない。日本法コネクタの URL は秘密の経路を含むので、プラグインに入れず、Claude のカスタムコネクタとして各自で登録する（CONNECTORS.md）。
- スコアボードの数値は、講義ノートが独立採点（ノート v5）、図とスライドが独立採点 第4回（どちらも Opus の採点者）。図の照合とスライドの検査が新しい種類の誤りを半分ほどしか止めないことは、本体の文書（figures/06-traceability.md、slides/README.md）に書いてある。
- 残っている改善点：trace.py の検出できない種類（要件と効果、範囲の枠、小枝の帰属、時間軸）、右向き流れ図の小枝、スライド検査の見落とし（大項目名・図形の重なり・ピクト）、非表示スライドでの頁ずれ。
- 版 1.2.0（2026-11-13）：skills/gnoto-lite を足した（GNOTO のノート .gnoto をノーマルとスライドだけ作る・直す・見る。法律モードはコネクタの呼び出し手順を SKILL.md に書き、scripts は法律の知識を持たない整形器）。このフォルダだけ別ライセンス（草案、所有者の確認待ち）。laba 本体は、出力先を GNOTO にできる旨を「いつ、何を作るか」の表と references/delivery.md に1か所ずつ足しただけ（単体スキル laba との差分はこの2か所）。CONNECTORS.md に gnoto-lite の節を足した。試験は skills/gnoto-lite/tests（unittest、47件）。
- 保護の設計：公開プラグインは読める形で出す必要があり、技術的に複製は防げない。法律の知識（条文・略称・判例の表・引用の解析）はスクリプトに入れず、コネクタ側に置く。そのうえで LICENSE で Claude の外での再利用を禁じる。
- ファイル数の上限は512（gnoto-lite 追加後は467前後）。
- 版 1.1.1（2026-11-13）：LICENSE（MIT）を置いた。アイコンを一番上の icon.png に移し、plugin.json に icon と license を足した。README に英語の説明（実行するもの・取りに行くものを含む）を足した。
- 版 1.3.0（2026-11-13）：チャットで LABA が遅い問題への対応（速く進める）。①条文・判例・文献の確認を「まとめて呼ぶ」手順（references/speed.md、connector.md 7、statute-verification.md・case-verification.md、scripts/verify_plan.py）。②スクリプトの同時実行：pipeline.py（独立な検査を同時に。`--jobs`・`--timing`。結果は順に走らせたときと同じ）、run_checks.sh、figgen/cli.js（`batch`・`all`。PNG を同時に）、fig_build.js、新しい build_and_check.py（docx・PDF 化・検査を1回で）。③「速さ優先」（軽い依頼で縮める段階と、省かないもの）と、⑨〜⑪の既定の上限2回（SKILL.md、speed.md、workflow.md）。④agents/ に9つの担当（確認・節の執筆・図・巻末・統一・法的点検・足した文の点検・文体の点検・図の点検）と、SKILL.md の「担当に分けて進める」、references/orchestration.md。agents/ は Cowork と Claude Code だけで読み込まれる（claude.ai のチャットでは、プラグインの agents/ と hooks は読み込まれない。公式の文書で確かめた事実）。⑤測定：skills/laba/evals/bench/（bench.py、test_parallel.py、自作の架空の資料）。実測は speed.md の7.1、Claude 側の往復の減り方は見込み（7.2）。
- 1.3.0 の試験：figgen/tests/run_tests.py 129/129、gnoto-lite 47/47、evals/bench/test_parallel.py 6/6、`claude plugin validate .` 通過。走らせなかったもの：実際のコネクタを使った確認の通し、担当（agents/）を実際に立てた通し、実在の長いノートでの時間（不明）。slides/tests/lint_regress.py は、変更前から1件失敗する（非表示の枚で render-break。この版の変更とは無関係。原因は未調査）。
- 1.3.0 の点検で直したもの：①build_and_check.py が前の回の note.pdf を消さずに検査を始め、頁数の検査が古い PDF を読むことがあった→先に消す。PDF 化に失敗したときに頁数の検査が300秒待ち続けた→失敗の印（note.pdf.failed）を見たら待たない（試験を1本追加、test_parallel.py 7/7）。②「まとめて呼ぶ」の件数を、日本法コネクタの作りに合わせて下げた（1分30回の上限、裁判所へは2秒に1回・1回の呼び出しは45秒で打ち切り）：1回に全部で15件まで、うち判例は5件まで。確認の担当は同時に1人。verify_plan.py の既定も15件・判例5件に。往復の見込みは約25回→約30回。③点検の担当4つ（読むだけ）に、ファイルを書く指示が残っていた→返事を親が work/review/ に保存する形に。文体以外の点検の担当から Bash を外した。④「急ぎ」と言われただけで重い依頼まで速さ優先になる書き方（SKILL.md・README）を、speed.md 4 と同じ「軽い依頼のときだけ」に。⑤run_checks.sh の資料なしの文体の出力を、元と同じ末尾8行に戻した。
- 食い違い（記録のみ、直していない）：scripts/README.md・evals/README.md・SKILL.md は図の用例を「43本」と書くが、figgen/specs には45本ある。
- 版 1.3.1（2026-11-13）：チャットで「点検してから渡します」と言って返事を終え、固まる件への対策。laba と gnoto-lite の手順に「返事を終える前に必ず渡す。点検は同じ返事の中で」を足した。
