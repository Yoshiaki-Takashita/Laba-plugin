#!/usr/bin/env python3
"""図の記述（figure-spec）から、教科書の規則（灰の濃さだけ・平ら・細い罫）の SVG を書く。標準ライブラリだけ。

  python3 figure_svg.py figs.json out_dir [--word 図表]    図の id ごとに out_dir/<id>.svg
  python3 figure_svg.py note.gnoto out_dir                 .gnoto の page2.figs から

役目：①.gnoto に入れる前に、図を目で見る（PNG にして開く）②GNOTO が図を描けない環境（Word・プレビュー）への差し込み。
GNOTO は開くとき自分の描き手で描く（座標は書かない方式）ので、この SVG の座標は .gnoto には入らない。
教科書の個別の座標は測っていない（型の規則から描く）。角丸・矢じりの大きさは仮の値。
描く前に figure_check.py と同じ検査をし、誤りがあれば描かない。出た SVG は figure_check.py --svg で検査できる。
"""
import json
import math
import os
import re
import sys
from xml.sax.saxutils import escape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import figure_check  # noqa: E402

INK, DARK, MID, LIGHT, PALE, PAPER = "#222222", "#868686", "#c0c0c0", "#d8d8d8", "#efefef", "#ffffff"
FS = 13            # 図内の字（本文の 0.77〜0.9 倍の見当）
CW = FS * 1.0      # 和文 1 字の幅
FONT = "font-family=\"'Hiragino Mincho ProN','Yu Mincho','Noto Serif CJK JP',serif\""


def wrap(label, per):
    """箱の中は 1〜3 行。3 行を超えたら「…」で切る（GNOTO の dgWrap と同じ向き）。"""
    lines = [label[i:i + per] for i in range(0, len(label), per)] or [""]
    if len(lines) > 3:
        lines = lines[:3]
        lines[2] = lines[2][:-1] + "…"
    return lines


def tw(s):
    return sum(1.0 if ord(c) > 0x2e80 else 0.58 for c in s) * CW


class Svg:
    def __init__(self):
        self.b = []

    def add(self, s):
        self.b.append(s)

    def rect(self, x, y, w, h, fill=PAPER, stroke=INK, sw=1.2, rx=0, dash=None):
        d = ' stroke-dasharray="%s"' % dash if dash else ""
        self.add('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%s" fill="%s" stroke="%s" stroke-width="%s"%s/>' % (x, y, w, h, rx, fill, stroke, sw, d))

    def line(self, x1, y1, x2, y2, sw=1.2, color=INK, dash=None, head=False, tail=False):
        d = ' stroke-dasharray="%s"' % dash if dash else ""
        m = (' marker-end="url(#ah)"' if head else "") + (' marker-start="url(#at)"' if tail else "")
        self.add('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="%s"%s%s/>' % (x1, y1, x2, y2, color, sw, d, m))

    def text(self, x, y, s, anchor="middle", bold=False, size=FS, fill=INK):
        self.add('<text x="%.1f" y="%.1f" text-anchor="%s" font-size="%s" fill="%s"%s>%s</text>' % (x, y, anchor, size, fill, ' font-weight="bold"' if bold else "", escape(s)))

    def lines(self, cx, cy, lines, bold=False):
        n = len(lines)
        y0 = cy - (n - 1) * FS * 0.6 + FS * 0.35
        for i, ln in enumerate(lines):
            self.text(cx, y0 + i * FS * 1.2, ln, bold=bold)

    def doc(self, w, h, title):
        defs = ('<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="%s"/></marker>'
                '<marker id="at" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M10,0 L0,5 L10,10 z" fill="%s"/></marker></defs>' % (INK, INK))
        return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %.0f %.0f" width="%.0f" height="%.0f" %s>\n<title>%s</title>\n%s\n%s\n</svg>\n'
                % (w, h, w, h, FONT, escape(title), defs, "\n".join(self.b)))


