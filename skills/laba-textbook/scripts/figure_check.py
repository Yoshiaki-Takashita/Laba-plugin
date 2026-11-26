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
import math
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


FIGBAD = re.compile(r"^(html|innerHTML|outerHTML|script|style|src|href|srcdoc|xlink|on[a-z]+)$", re.I)


def fig_walk(v, path, d, errs):
    """図の記述は GNOTO の pgSanFig が写す（GLYPH.html。page2.figs の 1 つ＝深さ 0 から）。落ちるものを先に見つける：
    文字列 400 字超・< >・制御文字（改行も消える）／深さ 8 以上の配列と辞書／キー名（英字で始まる 32 字以内・html/src/href/on○○ など。
    style は pgSanFig では落ちないが、古い読み込み pgSanAny で落ちるので使わない）／1 つの辞書のキー 60 を超える／配列 300 を超える。"""
    if isinstance(v, str):
        if len(v) > 400:
            errs.append("%s: 文字列が 400 字を超える（GNOTO が落とす）" % path)
        if re.search(r"[<>]", v):
            errs.append("%s: 文字列に < または > を含む（GNOTO が落とす）" % path)
        if re.search(r"[\x00-\x1f\x7f]", v):
            errs.append("%s: 文字列に改行・制御文字を含む（GNOTO が消す。2 行目は別の欄 sub などに）" % path)
        return
    if d >= 8 and isinstance(v, (list, dict)):
        errs.append("%s: 入れ子が深すぎる（GNOTO の図は深さ 7 までしか残さない）" % path)
        return
    if isinstance(v, list):
        if len(v) > 300:
            errs.append("%s: 要素が 300 を超える（GNOTO が切る）" % path)
        for i, x in enumerate(v):
            fig_walk(x, "%s[%d]" % (path, i), d + 1, errs)
    elif isinstance(v, dict):
        if len(v) > 60:
            errs.append("%s: キーが 60 を超える（GNOTO が切る）" % path)
        for k, x in v.items():
            if not ANYKEY.match(k) or FIGBAD.match(k):
                errs.append("%s: キー名 %s は GNOTO が落とす（英字で始まる 32 字以内・style/src/href/html/on○○ などは不可）" % (path, k))
            fig_walk(x, "%s.%s" % (path, k), d + 1, errs)


# 新しい型の目安（FIGURE-DESIGN の 4 章・76 図の測定）
NUMRE = re.compile(r"-?\d+(?:\.\d+)?")


def _num_in_text(v, text):
    """本文に数 v が出てくるか（全角数字・桁区切りのコンマも見る）。"""
    z = str.maketrans("０１２３４５６７８９．，", "0123456789.,")
    t = text.translate(z).replace(",", "")
    s = ("%g" % v)
    return any(abs(float(m) - v) < 1e-9 for m in NUMRE.findall(t)) or s in t


def check_compare(P, f, errs, warns, text):
    panels, slots = f["panels"], f["slots"]
    sets = [tuple(sorted(n["id"] for n in p["nodes"])) for p in panels]
    for p in panels:
        ids = [n["id"] for n in p["nodes"]]
        if len(ids) != len(set(ids)):
            errs.append("%s: 面「%s」でノードの id が重複している" % (P, p["title"]))
        for e in p.get("edges", []):
            for end in ("from", "to"):
                if e[end] not in ids:
                    errs.append("%s: 面「%s」の辺の端 %s=%s がその面の nodes に無い" % (P, p["title"], end, e[end]))
        keys = [n for n in p["nodes"] if n.get("tone") == "key"]
        if len(keys) > 1:
            warns.append("%s: 面「%s」に tone key が %d 個（1 図に 1 つまで）" % (P, p["title"], len(keys)))
    if len(set(sets)) > 1:
        errs.append("%s: 面ごとに当事者の集合が違う（全部の面に同じ当事者を書く。消えた者も gone:true で残す）" % P)
    allids = set(i for s_ in sets for i in s_)
    miss = sorted(allids - set(slots))
    if miss:
        errs.append("%s: slots に位置の無い当事者 %s（全面で同じ位置に置くため全員に位置を書く）" % (P, "・".join(miss)))
    extra = sorted(set(slots) - allids)
    if extra:
        warns.append("%s: slots に面に無い id %s" % (P, "・".join(extra)))
    cells = {}
    for k, v in slots.items():
        cells.setdefault(tuple(v), []).append(k)
    for v, ks in cells.items():
        if len(ks) > 1:
            errs.append("%s: slots で %s が同じ位置 %s（重なって描かれる）" % (P, "・".join(ks), list(v)))
    sig = [tuple(sorted((e["from"], e["to"], e.get("line", "solid")) for e in p.get("edges", []))) for p in panels]
    gone = [tuple(sorted(n["id"] for n in p["nodes"] if n.get("gone"))) for p in panels]
    if len(set(sig)) == 1 and len(set(gone)) == 1:
        errs.append("%s: 面の間で関係が 1 つも変わらない（変わらないなら compare にしない）" % P)
    titles = [p["title"] for p in panels]
    if len(set(titles)) != len(titles):
        errs.append("%s: 面の見出しが重複している" % P)
    if text:
        for p in panels:
            if p["title"] not in text:
                warns.append("%s: 面の見出し「%s」が本文に出てこない" % (P, p["title"]))
        for lb in sorted({n["label"] for p in panels for n in p["nodes"]}):
            if lb not in text:
                warns.append("%s: 語「%s」が本文に出てこない（図で初めて出る語を作らない・G7-1）" % (P, lb))


