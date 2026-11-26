#!/usr/bin/env python3
"""図の記述（figure-spec）から、教科書の規則（灰の濃さだけ・平ら・細い罫）の SVG を書く。標準ライブラリだけ。

  python3 figure_svg.py figs.json out_dir [--word 図表]    図の id ごとに out_dir/<id>.svg
  python3 figure_svg.py note.gnoto out_dir                 .gnoto の page2.figs から

役目：①.gnoto に入れる前に、図を目で見る（PNG にして開く）②GNOTO が図を描けない環境（Word・プレビュー）への差し込み。
GNOTO は開くとき自分の描き手で描く（座標は書かない方式）ので、この SVG の座標は .gnoto には入らない。
教科書の個別の座標は測っていない（型の規則から描く）。角丸・矢じりの大きさは仮の値。
幅は 3 段（傍注 154・本文 600・張り出し 790。B1 の全面ページの測定を w1000 で）：表・マトリクス・compare は張り出し、他は本文幅。
描く前に figure_check.py と同じ検査をし、誤りがあれば描かない。描いた SVG は figure_check.py --svg の幾何の検査
（文字の重なり・はみ出し・文字に掛かる線・縦横比・上下の余白）も通す。白地の札のある文字は data-bg="1"、取消線は data-nocheck="1" の印を持つ。
"""
import json
import math
import os
import sys
from xml.sax.saxutils import escape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import figure_check  # noqa: E402

INK, DARK, MID, WEDGE, LIGHT, PALE, PAPER = "#222222", "#868686", "#c0c0c0", "#787878", "#d8d8d8", "#efefef", "#ffffff"
FS = 13            # 図内の字（本文の 0.77〜0.9 倍の見当）
CW = FS * 1.0      # 和文 1 字の幅
FONT = "font-family=\"'Hiragino Sans','Yu Gothic','Noto Sans CJK JP','IPAGothic',sans-serif\""
WIDTH = {"side": 154, "text": 600, "wide": 790, "page": 790}
DEFAULT_WIDE = {"table", "matrix", "compare"}


def fig_width(f):
    w = f.get("width")
    if w in WIDTH:
        return WIDTH[w]
    if f["kind"] in DEFAULT_WIDE or (f["kind"] == "timeline" and len(f.get("events", [])) >= 6):
        return WIDTH["wide"]
    return WIDTH["text"]


def wrap(label, per):
    """箱の中は 1〜3 行。3 行を超えたら「…」で切る（GNOTO の dgWrap と同じ向き）。"""
    per = max(2, int(per))
    lines = [label[i:i + per] for i in range(0, len(label), per)] or [""]
    if len(lines) > 3:
        lines = lines[:3]
        lines[2] = lines[2][:-1] + "…"
    return lines


def tw(s, size=FS):
    return figure_check.text_width(str(s), size)


class Svg:
    def __init__(self):
        self.b = []

    def add(self, s):
        self.b.append(s)

    def rect(self, x, y, w, h, fill=PAPER, stroke=INK, sw=1.2, rx=0, dash=None, extra=""):
        d = ' stroke-dasharray="%s"' % dash if dash else ""
        self.add('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%s" fill="%s" stroke="%s" stroke-width="%s"%s%s/>' % (x, y, w, h, rx, fill, stroke, sw, d, extra))

    def line(self, x1, y1, x2, y2, sw=1.2, color=INK, dash=None, head=False, tail=False, nocheck=False):
        d = ' stroke-dasharray="%s"' % dash if dash else ""
        m = (' marker-end="url(#ah)"' if head else "") + (' marker-start="url(#at)"' if tail else "")
        nc = ' data-nocheck="1"' if nocheck else ""
        self.add('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="%s"%s%s%s/>' % (x1, y1, x2, y2, color, sw, d, m, nc))

    def poly(self, pts, fill=MID, stroke="none", sw=1.0, closed=True, dash=None):
        d = ' stroke-dasharray="%s"' % dash if dash else ""
        tag = "polygon" if closed else "polyline"
        self.add('<%s points="%s" fill="%s" stroke="%s" stroke-width="%s"%s/>' % (tag, " ".join("%.1f,%.1f" % p for p in pts), fill if closed else "none", stroke, sw, d))

    def circle(self, cx, cy, r, fill=INK, stroke="none", sw=1.0):
        self.add('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s" stroke="%s" stroke-width="%s"/>' % (cx, cy, r, fill, stroke, sw))

    def ellipse(self, cx, cy, rx, ry, fill=PAPER, stroke=INK, sw=1.0):
        self.add('<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="%s" stroke="%s" stroke-width="%s"/>' % (cx, cy, rx, ry, fill, stroke, sw))

    def text(self, x, y, s, anchor="middle", bold=False, size=FS, fill=INK, bg=False):
        s = str(s)
        if bg:
            w = tw(s, size)
            x0 = x - w / 2 if anchor == "middle" else (x - w if anchor == "end" else x)
            self.rect(x0 - 3, y - size * 0.95, w + 6, size * 1.25, fill=PAPER, stroke="none", sw=0)
        self.add('<text x="%.1f" y="%.1f" text-anchor="%s" font-size="%s" fill="%s"%s%s>%s</text>' % (
            x, y, anchor, size, fill, ' font-weight="bold"' if bold else "", ' data-bg="1"' if bg else "", escape(s)))

    def lines(self, cx, cy, lines, bold=False, size=FS):
        n = len(lines)
        lh = size * 1.2
        y0 = cy - (n - 1) * lh / 2 + size * 0.38
        for i, ln in enumerate(lines):
            self.text(cx, y0 + i * lh, ln, bold=bold, size=size)

    def doc(self, w, h, title, kind):
        defs = ('<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="%s"/></marker>'
                '<marker id="at" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="%s"/></marker></defs>' % (INK, INK))
        return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %.0f %.0f" width="%.0f" height="%.0f" data-kind="%s" %s>\n<title>%s</title>\n%s\n<rect width="100%%" height="100%%" fill="#ffffff"/>\n%s\n</svg>\n'
                % (w, h, w, h, kind, FONT, escape(title), defs, "\n".join(self.b)))


