#!/usr/bin/env python3
"""判例研究の引用台帳を検査する。標準ライブラリだけで動く。
usage: ledger.py RESUME.txt --ledger LEDGER.tsv [--json out.json]
台帳（タブ区切り、1文献1行。1行目は見出し行）
  id	書誌	確認に使った資料（URL・利用者が貼った資料など）	格付け	使い方
  格付け：A（原文を自分で読んだ＝V3）／B（二次資料の要約で知った＝V1）／C（書誌だけ確かめた＝V2）／X（記憶だけ＝V0。書かない）
  使い方：【中心】【一次】【二次】【指導教員】【要入手】などの印と、頁（「p.12」）
本文の中では、文献を〔R01〕のように ID で指す（仕上げで ID を外す前に検査する）。
検査（E＝直す、W＝確かめる）
  E grade-missing   格付けがない、または A・B・C・X 以外
  E x-used          X（記憶だけ）の文献を本文で使っている
  E unread-quote    A でない文献の ID の近くに「」の引用（20字以上）がある
  E unread-page     A でない文献に頁を付けて引いている（本文の ID の直後、または台帳の使い方欄）
  E advisor-unread  【指導教員】の印があり A でない文献を本文で使っている
  E c-in-body       C（書誌だけ）の文献を本文で使っている（参考文献にだけ載せる）
  W b-no-marker     B の文献を使う段落に「（〜の整理による）」がない
  E not-in-ledger   本文にあるのに台帳にない ID
  W unused          台帳にあるのに本文で使っていない行（A・B）
  W no-source       A・B・C なのに「確認に使った資料」が空
  W page-mismatch   同じ ID に、箇所によって違う頁が付いている
  W toget           【要入手】が残っている（渡すときの報告の冒頭に書く）
  W marker-left     【要確認】など作業の印が本文に残っている
終了コード：E が1件でもあれば 1。"""
import sys, re, json

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    opt = lambda n: sys.argv[sys.argv.index(n) + 1] if n in sys.argv else None
    led = opt('--ledger')
    args = [a for a in args if a not in (led, opt('--json'))]
    if not args or not led:
        print(__doc__); sys.exit(2)
    text = open(args[0], encoding='utf-8').read()
    rows = {}
    F = []; add = lambda sev, code, msg: F.append({'sev': sev, 'code': code, 'msg': msg})
    for i, ln in enumerate(open(led, encoding='utf-8').read().splitlines()):
        if i == 0 or not ln.strip(): continue
        c = (ln.split('\t') + [''] * 5)[:5]
        rid, bib, src, grade, use = [x.strip() for x in c]
        if rid in rows: add('E', 'grade-missing', f'ID が重複：{rid}')
        rows[rid] = {'bib': bib, 'src': src, 'grade': grade.upper()[:1], 'use': use}
        if grade.upper()[:1] not in ('A', 'B', 'C', 'X'): add('E', 'grade-missing', f'{rid}：格付けがない（A・B・C・X のどれか）')
        if grade.upper()[:1] in ('A', 'B', 'C') and not src: add('W', 'no-source', f'{rid}：確認に使った資料が空')
        if grade.upper()[:1] != 'A' and re.search(r'p\.?\s*\d+|\d+頁', use): add('E', 'unread-page', f'{rid}：原文を読んでいないのに、台帳の使い方欄に頁がある')
        if '【要入手】' in use: add('W', 'toget', f'{rid}：【要入手】（{bib[:30]}）。本文に書かず、報告の冒頭に挙げる')
    paras = [p for p in re.split(r'\n+', text) if p.strip()]
    used = {}
    for p in paras:
        for m in re.finditer(r'〔(R\d+)〕((?:\s*(?:p\.?\s*)?\d+(?:[-–〜]\d+)?頁?)?)', p):
            rid, page = m.group(1), m.group(2).strip()
            used.setdefault(rid, []).append(page)
            r = rows.get(rid)
            if not r: add('E', 'not-in-ledger', f'本文の {rid} が台帳にない'); continue
            g = r['grade']
            if g == 'X': add('E', 'x-used', f'{rid}：記憶だけの文献を本文で使っている')
            if g == 'C': add('E', 'c-in-body', f'{rid}：書誌だけ確かめた文献を本文で使っている（参考文献にだけ載せる）')
            if g != 'A' and page: add('E', 'unread-page', f'{rid}：原文を読んでいないのに頁（{page}）を付けている')
            if g != 'A' and '【指導教員】' in r['use']: add('E', 'advisor-unread', f'{rid}：指導教員の文献を、原文を読まずに本文で使っている')
            if g != 'A':
                near = p[max(0, m.start() - 160):m.start()]
                q = re.findall(r'「([^」]{20,})」', near)
                if q: add('E', 'unread-quote', f'{rid}：原文を読んでいないのに「」の引用がある（「{q[-1][:18]}…」）')
            if g == 'B' and not re.search(r'の整理による|による整理|の紹介による', p): add('W', 'b-no-marker', f'{rid}：二次資料で知った内容に「（〜の整理による）」がない')
    for rid, pages in used.items():
        ps = {x for x in pages if x}
        if len(ps) > 1: add('W', 'page-mismatch', f'{rid}：箇所によって頁が違う（{"、".join(sorted(ps))}）。同じ箇所なら揃える')
    for rid, r in rows.items():
        if rid not in used and r['grade'] in ('A', 'B'): add('W', 'unused', f'{rid}：台帳にあるが本文で使っていない')
    for mk in re.findall(r'【要確認】|【未確認】|〔要確認〕|TODO', text): add('W', 'marker-left', f'作業の印が本文に残っている：{mk}')
    E = [f for f in F if f['sev'] == 'E']; W = [f for f in F if f['sev'] == 'W']
    cnt = {g: sum(1 for r in rows.values() if r['grade'] == g) for g in 'ABCX'}
    print(f"台帳 {len(rows)} 件（A {cnt['A']}・B {cnt['B']}・C {cnt['C']}・X {cnt['X']}）、本文で使った ID {len(used)} 件。error {len(E)}、warn {len(W)}")
    for f in F: print(f"  {f['sev']} [{f['code']}] {f['msg']}")
    if opt('--json'): json.dump({'counts': cnt, 'used': len(used), 'errors': len(E), 'warnings': len(W), 'findings': F}, open(opt('--json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    sys.exit(1 if E else 0)

if __name__ == '__main__':
    main()
