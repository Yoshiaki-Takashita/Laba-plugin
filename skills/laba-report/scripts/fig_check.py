#!/usr/bin/env python3
"""fig_check.py — 図（SVG、PNG は一部）の機械点検（laba-report）。標準ライブラリだけ。

使い方:
  python3 fig_check.py 図.svg [--width-mm 156] [--kind diagram|chart|map|ortho|process|flow] [--caption "図 1 …"] [--json]
  python3 fig_check.py 図.png [--width-mm 156] [--json]

規則は references/figures.md（研究ノート FIG-PRINCIPLES §5 の F01〜F22 と 研究ノート FIG-ARCHITECTURE §11 の AR-*）。数値はすべて「刷り上がりの大きさ」で測る：
v2.1（2026-10-23。伏せた比較の採点で見つかった図の癖）：F23 記号だけのラベル（A・D・E）・F24 枠の有無の不揃い（階層）・F25 流れを示す図に矢印が無い（--kind process か図題に 流れ・順序）・
  AR-L5 矢じりのある辺と矢じりの無い有彩色の実線の混在（関係の種類を混ぜない）・AR-N2／N3 図題に読み方の文が無い・述語の無い断片。PNG は文字の縁のぼかし（アンチエイリアス）の中間色を色として数えない（平らな所の画素だけ）。
  1 単位 = (width_mm ÷ 25.4 × 72) ÷ viewBox の幅 pt。
限界：XML を自前で解くので、CSS は <style> の単純な規則（.class・tag・#id・tag.class）と style="" と属性だけ。<use>・外部 CSS・
  getBBox 相当の正確な外接矩形（path の曲線）は近似。和文の文節の改行（BudouX）は見ない。所見は「直す候補」で、誤検知がある。
出力：{rule, severity, message, at} の配列（report_check.js と同じ形）。error があれば終了コード 1。
"""
import json
import math
import re
import struct
import sys
import xml.etree.ElementTree as ET
import zlib

# ---------------- 配色の定数（references/figures.md §2 と同じ） ----------------
INK = '#1A1A1A'        # 文字・枠・通常の線
CONTEXT_GRAY = '#8C9493'   # 文脈の線・面（文字には使わない）
ACCENT = '#943522'     # 強調（1 か所・1 色）
BAND = '#EEF1F0'       # 色帯（最大 1 つ）

# ---------------- 色の計算（WCAG 2.2・CIELAB D65・CIEDE2000・Machado 2009 の行列） ----------------
NAMED = {'black': '#000000', 'white': '#ffffff', 'red': '#ff0000', 'green': '#008000', 'blue': '#0000ff', 'gray': '#808080', 'grey': '#808080',
         'silver': '#c0c0c0', 'orange': '#ffa500', 'yellow': '#ffff00', 'purple': '#800080', 'navy': '#000080', 'teal': '#008080', 'lime': '#00ff00',
         'maroon': '#800000', 'olive': '#808000', 'aqua': '#00ffff', 'cyan': '#00ffff', 'magenta': '#ff00ff', 'fuchsia': '#ff00ff', 'brown': '#a52a2a',
         'darkgray': '#a9a9a9', 'darkgrey': '#a9a9a9', 'lightgray': '#d3d3d3', 'lightgrey': '#d3d3d3', 'dimgray': '#696969', 'gold': '#ffd700', 'pink': '#ffc0cb'}


def parse_color(s):
    """'#rgb' '#rrggbb' 'rgb(r,g,b)' 名前 → (r,g,b) 0〜255。none・transparent・url(...)・currentColor → None"""
    if s is None:
        return None
    s = s.strip().lower()
    if s in ('', 'none', 'transparent') or s.startswith('url('):
        return None
    if s == 'currentcolor':
        return (0, 0, 0)
    if s in NAMED:
        s = NAMED[s]
    m = re.match(r'^#([0-9a-f]{3})$', s)
    if m:
        return tuple(int(c * 2, 16) for c in m.group(1))
    m = re.match(r'^#([0-9a-f]{6})(?:[0-9a-f]{2})?$', s)
    if m:
        h = m.group(1)
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
    m = re.match(r'^rgba?\(\s*([0-9.]+%?)\s*,\s*([0-9.]+%?)\s*,\s*([0-9.]+%?)', s)
    if m:
        def v(x):
            return round(float(x[:-1]) * 2.55) if x.endswith('%') else round(float(x))
        return (v(m.group(1)), v(m.group(2)), v(m.group(3)))
    return None


def lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(rgb):
    r, g, b = (lin(x) for x in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def to_lab(rgb):
    r, g, b = (lin(x) for x in rgb)
    x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047
    y = (0.2126729 * r + 0.7151522 * g + 0.0721750 * b) / 1.0
    z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883

    def f(t):
        return t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    fx, fy, fz = f(x), f(y), f(z)
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))


def chroma(lab):
    return math.hypot(lab[1], lab[2])


def hue_deg(lab):
    h = math.degrees(math.atan2(lab[2], lab[1]))
    return h + 360 if h < 0 else h


def de2000(lab1, lab2):
    L1, a1, b1 = lab1
    L2, a2, b2 = lab2
    C1, C2 = math.hypot(a1, b1), math.hypot(a2, b2)
    Cm = (C1 + C2) / 2
    G = 0.5 * (1 - math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)))
    a1p, a2p = (1 + G) * a1, (1 + G) * a2
    C1p, C2p = math.hypot(a1p, b1), math.hypot(a2p, b2)

    def hp(a, b):
        if a == 0 and b == 0:
            return 0.0
        h = math.degrees(math.atan2(b, a))
        return h + 360 if h < 0 else h
    h1p, h2p = hp(a1p, b1), hp(a2p, b2)
    dLp = L2 - L1
    dCp = C2p - C1p
    if C1p * C2p == 0:
        dhp = 0.0
    else:
        dh = h2p - h1p
        if dh > 180:
            dh -= 360
        elif dh < -180:
            dh += 360
        dhp = dh
    dHp = 2 * math.sqrt(C1p * C2p) * math.sin(math.radians(dhp / 2))
    Lpm = (L1 + L2) / 2
    Cpm = (C1p + C2p) / 2
    if C1p * C2p == 0:
        hpm = h1p + h2p
    else:
        s = h1p + h2p
        if abs(h1p - h2p) > 180:
            hpm = (s + 360) / 2 if s < 360 else (s - 360) / 2
        else:
            hpm = s / 2
    T = 1 - 0.17 * math.cos(math.radians(hpm - 30)) + 0.24 * math.cos(math.radians(2 * hpm)) + 0.32 * math.cos(math.radians(3 * hpm + 6)) - 0.20 * math.cos(math.radians(4 * hpm - 63))
    dTheta = 30 * math.exp(-((hpm - 275) / 25) ** 2)
    Rc = 2 * math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7))
    Sl = 1 + 0.015 * (Lpm - 50) ** 2 / math.sqrt(20 + (Lpm - 50) ** 2)
    Sc = 1 + 0.045 * Cpm
    Sh = 1 + 0.015 * Cpm * T
    Rt = -math.sin(math.radians(2 * dTheta)) * Rc
    return math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh))


