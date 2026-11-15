# scripts/hanrei：判例研究レジュメを作る道具

| ファイル | 役目 |
|---|---|
| `resume_build.py` | 構成（JSON）から判例研究レジュメ（.docx）を作る。既定の体裁は判例研究用（`--style hanrei`：格子の表、左罫線の引用段落、参考文献 8pt、節 13.5pt・小見出し 11pt、字下げなし、章ごとに改頁）。講義ノートと同じ体裁にするなら `--style note`。仮の文字が残っていると止まる（`--draft` で続行） |
| `ledger.py` | 引用台帳の検査（格付けのない引用、読んでいない文献への「」・頁、指導教員の未読文献、台帳にない ID、作業の印の消し忘れ） |
| `resume_to_deck.py` | レジュメの構成（JSON）から、発表スライドの構成の下書きを作る。章・節の番号をそのまま見出しに写し、節ごとに型を当てはめる（相関図・当事者・時系列・争点・各審級・学説・考察）。直す所に `_todo` を付ける |
| `sync_check.py` | レジュメとスライドの構成を照らす。18項目（見出しの番号と題、小見出しの抜け・飛び、大項目名、当事者の記号と立場、時系列の段の数、スライドにだけある日付・金額・条文・判例・文、限定の言い方の落ち） |
| `sokan_png.py` | スライドの相関図（型 sokan）の構成から、レジュメに貼る図（PNG）を作る（figgen の当事者関係図で描く）。親族と取引の囲みを分け、争点の関係の線だけを強調色にする。出力をレジュメの `facts.figure.path` に書く。例：`python3 sokan_png.py ../slides/specs/hanrei_sample.json samples/sokan_sample.png` |
| `kit_measure.py` | 利用者の完成版（.docx・.pptx・スクリプト）を測り、体裁を合わせる値（`kit_profile.json`）と、LABA の既定との違いを出す。`resume_build.py --kit`、`build_deck.js --kit` に渡す |
| `samples/resume_sample.json` | 見本：架空の事件のレジュメの構成（スライドの見本と番号が1対1） |
| `samples/ledger_sample.tsv` | 見本：引用台帳 |
| `samples/config.example.json` | 利用者ごとの値（年度・所属・報告者・発表日・注・章の改頁）の見本。既定は空欄 |

## 使い方

```
pip install python-docx python-pptx

# 1 下書き（台帳の ID〔R01〕を残したまま）
python3 resume_build.py samples/resume_sample.json draft.docx --text-out draft.txt

# 2 台帳の検査（error があれば終了コード 1）
python3 ledger.py draft.txt --ledger samples/ledger_sample.tsv

# 3 仕上げ（ID を外す）
python3 resume_build.py samples/resume_sample.json resume.docx --strip-ids --config config.json
```

構成の項目は `resume_build.py` の冒頭の説明と `references/hanrei/03-structure.md`。体裁の数値は `references/hanrei/08-style.md` の6。2回目以降の直しは、作り直さずに文書を直接編集する（`references/hanrei/09-revision.md`）。

ブロックは `build_docx.py` のもの（P・P2・T・SS・C・B・F など）に加えて、`["Q","…"]`（条文・判旨の引用。左に罫線）、`["QS","出典"]`、`["G","…"]`（専門用語の注。小さい灰色の字）が使える。

config.json を探す順：`--config` → 構成と同じフォルダの `config.json` → 環境変数 `LABA_CONFIG` → `~/.config/laba/hanrei.json`。

## スライドへ

```
# 4 スライドの下書き（レジュメの番号を見出しに写す）
python3 resume_to_deck.py samples/resume_sample.json deck_draft.json

# 5 _todo を片づけたら、レジュメと照らす（error があれば終了コード 1）
python3 sync_check.py samples/resume_sample.json ../slides/specs/hanrei_sample.json

# 6 作って検査する（_todo・仮の文字が残っていると止まる。途中の出来を見るだけなら両方に --draft）
node ../slides/build_deck.js ../slides/specs/hanrei_sample.json deck.pptx --outline outline.md
python3 ../slides/deck_lint.py deck.pptx
```

スライドの見出しは、レジュメの節の番号と題に揃える（「3. 事実の概要　(2) 時系列①」「6. 上告審【上告棄却】」）。小見出し（(1)(2)(3)）の枚を飛ばさない。レジュメを直して節が増減したら、スライドの番号も直し、`sync_check.py` を掛け直す。見本の `samples/resume_sample.json` と `../slides/specs/hanrei_sample.json` は同じ架空の事件で、1対1に対応している（error 0、warn 0）。

`sync_check.py` が照らすのは、構成の JSON どうしである。出来た .docx や .pptx を直接直したときは、JSON にも同じ直しを入れてから掛ける。`resume_build.py` を読み込むので、python-docx が要る。content-not-in-resume と hedge-dropped は、文字の2字組の重なりで調べる近似である。出たものは1件ずつ見る。出なくても、考察・射程・結論の枚は目でレジュメと照らす。

## キット（利用者の完成版）に合わせる

```
python3 kit_measure.py キットのフォルダ --out kit_profile.json     # 測る。違いの一覧が出る
python3 resume_build.py 構成.json resume.docx --kit kit_profile.json --strip-ids
node ../slides/build_deck.js スライドの構成.json deck.pptx --kit kit_profile.json
```

手順は `references/hanrei/README.md` の「キットの再利用」。測るのは寸法だけで、本文・氏名は取り出さない。スクリプトは関数名を一覧にするだけで、実行しない。
