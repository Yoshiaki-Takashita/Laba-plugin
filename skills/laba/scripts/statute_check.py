#!/usr/bin/env python3
"""ノート中の条文の引用を抜き出し、照合用の一覧を作る。同じ条について食い違う説明の候補も出す。
usage: statute_check.py NOTE.txt [--default-law 民事訴訟法] [--out statute.json] [--md statute.md]
出すもの：
  ①法令名＋条（項・号・ただし書）の一覧と、ノートでその条に触れている文（冒頭60字）
  ②同じ条に、向きの違う語（できる／できない、要する／要しない、有効／無効 など）が付いている文の組（食い違いの候補。誤検知あり）
  ③法令名の略称が初出で開かれていない候補、項・号まで書いていない引用
この検査は条文の中身が正しいかは見ない。①の一覧を e-Gov 法令検索の現行条文と1件ずつ照合する（references/statute-verification.md）。
照合のとき見る点：条番号・項号、要件の限定の語（「同一の」「〜に限り」「〜の時までに」）、効果、名宛人、ただし書。"""
import sys, collections
from laba_common import *

ABBR = {'民': '民法', '刑': '刑法', '商': '商法', '会社': '会社法', '民訴': '民事訴訟法', '刑訴': '刑事訴訟法', '民執': '民事執行法', '民保': '民事保全法',
        '破': '破産法', '人訴': '人事訴訟法', '行訴': '行政事件訴訟法', '行手': '行政手続法', '憲': '憲法', '規': '（規則）', '信託': '信託法', '不登': '不動産登記法'}
POLAR = [('できる', 'できない'), ('要する', '要しない'), ('必要である', '必要はない'), ('有効', '無効'), ('適法', '不適法'), ('及ぶ', '及ばない'),
         ('生ずる', '生じない'), ('許される', '許されない'), ('認められる', '認められない')]

def main():
    pos = positional()
    if not pos:
        print(__doc__); sys.exit(1)
    t = read(pos[0]); default = arg('--default-law', '')
    by = collections.OrderedDict()
    for s in sentences(t, keep_heads=True):
        for st in find_statutes(s):
            law = ABBR.get(st['law'], st['law']) or default or '（法令名なし）'
            key = law + ' ' + st['key'][len(st['law']):]
            e = by.setdefault(key, {'law': law, 'cite': st['key'][len(st['law']):], 'article': st['article'], 'sentences': []})
            head = s[:60]
            if head not in e['sentences']:
                e['sentences'].append(head)
    # 食い違いの候補：同じ条（項まで同じ）に、反対向きの語
    conflicts = []
    full = {}
    for s in sentences(t, keep_heads=True):
        for st in find_statutes(s):
            full.setdefault((ABBR.get(st['law'], st['law']) or default) + st['key'][len(st['law']):], []).append(s)
    for k, ss in full.items():
        for a, b in POLAR:
            sa = [s for s in ss if a in s and b not in s]; sb = [s for s in ss if b in s]
            if sa and sb and len(ss) <= 12:
                conflicts.append({'statute': k, 'words': [a, b], 'a': sa[0][:50], 'b': sb[0][:50]})
    nolaw = [k for k, e in by.items() if e['law'] == '（法令名なし）']
    coarse = sorted(set(e['law'] + ' ' + e['article'] for e in by.values()) - set(k for k in by if re.search(r'[項号書段文]', k)))
    res = {'n_statutes': len(by), 'statutes': list(by.values()), 'conflict_candidates': conflicts, 'no_law_name': nolaw,
           'article_only': coarse, 'laws': sorted(set(e['law'] for e in by.values()))}
    if arg('--out'):
        dump(res, arg('--out'))
    if arg('--md'):
        with open(arg('--md'), 'w', encoding='utf-8') as f:
            f.write('# 条文の照合表（e-Gov の現行条文と1件ずつ照らす）\n\n| 法令 | 条 | ノートの文（冒頭） | 番号 | 限定の語 | 効果・名宛人 | 照合日 |\n|---|---|---|---|---|---|---|\n')
            for e in by.values():
                f.write(f"| {e['law']} | {e['cite']} | {e['sentences'][0]} | □ | □ | □ | |\n")
    print(f"条文 {len(by)} 件（法令 {len(res['laws'])} 種）／食い違いの候補 {len(conflicts)} 件／法令名なし {len(nolaw)} 件")
    for c in conflicts[:10]:
        print(f"  [候補] {c['statute']}：「{c['words'][0]}」{c['a'][:28]}… ／「{c['words'][1]}」{c['b'][:28]}…")

if __name__ == '__main__':
    main()
