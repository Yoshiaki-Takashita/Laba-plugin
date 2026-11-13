#!/usr/bin/env python3
"""判例の「理由」に、出所（判決自身の理由か、資料の説明か）の区別があるかを見る。
usage: reason_source_check.py NOTE.txt [--blocks blocks.json|text.py] [--reasons reasons.json] [--out reason.json]
見るもの：
  表：見出し行に「判例が挙げる理由」のように出所を一つにまとめた列名がないか。あるべき形は
      「判決が挙げる理由」と「資料の説明」の2列、または各セルの冒頭に［判示］［資料］（［補足］）の札。
      「判決が挙げる理由」の列に空欄・「—」がないか（理由を述べていないなら、そう書く）。
  本文：判例の書誌の直後に「という理由である」「からである」が来る文で、判決が理由を述べていない判例
      （--no-reason に年月日を並べて渡す）に理由文が付いていないか。
  「と説明されることもある」「とされている」だけで出所のない理由文の候補。
  --reasons（出所表）を渡したとき：表の「判決が挙げる理由」の欄・［判示］の札のセルごとに、その行の判例について
      出所表に判決全文の該当箇所の控え（points の excerpt と where）があるかを見る。控えのないセルは所見（error）。
      「判決は理由を述べていない」と書いたセルも、結論だけを述べた箇所の控えを要する（読まずに「述べていない」と書かない）。
      「判決文に当たれない」（大審院など）と書いたセルは、出所表の status が同じであることを見る。
--blocks を渡すと、表を正確に読める（build_docx.py の入力 JSON）。渡さないときは、全文テキストの「 | 」区切りの行から読む。"""
import sys, json
from laba_common import *

BAD_HEAD = ['判例が挙げる理由', '判例の理由', '理由（判例）']
GOOD_HEAD = ['判決が挙げる理由', '判決の理由', '判示']
SRC_HEAD = ['資料の説明', '資料（教科書）の説明', '教科書の説明', '解説の説明']
TAGS = ['［判示］', '［資料］', '［補足］', '[判示]', '[資料]', '[補足]']
EMPTY = {'', '—', '-', '－', 'なし', '同左', '同上'}

def tables_from_blocks(path):
    from laba_blocks import load_blocks
    return [b[1] for b in load_blocks(path) if b[0] in ('T', 'KD') and len(b) > 1 and isinstance(b[1], (list, tuple))]

def tables_from_text(t):
    tabs, cur = [], []
    for l in t.split('\n'):
        if ' | ' in l:
            cur.append([c.strip() for c in l.split(' | ')])
        else:
            if len(cur) >= 2:
                tabs.append(cur)
            cur = []
    if len(cur) >= 2:
        tabs.append(cur)
    return tabs

