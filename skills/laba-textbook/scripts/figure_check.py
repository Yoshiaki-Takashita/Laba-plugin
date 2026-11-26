#!/usr/bin/env python3
"""図の記述（figure-spec の型＋要素）の検査。標準ライブラリだけ。

  python3 figure_check.py figs.json [--text 本文.txt] [--strict]
  python3 figure_check.py note.gnoto            （.gnoto の page2.figs を検査）
  python3 figure_check.py --svg out.svg         （figure_svg.py が書いた SVG の形式を検査）

figs.json は {"図の id": 図の記述, ...}、または図の記述 1 つ（"kind" がある）。
誤り＝GNOTO の読み込みで落ちる・描けない・図の規則（references/figure-spec.md の G7）を破る。
警告＝規模・長さが目安を超える・強調が多い・本文に語が無い（--strict で警告も誤りにする）。
終了コード：0＝誤りなし　1＝誤りあり。
"""
import json
import os
import re
import sys
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import minischema  # noqa: E402

ANYKEY = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,31}$")
BADKEY = re.compile(r"^(html|innerHTML|outerHTML|script|style|src|href|srcdoc|xlink)$", re.I)

# R12（rules.md）の規模の目安と、G4 の長さの目安
SCALE = {"flow": (3, 9), "tree": (3, 24), "timeline": (3, 8), "relation": (3, 6), "concept": (2, 14)}
LEN = {"node": 14, "edge": 6, "tree": 12, "cell": 20, "when": 8, "what": 20, "title": 10, "axis": 6}


def any_walk(v, path, d, errs):
    """GNOTO の pgSanAny が落とすものを先に見つける（キー名・文字列・深さ）。d は pgSanAny の深さ。"""
    if isinstance(v, str):
        if len(v) > 2000:
            errs.append("%s: 文字列が 2000 字を超える（GNOTO が落とす）" % path)
        if re.search(r"[<>]", v):
            errs.append("%s: 文字列に < または > を含む（GNOTO が落とす）" % path)
        return
    if d >= 6 and isinstance(v, (list, dict)):
        errs.append("%s: 入れ子が深すぎる（GNOTO は深さ 5 までしか残さない。平らな形に直す）" % path)
        return
    if isinstance(v, list):
        for i, x in enumerate(v):
            any_walk(x, "%s[%d]" % (path, i), d + 1, errs)
    elif isinstance(v, dict):
        for k, x in v.items():
            if not ANYKEY.match(k) or BADKEY.match(k):
                errs.append("%s: キー名 %s は GNOTO が落とす（英字で始まる 32 字以内・style/src/href/html などは不可）" % (path, k))
            any_walk(x, "%s.%s" % (path, k), d + 1, errs)