def tag(s, f, word, W):
    """図表題の帯（fig-tag）：太い黒帯＋題＋細罫。戻り値＝帯の下の y。"""
    cap = f.get("caption", {})
    s.rect(12, 8, 80, 6, fill=INK, stroke=INK, sw=0)
    label = (word + " " + cap.get("no", "")).strip()
    s.text(100, 16, label + ("　" if label else "") + cap.get("title", ""), anchor="start", bold=True)
    s.line(12, 24, W - 12, 24, sw=0.8)
    return 32


def clip(cx, cy, w, h, tx, ty):
    """箱（中心 cx,cy・幅 w・高さ h）の縁と、中心から (tx,ty) への線の交点。"""
    dx, dy = tx - cx, ty - cy
    if dx == 0 and dy == 0:
        return cx, cy
    k = min((w / 2) / abs(dx) if dx else 1e9, (h / 2) / abs(dy) if dy else 1e9)
    return cx + dx * k, cy + dy * k


def layers(nodes, edges):
    """辺の向きの深さで層を決める（戻り辺は無視）。同じ層は入力の並び順。"""
    ids = [n["id"] for n in nodes]
    out = {i: [] for i in ids}
    for e in edges:
        out[e["from"]].append(e["to"])
    depth, state = {}, {}

    def visit(i, d):
        if state.get(i) == 1:
            return
        if depth.get(i, -1) >= d and state.get(i) == 2:
            return
        state[i] = 1
        depth[i] = max(depth.get(i, 0), d)
        for j in out[i]:
            if state.get(j) != 1:
                visit(j, d + 1)
        state[i] = 2
    indeg = {i: 0 for i in ids}
    for e in edges:
        indeg[e["to"]] += 1
    for i in ids:
        if indeg[i] == 0:
            visit(i, 0)
    for i in ids:
        depth.setdefault(i, 0)
    L = {}
    for i in ids:
        L.setdefault(depth[i], []).append(i)
    return [L[k] for k in sorted(L)]


def box_size(label, per=9):
    ln = wrap(label, per)
    return max(70, max(tw(x) for x in ln) + 22), len(ln) * FS * 1.2 + 16, ln


