#!/usr/bin/env python3
"""資料テキストから、見出し・判例・条文・相互参照を抜き出して一覧にする（網羅の土台）。
usage: inventory.py SOURCE.txt --out inventory.json [--md inventory.md]
正規表現による機械抽出なので、必ず目で見て補正する（とくに見出しとコラム）。"""
import sys, collections
from laba_common import *

def main():
    pos = positional()
    if not pos:
        print(__doc__); sys.exit(1)
    t = read(pos[0])
    heads = []
    for l in t.split('\n'):
        s = l.strip()
        if s and HEAD_RE.match(s) and len(s) <= 60 and not s.endswith('。'):
            heads.append(s)
    cases = collections.OrderedDict()
    for c in find_cases(t):
        e = cases.setdefault(c['key'], {'key': c['key'], 'cites': [], 'count': 0})
        e['count'] += 1
        if c['cite'] and c['cite'] not in e['cites']:
            e['cites'].append(c['cite'])
    stats_ = collections.OrderedDict()
    for s in find_statutes(t):
        stats_.setdefault(s['key'], 0); stats_[s['key']] += 1
    xrefs = sorted(set(XREF_RE.findall(t)))
    questions = [l.strip() for l in t.split('\n') if re.search(r'(答えよ|まとめよ|説明しなさい|検討せよ|論じなさい|か。$|できるか|認められるか)', l) and re.match(r'^\s*(Q|設問|問|[①-⑳]|\(?\d+\)?)', l.strip())]
    inv = {'headings': heads, 'cases': list(cases.values()), 'statutes': [{'key': k, 'count': v} for k, v in stats_.items()],
           'xrefs': xrefs, 'questions': questions}
    dump(inv, arg('--out', 'inventory.json'))
    if arg('--md'):
        with open(arg('--md'), 'w', encoding='utf-8') as f:
            f.write('# 資料の一覧（機械抽出。目で補正すること）\n\n## 見出し\n')
            f.writelines(f'- [ ] {h}\n' for h in heads)
            f.write('\n## 判例\n'); f.writelines(f"- [ ] {c['key']} {' / '.join(c['cites'])}\n" for c in cases.values())
            f.write('\n## 条文\n'); f.writelines(f'- [ ] {k}\n' for k in stats_)
            f.write('\n## 相互参照\n'); f.writelines(f'- [ ] ⇨{x}\n' for x in xrefs)
            f.write('\n## 問い（答えを付ける）\n'); f.writelines(f'- [ ] {q}\n' for q in questions)
    print(f"見出し {len(heads)}／判例 {len(cases)}／条文 {len(stats_)}／相互参照 {len(xrefs)}／問い {len(questions)}")

if __name__ == '__main__':
    main()
