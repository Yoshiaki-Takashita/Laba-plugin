#!/usr/bin/env python3
"""ノートを「層」と「節」に分けて読む共通関数。標準ライブラリのみ。
読める入力：
  1) build_docx.py の入力 JSON（{"meta":…, "blocks":[[種別, 本文, …], …]}）
  2) META と DOC を定義した Python ファイル（DOC はタプルの列。旧来のビルダーの text.py も読める）
  3) 全文テキスト（--text-out の出力）。見出しらしい行で節を切り、見出しの語で層を推定する（近似）
層（layer）：
  body     本文（P・P2・K・B・N・BH・Q）
  zak      ざっくり理解・全体像（Z・ZB・ZN と、その見出しの下の段）
  summary  まとめ（見出しに「まとめ」を含む章・節の下の段）
  table    表のセル（T）          card   論点カード・短答の表（KD、見出しに「論点カード」「短答」「正誤」）
  fig      図題（F）              head   見出し（H・S・SS・C・ZH）
節（section）：直近の H／S／SS の見出し文字列。節番号（12-3-4 など）があれば secno に入る。
単体で動かすと、層ごとの単位数と字数を出す：laba_blocks.py NOTE [--out units.json] [--blocks-out blocks.json（.py を JSON に書き出す）]
使い方（他のスクリプトから）：
  from laba_blocks import load_units
  units = load_units(path)   # [{'i':0,'kind':'P','layer':'body','section':'12-3-1 …','secno':'12-3-1','text':'…'}, …]"""
import sys, re, json, importlib.util, os
from laba_common import *

SECNO = re.compile(r'^\s*((?:\d+)(?:-\d+)+|第[0-9一二三四五六七八九十]+[章節款編回]|[0-9]+[\.．]|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+|[（(][0-9a-zA-Z一二三四五六七八九十]+[）)])')
HEAD_KINDS = ('H', 'S', 'SS')
ZAK_WORDS = ('ざっくり理解', '全体像')
SUM_WORDS = ('まとめ',)
CARD_WORDS = ('論点カード', '短答', '正誤', '結論一覧', '要件・効果', '索引', '出所')

def _txt(x):
    return x if isinstance(x, str) else ''

def _layer_of_head(t):
    if any(w in t for w in ZAK_WORDS):
        return 'zak'
    if any(w in t for w in CARD_WORDS):
        return 'card'
    if any(w in t for w in SUM_WORDS):
        return 'summary'
    return None

def units_from_blocks(blocks):
    units, sec, secno, forced, zmode = [], '', '', None, False
    def add(kind, layer, text, **kw):
        if text and text.strip():
            u = {'i': len(units), 'kind': kind, 'layer': layer, 'section': sec, 'secno': secno, 'text': text.replace('**', '').strip()}
            u.update(kw); units.append(u)
    for b in blocks:
        k = b[0]; t = _txt(b[1]) if len(b) > 1 else ''
        if k in HEAD_KINDS:
            sec = t.replace('**', '').strip(); m = SECNO.match(sec)
            # 節番号は「12-3-4」型だけを更新する。(a)・(1)・「発展：…」などの小見出しは、直前の節番号を引き継ぐ
            if m and re.match(r'^\d+(-\d+)+$', m.group(1)):
                secno = m.group(1)
            elif k == 'H':
                secno = m.group(1) if m else ''
            forced = _layer_of_head(sec); zmode = False
            add(k, 'head', t)
        elif k in ('ZH',) or (k == 'C' and any(w in t for w in ZAK_WORDS)):
            zmode = True; add(k, 'head', t)
        elif k == 'C':
            zmode = False; add(k, 'head', t)
        elif k in ('Z', 'ZB', 'ZN'):
            add(k, 'zak', t)
        elif k in ('P', 'P2', 'K', 'B', 'N', 'Q'):
            zmode = False
            add(k, forced if forced in ('summary', 'card', 'zak') else 'body', t)
        elif k == 'BH':
            zmode = False
            add(k, forced if forced in ('summary', 'card', 'zak') else 'body', (t + '　' + _txt(b[2])) if len(b) > 2 else t)
        elif k in ('T', 'KD'):
            rows = b[1] if len(b) > 1 and isinstance(b[1], (list, tuple)) else []
            cap = _txt(b[2]) if len(b) > 2 else ''
            lay = 'card' if (k == 'KD' or forced == 'card' or any(w in cap for w in CARD_WORDS)) else 'table'
            for ri, r in enumerate(rows):
                for ci, c in enumerate(r):
                    if ri == 0:
                        continue
                    add(k, lay, str(c).replace('\n', ' '), row=ri, col=ci, head=str(rows[0][ci]) if ci < len(rows[0]) else '', caption=cap)
            if cap:
                add(k, 'fig' if False else lay, cap, caption_only=True)
        elif k == 'F':
            add(k, 'fig', _txt(b[2]) if len(b) > 2 else '')
    return units