def draw_graph(s, f, ox, oy, W0, groups_bg=True, pict=False):
    nodes, edges = f["nodes"], f.get("edges", [])
    right = f.get("direction") == "right"
    Ls = layers(nodes, edges)
    byid = {n["id"]: n for n in nodes}
    sz = {n["id"]: box_size(n["label"]) for n in nodes}
    if pict:
        sz = {i: (max(90, v[0]), v[1] + 40, v[2]) for i, v in sz.items()}
    gx, gy = 40, 62
    pos = {}
    if not right:
        y = oy
        widths = []
        for L in Ls:
            hh = max(sz[i][1] for i in L)
            widths.append(sum(sz[i][0] for i in L) + gx * (len(L) - 1))
        Wd = max(max(widths), W0)
        for L, wl in zip(Ls, widths):
            hh = max(sz[i][1] for i in L)
            x = ox + (Wd - wl) / 2
            for i in L:
                pos[i] = (x + sz[i][0] / 2, y + hh / 2)
                x += sz[i][0] + gx
            y += hh + gy
        total_w, total_h = Wd, y - gy - oy
    else:
        x = ox
        hs = [sum(sz[i][1] for i in L) + gy * (len(L) - 1) for L in Ls]
        Hd = max(hs)
        for L, hl in zip(Ls, hs):
            ww = max(sz[i][0] for i in L)
            y = oy + (Hd - hl) / 2
            for i in L:
                pos[i] = (x + ww / 2, y + sz[i][1] / 2)
                y += sz[i][1] + gy
            x += ww + gx + 20
        total_w, total_h = x - gx - 20 - ox, Hd
    # グループの地ベタ（薄灰）
    for g in f.get("groups", []):
        mem = [i for i, n in byid.items() if n.get("group") == g["id"]]
        if not mem:
            continue
        x1 = min(pos[i][0] - sz[i][0] / 2 for i in mem) - 14
        x2 = max(pos[i][0] + sz[i][0] / 2 for i in mem) + 14
        y1 = min(pos[i][1] - sz[i][1] / 2 for i in mem) - 22
        y2 = max(pos[i][1] + sz[i][1] / 2 for i in mem) + 14
        s.rect(x1, y1, x2 - x1, y2 - y1, fill=PALE, stroke=MID, sw=0.8, rx=8)
        if g.get("label"):
            s.text(x1 + 8, y1 + 14, g["label"], anchor="start", bold=True, size=FS - 1)
    # 辺
    for e in edges:
        (ax, ay), (bx, by) = pos[e["from"]], pos[e["to"]]
        sa, sb = sz[e["from"]], sz[e["to"]]
        x1, y1 = clip(ax, ay, sa[0], sa[1], bx, by)
        x2, y2 = clip(bx, by, sb[0], sb[1], ax, ay)
        ln = e.get("line", "solid")
        head = e.get("head", "arrow")
        sw = {"thick": 7, "wedge": 3}.get(ln, 1.2)
        color = MID if ln == "thick" else (INK if ln not in ("wedge",) else "#787878")
        s.line(x1, y1, x2, y2, sw=sw, color=color, dash="5 4" if ln == "dashed" else None,
               head=head in ("arrow", "both") and ln != "thick", tail=head == "both" and ln != "thick")
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        if ln == "cancel":
            s.line(mx - 7, my - 7, mx + 7, my + 7, sw=1.6)
            s.line(mx - 7, my + 7, mx + 7, my - 7, sw=1.6)
        if e.get("label"):
            w = tw(e["label"]) + 8
            s.rect(mx - w / 2, my - 9, w, 17, fill=PAPER, stroke="none", sw=0)
            s.text(mx, my + 4, e["label"], size=FS - 1)
    # ノード
    for n in nodes:
        cx, cy = pos[n["id"]]
        w, h, ln = sz[n["id"]]
        tone = n.get("tone", "base")
        fill = {"base": PAPER, "key": LIGHT, "mute": PALE}[tone]
        sw = 2.4 if tone == "key" else 1.4
        shape = n.get("shape", "box")
        if pict:
            draw_pict(s, n.get("pict", "none"), cx, cy - h / 2 + 18)
            ln_cy = cy + 14
            s.lines(cx, ln_cy, ln, bold=tone == "key")
            continue
        if shape == "ellipse":
            s.add('<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="%s" stroke="%s" stroke-width="%s"/>' % (cx, cy, w / 2 + 6, h / 2 + 2, fill, INK, sw))
        else:
            s.rect(cx - w / 2, cy - h / 2, w, h, fill=fill, stroke=INK, sw=sw, rx=7 if shape == "round" else 0)
        s.lines(cx, cy, ln, bold=tone == "key")
    return total_w, total_h


def draw_pict(s, kind, cx, cy):
    if kind == "person":
        s.add('<circle cx="%.1f" cy="%.1f" r="6" fill="%s"/>' % (cx, cy - 8, DARK))
        s.add('<path d="M%.1f %.1f q0 -12 10 -12 q10 0 10 12 z" fill="%s"/>' % (cx - 10, cy + 12, DARK))
    elif kind == "building":
        s.rect(cx - 11, cy - 14, 22, 26, fill=PAPER, stroke=INK, sw=1.2)
        for dx in (-5, 3):
            for dy in (-9, -1, 7):
                s.rect(cx + dx - 1, cy + dy - 2, 4, 4, fill=LIGHT, stroke=INK, sw=0.6)
    elif kind == "land":
        s.add('<path d="M%.1f %.1f l8 -16 l24 0 l-8 16 z" fill="%s" stroke="%s" stroke-width="1.2"/>' % (cx - 16, cy + 8, LIGHT, INK))


