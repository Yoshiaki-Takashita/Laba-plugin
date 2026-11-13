#!/usr/bin/env bash
# 一連の機械検査をまとめて走らせる（簡易版。基本の検査だけ）。
# 論証の型・情報効率・相互参照・定義・理由の出所表・短答式の命題・論点カード・次に直す点、
# 図（fig_lint・figgen/trace）、スライド（slides/deck_lint）、判例研究（hanrei/ledger・sync_check）まで回すのは pipeline.py。
# usage: run_checks.sh NOTE.txt BODY.txt OUTDIR [SOURCE.txt] [REVIEWER.json]
#   NOTE.txt  ：ノートの全文（表・図題・ざっくり理解を含む）
#   BODY.txt  ：本文だけ（build_docx.py --body-out で出したもの）。文体と一致の検査はこちらに掛ける
#   SOURCE.txt：資料の書き起こし（あれば）。無ければ資料と比べる検査は飛ばす
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
if [ $# -lt 3 ]; then echo "usage: run_checks.sh NOTE.txt BODY.txt OUTDIR [SOURCE.txt] [REVIEWER.json]" >&2; exit 2; fi
NOTE="$1"; BODY="$2"; OUT="$3"; SRC="${4:-}"; REV="${5:-}"
mkdir -p "$OUT"
# 互いに独立な検査は同時に走らせ、出力は元の順に並べて出す（結果のファイルは順に走らせたときと同じ）。
# 依存：style_check は profile.json、coverage_check と cite_check（資料あり）は inventory.json を読むので、その作成と同じ並びに置く。
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
g() { local n="$1"; shift; ( "$@" ) >"$TMP/$n.log" 2>&1 & }          # g 名前 コマンド… ：背景で走らせる
show() { for n in "$@"; do cat "$TMP/$n.log" 2>/dev/null; done; }
if [ -n "$SRC" ]; then
  g style bash -c 'python3 "$0/style_profile.py" "$1" --out "$2/profile.json" && python3 "$0/style_check.py" "$3" --profile "$2/profile.json" --out "$2/style.json" | tail -n 8' "$HERE" "$SRC" "$OUT" "$BODY"
  g cover bash -c 'python3 "$0/inventory.py" "$1" --out "$2/inventory.json" --md "$2/inventory.md" && python3 "$0/coverage_check.py" "$2/inventory.json" "$3" --out "$2/coverage.json" && python3 "$0/cite_check.py" "$3" --inventory "$2/inventory.json" --out "$2/cite.json"' "$HERE" "$SRC" "$OUT" "$NOTE"
  g match python3 "$HERE/match_check.py" "$SRC" "$BODY" --out "$OUT/match.json"
  g cert python3 "$HERE/certainty_check.py" "$SRC" "$NOTE" --out "$OUT/certainty.json"
  g dens python3 "$HERE/density.py" "$BODY" --source "$SRC" --out "$OUT/density.json"
else
  g style bash -c 'python3 "$0/style_check.py" "$1" --out "$2/style.json" | tail -n 8' "$HERE" "$BODY" "$OUT"
  g cover python3 "$HERE/cite_check.py" "$NOTE" --out "$OUT/cite.json"
  g dens python3 "$HERE/density.py" "$BODY" --out "$OUT/density.json"
fi
g stat python3 "$HERE/statute_check.py" "$NOTE" --out "$OUT/statute.json" --md "$OUT/statute.md"
g reason python3 "$HERE/reason_source_check.py" "$NOTE" --out "$OUT/reason.json"
g summ python3 "$HERE/summary_dup_check.py" "$NOTE" --text --out "$OUT/summary.json"
wait
echo "== 文体 =="; show style
if [ -n "$SRC" ]; then
  echo "== 網羅（機械照合）・書誌・条文の形式 =="; show cover
  echo "== 一致（丸写しの程度） =="; show match
  echo "== 確度の語 =="; show cert
else
  echo "== 書誌・条文の形式 =="; show cover
fi
echo "== 密度 =="; show dens
echo "== 条文の一覧・判例の理由の出所・まとめの重複 =="; show stat reason summ
echo "== 採点 =="
if [ -n "$REV" ]; then
  python3 "$HERE/score.py" --dir "$OUT" --reviewer "$REV" --out "$OUT/score.json" --md "$OUT/score.md" | head -n 6
else
  python3 "$HERE/score.py" --dir "$OUT" --out "$OUT/score.json" --md "$OUT/score.md" | head -n 6
fi
echo "結果：$OUT"
echo "（簡易版。全部の検査と「次に直す点」は：python3 $HERE/pipeline.py --note $NOTE --body $BODY --out $OUT …）"
