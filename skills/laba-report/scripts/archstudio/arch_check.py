#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""arch_check — 建築図の SVG を、製図の規格と archdraw の約束（SPEC.md）で点検する。

Python 標準ライブラリだけで動く（3.11 と 3.13 で確かめた）。

使い方
  python3 arch_check.py 図.svg [図2.svg ...] [--kind plan] [--json] [--reduce 0.707]
  python3 arch_check.py --audit 図のフォルダ [--out AUDIT.md]

点検の項目（指摘には STANDARDS.md の規則 ID を付ける）
  (a) 線   ：線の太さの段の数、切断：見えがかりの比、ISO の系列、最小の太さ、役割と線種、ハッチの間隔
  (b) 色   ：有彩色の数、SPEC の 3 色以外、強調色の面積、灰の段、色の文字、文字のコントラスト
  (c) 文字 ：大きさの段、最小の大きさ（JIS Z 8313）、書体、太さ、重なり
  (d) 版面 ：viewBox からのはみ出し、余白
  (e) 必須 ：図の種類ごとの必須の要素（class="ad-…" の約束。無いときは推定し、そう書く）
  (f) 飾り ：角丸・影・グラデーション・フィルタ・半透明の面・絵文字・ラスタ画像
  (g) 寸法 ：縮尺の値、端末記号の統一、単位、スケールバーの長さ、共通の題材（SPEC §4）の数値
  (h) 具体・既定・癖：数値の注記・名前の付いた参照線と範囲・出典の断り（人の優秀な図の「具体」）、
            道具の既定（太さ・文字の大きさ・書体・色・背景）、図題の重複、記号だけのラベル、
            矢印の無い流れの図、線種の混同、始点・終点だけ違う形、断片的な図題（FIG-STUDENT-PORTFOLIOS §3）