def render_flow(f, word):
    s = Svg()
    W = 520
    y = tag(s, f, word, W)
    tw_, th_ = draw_graph(s, f, 24, y + 12, W - 48)
    W = max(W, tw_ + 48)
    H = y + 12 + th_ + 36
    if f.get("note"):
        s.text(14, H - 8, f["note"], anchor="start", size=FS - 2)
    return s.doc(W, H, f.get("caption", {}).get("title", "flow"))


def render_relation(f, word):
    s = Svg()
    nodes = f["nodes"]
    n = len(nodes)
    W = 520
    y = tag(s, f, word, W)
    cx, cy = W / 2, y + 150
    R = 118
    pos = {}
    for k, nd in enumerate(nodes):
        ang = -math.pi / 2 + 2 * math.pi * k / n
        pos[nd["id"]] = (cx + R * 1.3 * math.cos(ang), cy + R * math.sin(ang))
    for e in f["edges"]:
        (ax, ay), (bx, by) = pos[e["from"]], pos[e["to"]]
        ln = e.get("line", "solid")
        dx, dy = bx - ax, by - ay
        d = math.hypot(dx, dy) or 1
        ux, uy = dx / d, dy / d
        x1, y1, x2, y2 = ax + ux * 34, ay + uy * 34, bx - ux * 34, by - uy * 34
        head = e.get("head", "arrow")
        sw = {"thick": 9, "wedge": 3}.get(ln, 1.4)
        color = MID if ln == "thick" else INK
        s.line(x1, y1, x2, y2, sw=sw, color=color, dash="5 4" if ln == "dashed" else None, head=head in ("arrow", "both") and ln != "thick", tail=head == "both" and ln != "thick")
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        if ln == "cancel":
            s.line(mx - 7, my - 7, mx + 7, my + 7, sw=1.6)
            s.line(mx - 7, my + 7, mx + 7, my - 7, sw=1.6)
        if e.get("label"):
            w = tw(e["label"]) + 8
            s.rect(mx - w / 2, my - 9, w, 17, fill=PAPER, stroke="none", sw=0)
            s.text(mx, my + 4, e["label"], size=FS - 1)
    for nd in nodes:
        x, yy = pos[nd["id"]]
        draw_pict(s, nd.get("pict", "none"), x, yy - 4)
        s.text(x, yy + 26, nd["label"], bold=nd.get("tone") == "key")
    H = cy + R + 60
    if f.get("note"):
        s.text(14, H - 8, f["note"], anchor="start", size=FS - 2)
    return s.doc(W, H, f.get("caption", {}).get("title", "relation"))


def render_tree(f, word):
    s = Svg()
    nodes = f["nodes"]
    kids = {}
    root = None
    for n in nodes:
        if n.get("parent") is None:
            root = n["id"]
        else:
            kids.setdefault(n["parent"], []).append(n["id"])
    byid = {n["id"]: n for n in nodes}
    slot = [0]
    pos = {}
    BW, BH, GX, GY = 96, 34, 14, 56

    def lay(i, d):
        ch = kids.get(i, [])
        if not ch:
            x = slot[0] * (BW + GX)
            slot[0] += 1
        else:
            xs = [lay(c, d + 1) for c in ch]
            x = (xs[0] + xs[-1]) / 2
        pos[i] = (x + BW / 2, d * (BH + GY) + BH / 2)
        return x
    lay(root, 0)
    W = max(520, slot[0] * (BW + GX) + 40)
    y0 = tag(s, f, word, W) + 14
    ox = (W - slot[0] * (BW + GX) + GX) / 2
    style = f.get("treeStyle", "bracket")
    for i, ch in kids.items():
        px, py = pos[i]
        if style == "nested":
            continue
        ymid = py + BH / 2 + GY / 2
        s.line(ox + px, y0 + py + BH / 2, ox + px, y0 + ymid, sw=1)
        xs = [pos[c][0] for c in ch]
        s.line(ox + min(xs + [px]), y0 + ymid, ox + max(xs + [px]), y0 + ymid, sw=1)
        for c in ch:
            s.line(ox + pos[c][0], y0 + ymid, ox + pos[c][0], y0 + pos[c][1] - BH / 2, sw=1)
    for i, (px, py) in pos.items():
        n = byid[i]
        tone = n.get("tone", "base")
        fill = {"base": PAPER, "key": LIGHT, "mute": PALE}[tone]
        s.rect(ox + px - BW / 2, y0 + py - BH / 2, BW, BH, fill=fill, stroke=INK, sw=2.2 if tone == "key" else 1.2, rx=7 if style == "nested" else 0)
        s.lines(ox + px, y0 + py, wrap(n["label"], 6))
    H = y0 + max(p[1] for p in pos.values()) + BH + 24
    return s.doc(W, H, f.get("caption", {}).get("title", "tree"))


