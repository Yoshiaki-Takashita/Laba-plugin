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
echo "== 文体 =="
if [ -n "$SRC" ]; then
  python3 "$HERE/style_profile.py" "$SRC" --out "$OUT/profile.json"
  python3 "$HERE/style_check.py" "$BODY" --profile "$OUT/profile.json" --out "$OUT/style.json" | tail -n 8
else
  python3 "$HERE/style_check.py" "$BODY" --out "$OUT/style.json" | tail -n 8
fi
if [ -n "$SRC" ]; then
  echo "== 網羅（機械照合） =="
  python3 "$HERE/inventory.py" "$SRC" --out "$OUT/inventory.json" --md "$OUT/inventory.md"
  python3 "$HERE/coverage_check.py" "$OUT/inventory.json" "$NOTE" --out "$OUT/coverage.json"
  echo "== 一致（丸写しの程度） =="
  python3 "$HERE/match_check.py" "$SRC" "$BODY" --out "$OUT/match.json"
  echo "== 確度の語 =="
  python3 "$HERE/certainty_check.py" "$SRC" "$NOTE" --out "$OUT/certainty.json"
  echo "== 書誌・条文の形式 =="
  python3 "$HERE/cite_check.py" "$NOTE" --inventory "$OUT/inventory.json" --out "$OUT/cite.json"
  echo "== 密度 =="
  python3 "$HERE/density.py" "$BODY" --source "$SRC" --out "$OUT/density.json"
else
  echo "== 書誌・条文の形式 =="
  python3 "$HERE/cite_check.py" "$NOTE" --out "$OUT/cite.json"
  echo "== 密度 =="
  python3 "$HERE/density.py" "$BODY" --out "$OUT/density.json"
fi
echo "== 条文の一覧・判例の理由の出所・まとめの重複 =="
python3 "$HERE/statute_check.py" "$NOTE" --out "$OUT/statute.json" --md "$OUT/statute.md"
python3 "$HERE/reason_source_check.py" "$NOTE" --out "$OUT/reason.json"
python3 "$HERE/summary_dup_check.py" "$NOTE" --text --out "$OUT/summary.json"
echo "== 採点 =="
if [ -n "$REV" ]; then
  python3 "$HERE/score.py" --dir "$OUT" --reviewer "$REV" --out "$OUT/score.json" --md "$OUT/score.md" | head -n 6
else
  python3 "$HERE/score.py" --dir "$OUT" --out "$OUT/score.json" --md "$OUT/score.md" | head -n 6
fi
echo "結果：$OUT"
echo "（簡易版。全部の検査と「次に直す点」は：python3 $HERE/pipeline.py --note $NOTE --body $BODY --out $OUT …）"