def tag(s, f, word, W):
    """図表題の帯（fig-tag）：太い黒帯＋題＋細罫［測・B1/B2］。戻り値＝帯の下の y。"""
    cap = f.get("caption", {})
    s.rect(0, 8, 70, 6, fill=INK, stroke="none", sw=0)
    label = (word + " " + cap.get("no", "")).strip()
    s.text(78, 17, label + ("　" if label else "") + cap.get("title", ""), anchor="start", bold=True)
    s.line(0, 25, W, 25, sw=0.8)
    return 38


def note(s, f, H, W):
    """図の下の注（出典・記号の意味）。戻り値＝新しい高さ。"""
    if not f.get("note"):
        return H
    s.text(2, H + 12, f["note"], anchor="start", size=FS - 2)
    return H + 18


def finish(s, f, W, H, kind):
    H = note(s, f, H, W)
    return s.doc(W, H + 4, f.get("caption", {}).get("title", kind), kind)


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


def edge_label(s, x1, y1, x2, y2, label, sw):
    """辺のラベル：細い線は中点に白地の札。太い線（保有・支配）は線の脇へずらす（札で太線を隠し切れない）。"""
    mx, my = (x1 + x2) / 2, (y1 + y2) / 2
    if sw < 3:
        s.text(mx, my + 4, label, size=FS - 1, bg=True)
        return
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy) or 1
    nx, ny = -dy / L, dx / L
    if ny > 0 or (abs(ny) < 1e-6 and nx < 0):
        nx, ny = -nx, -ny                       # 上（または右）へ出す
    w = tw(label, FS - 1)
    off = sw / 2 + 4 + abs(nx) * w / 2 + abs(ny) * (FS - 1) * 0.55
    s.text(mx + nx * off, my + ny * off + 4, label, size=FS - 1, bg=True)


def draw_graph(s, f, ox, oy, W0):
    nodes, edges = f["nodes"], f.get("edges", [])
    right = f.get("direction") == "right"
    Ls = layers(nodes, edges)
    byid = {n["id"]: n for n in nodes}
    sz = {n["id"]: box_size(n["label"]) for n in nodes}
    gx, gy = 40, 62
    pos = {}
    if not right:
        y = oy
        widths = [sum(sz[i][0] for i in L) + gx * (len(L) - 1) for L in Ls]
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
    for e in edges:
        (ax, ay), (bx, by) = pos[e["from"]], pos[e["to"]]
        sa, sb = sz[e["from"]], sz[e["to"]]
        x1, y1 = clip(ax, ay, sa[0] + 8, sa[1] + 6, bx, by)
        x2, y2 = clip(bx, by, sb[0] + 8, sb[1] + 6, ax, ay)
        ln = e.get("line", "solid")
        head = e.get("head", "arrow")
        sw = {"thick": 7, "wedge": 3}.get(ln, 1.2)
        color = MID if ln == "thick" else (WEDGE if ln == "wedge" else INK)
        s.line(x1, y1, x2, y2, sw=sw, color=color, dash="5 4" if ln == "dashed" else None,
               head=head in ("arrow", "both") and ln != "thick", tail=head == "both" and ln != "thick")
        if ln == "cancel":
            mx, my = (x1 + x2) / 2, (y1 + y2) / 2
            s.line(mx - 7, my - 7, mx + 7, my + 7, sw=1.6)
            s.line(mx - 7, my + 7, mx + 7, my - 7, sw=1.6)
        if e.get("label"):
            edge_label(s, x1, y1, x2, y2, e["label"], sw)
    for n in nodes:
        cx, cy = pos[n["id"]]
        w, h, ln = sz[n["id"]]
        tone = n.get("tone", "base")
        fill = {"base": PAPER, "key": LIGHT, "mute": PALE}[tone]
        sw = 2.4 if tone == "key" else 1.4
        shape = n.get("shape", "box")
        if shape == "ellipse":
            s.ellipse(cx, cy, w / 2 + 6, h / 2 + 2, fill=fill, sw=sw)
        else:
            s.rect(cx - w / 2, cy - h / 2, w, h, fill=fill, stroke=INK, sw=sw, rx=7 if shape == "round" else 0)
        s.lines(cx, cy, ln, bold=tone == "key")
    return total_w, total_h


def draw_pict(s, kind, cx, cy):
    """ピクト（中心 cx,cy・高さ約 24）。人＝濃灰［測：relation のピクトの 3 段のうち濃］。"""
    if kind == "person":
        s.circle(cx, cy - 6, 6.5, fill=DARK)
        s.poly([(cx - 11, cy + 13), (cx - 8, cy + 3), (cx + 8, cy + 3), (cx + 11, cy + 13)], fill=DARK)
    elif kind == "building":
        s.rect(cx - 11, cy - 12, 22, 25, fill=PAPER, stroke=INK, sw=1.2)
        for dx in (-5, 3):
            for dy in (-7, 1):
                s.rect(cx + dx - 1, cy + dy - 2, 4, 4, fill=LIGHT, stroke=INK, sw=0.6)
    elif kind == "land":
        s.poly([(cx - 16, cy + 8), (cx - 8, cy - 8), (cx + 16, cy - 8), (cx + 8, cy + 8)], fill=LIGHT, stroke=INK, sw=1.2)


