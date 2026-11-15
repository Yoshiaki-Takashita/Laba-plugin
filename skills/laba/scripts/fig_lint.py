#!/usr/bin/env python3
"""SVG の図を規則に照らして検査する（references/figures/ の規則）。標準ライブラリのみ。
usage: fig_lint.py fig.svg [fig2.svg ...] [--caption "図1　…"] [--spec spec.json] [--out lint.json] [--strict]

error（直すまで通さない）
  E01 使ってよい色（#1A1A1A・#8C9493・#943522・白）以外        E02 文字が黒でない
  E03 文字サイズが3種以上                                        E04 線幅が3種以上（矢じりの定義は除く）
  E05 文字が端から 20 単位以内・版面の外                          E06 文字どうしの重なり
  E07 文字を線が横切る                                            E08 グラデーション・影・角丸
  E09 記号だけのラベルが3つ以上                                   E10 矢印の先・元が何にも届いていない
  E11 線が、端点でない箱を貫通する（その線がつないでいない箱の中を通る）
  E12 別の線と同じ筋に重なる（同じ元から分かれる幹・同じ先への合流は除く。どちらの関係の線か読めなくなる）
warn（理由を言えるなら残してよい）
  W01 強調色がない／多すぎる（要素の 30% 超）                     W02 記号だけのラベル（1〜2個）
  W03 空白が片寄っている（左右・上下の半分で 4 倍以上の差）       W04 列の下端の差が図の高さの 25% 超
  W05 空白率が 90% 超（要素が少なすぎる）・50% 未満（詰めすぎ）。13単位の格子で数えた近似   W06 1行が長いラベル（18字超。注記を除く）
  W07 線種が4種以上                                               W08 図題がない・型に合わない（--caption か --spec か <desc>）
  W09 文字と枠線が近すぎる（3 単位未満）                          W10 viewBox がない
  W11 箱の中の語が4行以上（ひとかたまりの文字が4行以上）          W12 線の横の語が3行以上
  W13 語の途中で折れている疑い（行末が開き括弧、行頭が閉じ括弧・句読点、条文番号・数字・判例の日付の途中、
      法律語の途中（辞書 figgen/lib/legal-words.json の術語：「共同｜正犯」「株主｜総会」）、辞書にない漢字 3 字以上の連なりを分からない二字ずつで折った所、
      送り仮名の前（「生｜じさせる」））
W05 の範囲は図の型で変える（--spec か <desc> の data-type で型が分かるとき）：表の形（compare・matrix・statute・stack・quadrant・bar・instances）は 38% 未満で warn、
  ほかは 50% 未満で warn。表の形は列を並べて読む図で、線図より詰まって見えても読める（目視で確かめた範囲）。
箱の役割は data-role（node＝箱、group＝範囲の枠、shape＝箱の形の線、legend＝凡例、guide＝補助線、leader＝注記の引出線）で見分ける。figgen が付ける。
data-role のない SVG（手で書いた図）では、文字を中に持つ枠つきの rect を箱とみなす。
文字の幅は近似（和文 1.0em、数字 0.58em など。figgen と同じ）。最後は必ず PNG を目で見る。"""
import sys, re, json, math, xml.etree.ElementTree as ET

TABLE_TYPES = {'compare', 'matrix', 'statute', 'stack', 'quadrant', 'bar', 'instances', 'panel-table'}
OK = {'#1a1a1a', '#8c9493', '#943522', '#ffffff', '#fff', 'white', 'none', '', 'context-stroke', 'context-fill'}
ACCENT = '#943522'