def render_table(f, word, matrix=False):
    s = Svg()
    head, rows = f["head"], f["rows"]
    cols = ([f.get("rowAxis", "") + "／" + f.get("colAxis", "")] if matrix else ([head[0]] if False else []))
    if matrix:
        hdr = [""] + head
    else:
        hdr = head
    ncol = len(hdr)
    cw = []
    for c in range(ncol):
        cells = [hdr[c]] + [r[c] for r in rows]
        cw.append(max(64, min(170, max(tw(x) for x in cells) + 20)))
    W = max(520, sum(cw) + 40)
    y0 = tag(s, f, word, W) + 10
    x0 = (W - sum(cw)) / 2
    rh = 30
    # 外枠
    s.rect(x0, y0, sum(cw), rh * (len(rows) + 1), fill=PAPER, stroke=INK, sw=1.6)
    s.rect(x0, y0, sum(cw), rh, fill=PALE, stroke=INK, sw=1.0)
    first_gray = matrix or f.get("rowHead", True)
    if first_gray:
        s.rect(x0, y0, cw[0], rh * (len(rows) + 1), fill=PALE, stroke=INK, sw=1.0)
    for r in range(1, len(rows) + 1):
        s.line(x0, y0 + r * rh, x0 + sum(cw), y0 + r * rh, sw=0.8, color="#787878")
    xx = x0
    for c in range(ncol):
        if c:
            s.line(xx, y0, xx, y0 + rh * (len(rows) + 1), sw=0.8, color="#787878")
        xx += cw[c]
    if matrix and f.get("corner", "diag") == "diag":
        s.line(x0, y0, x0 + cw[0], y0 + rh, sw=0.8)
        s.text(x0 + cw[0] - 6, y0 + 12, f.get("colAxis", ""), anchor="end", size=FS - 3)
        s.text(x0 + 6, y0 + rh - 5, f.get("rowAxis", ""), anchor="start", size=FS - 3)
    xx = x0
    for c in range(ncol):
        if hdr[c] and not (matrix and c == 0):
            s.text(xx + cw[c] / 2, y0 + 20, hdr[c], bold=True)
        for r, row in enumerate(rows, 1):
            s.text(xx + cw[c] / 2, y0 + r * rh + 20, row[c], bold=(c == 0 and first_gray))
        xx += cw[c]
    H = y0 + rh * (len(rows) + 1) + 30
    if f.get("note"):
        s.text(14, H - 8, f["note"], anchor="start", size=FS - 2)
    return s.doc(W, H, f.get("caption", {}).get("title", "table"))


def render_timeline(f, word):
    s = Svg()
    ev = f["events"]
    n = len(ev)
    W = max(520, n * 110 + 60)
    y0 = tag(s, f, word, W)
    ay = y0 + 110
    s.line(24, ay, W - 20, ay, sw=3, head=True)
    step = (W - 90) / max(1, n)
    for k, e in enumerate(ev):
        x = 50 + step * (k + 0.5)
        if e.get("to"):
            s.rect(x, ay - 6, step * 0.8, 12, fill=LIGHT, stroke=INK, sw=0.8)
        s.add('<circle cx="%.1f" cy="%.1f" r="5" fill="%s"/>' % (x, ay, INK))
        up = k % 2 == 0
        ty = ay - 30 if up else ay + 36
        s.line(x, ay + (-5 if up else 5), x, ay + (-22 if up else 22), sw=1)
        s.text(x, ty, e["when"] + ("〜" + e["to"] if e.get("to") else ""), bold=True)
        wl = wrap(e["what"], max(5, int(step / CW)))
        s.lines(x, (ty - 20 - (len(wl) - 1) * FS * 0.6) if up else ty + 20 + (len(wl) - 1) * FS * 0.6, wl)
    H = ay + 100
    return s.doc(W, H, f.get("caption", {}).get("title", "timeline"))