def check_fig(fid, f, text=None):
    """(errors, warnings) を返す。fid は図の id（キーの形も見る）。"""
    errs, warns = [], []
    P = "図 %s" % fid
    if not re.match(r"^[a-z][a-z0-9_]{0,15}$", fid):
        errs.append("%s: id は英小文字で始まる 16 字以内（数字始まりは GNOTO がキーとして落とす）" % P)
    errs += ["%s: %s" % (P, e) for e in minischema.validate(f, minischema.load_schema("figure.schema.json"))]
    if errs:
        return errs, warns
    any_walk(f, P, 2, errs)  # figs の中の 1 つの図＝深さ 2 から
    kind = f["kind"]
    nodes = f.get("nodes", [])
    ids = [n["id"] for n in nodes]
    if len(ids) != len(set(ids)):
        errs.append("%s: ノードの id が重複している" % P)
    idset = set(ids)
    cap = f.get("caption", {})
    if len(cap.get("title", "")) > LEN["title"]:
        warns.append("%s: 図題が %d 字（目安 %d 字まで・名詞句）" % (P, len(cap["title"]), LEN["title"]))
    if not cap.get("title"):
        warns.append("%s: 図題が無い" % P)
    lo, hi = SCALE.get(kind, (0, 99))
    n = len(nodes)
    if kind in ("flow", "relation", "concept", "tree"):
        if n < lo:
            warns.append("%s: ノードが %d 個と少ない（%s は %d〜%d が目安。図にせず文で言えないか）" % (P, n, kind, lo, hi))
        if n > hi:
            warns.append("%s: ノードが %d 個で目安 %d を超える（2 つの図に分ける・R12）" % (P, n, hi))
        if kind in ("flow", "relation", "concept") and n > 14:
            errs.append("%s: ノードは 14 まで" % P)
        tones = [x for x in nodes if x.get("tone") == "key"]
        if len(tones) > 1:
            warns.append("%s: tone key が %d 個（1 図に 1 つまで・G6）" % (P, len(tones)))
    if kind in ("flow", "relation"):
        edges = f.get("edges", [])
        for e in edges:
            for end in ("from", "to"):
                if e[end] not in idset:
                    errs.append("%s: 辺の端 %s=%s が nodes に無い" % (P, end, e[end]))
        used = {e["from"] for e in edges} | {e["to"] for e in edges}
        for i in ids:
            if i not in used:
                errs.append("%s: 孤立ノード %s（辺が 1 本も無い・G7-3）" % (P, i))
        if not edges:
            errs.append("%s: 辺が無い" % P)
        for e in edges:
            if len(e.get("label", "")) > LEN["edge"]:
                warns.append("%s: 辺のラベル「%s」が %d 字（目安 %d 字まで・G4）" % (P, e["label"], len(e["label"]), LEN["edge"]))
        if kind == "flow":
            gids = {g["id"] for g in f.get("groups", [])}
            for x in nodes:
                if x.get("group") and x["group"] not in gids:
                    errs.append("%s: ノード %s の group %s が groups に無い" % (P, x["id"], x["group"]))
            if f.get("direction") == "right":
                outdeg = {}
                for e in edges:
                    outdeg[e["from"]] = outdeg.get(e["from"], 0) + 1
                if n > 5 or any(v > 1 for v in outdeg.values()):
                    warns.append("%s: direction right は分岐なし・5 段までのとき（G の配置の規則）" % P)
    if kind == "concept":
        gids = {g["id"] for g in f.get("groups", [])} | idset
        for x in nodes:
            if x.get("group") and x["group"] not in gids:
                errs.append("%s: ノード %s の group %s が groups にも nodes にも無い" % (P, x["id"], x["group"]))
    if kind == "tree":
        parents = {}
        for x in nodes:
            p = x.get("parent")
            if p is not None and p not in idset:
                errs.append("%s: ノード %s の parent %s が nodes に無い" % (P, x["id"], p))
            parents[x["id"]] = p
        roots = [i for i, p in parents.items() if p is None]
        if len(roots) != 1:
            errs.append("%s: 根（parent の無いノード）は 1 つだけ（いま %d 個）" % (P, len(roots)))
        else:
            depth = {}

            def dep(i, seen=()):
                if i in seen:
                    return 99
                p = parents.get(i)
                return 1 if p is None else 1 + dep(p, seen + (i,))
            mx = max(dep(i) for i in ids)
            if mx == 99:
                errs.append("%s: parent が循環している" % P)
            elif mx > 3:
                warns.append("%s: 木が %d 階層（3 階層まで・R12）" % (P, mx))
            kids = {}
            for i, p in parents.items():
                if p is not None:
                    kids[p] = kids.get(p, 0) + 1
            if kids and max(kids.values()) > 6:
                errs.append("%s: 子は 6 つまで" % P)
        for x in nodes:
            if len(x["label"]) > LEN["tree"]:
                warns.append("%s: ノード「%s」が %d 字（木は %d 字まで・G4）" % (P, x["label"], len(x["label"]), LEN["tree"]))
    if kind in ("flow", "relation", "concept"):
        for x in nodes:
            if len(x["label"]) > LEN["node"]:
                warns.append("%s: ノード「%s」が %d 字（目安 %d 字まで・G4）" % (P, x["label"], len(x["label"]), LEN["node"]))
    if kind in ("table", "matrix"):
        head, rows = f["head"], f["rows"]
        want = len(head) + (1 if kind == "matrix" else 0)
        if kind == "table" and f.get("rowHead") is False:
            want = len(head)
        for i, r in enumerate(rows):
            if len(r) != want:
                errs.append("%s: %d 行目のセルが %d 個（%d 個のはず）" % (P, i + 1, len(r), want))
        if len(head) > 5:
            warns.append("%s: 列が %d（5 まで・R11）" % (P, len(head)))
        if len(rows) < 1:
            errs.append("%s: 行が無い" % P)
        for r in rows:
            for c in r:
                if len(c) > LEN["cell"]:
                    warns.append("%s: セル「%s…」が %d 字（%d 字まで・G4）" % (P, c[:6], len(c), LEN["cell"]))
        if kind == "matrix":
            for k in ("rowAxis", "colAxis"):
                if len(f.get(k, "")) > LEN["axis"]:
                    warns.append("%s: %s が %d 字（%d 字まで・G4）" % (P, k, len(f[k]), LEN["axis"]))
    if kind == "timeline":
        ev = f["events"]
        if len(ev) < lo:
            warns.append("%s: 出来事が %d 個と少ない（3 つ以上のとき・R9）" % (P, len(ev)))
        for e in ev:
            if len(e["when"]) > LEN["when"]:
                warns.append("%s: when「%s」が %d 字（%d 字まで・G4）" % (P, e["when"], len(e["when"]), LEN["when"]))
            if len(e["what"]) > LEN["what"]:
                warns.append("%s: what「%s…」が %d 字（%d 字まで・G4）" % (P, e["what"][:6], len(e["what"]), LEN["what"]))
    if text:
        labels = [x["label"] for x in nodes]
        labels += [e["what"] for e in f.get("events", [])]
        for lb in labels:
            if lb and lb not in text:
                warns.append("%s: 語「%s」が本文に出てこない（図で初めて出る語を作らない・G7-1）" % (P, lb))
    return errs, warns


