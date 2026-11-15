#!/usr/bin/env bash
# 配布版（ディレクトリへの申請・配る zip）を作る。
#   main ブランチ＝開発用（試験・試験の資料を含む）。
#   release ブランチ＝配布版（下の EXCLUDE を外したもの）。ディレクトリの申請では、追う枝に release を指定する。
# 使い方（リポジトリの直下で）：
#   bash tools/build-dist.sh            → release ブランチを今の HEAD から作り直す（コミットを 1 つ足す）
#   bash tools/build-dist.sh out.zip    → さらに配布版の zip を out.zip に書く
# 作業ツリーとふだんの索引は変えない（一時の索引で木を組む）。push はしない（release を出すときは手で push する）。
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# 配布に要らないもの（実行時にどこからも読まれないことを確かめたもの。2026-11-15）
EXCLUDE=(
  tools                                   # この台本など、開発の道具
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
