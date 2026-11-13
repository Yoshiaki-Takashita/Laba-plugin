#!/usr/bin/env python3
"""定義文を資料とノートから拾い、術語ごとに並べる（指標⑤ 定義の精度）。
usage: definition_check.py SOURCE.txt NOTE(.json|.py|.txt) [--out definition.json] [--md definition.md] [-v]
       definition_check.py --note-only NOTE [--out definition.json]      資料が無いとき（ノートの中の食い違いだけを見る）
拾う形：「Aとは，…をいう。」「Aとは，…を指す。」「Aとは，…のことである。」「…をAという。」「…をAと呼ぶ。」
見ること：
  1. 資料の定義の術語が、ノートに定義の形で出ているか（出ていなければ「定義なし」。本文で使っているだけなら「使用のみ」）。
  2. 資料の定義にある語（漢字2字以上・カタカナ3字以上）のうち、ノートの定義に無いもの（落ちた語の候補）。
     「全員について」「同一の」のような限定の語も、資料の定義にあってノートに無ければ出す。
  3. ノートの中で、同じ術語の定義が2つ以上あり、文言が違う組（本文・表・カードの食い違い）。
出力は「並べて読む表」である。語が落ちていても、言い換えで意味が保たれていることがある。
定義の中身が正しいかは、点検者が見る（references/metrics/05-definition.md）。"""
import sys, collections
from laba_common import *
from laba_blocks import load_units

DEF1 = re.compile(r'(?:^|[，、。「（(\s])([^，、。「」（）()\s]{2,24}?)」?とは[，、]?(.{6,220}?)(をいう|を指す|のことである|のことをいう|を意味する|をさす)[。）]')
DEF2 = re.compile(r'(.{8,200}?)を[，、]?「?([^，、。「」（）()\sをはがにでもへ]{2,16}?)」?(?:という|と呼ぶ|とよぶ|と称する)[。（]')
LIMIT = ['全員', '全部', '一部', '各自', '同一', '同種', '共通', '限り', 'のみ', 'だけ', '常に', '必ず', '少なくとも', 'すべて', '全て', 'いずれか', '双方', '一方', '他方',
         '法律上', '事実上', '直接', '間接', '当然に', '原則として', '場合に限', 'でなければ', 'なければならない', 'ことができる', 'ことができない']
LEAD = re.compile(r'^(ここでいう|ここにいう|また|そして|なお|もっとも|ここで|この|その|こうした|まず|次に|さらに|したがって|すなわち|他方|これに対して|一般に|ここにいう|いわゆる)[，、]?')

def clean_term(t):
    t = LEAD.sub('', t.strip('「」『』 　'))
    return re.sub(r'^(?:の|は|が|を|に|で|と)', '', t)

def words(s):
    return set(re.findall(r'[一-鿿々]{2,}|[ァ-ヺー]{3,}', s))

def find_defs(sents):
    out = []
    for sec, layer, s in sents:
        for m in DEF1.finditer(s):
            t = clean_term(m.group(1))
            if 2 <= len(t) <= 24 and KANJI.search(t) and not re.search(r'[をがはにで]', t):
                out.append({'term': t, 'body': m.group(2), 'text': s, 'section': sec, 'layer': layer})
        for m in DEF2.finditer(s):
            t = clean_term(m.group(2))
            if 2 <= len(t) <= 24 and KANJI.search(t) and not re.search(r'(こと|もの|場合|とき)$', t):
                out.append({'term': t, 'body': m.group(1), 'text': s, 'section': sec, 'layer': layer})
    return out

def sents_of_text(t):
    return [('', 'body', s) for s in sentences(t)]

def sents_of_note(path):
    if path.endswith(('.json', '.py')):
        return [(u.get('section', ''), u['layer'], s) for u in load_units(path) if u['layer'] != 'head' for s in sentences(u['text'])]
    return sents_of_text(read(path))

def same_term(a, b):
    return a == b or (len(a) >= 4 and a in b) or (len(b) >= 4 and b in a)