def units_from_text(t):
    units, sec, secno, layer = [], '', '', 'body'
    for line in t.split('\n'):
        s = line.strip()
        if not s:
            continue
        if is_heading(s) and not s.endswith('。'):
            hl = _layer_of_head(s)
            m = SECNO.match(s)
            if m or hl or len(s) <= 22:
                if not any(w in s for w in ZAK_WORDS) or m:
                    sec = s
                    if m and re.match(r'^\d+(-\d+)+$', m.group(1)):
                        secno = m.group(1)
                layer = hl or 'body'
                units.append({'i': len(units), 'kind': 'H', 'layer': 'head', 'section': sec, 'secno': secno, 'text': s}); continue
        if re.match(r'^図\s*\d+', s):
            units.append({'i': len(units), 'kind': 'F', 'layer': 'fig', 'section': sec, 'secno': secno, 'text': s}); continue
        if ' | ' in s:
            units.append({'i': len(units), 'kind': 'T', 'layer': 'card' if layer == 'card' else 'table', 'section': sec, 'secno': secno, 'text': s.replace(' | ', ' ')}); continue
        lay = layer
        if lay == 'zak' and not re.search(r'(です|ます|でしょうか|ません)[。）」]?$', s) and re.search(r'(である|する|ない|いる|れる)。$', s):
            lay = layer = 'body'   # ざっくり理解の段が終わり、常体の本文に戻った
        units.append({'i': len(units), 'kind': 'P', 'layer': lay, 'section': sec, 'secno': secno, 'text': s})
    return units

def load_blocks(path):
    """ブロックの列を返す。build_docx.py の入力 JSON でも、DOC を定義した .py でも読める。"""
    if path.endswith('.py'):
        here = os.path.dirname(os.path.abspath(path)); sys.path.insert(0, here)
        spec = importlib.util.spec_from_file_location('laba_doc_blocks', path); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
        return [list(b) for b in m.DOC]
    d = json.load(open(path, encoding='utf-8'))
    return d['blocks'] if isinstance(d, dict) else d

def load_units(path):
    if path.endswith('.json'):
        d = json.load(open(path, encoding='utf-8'))
        return units_from_blocks(d['blocks'] if isinstance(d, dict) else d)
    if path.endswith('.py'):
        here = os.path.dirname(os.path.abspath(path)); sys.path.insert(0, here)
        spec = importlib.util.spec_from_file_location('laba_doc_units', path); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
        return units_from_blocks(m.DOC)
    return units_from_text(read(path))

def source_sections(t):
    """資料の書き起こしを節に切る。節番号つきの見出し行で切る。返り値：[{'secno','title','text'}]"""
    secs, cur = [], {'secno': '', 'title': '(冒頭)', 'text': []}
    for line in t.split('\n'):
        s = line.strip()
        m = re.match(r'^((?:\d+)(?:-\d+)+)\s*[　 ]*(\S.{0,40})?$', s)
        if m and len(s) <= 50 and not s.endswith('。'):
            if cur['text']:
                secs.append(cur)
            cur = {'secno': m.group(1), 'title': (m.group(2) or '').strip(), 'text': []}
        elif s:
            cur['text'].append(s)
    if cur['text']:
        secs.append(cur)
    for c in secs:
        c['text'] = '\n'.join(c['text'])
    return secs

def top(secno, depth=2):
    """節番号を上位 depth 段に丸める（12-3-4-1 → 12-3）。"""
    p = secno.split('-')
    return '-'.join(p[:depth]) if secno and '-' in secno else secno

def layer_text(units, layers):
    return '\n'.join(u['text'] for u in units if u['layer'] in layers)

if __name__ == '__main__':
    pos = positional()
    if not pos:
        print(__doc__); sys.exit(1)
    if arg('--blocks-out') and pos[0].endswith('.py'):
        # DOC を定義した .py を、build_docx.py の入力と同じ JSON の形に書き出す（他の検査に渡すため）
        here = os.path.dirname(os.path.abspath(pos[0])); sys.path.insert(0, here)
        spec = importlib.util.spec_from_file_location('laba_doc_export', pos[0]); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
        dump({'meta': getattr(m, 'META', {}), 'blocks': [list(b) for b in m.DOC]}, arg('--blocks-out'))
    us = load_units(pos[0])
    import collections
    c = collections.Counter(u['layer'] for u in us); ch = collections.Counter()
    for u in us:
        ch[u['layer']] += len(norm(u['text']))
    tot = sum(ch.values()) or 1
    for k in ('body', 'zak', 'summary', 'table', 'card', 'fig', 'head'):
        print(f"{k:8s} {c[k]:4d} 単位  {ch[k]:6d} 字  {pct(ch[k], tot)}%")
    if arg('--out'):
        dump(us, arg('--out'))
