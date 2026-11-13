#!/usr/bin/env python3
"""資料とノートの連続一致（丸写しの程度）を実測する。
usage: match_check.py SOURCE.txt NOTE.txt [--terms terms.txt] [--k 20] [--out match.json] [-v]
必ず二つの値を出す。
  raw      ：正規化した全文で、資料と k 字以上連続して一致する極大区間（甘くしない値。報告にはこれを必ず書く）
  filtered ：判例の書誌を除き、条文・定義の文を除き、術語を1字に畳んでから数えた値（地の文の流用の目安）
術語は --terms のファイル（1行1語）に加え、資料に5回以上出る漢字4字以上の連なりを自動で拾う。"""
import sys, collections
from laba_common import *

def runs(n, grams, k):
    hits, i, L = [], 0, len(n)
    while i <= L - k:
        if n[i:i + k] in grams:
            j = i + k
            while j < L and n[j - k + 1:j + 1] in grams:
                j += 1
            hits.append(n[i:j]); i = j
        else:
            i += 1
    return hits

def auto_terms(src):
    c = collections.Counter(re.findall(r'[一-鿿々]{4,12}', src))
    return [w for w, v in c.items() if v >= 5]

def squeeze(t, terms):
    for i, w in enumerate(terms):
        t = t.replace(w, chr(0xE000 + i % 6000))
    return t

def unsqueeze(t, terms):
    for i, w in enumerate(terms[:6000]):
        t = t.replace(chr(0xE000 + i), w)
    return t

def strip_cites(t):
    return CASE_RE.sub('', t)

DEF_RX = re.compile(r'(?:とは[，、]|をいう。|という。|条は[，、]|項は[，、]|と定める。|と規定する。)')

def gram_rate(n, b, k=12):
    g = set(b[i:i + k] for i in range(len(b) - k + 1))
    tot = max(1, len(n) - k + 1)
    return pct(sum(1 for i in range(tot) if n[i:i + k] in g), tot)

def main():
    pos = positional()
    if len(pos) < 2:
        print(__doc__); sys.exit(1)
    k = int(arg('--k', '20'))
    src, note = read(pos[0]), read(pos[1]).replace('、', '，')
    src = src.replace('、', '，')
    note_lines = [l for l in note.split('\n') if l.strip() and not is_heading(l)]
    B = norm(src); N = '\x00'.join(norm(l) for l in note_lines)
    g = set(B[i:i + k] for i in range(len(B) - k + 1))
    raw = runs(N, g, k)
    raw_cite = [h for h in raw if re.search(r'(民集|刑集|判時|判タ|民録)\d', h) or re.search(r'(最判|最決|最大判|大判)(昭和|平成|大正|令和|明治)', h)]
    # filtered
    terms = auto_terms(src)
    if arg('--terms'):
        terms += [l.strip() for l in open(arg('--terms'), encoding='utf-8') if l.strip()]
    terms = sorted(set(terms), key=len, reverse=True)
    def filt(text, drop_defs):
        out = []
        for l in text.split('\n'):
            if not l.strip() or is_heading(l):
                continue
            ss = sentences(l, keep_heads=True)
            if drop_defs:
                ss = [s for s in ss if not DEF_RX.search(s)]
            out.append(norm(squeeze(strip_cites(''.join(ss)), terms)))
        return out
    Bf = ''.join(filt(src, False)); Nf = '\x00'.join(filt(note, True))
    gf = set(Bf[i:i + k] for i in range(len(Bf) - k + 1))
    fl = runs(Nf, gf, k)
    res = {
        'k': k,
        'raw': {'count': len(raw), 'count_citation': len(raw_cite), 'count_other': len(raw) - len(raw_cite),
                'longest': max([len(h) for h in raw] or [0]), 'gram12_rate_pct': gram_rate(N, B)},
        'filtered': {'count': len(fl), 'longest': max([len(h) for h in fl] or [0]), 'gram12_rate_pct': gram_rate(Nf, Bf),
                     'n_terms_squeezed': len(terms)},
        'note_chars': len(norm(''.join(note_lines))), 'source_chars': len(B),
        'length_ratio': round(len(norm(''.join(note_lines))) / max(1, len(B)), 2),
        'top_raw': sorted(raw, key=len, reverse=True)[:5] if '-v' in sys.argv else [],
        # 除外後の一致（長い順）。術語は元の語に戻して表示する。どの文を書き直すかを決めるのに使う（references/metrics/10-originality.md）
        'filtered_hits': [unsqueeze(h, terms) for h in sorted(fl, key=len, reverse=True)],
    }
    res['non_copy_rate_pct'] = round(100 - res['raw']['gram12_rate_pct'], 1)
    if arg('--out'):
        o = dict(res); o['top_raw'] = [len(x) for x in sorted(raw, key=len, reverse=True)[:5]]
        dump(o, arg('--out'))
    r, f = res['raw'], res['filtered']
    print(f"raw     : {k}字一致 {r['count']}か所（書誌 {r['count_citation']}／ほか {r['count_other']}） 最長 {r['longest']}字 12字一致率 {r['gram12_rate_pct']}%")
    print(f"filtered: {k}字一致 {f['count']}か所 最長 {f['longest']}字 12字一致率 {f['gram12_rate_pct']}%（術語 {f['n_terms_squeezed']}語を畳み、書誌・定義文を除く）")
    print(f"分量：ノート {res['note_chars']}字／資料 {res['source_chars']}字＝{res['length_ratio']}倍")
    if '-v' in sys.argv:
        for h in res['top_raw']:
            print('  ', len(h), h[:60])

if __name__ == '__main__':
    main()
