#!/usr/bin/env python3
"""確度の語（余地がある・解される・有力・不明確・要請されよう 等）が、資料からノートへ同じ強さで保たれているかを並べる（指標④）。
usage: certainty_check.py SOURCE.txt NOTE(.txt|.json|.py) [--out certainty.json] [-v] [--global] [--ignore ignore.json]
対応づけ（2段階）：
  1. 節で絞る：資料の文が属する節（上位3段。12-3-4 など）と同じ節番号を持つノートの文を候補にする。
     節番号の無い資料、節が対応しない文は、全体から探す（--global を付けると常に全体から探す。旧来の挙動）。
  2. 候補の中で、漢字2字の並び（術語）の重なりが最も大きい文を対応文とする。前後1文も合わせて見る。
判定：資料の文の留保の強さ（1＝留保が強い：不明確・議論がある／2＝留保：余地がある・であろう・有力）と、
      ノートの対応箇所の留保の強さを比べ、保たれた／弱まった（留保が消えた・言い切りになった）／強まった（留保が増えた）を出す。
      ノートの対応箇所が「（教科書の見解）」「とされる」等で出所を示している場合は、保たれたものとして扱う。
層：ノートが blocks（.json／.py）のときは、本文のほかに、図題・ざっくり理解・表・論点カードの文も別に調べる。
    足した層は、本文の留保を落としやすい（「〜はない」「〜だけ」と言い切る）。本文に留保のある術語を含むのに、留保の語がない文を列挙する。
    判決文で確かめた判示を記す欄（列名「判決が挙げる理由」、札［判示］）は対象にしない。
    候補を読み、留保と別の点を述べた文だと確かめたら、--ignore ignore.json（[{"sentence": "文の一部", "reason": "理由"}]）で除く。
    理由の無い項目は除かれない。除いた文と理由は、出力の layer_ignored に残る。
対応づけは近似なので、結果は点検者の補助として使う。「見当たらない」は一件ずつ読む。"""
import sys, collections
from laba_common import *
from laba_blocks import load_units, source_sections, top

LEVELS = [  # (強さ, 語)  強さ：1=留保が強い … 4=確定
    (1, ['不明確', '明らかではない', '明らかでない', '明確にされていない', '明確でない', '議論がある', '検討の余地', '検討を要する', '疑問である', '問題となり得る', '争いがある', '両立し難い']),
    (2, ['余地がある', 'と考える余地', '可能性がある', 'あり得る', 'ことがある', '要請されよう', 'であろう', 'なろう', 'と考えられる', 'と思われる', 'ようにみえる',
         'とみることもできる', '理解も有力', '有力である', '有力説', '傾向にある', '一般的には', '必ずしも', 'おそれがある', 'なり得る', 'れ得る', '少なくとも']),
    (3, ['と解される', 'と解する', 'と考えられている', '多数説', '通説', 'とされる', 'とされている', '相当である', '広く受け入れられている']),
    (4, ['判例である', '判例は', 'とするのが判例', '定める', '規定する', 'できない', '許されない', '禁じられる', 'ならない']),
]
HEDGE = {w: lv for lv, ws in LEVELS if lv <= 2 for w in ws}
ATTRIB = ['教科書の見解', '資料の見解', '教科書は', '資料は', 'とされる', 'という', 'とする見解', '補足']

def hedges(s):
    return [(lv, w) for w, lv in HEDGE.items() if w in s]

def strength(s):
    h = hedges(s)
    return min(lv for lv, w in h) if h else 0

def bigrams(s):
    out = set()
    for w in re.findall(r'[一-鿿々]{2,}', s):
        for i in range(len(w) - 1):
            out.add(w[i:i + 2])
    return out

def best(sb, cands):
    b, bi = 0, -1
    for i, (s, g) in enumerate(cands):
        if not g:
            continue
        sc = len(sb & g) / (len(sb) ** 0.5 * len(g) ** 0.5)
        if sc > b:
            b, bi = sc, i
    return b, bi