def check_chart(P, f, errs, warns, text):
    cats = f["x"]["cats"]
    for se in f["series"]:
        vals = se["values"]
        if len(vals) != len(cats):
            errs.append("%s: 系列「%s」の値が %d 個（カテゴリ %d 個と同じ数に）" % (P, se["label"], len(vals), len(cats)))
        nums = [v for v in vals if v is not None]
        if len(nums) < 2:
            errs.append("%s: 系列「%s」の値が 2 つ未満（図にしない）" % (P, se["label"]))
        if se["type"] == "bar" and any(v < 0 for v in nums):
            errs.append("%s: 棒の系列「%s」に負の値（基準線の描き分けが要る。表 table にする）" % (P, se["label"]))
        if se["type"] == "line" and any(v < 0 for v in nums):
            warns.append("%s: 折れ線「%s」に負の値（0 の線を引かない描き方なので、読み違えに注意）" % (P, se["label"]))
        if se.get("axis") == "right" and se["type"] != "line":
            errs.append("%s: 右の軸は折れ線だけ（系列「%s」）" % (P, se["label"]))
        if text:
            for v in nums:
                if not _num_in_text(v, text):
                    warns.append("%s: 系列「%s」の値 %g が本文に無い（数を作らない・本文の数そのまま）" % (P, se["label"], v))
    if sum(1 for se in f["series"] if se.get("axis") == "right") and not f.get("y2", {}).get("unit"):
        warns.append("%s: 右の軸があるのに y2.unit が無い" % P)
    if not f.get("y", {}).get("unit"):
        warns.append("%s: y.unit（単位）が無い" % P)
    labs = [se["label"] for se in f["series"]]
    if len(set(labs)) != len(labs):
        errs.append("%s: 系列名が重複している" % P)
    if not f.get("note"):
        warns.append("%s: note（数の出典の 1 行）が無い" % P)
    for m in f.get("marks", []):
        if m["at"] not in cats:
            errs.append("%s: marks の at「%s」が x.cats に無い" % (P, m["at"]))
    if text:
        for c in cats:
            if c not in text:
                warns.append("%s: カテゴリ「%s」が本文に出てこない" % (P, c))


def check_scale(P, f, errs, warns, text):
    items = f["items"]
    ats = [round(it["at"], 3) for it in items]
    if len(set(ats)) != len(ats):
        errs.append("%s: 同じ at の項目がある（順序の印なので別の位置に）" % P)
    labs = [it["label"] for it in items]
    if len(set(labs)) != len(labs):
        errs.append("%s: 項目の label が重複している" % P)
    if f["ends"][0] == f["ends"][1]:
        errs.append("%s: 両端の語が同じ" % P)
    if sum(1 for it in items if it.get("tone") == "key") > 1:
        warns.append("%s: tone key が 2 つ以上（1 図に 1 つまで）" % P)
    if text:
        for lb in labs + list(f["ends"]):
            if lb not in text:
                warns.append("%s: 語「%s」が本文に出てこない" % (P, lb))