def svg_check(path):
    """figure_svg.py が書いた SVG の形式の検査。"""
    errs, warns = [], []
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError as e:
        return ["SVG として読めない: %s" % e], warns
    ns = "{http://www.w3.org/2000/svg}"
    if not root.tag.endswith("svg"):
        errs.append("ルートが svg でない")
    vb = root.get("viewBox")
    if not vb:
        errs.append("viewBox が無い")
        return errs, warns
    x0, y0, w, h = [float(t) for t in vb.split()]
    gray = re.compile(r"^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|none|white|black|currentColor)$")

    def is_gray(c):
        if c in ("none", "white", "black", "currentColor"):
            return True
        c = c.lstrip("#")
        if len(c) == 3:
            c = "".join(ch * 2 for ch in c)
        if len(c) != 6:
            return False
        v = [int(c[i:i + 2], 16) for i in (0, 2, 4)]
        return max(v) - min(v) <= 6   # 測定値の誤差（#797575 など）は灰として扱う。色相のある色は通さない
    texts = []
    for el in root.iter():
        tag = el.tag.replace(ns, "")
        if tag in ("linearGradient", "radialGradient", "filter", "image", "script", "foreignObject", "style"):
            errs.append("使えない要素 <%s>（教科書の図は単色・平ら・自己完結）" % tag)
        for a in ("fill", "stroke"):
            v = el.get(a)
            if v and not v.startswith("url(") and not (gray.match(v) and is_gray(v)):
                errs.append("色相のある色 %s=%s（教科書の図は灰の濃さだけ・R の色の規則）" % (a, v))
            if v and v.startswith("url("):
                errs.append("%s=%s（パターン・グラデーションは使わない）" % (a, v))
        if any(k.startswith("on") for k in el.attrib):
            errs.append("<%s> にイベント属性" % tag)
        if tag == "text":
            texts.append(el)
    for t in texts:
        try:
            x, y = float(t.get("x", 0)), float(t.get("y", 0))
        except ValueError:
            continue
        if x < x0 or x > x0 + w or y < y0 or y > y0 + h:
            errs.append("文字「%s」が viewBox の外" % ("".join(t.itertext())[:10]))
    if not texts:
        warns.append("文字が 1 つも無い")
    return errs, warns


def load_figs(path):
    d = json.load(open(path, encoding="utf-8"))
    if isinstance(d, dict) and d.get("glyph") == "note":
        p2 = (d["note"].get("content") or {}).get("page2") or {}
        return p2.get("figs") or {}, None
    if isinstance(d, dict) and "kind" in d:
        return {"f1": d}, None
    if isinstance(d, dict) and isinstance(d.get("figs"), dict):
        return d["figs"], None
    return d, None


def main(argv=None):
    a = list(sys.argv[1:] if argv is None else argv)
    strict = "--strict" in a
    text = None
    if "--text" in a:
        i = a.index("--text")
        text = open(a[i + 1], encoding="utf-8").read()
        del a[i:i + 2]
    a = [x for x in a if x != "--strict"]
    if len(a) == 2 and a[0] == "--svg":
        errs, warns = svg_check(a[1])
    elif len(a) == 1:
        figs, _ = load_figs(a[0])
        errs, warns = [], []
        for fid, f in figs.items():
            e, w = check_fig(fid, f, text)
            errs += e
            warns += w
        if not figs:
            warns.append("図が 1 つも無い")
    else:
        print(__doc__)
        return 2
    for w in warns:
        print("警告:", w)
    for e in errs:
        print("誤り:", e)
    bad = errs or (strict and warns)
    print("検査:", "通らない" if bad else "通る", "（誤り %d・警告 %d）" % (len(errs), len(warns)))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