def render_flow(f, word):
    s = Svg()
    W = fig_width(f)
    y = tag(s, f, word, W)
    tw_, th_ = draw_graph(s, f, 24, y + 8, W - 48)
    W = max(W, tw_ + 48)
    return finish(s, f, W, y + 8 + th_ + 8, "flow")


# ---------------- relation（当事者の間の関係）----------------
def party_box(n):
    """当事者の外接（幅・高さ）と、ラベルの位置（中心からの y）。ピクトは上・名前は下。ピクトなし＝細い黒の長方形［測：会社］。"""
    lw = tw(n["label"])
    if n.get("pict", "none") != "none":
        return max(34, lw + 6), 50
    return max(56, lw + 18), 28


def draw_party(s, n, cx, cy):
    w, h = party_box(n)
    key = n.get("tone") == "key"
    if n.get("pict", "none") != "none":
        draw_pict(s, n["pict"], cx, cy - 10)
        s.text(cx, cy + 20, n["label"], bold=key)
        return
    s.rect(cx - w / 2, cy - h / 2, w, h, fill=LIGHT if key else PAPER, stroke=INK, sw=2.0 if key else 1.0,
           dash="4 3" if n.get("gone") else None)
    s.text(cx, cy + 4.5, n["label"], bold=key)
    if n.get("gone"):        # 消える当事者＝点線の枠＋取消線［測：p062・p065］
        s.line(cx - w / 2 - 3, cy + h / 2, cx + w / 2 + 3, cy - h / 2, sw=1.0, nocheck=True)


def draw_rel_edges(s, edges, pos, box):
    pairs = {}
    for e in edges:
        pairs.setdefault(frozenset((e["from"], e["to"])), []).append(e)
    for e in edges:
        (ax, ay), (bx, by) = pos[e["from"]], pos[e["to"]]
        same = pairs[frozenset((e["from"], e["to"]))]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy) or 1
        off = 0.0
        if len(same) > 1:                       # 同じ 2 者の間の 2 本目は平行にずらす
            k = same.index(e)
            off = (k - (len(same) - 1) / 2) * 12
            if e["from"] > e["to"]:
                off = -off
        nx, ny = -dy / L * off, dx / L * off
        wa, ha = box[e["from"]]
        wb, hb = box[e["to"]]
        x1, y1 = clip(ax, ay, wa + 10, ha + 10, bx, by)
        x2, y2 = clip(bx, by, wb + 10, hb + 10, ax, ay)
        x1, y1, x2, y2 = x1 + nx, y1 + ny, x2 + nx, y2 + ny
        ln = e.get("line", "solid")
        head = e.get("head", "arrow")
        if ln == "wedge":       # 楔（#787878・太い方が from）［測：p062］
            ux, uy = -dy / L * 5, dx / L * 5
            s.poly([(x1 + ux, y1 + uy), (x1 - ux, y1 - uy), (x2, y2)], fill=WEDGE)
            sw = 3
        elif ln == "thick":     # 保有・支配＝太い灰線＋端の灰丸［測：太さ約 9・#c0c0c0］
            sw = 8
            s.line(x1, y1, x2, y2, sw=sw, color=MID)
            s.circle(x2, y2, 5.5, fill=MID)
        else:
            sw = 1.3
            s.line(x1, y1, x2, y2, sw=sw, dash="5 4" if ln == "dashed" else None,
                   head=head in ("arrow", "both"), tail=head == "both")
            if ln == "cancel":
                mx, my = (x1 + x2) / 2, (y1 + y2) / 2
                s.line(mx - 7, my - 7, mx + 7, my + 7, sw=1.6, nocheck=True)
                s.line(mx - 7, my + 7, mx + 7, my - 7, sw=1.6, nocheck=True)
        if e.get("label"):
            if off and sw < 3:                  # 平行な 2 本：札をそれぞれの外側へ（中点で重ねない）
                w = tw(e["label"], FS - 1)
                ux, uy = nx / abs(off), ny / abs(off)
                d = abs(ux) * (w / 2 + 6) + abs(uy) * (FS * 0.6 + 4)
                mx, my = (x1 + x2) / 2 + ux * d, (y1 + y2) / 2 + uy * d
                s.text(mx, my + 4, e["label"], size=FS - 1, bg=True)
            else:
                edge_label(s, x1, y1, x2, y2, e["label"], sw)


def render_relation(f, word):
    """当事者を楕円の上に置く。高さは当事者の数でなく、置いた位置の上下の幅で決める（下が空かない）。"""
    s = Svg()
    nodes = f["nodes"]
    n = len(nodes)
    W = fig_width(f)
    y = tag(s, f, word, W)
    box = {nd["id"]: party_box(nd) for nd in nodes}
    start = -90.0 if n % 2 else -90.0 + 180.0 / n
    angs = [math.radians(start + 360.0 * k / n) for k in range(n)]
    sins = [math.sin(a) for a in angs]
    span = max(sins) - min(sins) or 1
    maxh = max(b[1] for b in box.values())
    Ry = (0.50 * W - y - maxh - 26) / span if n > 2 else 0      # 縦の幅：全体の縦横比が 0.5 前後になるように
    Ry = max(Ry, 46 / span)
    Rx = W / 2 - max(b[0] for b in box.values()) / 2 - 30
    top = y + 14 + maxh / 2 - Ry * min(sins)
    pos = {nd["id"]: (W / 2 + Rx * math.cos(a), top + Ry * math.sin(a)) for nd, a in zip(nodes, angs)}
    draw_rel_edges(s, f["edges"], pos, box)
    for nd in nodes:
        draw_party(s, nd, *pos[nd["id"]])
    H = max(pos[i][1] + box[i][1] / 2 for i in pos) + 8
    return finish(s, f, W, H, "relation")