def main():
    pos = positional()
    if not pos and '--note-only' not in sys.argv:
        print(__doc__); sys.exit(1)
    note_only = '--note-only' in sys.argv
    note_path = arg('--note-only') if note_only else (pos[1] if len(pos) > 1 else None)
    if not note_path:
        print(__doc__); sys.exit(1)
    nsents = sents_of_note(note_path)
    ndefs = find_defs(nsents)
    ntext = '\n'.join(s for _, _, s in nsents)
    rows, missing, used_only, lost_rows = [], [], [], []
    sdefs = []
    if not note_only:
        sdefs = find_defs(sents_of_text(read(pos[0])))
        seen = set()
        for d in sdefs:
            if d['term'] in seen:
                continue
            seen.add(d['term'])
            cand = [n for n in ndefs if same_term(d['term'], n['term'])]
            if not cand:
                (used_only if d['term'] in ntext else missing).append(d['term'])
                rows.append({'term': d['term'], 'source': d['text'], 'note': None, 'status': '使用のみ' if d['term'] in ntext else '定義なし', 'lost_words': [], 'lost_limits': []})
                continue
            sw = words(d['body']); best = max(cand, key=lambda n: len(sw & words(n['text'])))
            allw = set().union(*[words(n['text']) for n in cand])
            loose = [re.sub(r'[のとを，、]', '', n['text']) for n in cand]   # 「共同訴訟人間」と「共同訴訟人の間」を同じに扱う
            lost = sorted(w for w in sw if w not in allw and not any(w in n['text'] for n in cand) and not any(w in x for x in loose))
            lim = [w for w in LIMIT if w in d['body'] and not any(w in n['text'] for n in cand)]
            r = {'term': d['term'], 'source': d['text'], 'note': best['text'], 'note_section': best['section'], 'note_layer': best['layer'],
                 'status': '語が落ちた候補' if (lost or lim) else '一致', 'lost_words': lost, 'lost_limits': lim}
            rows.append(r)
            if lost or lim:
                lost_rows.append(r)
    # ノートの中の食い違い：同じ術語の定義が複数あり、定義の語の重なりが7割未満
    by = collections.defaultdict(list)
    for n in ndefs:
        by[n['term']].append(n)
    conflicts = []
    for t, ds in by.items():
        for i in range(len(ds)):
            for j in range(i + 1, len(ds)):
                a, b = words(ds[i]['body']), words(ds[j]['body'])
                if a and b and len(a & b) / max(1, min(len(a), len(b))) < 0.7:
                    conflicts.append({'term': t, 'a': ds[i]['text'], 'a_layer': ds[i]['layer'], 'b': ds[j]['text'], 'b_layer': ds[j]['layer']})
    n_src = len(rows)
    res = {'n_source_defs': n_src, 'n_note_defs': len(ndefs), 'matched': sum(1 for r in rows if r['note']), 'exact': sum(1 for r in rows if r['status'] == '一致'),
           'missing_terms': missing, 'used_only_terms': used_only, 'lost': lost_rows, 'conflicts': conflicts, 'rows': rows,
           'note_defs': [{'term': n['term'], 'section': n['section'], 'layer': n['layer'], 'text': n['text']} for n in ndefs],
           'issue_count': len(missing) + len(lost_rows) + len(conflicts)}
    if arg('--out'):
        dump(res, arg('--out'))
    if arg('--md'):
        md = ['# 定義の照合表', '', '資料の定義とノートの定義を術語ごとに並べたもの。「落ちた語」は候補であり、言い換えで意味が保たれていれば問題ない。1行ずつ読んで「判定」の欄を埋める。', '',
              '| 術語 | 資料の定義 | ノートの定義 | 落ちた語（候補） | 判定 |', '|---|---|---|---|---|']
        for r in rows:
            md.append(f"| {r['term']} | {r['source']} | {r['note'] or '（' + r['status'] + '）'} | {'・'.join(r['lost_limits'] + r['lost_words'])} |  |")
        if conflicts:
            md += ['', '## ノートの中で文言が違う定義', '']
            md += [f"- {c['term']}：［{c['a_layer']}］{c['a']} ／ ［{c['b_layer']}］{c['b']}" for c in conflicts]
        open(arg('--md'), 'w', encoding='utf-8').write('\n'.join(md) + '\n')
    if '-v' in sys.argv:
        for r in rows:
            print(f"[{r['status']}] {r['term']}：{'・'.join(r['lost_limits'] + r['lost_words'])}")
    for c in conflicts:
        print(f"所見: 「{c['term']}」の定義が、{c['a_layer']} と {c['b_layer']} で違う")
    if note_only:
        print(f"ノートの定義 {len(ndefs)}／ノートの中の食い違い {len(conflicts)}")
    else:
        print(f"資料の定義 {n_src}／ノートに定義あり {res['matched']}（語がそろう {res['exact']}・語が落ちた候補 {len(lost_rows)}）／使用のみ {len(used_only)}／定義なし {len(missing)}／ノートの定義 {len(ndefs)}・ノートの中の食い違い {len(conflicts)}")

if __name__ == '__main__':
    main()