座標の単位は「紙の上の mm」（SPEC §1）。width に mm などの単位があればそれで換算する。
--reduce は刷り上がりの倍率（A3 の図を A4 に縮めて貼るなら 0.707）。線と文字の判定はその後の大きさで行う。
"""
from __future__ import annotations

import argparse
import glob
import json
import math
import os
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET

VERSION = '1.0 (2026-10-23)'
XLINK_HREF = '{http://www.w3.org/1999/xlink}href'

ISO_WIDTHS = (0.13, 0.18, 0.25, 0.35, 0.5, 0.7, 1.0, 1.4, 2.0)   # JIS Z 8312 4.1 = ISO 128-20 4.1
MLIT_SCALES = (1, 2, 3, 5, 10, 20, 30, 50, 100, 200, 300, 500, 600)  # 建築工事設計図書作成基準 3.4
SPEC_COLORS = (('黒', '#1A1A1A'), ('灰', '#8C9493'), ('強調', '#943522'))
TEAMS = ('plan', 'section', 'elevation', 'axon', 'layers', 'site', 'detail', 'diagram', 'notation')
CATS = (('a', '線'), ('b', '色'), ('c', '文字'), ('d', '版面'), ('e', '必須の要素'), ('f', '飾り'), ('g', '寸法・縮尺'),
        ('h', '具体・既定・癖'))
CAT_WEIGHT = {'a': 20, 'b': 10, 'c': 15, 'd': 15, 'e': 20, 'f': 10, 'g': 5, 'h': 5}
SEV_ORDER = {'error': 0, 'warn': 1, 'info': 2, 'pass': 3}

# ---------------------------------------------------------------- 図の種類と必須の要素
KIND_NAMES = {
    'plan': '平面図', 'section': '断面図', 'elevation': '立面図', 'interior': '展開図',
    'axon': 'アクソメ', 'exploded': '分解アクソメ', 'layers': '階層別の図', 'site': '配置図',
    'detail': '詳細図・矩計図', 'diagram': 'ダイアグラム', 'notation': '記号', 'generic': '種類不明',
}
KIND_WORDS = (  # パスの語 → 種類（先に当たったもの）
    ('interior', ('interior', 'tenkai', '展開')),
    ('exploded', ('exploded', 'explode', 'bunkai', '分解')),
    ('plan', ('plan', 'heimen', '平面')),
    ('section', ('section', 'danmen', '断面')),
    ('elevation', ('elevation', 'ritsumen', '立面')),
    ('axon', ('axon', 'axo', 'isometric', 'iso-', 'アクソメ')),
    ('layers', ('layers', 'layer', '階層')),
    ('site', ('site', 'haichi', '配置')),
    ('detail', ('detail', 'kanabakari', '矩計', '詳細')),
    ('diagram', ('diagram', 'ダイアグラム')),
    ('notation', ('notation', 'symbol', '記号', 'legend', '凡例')),
)
ORTHO_KINDS = {'plan', 'section', 'elevation', 'interior', 'site', 'detail', 'layers'}
CUT_KINDS = {'plan', 'section', 'detail', 'layers'}   # 切断：見えがかりの比を問う図（JIS A 0150 13.2.5）

# (要素の鍵, 必須の度合い, 名前, 根拠)。class は "ad-<鍵>"。
REQ = {
    'plan': [
        ('cut', 'must', '切断面（壁のポシェかハッチ）', 'SPEC §3・JIS A 0150 13.2.5'),
        ('opening', 'must', '開口（戸の開きの弧）', 'SPEC §3・JIS A 0150 13.3.2'),
        ('stair', 'must', '階段', 'SPEC §3・§4・JIS A 0150 13.2.9'),
        ('room-name', 'must', '室名', 'SPEC §3'),
        ('grid', 'must', '通り芯', 'SPEC §3・JIS A 0150 10'),
        ('grid-label', 'must', '通り芯の符号', 'SPEC §3・JIS A 0150 10.2'),
        ('dim', 'must', '寸法', 'SPEC §3・JIS Z 8317-1'),
        ('north', 'must', '方位記号', 'SPEC §3・Memphis'),
        ('scalebar', 'must', 'スケールバー', 'SPEC §3・Memphis'),
        ('scale-text', 'must', '縮尺の表記', 'SPEC §3・JIS Z 8314 4'),
        ('section-mark', 'must', '断面の位置の記号', 'SPEC §3・JIS A 0150 12.1'),
        ('title', 'must', '図題', 'SPEC §3・JIS A 0150 12.4'),
        ('hidden', 'should', '上部の輪郭（破線）', 'SPEC §3・ISO 128-23 02.1'),
        ('visible', 'should', '見えがかり・家具（細線）', 'SPEC §3'),
    ],
    'section': [
        ('cut', 'must', '切断面（ポシェ・材料）', 'SPEC §3・JIS A 0150 13.2.5'),
        ('visible', 'must', '見えがかり', 'SPEC §3・JIS A 0150 13.2.5'),
        ('ground', 'must', '地盤線（GL）', 'SPEC §3・Memphis'),
        ('ground-hatch', 'must', '地盤のハッチ', 'SPEC §3・JIS A 0150 付表2'),
        ('level', 'must', 'レベル記号（GL・FL）', 'SPEC §3・JIS Z 8317-1 7.9'),
        ('dim', 'must', '階高などの寸法', 'SPEC §3'),
        ('person', 'must', '人物', 'SPEC §3・Memphis'),
        ('scalebar', 'must', 'スケールバー', 'SPEC §3'),
        ('scale-text', 'must', '縮尺の表記', 'SPEC §3・JIS Z 8314 4'),
        ('title', 'must', '図題', 'SPEC §3'),
        ('opening', 'should', '開口', 'SPEC §3'),
        ('grid', 'should', '通り芯', 'JIS A 0150 10'),
    ],
    'elevation': [
        ('visible', 'must', '外形と見えがかり', 'SPEC §3'),
        ('opening', 'must', '開口', 'SPEC §3'),
        ('ground', 'must', '地盤線', 'SPEC §3'),
        ('scalebar', 'must', 'スケールバー', 'SPEC §3'),
        ('scale-text', 'must', '縮尺の表記', 'SPEC §3'),
        ('title', 'must', '図題', 'SPEC §3'),
        ('level', 'should', 'レベル（GL・最高高さ）', 'JIS Z 8317-1 7.9'),
        ('grid', 'should', '通り芯', 'JIS A 0150 10'),
    ],
    'interior': [
        ('visible', 'must', '壁の見えがかり', 'SPEC §3'),
        ('opening', 'must', '開口', 'SPEC §3'),
        ('keyplan', 'must', 'キープラン', 'SPEC §3'),
        ('wall-label', 'must', '壁の記号（A〜D）', 'SPEC §3'),
        ('scalebar', 'must', 'スケールバー', 'SPEC §3'),
        ('title', 'must', '図題', 'SPEC §3'),
        ('dim', 'should', '天井高などの寸法', '判断'),
        ('scale-text', 'should', '縮尺の表記', 'JIS Z 8314 4'),
    ],
    'axon': [
        ('visible', 'must', '輪郭線', 'SPEC §3'),
        ('title', 'must', '図題', 'SPEC §3'),
        ('layer-label', 'should', '層・部分のラベル', 'SPEC §3'),
        ('hidden', 'should', '隠れ線の処理（破線）', 'SPEC §3'),
    ],
    'exploded': [
        ('visible', 'must', '輪郭線', 'SPEC §3'),
        ('layer-label', 'must', '層ごとのラベル', 'SPEC §3'),
        ('guide', 'must', '分解の案内線（破線）', 'SPEC §3'),
        ('title', 'must', '図題', 'SPEC §3'),
    ],
    'layers': [
        ('layer-label', 'must', '階・層のラベル', 'SPEC §3'),
        ('title', 'must', '図題', 'SPEC §3'),
        ('scalebar', 'should', 'スケールバー', 'SPEC §3'),
        ('north', 'should', '方位記号', 'SPEC §3'),
    ],
    'site': [
        ('north', 'must', '方位記号', 'SPEC §3・MLIT 3.1(5)'),
        ('scalebar', 'must', 'スケールバー', 'SPEC §3'),
        ('scale-text', 'must', '縮尺の表記', 'SPEC §3'),
        ('boundary', 'must', '敷地境界線', 'SPEC §4'),
        ('road', 'must', '道路（路地）', 'SPEC §4'),
        ('dim', 'must', '寸法（後退距離など）', 'SPEC §4'),
        ('title', 'must', '図題', 'SPEC §3'),
        ('context', 'should', '周辺の建物（灰）', 'SPEC §2'),
    ],
    'detail': [
        ('cut', 'must', '切断面', 'JIS A 0150 13.2.5'),
        ('hatch', 'must', '材料構造表示（ハッチ）', 'JIS A 0150 付表2・MLIT 別表2'),
        ('dim', 'must', '寸法', 'JIS Z 8317-1'),
        ('leader', 'must', '引出線と材料名', 'JIS A 0150 12.4'),
        ('scale-text', 'must', '縮尺の表記', 'JIS Z 8314 4'),
        ('title', 'must', '図題', 'SPEC §3'),
        ('level', 'should', 'レベル', 'JIS Z 8317-1 7.9'),
    ],
    'diagram': [('title', 'must', '図題', 'SPEC §3・FIG-ARCHITECTURE AR-21')],
    'notation': [('title', 'should', '図題か見出し', '判断')],
    'generic': [('title', 'should', '図題', 'SPEC §3')],
}
# 共通の題材（SPEC §4）の数値。図の中の文字に出てくるか（寸法と設計条件の一致）。
SUBJECT = {
    'plan': (5400, 8100, 2700),
    'section': (3000, 2800, 2700),
    'site': (5400, 9000, 2700),
}

# ---------------------------------------------------------------- 長さ・色・変換
_NUM = r'[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?'
_num_re = re.compile(_NUM)
_len_re = re.compile(r'^\s*(' + _NUM + r')\s*(px|mm|cm|in|pt|pc|em|ex|%)?\s*$')
UNIT_UU = {'': 1.0, 'px': 1.0, 'mm': 96 / 25.4, 'cm': 96 / 2.54, 'in': 96.0, 'pt': 96 / 72, 'pc': 16.0}


def local(tag):
    return tag.split('}')[-1] if isinstance(tag, str) else ''


def parse_length(s, em=16.0, pct_base=None):
    """長さ → 使用者単位（SVG の px）。単位 mm は 96/25.4 倍（ブラウザと同じ）。読めなければ None。"""
    if s is None:
        return None
    m = _len_re.match(str(s))
    if not m:
        return None
    v, u = float(m.group(1)), (m.group(2) or '')
    if u in UNIT_UU:
        return v * UNIT_UU[u]
    if u == 'em':
        return v * em
    if u == 'ex':
        return v * em * 0.5
    if u == '%' and pct_base is not None:
        return v / 100.0 * pct_base
    return None


def first_len(s, default=0.0, em=16.0):
    if s is None:
        return default
    toks = [t for t in re.split(r'[\s,]+', str(s).strip()) if t]
    if not toks:
        return default
    v = parse_length(toks[0], em=em)
    return default if v is None else v


NAMED = {
    'black': (0, 0, 0), 'white': (255, 255, 255), 'gray': (128, 128, 128), 'grey': (128, 128, 128),
    'silver': (192, 192, 192), 'darkgray': (169, 169, 169), 'darkgrey': (169, 169, 169),
    'lightgray': (211, 211, 211), 'lightgrey': (211, 211, 211), 'dimgray': (105, 105, 105),
    'dimgrey': (105, 105, 105), 'gainsboro': (220, 220, 220), 'whitesmoke': (245, 245, 245),
    'red': (255, 0, 0), 'green': (0, 128, 0), 'blue': (0, 0, 255), 'yellow': (255, 255, 0),
    'orange': (255, 165, 0), 'purple': (128, 0, 128), 'maroon': (128, 0, 0), 'navy': (0, 0, 128),
    'teal': (0, 128, 128), 'olive': (128, 128, 0), 'lime': (0, 255, 0), 'aqua': (0, 255, 255),
    'cyan': (0, 255, 255), 'fuchsia': (255, 0, 255), 'magenta': (255, 0, 255), 'brown': (165, 42, 42),
    'pink': (255, 192, 203), 'gold': (255, 215, 0), 'tomato': (255, 99, 71), 'crimson': (220, 20, 60),
    'firebrick': (178, 34, 34), 'darkred': (139, 0, 0), 'steelblue': (70, 130, 180),
    'royalblue': (65, 105, 225), 'skyblue': (135, 206, 235), 'lightblue': (173, 216, 230),
    'darkblue': (0, 0, 139), 'darkgreen': (0, 100, 0), 'forestgreen': (34, 139, 34),
    'seagreen': (46, 139, 87), 'coral': (255, 127, 80), 'salmon': (250, 128, 114),
    'beige': (245, 245, 220), 'ivory': (255, 255, 240), 'linen': (250, 240, 230), 'tan': (210, 180, 140),
    'chocolate': (210, 105, 30), 'sienna': (160, 82, 45), 'indigo': (75, 0, 130), 'violet': (238, 130, 238),
    'slategray': (112, 128, 144), 'slategrey': (112, 128, 144), 'darkslategray': (47, 79, 79),
    'lightslategray': (119, 136, 153), 'orangered': (255, 69, 0), 'goldenrod': (218, 165, 32),
}


def parse_color(s):
    """→ ('none',) | ('url', id) | ('rgb', (r,g,b), alpha) | ('current',) | ('unknown', s)"""
    if s is None:
        return ('none',)
    s = str(s).strip()
    low = s.lower()
    if low in ('none', 'transparent', ''):
        return ('none',)
    if low.startswith('url('):
        m = re.match(r'url\(\s*["\']?#([^"\')\s]+)["\']?\s*\)', s)
        return ('url', m.group(1)) if m else ('unknown', s)
    if low == 'currentcolor':
        return ('current',)
    if low.startswith('#'):
        h = low[1:]
        if len(h) in (3, 4):
            h = ''.join(c * 2 for c in h)
        if len(h) in (6, 8) and re.fullmatch(r'[0-9a-f]+', h):
            a = int(h[6:8], 16) / 255 if len(h) == 8 else 1.0
            return ('rgb', (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)), a)
        return ('unknown', s)
    m = re.match(r'rgba?\(([^)]*)\)', low)
    if m:
        parts = [p for p in re.split(r'[\s,/]+', m.group(1).strip()) if p]
        vals = []
        try:
            for i, p in enumerate(parts[:4]):
                if p.endswith('%'):
                    v = float(p[:-1]) / 100
                    vals.append(v * 255 if i < 3 else v)
                else:
                    vals.append(float(p))
        except ValueError:
            return ('unknown', s)
        if len(vals) >= 3:
            a = vals[3] if len(vals) > 3 else 1.0
            return ('rgb', tuple(int(round(min(255, max(0, v)))) for v in vals[:3]), a)
    if low in NAMED:
        return ('rgb', NAMED[low], 1.0)
    return ('unknown', s)


def hex_rgb(h):
    c = parse_color(h)
    return c[1] if c[0] == 'rgb' else (0, 0, 0)


def rgb_hex(rgb):
    return '#%02X%02X%02X' % tuple(rgb)


def _lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rel_lum(rgb):
    r, g, b = (_lin(v) for v in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(rgb1, rgb2):
    """WCAG 2.2 のコントラスト比。"""
    l1, l2 = rel_lum(rgb1), rel_lum(rgb2)
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)


def to_lab(rgb):
    """sRGB → CIELAB（D65）。"""
    r, g, b = (_lin(v) for v in rgb)
    x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047
    y = (0.2126729 * r + 0.7151522 * g + 0.0721750 * b)
    z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883

    def f(t):
        return t ** (1 / 3) if t > 216 / 24389 else (24389 / 27 * t + 16) / 116
    fx, fy, fz = f(x), f(y), f(z)
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))


def chroma(lab):
    return math.hypot(lab[1], lab[2])


def hue_deg(lab):
    return math.degrees(math.atan2(lab[2], lab[1])) % 360


def ciede2000(lab1, lab2):
    """CIEDE2000 の色差（Sharma ほか 2005 の式）。"""
    L1, a1, b1 = lab1
    L2, a2, b2 = lab2
    C1, C2 = math.hypot(a1, b1), math.hypot(a2, b2)
    Cb = (C1 + C2) / 2
    G = 0.5 * (1 - math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)))
    a1p, a2p = (1 + G) * a1, (1 + G) * a2
    C1p, C2p = math.hypot(a1p, b1), math.hypot(a2p, b2)
    h1p = math.degrees(math.atan2(b1, a1p)) % 360 if (a1p or b1) else 0.0
    h2p = math.degrees(math.atan2(b2, a2p)) % 360 if (a2p or b2) else 0.0
    dLp, dCp = L2 - L1, C2p - C1p
    if C1p * C2p == 0:
        dhp = 0.0
    else:
        dhp = h2p - h1p
        if dhp > 180:
            dhp -= 360
        elif dhp < -180:
            dhp += 360
    dHp = 2 * math.sqrt(C1p * C2p) * math.sin(math.radians(dhp / 2))
    Lbp, Cbp = (L1 + L2) / 2, (C1p + C2p) / 2
    if C1p * C2p == 0:
        hbp = h1p + h2p
    elif abs(h1p - h2p) <= 180:
        hbp = (h1p + h2p) / 2
    elif h1p + h2p < 360:
        hbp = (h1p + h2p + 360) / 2
    else:
        hbp = (h1p + h2p - 360) / 2
    T = (1 - 0.17 * math.cos(math.radians(hbp - 30)) + 0.24 * math.cos(math.radians(2 * hbp))
         + 0.32 * math.cos(math.radians(3 * hbp + 6)) - 0.20 * math.cos(math.radians(4 * hbp - 63)))
    dth = 30 * math.exp(-(((hbp - 275) / 25) ** 2))
    Rc = 2 * math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7))
    Sl = 1 + 0.015 * (Lbp - 50) ** 2 / math.sqrt(20 + (Lbp - 50) ** 2)
    Sc = 1 + 0.045 * Cbp
    Sh = 1 + 0.015 * Cbp * T
    Rt = -math.sin(math.radians(2 * dth)) * Rc
    return math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh))


IDENT = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)


def mmul(m, n):
    a, b, c, d, e, f = m
    A, B, C, D, E, F = n
    return (a * A + c * B, b * A + d * B, a * C + c * D, b * C + d * D, a * E + c * F + e, b * E + d * F + f)


def mapply(m, x, y):
    a, b, c, d, e, f = m
    return (a * x + c * y + e, b * x + d * y + f)


def mscale(m):
    return math.sqrt(abs(m[0] * m[3] - m[1] * m[2]))


def parse_transform(s):
    m = IDENT
    for name, args in re.findall(r'(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)', s or ''):
        v = [float(x) for x in _num_re.findall(args)]
        if name == 'matrix' and len(v) == 6:
            t = tuple(v)
        elif name == 'translate':
            t = (1, 0, 0, 1, v[0] if v else 0, v[1] if len(v) > 1 else 0)
        elif name == 'scale':
            sx = v[0] if v else 1
            t = (sx, 0, 0, v[1] if len(v) > 1 else sx, 0, 0)
        elif name == 'rotate':
            a = math.radians(v[0] if v else 0)
            t = (math.cos(a), math.sin(a), -math.sin(a), math.cos(a), 0, 0)
            if len(v) >= 3:
                t = mmul(mmul((1, 0, 0, 1, v[1], v[2]), t), (1, 0, 0, 1, -v[1], -v[2]))
        elif name == 'skewX':
            t = (1, 0, math.tan(math.radians(v[0] if v else 0)), 1, 0, 0)
        elif name == 'skewY':
            t = (1, math.tan(math.radians(v[0] if v else 0)), 0, 1, 0, 0)
        else:
            continue
        m = mmul(m, t)
    return m


# ---------------------------------------------------------------- パス
def _read_arc_args(s):
    out, i, n = [], 0, len(s)
    while True:
        grp = []
        for k in range(7):
            while i < n and s[i] in ' ,\t\r\n':
                i += 1
            if i >= n:
                break
            if k in (3, 4):
                if s[i] in '01':
                    grp.append(float(s[i]))
                    i += 1
                    continue
                return out
            m = _num_re.match(s, i)
            if not m:
                return out
            grp.append(float(m.group(0)))
            i = m.end()
        if len(grp) < 7:
            return out
        out.append(grp)


def arc_points(x1, y1, rx, ry, phi, fa, fs, x2, y2):
    """円弧（SVG の端点の表し方）→ 折れ線の点と (rx, ry, 開きの角度)。SVG 1.1 付録 F.6.5。"""
    if rx == 0 or ry == 0 or (x1 == x2 and y1 == y2):
        return [(x2, y2)], None
    rx, ry = abs(rx), abs(ry)
    p = math.radians(phi)
    cp, sp = math.cos(p), math.sin(p)
    dx, dy = (x1 - x2) / 2, (y1 - y2) / 2
    x1p, y1p = cp * dx + sp * dy, -sp * dx + cp * dy
    lam = x1p ** 2 / rx ** 2 + y1p ** 2 / ry ** 2
    if lam > 1:
        rx, ry = rx * math.sqrt(lam), ry * math.sqrt(lam)
    num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
    den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
    co = math.sqrt(max(0.0, num / den)) if den else 0.0
    if fa == fs:
        co = -co
    cxp, cyp = co * rx * y1p / ry, -co * ry * x1p / rx
    cx = cp * cxp - sp * cyp + (x1 + x2) / 2
    cy = sp * cxp + cp * cyp + (y1 + y2) / 2

    def ang(ux, uy, vx, vy):
        return math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
    t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
    dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
    if not fs and dt > 0:
        dt -= 2 * math.pi
    elif fs and dt < 0:
        dt += 2 * math.pi
    nseg = max(4, int(abs(dt) / (math.pi / 24)) + 1)
    pts = []
    for k in range(1, nseg + 1):
        t = t1 + dt * k / nseg
        pts.append((cx + rx * math.cos(t) * cp - ry * math.sin(t) * sp,
                    cy + rx * math.cos(t) * sp + ry * math.sin(t) * cp))
    return pts, (rx, ry, abs(math.degrees(dt)))


def flatten_path(d):
    """パスのデータ → ([(点の列, 閉じているか)], [(rx, ry, 角度)])。"""
    subs, arcs, cur = [], [], []
    x = y = sx = sy = 0.0
    lc = None       # 直前の 3 次の制御点
    lq = None       # 直前の 2 次の制御点
    for cmd, args in re.findall(r'([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)', d or ''):
        C, rel = cmd.upper(), cmd.islower()

        def add(nx, ny):
            nonlocal cur
            if not cur:
                cur = [(x, y)]
            cur.append((nx, ny))
        if C == 'Z':
            if cur:
                subs.append((cur, True))
            cur = []
            x, y = sx, sy
            lc = lq = None
            continue
        if C == 'A':
            for rx, ry, ph, fa, fs, ex, ey in _read_arc_args(args):
                if rel:
                    ex, ey = x + ex, y + ey
                pts, info = arc_points(x, y, rx, ry, ph, int(fa), int(fs), ex, ey)
                if info:
                    arcs.append(info)
                for px, py in pts:
                    add(px, py)
                x, y = ex, ey
            lc = lq = None
            continue
        v = [float(t) for t in _num_re.findall(args)]
        if C == 'M':
            for i in range(0, len(v) - 1, 2):
                nx, ny = (x + v[i], y + v[i + 1]) if rel else (v[i], v[i + 1])
                if i == 0:
                    if cur:
                        subs.append((cur, _returns(cur)))
                    cur = [(nx, ny)]
                    sx, sy = nx, ny
                else:
                    add(nx, ny)
                x, y = nx, ny
            lc = lq = None
        elif C == 'L':
            for i in range(0, len(v) - 1, 2):
                nx, ny = (x + v[i], y + v[i + 1]) if rel else (v[i], v[i + 1])
                add(nx, ny)
                x, y = nx, ny
            lc = lq = None
        elif C == 'H':
            for t in v:
                nx = x + t if rel else t
                add(nx, y)
                x = nx
            lc = lq = None
        elif C == 'V':
            for t in v:
                ny = y + t if rel else t
                add(x, ny)
                y = ny
            lc = lq = None
        elif C in ('C', 'S'):
            step = 6 if C == 'C' else 4
            for i in range(0, len(v) - step + 1, step):
                if C == 'C':
                    c1 = (x + v[i], y + v[i + 1]) if rel else (v[i], v[i + 1])
                    c2 = (x + v[i + 2], y + v[i + 3]) if rel else (v[i + 2], v[i + 3])
                    e = (x + v[i + 4], y + v[i + 5]) if rel else (v[i + 4], v[i + 5])
                else:
                    c1 = (2 * x - lc[0], 2 * y - lc[1]) if lc else (x, y)
                    c2 = (x + v[i], y + v[i + 1]) if rel else (v[i], v[i + 1])
                    e = (x + v[i + 2], y + v[i + 3]) if rel else (v[i + 2], v[i + 3])
                for k in range(1, 13):
                    t = k / 12
                    mt = 1 - t
                    add(mt ** 3 * x + 3 * mt * mt * t * c1[0] + 3 * mt * t * t * c2[0] + t ** 3 * e[0],
                        mt ** 3 * y + 3 * mt * mt * t * c1[1] + 3 * mt * t * t * c2[1] + t ** 3 * e[1])
                lc = c2
                x, y = e
            lq = None
        elif C in ('Q', 'T'):
            step = 4 if C == 'Q' else 2
            for i in range(0, len(v) - step + 1, step):
                if C == 'Q':
                    c1 = (x + v[i], y + v[i + 1]) if rel else (v[i], v[i + 1])
                    e = (x + v[i + 2], y + v[i + 3]) if rel else (v[i + 2], v[i + 3])
                else:
                    c1 = (2 * x - lq[0], 2 * y - lq[1]) if lq else (x, y)
                    e = (x + v[i], y + v[i + 1]) if rel else (v[i], v[i + 1])
                for k in range(1, 11):
                    t = k / 10
                    mt = 1 - t
                    add(mt * mt * x + 2 * mt * t * c1[0] + t * t * e[0], mt * mt * y + 2 * mt * t * c1[1] + t * t * e[1])
                lq = c1
                x, y = e
            lc = None
    if cur and len(cur) > 1:
        subs.append((cur, _returns(cur)))
    return subs, arcs


def _returns(pts):
    """Z が無くても終点が始点に戻っていれば閉じた形とみなす（円を 2 つの円弧で描く書き方など）。"""
    return len(pts) > 2 and math.dist(pts[0], pts[-1]) <= 1e-6 * max(1.0, abs(pts[0][0]) + abs(pts[0][1]))


def poly_len(pts, closed):
    L = sum(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1))
    if closed and len(pts) > 2:
        L += math.dist(pts[-1], pts[0])
    return L


def signed_area(pts):
    return 0.5 * sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1]
                     for i in range(len(pts)))


def bbox_of(pts):
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return (min(xs), min(ys), max(xs), max(ys))


def compound_area(subs):
    """穴のある形の面積。外接矩形が大きい形に入っている形は穴として引く（巻き方向によらない近似）。"""
    items = [(abs(signed_area(p)), bbox_of(p)) for p, _ in subs if len(p) >= 3]
    items.sort(key=lambda t: -t[0])
    total = 0.0
    for i, (a, bb) in enumerate(items):
        inside = any(b2[0] <= bb[0] + 1e-9 and b2[1] <= bb[1] + 1e-9 and b2[2] >= bb[2] - 1e-9
                     and b2[3] >= bb[3] - 1e-9 and a2 > a for a2, b2 in items[:i])
        total += -a if inside else a
    return max(0.0, total)


def is_convex(poly):
    sign = 0
    n = len(poly)
    for i in range(n):
        a, b, c = poly[i], poly[(i + 1) % n], poly[(i + 2) % n]
        cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
        if abs(cr) > 1e-12:
            if sign and (cr > 0) != (sign > 0):
                return False
            sign = 1 if cr > 0 else -1
    return True


def _side(p, a, b, o):
    return o * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]))


def _isect(p, q, a, b):
    (x1, y1), (x2, y2), (x3, y3), (x4, y4) = p, q, a, b
    den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if den == 0:
        return q
    t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
    return (x1 + t * (x2 - x1), y1 + t * (y2 - y1))


def clip_poly_convex(subject, clip):
    """多角形を凸の多角形で切り抜く（Sutherland–Hodgman）。"""
    o = 1 if signed_area(clip) > 0 else -1
    out = list(subject)
    for i in range(len(clip)):
        a, b = clip[i], clip[(i + 1) % len(clip)]
        inp, out = out, []
        if not inp:
            break
        s = inp[-1]
        for e in inp:
            if _side(e, a, b, o) >= -1e-12:
                if _side(s, a, b, o) < -1e-12:
                    out.append(_isect(s, e, a, b))
                out.append(e)
            elif _side(s, a, b, o) >= -1e-12:
                out.append(_isect(s, e, a, b))
            s = e
    return out


def clip_seg_convex(p, q, clip):
    """線分を凸の多角形で切り抜く（Cyrus–Beck）。外なら None。"""
    o = 1 if signed_area(clip) > 0 else -1
    t0, t1 = 0.0, 1.0
    dx, dy = q[0] - p[0], q[1] - p[1]
    for i in range(len(clip)):
        a, b = clip[i], clip[(i + 1) % len(clip)]
        fp = _side(p, a, b, o)
        fd = o * ((b[0] - a[0]) * dy - (b[1] - a[1]) * dx)
        if fd == 0:
            if fp < 0:
                return None
        else:
            t = -fp / fd
            if fd > 0:
                t0 = max(t0, t)
            else:
                t1 = min(t1, t)
            if t0 > t1:
                return None
    return (p[0] + t0 * dx, p[1] + t0 * dy), (p[0] + t1 * dx, p[1] + t1 * dy)


def clip_polylines(subs, clip):
    """折れ線（閉じた形はその辺）を凸の多角形で切り抜き、開いた折れ線の列にする。"""
    out = []
    for pts, closed in subs:
        seq = pts + ([pts[0]] if closed and len(pts) > 2 else [])
        cur = []
        for i in range(len(seq) - 1):
            r = clip_seg_convex(seq[i], seq[i + 1], clip)
            if r is None:
                if len(cur) > 1:
                    out.append((cur, False))
                cur = []
                continue
            a, b = r
            if cur and math.dist(cur[-1], a) < 1e-9:
                cur.append(b)
            else:
                if len(cur) > 1:
                    out.append((cur, False))
                cur = [a, b]
        if len(cur) > 1:
            out.append((cur, False))
    return out


def local_geometry(el, tag, em):
    """図形の要素 → ([(点の列, 閉じているか)], 円弧の一覧, 角丸の半径, 円の半径)"""
    g = lambda k, d=0.0: first_len(el.get(k), d, em)  # noqa: E731
    if tag == 'path':
        subs, arcs = flatten_path(el.get('d', ''))
        return subs, arcs, 0.0, None
    if tag == 'rect':
        x, y, w, h = g('x'), g('y'), g('width'), g('height')
        if w <= 0 or h <= 0:
            return [], [], 0.0, None
        rx = max(g('rx'), g('ry'))
        return [([(x, y), (x + w, y), (x + w, y + h), (x, y + h)], True)], [], rx, None
    if tag in ('circle', 'ellipse'):
        cx, cy = g('cx'), g('cy')
        if tag == 'circle':
            rx = ry = g('r')
        else:
            rx, ry = g('rx'), g('ry')
        if rx <= 0 or ry <= 0:
            return [], [], 0.0, None
        pts = [(cx + rx * math.cos(2 * math.pi * k / 48), cy + ry * math.sin(2 * math.pi * k / 48)) for k in range(48)]
        return [(pts, True)], [(rx, ry, 360.0)], 0.0, (rx + ry) / 2
    if tag == 'line':
        return [([(g('x1'), g('y1')), (g('x2'), g('y2'))], False)], [], 0.0, None
    if tag in ('polyline', 'polygon'):
        v = [float(t) for t in _num_re.findall(el.get('points', ''))]
        pts = [(v[i], v[i + 1]) for i in range(0, len(v) - 1, 2)]
        if len(pts) < 2:
            return [], [], 0.0, None
        return [(pts, tag == 'polygon')], [], 0.0, None
    return [], [], 0.0, None


# ---------------------------------------------------------------- CSS（簡単な選択子だけ）
def parse_decls(s):
    out = {}
    for part in (s or '').split(';'):
        if ':' in part:
            k, v = part.split(':', 1)
            k = k.strip().lower()
            if k:
                out[k] = v.replace('!important', '').strip()
    return out


_cmp_re = re.compile(r'^(\*|[A-Za-z][\w-]*)?((?:[#.][\w-]+)*)$')


def parse_selector(sel):
    toks = sel.replace('>', ' > ').split()
    parts, comb = [], ' '
    for t in toks:
        if t == '>':
            comb = '>'
            continue
        m = _cmp_re.match(t)
        if not m or not t:
            return None
        tag = m.group(1) if m.group(1) and m.group(1) != '*' else None
        parts.append((comb, tag, re.findall(r'#([\w-]+)', m.group(2)), re.findall(r'\.([\w-]+)', m.group(2))))
        comb = ' '
    if not parts:
        return None
    spec = (sum(len(p[2]) for p in parts), sum(len(p[3]) for p in parts), sum(1 for p in parts if p[1]))
    return parts, spec


def _cmatch(el, tag, ids, cls):
    if tag and local(el.tag) != tag:
        return False
    if ids and el.get('id') not in ids:
        return False
    if cls and not set(cls) <= set((el.get('class') or '').split()):
        return False
    return True


def sel_match(parts, el, anc):
    comb, tag, ids, cls = parts[-1]
    if not _cmatch(el, tag, ids, cls):
        return False
    if len(parts) == 1:
        return True
    rest = parts[:-1]
    if comb == '>':
        return bool(anc) and sel_match(rest, anc[-1], anc[:-1])
    return any(sel_match(rest, anc[i], anc[:i]) for i in range(len(anc) - 1, -1, -1))


PROPS = ('fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray',
         'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-size', 'font-family', 'font-weight', 'font-style',
         'text-anchor', 'dominant-baseline', 'visibility', 'display', 'color', 'filter', 'marker', 'marker-start',
         'marker-mid', 'marker-end', 'mask', 'clip-path')
INHERITED = {'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray',
             'stroke-linecap', 'stroke-linejoin', 'font-size', 'font-family', 'font-weight', 'font-style',
             'text-anchor', 'dominant-baseline', 'visibility', 'color', 'marker-start', 'marker-mid', 'marker-end',
             '_fs', '_sw', '_gop', '_fs_set', '_sw_set', '_ff_set'}
NONRENDER = {'defs', 'symbol', 'clipPath', 'mask', 'pattern', 'marker', 'linearGradient', 'radialGradient',
             'filter', 'style', 'title', 'desc', 'metadata', 'script'}
SHAPES = ('path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon')


def _f(v, d=1.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return d


def is_cjk(ch):
    return unicodedata.east_asian_width(ch) in ('W', 'F')


def has_kanji(s):
    return any('一' <= ch <= '鿿' for ch in s)


def is_emoji(ch):
    o = ord(ch)
    return 0x1F300 <= o <= 0x1FAFF or 0x2600 <= o <= 0x27BF or o == 0xFE0F or 0x1F000 <= o <= 0x1F2FF


def text_em_width(s):
    w = 0.0
    for ch in s:
        if ch == ' ':
            w += 0.28
        elif is_cjk(ch):
            w += 1.0
        elif ch in ".,:;'’|!il":
            w += 0.3
        else:
            w += 0.56
    return w


class Shape:
    __slots__ = ('tag', 'roles', 'ids', 'subs', 'bbox', 'length', 'area', 'area_root', 'fill', 'fill_rgb', 'fo',
                 'stroke', 'stroke_rgb', 'so', 'sw', 'dash', 'arcs', 'rx', 'circle_r', 'markers', 'hatch', 'el',
                 'sw_default', 'fpolys')

    def __init__(self, **kw):
        for k in self.__slots__:
            setattr(self, k, kw.get(k))


class Text:
    __slots__ = ('text', 'fs', 'family', 'weight', 'fill_rgb', 'bbox', 'angle', 'roles', 'ids', 'x', 'y',
                 'fs_default', 'ff_default')

    def __init__(self, **kw):
        for k in self.__slots__:
            setattr(self, k, kw.get(k))


# ---------------------------------------------------------------- 文書を読む
class Doc:
    def __init__(self, path, kind=None, mpu=None, reduce=1.0, scale=None):
        self.path = path
        self.notes = []
        try:
            tree = ET.parse(path)
        except ET.ParseError as e:
            raise ValueError('XML として読めない：%s' % e)
        self.root = root = tree.getroot()
        if local(root.tag) != 'svg':
            raise ValueError('svg 要素で始まらない')
        self.ids = {}
        for el in root.iter():
            i = el.get('id')
            if i and i not in self.ids:
                self.ids[i] = el
        self.css_text = '\n'.join((el.text or '') for el in root.iter() if local(el.tag) == 'style')
        self.rules = []
        css = re.sub(r'/\*.*?\*/', '', self.css_text, flags=re.S)
        order = 0
        for m in re.finditer(r'([^{}]+)\{([^{}]*)\}', css):
            decls = parse_decls(m.group(2))
            for sel in m.group(1).split(','):
                sel = sel.strip()
                if not sel or '@' in sel or ':' in sel or '[' in sel:
                    continue
                p = parse_selector(sel)
                if p:
                    self.rules.append((p[1], order, p[0], decls))
                    order += 1
        self.rules.sort(key=lambda r: (r[0], r[1]))
        # 版面と単位
        vb = root.get('viewBox')
        v = [float(t) for t in _num_re.findall(vb)] if vb else []
        if len(v) >= 4 and v[2] > 0 and v[3] > 0:
            self.vb = tuple(v[:4])
        else:
            w = parse_length(root.get('width')) or 300.0
            h = parse_length(root.get('height')) or 150.0
            self.vb = (0.0, 0.0, w, h)
            self.notes.append('viewBox が無い。width・height を版面とした')
        wm = _len_re.match(root.get('width') or '')
        if mpu:
            self.mpu, self.mpu_src = float(mpu), '指定'
        elif wm and wm.group(2) in ('mm', 'cm', 'in', 'pt', 'pc'):
            self.mpu = parse_length(root.get('width')) / UNIT_UU['mm'] / self.vb[2]
            self.mpu_src = 'width=%s' % root.get('width')
        else:
            self.mpu, self.mpu_src = 1.0, 'SPEC §1（1 単位＝紙の 1 mm）'
        self.reduce = reduce
        self.k = self.mpu * reduce      # 根の単位 → 刷り上がりの mm
        self.kind = kind or 'generic'
        self.scale = scale
        self.shapes, self.texts, self.images = [], [], []
        self.used_filters, self.used_grads, self.pattern_spacing = [], [], []
        self.css_shadow = bool(re.search(r'(box-shadow|text-shadow|drop-shadow)', self.css_text))
        self._clips = []
        base = {'fill': 'black', 'stroke': 'none', '_fs': 16.0, '_sw': 1.0, '_gop': 1.0, 'font-family': 'serif',
                '_fs_set': False, '_sw_set': False, '_ff_set': False}
        self._walk(root, IDENT, base, [], frozenset(), (), 0, True)

    # -- 様式の計算（表示属性 < CSS < style 属性）
    def _style(self, el, pst, anc):
        st = {k: v for k, v in pst.items() if k in INHERITED}
        decl = {}
        for k in PROPS:
            v = el.get(k)
            if v is not None:
                decl[k] = v
        for _spec, _o, parts, d in self.rules:
            if sel_match(parts, el, anc):
                decl.update(d)
        decl.update(parse_decls(el.get('style')))
        for k, v in decl.items():
            v = str(v).strip()
            if v == 'inherit':
                if k in pst:
                    st[k] = pst[k]
                continue
            st[k] = v
        if 'marker' in decl:
            for mk in ('marker-start', 'marker-mid', 'marker-end'):
                if mk not in decl:
                    st[mk] = decl['marker']
        pfs = pst.get('_fs', 16.0)
        if 'font-size' in decl:
            fs = parse_length(decl['font-size'], em=pfs, pct_base=pfs)
            if fs is None:
                kw = {'xx-small': 9, 'x-small': 10, 'small': 13, 'medium': 16, 'large': 18, 'x-large': 24,
                      'xx-large': 32}
                fs = kw.get(str(decl['font-size']).strip().lower(), pfs)
            st['_fs'] = fs
            st['_fs_set'] = True
        if 'stroke-width' in decl:
            sw = parse_length(decl['stroke-width'], em=st.get('_fs', 16.0))
            if sw is not None:
                st['_sw'] = sw
                st['_sw_set'] = True
        if 'font-family' in decl:
            st['_ff_set'] = True
        st['_gop'] = pst.get('_gop', 1.0) * _f(decl.get('opacity', '1'))
        return st

    def _walk(self, el, ctm, pst, anc, roles, idpath, depth, is_root=False):
        """clip-path を切り抜きの多角形の積み重ねに入れてから要素を読む。"""
        cp = el.get('clip-path') or parse_decls(el.get('style')).get('clip-path')
        pushed = False
        if cp and cp.strip() != 'none' and not is_root:
            cm = mmul(ctm, parse_transform(el.get('transform'))) if el.get('transform') else ctm
            poly = self._clip_poly(cp, cm)
            if poly:
                self._clips.append(poly)
                pushed = True
        try:
            self._walk_inner(el, ctm, pst, anc, roles, idpath, depth, is_root)
        finally:
            if pushed:
                self._clips.pop()

    def _clip_poly(self, cp, ctm):
        c = parse_color(cp)
        cel = self.ids.get(c[1]) if c[0] == 'url' else None
        if cel is None or local(cel.tag) != 'clipPath':
            return None
        if cel.get('clipPathUnits') == 'objectBoundingBox':
            self.notes.append('clipPathUnits=objectBoundingBox の切り抜きは無視した')
            return None
        base = mmul(ctm, parse_transform(cel.get('transform'))) if cel.get('transform') else ctm
        polys = []
        for ch in cel.iter():
            t = local(ch.tag)
            if t not in SHAPES or t in ('line', 'polyline'):
                continue
            m = mmul(base, parse_transform(ch.get('transform'))) if ch.get('transform') else base
            subs, _a, _r, _c = local_geometry(ch, t, 16.0)
            for pts, _cl in subs:
                if len(pts) >= 3:
                    polys.append([mapply(m, x, y) for x, y in pts])
        if not polys:
            return None
        if len(polys) == 1 and is_convex(polys[0]):
            return polys[0]
        bb = bbox_of([p for q in polys for p in q])
        return [(bb[0], bb[1]), (bb[2], bb[1]), (bb[2], bb[3]), (bb[0], bb[3])]

    def _walk_inner(self, el, ctm, pst, anc, roles, idpath, depth, is_root=False):
        if depth > 40:
            return
        tag = local(el.tag)
        if tag in NONRENDER and not is_root:
            return
        st = self._style(el, pst, anc)
        if st.get('display', '').strip() == 'none':
            return
        if not is_root and el.get('transform'):
            ctm = mmul(ctm, parse_transform(el.get('transform')))
        extra = (el.get('class') or '').split() + (el.get('data-ad-role') or '').split()
        if extra:
            roles = roles | frozenset(extra)
        if el.get('id'):
            idpath = idpath + (el.get('id'),)
        flt = st.get('filter')
        if flt and flt.strip() != 'none':
            self.used_filters.append((flt, tag, idpath))
        if is_root or tag in ('g', 'a', 'switch'):
            for ch in el:
                self._walk(ch, ctm, st, anc + [el], roles, idpath, depth + 1)
            return
        if tag == 'svg':
            t = (1, 0, 0, 1, first_len(el.get('x')), first_len(el.get('y')))
            w, h = parse_length(el.get('width')), parse_length(el.get('height'))
            v = [float(x) for x in _num_re.findall(el.get('viewBox') or '')]
            if len(v) >= 4 and w and h and v[2] and v[3]:
                s = min(w / v[2], h / v[3])
                t = mmul(t, (s, 0, 0, s, -v[0] * s, -v[1] * s))
            for ch in el:
                self._walk(ch, mmul(ctm, t), st, anc + [el], roles, idpath, depth + 1)
            return
        if tag == 'use':
            href = el.get('href') or el.get(XLINK_HREF)
            if not href or not href.startswith('#'):
                return
            tgt = self.ids.get(href[1:])
            if tgt is None:
                self.notes.append('use の参照先 %s が無い' % href)
                return
            ctm2 = mmul(ctm, (1, 0, 0, 1, first_len(el.get('x')), first_len(el.get('y'))))
            if local(tgt.tag) == 'symbol':
                tst = self._style(tgt, st, anc + [el])
                w, h = parse_length(el.get('width')), parse_length(el.get('height'))
                v = [float(x) for x in _num_re.findall(tgt.get('viewBox') or '')]
                if len(v) >= 4 and w and h and v[2] and v[3]:
                    s = min(w / v[2], h / v[3])
                    ctm2 = mmul(ctm2, (s, 0, 0, s, -v[0] * s, -v[1] * s))
                troles = roles | frozenset((tgt.get('class') or '').split())
                for ch in tgt:
                    self._walk(ch, ctm2, tst, anc + [el, tgt], troles, idpath, depth + 1)
            elif local(tgt.tag) not in NONRENDER:
                self._walk(tgt, ctm2, st, anc + [el], roles, idpath, depth + 1)
            return
        if tag in SHAPES:
            self._shape(el, tag, ctm, st, roles, idpath)
            return
        if tag == 'text':
            self._text(el, ctm, st, anc, roles, idpath)
            return
        if tag == 'image':
            self.images.append(idpath)
            return
        if tag == 'foreignObject':
            self.notes.append('foreignObject の中は点検していない')
            return
        for ch in el:
            self._walk(ch, ctm, st, anc + [el], roles, idpath, depth + 1)

    def _resolve(self, c, st):
        if c[0] == 'current':
            c = parse_color(st.get('color', 'black'))
        return c

    def _shape(self, el, tag, ctm, st, roles, idpath, hatch=False):
        if st.get('visibility', 'visible').strip() in ('hidden', 'collapse'):
            return
        subs, arcs, rx, cr = local_geometry(el, tag, st.get('_fs', 16.0))
        if not subs:
            return
        s = mscale(ctm)
        k = self.k
        rs = [([mapply(ctm, x, y) for x, y in pts], closed) for pts, closed in subs]
        clipped_area = None
        closed_polys = [pts for pts, _closed in rs if len(pts) >= 3]   # 塗りは開いた部分も閉じて塗る
        if self._clips:
            for cpoly in self._clips:
                rs = clip_polylines(rs, cpoly)
                closed_polys = [q for q in (clip_poly_convex(pp, cpoly) for pp in closed_polys) if len(q) >= 3]
            if not rs and not closed_polys:
                return
            clipped_area = compound_area([(q, True) for q in closed_polys])
            if not rs:
                rs = [(q, True) for q in closed_polys]
        fill = self._resolve(parse_color(st.get('fill', 'black')), st)
        stroke = self._resolve(parse_color(st.get('stroke', 'none')), st)
        gop = st.get('_gop', 1.0)
        fo = _f(st.get('fill-opacity', '1')) * gop
        so = _f(st.get('stroke-opacity', '1')) * gop
        if fill[0] == 'rgb':
            fo *= fill[2]
        if stroke[0] == 'rgb':
            so *= stroke[2]
        sw = st.get('_sw', 1.0) * s * k
        dash = []
        da = st.get('stroke-dasharray', 'none')
        if da and da.strip() != 'none':
            dl = [parse_length(t, em=st.get('_fs', 16.0)) for t in re.split(r'[\s,]+', da.strip()) if t]
            dl = [x for x in dl if x is not None]
            if len(dl) % 2 == 1:
                dl = dl * 2
            if any(x > 0 for x in dl):
                dash = [x * s * k for x in dl]
        if tag == 'line' or fill[0] == 'none':
            area_root = 0.0
        else:
            area_root = clipped_area if clipped_area is not None else compound_area(rs)
        allpts = [p for pts, _ in rs for p in pts]
        bb = bbox_of(allpts)
        if stroke[0] != 'none' and so > 0:
            pad = sw / k / 2
            bb = (bb[0] - pad, bb[1] - pad, bb[2] + pad, bb[3] + pad)
        markers = [st.get(m) for m in ('marker-start', 'marker-mid', 'marker-end')
                   if st.get(m) and st.get(m).strip() != 'none']
        rec = Shape(tag=tag, roles=roles, ids=idpath, subs=rs, bbox=bb,
                    length=sum(poly_len(p, c) for p, c in rs) * k, area=area_root * k * k, area_root=area_root,
                    fill=fill, fill_rgb=fill[1] if fill[0] == 'rgb' else None, fo=fo,
                    stroke=stroke, stroke_rgb=stroke[1] if stroke[0] == 'rgb' else None, so=so, sw=sw,
                    dash=dash, arcs=[(a[0] * s * k, a[1] * s * k, a[2]) for a in arcs], rx=rx * s * k,
                    circle_r=cr * s * k if cr else None, markers=markers, hatch=hatch, el=el,
                    sw_default=not st.get('_sw_set', False), fpolys=closed_polys)
        self.shapes.append(rec)
        for c, what in ((fill, 'fill'), (stroke, 'stroke')):
            if c[0] == 'url':
                t = self.ids.get(c[1])
                tt = local(t.tag) if t is not None else ''
                if tt in ('linearGradient', 'radialGradient', 'meshgradient'):
                    self.used_grads.append((c[1], what, roles, idpath))
                elif tt == 'pattern' and what == 'fill' and not hatch:
                    self._pattern(t, rec, ctm, roles, idpath)
            elif c[0] == 'unknown':
                self.notes.append('読めない色 %s（%s）' % (c[1], '/'.join(idpath) or tag))

    def _pattern(self, pel, rec, ctm, roles, idpath, depth=0):
        if not list(pel) and depth < 3:
            href = pel.get('href') or pel.get(XLINK_HREF)
            if href and href.startswith('#') and self.ids.get(href[1:]) is not None:
                tgt = self.ids[href[1:]]
                for a in ('width', 'height', 'patternUnits', 'patternTransform'):
                    if pel.get(a) is not None and tgt.get(a) is None:
                        tgt.set(a, pel.get(a))
                return self._pattern(tgt, rec, ctm, roles, idpath, depth + 1)
        w = first_len(pel.get('width'), 0.0)
        h = first_len(pel.get('height'), 0.0)
        s0 = mscale(ctm)
        if pel.get('patternUnits', 'objectBoundingBox') == 'objectBoundingBox' and s0 > 0:
            bw = (rec.bbox[2] - rec.bbox[0]) / s0
            bh = (rec.bbox[3] - rec.bbox[1]) / s0
            w, h = w * bw, h * bh
        pt = parse_transform(pel.get('patternTransform'))
        stot = s0 * mscale(pt)
        if w <= 0 or h <= 0 or stot <= 0 or rec.area_root <= 0:
            return
        tiles = rec.area_root / (w * h * stot * stot)
        base = {'fill': 'black', 'stroke': 'none', '_fs': 16.0, '_sw': 1.0, '_gop': 1.0}
        pst = self._style(pel, base, [])
        maxsw = 0.0
        hroles = roles | frozenset(['_hatch'])

        def visit(node, m, nst, anc):
            nonlocal maxsw
            for ch in node:
                t = local(ch.tag)
                cst = self._style(ch, nst, anc)
                cm = mmul(m, parse_transform(ch.get('transform'))) if ch.get('transform') else m
                if t == 'g':
                    visit(ch, cm, cst, anc + [ch])
                elif t in SHAPES:
                    subs, _a, _r, _c = local_geometry(ch, t, cst.get('_fs', 16.0))
                    if not subs:
                        continue
                    cs = mscale(cm)
                    L = sum(poly_len([mapply(cm, x, y) for x, y in p], c) for p, c in subs)
                    stc = self._resolve(parse_color(cst.get('stroke', 'none')), cst)
                    flc = self._resolve(parse_color(cst.get('fill', 'black')), cst)
                    so = _f(cst.get('stroke-opacity', '1')) * cst.get('_gop', 1.0)
                    fo = _f(cst.get('fill-opacity', '1')) * cst.get('_gop', 1.0)
                    if stc[0] == 'rgb' and so > 0:
                        swm = cst.get('_sw', 1.0) * cs * stot * self.k
                        maxsw = max(maxsw, swm)
                        self.shapes.append(Shape(
                            tag=t, roles=hroles, ids=idpath, subs=[], bbox=rec.bbox, length=L * tiles * stot * self.k,
                            area=0.0, area_root=0.0, fill=('none',), fill_rgb=None, fo=0.0, stroke=stc,
                            stroke_rgb=stc[1], so=so * stc[2], sw=swm, dash=[], arcs=[], rx=0.0, circle_r=None,
                            markers=[], hatch=True, el=ch))
                    if flc[0] == 'rgb' and fo > 0 and t != 'line':
                        a = compound_area([([mapply(cm, x, y) for x, y in p], c) for p, c in subs])
                        if a > 0:
                            self.shapes.append(Shape(
                                tag=t, roles=hroles, ids=idpath, subs=[], bbox=rec.bbox, length=0.0,
                                area=a * tiles * (stot * self.k) ** 2, area_root=0.0, fill=flc, fill_rgb=flc[1],
                                fo=fo * flc[2], stroke=('none',), stroke_rgb=None, so=0.0, sw=0.0, dash=[], arcs=[],
                                rx=0.0, circle_r=None, markers=[], hatch=True, el=ch))
        visit(pel, IDENT, pst, [pel])
        if maxsw > 0:
            self.pattern_spacing.append((pel.get('id'), min(w, h) * stot * self.k, maxsw))

    def _text(self, el, ctm, st, anc, roles, idpath):
        segs = []
        x0 = first_len(el.get('x'), 0.0, st.get('_fs', 16.0))
        y0 = first_len(el.get('y'), 0.0, st.get('_fs', 16.0))
        cur = [x0 + first_len(el.get('dx'), 0.0), y0 + first_len(el.get('dy'), 0.0)]
        if el.text and el.text.strip():
            segs.append((el.text, cur[0], cur[1], st, roles))
            cur[0] += text_em_width(el.text) * st.get('_fs', 16.0)
        for ch in el:
            t = local(ch.tag)
            if t in ('tspan', 'textPath', 'a'):
                cst = self._style(ch, st, anc + [el])
                fs = cst.get('_fs', 16.0)
                if ch.get('x') is not None:
                    cur[0] = first_len(ch.get('x'), cur[0], fs)
                if ch.get('y') is not None:
                    cur[1] = first_len(ch.get('y'), cur[1], fs)
                cur[0] += first_len(ch.get('dx'), 0.0, fs)
                cur[1] += first_len(ch.get('dy'), 0.0, fs)
                txt = ''.join(ch.itertext())
                if txt.strip():
                    croles = roles | frozenset((ch.get('class') or '').split())
                    segs.append((txt, cur[0], cur[1], cst, croles))
                    cur[0] += text_em_width(txt) * fs
            if ch.tail and ch.tail.strip():
                segs.append((ch.tail, cur[0], cur[1], st, roles))
                cur[0] += text_em_width(ch.tail) * st.get('_fs', 16.0)
        s = mscale(ctm)
        ang = math.degrees(math.atan2(ctm[1], ctm[0]))
        for txt, x, y, cst, croles in segs:
            if cst.get('visibility', 'visible').strip() in ('hidden', 'collapse'):
                continue
            if cst.get('display', '').strip() == 'none':
                continue
            fs = cst.get('_fs', 16.0)
            w = text_em_width(txt.strip()) * fs
            anchor = cst.get('text-anchor', 'start').strip()
            xa = x - w / 2 if anchor == 'middle' else (x - w if anchor == 'end' else x)
            db = cst.get('dominant-baseline', 'auto').strip()
            if db in ('middle', 'central'):
                ya0, ya1 = y - 0.5 * fs, y + 0.5 * fs
            elif db in ('hanging', 'text-before-edge'):
                ya0, ya1 = y, y + fs
            elif any(is_cjk(c) for c in txt):
                ya0, ya1 = y - 0.88 * fs, y + 0.12 * fs
            else:                       # 欧文と数字：大文字の高さ約 0.72 em、ディセンダは g・j・p・q・y だけ
                ya0 = y - 0.74 * fs
                ya1 = y + (0.2 * fs if any(c in 'gjpqy,;' for c in txt) else 0.02 * fs)
            corners = [mapply(ctm, xa, ya0), mapply(ctm, xa + w, ya0), mapply(ctm, xa + w, ya1), mapply(ctm, xa, ya1)]
            fc = self._resolve(parse_color(cst.get('fill', 'black')), cst)
            fam = cst.get('font-family', 'serif')
            self.texts.append(Text(text=txt.strip(), fs=fs * s * self.k, family=fam,
                                   weight=str(cst.get('font-weight', 'normal')).strip(),
                                   fill_rgb=fc[1] if fc[0] == 'rgb' else None, bbox=bbox_of(corners),
                                   angle=ang, roles=croles, ids=idpath, x=mapply(ctm, x, y)[0],
                                   y=mapply(ctm, x, y)[1], fs_default=not cst.get('_fs_set', False),
                                   ff_default=not cst.get('_ff_set', False)))


# ---------------------------------------------------------------- 点検
SCALE_RE = re.compile(r'(?:^|[^\d])1\s*[:：/／]\s*([0-9]{1,5})(?![\d])|S\s*=\s*1\s*/\s*([0-9]{1,5})')
TITLE_RE = re.compile(r'^\s*(図|Fig\.?|Figure)\s*[0-9０-９]')
DIMNUM_RE = re.compile(r'^\s*\d{1,3}(?:[,，]\d{3})+\s*$|^\s*\d{2,5}\s*$|^\s*\d+\.\d+\s*m\s*$')
LEVEL_RE = re.compile(r'(GL|[0-9０-９RB]FL|\bFL\b|\bSL\b|\bCH\b|軒高|最高高さ|▽|▼|±0)')


def wmedian(pairs):
    """(値, 重み) の重み付き中央値。"""
    pairs = sorted(pairs)
    tot = sum(w for _, w in pairs)
    if tot <= 0:
        return pairs[len(pairs) // 2][0] if pairs else 0.0
    acc = 0.0
    for v, w in pairs:
        acc += w
        if acc >= tot / 2:
            return v
    return pairs[-1][0]


TATEGU_RE = re.compile(r'^\s*(AW|AD|SW|SD|WW|WD|PW|PD|SS|GD|GW|AG|SG|LD|LW)\s*-?\d*\s*$')
REF_RE = re.compile(r'GL|FL|境界|後退|道路|隣地|通り芯|基準|軒高|最高高さ|延焼|±0|\bSL\b')
SRC_RE = re.compile(r'出典|筆者|作成|引用|転載|改変|Source|Author|[Aa]dapted|after\s')
FLOW_RE = re.compile(r'流れ|動線|プロセス|手順|工程|フロー|循環|順序|flow|process|sequence', re.I)
DIAGRAM_WORDS = re.compile(r'図|plan|section|elevation|axon|diagram|ダイアグラム|アクソメ|パース')
DEFAULT_PALETTES = (
    ('Excel', ('#4472C4', '#ED7D31', '#FFC000', '#5B9BD5', '#70AD47', '#4F81BD', '#C0504D', '#9BBB59', '#8064A2',
               '#4BACC6', '#F79646')),
    ('matplotlib', ('#1F77B4', '#FF7F0E', '#2CA02C', '#D62728', '#9467BD', '#8C564B', '#E377C2', '#BCBD22',
                    '#17BECF')),
    ('ggplot2', ('#F8766D', '#00BA38', '#619CFF', '#00BFC4', '#C77CFF', '#7CAE00')),
    ('Stata', ('#1A476F', '#90353B', '#55752F')),
    ('CSS の原色', ('#FF0000', '#0000FF', '#00FF00', '#FFFF00', '#FF00FF', '#00FFFF', '#008000', '#FFA500')),
)
DEFAULT_BG = (('ggplot2 の灰の地', '#EBEBEB'), ('Stata の青灰の地', '#EAF2F3'), ('Excel 2003 の灰の地', '#C0C0C0'))


def norm_text(s):
    """比べるための文字列：語の文字（漢字・仮名・英数）だけを残す（絵文字・記号・空白を除く）。"""
    return re.sub(r'[\W_]', '', s or '')


def title_body(title):
    """図題から「図 N」と縮尺の括弧と 2 文目以降（出典など）を除いた主題。"""
    first = re.split(r'[。．]', title, maxsplit=1)[0]
    first = re.sub(r'^\s*(図|Fig\.?|Figure)\s*[0-9０-９]+[.:：\s　]*', '', first)
    first = re.sub(r'[（(][^（）()]*(1\s*[:：/]|縮尺|S\s*=)[^（）()]*[）)]', '', first)
    first = re.sub(r'1\s*[:：/]\s*\d+', '', first)
    return re.sub(r'[のとやはがをにへでも]$', '', norm_text(first))


def title_fragment(title):
    """図題が文として完結していなければ理由を返す（FIG-ARCHITECTURE AR-21・オーケストレーターの追記）。"""
    first = re.split(r'[。．]', title, maxsplit=1)[0].strip()
    body = re.sub(r'^\s*(図|Fig\.?|Figure)\s*[0-9０-９]+[.:：\s　]*', '', first)
    body = re.sub(r'[（(][^（）()]*[）)]\s*$', '', body).strip()
    if not re.match(r'^\s*(図|Fig\.?|Figure)\s*[0-9０-９]', title):
        return '「図 N」の番号が無い'
    if len(norm_text(body)) < 2:
        return '主題が無いか 1 字'
    if re.search(r'(…|\.\.\.|→|⇒)', body):
        return '矢印や省略記号でつないだ断片'
    if re.search(r'[のとやはがをにへでも、,・]$', body):
        return '助詞や読点で終わる'
    return ''


def seg_hits_rect(p, q, r):
    """線分 p–q が矩形 r=(x0,y0,x1,y1) の内部を通るか（Liang–Barsky）。"""
    (x0, y0), (x1, y1) = p, q
    dx, dy = x1 - x0, y1 - y0
    t0, t1 = 0.0, 1.0
    for pk, qk in ((-dx, x0 - r[0]), (dx, r[2] - x0), (-dy, y0 - r[1]), (dy, r[3] - y0)):
        if pk == 0:
            if qk < 0:
                return False
        else:
            t = qk / pk
            if pk < 0:
                t0 = max(t0, t)
            else:
                t1 = min(t1, t)
            if t0 > t1:
                return False
    return True


def point_in_shape(s, x, y):
    """偶奇の規則で点が形の内側か。閉じた部分が無ければ外接矩形で代える。"""
    closed = s.fpolys if s.fpolys else [pts for pts, c in s.subs if c and len(pts) >= 3]
    if not closed:
        b = s.bbox
        return b[0] <= x <= b[2] and b[1] <= y <= b[3]
    inside = False
    for pts in closed:
        n = len(pts)
        for i in range(n):
            (x1, y1), (x2, y2) = pts[i], pts[(i + 1) % n]
            if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
                inside = not inside
    return inside


def quarter_arc(pts):
    """折れ線が 90° 前後の円弧なら半径（mm ではなく根の単位）を返す。"""
    if len(pts) < 5:
        return None
    (x1, y1), (x2, y2), (x3, y3) = pts[0], pts[len(pts) // 2], pts[-1]
    den = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2))
    if abs(den) < 1e-12:
        return None
    ux = ((x1 * x1 + y1 * y1) * (y2 - y3) + (x2 * x2 + y2 * y2) * (y3 - y1) + (x3 * x3 + y3 * y3) * (y1 - y2)) / den
    uy = ((x1 * x1 + y1 * y1) * (x3 - x2) + (x2 * x2 + y2 * y2) * (x1 - x3) + (x3 * x3 + y3 * y3) * (x2 - x1)) / den
    r = math.dist((ux, uy), (x1, y1))
    if r <= 0 or any(abs(math.dist((ux, uy), p) - r) > 0.03 * r for p in pts):
        return None
    a1 = math.atan2(y1 - uy, x1 - ux)
    a3 = math.atan2(y3 - uy, x3 - ux)
    sweep = abs(math.degrees((a3 - a1 + math.pi) % (2 * math.pi) - math.pi))
    return r if 70 <= sweep <= 110 else None


def dashkind(s):
    """線種：solid（実線）・dashed（破線）・dotted（点線）・chain（一点鎖線）・double-chain（二点鎖線）。"""
    if not s.dash:
        return 'solid'
    segs = s.dash[0::2]
    if len(s.dash) >= 4 and max(segs) > 2.5 * min(segs):
        shorts = sum(1 for x in segs if x < max(segs) / 2.5)
        return 'double-chain' if shorts >= 2 else 'chain'
    if max(segs) <= 1.5 * s.sw:
        return 'dotted'
    return 'dashed'


def fmt(x, nd=2):
    return ('%.*f' % (nd, x)).rstrip('0').rstrip('.') if isinstance(x, float) else str(x)


class Checker:
    def __init__(self, doc, subject=True):
        self.d = doc
        self.F = []
        self.subject = subject
        x0, y0, w, h = doc.vb
        self.vbx = (x0, y0, x0 + w, y0 + h)
        self.frames = [s for s in doc.shapes if self._is_frame(s)]
        content = [s.bbox for s in doc.shapes if not self._is_frame(s) and not s.hatch] + [t.bbox for t in doc.texts]
        if content:
            self.cbb = (min(b[0] for b in content), min(b[1] for b in content),
                        max(b[2] for b in content), max(b[3] for b in content))
        else:
            self.cbb = self.vbx
        self.content_area = max(1e-9, (self.cbb[2] - self.cbb[0]) * (self.cbb[3] - self.cbb[1]) * doc.k * doc.k)
        self.strokes = [s for s in doc.shapes if s.stroke_rgb and s.so > 0.01 and s.sw > 0 and s.length > 0
                        and not self._is_frame(s)]
        self.tiers = self._tiers()
        self.scale = self._scale()
        self.title_first, self.title_full, self.title_parts = self._title()

    def _title(self):
        """図題：「図 N」の文字と、同じ行の続き（別の text に分けて書く図が多い）と、下に続く説明の行。"""
        T, k = self.d.texts, self.d.k
        parts = [t for t in T if 'ad-title' in t.roles]
        if parts:
            parts.sort(key=lambda t: (round(t.y, 2), t.x))
            tol = 0.35 * parts[0].fs / k
            first = [t for t in parts if abs(t.y - parts[0].y) <= tol]
            return '　'.join(t.text for t in first), ' '.join(t.text for t in parts), parts
        cands = [t for t in T if TITLE_RE.match(t.text)]
        if not cands:
            return '', '', []
        t0 = cands[0]
        fs0 = t0.fs / k
        line = [t0]
        for t in sorted((t for t in T if t is not t0 and abs(t.y - t0.y) <= 0.35 * fs0 and t.x > t0.x),
                        key=lambda t: t.x):
            if t.bbox[0] - line[-1].bbox[2] <= 3 * fs0:
                line.append(t)
        parts = list(line)
        last = t0.y
        while True:
            nxt = [t for t in T if t not in parts and 0 < t.y - last <= 2.0 * fs0
                   and t0.bbox[0] - 2 * fs0 <= t.bbox[0] <= line[-1].bbox[2]]
            if not nxt:
                break
            parts += nxt
            last = max(t.y for t in nxt)
        return '　'.join(t.text for t in line), ' '.join(t.text for t in parts), parts

    def add(self, cat, rid, sev, msg):
        self.F.append({'cat': cat, 'id': rid, 'sev': sev, 'msg': msg})

    def _is_frame(self, s):
        if 'ad-frame' in s.roles:
            return True
        if s.tag != 'rect' or s.hatch:
            return False
        x0, y0, x1, y1 = self.vbx if hasattr(self, 'vbx') else (0, 0, 0, 0)
        w, h = x1 - x0, y1 - y0
        bw, bh = s.bbox[2] - s.bbox[0], s.bbox[3] - s.bbox[1]
        return w > 0 and h > 0 and bw >= 0.9 * w and bh >= 0.9 * h

    def has(self, role):
        cls = 'ad-' + role
        return sum(1 for s in self.d.shapes if cls in s.roles) + sum(1 for t in self.d.texts if cls in t.roles)

    def kw(self, words):
        for o in list(self.d.shapes) + list(self.d.texts):
            names = ' '.join(list(o.roles) + list(o.ids)).lower()
            if any(w in names for w in words):
                return True
        return False

    def _tiers(self):
        if not self.strokes:
            return []
        total = sum(s.length for s in self.strokes)
        clusters = []
        for w, L in sorted((round(s.sw, 4), s.length) for s in self.strokes):
            if clusters and w <= clusters[-1]['lo'] * 1.15 + 1e-9:
                clusters[-1]['items'].append((w, L))
                clusters[-1]['L'] += L
            else:
                clusters.append({'lo': w, 'items': [(w, L)], 'L': L})
        for c in clusters:
            c['w'] = wmedian(c['items'])
            c['share'] = c['L'] / total
        return [c for c in clusters if c['share'] >= 0.02]

    def _scale(self):
        a = self.d.root.get('data-ad-scale') or self.d.scale
        cands = [a] if a else []
        cands += [t.text for t in self.d.texts if 'ad-scale-text' in t.roles]
        cands += [t.text for t in self.d.texts if TITLE_RE.match(t.text) or 'ad-title' in t.roles]
        for t in self.d.texts:          # 「図 3」と同じ行の続き
            if TITLE_RE.match(t.text):
                cands += [u.text for u in self.d.texts if abs(u.y - t.y) <= 0.35 * t.fs / self.d.k and u.x > t.x]
        m = re.search(r'1[-_]?(?:to|-|_)(\d{2,4})(?!\d)', os.path.basename(self.d.path).lower())
        if m:
            cands.append('1:' + m.group(1))
        cands += [t.text for t in self.d.texts]
        for c in cands:
            m = SCALE_RE.search(str(c))
            if m:
                return int(m.group(1) or m.group(2))
        return None

    # ---------------- (a) 線
    def check_lines(self):
        d, kind = self.d, self.d.kind
        if not self.strokes:
            self.add('a', 'LN-03', 'info' if kind in ('notation', 'generic') else 'error', '線が 1 本もない')
            return
        T = self.tiers
        n = len(T)
        ws = '・'.join(fmt(c['w']) for c in T)
        if kind == 'diagram':
            sev = 'pass' if n <= 2 else ('warn' if n == 3 else 'error')
            self.add('a', 'LN-03', sev, '線の太さ %d 段（%s mm）。図式は 2 段まで（FIG-ARCHITECTURE AR-L1）' % (n, ws))
        else:
            sev = 'error' if n <= 1 else ('pass' if n <= 4 else ('warn' if n == 5 else 'error'))
            self.add('a', 'LN-03', sev, '線の太さ %d 段（%s mm）。正投影図・アクソメは 2〜4 段'
                     '（JIS A 0150 13.2.4 は 2〜3、Memphis は 4 以上）' % (n, ws))
        # 切断：見えがかり
        cut = [s for s in self.strokes if 'ad-cut' in s.roles and not s.hatch]
        vis = [s for s in self.strokes if 'ad-visible' in s.roles and not s.hatch]
        poche = [s for s in d.shapes if 'ad-cut' in s.roles and s.fill_rgb and s.fo > 0.5 and s.area > 0
                 and to_lab(s.fill_rgb)[0] < 35]
        ratio, how = None, ''
        if cut and vis:
            rc = wmedian([(s.sw, s.length) for s in cut])
            rv = wmedian([(s.sw, s.length) for s in vis])
            ratio, how = rc / rv, 'class（ad-cut %s mm ／ ad-visible %s mm）' % (fmt(rc), fmt(rv))
        elif vis and poche:
            rv = wmedian([(s.sw, s.length) for s in vis])
            self.add('a', 'LN-04', 'pass', '切断面はポシェ（塗り）で示し、見えがかりは %s mm' % fmt(rv))
        elif not cut and kind in CUT_KINDS and self._poche_share() >= 0.005:
            self.add('a', 'LN-04', 'pass', '切断面はポシェ（黒い塗り。図の %s%%）と推定。見えがかりの線は %s mm まで'
                     % (fmt(100 * self._poche_share(), 1), fmt(T[-1]['w']) if T else '-'))
        elif n >= 2:
            ratio, how = T[-1]['w'] / T[-2]['w'], '段からの推定（最も太い段 %s ／ 次の段 %s）' % (
                fmt(T[-1]['w']), fmt(T[-2]['w']))
        if ratio is not None:
            if kind in CUT_KINDS:
                sev = 'pass' if ratio >= 1.95 else ('warn' if ratio >= 1.38 else 'error')
                self.add('a', 'LN-04', sev, '切断：見えがかり＝%s（%s）。JIS A 0150 13.2.5 は 2：1、SPEC は 2〜3 倍以上'
                         % (fmt(ratio, 2), how))
            else:
                self.add('a', 'LN-02', 'info', '太い段と次の段の比 %s（%s）' % (fmt(ratio, 2), how))
        # 系列
        off = [c['w'] for c in T if min(abs(c['w'] - i) / i for i in ISO_WIDTHS) > 0.12]
        if off:
            self.add('a', 'LN-01', 'info', 'ISO の系列（0.13・0.18・0.25・0.35・0.5・0.7・1・1.4・2）から外れた太さ：%s mm'
                     '（JIS Z 8312 4.2 は区別できればよいとする）' % '・'.join(fmt(w) for w in off))
        # 最小
        cand = [s.sw for s in self.strokes if s.length >= 1.0]
        if cand:
            wmin = min(cand)
            sev = 'error' if wmin < 0.095 else ('warn' if wmin < 0.125 else 'pass')
            extra = '（刷り上がり倍率 %s で換算）' % fmt(d.reduce) if d.reduce != 1.0 else ''
            self.add('a', 'LN-10', sev, '最も細い線 %s mm%s。0.13 未満は ISO の系列外、0.1 未満は投稿規定（Springer）を割る'
                     % (fmt(wmin, 3), extra))
        # 役割と線種
        rules =(('ad-grid', ('chain', 'double-chain'), '一点鎖線', 'GR-01'),
                 ('ad-hidden', ('dashed',), '破線', 'LN-06'),
                 ('ad-cut', ('solid',), '実線', 'LN-06'),
                 ('ad-dim', ('solid',), '実線', 'DM-02'))
        for role, ok, name, rid in rules:
            ss = [s for s in self.strokes if role in s.roles and not s.hatch]
            if not ss:
                continue
            bad = [s for s in ss if dashkind(s) not in ok]
            if bad:
                self.add('a', rid, 'warn', '%s の線 %d 本が%sでない（%s）' % (role, len(bad), name,
                                                                         '・'.join(sorted({dashkind(s) for s in bad}))))
            else:
                self.add('a', rid, 'pass', '%s は%s' % (role, name))
        dims = [s for s in self.strokes if 'ad-dim' in s.roles and not s.hatch and s.tag != 'circle']
        if dims and vis:
            wd = wmedian([(s.sw, s.length) for s in dims])
            wv = wmedian([(s.sw, s.length) for s in vis])
            if wd > wv * 1.05:
                self.add('a', 'DM-02', 'warn', '寸法線（%s mm）が見えがかり（%s mm）より太い。寸法線は細い実線' % (fmt(wd), fmt(wv)))
        # 破線の比（ISO 128-20 表3：線 12d・すき間 3d）
        short = [s for s in self.strokes if s.dash and s.dash[0] < 3 * s.sw and len(s.dash) == 2 and not s.hatch]
        if short:
            self.add('a', 'LN-08', 'info', '線分が線の太さの 3 倍に満たない破線 %d 本（ISO 128-20 表3 は線 12d・すき間 3d）'
                     % len(short))
        # ハッチの間隔
        tight = [(pid, sp, sw) for pid, sp, sw in d.pattern_spacing if sp < 0.7 or sp < 3 * sw]
        if tight:
            pid, sp, sw = min(tight, key=lambda r: r[1])
            self.add('a', 'LN-07', 'warn', '間隔の狭いハッチ %d 種（最小 %s mm「%s」）。0.7 mm 以上（JIS Z 8312 5.1）で線の太さの'
                     ' 3 倍以上（MLIT 3.3(3)）' % (len(tight), fmt(sp), pid))
        # 地盤線
        if kind == 'section':
            gr = [s for s in self.strokes if 'ad-ground' in s.roles and not s.hatch]
            if gr and cut:
                wg = max(s.sw for s in gr)
                wc = wmedian([(s.sw, s.length) for s in cut])
                if wg < wc * 0.9:
                    self.add('a', 'LN-12', 'warn', '地盤線 %s mm が切断の線 %s mm より細い（Memphis：地盤の切断が最も太い）'
                             % (fmt(wg), fmt(wc)))

    # ---------------- (b) 色
    def check_colors(self):
        d = self.d
        samples = []
        for s in d.shapes:
            if self._is_frame(s):
                continue
            if s.fill_rgb and s.fo > 0.01 and s.area > 0:
                samples.append((s.fill_rgb, s.area, s))
            if s.stroke_rgb and s.so > 0.01 and s.length > 0:
                samples.append((s.stroke_rgb, s.length * s.sw, s))
        for t in d.texts:
            if t.fill_rgb:
                samples.append((t.fill_rgb, 0.4 * t.fs * t.fs * max(1, len(t.text)), t))
        clusters = []
        for rgb, wgt, _o in samples:
            lab = to_lab(rgb)
            if lab[0] > 96 and chroma(lab) < 6:
                continue
            for c in clusters:
                if ciede2000(c['lab'], lab) < 3:
                    c['w'] += wgt
                    break
            else:
                clusters.append({'lab': lab, 'rgb': rgb, 'w': wgt})
        chrom = [c for c in clusters if chroma(c['lab']) >= 8]
        fams = []
        for c in sorted(chrom, key=lambda c: -c['w']):
            for f in fams:
                dh = abs(hue_deg(f['lab']) - hue_deg(c['lab']))
                if min(dh, 360 - dh) < 25:
                    f['w'] += c['w']
                    break
            else:
                fams.append(dict(c))
        n = len(fams)
        sev = 'pass' if n <= 1 else ('warn' if n == 2 else 'error')
        self.add('b', 'CL-02', sev, '有彩色 %d 系統（%s）。1 つまで（SPEC §2・FIG-ARCHITECTURE AR-01）'
                 % (n, '・'.join(rgb_hex(f['rgb']) for f in fams) or 'なし'))
        spec = [(name, to_lab(hex_rgb(h))) for name, h in SPEC_COLORS]
        outside = []
        for c in clusters:
            if c['lab'][0] < 22 and chroma(c['lab']) < 8:
                continue
            if min(ciede2000(c['lab'], lab) for _n, lab in spec) >= 5:
                outside.append(c)
        if outside:
            self.add('b', 'CL-07', 'warn', 'SPEC の 3 色（#1A1A1A・#8C9493・#943522）以外の色：%s'
                     % '・'.join(rgb_hex(c['rgb']) for c in sorted(outside, key=lambda c: -c['w'])[:6]))
        else:
            self.add('b', 'CL-07', 'pass', 'SPEC の色だけ')
        acc = 0.0
        for rgb, wgt, o in samples:
            if isinstance(o, Shape) and chroma(to_lab(rgb)) >= 8:
                acc += wgt
        pct = 100.0 * acc / self.content_area
        if acc <= 0:
            self.add('b', 'CL-03', 'pass', '強調色なし')
        else:
            sev = 'pass' if pct <= 10 else ('warn' if pct <= 25 else 'error')
            note = '（SPEC の目安 3〜6%）' + ('。小さすぎて見えにくい可能性' if pct < 1 else '')
            self.add('b', 'CL-03', sev, '有彩色の面積 %s%%%s' % (fmt(pct, 1), note))
        bins = {int(c['lab'][0] // 10) for c in clusters if chroma(c['lab']) < 8}
        sev = 'pass' if len(bins) <= 3 else ('warn' if len(bins) == 4 else 'error')
        self.add('b', 'CL-05', sev, '無彩色の明るさの段 %d（L* 10 刻み）。3 段まで（FIG-PRINCIPLES F02）' % len(bins))
        ct = [t for t in d.texts if t.fill_rgb and chroma(to_lab(t.fill_rgb)) >= 15]
        if ct:
            self.add('b', 'CL-04', 'warn', '色の文字 %d 個（例「%s」）。文字は黒（FIG-PRINCIPLES T9）' % (len(ct), ct[0].text[:12]))
        low = []
        for t in d.texts:
            if not t.fill_rgb:
                continue
            bg = self._background(t)
            if contrast(t.fill_rgb, bg) < 4.5:
                low.append((t, bg))
        if low:
            t, bg = low[0]
            self.add('b', 'CL-04', 'warn', '下地とのコントラストが 4.5：1 未満の文字 %d 個（例「%s」%s／下地 %s）'
                     % (len(low), t.text[:12], rgb_hex(t.fill_rgb), rgb_hex(bg)))
        # 白黒にしたとき強調が残るか：強調色と、同じ図の灰・黒との明度差（FIG-PRINCIPLES F16・X1）
        acc_c = max(chrom, key=lambda c: c['w']) if chrom else None
        if acc_c:
            others = [c for c in clusters if chroma(c['lab']) < 8 and c['w'] > 0]
            if others:
                near = min(others, key=lambda c: abs(acc_c['lab'][0] - c['lab'][0]))
                dmin = abs(acc_c['lab'][0] - near['lab'][0])
                sev = 'pass' if dmin >= 20 else ('warn' if dmin >= 10 else 'error')
                self.add('b', 'CL-06', sev, '白黒にしたときの強調 %s と %s の明度差 ΔL* %s（20 以上で合格、10 未満は強調が消える。'
                         '#943522 と #8C9493 は 24.8、#C2543A と #6F7877 は 0.1）'
                         % (rgb_hex(acc_c['rgb']), rgb_hex(near['rgb']), fmt(dmin, 1)))

    # ---------------- (c) 文字
    def check_text(self):
        T = [t for t in self.d.texts if t.text]
        if not T:
            self.add('c', 'TX-07', 'info', '文字が無い')
            return
        sizes = sorted(round(t.fs, 2) for t in T)
        cl = []
        for s in sizes:
            if cl and s <= cl[-1][0] * 1.06 + 0.02:
                cl[-1][1].append(s)
            else:
                cl.append([s, [s]])
        tiers = [c for c in cl if len(c[1]) / len(T) >= 0.03]
        n = len(tiers)
        sev = 'pass' if n <= 3 else ('warn' if n == 4 else 'error')
        self.add('c', 'TX-07', sev, '文字の大きさ %d 段（%s mm）。3 段以内（SPEC §1）'
                 % (n, '・'.join(fmt(c[1][len(c[1]) // 2]) for c in tiers)))
        e = 0.005   # 浮動小数の誤差
        tiny = [t for t in T if t.fs < 1.8 - e]
        small = [t for t in T if 1.8 - e <= t.fs < 2.5 - e]
        kan = [t for t in T if 2.5 - e <= t.fs < 3.5 - e and has_kanji(t.text)]
        if tiny:
            self.add('c', 'TX-01', 'error', '1.8 mm 未満の文字 %d 個（最小 %s mm「%s」）。JIS Z 8313-0 の最小の呼び 1.8 を割る'
                     % (len(tiny), fmt(min(t.fs for t in tiny)), min(tiny, key=lambda t: t.fs).text[:10]))
        if small:
            self.add('c', 'TX-02', 'warn', '2.5 mm 未満の文字 %d 個（最小 %s mm）。JIS Z 8313-10 の仮名の最小 2.5'
                     '（SPEC の注記 2.0 はこれを下回る。STANDARDS.md §3）' % (len(small), fmt(min(t.fs for t in small))))
        if kan:
            self.add('c', 'TX-02', 'info', '漢字を含む 3.5 mm 未満の文字 %d 個。JIS Z 8313-10 の漢字の最小は 3.5' % len(kan))
        if not tiny and not small:
            self.add('c', 'TX-01', 'pass', '最小の文字 %s mm' % fmt(min(t.fs for t in T)))
        fams = {}
        for t in T:
            first = t.family.split(',')[0].strip().strip('\'"')
            fams[first] = t.family
        sans_words = ('sans', 'gothic', 'ゴシック', 'helvetica', 'arial', 'hiragino kaku', 'meiryo', 'yu gothic',
                      'noto sans', 'source han sans', 'inter', 'roboto', 'segoe', 'verdana', 'tahoma', 'calibri')
        serif_words = ('mincho', '明朝', 'times', 'georgia', 'garamond', 'serif')
        bad = []
        for first, stack in fams.items():
            low = stack.lower()
            if not any(w in low for w in sans_words) and any(w in low for w in serif_words):
                bad.append(first)
        if bad:
            self.add('c', 'TX-05', 'warn', 'サンセリフでない書体：%s（font-family が無いとブラウザの既定のセリフ体になる）'
                     % '・'.join(bad))
        if len(fams) > 1:
            self.add('c', 'TX-05', 'warn', '書体族 %d 種（%s）。1 書体族（SPEC §1）' % (len(fams), '・'.join(fams)))
        elif not bad:
            self.add('c', 'TX-05', 'pass', '書体 1 種（%s）' % next(iter(fams)))
        norm = {'normal': '400', 'bold': '700', 'bolder': '700', 'lighter': '300'}
        weights = {norm.get(t.weight, t.weight) for t in T}
        if len(weights) > 2:
            self.add('c', 'TX-07', 'warn', '文字の太さ %d 種（%s）。2 種まで（FIG-ARCHITECTURE AR-T2）'
                     % (len(weights), '・'.join(sorted(weights))))
        over = []
        for i in range(len(T)):
            a = T[i].bbox
            aa = (a[2] - a[0]) * (a[3] - a[1])
            for j in range(i + 1, len(T)):
                b = T[j].bbox
                ix = min(a[2], b[2]) - max(a[0], b[0])
                iy = min(a[3], b[3]) - max(a[1], b[1])
                if ix > 0 and iy > 0:
                    bb = (b[2] - b[0]) * (b[3] - b[1])
                    if ix * iy > 0.25 * min(aa, bb):
                        over.append((T[i].text, T[j].text))
        if over:
            self.add('c', 'TX-10', 'warn', '重なって見える文字の組 %d（例「%s」と「%s」。外接矩形は推定）'
                     % (len(over), over[0][0][:10], over[0][1][:10]))
        else:
            self.add('c', 'TX-10', 'pass', '文字の重なりなし（推定の外接矩形）')
        # 文字を横切る線（JIS Z 8317-1 5.6.2：寸法数値はいかなる線とも交差させない・FIG-PRINCIPLES F20）
        segs = []
        for s in self.strokes:
            if s.hatch or not s.subs:
                continue
            for pts, closed in s.subs:
                seq = pts + ([pts[0]] if closed else [])
                for i in range(len(seq) - 1):
                    segs.append((seq[i], seq[i + 1], s))
        crossed = []
        order = {id(s): i for i, s in enumerate(self.d.shapes)}
        fills = [(i, s) for i, s in enumerate(self.d.shapes) if s.fill_rgb and s.fo >= 0.5 and s.area > 0
                 and not s.hatch and not self._is_frame(s)]
        for t in T:
            b = t.bbox
            tcx, tcy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
            cover = max((i for i, s in fills if s.bbox[0] <= tcx <= s.bbox[2] and s.bbox[1] <= tcy <= s.bbox[3]
                         and point_in_shape(s, tcx, tcy)), default=-1)   # 文字の下を塗りで隠した最後の形
            mx, my = 0.15 * (b[2] - b[0]), 0.2 * (b[3] - b[1])
            r = (b[0] + mx, b[1] + my, b[2] - mx, b[3] - my)
            cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
            ta = max(1e-9, (b[2] - b[0]) * (b[3] - b[1]))
            for p, q, s in segs:
                sb = s.bbox
                if s.tag in ('circle', 'ellipse', 'polygon', 'rect', 'path') and sb[0] <= cx <= sb[2] and \
                        sb[1] <= cy <= sb[3] and (sb[2] - sb[0]) * (sb[3] - sb[1]) <= 8 * ta:
                    continue          # 文字を囲む小さな記号（通り芯の丸・建具記号の六角など）
                if order.get(id(s), 0) < cover:
                    continue          # 後から描いた塗り（白い丸など）に隠れている
                if seg_hits_rect(p, q, r):
                    crossed.append(t)
                    break
        if crossed:
            dimc = [t for t in crossed if 'ad-dim' in t.roles or DIMNUM_RE.match(t.text)]
            self.add('c', 'TX-11', 'warn', '線が横切る文字 %d 個（うち寸法の数値 %d。例「%s」）。寸法数値は線と交差させない'
                     '（JIS Z 8317-1 5.6.2）' % (len(crossed), len(dimc), (dimc or crossed)[0].text[:12]))
        else:
            self.add('c', 'TX-11', 'pass', '文字を横切る線なし')

    # ---------------- (d) 版面
    def check_bounds(self):
        d = self.d
        x0, y0, x1, y1 = self.vbx
        tol = 0.05 / d.mpu
        outs, touts, fcut = [], [], []
        for s in d.shapes:
            if s.hatch:
                continue
            b = s.bbox
            over = max(x0 - b[0], y0 - b[1], b[2] - x1, b[3] - y1)
            if over > tol:
                if self._is_frame(s):
                    g = bbox_of([p for pts, _ in s.subs for p in pts])
                    if max(x0 - g[0], y0 - g[1], g[2] - x1, g[3] - y1) <= tol:
                        fcut.append(s)
                        continue
                outs.append((over * d.mpu, s))
        if fcut:
            self.add('d', 'SH-02', 'warn', '枠の線が版面の縁に重なり、線の太さの半分が切れる（枠を内側に寄せる）')
        for t in d.texts:
            b = t.bbox
            over = max(x0 - b[0], y0 - b[1], b[2] - x1, b[3] - y1)
            if over * d.mpu > 0.3:
                touts.append((over * d.mpu, t))
        if outs:
            o, s = max(outs, key=lambda p: p[0])
            self.add('d', 'SH-02', 'error', '版面からはみ出す図形 %d 個（最大 %s mm、%s %s）'
                     % (len(outs), fmt(o, 1), s.tag, '/'.join(s.ids) or ' '.join(sorted(r for r in s.roles if r.startswith('ad-')))))
        hard = [p for p in touts if p[0] > 2.0]
        soft = [p for p in touts if p[0] <= 2.0]
        if hard:
            o, t = max(hard, key=lambda p: p[0])
            self.add('d', 'SH-02', 'error', '版面からはみ出す文字 %d 個（最大 %s mm「%s」）' % (len(hard), fmt(o, 1), t.text[:12]))
        if soft:
            o, t = max(soft, key=lambda p: p[0])
            self.add('d', 'SH-02', 'warn', '版面の縁を越えるかもしれない文字 %d 個（推定 %s mm「%s」）'
                     % (len(soft), fmt(o, 1), t.text[:12]))
        if not outs and not touts:
            m = min(self.cbb[0] - x0, self.cbb[1] - y0, x1 - self.cbb[2], y1 - self.cbb[3]) * d.mpu
            if m < 1.0:
                self.add('d', 'SH-02', 'warn', '版面の縁までの余白 %s mm（1 mm 未満）' % fmt(m, 1))
            else:
                self.add('d', 'SH-02', 'pass', 'はみ出しなし（余白の最小 %s mm、版面 %s×%s mm）'
                         % (fmt(m, 1), fmt(d.vb[2] * d.mpu, 1), fmt(d.vb[3] * d.mpu, 1)))
        if d.mpu_src.startswith('SPEC'):
            self.add('d', 'SH-01', 'info', 'width に mm が無いので 1 単位＝1 mm とみなした（SPEC §1）')

    # ---------------- (e) 必須の要素
    def _texts_match(self, rx):
        return [t for t in self.d.texts if rx.search(t.text)]

    def _poche_share(self):
        if not hasattr(self, '_ps'):
            dark = sum(s.area for s in self.d.shapes if s.fill_rgb and s.fo > 0.5 and s.area > 0 and not s.hatch
                       and not self._is_frame(s) and to_lab(s.fill_rgb)[0] < 35)
            self._ps = dark / self.content_area
        return self._ps

    def _background(self, t):
        """文字の中心の下にある塗り（中心を含む塗りの形のうち、最後に描かれたもの＝いちばん上）。無ければ白。"""
        cx, cy = (t.bbox[0] + t.bbox[2]) / 2, (t.bbox[1] + t.bbox[3]) / 2
        best = (255, 255, 255)
        for s in self.d.shapes:
            if not s.fill_rgb or s.fo < 0.5 or s.area <= 0 or s.hatch:
                continue
            b = s.bbox
            if b[0] <= cx <= b[2] and b[1] <= cy <= b[3] and point_in_shape(s, cx, cy):
                best = s.fill_rgb
        return best

    def _ground_y(self):
        """「GL」の文字の近くにある長い水平線の y（根の単位）。無ければ None。"""
        if hasattr(self, '_gy'):
            return self._gy
        self._gy = None
        d = self.d
        cw = self.cbb[2] - self.cbb[0]
        gls = [t for t in d.texts if re.fullmatch(r'\s*[▽▼]?\s*GL\s*([±+＋]\s*0)?\s*', t.text)]
        for t in gls:
            ty = (t.bbox[1] + t.bbox[3]) / 2
            for s in self.strokes:
                b = s.bbox
                if (b[3] - b[1]) * d.mpu <= 1.0 and (b[2] - b[0]) >= max(30 / d.mpu, 0.15 * cw) and \
                        abs((b[1] + b[3]) / 2 - ty) <= 6 / d.mpu:
                    self._gy = (b[1] + b[3]) / 2
                    return self._gy
        return None

    def heur(self, key):
        d = self.d
        T = d.texts
        if key == 'north':
            if self.kw(('north', 'houi', '方位')):
                return 'id・class の語'
            if any(t.text in ('N', 'Ｎ') for t in T):
                return '「N」の文字'
        elif key == 'scalebar':
            if self.kw(('scalebar', 'scale-bar', 'scale_bar', 'barscale', 'graphic-scale')):
                return 'id・class の語'
            if any(t.text == '0' for t in T) and (any(re.fullmatch(r'\d+(\.\d+)?\s*m', t.text) for t in T)
                                                  or any(t.text in ('m', 'M') for t in T)):
                return '「0」と「…m」の目盛り'
        elif key == 'scale-text':
            if self.scale:
                return '縮尺 1:%d' % self.scale
        elif key == 'dim':
            n = [t for t in T if DIMNUM_RE.match(t.text)]
            if len(n) >= 3:
                return '寸法らしい数値 %d 個' % len(n)
        elif key == 'grid':
            ch = [s for s in self.strokes if dashkind(s) in ('chain', 'double-chain')]
            if ch:
                return '鎖線 %d 本' % len(ch)
        elif key == 'grid-label':
            circ = [s for s in d.shapes if s.circle_r and 1.2 <= s.circle_r <= 6]
            lab = [t for t in T if re.fullmatch(r'([XYxy]\s*\d{1,2}|[A-H]|\d{1,2}|[①-⑳]|[Ⓐ-Ⓩ])', t.text)]
            hit = 0
            for t in lab:
                cx, cy = (t.bbox[0] + t.bbox[2]) / 2, (t.bbox[1] + t.bbox[3]) / 2
                if any(c.bbox[0] <= cx <= c.bbox[2] and c.bbox[1] <= cy <= c.bbox[3] for c in circ):
                    hit += 1
            if hit >= 2:
                return '丸の中の符号 %d 個' % hit
        elif key == 'opening':
            ok = []
            for s in d.shapes:
                for rx, ry, sweep in s.arcs:
                    if 70 <= sweep <= 110:
                        real = rx / d.reduce * (self.scale or 0)
                        if (self.scale and 450 <= real <= 1300) or (not self.scale and 2 <= rx <= 20):
                            ok.append(s)
            if ok:
                return '90° 前後の弧 %d 個' % len(ok)
            qa = 0
            for s in self.strokes:
                for pts, _c in s.subs:
                    sw_ = quarter_arc(pts)
                    if sw_:
                        r = sw_ / d.reduce * (self.scale or 0)
                        if (self.scale and 450 <= r <= 1300) or (not self.scale and 2 <= sw_ <= 20):
                            qa += 1
            if qa:
                return '折れ線・曲線の 90° の弧 %d 個' % qa
            tg = [t for t in T if TATEGU_RE.match(t.text)]
            if tg:
                return '建具記号 %d 個（%s）' % (len(tg), tg[0].text)
            if self.kw(('window', 'door', 'opening', 'sash', 'mado')) or \
                    any(re.search('窓|建具|サッシ|開口|引違|引戸|開き戸|ドア', t.text) for t in T):
                return '建具・開口の語'
        elif key == 'stair':
            if self.kw(('stair', 'kaidan', '階段')):
                return 'id・class の語'
            if any(t.text in ('UP', 'DN', '上', '下', '上り', '下り') for t in T):
                return '「上・下」の文字'
        elif key == 'room-name':
            n = [t for t in T if any(is_cjk(c) for c in t.text) and 1 <= len(t.text) <= 12
                 and not TITLE_RE.match(t.text) and not LEVEL_RE.search(t.text)] + \
                [t for t in T if t.text in ('WC', 'UB', 'PS', 'EV')]
            if n:
                return '室名らしい文字 %d 個' % len(n)
        elif key == 'section-mark':
            n = [t for t in T if re.fullmatch(r"[A-Z]\s*['’′]?", t.text)]
            if len(n) >= 2 or any(re.search(r"[A-Z]\s*[-–ー]\s*[A-Z]\s*['’′]", t.text) for t in T):
                return '断面の記号らしい文字'
        elif key == 'title':
            n = [t for t in T if TITLE_RE.match(t.text)]
            if n:
                return '「図 N」の文字'
        elif key == 'level':
            n = [t for t in T if LEVEL_RE.search(t.text)]
            if n:
                return 'GL・FL などの文字 %d 個' % len(n)
        elif key == 'ground':
            if self.kw(('ground', 'jiban', '地盤')):
                return 'id・class の語'
            if self._ground_y() is not None:
                return 'GL の文字の高さの長い水平線'
            wmax = max((s.sw for s in self.strokes), default=0)
            cw = self.cbb[2] - self.cbb[0]
            for s in self.strokes:
                b = s.bbox
                if s.sw >= 0.9 * wmax and (b[3] - b[1]) < 0.02 * (self.cbb[3] - self.cbb[1]) + s.sw and \
                        (b[2] - b[0]) >= 0.5 * cw:
                    return '長い水平の太線'
        elif key == 'ground-hatch':
            if self.kw(('ground-hatch', 'groundhatch', 'earth', 'soil', 'jiban')):
                return 'id・class の語'
            gy = self._ground_y()
            if gy is not None:
                n = 0
                for st_ in self.strokes:
                    for pts, _c in st_.subs:
                        for i in range(len(pts) - 1):
                            (ax, ay), (bx, by) = pts[i], pts[i + 1]
                            a = abs(math.degrees(math.atan2(by - ay, bx - ax))) % 180
                            if (25 <= a <= 65 or 115 <= a <= 155) and min(ay, by) >= gy - 0.5 / d.mpu and \
                                    max(ay, by) <= gy + 20 / d.mpu:
                                n += 1
                if n >= 5:
                    return '地盤線の下の斜線 %d 本' % n
            if any(s.hatch for s in d.shapes) and self._texts_match(re.compile('GL')):
                return 'ハッチと GL の文字'
        elif key == 'person':
            if self.kw(('person', 'human', 'people', 'hito', '人物', 'entourage')):
                return 'id・class の語'
            if self.scale:
                for c in d.shapes:
                    if not c.circle_r:
                        continue
                    real = c.circle_r / d.reduce * self.scale
                    if not 70 <= real <= 170:
                        continue
                    for st_ in self.strokes:
                        b = st_.bbox
                        if st_ is c or b[0] > c.bbox[2] or b[2] < c.bbox[0]:
                            continue
                        if abs(b[1] - c.bbox[3]) <= 1.5 / d.mpu and (b[3] - b[1]) * d.mpu * self.scale >= 600:
                            return '頭（丸）と体の線'
        elif key == 'cut':
            dark = [s for s in d.shapes if s.fill_rgb and s.fo > 0.5 and s.area > 0 and to_lab(s.fill_rgb)[0] < 35
                    and not self._is_frame(s)]
            if dark:
                return 'ポシェらしい黒い塗り %d 個' % len(dark)
            if any(s.hatch for s in d.shapes):
                return 'ハッチ'
            if len(self.tiers) >= 2 and self.tiers[-1]['w'] >= 0.35:
                return '太い段 %s mm' % fmt(self.tiers[-1]['w'])
        elif key == 'visible':
            if len(self.tiers) >= 2:
                return '細い段がある'
        elif key in ('hidden', 'guide'):
            n = [s for s in self.strokes if dashkind(s) == 'dashed']
            if n:
                return '破線 %d 本' % len(n)
        elif key == 'keyplan':
            if self.kw(('keyplan', 'key-plan', 'キープラン')) or \
                    any(re.search(r'キープラン|key\s*plan', t.text, re.I) for t in T):
                return 'キープランの語'
        elif key == 'wall-label':
            n = [t for t in T if re.fullmatch(r'[A-D](面)?', t.text)]
            if len(n) >= 2:
                return 'A〜D の文字'
        elif key == 'layer-label':
            if self.kw(('layer-label', 'label')):
                return 'id・class の語'
            if len(T) >= 3:
                return '文字 %d 個' % len(T)
        elif key == 'boundary':
            if self.kw(('boundary', '敷地境界', 'site-line')):
                return 'id・class の語'
            if any(re.search('境界|区画|敷地', t.text) for t in T):
                return '境界・区画の語'
        elif key == 'road':
            if self.kw(('road', 'alley', '道路', '路地')) or any(re.search('道路|路地', t.text) for t in T):
                return '道路・路地の語'
        elif key == 'context':
            g = to_lab(hex_rgb('#8C9493'))
            if any(s.stroke_rgb and ciede2000(to_lab(s.stroke_rgb), g) < 5 for s in d.shapes) or \
                    any(s.fill_rgb and ciede2000(to_lab(s.fill_rgb), g) < 5 for s in d.shapes):
                return '灰 #8C9493'
        elif key == 'leader':
            if self.kw(('leader', '引出')):
                return 'id・class の語'
            notes = [t for t in T if re.search(r'[：:]|\bt\s*\d|φ\s*\d|@\d', t.text) and any(is_cjk(c) for c in t.text)]
            if len(notes) >= 2:
                return '材料の注記 %d 個' % len(notes)
        elif key == 'hatch':
            if any(s.hatch for s in d.shapes) or self.kw(('hatch',)):
                return 'ハッチ'
        return None

    def check_required(self):
        kind = self.d.kind
        reqs = REQ.get(kind, REQ['generic'])
        if kind == 'generic':
            self.add('e', 'RQ-00', 'info', '図の種類が分からない（data-ad-kind="plan" などを svg に付けると、必須の要素を点検できる）')
        for key, level, name, src in reqs:
            n = self.has(key)
            if n:
                self.add('e', 'RQ-' + key, 'pass', '%s：あり（class ad-%s、%d 個）' % (name, key, n))
                continue
            h = self.heur(key)
            if h:
                self.add('e', 'RQ-' + key, 'info', '%s：推定であり（%s）。class="ad-%s" を付けると確実' % (name, h, key))
            else:
                self.add('e', 'RQ-' + key, 'error' if level == 'must' else 'warn',
                         '%s が見当たらない（%s、class ad-%s）' % (name, src, key))
        # 図題の位置（JIS A 0150 12.4：1 つの図のタイトルは図の下に左を合わせる）
        titles = self.title_parts
        if titles:
            t = titles[0]
            others = [s.bbox for s in self.d.shapes if not self._is_frame(s) and not s.hatch]
            if others:
                top = min(b[1] for b in others)
                bottom = max(b[3] for b in others)
                below = t.bbox[1] >= (top + bottom) / 2
                self.add('e', 'TT-01', 'pass' if below else 'info',
                         '図題は図の%s（JIS A 0150 12.4・SPEC §3 は図の下）' % ('下' if below else '上'))
            if self.scale is None and kind in ORTHO_KINDS:
                self.add('e', 'TT-02', 'info', '図題か図の中に縮尺（1:100 など）が読み取れない')

    # ---------------- (f) 飾り
    def check_deco(self):
        d = self.d
        rr = [s for s in d.shapes if s.tag == 'rect' and s.rx and s.rx > 0.01 and not s.hatch
              and 'round' not in (s.el.get('data-ad-allow') or '')]
        if rr:
            self.add('f', 'AI-03', 'error', '角丸の四角 %d 個（rx・ry）。角の四角い枠かなし（FIG-ARCHITECTURE AR-14）' % len(rr))
        shadow = False
        for flt, tag, ids in d.used_filters:
            c = parse_color(flt)
            fel = d.ids.get(c[1]) if c[0] == 'url' else None
            kids = {local(x.tag) for x in fel.iter()} if fel is not None else set()
            if 'feDropShadow' in kids or ('feGaussianBlur' in kids and 'feOffset' in kids) or 'drop-shadow' in flt:
                shadow = True
            else:
                self.add('f', 'AI-04', 'warn', 'フィルタを使う要素（%s %s）' % (tag, '/'.join(ids)))
        if shadow or d.css_shadow:
            self.add('f', 'AI-01', 'error', '影（feDropShadow・ぼかし＋ずらし・CSS の shadow）。優秀作品 0/450（FIG-ARCHITECTURE AR-22）')
        if d.used_grads:
            cm = [g for g in d.used_grads if 'ad-colormap' in g[2]]
            other = [g for g in d.used_grads if 'ad-colormap' not in g[2]]
            if other:
                self.add('f', 'AI-02', 'error', 'グラデーション %d 箇所（%s）' % (len(other), '・'.join(sorted({g[0] for g in other}))))
            if cm:
                self.add('f', 'AI-02', 'info', '連続量の色の尺度（ad-colormap）のグラデーション %d' % len(cm))
        trans = [s for s in d.shapes if s.fill_rgb and 0 < s.fo < 0.99 and s.area >= 0.05 * self.content_area]
        if trans:
            self.add('f', 'AI-04', 'warn', '図の 5%% 以上を覆う半透明の面 %d 個（淡い色の区画の様式）' % len(trans))
        emo = [t for t in d.texts if any(is_emoji(c) for c in t.text)]
        if emo:
            self.add('f', 'AI-05', 'error', '絵文字 %d 個（例「%s」）' % (len(emo), emo[0].text[:8]))
        if d.images:
            self.add('f', 'AI-05', 'warn', 'ラスタ画像 %d 枚（線画はベクタで）' % len(d.images))
        if not [f for f in self.F if f['cat'] == 'f']:
            self.add('f', 'AI-00', 'pass', '角丸・影・グラデーション・フィルタ・絵文字なし')

    # ---------------- (g) 寸法・縮尺
    def check_dims(self):
        d, kind = self.d, self.d.kind
        if self.scale:
            sev = 'pass' if self.scale in MLIT_SCALES else 'info'
            self.add('g', 'SC-01', sev, '縮尺 1:%d%s' % (self.scale, '' if sev == 'pass' else '（MLIT の 13 種にない）'))
        dimt = [t for t in d.texts if 'ad-dim' in t.roles] or [t for t in d.texts if DIMNUM_RE.match(t.text)]
        unit = [t for t in dimt if re.search(r'\d\s*(mm|ｍｍ)\b', t.text)]
        if unit:
            self.add('g', 'DM-01', 'info', '単位記号の付いた寸法 %d 個。mm は省略する（JIS Z 8317-1 3.2.4・MLIT 3.5）' % len(unit))
        nocomma = [t for t in dimt if re.fullmatch(r'\d{4,}', t.text)]
        if nocomma:
            self.add('g', 'DM-07', 'info', '3 桁区切りの無い 4 桁以上の寸法 %d 個（MLIT 3.5 の例は「1,260」）' % len(nocomma))
        # 端末記号
        dims = [s for s in d.shapes if 'ad-dim' in s.roles and not s.hatch]
        types = set()
        for s in dims:
            for m in s.markers:
                c = parse_color(m)
                mel = d.ids.get(c[1]) if c[0] == 'url' else None
                if mel is not None:
                    tags = {local(x.tag) for x in mel.iter()}
                    if 'circle' in tags or 'ellipse' in tags:
                        types.add('点')
                    elif 'polygon' in tags or 'path' in tags:
                        types.add('矢印')
                    elif 'line' in tags or 'polyline' in tags:
                        types.add('斜線')
            if s.circle_r and s.circle_r <= 0.8 and s.fill_rgb:
                types.add('点')
            elif s.tag in ('line', 'path', 'polyline') and len(s.subs) == 1 and len(s.subs[0][0]) == 2 and s.length <= 3.2:
                (ax, ay), (bx, by) = s.subs[0][0]
                ang = abs(math.degrees(math.atan2(by - ay, bx - ax))) % 180
                if 20 < ang < 70 or 110 < ang < 160:
                    types.add('斜線')
            elif s.tag in ('polygon', 'path') and s.fill_rgb and 0 < s.area < 3 and s.subs and len(s.subs[0][0]) <= 5:
                types.add('矢印')
        if dims:
            if len(types) > 1:
                self.add('g', 'DM-04', 'warn', '寸法の端末記号が %d 種（%s）。1 枚の図では 1 種（ISO 129 4.3.3・SPEC §2）'
                         % (len(types), '・'.join(sorted(types))))
            elif types:
                self.add('g', 'DM-04', 'pass', '端末記号は 1 種（%s）' % next(iter(types)))
            else:
                self.add('g', 'DM-04', 'info', '端末記号を見分けられなかった')
        # スケールバーの長さ
        sb_s = [s for s in d.shapes if 'ad-scalebar' in s.roles and not s.hatch]
        sb_t = [t for t in d.texts if 'ad-scalebar' in t.roles]
        if sb_s and sb_t and self.scale:
            vals = []
            for t in sb_t:
                m = re.search(r'(\d+(?:\.\d+)?)\s*(m|mm)?', t.text)
                if m:
                    v = float(m.group(1))
                    vals.append(v / 1000 if m.group(2) == 'mm' else v)
            if vals and max(vals) > 0:
                span = (max(s.bbox[2] for s in sb_s) - min(s.bbox[0] for s in sb_s)) * d.mpu
                span -= max(s.sw / d.k for s in sb_s) * d.mpu   # 線の太さの分を引く
                expect = max(vals) * 1000 / self.scale
                r = span / expect
                sev = 'pass' if abs(r - 1) <= 0.03 else 'error'
                self.add('g', 'SC-04', sev, 'スケールバー %s m の長さ %s mm（1:%d なら %s mm）'
                         % (fmt(max(vals)), fmt(span, 1), self.scale, fmt(expect, 1)))
        # 共通の題材
        if self.subject and kind in SUBJECT:
            nums = set()
            for t in d.texts:
                for m in re.findall(r'\d[\d,，]*(?:\.\d+)?\s*m(?![m²])|\d[\d,，]*', t.text):
                    try:
                        if m.rstrip().endswith('m'):          # 「5.4 m」はメートル
                            nums.add(int(round(float(m.rstrip(' m').replace(',', '')) * 1000)))
                        else:
                            nums.add(int(m.replace(',', '').replace('，', '')))
                    except ValueError:
                        pass
            miss = [n for n in SUBJECT[kind] if n not in nums]
            if miss:
                self.add('g', 'DM-09', 'warn', '共通の題材（SPEC §4）の数値 %s が図の中に見当たらない'
                         % '・'.join('{:,}'.format(n) for n in miss))
            else:
                self.add('g', 'DM-09', 'pass', '共通の題材の数値（%s）がある' % '・'.join('{:,}'.format(n) for n in SUBJECT[kind]))

    def check_projection(self):
        if self.d.kind not in ('axon', 'exploded'):
            return
        hist = {}
        for s in self.strokes:
            for pts, closed in s.subs:
                seq = pts + ([pts[0]] if closed else [])
                for i in range(len(seq) - 1):
                    (ax, ay), (bx, by) = seq[i], seq[i + 1]
                    L = math.dist((ax, ay), (bx, by)) * self.d.k
                    if L < 2:
                        continue
                    a = round(math.degrees(math.atan2(-(by - ay), bx - ax)) % 180) % 180
                    hist[a] = hist.get(a, 0) + L
        tot = sum(hist.values())
        if not tot:
            return
        top = sorted(hist.items(), key=lambda p: -p[1])
        acc, main = 0, []
        for a, L in top:
            main.append(a)
            acc += L
            if acc >= 0.8 * tot or len(main) >= 4:
                break
        std = (0, 30, 45, 60, 90, 120, 135, 150)
        odd = [a for a in main if min(abs(a - s) for s in std + (180,)) > 1]
        kind = '等角（30°）' if {30, 150} <= set(main) else ('プラノメトリック 45/45' if {45, 135} <= set(main) else
                                                            ('プラノメトリック 30/60' if {30, 120} <= set(main) or {60, 150} <= set(main) else '不明'))
        self.add('a', 'AX-01', 'warn' if odd else 'pass', '主な線の角度 %s°（%s）%s'
                 % ('・'.join(str(a) for a in main), kind, '。規格的な角度でない線がある' if odd else ''))

    # ---------------- (h) 具体・既定・癖（FIG-STUDENT-PORTFOLIOS §3・オーケストレーターの追記 2026-10-23）
    def _in_circle(self, t):
        cx, cy = (t.bbox[0] + t.bbox[2]) / 2, (t.bbox[1] + t.bbox[3]) / 2
        return any(s.circle_r and s.circle_r <= 6 and s.bbox[0] <= cx <= s.bbox[2] and s.bbox[1] <= cy <= s.bbox[3]
                   for s in self.d.shapes)

    def check_concrete(self):
        d, kind = self.d, self.d.kind
        T = d.texts
        titles = self.title_parts
        title = self.title_first
        tfull = self.title_full
        lax = kind in ('notation', 'generic')
        # (1) 具体：数値の注記・名前の付いた参照線・名前の付いた範囲・出典の断り
        nums = [t for t in T if t not in titles and not (t.roles & {'ad-scalebar', 'ad-grid-label'})
                and re.search(r'\d{2,}|\d[.,]\d|\d\s*(mm|m|%|°|㎡|m²)', t.text)]
        if nums:
            self.add('h', 'CN-01', 'pass', '数値の注記 %d 個（例「%s」）' % (len(nums), nums[0].text[:12]))
        else:
            self.add('h', 'CN-01', 'info' if lax else 'warn', '図の中に意味のある数値（寸法・高さ・距離）が無い（S14）')
        refs = [t for t in T if REF_RE.search(t.text) or (t.roles & {'ad-grid-label', 'ad-level', 'ad-boundary'})]
        if refs:
            self.add('h', 'CN-02', 'pass', '名前の付いた参照線 %d（例「%s」）' % (len(refs), refs[0].text[:10]))
        else:
            self.add('h', 'CN-02', 'warn' if kind in ORTHO_KINDS else 'info',
                     '名前の付いた参照線（GL・FL・通り芯・後退線・隣地境界など）が無い（S12）')
        rng = [t for t in T if t.roles & {'ad-room-name', 'ad-zone', 'ad-range', 'ad-layer-label'}]
        if not rng:
            rng = [t for t in T if t not in titles and any(is_cjk(c) for c in t.text) and 2 <= len(t.text) <= 12
                   and not LEVEL_RE.search(t.text) and not SRC_RE.search(t.text)]
        self.add('h', 'CN-03', 'pass' if rng else 'info',
                 '名前の付いた範囲（室名・領域名）%d' % len(rng) if rng else '名前の付いた範囲（室名・領域名）が見当たらない（S13）')
        src = [t for t in T if SRC_RE.search(t.text) or 'ad-source' in t.roles]
        if src:
            self.add('h', 'CN-04', 'pass', '出典の断り「%s」' % src[0].text[:20])
        else:
            self.add('h', 'CN-04', 'info' if lax else 'warn',
                     '出典か「筆者作成」の断りが無い（SPEC §3 の図題「図n　主題（縮尺）。出典」・S23）')
        # (2) 道具の既定が残る
        dsw = [s for s in self.strokes if s.sw_default and not s.hatch]
        if dsw:
            self.add('h', 'DF-01', 'warn', '太さを指定していない線 %d 本（既定の 1 単位＝%s mm のまま）' % (len(dsw), fmt(d.mpu)))
        dfs = [t for t in T if t.fs_default]
        if dfs:
            self.add('h', 'DF-01', 'warn', '大きさを指定していない文字 %d 個（既定の 16 単位のまま。例「%s」）' % (len(dfs), dfs[0].text[:10]))
        dff = [t for t in T if t.ff_default]
        if dff:
            self.add('h', 'DF-01', 'warn', '書体を指定していない文字 %d 個（ブラウザの既定のセリフ体になる）' % len(dff))
        used = set()
        for s in d.shapes:
            for c in (s.fill_rgb, s.stroke_rgb):
                if c:
                    used.add(tuple(c))
        for t in T:
            if t.fill_rgb:
                used.add(tuple(t.fill_rgb))
        hits = set()
        for c in used:
            lab = to_lab(c)
            if chroma(lab) < 8:
                continue
            for tool, cols in DEFAULT_PALETTES:
                if any(ciede2000(lab, to_lab(hex_rgb(h))) < 3 for h in cols):
                    hits.add('%s（%s）' % (tool, rgb_hex(c)))
        if hits:
            self.add('h', 'DF-02', 'warn', '道具の既定の色：%s' % '・'.join(sorted(hits)))
        if not (dsw or dfs or dff or hits):
            self.add('h', 'DF-01', 'pass', '太さ・大きさ・書体・色に道具の既定が残っていない')
        body = title_body(title) if title else ''
        dup = []
        if len(body) >= 4:
            for t in T:
                if t in titles:
                    continue
                n = norm_text(t.text)
                if len(n) >= 4 and (n == body or ((n in body or body in n) and len(n) >= 0.6 * len(body))):
                    dup.append(t)
        if len(titles) >= 2 and len({t.text for t in titles}) < len(titles):
            dup.append(titles[1])
        if dup:
            self.add('h', 'DF-03', 'warn', '図の中に図題と同じ題「%s」を重ねている（S16）' % dup[0].text[:16])
        bg = [s for s in self.frames if s.fill_rgb and s.fo > 0.5 and to_lab(s.fill_rgb)[0] < 97]
        if bg:
            name = next((nm for nm, h in DEFAULT_BG if ciede2000(to_lab(bg[0].fill_rgb), to_lab(hex_rgb(h))) < 3), '')
            self.add('h', 'DF-04', 'warn', '版面いっぱいの色の地 %s%s（地は白。S16・§3-3）' % (rgb_hex(bg[0].fill_rgb),
                                                                               '＝' + name if name else ''))
        if kind == 'diagram' and [s for s in self.frames if s.stroke_rgb and s.so > 0]:
            self.add('h', 'DF-04', 'info', '図全体を囲む外枠（Excel・Stata の既定の名残。S16）')
        # (3) AI の図の癖
        legit = {'ad-grid-label', 'ad-section-mark', 'ad-wall-label', 'ad-north', 'ad-scalebar', 'ad-dim',
                 'ad-level', 'ad-scale-text'}
        abbr = {'N', 'WC', 'UB', 'PS', 'EV', 'DN', 'UP', 'GL', 'FL', 'SL', 'CH', 'RC', 'S', 'W'}
        labels = [t for t in T if t not in titles and not (t.roles & legit) and not re.fullmatch(r'[\d,.\s±+-]+', t.text)
                  and not self._in_circle(t)]
        short = [t for t in labels if re.fullmatch(r"[A-Za-z]{1,2}\s*['’′]?", t.text) and t.text.strip() not in abbr]
        if labels:
            r = len(short) / len(labels)
            if len(short) >= 3 and r >= 0.4:
                self.add('h', 'AX-02', 'warn', '1〜2 文字の英字だけのラベルが %d/%d（%s%%）。記号で示して図題に頼らず、語で書く'
                         % (len(short), len(labels), fmt(100 * r, 0)))
            else:
                self.add('h', 'AX-02', 'pass', '記号だけのラベル %d/%d' % (len(short), len(labels)))
        arrows = 0
        for s in d.shapes:
            for m in s.markers:
                c = parse_color(m)
                mel = d.ids.get(c[1]) if c[0] == 'url' else None
                if mel is not None and {local(x.tag) for x in mel.iter()} & {'path', 'polygon', 'polyline'}:
                    arrows += 1
            if s.tag in ('polygon', 'path') and s.fill_rgb and 0 < s.area < 4 and s.subs and \
                    3 <= len(s.subs[0][0]) <= 4 and 'ad-dim' not in s.roles and 'ad-north' not in s.roles:
                arrows += 1
        conn = [s for s in self.strokes if s.tag in ('line', 'polyline', 'path') and not s.hatch
                and s.subs and not s.subs[0][1]]
        is_flow = bool(FLOW_RE.search(title)) or 'ad-flow' in {r for s in d.shapes for r in s.roles}
        if is_flow and not arrows:
            self.add('h', 'AX-03', 'warn', '流れの図なのに矢印が無い（線 %d 本・矢印 0。表のように見える）' % len(conn))
        elif is_flow:
            self.add('h', 'AX-03', 'pass', '流れの図に矢印 %d（線 %d 本）' % (arrows, len(conn)))
        if kind == 'diagram':
            withm = [s for s in conn if s.markers]
            without = [s for s in conn if not s.markers]
            sig = lambda s: (dashkind(s), round(s.sw, 2), rgb_hex(s.stroke_rgb))  # noqa: E731
            common = {sig(s) for s in withm} & {sig(s) for s in without}
            if withm and len(without) >= 2 and common:
                self.add('h', 'AX-04', 'warn', '矢印つきの線と矢印なしの線が同じ線種・太さ・色（流れと対応を線種で分ける。AR-08）')
            nodes = []
            for s in d.shapes:
                if s.hatch or self._is_frame(s) or s.tag not in ('rect', 'ellipse', 'circle', 'polygon'):
                    continue
                if (s.bbox[2] - s.bbox[0]) * (s.bbox[3] - s.bbox[1]) <= 0 or not (s.fill_rgb or s.stroke_rgb):
                    continue
                if any(s.bbox[0] <= (t.bbox[0] + t.bbox[2]) / 2 <= s.bbox[2] and
                       s.bbox[1] <= (t.bbox[1] + t.bbox[3]) / 2 <= s.bbox[3] for t in T):
                    nodes.append(('rect' if s.tag == 'rect' else ('ellipse' if s.tag in ('ellipse', 'circle') else 'poly'),
                                  rgb_hex(s.fill_rgb) if s.fill_rgb and s.fo > 0 else 'none',
                                  rgb_hex(s.stroke_rgb) if s.stroke_rgb else 'none', bool(s.rx and s.rx > 0.01)))
            if len(nodes) >= 4:
                cnt = {}
                for n in nodes:
                    cnt[n] = cnt.get(n, 0) + 1
                top = max(cnt.values())
                odd = len(nodes) - top
                if top / len(nodes) >= 0.6 and 1 <= odd <= 2:
                    self.add('h', 'AX-05', 'warn', '節 %d 個のうち %d 個だけ形・色が違う（始点・終点だけ形式を変えない）' % (len(nodes), odd))
        if titles:
            frag = title_fragment(title)
            if frag:
                self.add('h', 'AX-06', 'warn', '図題が断片的（%s）：「%s」' % (frag, title[:30]))
            else:
                self.add('h', 'AX-06', 'pass', '図題は完結した題（「%s」）' % title[:30])
            lack = []
            if kind in ORTHO_KINDS and not SCALE_RE.search(tfull):
                lack.append('縮尺')
            if not SRC_RE.search(tfull):
                lack.append('出典')
            if lack:
                self.add('h', 'AX-06', 'info', '図題に%sが無い（SPEC §3・§7：何を示すか＋読み方＋縮尺・出典）' % '・'.join(lack))

    def run(self):
        self.check_lines()
        self.check_projection()
        self.check_colors()
        self.check_text()
        self.check_bounds()
        self.check_required()
        self.check_deco()
        self.check_dims()
        self.check_concrete()
        for n in self.d.notes[:5]:
            self.add('d', 'NOTE', 'info', n)
        return self.result()

    def result(self):
        cats = {}
        for c, name in CATS:
            fs = [f for f in self.F if f['cat'] == c]
            e = sum(1 for f in fs if f['sev'] == 'error')
            w = sum(1 for f in fs if f['sev'] == 'warn')
            cats[c] = {'name': name, 'score': max(0, 100 - 35 * e - 12 * w), 'errors': e, 'warns': w}
        total = sum(cats[c]['score'] * CAT_WEIGHT[c] for c in cats) / sum(CAT_WEIGHT.values())
        return {
            'file': self.d.path, 'kind': self.d.kind, 'kind_name': KIND_NAMES.get(self.d.kind, self.d.kind),
            'scale': self.scale, 'mm_per_unit': self.d.mpu, 'reduce': self.d.reduce,
            'tiers_mm': [round(c['w'], 3) for c in self.tiers], 'score': round(total), 'categories': cats,
            'errors': sum(cats[c]['errors'] for c in cats), 'warns': sum(cats[c]['warns'] for c in cats),
            'findings': sorted(self.F, key=lambda f: (SEV_ORDER[f['sev']], f['cat'])),
        }


def infer_kind(path, root=None, cli=None):
    if cli:
        return cli
    if root is not None and root.get('data-ad-kind'):
        return root.get('data-ad-kind').strip()
    p = path.replace('\\', '/').lower()
    base = os.path.basename(p)
    parts = p.split('/')
    team = None
    if 'archdraw' in parts:          # 担当のフォルダを先に見る（siteplan_1-200.svg は配置図）
        i = parts.index('archdraw')
        if i + 1 < len(parts) and parts[i + 1] in TEAMS:
            team = parts[i + 1]
    for i in range(len(parts) - 1):
        if team is None and parts[i] in TEAMS and parts[i + 1] == 'examples':
            team = parts[i]
    if team:
        sub = {'elevation': 'interior', 'axon': 'exploded'}.get(team)
        if sub and any(w in base for w in dict(KIND_WORDS)[sub]):
            return sub
        if any(w in base for w in ('legend', '凡例')):
            return 'notation'          # 凡例のシート（材料記号の一覧など）は記号として扱う
        return team
    for kind, words in KIND_WORDS:
        if any(w in base for w in words):
            return kind
    for kind, words in KIND_WORDS:
        if any(w in p for w in words):
            return kind
    return 'generic'


def check_file(path, kind=None, mpu=None, reduce=1.0, scale=None, subject=True):
    try:
        root = ET.parse(path).getroot()
    except (ET.ParseError, OSError) as e:
        return {'file': path, 'kind': kind or '?', 'kind_name': '?', 'score': 0, 'errors': 1, 'warns': 0,
                'categories': {}, 'tiers_mm': [], 'scale': None,
                'findings': [{'cat': 'd', 'id': 'SH-00', 'sev': 'error', 'msg': '読めない：%s' % e}]}
    k = infer_kind(path, root, kind)
    try:
        doc = Doc(path, kind=k, mpu=mpu, reduce=reduce, scale=scale)
    except ValueError as e:
        return {'file': path, 'kind': k, 'kind_name': KIND_NAMES.get(k, k), 'score': 0, 'errors': 1, 'warns': 0,
                'categories': {}, 'tiers_mm': [], 'scale': None,
                'findings': [{'cat': 'd', 'id': 'SH-00', 'sev': 'error', 'msg': str(e)}]}
    return Checker(doc, subject=subject).run()


# ---------------------------------------------------------------- 出力
def report_md(res, rel=None, max_findings=40, heading='###', show_pass=True):
    name = rel or res['file']
    lines = ['%s %s（%s%s）　点数 %d' % (heading, name, res['kind_name'],
                                       '・1:%d' % res['scale'] if res.get('scale') else '', res['score']), '']
    if res.get('categories'):
        lines.append('| 項目 | 点 | error | warn |')
        lines.append('|---|---|---|---|')
        for c, nm in CATS:
            cc = res['categories'][c]
            lines.append('| (%s) %s | %d | %d | %d |' % (c, nm, cc['score'], cc['errors'], cc['warns']))
        lines.append('')
    shown = [f for f in res['findings'] if f['sev'] in ('error', 'warn')]
    shown += [f for f in res['findings'] if f['sev'] == 'info']
    if show_pass:
        shown += [f for f in res['findings'] if f['sev'] == 'pass']
    for f in shown[:max_findings]:
        lines.append('- **%s** (%s) %s：%s' % (f['sev'], f['cat'], f['id'], f['msg']))
    if len(shown) > max_findings:
        lines.append('- …ほか %d 件' % (len(shown) - max_findings))
    lines.append('')
    return '\n'.join(lines)


def audit(root_dir, out=None, reduce=1.0):
    root_dir = os.path.abspath(root_dir)
    rows, details = [], []
    for team in TEAMS:
        tdir = os.path.join(root_dir, team)
        if not os.path.isdir(tdir):
            rows.append((team, '未提出', '', '', '', ''))
            continue
        files = sorted(set(glob.glob(os.path.join(tdir, '**', '*.svg'), recursive=True)))
        if not files:
            rows.append((team, 'SVG なし', '', '', '', ''))
            continue
        for f in files:
            rel = os.path.relpath(f, root_dir)
            res = check_file(f, reduce=reduce)
            rows.append((team, rel, res['kind_name'], str(res['score']), str(res['errors']), str(res['warns'])))
            details.append(report_md(res, rel=rel, max_findings=25, heading='####', show_pass=False))
    lines = ['| 担当 | ファイル | 図の種類 | 点数 | error | warn |', '|---|---|---|---|---|---|']
    for r in rows:
        lines.append('| %s |' % ' | '.join(r))
    text = '\n'.join(lines) + '\n\n' + '\n'.join(details)
    if out:
        with open(out, 'w', encoding='utf-8') as fh:
            fh.write(text)
    return rows, text


def main(argv=None):
    ap = argparse.ArgumentParser(description='建築図の SVG を製図の規格と archdraw の約束で点検する')
    ap.add_argument('files', nargs='*', help='SVG のファイル')
    ap.add_argument('--kind', choices=sorted(KIND_NAMES), help='図の種類（無ければ data-ad-kind かファイル名から推定）')
    ap.add_argument('--scale', help='縮尺（例 1:100）。無ければ data-ad-scale か図の中の文字から読む')
    ap.add_argument('--mm-per-unit', type=float, help='1 単位が紙の何 mm か（既定：width の単位か 1）')
    ap.add_argument('--reduce', type=float, default=1.0, help='刷り上がりの倍率（A3→A4 なら 0.707）')
    ap.add_argument('--no-subject', action='store_true', help='共通の題材（SPEC §4）の数値を点検しない')
    ap.add_argument('--json', action='store_true', help='JSON で出す')
    ap.add_argument('--audit', metavar='DIR', help='図のフォルダ（SVG と PNG）をまとめて点検する')
    ap.add_argument('--out', help='--audit の結果を書くファイル')
    ap.add_argument('--version', action='version', version=VERSION)
    a = ap.parse_args(argv)
    if a.audit:
        rows, text = audit(a.audit, a.out, a.reduce)
        if not a.out:
            print(text)
        else:
            print('wrote %s（%d 行）' % (a.out, len(rows)))
        return 0
    if not a.files:
        ap.print_help()
        return 2
    results = [check_file(f, a.kind, a.mm_per_unit, a.reduce, a.scale, not a.no_subject) for f in a.files]
    if a.json:
        print(json.dumps(results if len(results) > 1 else results[0], ensure_ascii=False, indent=1))
    else:
        for r in results:
            print(report_md(r))
    return 1 if any(r['errors'] for r in results) else 0


if __name__ == '__main__':
    sys.exit(main())
