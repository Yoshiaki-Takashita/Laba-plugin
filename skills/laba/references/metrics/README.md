# 指標ごとの文書（16本）

採点の16指標（独自12＋基本4）について、1指標1ファイルで「何を測るか・どこで点を落としたか・9.5 に届く条件・手順・検査・良い例と悪い例」をまとめる。点の算式と判定の規則は `../scoring.md`、検査の結果から次に直す点を決める表は `../algorithms/next-fix.md`。

## 一覧

| № | 指標 | ファイル | 主に測るもの | 検査（scripts/） | 点を付けるのは |
|---|---|---|---|---|---|
| ① | 条文の正確さ | `01-statute.md` | 条番号・限定の語・名宛人 | statute_check、yoken_table | 点検者 |
| ② | 判例書誌の正確さ | `02-case-cite.md` | 裁判所・年月日・登載誌・巻号頁 | cite_check、coverage_check、case_lookup | 機械＋点検者 |
| ③ | 判例理由の忠実度 | `03-reason-fidelity.md` | 判決の理由と資料の説明の区別 | reason_table、reason_source_check、case_lookup | 点検者（出所表が補助） |
| ④ | 確度の保存率 | `04-certainty.md` | 留保の語が保たれているか | certainty_check | 機械（点検者が補正） |
| ⑤ | 定義の精度 | `05-definition.md` | 定義文の過不足・限定語 | inventory（定義の一覧）、match_check | 点検者 |
| ⑥ | 論証密度 | `06-argument-density.md` | 理由つきの命題の割合 | argument_check、density | 機械 |
| ⑦ | 具体例密度 | `07-example-density.md` | 規範に事例が付いている割合 | density、argument_check | 機械 |
| ⑧ | 難所の可視化率 | `08-hard-spots.md` | 難所に図・表・ざっくり理解があるか | （作成者の一覧）、fig_lint | 作成者の一覧＋点検者 |
| ⑨ | 体系連関 | `09-system-links.md` | 相互参照・対比・索引 | xref_index、density | 機械 |
| ⑩ | 独自性（非転写） | `10-originality.md` | 地の文が自分の言葉か | match_check、word_swap_check | 機械 |
| ⑪ | 情報効率 | `11-info-efficiency.md` | 重複・分量・言い直し | info_efficiency、summary_dup_check、density | 機械 |
| ⑫ | 答案転用性 | `12-exam-use.md` | 論点カード・短答の命題・要件の形 | card_build、tf_items、yoken_table | 点検者（機械が形を補助） |
| ⑬ | 網羅率 | `13-coverage.md` | 資料の知識の単位がノートにあるか | inventory、coverage_check | 点検者（機械は上限の目安） |
| ⑭ | 説明技法 | `14-technique.md` | 技法12項目 | argument_check、xref_index ほか | 点検者 |
| ⑮ | 誤り | `15-errors.md` | 重大・中・軽微の件数 | 全検査（形だけ） | 点検者 |
| ⑯ | 文体 | `16-style.md` | 同じ書き手に見えるか | style_profile、style_check、word_swap_check | 点検者＋機械 |

## 各ファイルの形

1. 定義と測り方（機械と点検者の分担、点の換算）
2. 減点された実例の型（これまでの採点で実際に点を落とした形。箇所を特定できるように書く）
3. 9.5 に届く条件（検査できる形。機械で分かるものは `score.py` が「未達」として出す）
4. 手順（書くとき・直すとき）
5. 検査（コマンドと、出力のどこを見るか）
6. 良い例・悪い例（例文はこのスキルのために書いたもので、特定の書籍の文ではない）

## 読み方

- 「9.5 に届く条件」は、機械の値が条件を満たすことと、点検者がその指標に9.5以上を付けることの両方を言う。機械の条件を満たしても、点検者が付ける指標（①③⑤⑧⑫⑬⑭⑮）は、点検を受けるまで「未採点」のままである。
- 機械の値を上げることを目的にしない。各ファイルの「してはいけない上げ方」を先に読む。
- 作成者が自分で付けた点は、どの指標でも使わない。報告に書けるのは、機械の値と、点検者の採点だけである。