# ---------------- tree（4 つの描き方）----------------
def tree_parts(f):
    nodes = f["nodes"]
    kids, root = {}, None
    for nd in nodes:
        if nd.get("parent") is None:
            root = nd["id"]
        else:
            kids.setdefault(nd["parent"], []).append(nd["id"])
    return {nd["id"]: nd for nd in nodes}, kids, root


def render_tree(f, word):
    style = f.get("treeStyle", "bracket")
    if style == "nested":
        return render_tree_nested(f, word)
    if style == "region":
        return render_tree_region(f, word)
    return render_tree_rule(f, word, brace=style == "brace")


def render_tree_rule(f, word, brace=False):
    """bracket＝罫線の括り（L・コ字）／brace＝波括弧＋点線の引出線。どちらも箱を描かない（FIGURE-ANALYSIS 3：箱は nested だけ）。
    左から右へ：親の語 → 罫（または波括弧）→ 子の語を縦に並べる。"""
    s = Svg()
    byid, kids, root = tree_parts(f)
    W = fig_width(f)
    y0 = tag(s, f, word, W) + 6
    RH = 26
    depth = {}

    def dep(i, d):
        depth[i] = d
        for c in kids.get(i, []):
            dep(c, d + 1)
    dep(root, 0)
    nd_ = max(depth.values()) + 1
    colw = [0.0] * nd_
    for i, d in depth.items():
        colw[d] = max(colw[d], tw(byid[i]["label"], FS) + 2)
    gap = 46 if brace else 34
    xs = [0.0]
    for d in range(1, nd_):
        xs.append(xs[-1] + colw[d - 1] + gap)
    total_w = xs[-1] + colw[-1]
    ox = max(4, (W - total_w) / 2)
    ypos, slot = {}, [0]

    def lay(i):
        ch = kids.get(i, [])
        if not ch:
            ypos[i] = y0 + RH * slot[0] + RH / 2
            slot[0] += 1
        else:
            ys = [lay(c) for c in ch]
            ypos[i] = (ys[0] + ys[-1]) / 2
        return ypos[i]
    lay(root)
    for i, ch in kids.items():
        d = depth[i]
        px = ox + xs[d] + tw(byid[i]["label"]) + 6
        cx = ox + xs[d + 1] - 8
        py = ypos[i]
        ya, yb = ypos[ch[0]], ypos[ch[-1]]
        if brace:
            bx = cx - 6
            s.line(px, py, bx - 8, py, sw=0.9, dash="2 2", color="#555555")       # 点線の引出線
            if len(ch) == 1:
                s.line(bx - 8, py, cx, py, sw=1.0)
            else:
                t1, t2 = ya - 6, yb + 6
                mid = (t1 + t2) / 2
                s.add('<path d="M%.1f %.1f C%.1f %.1f %.1f %.1f %.1f %.1f L%.1f %.1f C%.1f %.1f %.1f %.1f %.1f %.1f '
                      'C%.1f %.1f %.1f %.1f %.1f %.1f L%.1f %.1f C%.1f %.1f %.1f %.1f %.1f %.1f" fill="none" stroke="%s" stroke-width="1.25"/>' % (
                          cx, t1, bx, t1, bx, t1, bx, t1 + 6, bx, mid - 6, bx, mid - 2, bx - 1, mid, bx - 8, mid,
                          bx - 1, mid, bx, mid + 2, bx, mid + 6, bx, t2 - 6, bx, t2, bx, t2, cx, t2, INK))
        else:
            vx = cx - 6
            s.line(px, py, vx, py, sw=1.0)
            s.line(vx, min(ya, py), vx, max(yb, py), sw=1.0)
            for c in ch:
                s.line(vx, ypos[c], cx, ypos[c], sw=1.0)
    for i, d in depth.items():
        nd = byid[i]
        s.text(ox + xs[d], ypos[i] + FS * 0.38, nd["label"], anchor="start", bold=(d == 0 or nd.get("tone") == "key"))
    H = y0 + RH * slot[0] + 2
    return finish(s, f, W, H, "tree")