def main():
    pos = positional()
    if len(pos) < 2:
        print(__doc__); sys.exit(1)
    src = read(pos[0])
    units = load_units(pos[1])
    blocks_mode = pos[1].endswith(('.json', '.py'))
    # ノートの文（層と節つき）
    N = []
    for u in units:
        if u['layer'] == 'head':
            continue
        # 表・カードのセルは、欄の札（［問題］［規範］［理由］［当てはめ］［短答］［書き出し］［判示］［資料］）で切ってから文に分ける。
        # 1つのセルに複数の欄を並べた論点カードで、別の欄の語がつながって1文に見えるのを防ぐ
        parts = re.split(r'(?=［[^［］]{1,8}］)', u['text']) if u['layer'] in ('table', 'card') else [u['text']]
        for part in parts:
            for s in (sentences(part, keep_heads=True) or ([part] if part.strip() else [])):
                N.append({'s': s, 'layer': u['layer'], 'sec': top(u['secno'], 3), 'section': u['section'], 'head': u.get('head', '')})
    body = [x for x in N if x['layer'] == 'body'] if blocks_mode else N
    for x in N:
        x['g'] = bigrams(x['s'])
    by_sec = collections.defaultdict(list)
    for i, x in enumerate(body):
        by_sec[x['sec']].append(i)
    secs = source_sections(src)
    use_sec = (not '--global' in sys.argv) and sum(1 for c in secs if c['secno']) >= 3
    rows, kept, weak, unmatched = [], 0, 0, 0
    for c in (secs if use_sec else [{'secno': '', 'text': src}]):
        sk = top(c['secno'], 3)
        idx = by_sec.get(sk, []) if use_sec else list(range(len(body)))
        # 下位の節（12-3-4-1 など）は上位3段に丸めてあるので、同じ節の全文が候補になる
        for s in sentences(c['text']):
            hs = hedges(s)
            if not hs:
                continue
            sb = bigrams(s)
            if len(sb) < 4:
                continue
            cands = [(body[i]['s'], body[i]['g']) for i in idx]
            sc, bi = best(sb, cands) if cands else (0, -1)
            scope = 'section'
            if sc < 0.3:
                allc = [(x['s'], x['g']) for x in body]; sc2, bi2 = best(sb, allc)
                if sc2 >= 0.3:
                    sc, bi, scope = sc2, bi2, 'global'; gi = bi2
                else:
                    unmatched += 1; rows.append({'status': '対応文なし', 'source_hedge': [w for lv, w in hs], 'source_head': s[:40], 'score': round(max(sc, sc2), 2)}); continue
            else:
                gi = idx[bi]
            win = ' '.join(x['s'] for x in body[max(0, gi - 1):gi + 2])
            nh = hedges(win); ss, ns = min(lv for lv, w in hs), (min(lv for lv, w in nh) if nh else 0)
            attributed = any(a in win for a in ATTRIB) and not nh
            if nh and ns <= ss + 1:
                st = '保たれている'; kept += 1
            elif nh:
                st = '保たれている（語は違う）'; kept += 1
            elif attributed:
                st = '出所を示している（留保の語はない）'; kept += 1
            else:
                st = '確度の語が見当たらない'; weak += 1
            rows.append({'status': st, 'scope': scope, 'section': c['secno'], 'source_hedge': [w for lv, w in hs], 'note_hedge': [w for lv, w in nh],
                         'source_head': s[:40], 'note_sentence_head': body[gi]['s'][:40], 'score': round(sc, 2)})
    tot = kept + weak
    res = {'source_hedged_sentences': tot + unmatched, 'matched': tot, 'kept': kept, 'lost': weak, 'unmatched': unmatched,
           'preservation_pct': pct(kept, tot), 'section_matching': use_sec, 'rows': rows}
    # 足した層：本文で留保のある術語を含むのに、留保がない文
    layer_rows = []; layer_ignored = []
    ign = json.load(open(arg('--ignore'), encoding='utf-8')) if arg('--ignore') else []
    ign = [(norm(e.get('sentence', '')), e['reason'].strip()) for e in ign if (e.get('reason') or '').strip() and e.get('sentence')]
    if blocks_mode:
        hedged_body = [x for x in body if hedges(x['s'])]
        for x in N:
            if x['layer'] not in ('fig', 'zak', 'summary', 'table', 'card') or len(x['g']) < 6:
                continue
            # 判決文で確かめた判示を記す欄（「判決が挙げる理由」の列、［判示］の札）は、資料の留保の対象ではない
            if '判決が挙げる理由' in x.get('head', '') or x['s'].startswith(('［判示］', '[判示]')):
                continue
            if hedges(x['s']) or any(a in x['s'] for a in ('補足', '不明', '余地', '検討')):
                continue
            sc, bi = best(x['g'], [(h['s'], h['g']) for h in hedged_body])
            if sc >= 0.55:
                # 言い切りの語があるか
                if re.search(r'(はない|しない|できない|だけ|のみ|必ず|すべて|常に|当然)', x['s']):
                    hit = next((r for k, r in ign if k and k in norm(x['s'])), None)
                    if hit:   # 人が読み、留保と別の点だと確かめた文（理由つき。--ignore）
                        layer_ignored.append({'layer': x['layer'], 'sentence': x['s'][:60], 'reason': hit}); continue
                    layer_rows.append({'layer': x['layer'], 'section': x['section'][:20], 'sentence': x['s'][:60], 'body_hedge': [w for lv, w in hedges(hedged_body[bi]['s'])],
                                       'body_sentence_head': hedged_body[bi]['s'][:40], 'score': round(sc, 2)})
        res['layer_candidates'] = layer_rows; res['layer_ignored'] = layer_ignored
    if arg('--out'):
        dump(res, arg('--out'))
    print(f"資料の留保つきの文 {tot + unmatched}／対応づけ {tot}／確度が保たれた {kept}／見当たらない {weak}／対応文なし {unmatched}／保存率 {res['preservation_pct']}%"
          + ('（節で絞って対応づけ）' if use_sec else '（全体から対応づけ）') + (f'／足した層の候補 {len(layer_rows)}' if blocks_mode else '') + (f'（理由つきで除いた文 {len(layer_ignored)}）' if layer_ignored else ''))
    if '-v' in sys.argv:
        for r in rows:
            if not r['status'].startswith('保たれ') and not r['status'].startswith('出所'):
                print('  ', r['status'], r['source_hedge'], '｜資料:', r.get('source_head', ''), '｜ノート:', r.get('note_sentence_head', ''))
        for r in layer_rows:
            print(f"   足した層（{r['layer']}）｜{r['sentence']}…｜本文の留保 {r['body_hedge']}")

if __name__ == '__main__':
    main()
