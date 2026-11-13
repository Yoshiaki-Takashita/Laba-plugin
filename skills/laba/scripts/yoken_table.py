#!/usr/bin/env python3
"""要件・効果の抜き出し表を作る（指標⑫ 答案転用性）。本文から、条文つきの規律を「誰が／どの場合に（要件）／どうなる（効果）」に分けた候補を出す。
usage: yoken_table.py NOTE(.json|.py|.txt) [--out yoken.json] [--md yoken.md] [--block yoken_blocks.json]
拾い方：
  ・条文番号を含み、要件の標識（とき／場合／ならば／には／について／を要する／でなければ）と
    効果の標識（できる／できない／しなければならない／効力を生じる／生じない／とみなす／禁じられる／及ぶ／中断する／となる）の両方を持つ文
  ・「第1に」「第2に」「①②③」で要件を並べる段落（要件の列挙として1行にまとめる）
出力は候補である。人が読み、要件を番号に直し、効果を言い切りにして、論点カードの「規範」欄や要件・効果の表に使う。
検査（--check 付き）：要件の表に条文番号がない行、効果が言い切りでない行（「と考えられる」等）、同じ条文で効果が食い違う行を出す。"""
import sys, collections
from laba_common import *
from laba_blocks import load_units

REQ = re.compile(r'(ときは|ときに|とき[，、]|場合には|場合[，、]|場合に|ならば|なければ(?!なら)|には[，、]|について[，、は]|であれば|限り|かぎり)')
EFF = re.compile(r'(ことができる|ことができない|できない|なければならない|ことを要する|を要する|効力を生じ(?:る|ない)|とみなす|禁じられる|許されない|及ぶ|及ばない|中断(?:する|しない)|となる|とならない|不適法と|却下され|審査される)')
ENUM = re.compile(r'(第[1-9１-９一二三四五]に|[①-⑨])')
SOFT = re.compile(r'(と考えられ|であろう|余地がある|と思われ|可能性がある|要請されよう)')

def split_req_eff(s):
    ms = list(REQ.finditer(s))
    if not ms:
        return '', s
    # 効果の標識より前で、最後に出る要件の標識で切る
    e = EFF.search(s)
    cut = None
    for m in ms:
        if e is None or m.end() <= [x for x in EFF.finditer(s)][-1].start():
            cut = m
    if cut is None:
        return '', s
    return s[:cut.end()].strip('，、'), s[cut.end():].strip('，、 ')

def main():
    pos = positional()
    if not pos:
        print(__doc__); sys.exit(1)
    units = load_units(pos[0]); rows, enums = [], []
    for u in units:
        if u['layer'] != 'body':
            continue
        ss = sentences(u['text'], keep_heads=True) or []
        en = [s for s in ss if ENUM.match(s.strip())]
        if len(en) >= 2 or len(ENUM.findall(u['text'])) >= 3:
            st = find_statutes(u['text'])
            enums.append({'section': u['section'][:30], 'statutes': sorted(set(x['key'] for x in st))[:6],
                          'items': [x[:90] for x in (en if len(en) >= 2 else re.split(r'(?=[①-⑨])', u['text'])[1:])][:8]})
        for s in ss:
            st = find_statutes(s)
            if not st or not EFF.search(s) or not REQ.search(s) or len(norm(s)) > 190:
                continue
            req, eff = split_req_eff(s)
            if not req:
                continue
            rows.append({'section': u['section'][:30], 'statutes': sorted(set(x['key'] for x in st)), 'requirement': req, 'effect': eff,
                         'soft': bool(SOFT.search(s)), 'has_case': bool(find_cases(s))})
    issues = []
    if '--check' in sys.argv:
        by = collections.defaultdict(list)
        for r in rows:
            if r['soft']:
                issues.append(f"効果が言い切りでない：{r['section'][:14]}｜{r['effect'][:40]}")
            for k in r['statutes']:
                by[k].append(r)
        for k, v in by.items():
            pol = set(bool(re.search(r'できない|生じない|及ばない|許されない|禁じられる|中断しない|とならない', x['effect'])) for x in v)
            if len(v) >= 2 and len(pol) == 2:
                issues.append(f'{k}：向きの違う効果が {len(v)} 行ある（原則と例外の書き分けか、食い違いかを確かめる）')
    res = {'n_rows': len(rows), 'n_enumerations': len(enums), 'rows': rows, 'enumerations': enums, 'issues': issues}
    if arg('--out'):
        dump(res, arg('--out'))
    if arg('--md'):
        L = ['# 要件・効果の候補（作業用）', '', '| 条文 | 要件（どの場合に） | 効果（どうなる） | 節 |', '|---|---|---|---|']
        L += [f"| {'・'.join(r['statutes'])} | {r['requirement']} | {r['effect']} | {r['section']} |" for r in rows]
        L += ['', '## 要件の列挙（第1に…／①…）', '']
        for e in enums:
            L += [f"- {e['section']}（{'・'.join(e['statutes']) or '条文なし'}）"] + [f'  - {x}' for x in e['items']]
        open(arg('--md'), 'w', encoding='utf-8').write('\n'.join(L) + '\n')
    if arg('--block'):
        t = [['条文', '要件（どの場合に）', '効果（どうなる）']] + [['・'.join(r['statutes']), r['requirement'], r['effect']] for r in rows]
        dump({'blocks': [['T', t, '要件・効果の一覧（本文から抜き出したもの）', [30, 66, 64]]]}, arg('--block'))
    for x in issues:
        print('  所見:', x)
    print(f'要件・効果の候補 {len(rows)} 行／要件の列挙 {len(enums)} 段落／所見 {len(issues)}')
    if '-v' in sys.argv:
        for r in rows[:15]:
            print(f"  {'・'.join(r['statutes'])[:18]}｜{r['requirement'][:40]}→{r['effect'][:40]}")

if __name__ == '__main__':
    main()