def check_fig(fid, f, text=None):
    """(errors, warnings) を返す。fid は図の id（キーの形も見る）。"""
    errs, warns = [], []
    P = "図 %s" % fid
    if not re.match(r"^[a-z][a-z0-9_]{0,15}$", fid):
        errs.append("%s: id は英小文字で始まる 16 字以内（数字始まりは GNOTO がキーとして落とす）" % P)
    errs += ["%s: %s" % (P, e) for e in minischema.validate(f, minischema.load_schema("figure.schema.json"))]
    if errs:
        return errs, warns
    fig_walk(f, P, 0, errs)  # figs の中の 1 つの図＝pgSanFig の深さ 0 から
    kind = f["kind"]
    if kind == "compare":
        check_compare(P, f, errs, warns, text)
    elif kind == "chart":
        check_chart(P, f, errs, warns, text)
    elif kind == "scale":
        check_scale(P, f, errs, warns, text)
    if kind in ("compare", "chart", "scale"):
        for k in ("nodes", "edges", "head", "rows", "events", "groups"):
            if k in f:
                warns.append("%s: %s は %s では使わない（描かれない）" % (P, k, kind))
        cap = f.get("caption", {})
        if len(cap.get("title", "")) > LEN["title"]:
            warns.append("%s: 図題が %d 字（目安 %d 字まで・名詞句）" % (P, len(cap["title"]), LEN["title"]))
        if not cap.get("title"):
            warns.append("%s: 図題が無い" % P)
        return errs, warns
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
        if kind in ("table", "matrix"):     # 表の見出しとセルも本文の語か（G7-1。記号 1 字の ○△× などは除く）
            labels += [c for c in list(f["head"]) + [c for r in f["rows"] for c in r] if len(c.strip()) >= 2]
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
    ge, gw = svg_geom(root, (x0, y0, w, h))
    errs += ge
    warns += gw
    if not texts:
        warns.append("文字が 1 つも無い")
    return errs, warns


# 型ごとの縦横比 h/w の範囲（FIGURE-DESIGN 1.4・FIGURE-ANALYSIS 2.1 の測定の範囲。配置で決まる型だけ見る）
ASPECT = {"compare": (0.20, 0.59), "chart": (0.67, 0.81), "scale": (0.40, 0.54), "relation": (0.48, 0.92), "timeline": (0.23, 0.53)}


def text_width(s, size):
    """字の幅の概算（和文 1 字＝字の大きさ・欧文と数字 0.58）。書体で ±1 割ほど違う。"""
    return sum(1.0 if ord(c) > 0x2e80 else 0.58 for c in s) * size


def _f(el, k, d=0.0):
    try:
        return float(el.get(k, d))
    except (TypeError, ValueError):
        return d


def _seg_hits_box(seg, box):
    """線分（太さつき）が文字の外接に入るか。21 点で見る（概算）。"""
    ax, ay, bx, by, sw = seg
    x0, y0, x1, y1 = box
    r = sw / 2
    L = max(abs(bx - ax), abs(by - ay))
    n = max(8, int(L / 2))
    for k in range(n + 1):
        px, py = ax + (bx - ax) * k / n, ay + (by - ay) * k / n
        if x0 - r < px < x1 + r and y0 - r < py < y1 + r:
            return True
    return False