import os
_LEX = None
END_SUFFIX = '者権性的力効犯罪庁官料額税費員状型説審人法化士役上中後前内外間時所書物金等会'
LEGACY = set('背信的悪意者 第三取得者 第三債務者 新株予約権 被保全債権 被担保債権 非公開会社 善管注意義務 被相続人 主債務者 未成年者 無権代理人 不動産 主債務 賃貸借 転貸借 無過失 重過失 不可分 不作為 不存在 無資力 未成年 相手方 被告人 被疑者 被害者 被保全 被担保 裁判所 名宛人 買受人 譲受人 競落人 仮処分 仮差押 非公開 大会社 小法廷 大法廷 再抗弁 再々抗弁 不法行為 不当利得 無権代理 意思表示 所有権 占有権 地上権 抵当権'.split())


def lex():
    """法律語の辞書（figgen/lib/legal-words.json）。figgen の折り返し（core.js の unsafeKK）と同じ規則で、漢字の連なりの切れ目が安全かを決める"""
    global _LEX
    if _LEX is None:
        try:
            d = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'figgen', 'lib', 'legal-words.json'), encoding='utf-8'))
            _LEX = ({w for v in d.get('fields', {}).values() for w in v} | set(d.get('harvested', [])), set(d.get('known2', [])))
        except Exception:
            _LEX = (set(), set())
    return _LEX


def unsafe_kk(run, k):
    """漢字の連なり run を k 字目の前で折るのが安全でないか（core.js の unsafeKK と同じ規則）"""
    terms, known2 = lex()
    unit = lambda p: p in terms or p in LEGACY or (len(p) >= 3 and p[-1] in END_SUFFIX)
    cov = [(a, e) for a in range(k) for e in range(k + 1, len(run) + 1) if run[a:e] in terms]
    mx = [(a, e) for a, e in cov if not any(a1 <= a and e <= e1 and (e1 - a1) > (e - a) for a1, e1 in cov)]
    for a, e in mx:
        l, r = run[a:k], run[k:e]
        if not ((unit(l) and unit(r)) or (l in terms and len(l) >= 4 and r in known2) or (r in terms and len(r) >= 4 and l in known2)): return True
    if mx: return False
    if any(unit(run[a:k]) for a in range(k)) or any(unit(run[k:e]) for e in range(k + 1, len(run) + 1)): return False      # 切れ目の左で術語が終わる・右で術語が始まる（「意思表示｜例」）
    l2, r2 = run[max(0, k - 3):k], run[k:k + 3]                 # 術語に掛からない連なり：両側の語の候補（三字・二字）がどれも分からなければ安全でない
    ok = lambda p: unit(p) or p in known2
    return not any(ok(x) for x in (l2, l2[-2:], r2, r2[:2]) if len(x) >= 2)


def num(v, d=0.0):
    try:
        return float(re.sub(r'[a-z%]+$', '', str(v)))
    except Exception:
        return d

def char_w(ch):
    c = ord(ch)
    if c == 0x20: return 0.3
    if c < 0x80:
        if ch in "ilI1.,:;'|!": return 0.32
        if ch in 'mwMW@%': return 0.9
        if 'A' <= ch <= 'Z': return 0.68
        if '0' <= ch <= '9': return 0.58
        if ch in '()[]/-': return 0.4
        return 0.56
    if 0xFF61 <= c <= 0xFF9F: return 0.5
    if c < 0x2000: return 0.6
    return 1.0

def twidth(s, size):
    return sum(char_w(ch) for ch in s) * size

def style_of(el, inherited):
    st = dict(inherited)
    for k in ('fill', 'stroke', 'font-size', 'stroke-width', 'text-anchor', 'stroke-dasharray', 'font-weight'):
        if el.get(k) is not None:
            st[k] = el.get(k)
    for part in (el.get('style') or '').split(';'):
        if ':' in part:
            k, v = part.split(':', 1); st[k.strip()] = v.strip()
    return st

