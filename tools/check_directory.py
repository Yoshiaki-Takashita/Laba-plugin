#!/usr/bin/env python3
"""ディレクトリ版の木（フォルダまたは zip）が、公式ディレクトリの許す種類のファイルだけかを確かめる。
標準ライブラリだけ。使い方: python3 tools/check_directory.py <フォルダ または .zip>
終了コード: 失敗が 1 つでもあれば 1。"""
import io, json, os, re, stat, sys, zipfile

ALLOWED_EXT = {".md", ".txt", ".json", ".yaml", ".yml", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico"}
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico"}
ALLOWED_NAMES = {".gitignore"}  # LICENSE* は別に判定
PKG_NAMES = {
    "package.json", "package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "bun.lock", "bun.lockb",
    "pnpm-workspace.yaml", "pnpm-lock.yaml", ".npmrc", ".yarnrc", ".yarnrc.yml", "bunfig.toml", "uv.toml",
    "pyproject.toml", "pipfile", "pipfile.lock", "poetry.lock", "requirements.txt", "constraints.txt",
    "composer.json", "composer.lock", "cargo.toml", "go.mod", "gemfile", "deno.json", "deno.jsonc", "tsconfig.json",
}
FORBIDDEN_NAMES = {"hooks.json", ".mcp.json", ".lsp.json", "monitors.json"}
FORBIDDEN_DIRS = {".claude", "output-styles", "egress", "bin", "hooks", "scripts", "tests", "tools", "node_modules", "__macosx"}
SYSTEM_FILES = {".ds_store", "thumbs.db", "desktop.ini"}
WIN_DEVICES = {"con", "prn", "aux", "nul"} | {"com%d" % i for i in range(1, 10)} | {"lpt%d" % i for i in range(1, 10)}
SECRET_RES = [re.compile(p) for p in (
    r"sk-[A-Za-z0-9_-]{20,}", r"AKIA[0-9A-Z]{16}", r"-----BEGIN [A-Z ]*PRIVATE KEY-----", r"ghp_[A-Za-z0-9]{30,}",
    r"github_pat_[A-Za-z0-9_]{30,}", r"xox[baprs]-[A-Za-z0-9-]{10,}", r"AIza[0-9A-Za-z_-]{30,}",
    r"eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}")]
MAX_FILES, MAX_TEXT, MAX_ANY = 512, 256 * 1024, 5 * 1024 * 1024


def load(path):
    """[(相対パス, バイト列, 実行権)] を返す。"""
    out = []
    if os.path.isdir(path):
        for d, _dirs, fs in os.walk(path):
            for f in fs:
                p = os.path.join(d, f)
                rel = os.path.relpath(p, path).replace(os.sep, "/")
                st = os.lstat(p)
                if stat.S_ISLNK(st.st_mode):
                    out.append((rel, None, False)); continue
                with open(p, "rb") as fh:
                    out.append((rel, fh.read(), bool(st.st_mode & 0o111)))
    else:
        with zipfile.ZipFile(path) as z:
            for i in z.infolist():
                if i.is_dir():
                    continue
                mode = (i.external_attr >> 16) & 0o177777
                out.append((i.filename, z.read(i), bool(mode & 0o111)))
    return sorted(out)


def check(files):
    fails, notes = [], []
    F = lambda rel, msg: fails.append("%s：%s" % (rel, msg))
    names = [r for r, _, _ in files]
    if len(files) > MAX_FILES:
        fails.append("ファイルが %d 個（上限 %d）" % (len(files), MAX_FILES))
    low = {}
    for rel, data, xbit in files:
        parts = rel.split("/")
        base = parts[-1]
        ext = os.path.splitext(base)[1].lower()
        if data is None:
            F(rel, "シンボリックリンク"); continue
        if not re.fullmatch(r"[A-Za-z0-9._/-]+", rel):
            F(rel, "パスに使えない文字")
        if base.endswith(".") or base.startswith(" ") or base.endswith(" ") or ":" in base:
            F(rel, "Windows・macOS で使えない名前")
        if os.path.splitext(base)[0].lower() in WIN_DEVICES:
            F(rel, "Windows の装置名")
        if rel.lower() in low:
            F(rel, "大文字小文字だけが違う名前が重なる（%s）" % low[rel.lower()])
        low[rel.lower()] = rel
        if base.lower() in SYSTEM_FILES or "__macosx" in [p.lower() for p in parts]:
            F(rel, "OS のごみファイル")
        if any(p.lower() in FORBIDDEN_DIRS for p in parts[:-1]):
            F(rel, "置いてはいけないフォルダの中（%s）" % "/".join(parts[:-1]))
        if base.lower() in PKG_NAMES or re.fullmatch(r"requirements.*\.txt", base.lower()):
            F(rel, "パッケージ管理の設定ファイル")
        if base.lower() in FORBIDDEN_NAMES:
            F(rel, "hooks・MCP・LSP・monitors の設定")
        if ".claude-plugin" in parts:
            if rel != ".claude-plugin/plugin.json":
                F(rel, ".claude-plugin に plugin.json 以外がある")
        if xbit:
            F(rel, "実行権が付いている")
        is_license = base.upper().startswith("LICENSE")
        if not (ext in ALLOWED_EXT or base in ALLOWED_NAMES or (is_license and ext in ("", ".md", ".txt"))):
            F(rel, "許可された種類ではない（%s）" % (ext or "拡張子なし"))
            continue
        if len(data) > MAX_ANY:
            F(rel, "5 MiB を超える")
        if ext in IMAGE_EXT:
            sig = {".png": b"\x89PNG\r\n\x1a\n", ".gif": b"GIF8", ".jpg": b"\xff\xd8\xff", ".jpeg": b"\xff\xd8\xff",
                   ".webp": b"RIFF", ".ico": b"\x00\x00\x01\x00"}[ext]
            if not data.startswith(sig):
                F(rel, "画像の先頭が %s の形でない" % ext)
            if ext == ".png" and b"IEND" not in data[-16:]:
                F(rel, "PNG が最後まである形でない（IEND なし）")
            continue
        if len(data) > MAX_TEXT:
            F(rel, "画像以外が 256 KiB を超える（%d バイト。審査員の確認に回る）" % len(data))
        if b"\x00" in data:
            F(rel, "NUL バイトがある"); continue
        if data.startswith(b"#!"):
            F(rel, "先頭が #! ")
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError as e:
            F(rel, "UTF-8 でない（%s）" % e); continue
        if text.startswith("﻿"):
            notes.append("%s：先頭に BOM" % rel)
        if "\r" in text and "\n" not in text:
            F(rel, "改行が CR だけ")
        if ext == ".json":
            try:
                json.loads(text.lstrip("﻿"))
            except Exception as e:
                F(rel, "JSON として読めない（%s）" % e)
        for rx in SECRET_RES:
            m = rx.search(text)
            if m:
                F(rel, "鍵らしい文字列（%s…）" % m.group(0)[:8])
    d = {r: b for r, b, _ in files}
    if ".claude-plugin/plugin.json" not in d:
        fails.append(".claude-plugin/plugin.json がない")
    else:
        try:
            pj = json.loads(d[".claude-plugin/plugin.json"].decode("utf-8"))
            for k in ("name", "version", "description", "author", "license"):
                if k not in pj:
                    fails.append("plugin.json に %s がない" % k)
            for k in ("hooks", "mcpServers", "lspServers", "monitors", "outputStyles"):
                if k in pj:
                    fails.append("plugin.json に %s がある" % k)
        except Exception as e:
            fails.append("plugin.json が読めない：%s" % e)
    if "LICENSE" not in d:
        fails.append("LICENSE がない")
    rd = d.get("README.md")
    if rd is None:
        fails.append("README.md がない")
    elif len(re.findall(r"\S+", re.sub(r"```.*?```", "", rd.decode("utf-8"), flags=re.S))) < 40:
        fails.append("README が 40 語に満たない")
    skills = sorted({r.split("/")[1] for r in names if r.startswith("skills/")})
    for s in skills:
        sk = d.get("skills/%s/SKILL.md" % s)
        if sk is None:
            fails.append("skills/%s/SKILL.md がない" % s)
        elif not sk.decode("utf-8").startswith("---\n"):
            fails.append("skills/%s/SKILL.md に front matter がない" % s)
    return fails, notes


def main():
    if len(sys.argv) != 2:
        print(__doc__); return 2
    files = load(sys.argv[1])
    fails, notes = check(files)
    for n in notes:
        print("注：" + n)
    for f in fails:
        print("失敗：" + f)
    ext = {}
    for r, _, _ in files:
        e = os.path.splitext(r)[1].lower() or os.path.basename(r)
        ext[e] = ext.get(e, 0) + 1
    print("ファイル %d 個（%s）" % (len(files), "、".join("%s %d" % kv for kv in sorted(ext.items()))))
    print("合格" if not fails else "不合格（%d 件）" % len(fails))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