CVD = {  # Machado ほか (2009) 重さ 1.0。線形 sRGB にかける（研究ノート FIG-PRINCIPLES §5-4）
    'protan': [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    'deutan': [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
    'tritan': [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
}


def simulate(rgb, kind):
    l = [lin(x) for x in rgb]
    M = CVD[kind]
    out = []
    for row in M:
        v = sum(row[i] * l[i] for i in range(3))
        v = min(1.0, max(0.0, v))
        s = 12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055
        out.append(round(s * 255))
    return tuple(out)


def hexs(rgb):
    return '#%02X%02X%02X' % rgb


# ---------------- SVG の読み取り ----------------
NS = '{http://www.w3.org/2000/svg}'
INHERIT = ('fill', 'stroke', 'stroke-width', 'font-size', 'font-family', 'font-weight', 'font-style', 'opacity', 'fill-opacity', 'stroke-opacity', 'stroke-dasharray', 'color')


def tag_of(e):
    return e.tag.split('}')[-1] if isinstance(e.tag, str) else ''


def parse_css(text):
    rules = []
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    for sel, body in re.findall(r'([^{}]+)\{([^{}]*)\}', text):
        props = {}
        for item in body.split(';'):
            if ':' in item:
                k, v = item.split(':', 1)
                props[k.strip().lower()] = v.strip().replace('!important', '').strip()
        for s in sel.split(','):
            s = s.strip()
            if s:
                rules.append((s, props))
    return rules


def css_match(sel, e):
    """単純なセレクタ：tag・.class・#id・tag.class・tag#id。空白（子孫）は最後の要素だけ見る"""
    sel = sel.split()[-1] if sel.strip() else ''
    m = re.match(r'^([a-zA-Z]*)((?:[.#][\w-]+)*)$', sel)
    if not m:
        return False
    tag, rest = m.group(1), m.group(2)
    if tag and tag != tag_of(e):
        return False
    classes = set((e.get('class') or '').split())
    for part in re.findall(r'[.#][\w-]+', rest):
        if part[0] == '.' and part[1:] not in classes:
            return False
        if part[0] == '#' and e.get('id') != part[1:]:
            return False
    return True


def parse_transform(t):
    """transform 属性 → 2×2 の拡大率 s=sqrt(|det|) と、回転角（度）の近似、skew の有無"""
    s, rot, skew = 1.0, 0.0, False
    for name, args in re.findall(r'(matrix|scale|rotate|skewX|skewY|translate)\s*\(([^)]*)\)', t or ''):
        nums = [float(x) for x in re.findall(r'-?[0-9.]+(?:e-?[0-9]+)?', args)]
        if name == 'matrix' and len(nums) >= 4:
            a, b, c, d = nums[:4]
            s *= math.sqrt(abs(a * d - b * c))
            rot += math.degrees(math.atan2(b, a))
            if abs(a * c + b * d) > 1e-6 and abs(abs(a * d - b * c) - (a * a + b * b)) > 1e-3:
                skew = True
        elif name == 'scale' and nums:
            sx = nums[0]
            sy = nums[1] if len(nums) > 1 else sx
            s *= math.sqrt(abs(sx * sy))
        elif name == 'rotate' and nums:
            rot += nums[0]
        elif name in ('skewX', 'skewY') and nums and abs(nums[0]) > 0.5:
            skew = True
    return s, rot, skew


def num(v, default=0.0):
    try:
        return float(re.match(r'^\s*(-?[0-9.]+(?:e-?[0-9]+)?)', str(v)).group(1))
    except Exception:
        return default


def path_points(d):
    """path の d から座標の列（絶対座標の近似。相対コマンドは累積）と、コマンドの種類の集合を返す"""
    pts, cmds = [], set()
    cur = [0.0, 0.0]
    start = [0.0, 0.0]
    for cmd, args in re.findall(r'([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)', d or ''):
        cmds.add(cmd.upper())
        nums = [float(x) for x in re.findall(r'-?[0-9.]+(?:e-?[0-9]+)?', args)]
        rel = cmd.islower()
        c = cmd.upper()
        if c == 'Z':
            cur = list(start)
            continue
        if c in 'ML':
            for i in range(0, len(nums) - 1, 2):
                x, y = nums[i], nums[i + 1]
                if rel:
                    x += cur[0]
                    y += cur[1]
                cur = [x, y]
                pts.append((x, y))
                if c == 'M' and i == 0:
                    start = list(cur)
        elif c == 'H':
            for x in nums:
                cur = [x + cur[0] if rel else x, cur[1]]
                pts.append(tuple(cur))
        elif c == 'V':
            for y in nums:
                cur = [cur[0], y + cur[1] if rel else y]
                pts.append(tuple(cur))
        elif c in 'CSQT':
            step = {'C': 6, 'S': 4, 'Q': 4, 'T': 2}[c]
            for i in range(0, len(nums) - step + 1, step):
                x, y = nums[i + step - 2], nums[i + step - 1]
                if rel:
                    x += cur[0]
                    y += cur[1]
                cur = [x, y]
                pts.append((x, y))
        elif c == 'A':
            for i in range(0, len(nums) - 6, 7):
                x, y = nums[i + 5], nums[i + 6]
                if rel:
                    x += cur[0]
                    y += cur[1]
                cur = [x, y]
                pts.append((x, y))
    return pts, cmds


def poly_len(pts):
    return sum(math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) for i in range(1, len(pts)))


HINSOKU = set('、。，．）」』】〕〉》」ー・ゃゅょっャュョッ々゛゜!?！？:;：；')
EMOJI = re.compile('[\U0001F300-\U0001FAFF☀-➿⭐⭕‼⁉]')
UNITS = re.compile(r'^(?:%|％|mm|cm|m|km|kg|g|pt|px|円|年|月|日|件|人|件|回|倍|頁|％|度|℃|万|億)')


def fw(s):
    """全角 1・半角 0.5 で数えた字幅"""
    return sum(1.0 if ord(ch) > 0xFF else 0.5 for ch in s)


class Fig:
    def __init__(self, path, width_mm=156.0, kind='diagram', caption=None):
        self.path = path
        self.width_mm = width_mm
        self.kind = kind
        self.caption = caption
        self.findings = []
        self.stats = {}

    def add(self, rule, severity, message, at=''):
        self.findings.append({'rule': rule, 'severity': severity, 'message': message, 'at': str(at)[:80]})

    # ---------- SVG ----------
    def check_svg(self):
        root = ET.parse(self.path).getroot()
        vb = root.get('viewBox')
        if vb:
            nums = [float(x) for x in re.findall(r'-?[0-9.]+', vb)]
            vx, vy, vw, vh = nums[:4]
        else:
            vx, vy, vw, vh = 0.0, 0.0, num(root.get('width'), 1000.0), num(root.get('height'), 600.0)
        self.vw, self.vh = vw, vh
        k = (self.width_mm / 25.4 * 72.0) / vw
        self.k = k
        self.stats.update({'viewBox': [vx, vy, vw, vh], 'unit_pt': round(k, 4), 'aspect': round(vw / vh, 2) if vh else None})
        css = []
        for st in root.iter(NS + 'style'):
            css += parse_css(st.text or '')
        defs = {}
        for e in root.iter():
            if e.get('id'):
                defs[e.get('id')] = e
        # 影・グラデーションの定義
        shadow_ids = set()
        for f in root.iter(NS + 'filter'):
            kinds = {tag_of(c) for c in f.iter()}
            if 'feDropShadow' in kinds or ('feGaussianBlur' in kinds and 'feOffset' in kinds):
                shadow_ids.add(f.get('id'))
        grad_ids = {g.get('id'): g for g in root.iter() if tag_of(g) in ('linearGradient', 'radialGradient', 'meshgradient')}
        # 要素ごとの計算後の値
        self.elems = []
        self._walk(root, {}, 1.0, 0.0, False, css, shadow_ids, grad_ids)
        self._checks(shadow_ids, grad_ids)

    def _style_of(self, e, inherited, css):
        st = dict(inherited)
        for k in INHERIT:
            if e.get(k) is not None:
                st[k] = e.get(k)
        for sel, props in css:
            if css_match(sel, e):
                for k, v in props.items():
                    st[k] = v
        inline = e.get('style')
        if inline:
            for item in inline.split(';'):
                if ':' in item:
                    kk, vv = item.split(':', 1)
                    st[kk.strip().lower()] = vv.strip()
        return st

    def _walk(self, e, inherited, scale, rot, skew, css, shadow_ids, grad_ids):
        t = tag_of(e)
        if t in ('defs', 'style', 'metadata', 'title', 'desc', 'clipPath', 'mask', 'marker', 'pattern', 'symbol', 'linearGradient', 'radialGradient', 'filter'):
            return
        st = self._style_of(e, inherited, css)
        s2, r2, sk2 = parse_transform(e.get('transform'))
        scale, rot, skew = scale * s2, rot + r2, skew or sk2
        rec = {'tag': t, 'e': e, 'st': st, 'scale': scale, 'rot': rot % 360, 'skew': skew, 'id': e.get('id') or '', 'class': e.get('class') or ''}
        if t in ('rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text', 'image', 'use'):
            self.elems.append(rec)
        for c in list(e):
            self._walk(c, st, scale, rot, skew, css, shadow_ids, grad_ids)

    def _bbox(self, r):
        e, t, s = r['e'], r['tag'], r['scale']
        if t == 'rect':
            x, y, w, h = num(e.get('x')), num(e.get('y')), num(e.get('width')), num(e.get('height'))
            return (x, y, x + w, y + h)
        if t == 'circle':
            cx, cy, rr = num(e.get('cx')), num(e.get('cy')), num(e.get('r'))
            return (cx - rr, cy - rr, cx + rr, cy + rr)
        if t == 'ellipse':
            cx, cy, rx, ry = num(e.get('cx')), num(e.get('cy')), num(e.get('rx')), num(e.get('ry'))
            return (cx - rx, cy - ry, cx + rx, cy + ry)
        if t == 'line':
            x1, y1, x2, y2 = num(e.get('x1')), num(e.get('y1')), num(e.get('x2')), num(e.get('y2'))
            return (min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2))
        if t in ('polyline', 'polygon'):
            nums = [float(x) for x in re.findall(r'-?[0-9.]+', e.get('points') or '')]
            xs, ys = nums[0::2], nums[1::2]
            if xs and ys:
                return (min(xs), min(ys), max(xs), max(ys))
        if t == 'path':
            pts, _ = path_points(e.get('d'))
            if pts:
                xs, ys = [p[0] for p in pts], [p[1] for p in pts]
                return (min(xs), min(ys), max(xs), max(ys))
        if t == 'text':
            return self._text_bbox(r)
        if t == 'image':
            x, y, w, h = num(e.get('x')), num(e.get('y')), num(e.get('width')), num(e.get('height'))
            return (x, y, x + w, y + h)
        return None

    def _text_lines(self, r):
        """text 要素の行：[(x, y, 文字列)]（tspan の x/y で行を分ける）"""
        e = r['e']
        x0, y0 = num(e.get('x')), num(e.get('y'))
        lines = []
        head = (e.text or '').strip()
        if head:
            lines.append((x0, y0, head))
        for ts in e.iter(NS + 'tspan'):
            txt = ''.join(ts.itertext()).strip()
            if not txt:
                continue
            tx = num(ts.get('x'), lines[-1][0] if lines else x0)
            if ts.get('y') is not None:
                ty = num(ts.get('y'))
            elif ts.get('dy') is not None:
                ty = (lines[-1][1] if lines else y0) + num(ts.get('dy'))
            else:
                ty = lines[-1][1] if lines else y0
            lines.append((tx, ty, txt))
        if not lines:
            whole = ''.join(e.itertext()).strip()
            if whole:
                lines.append((x0, y0, whole))
        return lines

    def _font_size(self, r):
        fs = r['st'].get('font-size', '16')
        v = num(fs, 16.0)
        if str(fs).strip().endswith('pt'):
            v = v * 96 / 72
        return v  # 単位

    def _text_bbox(self, r):
        lines = self._text_lines(r)
        if not lines:
            return None
        fs = self._font_size(r)
        anchor = r['st'].get('text-anchor', 'start')
        xs, ys = [], []
        for x, y, txt in lines:
            w = fw(txt) * fs
            if anchor == 'middle':
                x -= w / 2
            elif anchor == 'end':
                x -= w
            xs += [x, x + w]
            ys += [y - fs * 0.8, y + fs * 0.2]
        return (min(xs), min(ys), max(xs), max(ys))

    def _checks(self, shadow_ids, grad_ids):
        k = self.k
        A = self.vw * self.vh
        fills, strokes, colors_all = [], [], []
        stroke_w, dash_kinds, font_sizes, families, weights = [], set(), [], set(), set()
        chroma_area = 0.0
        filled_area = 0.0
        texts = []
        shapes_kind = set()
        rounded, pills, shadows, grads, semi, emoji, icon_circle = 0, 0, 0, 0, 0, 0, 0
        marker_edges, edges = 0, 0
        arc_paths = []
        light_bands = 0
        edge_recs = []      # (矢じりあり, 有彩色, 破線) — 流れと対応関係の混在（AR-L5）
        arrow_paths = 0     # marker を使わず path／polygon で描いた小さな三角の矢じり
        boxes = []          # 見える枠（rect。背景を除く）— 階層のそろい（F24）
        for r in self.elems:
            e, t, st, s = r['e'], r['tag'], r['st'], r['scale']
            op = num(st.get('opacity', '1'), 1.0)
            if st.get('visibility') == 'hidden' or st.get('display') == 'none' or op == 0:
                continue
            fill = st.get('fill', 'black' if t != 'text' else INK)
            stroke = st.get('stroke', 'none')
            if t in ('line', 'polyline'):
                fill = 'none'
            fop, sop = num(st.get('fill-opacity', '1'), 1.0) * op, num(st.get('stroke-opacity', '1'), 1.0) * op
            bb = self._bbox(r)
            area = (bb[2] - bb[0]) * (bb[3] - bb[1]) if bb else 0.0
            if t == 'circle':
                area = math.pi * num(e.get('r')) ** 2
            if t == 'ellipse':
                area = math.pi * num(e.get('rx')) * num(e.get('ry'))
            # 影・グラデーション
            flt = st.get('filter', '') or e.get('filter', '') or ''
            m = re.search(r'url\(#([^)]+)\)', flt)
            if (m and m.group(1) in shadow_ids) or 'drop-shadow' in flt or 'box-shadow' in flt:
                shadows += 1
            for v in (fill, stroke):
                m = re.search(r'url\(#([^)]+)\)', v or '')
                if m and m.group(1) in grad_ids:
                    g = grad_ids[m.group(1)]
                    if (g.get('data-role') == 'colormap') or (e.get('data-role') == 'colormap'):
                        self.add('F10', 'info', '連続量の色の尺度としてグラデーションを使っている（data-role="colormap"）', r['id'])
                    else:
                        grads += 1
            # 角丸・ピル
            if t == 'rect' and (num(e.get('rx')) > 0 or num(e.get('ry')) > 0) and e.get('data-allow') != 'round':
                h = num(e.get('height'))
                if h and max(num(e.get('rx')), num(e.get('ry'))) >= 0.4 * h:
                    pills += 1
                else:
                    rounded += 1
            if t == 'path':
                pts, cmds = path_points(e.get('d'))
                if 'A' in cmds and ('L' in cmds or 'H' in cmds or 'V' in cmds) and 'Z' in cmds and e.get('data-allow') != 'round' and len(pts) >= 6:
                    rounded += 1
                if 'A' in cmds and pts:
                    arc_paths.append((pts[0], e))
                if fill not in ('none', '') and 'Z' in cmds:
                    shapes_kind.add('path')
            if t == 'rect':
                shapes_kind.add('rect')
            if t in ('circle', 'ellipse'):
                shapes_kind.add('ellipse')
            if t == 'polygon':
                shapes_kind.add('polygon')
            # 矢じり
            if t in ('line', 'path', 'polyline'):
                edges += 1
                has_marker = bool(st.get('marker-end') or e.get('marker-end') or st.get('marker-start') or e.get('marker-start'))
                if has_marker:
                    marker_edges += 1
                sc0 = parse_color(stroke)
                edge_recs.append((has_marker, sc0 is not None and chroma(to_lab(sc0)) >= 8, st.get('stroke-dasharray', 'none') not in ('none', '', '0')))
            if t in ('path', 'polygon') and bb and fill not in ('none', ''):
                pts0 = path_points(e.get('d'))[0] if t == 'path' else [tuple(map(float, p)) for p in zip(*[iter(re.findall(r'-?[0-9.]+', e.get('points') or ''))] * 2)]
                if 3 <= len(pts0) <= 4 and (bb[2] - bb[0]) <= 0.03 * self.vw and (bb[3] - bb[1]) <= 0.03 * self.vw:
                    arrow_paths += 1    # 小さな三角（矢じりを図形で描いたもの）
            if t == 'rect' and bb:
                area_r = (bb[2] - bb[0]) * (bb[3] - bb[1])
                sc_r = parse_color(stroke)
                fc_r = parse_color(fill)
                visible = (sc_r is not None and num(st.get('stroke-width', '1'), 1.0) > 0 and sop > 0) or (fc_r is not None and to_lab(fc_r)[0] < 97 and fop > 0)
                if visible and area_r < 0.9 * A:
                    boxes.append(bb)
            # 色と面積
            fc = parse_color(fill) if t != 'text' else None
            sc = parse_color(stroke)
            sw = num(st.get('stroke-width', '1'), 1.0) * s * k if sc is not None else 0.0
            if fc is not None and fop > 0:
                lab = to_lab(fc)
                if lab[0] < 92:
                    filled_area += area
                if 0 < fop < 1 and area >= 0.05 * A:
                    semi += 1
                if chroma(lab) >= 8:
                    chroma_area += area
                fills.append((fc, r))
                colors_all.append((fc, 'fill', r))
                if 90 <= lab[0] < 99 and chroma(lab) < 8 and area >= 0.02 * A:
                    light_bands += 1
            if sc is not None and sop > 0 and sw > 0:
                stroke_w.append(round(sw, 1))
                strokes.append((sc, r))
                colors_all.append((sc, 'stroke', r))
                da = st.get('stroke-dasharray', 'none')
                dash_kinds.add('solid' if da in ('none', '', '0') else ('dotted' if all(num(v) <= sw / k * 1.5 for v in re.findall(r'[0-9.]+', da)[:1]) else 'dashed'))
                if chroma(to_lab(sc)) >= 8 and bb:
                    length = (bb[2] - bb[0]) + (bb[3] - bb[1])
                    if t == 'path':
                        pts, _ = path_points(e.get('d'))
                        length = poly_len(pts)
                    chroma_area += length * sw / k
            # 文字
            if t == 'text':
                lines = self._text_lines(r)
                if not lines:
                    continue
                fs = self._font_size(r) * s * k
                font_sizes.append(round(fs * 2) / 2)
                fam = (st.get('font-family') or 'sans-serif').split(',')[0].strip().strip('\'"')
                families.add(fam.lower())
                weights.add(st.get('font-weight', 'normal'))
                tc = parse_color(st.get('fill', INK)) or (0, 0, 0)
                whole = ' '.join(l[2] for l in lines)
                texts.append({'r': r, 'lines': lines, 'pt': fs, 'color': tc, 'bbox': self._text_bbox(r), 'text': whole})
                if EMOJI.search(whole):
                    emoji += 1
                colors_all.append((tc, 'text', r))
        # 丸の中のアイコン：circle の外接矩形の中に、文字でない path が収まる
        circles = [self._bbox(r) for r in self.elems if r['tag'] == 'circle']
        for r in self.elems:
            if r['tag'] == 'path':
                bb = self._bbox(r)
                if not bb:
                    continue
                for cb in circles:
                    if cb and bb[0] >= cb[0] and bb[1] >= cb[1] and bb[2] <= cb[2] and bb[3] <= cb[3] and (cb[2] - cb[0]) > 0 and (bb[2] - bb[0]) < 0.9 * (cb[2] - cb[0]):
                        icon_circle += 1
                        break
        # ---- F01 色の数・F02 灰の段数 ----
        uniq = []  # (lab, rgb, role)
        for rgb, role, r in colors_all:
            lab = to_lab(rgb)
            if lab[0] >= 99 and chroma(lab) < 3:
                continue  # 白
            if not any(de2000(lab, u[0]) < 3 for u in uniq):
                uniq.append((lab, rgb, role))
        chrom = [u for u in uniq if chroma(u[0]) >= 8]
        achrom = [u for u in uniq if chroma(u[0]) < 8]
        self.stats['colors'] = {'chromatic': [hexs(u[1]) for u in chrom], 'achromatic': [hexs(u[1]) for u in achrom]}
        nC = len(chrom)
        if nC >= 3:
            self.add('F01', 'error', '有彩色が %d 色（%s）。強調は 1 色、2 色は例外' % (nC, '・'.join(hexs(u[1]) for u in chrom)))
        elif nC == 2:
            self.add('F01', 'warn', '有彩色が 2 色（%s）。1 色に減らせないか' % '・'.join(hexs(u[1]) for u in chrom))
        if len(achrom) >= 4:
            self.add('F01', 'warn' if len(achrom) == 4 else 'error', '無彩色（白を除く）が %d 種' % len(achrom))
        gray_steps = {int(u[0][0] // 10) for u in achrom if 15 < u[0][0] < 92}
        if len(gray_steps) >= 4:
            self.add('F02', 'warn' if len(gray_steps) == 4 else 'error', '灰の段数が %d（2 段が安全、3〜4 段が上限）' % len(gray_steps))
        # 赤と緑
        hues = [hue_deg(u[0]) for u in chrom]
        if any(h < 40 or h > 320 for h in hues) and any(90 < h < 180 for h in hues):
            self.add('F17', 'warn', '赤系と緑系が同じ図にある（色覚の多様性に配慮して組み合わせない）')
        # ---- F03/F04 線 ----
        kinds = sorted(set(stroke_w))
        self.stats['stroke_pt'] = kinds
        limit = 3 if self.kind in ('ortho', 'map') else 2
        if len(kinds) > limit + 1:
            self.add('F03', 'error', '線の太さが %d 種（%s pt）。2 段（細 0.35・太 1.0）まで' % (len(kinds), '・'.join(map(str, kinds))))
        elif len(kinds) == limit + 1:
            self.add('F03', 'warn', '線の太さが %d 種（%s pt）' % (len(kinds), '・'.join(map(str, kinds))))
        if kinds:
            if kinds[0] < 0.25:
                self.add('F04', 'error', '最も細い線が %.2f pt（0.25 pt 未満は印刷で消える。0.35 pt に）' % kinds[0])
            elif kinds[0] < 0.35:
                self.add('F04', 'warn', '最も細い線が %.2f pt（推奨 0.35 pt 以上）' % kinds[0])
            if kinds[-1] > 2.0:
                self.add('F04', 'error', '最も太い線が %.2f pt（2.0 pt 超。太線は 1.0 pt）' % kinds[-1])
            elif kinds[-1] > 1.0:
                self.add('F04', 'warn', '最も太い線が %.2f pt（1.0 pt までが目安）' % kinds[-1])
            if len(kinds) >= 2:
                ratio = kinds[-1] / kinds[0] if kinds[0] else 99
                if ratio < 2.0:
                    self.add('AR-L2', 'error', '太い線と細い線の比が %.1f（2.0 未満。段が見分けにくい。比 2.5〜5 に）' % ratio)
                elif ratio < 2.5:
                    self.add('AR-L2', 'warn', '太い線と細い線の比が %.1f（2.5 以上が目安）' % ratio)
        if len(dash_kinds) > 3:
            self.add('AR-L4', 'warn', '線種が %d 種（実線・破線・点線の 3 種まで）' % len(dash_kinds))
        # ---- F05/F06/F07 文字 ----
        fk = sorted(set(font_sizes))
        self.stats['font_pt'] = fk
        if len(fk) >= 4:
            self.add('F05', 'error', '文字の大きさが %d 種（%s pt）。2 段、最大 3 段' % (len(fk), '・'.join(map(str, fk))))
        elif len(fk) == 3:
            self.add('F05', 'warn', '文字の大きさが 3 種（%s pt）。2 段で済まないか' % '・'.join(map(str, fk)))
        if fk:
            if fk[0] < 7:
                self.add('F06', 'error', '最小の文字が %.1f pt（7 pt 未満。8 pt 以上に）' % fk[0])
            elif fk[0] < 8:
                self.add('F06', 'warn', '最小の文字が %.1f pt（8 pt 以上が目安）' % fk[0])
            if fk[-1] > 14:
                self.add('F06', 'error', '最大の文字が %.1f pt（14 pt 超。本文 10.5 pt を超えない）' % fk[-1])
            elif fk[-1] > 12:
                self.add('F06', 'warn', '最大の文字が %.1f pt（12 pt までが目安）' % fk[-1])
        serif = {f for f in families if re.search(r'serif|mincho|明朝|times|georgia|cambria', f) and 'sans' not in f}
        sans = families - serif
        self.stats['fonts'] = sorted(families)
        if len(sans) > 1 or len(serif) > 1 or (serif and not sans):
            self.add('F07', 'warn', '書体が %s（ゴシック 1 書体を全図でそろえる。数式の変数だけセリフ斜体）' % '・'.join(sorted(families)))
        if len(weights) > 2:
            self.add('AR-T2', 'info', '文字の太さが %d 種（2 種まで）' % len(weights))
        # ---- F08〜F11 禁止要素 ----
        if rounded:
            self.add('F08', 'error', '角丸の四角が %d（角の四角い細い枠か、枠なしに）' % rounded)
        if pills:
            self.add('F08', 'error', 'ピル型のラベルが %d' % pills)
        if shadows:
            self.add('F09', 'error', '影（filter の feDropShadow／feGaussianBlur＋feOffset・drop-shadow）が %d' % shadows)
        if grads:
            self.add('F10', 'error', 'グラデーションの塗りが %d（平塗りに。連続量の尺度なら data-role="colormap"）' % grads)
        if semi:
            self.add('F11', 'warn', '図の 5%% 以上を占める半透明の面が %d（淡い色の区画は AI の道具の様式）' % semi)
        if light_bands > 1:
            self.add('F11', 'warn', '淡い色帯が %d（最大 1 つ。上の文字は黒）' % light_bands)
        # ---- F12 凡例 ----
        small = []
        for r in self.elems:
            bb = self._bbox(r)
            if not bb:
                continue
            w, h = bb[2] - bb[0], bb[3] - bb[1]
            if (r['tag'] == 'rect' and w <= 12 and h <= 12) or (r['tag'] == 'line' and w <= 30 and h <= 2):
                small.append(bb)
        legend_pairs = 0
        for bb in small:
            for tx in texts:
                tb = tx['bbox']
                if tb and abs(tb[0] - bb[2]) <= 1.5 * self._font_size(tx['r']) and abs((tb[1] + tb[3]) / 2 - (bb[1] + bb[3]) / 2) <= 8:
                    legend_pairs += 1
                    break
        if legend_pairs >= 2 or any('legend' in (r['id'] + r['class']).lower() for r in self.elems):
            self.add('F12', 'warn', '凡例らしい並び（小さな色見本＋文字 ×%d）。ラベルは線の端・面の中に直接書く' % legend_pairs)
        # ---- F13〜F15 文字の色・コントラスト ----
        bg_shapes = [(self._bbox(r), parse_color(r['st'].get('fill', 'none'))) for r in self.elems if r['tag'] in ('rect', 'circle', 'ellipse', 'path', 'polygon')]
        for tx in texts:
            lab = to_lab(tx['color'])
            if chroma(lab) >= 15:
                self.add('F13', 'warn', '色の文字 %s「%s」（文字は黒。色は線や面で）' % (hexs(tx['color']), tx['text'][:20]))
            bb = tx['bbox']
            bg = (255, 255, 255)
            if bb:
                cx, cy = (bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2
                for sb, sc in bg_shapes:
                    if sb and sc is not None and sb[0] <= cx <= sb[2] and sb[1] <= cy <= sb[3] and (sb[2] - sb[0]) * (sb[3] - sb[1]) > (bb[2] - bb[0]) * (bb[3] - bb[1]):
                        bg = sc  # 描画の順で後のものが上
            cr = contrast(tx['color'], bg)
            big = tx['pt'] >= 18 or (tx['pt'] >= 14 and tx['r']['st'].get('font-weight', '') in ('bold', '700', '800', '900'))
            if cr < (3.0 if big else 4.5):
                self.add('F14', 'error', '文字「%s」と背景 %s のコントラスト比 %.2f（%s 以上）' % (tx['text'][:16], hexs(bg), cr, '3.0' if big else '4.5'))
        for rgb, role, r in colors_all:
            if role == 'text':
                continue
            lab = to_lab(rgb)
            if lab[0] >= 90:
                continue
            cr = contrast(rgb, (255, 255, 255))
            if cr < 3.0:
                self.add('F15', 'warn', '%s の %s と白地のコントラスト比 %.2f（図の要素は 3:1 以上。文脈の灰は #8C9493）' % (role, hexs(rgb), cr), r['id'])
        # ---- F16/F17 白黒の差・色覚の模擬（データの色の組：有彩色と、黒・白以外の灰） ----
        data_cols = [u for u in uniq if (chroma(u[0]) >= 8) or (15 < u[0][0] < 90)]
        for i in range(len(data_cols)):
            for j in range(i + 1, len(data_cols)):
                a, b = data_cols[i], data_cols[j]
                dl = abs(a[0][0] - b[0][0])
                if dl < 10:
                    self.add('F16', 'error', '%s と %s の明度差 ΔL* %.1f（白黒コピーで区別できない。20 以上に）' % (hexs(a[1]), hexs(b[1]), dl))
                elif dl < 20:
                    self.add('F16', 'warn', '%s と %s の明度差 ΔL* %.1f（20 以上が目安。暫定）' % (hexs(a[1]), hexs(b[1]), dl))
                if chroma(a[0]) >= 8 or chroma(b[0]) >= 8:
                    worst = min(de2000(to_lab(simulate(a[1], c)), to_lab(simulate(b[1], c))) for c in CVD)
                    if worst < 8:
                        self.add('F17', 'error', '%s と %s は色覚の模擬で区別しにくい（最小 ΔE2000 %.1f）' % (hexs(a[1]), hexs(b[1]), worst))
                    elif worst < 15:
                        self.add('F17', 'warn', '%s と %s は色覚の模擬で差が小さい（最小 ΔE2000 %.1f。暫定）' % (hexs(a[1]), hexs(b[1]), worst))
        # ---- F18/F19 改行・ラベルの長さ ----
        for tx in texts:
            ls = tx['lines']
            if len(ls) >= 2:
                for p, q in zip(ls, ls[1:]):
                    a, b = p[2], q[2]
                    if re.search(r'[A-Za-z]$', a) and re.match(r'^[a-z]', b):
                        self.add('F18', 'error', '欧文の単語の途中で改行「%s / %s」' % (a[-8:], b[:8]), tx['text'][:20])
                    if b and b[0] in HINSOKU:
                        self.add('F18', 'error', '行頭に置けない文字「%s」で行が始まる' % b[0], tx['text'][:20])
                    if re.search(r'[0-9０-９]$', a) and UNITS.match(b):
                        self.add('F18', 'error', '数字と単位の間で改行「%s / %s」' % (a[-6:], b[:4]), tx['text'][:20])
            if len(ls) > 2 or any(fw(l[2]) > 16 for l in ls):
                self.add('F19', 'warn', 'ラベルが長い（%d 行・最長 %.0f 字幅。2 行・16 字以内。説明は図題か本文へ）' % (len(ls), max(fw(l[2]) for l in ls)), tx['text'][:24])
        # ---- F20 文字の重なり ----
        for i in range(len(texts)):
            for j in range(i + 1, len(texts)):
                a, b = texts[i]['bbox'], texts[j]['bbox']
                if a and b and a[0] < b[2] - 1 and b[0] < a[2] - 1 and a[1] < b[3] - 1 and b[1] < a[3] - 1:
                    self.add('F20', 'error', '文字が重なる「%s」「%s」（外接矩形の近似）' % (texts[i]['text'][:12], texts[j]['text'][:12]))
        # ---- F21 円グラフ・3D ----
        centers = {}
        for p0, e in arc_paths:
            key = (round(p0[0]), round(p0[1]))
            centers[key] = centers.get(key, 0) + 1
        if any(v >= 3 for v in centers.values()):
            self.add('F21', 'warn', '同じ中心から出る扇形が 3 つ以上（円グラフ）。量は位置か長さで比べる')
        if any(r['skew'] for r in self.elems):
            self.add('F21', 'warn', 'skew の変形（3D らしい面）がある')
        # ---- F22 装飾の残り ----
        if emoji:
            self.add('F22', 'error', '絵文字を含む文字が %d' % emoji)
        if icon_circle:
            self.add('F22', 'error', '丸の中のアイコン（circle に収まる path）が %d。文字そのもので書く' % icon_circle)
        for tx in texts:
            bb = tx['bbox']
            if bb and fk and tx['pt'] >= fk[-1] - 0.01 and bb[1] <= self.vh * 0.08 and (bb[2] - bb[0]) >= 0.5 * self.vw:
                self.add('F22', 'warn', '図の上端に幅の半分を超える最大の文字「%s」（図の中の図題は外す。図題は図の外に）' % tx['text'][:20])
            rot = tx['r']['rot']
            if 10 < rot % 360 < 350 and not (bb and bb[0] <= self.vw * 0.08):
                self.add('F22', 'warn', '回転した文字「%s」（y 軸名以外は水平に）' % tx['text'][:16])
        # ---- AR-C2 色の面積・AR-A1 矢じり・AR-B2 形・AR-W1 余白 ----
        share = chroma_area / A if A else 0
        self.stats['chromatic_area'] = round(share, 3)
        if share > 0.25:
            self.add('AR-C2', 'error', '有彩色の面積が図の %d%%（10%% 以下。優秀作の中央値 3〜6%%）' % round(share * 100))
        elif share > 0.10:
            self.add('AR-C2', 'warn', '有彩色の面積が図の %d%%（10%% 以下が目安）' % round(share * 100))
        if edges >= 5 and marker_edges == edges:
            self.add('AR-A1', 'warn', 'すべての辺に矢じりがある（矢じりは移転・移動だけ。方向のない関係は矢じりのない線）')
        # ---- v2.1（伏せた比較の採点で見つかった図の癖）----
        # F23 記号だけのラベル：A・D・E のような 1〜2 文字の英字だけのラベルが 3 つ以上（図題を読まないと意味が取れない。語で書く）
        re_sym = re.compile(r"^[A-Za-z][A-Za-z]?['′]?(?:[・,、/／][A-Za-z][A-Za-z]?['′]?)*$")
        sym = [tx for tx in texts if re_sym.match(tx['text'].replace(' ', ''))]
        if self.kind != 'chart' and len(sym) >= 3:
            self.add('F23', 'warn', '記号だけのラベルが %d（%s）。図だけで意味が取れる語で書く（符号で置くと図題を読まないと分からない）' % (len(sym), '・'.join(tx['text'] for tx in sym[:4])))
        # F24 要素の階層：見出し級のラベル（太字。無ければ最大の文字）に、枠に入ったものと入っていないものが混ざる（始点・終点も同じ形式に）
        heads = [tx for tx in texts if tx['bbox'] and str(tx['r']['st'].get('font-weight', 'normal')).lower() in ('bold', 'bolder', '600', '700', '800', '900')]
        if not heads and fk:
            heads = [tx for tx in texts if tx['bbox'] and abs(tx['pt'] - fk[-1]) < 0.01]
        heads = [tx for tx in heads if tx['bbox'][1] > self.vh * 0.08]   # 上端の題（F22）は除く

        def boxed(tx):
            bb = tx['bbox']
            cx, cy = (bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2
            return any(b[0] <= cx <= b[2] and b[1] <= cy <= b[3] for b in boxes)
        if boxes and self.kind != 'chart' and len(heads) >= 3:
            inb = [tx for tx in heads if boxed(tx)]
            outb = [tx for tx in heads if not boxed(tx)]
            if inb and outb:
                self.add('F24', 'warn', '見出し級のラベルに枠のあるもの %d と無いもの %d（%s）。要素の階層をそろえる（始点・終点も同じ形式で箱に入れる）' % (len(inb), len(outb), '・'.join(tx['text'][:10] for tx in outb[:3])))
        # F25 流れを示す図（--kind process／flow か、図題に 流れ・順序・手順・プロセス）に矢印が無い
        flow = self.kind in ('process', 'flow') or (self.caption is not None and re.search(r'流れ|順序|手順|プロセス|フロー|経路|段階|→|flow|process|steps?', self.caption, re.I) is not None)
        if flow and edges >= 2 and marker_edges == 0 and arrow_paths == 0:
            self.add('F25', 'warn', '流れ（順序・分岐）を示す図なのに矢印が無い（辺 %d・矢じり 0）。流れを示す図は矢印を省かない（細い開いた矢じり）' % edges)
        # AR-L5 関係の種類の混在：矢じりのある辺（流れ）と、矢じりの無い有彩色の実線（対応関係）が同じ図にある
        if marker_edges and any((not m) and c and (not d) for m, c, d in edge_recs):
            self.add('AR-L5', 'info', '矢じりのある辺（流れ）と、矢じりの無い有彩色の実線が混ざる。一枚に関係の種類を混ぜない。混ぜるなら線種で分け、凡例でなく線の横に直書き')
        if len(shapes_kind) >= 3:
            self.add('AR-B2', 'warn', 'ノードの形が %d 種（%s）。2 種まで' % (len(shapes_kind), '・'.join(sorted(shapes_kind))))
        bg = 1 - min(1.0, filled_area / A) if A else 1
        self.stats['background_share'] = round(bg, 2)
        if bg < 0.45:
            self.add('AR-W1', 'warn', '余白（背景）が %d%%（60%% 以上が目安）' % round(bg * 100))
        elif bg < 0.60:
            self.add('AR-W1', 'info', '余白（背景）が %d%%（優秀作の中央値 78〜80%%）' % round(bg * 100))
        # ---- 図題（渡されたとき） ----
        if self.caption is not None:
            cap = self.caption.replace('**', '').strip()   # Markdown の太字の印は外して見る
            if not re.match(r'^(?:図|表|Figure|Fig\.?|Table)\s*[0-9０-９]+', cap):
                self.add('AR-N1', 'warn', '図題が「図 N」で始まらない')
            if not re.search(r'[0-9０-９]', cap[4:] if len(cap) > 4 else ''):
                self.add('S22', 'info', '図題に具体の数字（期間・件数・しきい値・単位）が無い（優秀作の 63% に数字）')
            if chrom and not re.search(r'赤|青|橙|緑|灰|色|red|blue|orange|green|gr[ae]y|colou?r', cap):
                self.add('AR-C3', 'warn', '有彩色があるのに、図題に色の意味（「赤は本件の争点」）が無い')
            if not re.search(r'出典|出所|筆者|作成|source|author|based on', cap, re.I):
                self.add('S23', 'info', '図題に出典（出典：…／筆者作成）が無い')
            # v2.1 図題は完全な文で「何を示すか＋読み方＋出典」。題の後に 。で終わる読み方の文があるか、述語の無い断片（「判断の段階は四つ。」）が無いか。括弧の中は見ない
            body = re.sub(r'^(?:図|表|Figure|Fig\.?|Table)\s*[0-9０-９]+[\s　.．:：]*', '', cap.replace('**', ''))
            body = re.sub(r'[（(][^（）()]*[）)]', '', body)
            segs = [s.strip() for s in re.split(r'[。．]', body) if s.strip()]
            reading = segs[1:]
            if not reading:
                self.add('AR-N2', 'warn', '図題に読み方の文が無い（題と出典だけ）。「図 N　題。実線は〜、赤は〜。出典：〜」の形で、何を示すか＋読み方＋出典を完全な文で')
            if re.search(r'[぀-ヿ㐀-鿿]', cap):
                # 助数詞で終わる文（「判断の段階は四つ」）と 8 字以下で述語の無い文だけ。体言止めの凡例（「赤は本件の争点」）は断片に数えない
                frags = [s for s in reading if not re.search(r'出典|出所|筆者|作成|集計|加筆|基づく|もとに|基に', s)
                         and (re.search(r'[一二三四五六七八九十0-9０-９](?:つ|点|段階|件|本|枚|種|層|類型)$', s)
                              or (len(s) <= 8 and not re.search(r'(?:[うくすつぬふむゆるぐずづぶぷ]|い|た|だ|ない|である|です|ます|か|れ)$', s)))]
                if frags:
                    self.add('AR-N3', 'info', '図題に述語の無い断片の文（「%s。」）。図題は完全な文で書く' % frags[0][:20])

    # ---------- PNG ----------
    def check_png(self):
        data = open(self.path, 'rb').read()
        if data[:8] != b'\x89PNG\r\n\x1a\n':
            self.add('PNG', 'error', 'PNG ではない')
            return
        pos = 8
        w = h = 0
        bitdepth = ctype = 0
        dpi = None
        idat = b''
        palette = []
        while pos < len(data):
            ln, = struct.unpack('>I', data[pos:pos + 4])
            typ = data[pos + 4:pos + 8]
            body = data[pos + 8:pos + 8 + ln]
            if typ == b'IHDR':
                w, h, bitdepth, ctype = struct.unpack('>IIBB', body[:10])
            elif typ == b'pHYs':
                x, y, unit = struct.unpack('>IIB', body[:9])
                if unit == 1:
                    dpi = x * 0.0254
            elif typ == b'IDAT':
                idat += body
            elif typ == b'PLTE':
                palette = [tuple(body[i:i + 3]) for i in range(0, len(body), 3)]
            elif typ == b'IEND':
                break
            pos += 12 + ln
        self.stats['png'] = {'width_px': w, 'height_px': h, 'dpi_declared': round(dpi) if dpi else None}
        eff = w / (self.width_mm / 25.4) if self.width_mm else None
        if eff:
            self.stats['png']['dpi_effective'] = round(eff)
            if eff < 300:
                self.add('Z5', 'error', '刷り上がり幅 %.0f mm での実効 dpi が %.0f（線画は 600 以上、写真は 300 以上）' % (self.width_mm, eff))
            elif eff < 600:
                self.add('Z5', 'warn', '実効 dpi が %.0f（線画は 600 以上か SVG のまま貼る）' % eff)
        if bitdepth != 8 or ctype not in (0, 2, 3, 4, 6):
            self.add('PNG', 'info', 'この形（bit depth %d・color type %d）の画素は数えない（色の数は SVG で点検する）' % (bitdepth, ctype))
            return
        raw = zlib.decompress(idat)
        ch = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ctype]
        stride = w * ch
        prev = bytearray(stride)
        counts = {}
        off = 0

        def rgb_at(buf, x):
            px = buf[x * ch:(x + 1) * ch]
            if ctype == 3:
                return palette[px[0]] if px[0] < len(palette) else (0, 0, 0)
            if ctype in (0, 4):
                return (px[0], px[0], px[0])
            if ch == 4 and px[3] < 128:
                return None
            return (px[0], px[1], px[2])
        skipped_edge = 0
        for row in range(h):
            ft = raw[off]
            off += 1
            line = bytearray(raw[off:off + stride])
            off += stride
            for i in range(stride):
                a = line[i - ch] if i >= ch else 0
                b = prev[i]
                c = prev[i - ch] if i >= ch else 0
                if ft == 1:
                    line[i] = (line[i] + a) & 255
                elif ft == 2:
                    line[i] = (line[i] + b) & 255
                elif ft == 3:
                    line[i] = (line[i] + ((a + b) >> 1)) & 255
                elif ft == 4:
                    p = a + b - c
                    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                    pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                    line[i] = (line[i] + pr) & 255
            for x in range(0, w, max(1, w // 400)):
                rgb = rgb_at(line, x)
                if rgb is None:
                    continue
                # v2.1 文字の縁のぼかし（アンチエイリアス）の中間色を色として数えない：左右と上の隣（各成分の差 24 以内）が同じ色の、平らな所の画素だけ数える
                flat = True
                for buf, xx in ((line, x - 1), (line, x + 1), (prev if row else None, x)):
                    if buf is None or xx < 0 or xx >= w:
                        continue
                    nb = rgb_at(buf, xx)
                    if nb is None or any(abs(nb[k] - rgb[k]) > 24 for k in range(3)):
                        flat = False
                        break
                if not flat:
                    skipped_edge += 1
                    continue
                q = (rgb[0] >> 3, rgb[1] >> 3, rgb[2] >> 3)
                counts[q] = counts.get(q, 0) + 1
            prev = line
        total = sum(counts.values()) or 1
        uniq = []
        for q, n in sorted(counts.items(), key=lambda kv: -kv[1]):
            if n / total < 0.0002:      # v2.1 縁のぼかしを除いた後は、細い強調線（1 pt）も拾えるように下げた（0.1%→0.02%）
                break
            rgb = tuple(v << 3 for v in q)
            lab = to_lab(rgb)
            if lab[0] >= 97 and chroma(lab) < 4:
                continue
            if not any(de2000(lab, u[0]) < 5 for u in uniq):
                uniq.append((lab, rgb))
        chrom = [u for u in uniq if chroma(u[0]) >= 8]
        self.stats['colors'] = {'chromatic': [hexs(u[1]) for u in chrom], 'achromatic': [hexs(u[1]) for u in uniq if chroma(u[0]) < 8], 'edge_pixels_skipped': skipped_edge}
        if len(chrom) >= 3:
            self.add('F01', 'error', '有彩色が %d 色（PNG の近似）' % len(chrom))
        elif len(chrom) == 2:
            self.add('F01', 'warn', '有彩色が 2 色（PNG の近似）')
        data_cols = [u for u in uniq if chroma(u[0]) >= 8 or 15 < u[0][0] < 90]
        for i in range(len(data_cols)):
            for j in range(i + 1, len(data_cols)):
                dl = abs(data_cols[i][0][0] - data_cols[j][0][0])
                if dl < 10:
                    self.add('F16', 'error', '%s と %s の明度差 ΔL* %.1f' % (hexs(data_cols[i][1]), hexs(data_cols[j][1]), dl))
        self.add('PNG', 'info', 'PNG では線の太さ・文字の大きさ・角丸・凡例・改行は点検できない（SVG を渡す）')

    def run(self):
        if self.path.lower().endswith('.png'):
            self.check_png()
        else:
            self.check_svg()
        order = {'error': 0, 'warn': 1, 'info': 2}
        self.findings.sort(key=lambda f: order[f['severity']])
        return {'file': self.path, 'width_mm': self.width_mm, 'kind': self.kind, 'pass': not any(f['severity'] == 'error' for f in self.findings),
                'errors': sum(1 for f in self.findings if f['severity'] == 'error'), 'warnings': sum(1 for f in self.findings if f['severity'] == 'warn'),
                'findings': self.findings, 'stats': self.stats,
                'note': '機械の候補（誤検知あり）。白黒の差・色覚の模擬・ラベルの長さのしきい値は暫定。図の意味（メッセージが一文で言えるか）は人が見る'}


def main(argv):
    args, files = {'width_mm': 156.0, 'kind': 'diagram', 'caption': None, 'json': False}, []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--width-mm':
            args['width_mm'] = float(argv[i + 1]); i += 1
        elif a == '--kind':
            args['kind'] = argv[i + 1]; i += 1
        elif a == '--caption':
            args['caption'] = argv[i + 1]; i += 1
        elif a == '--json':
            args['json'] = True
        elif a in ('-h', '--help'):
            print(__doc__); return 0
        else:
            files.append(a)
        i += 1
    if not files:
        print(__doc__); return 2
    code = 0
    for f in files:
        r = Fig(f, args['width_mm'], args['kind'], args['caption']).run()
        if r['errors']:
            code = 1
        if args['json']:
            print(json.dumps(r, ensure_ascii=False, indent=1))
        else:
            print('== %s — %s（error %d・warn %d）' % (f, '通過' if r['pass'] else '不合格', r['errors'], r['warnings']))
            print('   ' + json.dumps(r['stats'], ensure_ascii=False))
            for x in r['findings']:
                print('  %s [%s] %s%s' % (x['severity'], x['rule'], x['message'], ('  ← ' + x['at']) if x['at'] else ''))
            print('   ' + r['note'])
    return code


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
