#!/usr/bin/env python3
"""inventory.json（資料の一覧）とノートを照合し、欠落を列挙する。
usage: coverage_check.py inventory.json NOTE.txt [--out coverage.json] [--ignore ignore.json]
見出しは番号（12-3-4 など）か見出し語の一致、判例は裁判所＋年月日、条文は条番号で照合する。
--ignore：機械の誤検知（見出しではない行を見出しと数えた、など）を除く一覧。形は [{"item": "欠落として出た文字列", "reason": "除く理由"}, …]。
          理由のない項目は除かない。除いた項目は ignored として出力に残る（黙って消さない）。"""
import sys
from laba_common import *

def main():
    pos = positional()
    if len(pos) < 2:
        print(__doc__); sys.exit(1)
    inv = json.load(open(pos[0], encoding='utf-8')); note = read(pos[1]); nn = norm(note)
    miss = {'headings': [], 'cases': [], 'case_cites': [], 'statutes': [], 'xrefs': []}
    for h in inv['headings']:
        m = re.match(r'^\s*([0-9]+(?:-[0-9]+)+)', h)
        key = m.group(1) if m else None
        title = norm(re.sub(r'^\s*\S+\s*', '', h)) if ' ' in h or '　' in h else norm(h)
        if not ((key and key in note) or (title and len(title) >= 3 and title in nn) or norm(h) in nn):
            miss['headings'].append(h)
    nc = {}
    for c in find_cases(note):
        nc.setdefault(c['key'], set())
        if c['cite']:
            nc[c['key']].add(c['cite'])
    for c in inv['cases']:
        if c['key'] not in nc:
            miss['cases'].append(c['key'])
        else:
            for ci in c['cites']:
                if nc[c['key']] and ci not in nc[c['key']]:
                    miss['case_cites'].append({'case': c['key'], 'source': ci, 'note': sorted(nc[c['key']])})
    ns = set(s['article'] for s in find_statutes(note))
    for s in inv['statutes']:
        art = re.search(r'\d+条(の\d+)?', s['key']).group(0)
        if art not in ns:
            miss['statutes'].append(s['key'])
    for x in inv['xrefs']:
        if x not in note:
            miss['xrefs'].append(x)
    ignored = []
    if arg('--ignore'):
        ig = {x['item']: x.get('reason', '') for x in json.load(open(arg('--ignore'), encoding='utf-8')) if x.get('reason', '').strip()}
        for k in ('headings', 'cases', 'statutes', 'xrefs'):
            keep = []
            for x in miss[k]:
                if x in ig:
                    ignored.append({'kind': k, 'item': x, 'reason': ig[x]})
                else:
                    keep.append(x)
            miss[k] = keep
    tot = len(inv['headings']) + len(inv['cases']) + len(inv['statutes']) + len(inv['xrefs']) - len(ignored)
    lost = len(miss['headings']) + len(miss['cases']) + len(miss['statutes']) + len(miss['xrefs'])
    res = {'total_items': tot, 'missing_items': lost, 'coverage_pct': pct(tot - lost, tot),
           'by_kind': {k: {'total': len(inv[k]) if k in inv else None, 'missing': len(v)} for k, v in miss.items()}, 'missing': miss, 'ignored': ignored}
    if arg('--out'):
        dump(res, arg('--out'))
    print(f"機械照合の網羅率 {res['coverage_pct']}%（{tot - lost}/{tot}）")
    if ignored:
        print(f"  誤検知として除いた項目 {len(ignored)}（理由つき。coverage.json の ignored）")
    for k, v in miss.items():
        if v:
            print(f"  欠落 {k}: {len(v)}"); [print('   -', x) for x in v[:15]]

if __name__ == '__main__':
    main()
