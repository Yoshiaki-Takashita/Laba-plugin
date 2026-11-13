# evals（試験）

スキルを直したときに、直しが効いたか・壊していないかを確かめるための問いと資料。

| ファイル | 中身 |
|---|---|
| `evals.json` | 試験の問い10本。1〜6＝講義ノート（教科書型2・レジュメ型2・設例中心型2）、7〜10＝判例研究のレジュメ、発表スライド、ノートから起こすスライド、スライドの点検 |
| `bench/` | 速さの測定（`bench.py`）と、同時に走らせた結果が順のときと同じことの試験（`test_parallel.py`）。自作の架空の資料（`source.txt`）とノート（`blocks.json`）つき。内容の評価には使わない |
| `materials/` | 自作の試験用資料5本（架空の講義資料3、架空の判決と解説1、わざと崩したスライドの構成1）と、合格条件2本（`expected.md`、`expected_hanrei_slides.md`）。実在の授業・書籍の文章は含まない |

図だけを試すときは、`scripts/figgen/specs/` の用例43本が回帰の確認になる（全部を生成→`fig_lint.py`→目で見る）。検査プログラムの回帰は、`scripts/sample_blocks.json`・`sample_cards.json` と `materials/` の資料で `pipeline.py` を通す。

試験 7〜10 は、問いと合格条件を書いただけで、まだ通しで走らせていない（8〜10 の「機械検査で出るはずの値」は、見本と `deck-E-bad.json` に道具を掛けて確かめた値）。スライドの道具そのものの回帰は、`scripts/slides/tests/`（`node tests/textfit_test.js`、`python3 tests/lint_regress.py`）で確かめる。巻末の表（短答式の命題・理由の出所表）と新しい検査は、`materials/expected.md` の合格条件にはまだ反映していない。