def render_tree_nested(f, word):
    """nested＝角丸の入れ子：親の枠の中に子を横に並べる（入らなければ折り返す）。葉は白い角丸の箱。"""
    s = Svg()
    byid, kids, root = tree_parts(f)
    W = fig_width(f)
    y0 = tag(s, f, word, W) + 4
    PAD, GAP, HEAD = 10, 10, 22

    def measure(i, maxw):
        ch = kids.get(i, [])
        lab = byid[i]["label"]
        if not ch:
            ln = wrap(lab, max(4, int((maxw - 16) / FS)))
            w = min(maxw, max(64, max(tw(x) for x in ln) + 20))
            return {"id": i, "w": w, "h": len(ln) * FS * 1.2 + 14, "ln": ln, "rows": []}
        inner = maxw - 2 * PAD
        ms = [measure(c, inner) for c in ch]
        rows, cur, cw = [], [], 0
        for m in ms:
            if cur and cw + GAP + m["w"] > inner:
                rows.append(cur)
                cur, cw = [], 0
            cur.append(m)
            cw += (GAP if cw else 0) + m["w"]
        rows.append(cur)
        rw = max(sum(m["w"] for m in r) + GAP * (len(r) - 1) for r in rows)
        w = max(rw + 2 * PAD, tw(lab) + 2 * PAD + 4)
        h = HEAD + sum(max(m["h"] for m in r) for r in rows) + GAP * (len(rows) - 1) + PAD
        return {"id": i, "w": min(w, maxw), "h": h, "rows": rows}

    def draw(m, x, y, d):
        nd = byid[m["id"]]
        key = nd.get("tone") == "key"
        if not m["rows"]:
            s.rect(x, y, m["w"], m["h"], fill=LIGHT if key else PAPER, stroke=INK, sw=2.0 if key else 1.0, rx=6)
            s.lines(x + m["w"] / 2, y + m["h"] / 2, m["ln"], bold=key)
            return
        s.rect(x, y, m["w"], m["h"], fill=(MID, LIGHT, PALE)[min(d, 2)], stroke=INK, sw=1.0, rx=9)
        s.text(x + PAD, y + 16, nd["label"], anchor="start", bold=True)
        yy = y + HEAD
        for r in m["rows"]:
            rw = sum(c["w"] for c in r) + GAP * (len(r) - 1)
            xx = x + (m["w"] - rw) / 2
            for c in r:
                draw(c, xx, yy, d + 1)
                xx += c["w"] + GAP
            yy += max(c["h"] for c in r) + GAP
    m = measure(root, W - 4)
    draw(m, (W - m["w"]) / 2, y0, 0)
    return finish(s, f, W, y0 + m["h"] + 2, "tree")


def render_tree_region(f, word):
    """region＝領域区分：根は上の見出し、子は破線の枠＋灰ベタの領域を横に並べ、孫（とその下）は領域の中に字で並べる。"""
    s = Svg()
    byid, kids, root = tree_parts(f)
    W = fig_width(f)
    y = tag(s, f, word, W)
    s.text(W / 2, y + 12, byid[root]["label"], bold=True)
    ch = kids.get(root, [])
    n = max(1, len(ch))
    gap = 12
    cw = (W - gap * (n - 1)) / n
    per = max(3, int((cw - 20) / FS))

    def items(i, d, out):
        for c in kids.get(i, []):
            out.append(("・" if d == 0 else "　－") + byid[c]["label"])
            items(c, d + 1, out)
        return out
    cols = []
    for c in ch:
        lst = []
        for t in items(c, 0, []):
            lst += wrap(t, per)
        cols.append(lst)
    hmax = max([len(x) for x in cols] + [0])
    top = y + 24
    h = 30 + hmax * FS * 1.35 + 10
    for k, c in enumerate(ch):
        x = k * (cw + gap)
        s.rect(x + 0.5, top, cw - 1, h, fill=PALE, stroke="#555555", sw=1.0, dash="4 3")
        lab = byid[c]["label"]
        lw = min(cw - 12, tw(lab) + 16)
        s.rect(x + 6, top + 6, lw, 20, fill=DARK, stroke="none", sw=0)
        s.text(x + 6 + lw / 2, top + 20.5, lab, bold=True, fill=PAPER)
        for j, t in enumerate(cols[k]):
            s.text(x + 10, top + 30 + (j + 1) * FS * 1.35, t, anchor="start", size=FS - 0.5)
    return finish(s, f, W, top + h + 2, "tree")


# ---------------- table・matrix ----------------
def render_table(f, word, matrix=False):
    """張り出し幅（790）が既定。列の幅は中身の比で全幅に広げる。長いセルは列の中で折り返す（2〜3 行）。"""
    s = Svg()
    head, rows = f["head"], f["rows"]
    hdr = ([""] + head) if matrix else head
    ncol = len(hdr)
    W = fig_width(f)
    nat = []
    for c in range(ncol):
        cells = [hdr[c]] + [r[c] for r in rows if c < len(r)]
        nat.append(max(56, min(260, max(tw(x) for x in cells) + 22)))
    total = W - 2
    k = total / sum(nat)
    cw = [w * k for w in nat]
    y0 = tag(s, f, word, W) + 2
    x0 = 1
    first_gray = matrix or f.get("rowHead", True)

    def cell_lines(t, w):
        return wrap(t, max(2, int((w - 14) / FS))) if tw(t) > w - 14 else [t]
    grid = [[cell_lines(hdr[c], cw[c]) for c in range(ncol)]] + [[cell_lines(r[c] if c < len(r) else "", cw[c]) for c in range(ncol)] for r in rows]
    rh = [max(26, max(len(ls) for ls in row) * FS * 1.2 + 11) for row in grid]
    Ht = sum(rh)
    s.rect(x0, y0, total, Ht, fill=PAPER, stroke=INK, sw=1.4)
    s.rect(x0, y0, total, rh[0], fill=PALE, stroke="none", sw=0)
    if first_gray:
        s.rect(x0, y0 + rh[0], cw[0], Ht - rh[0], fill=PALE, stroke="none", sw=0)
    yy = y0
    for r in range(1, len(grid)):
        yy += rh[r - 1]
        s.line(x0, yy, x0 + total, yy, sw=0.8 if r > 1 else 1.0, color="#787878" if r > 1 else INK)
    xx = x0
    for c in range(1, ncol):
        xx += cw[c - 1]
        s.line(xx, y0, xx, y0 + Ht, sw=0.8, color="#787878")
    if matrix and f.get("corner", "diag") == "diag":
        s.line(x0, y0, x0 + cw[0], y0 + rh[0], sw=0.8)
        s.text(x0 + cw[0] - 5, y0 + 11, f.get("colAxis", ""), anchor="end", size=FS - 3)
        s.text(x0 + 5, y0 + rh[0] - 4, f.get("rowAxis", ""), anchor="start", size=FS - 3)
    yy = y0
    for r, row in enumerate(grid):
        xx = x0
        for c, ls in enumerate(row):
            if not (matrix and r == 0 and c == 0):
                s.lines(xx + cw[c] / 2, yy + rh[r] / 2, ls, bold=(r == 0 or (c == 0 and first_gray)))
            xx += cw[c]
        yy += rh[r]
    return finish(s, f, W, y0 + Ht + 2, "matrix" if matrix else "table")


