#!/usr/bin/env python3
"""ノーマルのノートを、LABA の Word ビルダー（skills/laba/scripts/build_docx.py）の入力にして .docx を作る。

・このファイルは「ノートの行 → LABA のブロック（H・S・SS・P・B・N・T・F・K）」の対応だけを持つ。
・.docx の組み立ては、同じプラグインの build_docx.py（python-docx が必要）に任せる。
・スライドの .pptx は作らない（laba-slides のスキルに任せる）。
"""
import base64
import json
import os
import re
import subprocess
import sys
import tempfile

import gnoto_note as gn

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD_DOCX = os.path.normpath(os.path.join(HERE, "..", "..", "laba", "scripts", "build_docx.py"))


def to_laba_blocks(note, workdir):
    """(meta, blocks)。画像は workdir に書き出して F ブロックにする。"""
    if gn.style_of(note) != "normal":
        raise gn.NoteError("Word に出せるのはノーマルのノートだけ（スライドは laba-slides の担当）")
    title = note["note"].get("title", "")
    blocks = []
    counters = {}
    imgn = [0]

    def text_of(b):
        return gn.strip_tags(b.get("html", ""))

    def blk(b):
        if not isinstance(b, dict):
            return
        if "html" in b:
            t = text_of(b)
            if not t:
                return
            ht = b.get("htype")
            if ht == "1":
                blocks.append(["H", t])
            elif ht == "2":
                blocks.append(["S", t])
            elif ht == "3":
                blocks.append(["SS", t])
            elif b.get("list") == "ul":
                blocks.append(["B", t])
            elif b.get("list") == "ol":
                ind = int(b.get("indent") or 0)
                counters[ind] = counters.get(ind, 0) + 1
                blocks.append(["N", "%d. %s" % (counters[ind], t)])
            else:
                blocks.append(["P", t])
            if b.get("list") != "ol":
                counters.clear()
        elif "table" in b:
            t = b["table"]
            blocks.append(["T", [[gn.strip_tags(h) for h in t.get("head", [])]] +
                           [[gn.strip_tags(c) for c in r] for r in t.get("rows", [])], ""])
        elif "img" in b:
            m = re.match(r"^data:image/(png|jpeg|gif|webp|bmp);base64,(.+)$", str(b["img"].get("src", "")), re.S)
            if m and m.group(1) in ("png", "jpeg"):
                imgn[0] += 1
                path = os.path.join(workdir, "img%d.%s" % (imgn[0], "jpg" if m.group(1) == "jpeg" else "png"))
                with open(path, "wb") as f:
                    f.write(base64.b64decode(m.group(2)))
                blocks.append(["F", path, "", 100])
        elif "code" in b:
            blocks.append(["P", str(b["code"].get("src", ""))])

    def row(r):
        if isinstance(r, list):
            for b in r:
                blk(b)
        elif isinstance(r, dict):
            if r.get("toggle"):
                blocks.append(["SS", str(r.get("title", ""))])
                for x in r.get("rows", []):
                    row(x)
            elif r.get("callout"):
                for x in r.get("rows", []):
                    row(x)
            elif "cols" in r:
                for col in r["cols"]:
                    for b in col:
                        blk(b)
    for r in gn.content_of(note).get("rows") or []:
        row(r)
    meta = {"title": title, "course": "", "session": ""}
    return meta, blocks


def export_docx(note, out_docx):
    """成功したら out_docx を返す。build_docx.py か python-docx が無ければ NoteError（理由つき）。"""
    if not os.path.exists(BUILD_DOCX):
        raise gn.NoteError("build_docx.py が見つからない（LABA プラグインの skills/laba/scripts/ が要る）")
    with tempfile.TemporaryDirectory() as d:
        meta, blocks = to_laba_blocks(note, d)
        src = os.path.join(d, "blocks.json")
        with open(src, "w", encoding="utf-8") as f:
            json.dump({"meta": meta, "blocks": blocks}, f, ensure_ascii=False)
        r = subprocess.run([sys.executable, BUILD_DOCX, src, os.path.abspath(out_docx)],
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
        if r.returncode != 0:
            tail = (r.stderr or r.stdout).strip().splitlines()[-1:] or ["不明"]
            raise gn.NoteError("Word の書き出しに失敗（python-docx が要る）：%s" % tail[0])
    return out_docx
