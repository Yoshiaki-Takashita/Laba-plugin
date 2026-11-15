#!/usr/bin/env python3
"""ノートの判例書誌と条文番号の形式を検査する。
usage: cite_check.py NOTE.txt [--inventory inventory.json] [--out cite.json]
見るもの：①年月日の表記ゆれ（「昭和43・3・8」と「昭和43年3月8日」の混在）②同じ判例に食い違う書誌 ③書誌のない判例（初出）
④「前掲」が初出より前にある ⑤条文の表記ゆれ（ただし書／但書、第1項／1項）⑥資料の書誌との食い違い（--inventory）。
書誌が「正しいか」は機械では分からない。裁判所サイトでの確認は references/case-verification.md。"""
import sys, collections
from laba_common import *

def main():
    pos = positional()
    if not pos:
        print(__doc__); sys.exit(1)
    t = read(pos[0]); cs = find_cases(t); issues = []
    style = collections.Counter('nen' if '年' in c['date'] else 'dot' for c in cs)
    if style['nen'] and style['dot']:
        issues.append({'kind': '年月日の表記ゆれ', 'detail': f"「・」式 {style['dot']} 件／「年月日」式 {style['nen']} 件"})
    by = collections.OrderedDict()
    for c in cs:
        by.setdefault(c['key'], []).append(c)
    for k, v in by.items():
        cites = sorted(set(c['cite'] for c in v if c['cite']))
        main_rep = collections.defaultdict(set)
        for ci in cites:
            main_rep[re.match(REPORTER, ci).group(0)].add(ci)
        for rep, s in main_rep.items():
            if len(s) > 1:
                issues.append({'kind': '同じ判例に食い違う書誌', 'detail': f'{k}: {sorted(s)}'})
        if not cites:
            issues.append({'kind': '書誌のない判例', 'detail': k})
        if v[0]['prev']:
            issues.append({'kind': '初出が「前掲」', 'detail': k})
    st = find_statutes(t)
    if any('但書' in s['raw'] for s in st) and any('ただし書' in s['raw'] for s in st):
        issues.append({'kind': '条文の表記ゆれ', 'detail': '「但書」と「ただし書」が混在'})
    if re.search(r'条第\d+項', t) and re.search(r'条\d+項', t):
        issues.append({'kind': '条文の表記ゆれ', 'detail': '「条第1項」と「条1項」が混在'})
    if arg('--inventory'):
        inv = json.load(open(arg('--inventory'), encoding='utf-8'))
        for c in inv['cases']:
            if c['key'] in by:
                nc = set(x['cite'] for x in by[c['key']] if x['cite'])
                for ci in c['cites']:
                    rep = re.match(REPORTER, ci).group(0)
                    same = [x for x in nc if x.startswith(rep)]
                    if same and ci not in same:
                        issues.append({'kind': '資料の書誌と食い違い', 'detail': f"{c['key']}: 資料 {ci}／ノート {same}"})
    res = {'n_cases': len(by), 'n_case_mentions': len(cs), 'n_statutes': len(set(s['key'] for s in st)), 'issues': issues,
           'issue_count': len(issues)}
    if arg('--out'):
        dump(res, arg('--out'))
    print(f"判例 {len(by)} 件（言及 {len(cs)} 回）／条文 {res['n_statutes']} 種／所見 {len(issues)} 件")
    for i in issues:
        print(f"  [{i['kind']}] {i['detail']}")

if __name__ == '__main__':
    main()