# ---------------- timeline ----------------
def render_timeline(f, word):
    s = Svg()
    ev = f["events"]
    n = len(ev)
    W = fig_width(f)
    y0 = tag(s, f, word, W)
    step = (W - 60) / max(1, n)
    per = max(4, int((step * 1.7) / CW))     # 上下交互なので、隣の 2 倍近くまで使える
    wl = [wrap(e["what"], per) for e in ev]
    up_n = max([len(wl[k]) for k in range(0, n, 2)] + [1])
    dn_n = max([len(wl[k]) for k in range(1, n, 2)] + [0])
    lh = FS * 1.2
    ay = y0 + 30 + up_n * lh + 16
    s.line(6, ay, W - 6, ay, sw=3, head=True)
    for k, e in enumerate(ev):
        x = 30 + step * (k + 0.5)
        if e.get("to"):
            s.rect(x, ay - 6, step * 0.8, 12, fill=LIGHT, stroke=INK, sw=0.8)
        s.circle(x, ay, 5, fill=INK)
        up = k % 2 == 0
        s.line(x, ay + (-6 if up else 6), x, ay + (-16 if up else 16), sw=1)
        when = e["when"] + ("〜" + e["to"] if e.get("to") else "")
        if up:
            ty = ay - 22
            s.text(x, ty, when, bold=True)
            for j, t in enumerate(reversed(wl[k])):
                s.text(x, ty - lh * (j + 1), t)
        else:
            ty = ay + 32
            s.text(x, ty, when, bold=True)
            for j, t in enumerate(wl[k]):
                s.text(x, ty + lh * (j + 1), t)
    H = ay + 32 + dn_n * lh + 6 if n > 1 else ay + 10
    return finish(s, f, W, H, "timeline")


# ---------------- concept ----------------
def render_concept(f, word):
    s = Svg()
    nodes, groups = f["nodes"], f.get("groups", [])
    gids = {g["id"] for g in groups}
    kids, top = {}, []
    for n in nodes:
        g = n.get("group")
        if g and (g in gids or g in {x["id"] for x in nodes}):
            kids.setdefault(g, []).append(n["id"])
        else:
            top.append(n["id"])
    byid = {n["id"]: n for n in nodes}
    W = fig_width(f)
    y0 = tag(s, f, word, W)
    y = [y0]

    def block(i, x, w, depth):
        n = byid[i]
        ch = kids.get(i, [])
        lines = wrap(n["label"], max(4, int((w - 16) / FS)))
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
        s.b.append("")
        y[0] += 22
        for k, c in enumerate(ch):
            block(c, x + 12, w - 24, depth + 1)
            y[0] += 10
        h = y[0] - top_y + 2
        s.b[idx] = '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="8" fill="%s" stroke="%s" stroke-width="1.2"/>' % (x, top_y, w, h, fill, INK)
        s.text(x + 10, top_y + 15, n["label"], anchor="start", bold=True)
        y[0] = top_y + h
        return h
    for k, i in enumerate(top):
        if k:
            y[0] += 12
        block(i, 30, W - 60, 0)
    return finish(s, f, W, y[0] + 4, "concept")


# ---------------- compare（同じ部品で 2〜3 面を並べる：前／後・甲説／乙説）----------------
def render_compare(f, word):
    """面を等幅に並べ、全面で同じ当事者を同じ位置（slots）に置く。面の間に白抜きの矢印・点線の縦罫。面の中は relation の部品。"""
    s = Svg()
    W = fig_width(f)
    y = tag(s, f, word, W)
    panels = f["panels"]
    k = len(panels)
    gap = 36
    pw = (W - gap * (k - 1)) / k
    slots = f["slots"]
    rows = max(v[1] for v in slots.values()) + 1
    cols = max(v[0] for v in slots.values()) + 1
    allnodes = {}
    for p in panels:
        for nd in p["nodes"]:
            allnodes.setdefault(nd["id"], nd)
    RH = 66
    top = y + 26
    ph = 28 + rows * RH
    has_note = any(p.get("note") for p in panels)
    for i, p in enumerate(panels):
        x0 = i * (pw + gap)
        s.text(x0 + 2, y + 14, "【%s】" % p["title"], anchor="start", bold=True, size=FS - 0.5)
        box = {nd["id"]: party_box(nd) for nd in p["nodes"]}
        pos = {}
        for nd in p["nodes"]:
            c, r = slots[nd["id"]]
            pos[nd["id"]] = (x0 + pw * (c + 0.5) / cols, top + 24 + r * RH)
        draw_rel_edges(s, p.get("edges", []), pos, box)
        for nd in p["nodes"]:
            draw_party(s, nd, *pos[nd["id"]])
        if p.get("note"):
            s.text(x0 + pw / 2, top + ph - 2, p["note"], size=FS - 2)
        if i < k - 1:            # 面と面の間：白抜きの太い矢印（変化の向き）
            ax, ay = x0 + pw + 7, top + 24 + (rows - 1) * RH / 2
            s.poly([(ax, ay - 5), (ax + 11, ay - 5), (ax + 11, ay - 11), (ax + 22, ay), (ax + 11, ay + 11), (ax + 11, ay + 5), (ax, ay + 5)],
                   fill=PAPER, stroke=INK, sw=1.0)
    for i in range(1, k):
        xx = i * (pw + gap) - gap / 2
        s.line(xx, y + 2, xx, top + 24 + (rows - 1) * RH / 2 - 16, sw=0.8, dash="2 3", color="#9a9a9a")
        s.line(xx, top + 24 + (rows - 1) * RH / 2 + 16, xx, top + ph - (14 if has_note else 4), sw=0.8, dash="2 3", color="#9a9a9a")
    H = top + ph + (2 if has_note else -10)
    return finish(s, f, W, H, "compare")