def seg_hits(a, b, bb, pad=0.0):
    x0, y0, x1, y1 = bb[0] + pad, bb[1] + pad, bb[2] - pad, bb[3] - pad
    if x1 <= x0 or y1 <= y0: return False
    t0, t1 = 0.0, 1.0; dx, dy = b[0] - a[0], b[1] - a[1]
    for p, q in ((-dx, a[0] - x0), (dx, x1 - a[0]), (-dy, a[1] - y0), (dy, y1 - a[1])):
        if p == 0:
            if q < 0: return False
        else:
            r = q / p
            if p < 0:
                if r > t1: return False
                t0 = max(t0, r)
            else:
                if r < t0: return False
                t1 = min(t1, r)
    return t0 < t1

def pt_seg_dist(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]; L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L))
    return math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))

def lint(path, caption=None, ftype=None):
    E, Wn = [], []
    root = ET.parse(path).getroot()
    vb = root.get('viewBox')
    if vb:
        _, _, W, H = [float(x) for x in re.split(r'[\s,]+', vb.strip())]
    else:
        W, H = num(root.get('width'), 1000), num(root.get('height'), 600); Wn.append('W10 viewBox がない')
    texts, segs, rects, arrows = [], [], [], []
    nodes, polys, any_role, ftype = [], [], [False], [ftype or root.get('data-type')]
    sizes, widths, dashes = set(), set(), set(); n_el = n_acc = 0; desc = None
    def walk(el, st, in_defs):
        nonlocal n_el, n_acc, desc
        tag = el.tag.split('}')[-1]; st = style_of(el, st)
        if tag == 'desc': desc = ''.join(el.itertext()).strip(); return
        if tag in ('linearGradient', 'radialGradient', 'filter'): E.append(f'E08 {tag} は使わない')
        if tag == 'defs': in_defs = True
        if in_defs:
            for ch in el: walk(ch, st, True)
            return
        if tag == 'rect' and (num(el.get('rx')) > 0 or num(el.get('ry')) > 0): E.append('E08 角丸の rect は使わない')
        if tag in ('rect', 'line', 'path', 'circle', 'ellipse', 'polyline', 'polygon', 'text'):
            n_el += 1
            for k in ('fill', 'stroke'):
                c = (st.get(k) or '').lower()
                if c.startswith('url('): continue
                if c not in OK: E.append(f'E01 使えない色 {c}（{tag}）')
            stroke = (st.get('stroke') or 'none').lower()
            if ACCENT in ((st.get('fill') or '').lower(), stroke): n_acc += 1
            if tag != 'text' and stroke not in ('none', ''):
                widths.add(num(st.get('stroke-width'), 1)); dashes.add(st.get('stroke-dasharray') or 'solid')
        role = el.get('data-role')
        if role: any_role[0] = True
        if tag == 'rect':
            x, y, w, h = num(el.get('x')), num(el.get('y')), num(el.get('width')), num(el.get('height'))
            if role == 'node': nodes.append((x, y, x + w, y + h))
            if not (w >= W - 1 and h >= H - 1) and (st.get('stroke') or 'none').lower() not in ('none', ''):
                rects.append((x, y, x + w, y + h))
                for a, b in (((x, y), (x + w, y)), ((x + w, y), (x + w, y + h)), ((x + w, y + h), (x, y + h)), ((x, y + h), (x, y))):
                    segs.append((a, b, 'rect'))
        pts = None
        if tag == 'line': pts = [(num(el.get('x1')), num(el.get('y1'))), (num(el.get('x2')), num(el.get('y2')))]
        if tag == 'polyline':
            v = [float(x) for x in re.split(r'[\s,]+', (el.get('points') or '').strip()) if x]; pts = list(zip(v[0::2], v[1::2]))
        if pts and len(pts) >= 2:
            for a, b in zip(pts, pts[1:]): segs.append((a, b, 'line'))
            if role not in ('shape', 'legend', 'guide'): polys.append(pts)
            ms, me = el.get('marker-start') or st.get('marker-start'), el.get('marker-end') or st.get('marker-end')
            if (ms or me) and role != 'legend': arrows.append((pts, bool(ms), bool(me)))
        if tag == 'text':
            size = num(st.get('font-size'), 16); sizes.add(size); a = st.get('text-anchor', 'start')
            if (st.get('fill') or '#1a1a1a').lower() not in ('#1a1a1a', '#000', '#000000', 'black'):
                E.append(f"E02 文字は黒にする：「{''.join(el.itertext())[:12]}」")
            x, y = num(el.get('x')), num(el.get('y')); lines = []
            spans = [c for c in el if c.tag.split('}')[-1] == 'tspan']
            if spans:
                cy = y
                for sp in spans:
                    cy += num(sp.get('dy')); lines.append((''.join(sp.itertext()).strip(), num(sp.get('x'), x), cy))
            else:
                lines.append((''.join(el.itertext()).strip(), x, y))
            for s, lx, ly in lines:
                if not s: continue
                w = twidth(s, size); x0 = lx - w / 2 if a == 'middle' else lx - w if a == 'end' else lx
                texts.append({'s': s, 'bb': (x0, ly - size * 0.86, x0 + w, ly + size * 0.2), 'size': size, 'block': id(el), 'role': role, 'n': len([1 for q in lines if q[0]])})
            return
        for ch in el: walk(ch, st, in_defs)
    walk(root, {}, False)
    if len(sizes) > 2: E.append(f'E03 文字サイズが {len(sizes)} 種（2種まで）：{sorted(sizes)}')
    if len(widths) > 2: E.append(f'E04 線幅が {len(widths)} 種（2種まで）：{sorted(widths)}')
    if len(dashes) > 3: Wn.append(f'W07 線種が {len(dashes)} 種（実線・破線・点線の3種まで）')
    for t in texts:
        x0, y0, x1, y1 = t['bb']
        if x0 < 20 or y0 < 12 or x1 > W - 20 or y1 > H - 12: E.append(f"E05 文字が端に近い・外に出る：「{t['s'][:14]}」")
    for i in range(len(texts)):
        for j in range(i + 1, len(texts)):
            a, b = texts[i]['bb'], texts[j]['bb']
            if min(a[2], b[2]) - max(a[0], b[0]) > 2 and min(a[3], b[3]) - max(a[1], b[1]) > 2:
                E.append(f"E06 文字の重なり：「{texts[i]['s'][:10]}」と「{texts[j]['s'][:10]}」")
    for t in texts:
        for a, b, kind in segs:
            if seg_hits(a, b, t['bb'], 2.0):
                E.append(f"E07 文字を{'枠線' if kind == 'rect' else '線'}が横切る：「{t['s'][:12]}」")
            elif kind == 'rect' and seg_hits(a, b, (t['bb'][0] - 3, t['bb'][1] - 1, t['bb'][2] + 3, t['bb'][3] + 1)):
                Wn.append(f"W09 文字と枠線が近い：「{t['s'][:12]}」")
    sym = [t['s'] for t in texts if re.fullmatch(r'[A-Za-zＡ-Ｚ][0-9０-９′\']?', t['s'])]
    if len(sym) >= 3: E.append(f"E09 記号だけのラベルが {len(sym)} 個（{'・'.join(sym[:6])}）。語を添える（「債務者 A」）")
    elif sym: Wn.append(f"W02 記号だけのラベル：{'・'.join(sym)}")
    def reaches(p):
        for (x0, y0, x1, y1) in rects + nodes:
            if x0 - 14 <= p[0] <= x1 + 14 and y0 - 14 <= p[1] <= y1 + 14: return True
        for t in texts:
            x0, y0, x1, y1 = t['bb']
            if x0 - 26 <= p[0] <= x1 + 26 and y0 - 26 <= p[1] <= y1 + 26: return True
        return False
    for pts, ms, me in arrows:
        others = [(a, b) for a, b, k in segs if k == 'line' and a not in pts and b not in pts]
        def ok(p):
            return reaches(p) or any(pt_seg_dist(p, a, b) <= 14 for a, b in others)
        length = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts, pts[1:]))
        if len(pts) == 2:                                  # 軸（時間軸・数直線）：目盛りの短い線が2本以上交わる直線は対象外
            a0, b0 = pts; ticks = sum(1 for a, b in others if math.hypot(b[0] - a[0], b[1] - a[1]) <= 24 and pt_seg_dist(((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), a0, b0) <= 2)
            if ticks >= 2: continue
        if me and not ok(pts[-1]): E.append(f'E10 矢印の先が何にも届いていない（{pts[-1][0]:.0f},{pts[-1][1]:.0f}）')
        if not ok(pts[0]): E.append(f'E10 矢印の元が何にもつながっていない（{pts[0][0]:.0f},{pts[0][1]:.0f}）')
    # E11：線が、端点でない箱を貫通する
    if not any_role[0]:                                    # 手で書いた SVG：文字を中に持つ枠つきの rect を箱とみなす
        for r in rects:
            if any(r[0] <= (t['bb'][0] + t['bb'][2]) / 2 <= r[2] and r[1] <= (t['bb'][1] + t['bb'][3]) / 2 <= r[3] for t in texts) and (r[2] - r[0]) < W * 0.7: nodes.append(r)
    def near(p, r, d=8): return r[0] - d <= p[0] <= r[2] + d and r[1] - d <= p[1] <= r[3] + d
    def label_of(r):
        ins = [t['s'] for t in texts if r[0] <= (t['bb'][0] + t['bb'][2]) / 2 <= r[2] and r[1] <= (t['bb'][1] + t['bb'][3]) / 2 <= r[3]]
        return ins[0][:10] if ins else f'{r[0]:.0f},{r[1]:.0f}'
    for pts in polys:
        for r in nodes:
            if near(pts[0], r) or near(pts[-1], r): continue
            if any(seg_hits(a, b, r, 3.0) for a, b in zip(pts, pts[1:])):
                E.append(f'E11 線が、つないでいない箱「{label_of(r)}」を貫通する（線の元 {pts[0][0]:.0f},{pts[0][1]:.0f}）。配置を入れ替えるか、経路を変える')
    # E12：別の線と同じ筋に重なる
    def colin(a, b, c, d, tol=2.5):
        if abs(a[1] - b[1]) < 0.6 and abs(c[1] - d[1]) < 0.6 and abs(a[1] - c[1]) < tol: return min(max(a[0], b[0]), max(c[0], d[0])) - max(min(a[0], b[0]), min(c[0], d[0]))
        if abs(a[0] - b[0]) < 0.6 and abs(c[0] - d[0]) < 0.6 and abs(a[0] - c[0]) < tol: return min(max(a[1], b[1]), max(c[1], d[1])) - max(min(a[1], b[1]), min(c[1], d[1]))
        return 0
    def same(p, q): return math.hypot(p[0] - q[0], p[1] - q[1]) < 1.5
    for i in range(len(polys)):
        for j in range(i + 1, len(polys)):
            P, Q = polys[i], polys[j]
            if same(P[0], Q[0]) or same(P[-1], Q[-1]): continue            # 同じ元から分かれる幹・同じ先への合流
            hit = [(a, b) for a, b in zip(P, P[1:]) for c, d in zip(Q, Q[1:]) if colin(a, b, c, d) > 10]
            if hit: E.append(f'E12 線が別の線と同じ筋に重なる（{hit[0][0][0]:.0f},{hit[0][0][1]:.0f} 付近）。どちらの関係の線か読めない。経路か接続点をずらす')
    # W11・W12・W13：行数と折り返し
    blocks = {}
    for t in texts: blocks.setdefault(t['block'], []).append(t)
    for bl in blocks.values():
        n = len(bl); first = bl[0]; cx, cy = (first['bb'][0] + first['bb'][2]) / 2, (first['bb'][1] + first['bb'][3]) / 2
        inside = any(r[0] <= cx <= r[2] and r[1] <= cy <= r[3] for r in (nodes or rects))
        if first.get('role') in ('legend',): continue
        if inside and n >= 4 and ftype[0] not in ('instances', 'stack', 'statute'): Wn.append(f"W11 箱の中の語が {n} 行：「{first['s'][:12]}」。語を減らすか、箱を広げる")
        if first.get('role') == 'edge-label' and n >= 3: Wn.append(f"W12 線の横の語が {n} 行：「{first['s'][:12]}」。語を減らす（条文番号は注へ）か、線を長くする")
        for a, b in zip(bl, bl[1:]):
            x, y = a['s'], b['s']
            if x[-1] in '（「『【〔' or y[0] in '）」』】〕、。・' or (re.search(r'[0-9０-９]$', x) and re.match(r'[0-9０-９条項号巻頁]', y)) or (re.search(r'[0-9０-９]条$', x) and re.match(r'(の[0-9０-９]|[0-9０-９]+項)', y)) or (re.search(r'[0-9０-９]・$', x) and re.match(r'[0-9０-９]', y)):
                Wn.append(f"W13 語の途中で折れている：「{x[-6:]}／{y[:6]}」"); continue
            tx = re.search(r'[一-龥々〇]+$', x); hy = None if re.match(r'(及び|又は|並びに|若しくは)', y) else re.match(r'[一-龥々〇]+', y)
            if tx and hy and len(tx.group(0)) + len(hy.group(0)) >= 3 and unsafe_kk(tx.group(0) + hy.group(0), len(tx.group(0))):
                Wn.append(f"W13 法律語・漢字の連なりの途中で折れている：「{x[-6:]}／{y[:6]}」。語の切れ目で折る（| で位置を決める）か、箱を広げる"); continue
            if tx and re.match(r'[ぁ-ん]', y) and not re.match(r'(は|が|を|に|で|と|の|へ|も|や|から|まで|より|など|ほか|及び|又は|かつ|ならば|なら|について|として|による|により|において|に対し|とき|こと|もの|ただし|かっこ書|なお書)', y):
                Wn.append(f"W13 送り仮名の前で折れている：「{x[-6:]}／{y[:6]}」")
    if n_acc == 0: Wn.append('W01 強調色がない。争点・分かれ目・変わった所のどれか一つを強調する')
    elif n_el >= 12 and n_acc / n_el > 0.3: Wn.append(f'W01 強調色が多い（{n_acc}/{n_el}）。強調は一点に絞る')
    # 占有の格子（空白率・片寄り）
    G = 13; nx, ny = max(1, int(W // G)), max(1, int(H // G)); occ = [[False] * nx for _ in range(ny)]
    def mark(x0, y0, x1, y1):
        for gy in range(max(0, int(y0 // G)), min(ny - 1, int(y1 // G)) + 1):
            for gx in range(max(0, int(x0 // G)), min(nx - 1, int(x1 // G)) + 1): occ[gy][gx] = True
    for t in texts: mark(*t['bb'])
    for a, b, _ in segs:
        steps = max(1, int(math.hypot(b[0] - a[0], b[1] - a[1]) // (G / 2)))
        for k in range(steps + 1):
            x, y = a[0] + (b[0] - a[0]) * k / steps, a[1] + (b[1] - a[1]) * k / steps; mark(x, y, x, y)
    tot = nx * ny; filled = sum(sum(r) for r in occ); blank = 1 - filled / tot
    if blank > 0.90: Wn.append(f'W05 空白率 {blank:.0%}（要素が少なすぎるか、図が大きすぎる）')
    lo = 0.38 if ftype[0] in TABLE_TYPES else 0.50
    if blank < lo: Wn.append(f'W05 空白率 {blank:.0%}（詰めすぎ。分けるか、語を減らす。この型の目安は {lo:.0%} 以上）')
    left = sum(sum(r[:nx // 2]) for r in occ); right = filled - left; top = sum(sum(r) for r in occ[:ny // 2]); bottom = filled - top
    for a, b, nm in ((left, right, '左右'), (top, bottom, '上下')):
        if H >= 260 and min(a, b) * 4 < max(a, b) and max(a, b) > 40: Wn.append(f'W03 空白の片寄り：{nm}の半分で要素の量が4倍以上違う（{a}:{b}）。段を組み替える')
    cols = []                                             # 並列の列：上端がそろい、箱が2つ以上ある列だけを比べる
    for r in sorted(rects):
        for c in cols:
            if r[0] < c[2] - 4 and r[2] > c[0] + 4: c[0], c[1], c[2], c[3], c[4] = min(c[0], r[0]), min(c[1], r[1]), max(c[2], r[2]), max(c[3], r[3]), c[4] + 1; break
        else: cols.append([r[0], r[1], r[2], r[3], 1])
    par = [c for c in cols if c[4] >= 2]
    if len(par) >= 2 and max(c[1] for c in par) - min(c[1] for c in par) < 30 and ftype[0] not in ('flow', 'tree', 'parties', 'chain'):    # 並べて読む列だけ。流れ図の出口の列などは対象外
        bs = [c[3] for c in par]
        if (max(bs) - min(bs)) / H > 0.25: Wn.append(f'W04 列の下端の差が図の高さの {(max(bs) - min(bs)) / H:.0%}（25% 超）。列の中身をそろえるか、段を組み替える')
    for t in texts:
        em = (t['bb'][2] - t['bb'][0]) / t['size']
        if em > 18 and not t['bb'][0] < 40 and ftype[0] != 'statute': Wn.append(f"W06 1行が長いラベル（{em:.0f}字幅）：「{t['s'][:14]}…」。語を減らすか改行を入れる")
    cap = caption or None
    if cap is None and desc is None: Wn.append('W08 図題がない（--caption か --spec で渡す。figgen は <desc> に message を入れる）')
    if cap is not None:
        if not re.match(r'^図\s*[0-9０-９N]+', cap): Wn.append('W08 図題は「図N　…」で始める')
        if 'この図で分かること：' not in cap: Wn.append('W08 図題に「この図で分かること：一文」がない')
        if not cap.rstrip().endswith('。'): Wn.append('W08 図題は完全な文で終える（。）')
        if n_acc and '強調' not in cap: Wn.append('W08 図題に強調色の意味（強調は…）が書かれていない')
    return {'file': path, 'errors': sorted(set(E)), 'warnings': sorted(set(Wn)), 'n_text': len(texts), 'font_sizes': sorted(sizes),
            'stroke_widths': sorted(widths), 'blank_ratio': round(blank, 3), 'accent_elements': n_acc, 'elements': n_el, 'size': [W, H], 'type': ftype[0], 'nodes': len(nodes), 'wires': len(polys)}

if __name__ == '__main__':
    av = sys.argv[1:]; files = [a for a in av if a.endswith('.svg')]
    if not files:
        print(__doc__); sys.exit(1)
    cap = av[av.index('--caption') + 1] if '--caption' in av else None
    ftype = None
    if '--spec' in av:
        sp = json.load(open(av[av.index('--spec') + 1], encoding='utf-8')); cap = sp.get('caption', cap); ftype = sp.get('type')
    res = [lint(f, cap, ftype) for f in files]; bad = 0
    for r in res:
        bad += len(r['errors']) + (len(r['warnings']) if '--strict' in av else 0)
        print(f"{r['file']}: error {len(r['errors'])} / warn {len(r['warnings'])}  空白率 {r['blank_ratio']:.0%}" + ('  通過' if not r['errors'] else ''))
        for e in r['errors']: print('  error:', e)
        for w in r['warnings']: print('  warn :', w)
    if '--out' in av:
        json.dump(res, open(av[av.index('--out') + 1], 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    sys.exit(1 if bad else 0)
