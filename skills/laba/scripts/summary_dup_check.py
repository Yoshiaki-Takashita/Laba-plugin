#!/usr/bin/env python3
"""まとめ・全体像・ざっくり理解（言い直しの層）どうし、および本文との重複を測る。
usage: summary_dup_check.py blocks.json|text.py [--out summary.json]      （build_docx.py の入力 JSON、または DOC を定義した .py）
       summary_dup_check.py NOTE.txt --text [--out summary.json]  （全文テキスト。見出し「まとめ」「全体像」「ざっくり理解」の直後の段落を層とみなす）
出すもの：
  言い直しの層の分量（全体に対する割合。目標 4%以下〔ざっくり理解を除く、まとめ・全体像の合計〕）
  まとめの数（目標：全体のまとめ1か所。章末のまとめと全体のまとめで同じ内容を繰り返さない）
  まとめの文ごとに、本文と12字一致する割合（50%を超える文は、本文の言い直し）
  まとめどうしの12字一致（同じ要約の繰り返し）"""
import sys, json
from laba_common import *

def grams(s, k=12):
    n = norm(s)
    return set(n[i:i + k] for i in range(len(n) - k + 1))

def layers_from_blocks(path):
    from laba_blocks import load_blocks
    body, summ, zak, mode = [], [], [], None
    for b in load_blocks(path):
        k, t = b[0], (b[1] if len(b) > 1 and isinstance(b[1], str) else '')
        if k in ('H', 'S', 'SS', 'C'):
            mode = 'summary' if re.search(r'まとめ|全体像', t) else None
            if mode:
                summ.append({'title': t, 'text': []})
            continue
        if k in ('Z', 'ZB', 'ZN', 'ZH'):
            zak.append(t); continue
        if k in ('P', 'P2', 'K', 'B', 'N'):
            (summ[-1]['text'] if mode else body).append(t)
    return body, summ, zak

def layers_from_text(t):
    body, summ, zak, mode = [], [], [], None
    for l in t.split('\n'):
        s = l.strip()
        if not s:
            continue
        if is_heading(s):
            mode = 'summary' if re.search(r'まとめ|全体像', s) else 'zak' if 'ざっくり理解' in s else None
            if mode == 'summary':
                summ.append({'title': s, 'text': []})
            continue
        if mode == 'summary':
            summ[-1]['text'].append(s)
        elif mode == 'zak':
            zak.append(s)
        else:
            body.append(s)
    return body, summ, zak

def main():
    pos = positional()
    if not pos:
        print(__doc__); sys.exit(1)
    body, summ, zak = layers_from_text(read(pos[0])) if '--text' in sys.argv else layers_from_blocks(pos[0])
    bg = grams('\n'.join(body))
    total = sum(len(norm(x)) for x in body) + sum(len(norm(x)) for s in summ for x in s['text']) + sum(len(norm(x)) for x in zak)
    s_chars = sum(len(norm(x)) for s in summ for x in s['text'])
    rows = []
    for s in summ:
        for sent in sentences('\n'.join(s['text']), keep_heads=True):
            g = grams(sent)
            r = pct(len(g & bg), len(g)) if g else 0
            rows.append({'summary': s['title'], 'sentence_head': sent[:30], 'overlap_with_body_pct': r})
    cross = []
    for i in range(len(summ)):
        for j in range(i + 1, len(summ)):
            a, b = grams('\n'.join(summ[i]['text'])), grams('\n'.join(summ[j]['text']))
            if a and b:
                cross.append({'a': summ[i]['title'], 'b': summ[j]['title'], 'overlap_pct': pct(len(a & b), min(len(a), len(b)))})
    high = [r for r in rows if r['overlap_with_body_pct'] > 50]
    res = {'n_summaries': len(summ), 'summary_titles': [s['title'] for s in summ], 'restatement_share_pct': pct(s_chars, total or 1),
           'zakkuri_share_pct': pct(sum(len(norm(x)) for x in zak), total or 1), 'sentences_over_50pct': high, 'cross_overlap': cross,
           'warn': []}
    if res['restatement_share_pct'] > 4:
        res['warn'].append(f"言い直しの層が {res['restatement_share_pct']}%（目標 4%以下）")
    if len([s for s in summ if '全体像' not in s['title']]) > 1:
        res['warn'].append(f"まとめが {len(summ)} か所（全体のまとめ1か所にし、章末のまとめは論点カードに置き換える）")
    if high:
        res['warn'].append(f'本文の言い直しになっているまとめの文 {len(high)}')
    if any(c['overlap_pct'] > 20 for c in cross):
        res['warn'].append('まとめどうしで同じ内容を繰り返している')
    if arg('--out'):
        dump(res, arg('--out'))
    print(f"まとめ {len(summ)} か所／言い直しの層 {res['restatement_share_pct']}%／ざっくり理解 {res['zakkuri_share_pct']}%／本文と重なる文 {len(high)}／WARN {len(res['warn'])}")
    for w in res['warn']:
        print('  WARN:', w)

if __name__ == '__main__':
    main()