def svg_geom(root, vb):
    """描いた SVG の幾何の検査（FIGURE-DESIGN 3.2 ②）。
    誤り：文字が図の外へ出る／文字どうしが重なる／文字に線・枠が掛かる（白地の札 data-bg のある文字は細い線だけ許す。取消線 data-nocheck は除く）。
    警告：縦横比が型の範囲の外（data-kind のとき）／上下の余白が図の高さの 15% を超える（下が空く）。"""
    errs, warns = [], []
    x0, y0, W, H = vb
    ns = "{http://www.w3.org/2000/svg}"
    texts, segs, ink = [], [], []

    def addink(a, b, c, d):
        ink.append((min(a, c), min(b, d), max(a, c), max(b, d)))
    for el in root.iter():
        tag = el.tag.replace(ns, "")
        sw = _f(el, "stroke-width", 1.0)
        stroke = el.get("stroke", "none")
        nocheck = el.get("data-nocheck") == "1"
        if tag == "text":
            s = "".join(el.itertext())
            if not s.strip():
                continue
            size = _f(el, "font-size", 13)
            x, y = _f(el, "x"), _f(el, "y")
            wd = text_width(s, size)
            anc = el.get("text-anchor", "start")
            tx0 = x - wd / 2 if anc == "middle" else (x - wd if anc == "end" else x)
            box = (tx0 + 0.5, y - size * 0.86, tx0 + wd - 0.5, y + size * 0.1)
            texts.append((box, s, el.get("data-bg") == "1"))
            addink(*box)
        elif tag == "line":
            seg = (_f(el, "x1"), _f(el, "y1"), _f(el, "x2"), _f(el, "y2"), sw)
            if not nocheck and stroke != "none":
                segs.append(seg)
            addink(seg[0], seg[1], seg[2], seg[3])
        elif tag == "rect":
            if el.get("width", "").endswith("%"):
                continue
            rx, ry, rw, rh = _f(el, "x"), _f(el, "y"), _f(el, "width"), _f(el, "height")
            fill = el.get("fill", "#000")
            if stroke != "none" and sw > 0 and not nocheck:
                segs += [(rx, ry, rx + rw, ry, sw), (rx + rw, ry, rx + rw, ry + rh, sw), (rx, ry + rh, rx + rw, ry + rh, sw), (rx, ry, rx, ry + rh, sw)]
            if stroke != "none" or fill.lower() not in ("#fff", "#ffffff", "white", "none"):
                addink(rx, ry, rx + rw, ry + rh)
        elif tag in ("polygon", "polyline"):
            pts = [tuple(float(v) for v in p.split(",")) for p in el.get("points", "").split() if "," in p]
            if not pts:
                continue
            ring = pts + ([pts[0]] if tag == "polygon" else [])
            w_ = sw if stroke != "none" else 0.6
            if not nocheck:
                segs += [(a[0], a[1], b[0], b[1], w_) for a, b in zip(ring, ring[1:])]
            addink(min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts))
        elif tag in ("circle", "ellipse"):
            cx, cy = _f(el, "cx"), _f(el, "cy")
            rx_ = _f(el, "r") if tag == "circle" else _f(el, "rx")
            ry_ = _f(el, "r") if tag == "circle" else _f(el, "ry")
            addink(cx - rx_, cy - ry_, cx + rx_, cy + ry_)
            if tag == "ellipse" and stroke != "none" and not nocheck:   # 楕円の縁を 24 辺で近似（字が縁からはみ出すのを見る）
                P = [(cx + rx_ * math.cos(2 * math.pi * k / 24), cy + ry_ * math.sin(2 * math.pi * k / 24)) for k in range(25)]
                segs += [(a[0], a[1], b[0], b[1], sw) for a, b in zip(P, P[1:])]
    for i, (a, s, _) in enumerate(texts):
        if a[0] < x0 - 0.5 or a[2] > x0 + W + 0.5 or a[1] < y0 - 0.5 or a[3] > y0 + H + 0.5:
            errs.append("文字「%s」が図の外へ出る" % s[:12])
        for b, s2, _ in texts[i + 1:]:
            ox = min(a[2], b[2]) - max(a[0], b[0])
            oy = min(a[3], b[3]) - max(a[1], b[1])
            if ox > 0.8 and oy > 0.8:
                errs.append("文字「%s」と「%s」が重なる" % (s[:10], s2[:10]))
    for box, s, bg in texts:
        for g in segs:
            if bg and g[4] < 3:
                continue
            if _seg_hits_box(g, box):
                errs.append("文字「%s」に線・枠が掛かる%s" % (s[:12], "（太い線）" if g[4] >= 3 else ""))
                break
    kind = root.get("data-kind")
    if kind in ASPECT and W:
        lo, hi = ASPECT[kind]
        r = H / W
        if r < lo - 0.02 or r > hi + 0.02:
            warns.append("縦横比 %.2f が %s の範囲 %.2f〜%.2f の外" % (r, kind, lo, hi))
    if ink and H:
        top = min(b[1] for b in ink) - y0
        bot = y0 + H - max(b[3] for b in ink)
        if top > 0.15 * H or bot > 0.15 * H:
            warns.append("上下の余白（上 %.0f・下 %.0f）が図の高さ %.0f の 15%% を超える（間延び。高さを詰める）" % (top, bot, H))
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
