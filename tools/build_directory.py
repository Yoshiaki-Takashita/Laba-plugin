#!/usr/bin/env python3
"""配布版（release）の木から「ディレクトリ版（手順書のみ）」の木を作る。build-dist.sh --directory が呼ぶ。
使い方: python3 tools/build_directory.py <release の木を展開したフォルダ> <dist-directory のフォルダ>
やること：許可された種類だけを残す → 上書き用の文書（overlay）を重ねる → 検査（check_directory.py）。
失敗したら終了コード 1。標準ライブラリだけ。"""
import json, os, re, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import check_directory as cd  # noqa: E402


def walk(root):
    for d, _dirs, fs in os.walk(root):
        for f in fs:
            p = os.path.join(d, f)
            yield p, os.path.relpath(p, root).replace(os.sep, "/")


def why_drop(rel, data):
    """残さない理由を返す。残すなら None。"""
    parts = rel.split("/")
    base = parts[-1]
    ext = os.path.splitext(base)[1].lower()
    if parts[0] in ("tools", "dist-directory"):
        return "開発用（tools・dist-directory）"
    if any(p in ("scripts", "tests", "evals") for p in parts[:-1]):
        return "道具（scripts）と、その入力・試験"
    if ".claude-plugin" in parts[:-1] and rel != ".claude-plugin/plugin.json":
        return ".claude-plugin の plugin.json 以外（marketplace.json はフル版だけ）"
    if base.lower() in cd.PKG_NAMES or base.lower() in cd.FORBIDDEN_NAMES:
        return "パッケージ管理・設定ファイル"
    is_license = base.upper().startswith("LICENSE")
    if not (ext in cd.ALLOWED_EXT or base in cd.ALLOWED_NAMES or (is_license and ext in ("", ".md", ".txt"))):
        return "許可外の種類（%s）" % (ext or "拡張子なし")
    if data.startswith(b"#!"):
        return "先頭が #!"
    if ext not in cd.IMAGE_EXT and b"\x00" in data:
        return "NUL バイトを含む"
    return None


def main():
    if len(sys.argv) != 3:
        print(__doc__); return 2
    tree, dist = sys.argv[1], sys.argv[2]
    overlay = os.path.join(dist, "overlay")
    with open(os.path.join(tree, ".claude-plugin/plugin.json"), encoding="utf-8") as fh:
        main_pj = json.load(fh)

    before, dropped = 0, {}
    for p, rel in walk(tree):
        before += 1
        with open(p, "rb") as fh:
            data = fh.read()
        r = why_drop(rel, data)
        if r:
            dropped.setdefault(r, []).append(rel)
            os.remove(p)
    for d, dirs, fs in os.walk(tree, topdown=False):
        if not os.listdir(d) and d != tree:
            os.rmdir(d)

    with open(os.path.join(dist, "plugin-patch.json"), encoding="utf-8") as fh:
        patch = json.load(fh)
    for rel in patch.get("drop_files", []):
        os.remove(os.path.join(tree, rel))
        dropped.setdefault("開発用の記録（drop_files）", []).append(rel)
    for rel, pairs in patch.get("replace", {}).items():
        fp = os.path.join(tree, rel)
        with open(fp, encoding="utf-8") as fh:
            txt = fh.read()
        for old, new in pairs:
            if old not in txt:
                print("失敗：%s に置き換え前の文がない：%s" % (rel, old[:30])); return 1
            txt = txt.replace(old, new)
        with open(fp, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(txt)

    # overlay：丸ごと置き換える文書
    for name in ("README.md", "PRIVACY.md"):
        shutil.copyfile(os.path.join(overlay, name), os.path.join(tree, name))

    # overlay：各スキルの先頭（題の直後）に「公式版（道具なし）での進め方」を差し込む
    top = os.path.join(overlay, "skill-top")
    for f in sorted(os.listdir(top)):
        skill = f[:-3]
        sp = os.path.join(tree, "skills", skill, "SKILL.md")
        if not os.path.exists(sp):
            print("失敗：skills/%s/SKILL.md がない" % skill); return 1
        with open(sp, encoding="utf-8") as fh:
            txt = fh.read()
        with open(os.path.join(top, f), encoding="utf-8") as fh:
            frag = fh.read().strip("\n")
        m = re.search(r"^# .+\n", txt, flags=re.M)
        if not m or "公式版（道具なし）での進め方" in txt:
            print("失敗：skills/%s/SKILL.md の題が見つからない、または差し込み済み" % skill); return 1
        txt = txt[:m.end()] + "\n" + frag + "\n" + txt[m.end():]
        with open(sp, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(txt)
    skills_with_scripts = {"laba", "laba-figures", "laba-slides", "laba-hanrei", "laba-score", "gnoto-lite", "reportkiller"}
    missing = skills_with_scripts - {f[:-3] for f in os.listdir(top)}
    if missing:
        print("失敗：差し込みの文書がないスキル：%s" % sorted(missing)); return 1

    # plugin.json：main のものから作る（版・名前は main と同じ）
    pj = dict(main_pj)
    pj["description"] = patch["description_prefix"] + main_pj["description"]
    for k in ("documentationUrl", "privacyPolicyUrl", "termsOfServiceUrl"):
        if k in pj:
            pj[k] = pj[k].replace("/blob/%s/" % patch["link_branch_from"], "/blob/%s/" % patch["link_branch_to"])
    with open(os.path.join(tree, ".claude-plugin/plugin.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump(pj, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    assert pj["name"] == main_pj["name"] and pj["version"] == main_pj["version"]

    for p, rel in walk(tree):
        os.chmod(p, 0o644)
    files = cd.load(tree)
    fails, notes = cd.check(files)
    print("release の木 %d 個 → ディレクトリ版 %d 個" % (before, len(files)))
    for reason, rels in sorted(dropped.items(), key=lambda kv: -len(kv[1])):
        print("  外した（%s）：%d 個" % (reason, len(rels)))
    for n in notes:
        print("注：" + n)
    for f in fails:
        print("失敗：" + f)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