# ---------------- chart（棒・折れ線・棒＋折れ線の 2 軸）----------------
def nice(hi):
    """目盛りの上端と間隔（1・2・2.5・5 の系列。目盛りは 4〜6 本）。"""
    if hi <= 0:
        return 1, 0.2
    e = 10 ** math.floor(math.log10(hi))
    for m in (1, 2, 2.5, 5, 10):
        step = m * e / 5
        top = math.ceil(hi / step - 1e-9) * step
        if top / step <= 6:
            return top, step
    return hi, hi / 5


def fmt(v):
    return ("%.6g" % v)


def render_chart(f, word):
    """格子なし・軸 2 本（右の軸は折れ線だけ）・凡例の箱を作らず系列名は線の端に［測：p047・p080］。
    棒の塗りは薄灰 → 濃灰 → 白の順、折れ線は 2 本目から破線と印を変える。縦横比 0.7 前後［測：0.67〜0.81］。"""
    s = Svg()
    W = fig_width(f)
    y = tag(s, f, word, W)
    cats = f["x"]["cats"]
    series = f["series"]
    unit = f.get("y", {}).get("unit", "")
    bars = [se for se in series if se["type"] == "bar"]
    lines = [se for se in series if se["type"] == "line"]
    Rser = [se for se in series if se.get("axis") == "right"]
    Lser = [se for se in series if se.get("axis", "left") != "right"]
    multi = len(series) > 1
    end_w = max([tw(se["label"], FS - 2) for se in lines] + [0]) if multi else 0
    left = 14 + max(tw(fmt(nice(max([v for se in Lser for v in se["values"] if v is not None] + [0]))[0]), FS - 2), tw("（%s）" % unit, FS - 2.5) / 2)
    right = (16 + 36) if Rser else (12 + (end_w + 10 if lines and multi else 0))
    pw = W - left - right
    top = y + 24 + (12 if f.get("marks") else 0)
    ph = 0.72 * W - (top + 26) - (18 if f.get("note") else 0)
    ltop, lstep = nice(max([v for se in Lser for v in se["values"] if v is not None] + [0]))
    rtop, rstep = nice(max([v for se in Rser for v in se["values"] if v is not None] + [0])) if Rser else (None, None)
    s.line(left, top + ph, left + pw, top + ph, sw=1.0)
    s.line(left, top - 4, left, top + ph, sw=1.0)
    v = 0.0
    while v <= ltop + 1e-9:
        yy = top + ph - ph * v / ltop
        s.line(left - 4, yy, left, yy, sw=1.0)
        s.text(left - 7, yy + 4, fmt(v), anchor="end", size=FS - 2)
        v += lstep
    if unit:
        s.text(left, top - 12, "（%s）" % unit, anchor="middle", size=FS - 2.5)
    if Rser:
        s.line(left + pw, top - 4, left + pw, top + ph, sw=1.0)
        v = 0.0
        while v <= rtop + 1e-9:
            yy = top + ph - ph * v / rtop
            s.line(left + pw, yy, left + pw + 4, yy, sw=1.0)
            s.text(left + pw + 7, yy + 4, fmt(v), anchor="start", size=FS - 2)
            v += rstep
        ru = f.get("y2", {}).get("unit", "")
        if ru:
            s.text(left + pw, top - 12, "（%s）" % ru, anchor="middle", size=FS - 2.5)
    n = len(cats)
    cw = pw / n
    csize = FS - 2 if max(tw(c, FS - 2) for c in cats) < cw - 4 else FS - 3.5
    for i, c in enumerate(cats):
        s.text(left + cw * (i + 0.5), top + ph + 16, c, size=csize)
    for m in f.get("marks", []):
        if m["at"] in cats:
            xx = left + cw * (cats.index(m["at"]) + 0.5)
            s.line(xx, top + 2, xx, top + ph, sw=0.9, dash="3 3", color="#555555")
            if m.get("label"):
                s.text(xx, top - 2, m["label"], size=FS - 2.5, bg=True)
    fills = [LIGHT, DARK, PAPER]
    nb = len(bars)
    if nb:
        bw = cw * 0.62 / nb
        for k, se in enumerate(bars):
            for i, val in enumerate(se["values"]):
                if val is None:
                    continue
                hh = ph * val / ltop
                x = left + cw * i + cw * 0.19 + bw * k
                s.rect(x, top + ph - hh, bw, hh, fill=fills[k % 3], stroke=INK, sw=0.8)
    ends = []
    for k, se in enumerate(lines):
        tp = rtop if se.get("axis") == "right" else ltop
        pts = [(left + cw * (i + 0.5), top + ph - ph * v / tp) for i, v in enumerate(se["values"]) if v is not None]
        s.poly(pts, stroke=INK, sw=1.4 if k == 0 else 1.1, closed=False, dash=None if k == 0 else "5 3")
        for (px, py) in pts:
            mk = k % 3
            if mk == 0:
                s.poly([(px, py - 4.5), (px + 4.5, py), (px, py + 4.5), (px - 4.5, py)], fill=INK)
            elif mk == 1:
                s.circle(px, py, 3.5, fill=PAPER, stroke=INK, sw=1.2)
            else:
                s.rect(px - 3.5, py - 3.5, 7, 7, fill=INK, stroke="none", sw=0)
        ends.append([pts[-1][0], pts[-1][1], se["label"], se.get("axis") == "right"])
    if multi:
        ends.sort(key=lambda e: e[1])
        for a, b in zip(ends, ends[1:]):           # 線の端の系列名が重ならないよう、上下に離す
            if b[1] - a[1] < FS + 2:
                b[1] = a[1] + FS + 2
        for px, py, lab, onright in ends:
            if onright:                          # 右の軸の目盛りと重ならないよう、点の左上へ
                s.text(px - 6, py - 9, lab, anchor="end", size=FS - 2, bg=True)
            else:
                s.text(px + 9, py + 4, lab, anchor="start", size=FS - 2, bg=True)
        for k, se in enumerate(bars):            # 棒の系列名は最初の棒の根元の中（折れ線の札・線と離す）
            val = next((v for v in se["values"] if v is not None), None)
            i = se["values"].index(val)
            x = left + cw * i + cw * 0.19 + bw * k + bw / 2
            if ph * val / ltop > FS + 10 and tw(se["label"], FS - 2.5) < bw - 4:
                s.text(x, top + ph - 7, se["label"], size=FS - 2.5, fill=PAPER if fills[k % 3] == DARK else INK)
            else:
                s.text(x, top + ph - ph * val / ltop - 5, se["label"], size=FS - 2.5, bg=True)
    return finish(s, f, W, top + ph + 24, "chart")