def render_concept(f, word):
    s = Svg()
    nodes, groups = f["nodes"], f.get("groups", [])
    gids = {g["id"] for g in groups}
    kids = {}
    top = []
    for n in nodes:
        g = n.get("group")
        if g and (g in gids or g in {x["id"] for x in nodes}):
            kids.setdefault(g, []).append(n["id"])
        else:
            top.append(n["id"])
    byid = {n["id"]: n for n in nodes}
    W = 520
    y0 = tag(s, f, word, W) + 10
    y = [y0]

    def block(i, x, w, depth):
        """i を描く。子があれば入れ子の枠。戻り値＝高さ。"""
        n = byid[i]
        ch = kids.get(i, [])
        lines = wrap(n["label"], 12)
        tone = n.get("tone", "base")
        fill = {"base": PAPER, "key": LIGHT, "mute": MID if depth == 0 else PALE}[tone]
        if not ch:
            h = len(lines) * FS * 1.2 + 14
            s.rect(x, y[0], w, h, fill=fill, stroke=INK, sw=1.2, rx=6)
            s.lines(x + w / 2, y[0] + h / 2, lines)
            y[0] += h
            return h
        top_y = y[0]
        idx = len(s.b)
        s.b.append("")  # 外枠の場所取り
        y[0] += 22
        for c in ch:
            block(c, x + 12, w - 24, depth + 1)
            y[0] += 10
        h = y[0] - top_y + 2
        s.b[idx] = '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="8" fill="%s" stroke="%s" stroke-width="1.2"/>' % (x, top_y, w, h, fill, INK)
        s.text(x + 10, top_y + 15, n["label"], anchor="start", bold=True)
        y[0] = top_y + h
        return h
    for i in top:
        block(i, 30, W - 60, 0)
        y[0] += 12
    H = y[0] + 14
    return s.doc(W, H, f.get("caption", {}).get("title", "concept"))


def render(f, word="図表"):
    k = f["kind"]
    if k == "flow":
        return render_flow(f, word)
    if k == "relation":
        return render_relation(f, word)
    if k == "tree":
        return render_tree(f, word)
    if k == "table":
        return render_table(f, word)
    if k == "matrix":
        return render_table(f, word, matrix=True)
    if k == "timeline":
        return render_timeline(f, word)
    if k == "concept":
        return render_concept(f, word)
    raise ValueError(k)


def main(argv=None):
    a = list(sys.argv[1:] if argv is None else argv)
    word = "図表"
    if "--word" in a:
        i = a.index("--word")
        word = a[i + 1]
        del a[i:i + 2]
    if len(a) != 2:
        print(__doc__)
        return 2
    figs, _ = figure_check.load_figs(a[0])
    os.makedirs(a[1], exist_ok=True)
    bad = 0
    for fid, f in figs.items():
        errs, warns = figure_check.check_fig(fid, f)
        for w in warns:
            print("警告:", w)
        if errs:
            for e in errs:
                print("誤り:", e)
            bad += 1
            continue
        out = os.path.join(a[1], fid + ".svg")
        open(out, "w", encoding="utf-8").write(render(f, word))
        e2, w2 = figure_check.svg_check(out)
        for w in w2:
            print("警告:", fid, w)
        for e in e2:
            print("誤り:", fid, e)
        bad += bool(e2)
        print("書いた:", out)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