def main():
    pos = positional()
    if not pos:
        print(__doc__); sys.exit(1)
    t = read(pos[0]); issues = []
    tabs = tables_from_blocks(arg('--blocks')) if arg('--blocks') else tables_from_text(t)
    n_case_tables = 0
    for ti, rows in enumerate(tabs, 1):
        head = rows[0]
        has_case = any(CASE_RE.search(c) for r in rows[1:] for c in r)
        if not has_case or '論点' in head[0] or '問題の所在' in head:
            continue
        n_case_tables += 1
        if any(h in BAD_HEAD for h in head):
            tagged = all(any(c.startswith(tg) for tg in TAGS) or c in EMPTY for r in rows[1:] for c in [r[head.index(next(h for h in head if h in BAD_HEAD))]])
            if not tagged:
                issues.append({'kind': '列名が出所を区別していない', 'detail': f'表{ti}：「{next(h for h in head if h in BAD_HEAD)}」→「判決が挙げる理由」と「資料の説明」に分けるか、セルに［判示］［資料］の札を付ける'})
        for h in head:
            if h in GOOD_HEAD:
                j = head.index(h)
                for r in rows[1:]:
                    if j < len(r) and r[j].strip() in EMPTY:
                        issues.append({'kind': '判決の理由が空欄', 'detail': f'表{ti}：{r[0][:24]}… →「判決は理由を述べていない」「判決文は確認していない」のどちらかを書く'})
        if not any(h in GOOD_HEAD + BAD_HEAD for h in head) and any('理由' in h and '判示' not in h for h in head):
            issues.append({'kind': '理由の列の出所が不明', 'detail': f'表{ti}：見出し {head}'})
    # 出所表との突き合わせ：判示を書いたセルに、判決全文の該当箇所の控えがあるか
    n_cells = n_backed = 0
    if arg('--reasons'):
        R = {r['key']: r for r in json.load(open(arg('--reasons'), encoding='utf-8'))['cases']}
        def backed(r):
            pts = r.get('points') or []
            return bool(pts) and all((p.get('excerpt') or '').strip() and (p.get('where') or '').strip() for p in pts)
        for ti, rows in enumerate(tabs, 1):
            head = [str(h) for h in rows[0]]
            if '論点' in head[0] or any('問題の所在' in h for h in head):
                continue
            for r in rows[1:]:
                row_cases = find_cases(str(r[0]).translate(Z2H))
                for j, c in enumerate(r):
                    c = str(c).translate(Z2H)
                    if not ((j > 0 and j < len(head) and head[j] in GOOD_HEAD) or '［判示］' in c or '[判示]' in c):
                        continue
                    cs = row_cases or find_cases(c)
                    if not cs or c.strip() in EMPTY:
                        continue
                    n_cells += 1; ok = True
                    unreachable = bool(re.search(r'判決文に当たれない', c)); noreason_cell = bool(re.search(r'理由を述べていない', c)) and not re.search(r'［判示］.{12,}', c.replace('判決は理由を述べていない', ''))
                    hit_any = False
                    for x in cs:
                        rr = R.get(x['key'])
                        if rr is None:
                            issues.append({'kind': '判示のセルの判例が出所表にない', 'detail': f"表{ti}：{x['raw'][:30]}"}); ok = False; continue
                        st = rr.get('status', '')
                        if unreachable:
                            if st != '判決文に当たれない':
                                issues.append({'kind': 'セルと出所表の状態が合わない', 'detail': f"表{ti}：{x['raw'][:30]} はセルで「当たれない」、出所表は「{st}」"}); ok = False
                        elif st in ('判示を確認', '判決は理由を述べていない') and backed(rr):
                            hit_any = True
                            if noreason_cell and st != '判決は理由を述べていない' and len(cs) == 1:
                                issues.append({'kind': 'セルと出所表の状態が合わない', 'detail': f"表{ti}：{x['raw'][:30]} はセルで「理由を述べていない」、出所表は「{st}」"}); ok = False
                        elif len(cs) == 1 or not hit_any:
                            # 1つのセルに判例が複数あるときは、少なくとも判示を書いた判例に控えがあればよい（下でまとめて判定）
                            pass
                    if not unreachable and not hit_any:
                        issues.append({'kind': '判示のセルに判決全文の該当箇所の控えがない', 'detail': f"表{ti}：{str(r[0])[:30]}…（出所表の points に excerpt と where を控える。reason_table.py locate）"}); ok = False
                    n_backed += ok
    noreason = (arg('--no-reason') or '').split(',') if arg('--no-reason') else []
    for s in sentences(t):
        if re.search(r'と説明されることもある|と説明されることが多い', s):
            issues.append({'kind': '出所のない帰属', 'detail': s[:50]})
    ss = sentences(t)
    for i, s in enumerate(ss):
        for d in noreason:
            if d and d in s and i + 1 < len(ss) and re.search(r'という理由である。$', ss[i + 1]) and '述べていない' not in ss[i + 1] + s:
                issues.append({'kind': '理由を述べていない判決に理由文', 'detail': f'{d}：{ss[i + 1][:40]}'})
    res = {'n_tables_with_cases': n_case_tables, 'judgment_cells': n_cells, 'judgment_cells_backed': n_backed, 'issues': issues, 'issue_count': len(issues)}
    if arg('--out'):
        dump(res, arg('--out'))
    print(f"判例を含む表 {n_case_tables}" + (f"／判示を書いたセル {n_cells}（該当箇所の控えあり {n_backed}）" if arg('--reasons') else '') + f"／所見 {len(issues)} 件")
    for i in issues:
        print(f"  [{i['kind']}] {i['detail']}")

if __name__ == '__main__':
    main()
