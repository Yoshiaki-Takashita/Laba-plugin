#!/usr/bin/env python3
"""laba 共通関数：文の分割、正規化、判例・条文の正規表現。標準ライブラリのみ。"""
import re, json, sys, statistics

Z2H = str.maketrans('０１２３４５６７８９', '0123456789')
KANJI = re.compile(r'[一-鿿々]')
KATA = re.compile(r'[ァ-ヺ]')

# 判例の書誌（「最判昭和43・3・8民集22巻3号551頁」「最大判平成9年4月2日」など）
COURT = r'(?:最大判|最大決|最判|最決|大判|大決|大連判|[^\s（）()、，。]{2,6}?(?:高|地|家|簡)(?:判|決)(?:[^\s（）()、，。]{0,3}支)?)'
ERA = r'(?:明治|大正|昭和|平成|令和)'
DATE = ERA + r'(?:元|\d{1,2})(?:年|・|\.)\s*\d{1,2}(?:月|・|\.)\s*\d{1,2}日?'
REPORTER = r'(?:民集|刑集|民録|刑録|集民|集刑|判時|判タ|金判|金法|労判|行集|高民集|高刑集|下民集|訟月|家月|裁時)'
CITE = r'(?:\s*' + REPORTER + r'\s*\d+\s*(?:巻|輯)?\s*(?:\d+\s*号)?\s*\d+\s*頁)'
CASE_RE = re.compile(r'(前掲)?(' + COURT + r')\s*(' + DATE + r')(' + CITE + r')?')
# 条文（「民法94条2項」「民執59条1項」「41条1項・2項」「587条の2第1項」）
LAWNAME = r'(?:[一-龥ぁ-んァ-ヶ]{1,10}?(?:法|規則|令|条例|規)|民|刑|商|会社|民訴|刑訴|民執|民保|破|人訴|行訴|行手|憲|規|信託|借地借家|不登|手|小)?'
STAT_RE = re.compile(r'(' + LAWNAME + r')\s*(\d{1,4})条(の\d+)?(?:(?:第)?(\d{1,2})項)?(?:(?:第)?(\d{1,2})号)?(ただし書|但書|本文|前段|後段|かっこ書)?')
XREF_RE = re.compile(r'[⇨→]\s*([0-9]+(?:-[0-9]+)+)')
HEAD_RE = re.compile(r'^\s*(?:第[0-9一二三四五六七八九十]+[章節款編回]|[0-9]+(?:-[0-9]+)+|[0-9０-９]+[\.．]|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+[\s　\.．]|[（(][0-9a-zA-Zａ-ｚ一二三四五六七八九十ｱ-ﾝア-ン]+[）)]|[①-⑳]|〇|■|◆|Q\s*[0-9]*\s*[:：]|すこし詳しく|コラム|発展)')

def read(path):
    return open(path, encoding='utf-8').read().translate(Z2H)

def norm(t):
    """比較用の正規化：空白・句読点・括弧・中黒を除く。"""
    return re.sub(r'[\s　，、。．,.（）()「」『』〔〕\[\]・:：;；]', '', t.translate(Z2H))

def paragraphs(t):
    return [p.strip() for p in re.split(r'\n\s*\n|\n', t) if p.strip()]

def sentences(t, keep_heads=False):
    """句点で文に分ける。括弧の中の句点では切らない。見出しらしい行は除く。"""
    out = []
    for line in t.split('\n'):
        line = line.strip()
        if not line:
            continue
        if not keep_heads and is_heading(line):
            continue
        buf, d = '', 0
        for ch in line:
            buf += ch
            if ch in '（(「':
                d += 1
            elif ch in '）)」':
                d = max(0, d - 1)
            elif ch in '。？！' and d == 0:
                out.append(buf.strip()); buf = ''
        if buf.strip():
            out.append(buf.strip())
    return out

def is_heading(line):
    line = line.strip()
    if len(line) <= 45 and not line.endswith(('。', '.', '．')) and (HEAD_RE.match(line) or len(line) <= 22):
        return True
    return False

def pct(a, b):
    return round(100.0 * a / b, 1) if b else 0.0

def stats(xs):
    if not xs:
        return {'mean': 0, 'median': 0, 'max': 0}
    return {'mean': round(statistics.mean(xs), 1), 'median': statistics.median(xs), 'max': max(xs)}

def case_key(m):
    """裁判所＋年月日を正規化した鍵（表記ゆれを吸収）。"""
    court = m.group(2)
    d = re.sub(r'[年月\.]', '・', m.group(3)); d = re.sub(r'日|\s', '', d)
    return court + d

def find_cases(t):
    res = []
    for m in CASE_RE.finditer(t):
        res.append({'key': case_key(m), 'court': m.group(2), 'date': m.group(3),
                    'cite': re.sub(r'\s', '', m.group(4) or ''), 'prev': bool(m.group(1)), 'raw': m.group(0), 'pos': m.start()})
    return res

def find_statutes(t):
    res = []
    for m in STAT_RE.finditer(t):
        law = m.group(1) or ''
        key = f"{law}{m.group(2)}条{m.group(3) or ''}" + (f"{m.group(4)}項" if m.group(4) else '') + (f"{m.group(5)}号" if m.group(5) else '') + (m.group(6) or '').replace('但書', 'ただし書')
        res.append({'key': key, 'article': f"{m.group(2)}条{m.group(3) or ''}", 'law': law, 'raw': m.group(0), 'pos': m.start()})
    return res

def dump(obj, path=None):
    s = json.dumps(obj, ensure_ascii=False, indent=2)
    if path:
        open(path, 'w', encoding='utf-8').write(s)
    return s

def arg(flag, default=None):
    if flag in sys.argv:
        i = sys.argv.index(flag)
        if i + 1 < len(sys.argv):
            return sys.argv[i + 1]
    return default

def positional():
    out, skip = [], False
    for i, a in enumerate(sys.argv[1:]):
        if skip:
            skip = False; continue
        if a.startswith('--'):
            if a not in ('--json-only', '--verbose', '--strict', '--comma-full', '--no-footer', '--only-terms', '--write', '--check-only', '--global'):
                skip = True
            continue
        if a == '-v':
            continue
        out.append(a)
    return out