# ---------------- scale（1 本の軸の上の順序：強い〜弱い・広い〜狭い）----------------
def render_scale(f, word):
    """くさび（大→小）か濃淡の帯［測：p052・p015］。項目は軸の下に白い楕円で置き、重なれば軸の上（反対側）へ出す。
    位置 at は順序の印（値ではない）。"""
    s = Svg()
    W = fig_width(f)
    y = tag(s, f, word, W)
    lo, hi = f["ends"]
    items = sorted(f["items"], key=lambda t: t["at"])
    x0 = 24 + tw(lo, FS) + 14
    x1 = W - 24 - tw(hi, FS) - 14

    def geo(it):
        ls = [it["label"]] + ([it["sub"]] if it.get("sub") else [])
        w = max(tw(l) for l in ls) + 34
        h = 22 + FS * 1.25 * len(ls)
        return ls, w, h
    placed, row = [], {}
    for it in items:
        cx = x0 + 6 + (x1 - x0 - 12) * it["at"]
        ls, w, h = geo(it)
        r = 1 if any(abs(cx - px) < (w + pw_) / 2 + 8 and rr == 0 for px, pw_, rr in placed) else 0
        placed.append((cx, w, r))
        row[id(it)] = (cx, ls, w, h, r)
    hmax = max(v[3] for v in row.values())
    up = any(v[4] for v in row.values())
    lead = 30
    rest = y + 30 + 18 + 20 + hmax + 6 + (20 if f.get("axisLabel") else 0) + 4   # 項目が下だけのときの高さ（lead を除く）
    if not up:                                   # 縦横比が測定の下限 0.40 に届くまで引出線を伸ばす（90 まで）
        lead = max(30, min(90, 0.41 * W - rest))
    wy = y + 30 + (hmax + lead if up else 0) + 18
    if f.get("bar", "wedge") == "wedge":
        s.poly([(x0, wy - 18), (x1, wy - 2), (x1, wy + 2), (x0, wy + 18)], fill="#b9b9b9")
    else:
        nstep = 12
        for i in range(nstep):
            g = int(0xe8 - (0xe8 - 0x86) * i / (nstep - 1))
            s.rect(x0 + (x1 - x0) * i / nstep, wy - 11, (x1 - x0) / nstep + 0.5, 22, fill="#%02x%02x%02x" % (g, g, g), stroke="none", sw=0)
    s.text(x0 - 12, wy + 5, lo, anchor="end", bold=True)
    s.text(x1 + 12, wy + 5, hi, anchor="start", bold=True)
    by = wy + 20 + lead + hmax / 2
    for it in items:
        cx, ls, w, h, r = row[id(it)]
        key = it.get("tone") == "key"
        if r == 0:
            cy = wy + 20 + lead + h / 2
            s.line(cx, wy + 20, cx, cy - h / 2, sw=0.8, dash="2 2", color="#555555")
        else:
            cy = wy - 20 - lead - h / 2
            s.line(cx, wy - 20, cx, cy + h / 2, sw=0.8, dash="2 2", color="#555555")
        s.ellipse(cx, cy, w / 2, h / 2, fill=PALE if key else PAPER, sw=1.6 if key else 1.0)
        s.lines(cx, cy, ls, bold=key)
    H = by + hmax / 2 + 6
    if f.get("axisLabel"):
        s.text(W / 2, H + 14, f["axisLabel"], size=FS - 1.5)
        H += 20
    return finish(s, f, W, H, "scale")


RENDER = {"flow": render_flow, "relation": render_relation, "tree": render_tree, "table": render_table,
          "matrix": lambda f, w: render_table(f, w, matrix=True), "timeline": render_timeline, "concept": render_concept,
          "compare": render_compare, "chart": render_chart, "scale": render_scale}


def render(f, word="図表"):
    k = f["kind"]
    if k not in RENDER:
        raise ValueError(k)
    return RENDER[k](f, word)


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
