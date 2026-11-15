#!/usr/bin/env bash
# 配布版（ディレクトリへの申請・配る zip）を作る。
#   main ブランチ＝開発用（試験・試験の資料を含む）。
#   release ブランチ＝配布版（下の EXCLUDE を外したもの）。ディレクトリの申請では、追う枝に release を指定する。
#   directory ブランチ＝ディレクトリ版（手順書のみ。スクリプトを 1 つも含まない）。公式ディレクトリは、検証済みでない組織には
#     スクリプト・プログラムなどを受け付けないので、そこへ出すのはこの版。フル版（スクリプトつき）は release を GitHub から入れる。
# 使い方（リポジトリの直下で）：
#   bash tools/build-dist.sh                      → release ブランチを今の HEAD から作り直す（コミットを 1 つ足す）
#   bash tools/build-dist.sh out.zip              → さらに配布版の zip を out.zip に書く
#   bash tools/build-dist.sh --directory [out.zip] → directory ブランチを今の HEAD から作り直す（release の木から許可された種類だけ
#                                                   残し、dist-directory/overlay の文書を重ねる。検査に通らなければ作らない）。release は動かさない
# 作業ツリーとふだんの索引は変えない（一時の索引で木を組む）。push はしない（release を出すときは手で push する）。
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# 配布に要らないもの（実行時にどこからも読まれないことを確かめたもの。2026-11-15）
EXCLUDE=(
  tools                                   # この台本など、開発の道具
  dist-directory                          # ディレクトリ版に重ねる文書（--directory のときだけ使う）
  skills/laba/evals                       # 試験の問い・自作の資料・測定
  skills/laba/scripts/figgen/tests        # 図のエンジンの回帰試験
  skills/laba/scripts/slides/tests        # スライドの回帰試験
  skills/gnoto-lite/tests/app_roundtrip.js  # GNOTO Lite の試験（見本の tests/fixtures/ は SPEC.md が参照するので残す）
  skills/gnoto-lite/tests/test_gnoto.py
)

idx="$(mktemp)"; trap 'rm -f "$idx"' EXIT
export GIT_INDEX_FILE="$idx"
git read-tree HEAD
for p in "${EXCLUDE[@]}"; do
  git rm -r -q --cached --ignore-unmatch -- "$p"
done
tree="$(git write-tree)"
unset GIT_INDEX_FILE

n="$(git ls-tree -r --name-only "$tree" | wc -l)"
ver="$(git show "$tree:.claude-plugin/plugin.json" | python3 -c 'import json,sys;print(json.load(sys.stdin)["version"])')"
if [ "$n" -gt 512 ]; then echo "ファイルが $n 個（上限 512）。EXCLUDE を見直す" >&2; exit 1; fi

src="$(git rev-parse --short HEAD)"

if [ "${1:-}" = "--directory" ]; then
  shift
  work="$(mktemp -d)"; trap 'rm -f "$idx"; rm -rf "$work"' EXIT
  mkdir "$work/tree"
  git archive "$tree" | tar -x -C "$work/tree"
  python3 tools/build_directory.py "$work/tree" dist-directory
  python3 tools/check_directory.py "$work/tree" | tail -2
  export GIT_INDEX_FILE="$idx"; rm -f "$idx"
  git --work-tree="$work/tree" add -f -A
  dtree="$(git write-tree)"
  unset GIT_INDEX_FILE
  dn="$(git ls-tree -r --name-only "$dtree" | wc -l)"
  dparent="$(git rev-parse -q --verify refs/heads/directory || true)"
  if [ -n "$dparent" ] && [ "$(git rev-parse "$dparent^{tree}")" = "$dtree" ]; then
    echo "directory は既に同じ中身（$ver・$dn 個）。コミットは足さない"
  else
    c="$(git commit-tree "$dtree" ${dparent:+-p "$dparent"} -m "ディレクトリ版（手順書のみ）$ver（main $src から。スクリプトを外す・$dn 個）")"
    git update-ref refs/heads/directory "$c"
    echo "directory を更新：$ver・ファイル $dn 個（main $src から）"
  fi
  if [ "${1:-}" != "" ]; then
    git archive --format=zip -o "$1" "$dtree"
    python3 tools/check_directory.py "$1" | tail -2
    echo "zip：$1"
  fi
  exit 0
fi

parent="$(git rev-parse -q --verify refs/heads/release || true)"
if [ -n "$parent" ] && [ "$(git rev-parse "$parent^{tree}")" = "$tree" ]; then
  echo "release は既に同じ中身（$ver・$n 個）。コミットは足さない"
else
  c="$(git commit-tree "$tree" ${parent:+-p "$parent"} -m "配布版 $ver（main $src から。試験を外す・$n 個）")"
  git update-ref refs/heads/release "$c"
  echo "release を更新：$ver・ファイル $n 個（main $src から）"
fi
if [ "${1:-}" != "" ]; then
  git archive --format=zip -o "$1" "$tree"
  echo "zip：$1"
fi
