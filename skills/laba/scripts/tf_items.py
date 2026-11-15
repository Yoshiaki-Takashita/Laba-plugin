#!/usr/bin/env python3
"""短答式（正誤）で問われる命題の一覧を、本文から起こし、検査する（指標⑫ 答案転用性）。
usage:
  tf_items.py candidates NOTE(.json|.py|.txt) [--out tf_candidates.json] [--max 60]
      本文から「正誤で問える命題」の候補を拾う。各候補に、根拠の箇所（節）と、誤りの肢を作るときに入れ替える語（軸）を付ける。
  tf_items.py check items.json [--note NOTE] [--out tf.json]
      人が仕上げた一覧を検査する。
  tf_items.py block items.json [--out tf_blocks.json]
      巻末に載せる表のブロック（T）にする。

候補の拾い方：規律を言い切る文（〜しなければならない／できる／できない／効力を生じない／及ばない／に限られる／とするのが判例である、
  条文・判例の括弧つきの文）を拾い、入れ替えの軸になる語の組（できる↔できない、全員↔各自、職権調査事項↔異議があるときに限り審査、
  固有必要的↔通常、中断する↔中断しない、上訴人となる↔ならない、認容判決↔棄却判決 など）を含むものを優先する。

items.json の形（人が書く）：
  {"items": [{"q": "命題（1文。60〜110字）", "a": "○" | "×", "basis": "根拠（条文・判例・節）", "why": "×のときは、どこが誤りか／○のときは決め手",
              "section": "12-3-3-1", "axis": "入れ替えた語（×のとき）"}, …]}
check が見ること：
  1. 数が20〜30（資料20頁程度の場合。--min/--max で変えられる）
  2. ○と×の割合：×が30〜60%
  3. 各問に basis があり、条文番号か判例か節番号を含む。×の問には why がある
  4. 命題が1文で、60〜110字の範囲（長すぎる肢は論点が二つ入っている）
  5. 問どうしの重複（12字一致が50%超）がない。同じ節に4問を超えて集中していない
  6. --note があれば：basis の条文・判例がノートにある／○の命題の主な語がノートの本文にある（本文にない知識を問うていない）
     ×の命題は、ノートの本文と12字一致が高すぎない（80%超は、本文の正しい文をそのまま×にしている疑い）
  7. 各問に section（根拠にした本文の節番号）がある。
     確度（本文が「余地がある」「不明確」とする点を言い切っていないか）と、根拠の条文が本文の該当箇所と合うかは、
     derived_check.py --tf が、命題に最も近い本文の文と照らして見る。作成者が理由を書いて注意を除く仕組み（certainty_note）はやめた。"""
import sys, json, collections
from laba_common import *
from laba_blocks import load_units

NORM_END = re.compile(r'(なければならない|ことを要する|を要する|ことができる|ことができない|できない|許されない|効力を生じない|効力を生じる|及ばない|及ぶ|に限られる|とはならない|となる|禁じられる|中断しない|中断する|不適法と(?:なる|される|している)|適法と(?:なる|される)|とするのが判例である|ではない|である)[。）]')
AXES = [('できる', 'できない'), ('全員', '各自'), ('全員', '1人'), ('職権調査事項', '異議'), ('固有必要的共同訴訟', '通常共同訴訟'), ('固有必要的共同訴訟', '類似必要的共同訴訟'),
        ('中断する', '中断しない'), ('上訴人となる', '上訴人とならない'), ('認容判決', '棄却判決'), ('請求原因', '抗弁'), ('有利', '不利'), ('法律上', '事実上'),
        ('適法', '不適法'), ('及ぶ', '及ばない'), ('原告', '被告'), ('前段', '後段'), ('必要', '不要'), ('単独', '共同'), ('効力を生じる', '効力を生じない'),
        ('第1審', '控訴審'), ('弁論の分離', '弁論の併合'), ('持分権', '所有権'), ('確認', '給付')]
HEDGE = ['余地がある', '不明確', '検討の余地', '議論がある', '有力', '必ずしも', 'であろう', '要請されよう', '可能性がある', 'と考えられ']

def candidates(note, out, mx):
    units = load_units(note); cands = []
    for u in units:
        if u['layer'] != 'body' or '（補足）' in u['text'][:6]:
            continue
        for s in sentences(u['text'], keep_heads=True) or []:
            n = len(norm(s))
            if not (35 <= n <= 170) or not NORM_END.search(s):
                continue
            if s.startswith(('たとえば', 'なお，前掲', '以下')):
                continue
            ax = [a for a in AXES if a[0] in s or a[1] in s]
            auth = bool(find_statutes(s) or find_cases(s))
            hed = [h for h in HEDGE if h in s]
            score = 2 * len(ax[:3]) + 3 * auth - 2 * bool(hed) + (1 if 60 <= n <= 120 else 0)
            cands.append({'score': score, 'section': u['section'][:30], 'secno': u['secno'], 'sentence': s,
                          'axes': ['↔'.join(a) for a in ax[:4]], 'authority': auth, 'hedged': hed})
    cands.sort(key=lambda x: -x['score'])
    # 節ごとに偏らないよう、同じ節からは6つまで
    per, pick = collections.Counter(), []
    for c in cands:
        if per[c['section']] < 6:
            pick.append(c); per[c['section']] += 1
        if len(pick) >= mx:
            break
    dump({'n_all': len(cands), 'candidates': pick}, out)
    print(f'候補 {len(cands)} 文のうち {len(pick)} 文 -> {out}')
    for c in pick[:12]:
        print(f"  [{c['score']}] {c['section'][:16]}｜{c['sentence'][:56]}…｜軸 {'・'.join(c['axes'][:2]) or '—'}")
    print('次：候補をもとに items.json を書く。×の肢は、軸の語を1か所だけ入れ替えて作る（2か所以上変えない）。留保つきの文は肢にしないか、留保ごと問う。')

def g12(s):
    n = norm(s); return set(n[i:i + 12] for i in range(len(n) - 11))

def check(path):
    items = json.load(open(path, encoding='utf-8'))['items']
    mn, mx = int(arg('--min', '20')), int(arg('--max', '30'))
    issues = []
    n = len(items); nx = sum(1 for i in items if i.get('a') == '×')
    if not (mn <= n <= mx):
        issues.append(f'問の数が {n}（{mn}〜{mx} に）')
    if n and not (30 <= pct(nx, n) <= 60):
        issues.append(f'×の割合が {pct(nx, n)}%（30〜60% に。○ばかり・×ばかりにしない）')
    per = collections.Counter()
    for k, it in enumerate(items, 1):
        q, a = it.get('q', ''), it.get('a', '')
        if a not in ('○', '×'):
            issues.append(f'{k}：a が ○／× でない')
        b = it.get('basis', '')
        if not b or not (find_statutes(b) or find_cases(b) or re.search(r'\d+(-\d+)+|本文|表\s*\d|図\s*\d', b)):
            issues.append(f'{k}：basis に条文・判例・節のどれもない')
        if a == '×' and not it.get('why'):
            issues.append(f'{k}：×なのに why（どこが誤りか）がない')
        L = len(norm(q))
        if not (45 <= L <= 120):
            issues.append(f'{k}：命題が {L} 字（45〜120字に。長い肢は論点が二つ入っていないか）')
        if len(sentences(q, keep_heads=True)) > 1:
            issues.append(f'{k}：命題が2文以上（1文に）')
        per[it.get('section', '')] += 1
    for s, c in per.items():
        if s and c > 4:
            issues.append(f'節 {s} に {c} 問（4問まで。範囲を広く取る）')
    gs = [g12(i.get('q', '')) for i in items]
    for i in range(n):
        for j in range(i + 1, n):
            if gs[i] and gs[j] and len(gs[i] & gs[j]) / min(len(gs[i]), len(gs[j])) > 0.5:
                issues.append(f'{i + 1} と {j + 1}：命題が重なっている（12字一致50%超）')
    note_iss = []; ack = []
    if arg('--note'):
        units = load_units(arg('--note')); body = '\n'.join(u['text'] for u in units if u['layer'] in ('body', 'table'))
        bg = g12(body); cases = set(c['key'] for c in find_cases(body)); stats = set(s['article'] for s in find_statutes(body))
        secs = collections.defaultdict(str)
        for u in units:
            secs[u['secno']] += u['text']
        for k, it in enumerate(items, 1):
            for c in find_cases(it.get('basis', '')):
                if c['key'] not in cases:
                    note_iss.append(f"{k}：basis の判例 {c['raw']} がノートの本文にない")
            for s in find_statutes(it.get('basis', '')):
                if s['article'] not in stats:
                    note_iss.append(f"{k}：basis の条文 {s['raw']} がノートの本文にない")
            ws = re.findall(r'[一-鿿々]{3,}', it.get('q', ''))
            miss = [w for w in ws if w not in body]
            if it.get('a') == '○' and len(miss) > max(1, len(ws) // 3):
                note_iss.append(f"{k}：○の命題の語のうち本文にないもの {miss[:4]}（本文にない知識を問うていないか）")
            g = g12(it.get('q', ''))
            if it.get('a') == '×' and g and len(g & bg) / len(g) > 0.8:
                note_iss.append(f'{k}：×の命題が本文と80%超一致（本文の正しい文を×にしていないか）')
            if not (it.get('section') or '').strip():
                note_iss.append(f'{k}：section（根拠にした本文の節番号）がない')
            # 確度（本文の留保を命題が言い切っていないか）と、根拠の条文が本文の該当箇所と合うかは、
            # derived_check.py が、命題に最も近い本文の文と照らして見る（除外の一覧は置かない。certainty_note は読まない）
    res = {'n_items': n, 'n_false': nx, 'false_pct': pct(nx, n), 'sections_covered': len([s for s in per if s]), 'issue_count': len(issues) + len(note_iss),
           'issues': issues, 'note_issues': note_iss, 'certainty_acknowledged': ack}
    if arg('--out'):
        dump(res, arg('--out'))
    for x in issues + note_iss:
        print('  所見:', x)
    print(f"問 {n}（○ {n - nx}・× {nx}，×の割合 {res['false_pct']}%）／節 {res['sections_covered']}／所見 {res['issue_count']}" + (f"／確度の注意を理由つきで除いた問 {len(ack)}" if ack else ''))
    return res

def block(path):
    d = json.load(open(path, encoding='utf-8')); items = d['items']
    rows = [['№', '命題', '正誤', '根拠・誤りの箇所']]
    for k, it in enumerate(items, 1):
        why = it.get('basis', '') + ('。' + it['why'] if it.get('why') else '')
        rows.append([str(k), it['q'], it['a'], why])
    out = arg('--out', 'tf_blocks.json')
    dump({'blocks': [['PB'], ['H', d.get('title', '短答式で問われる形（正誤）')], ['P', d.get('lead', '本文の規律を，正誤を問う1文の形にしたものである。×の肢は，本文の命題の語を1か所だけ入れ替えて作ってある。')],
                     ['T', rows, d.get('caption', '短答式の命題'), [9, 92, 11, 48]]]}, out)
    print('->', out)

def main():
    pos = positional()
    if len(pos) < 2:
        print(__doc__); sys.exit(1)
    if pos[0] == 'candidates':
        candidates(pos[1], arg('--out', 'tf_candidates.json'), int(arg('--max', '60')))
    elif pos[0] == 'check':
        r = check(pos[1]); sys.exit(1 if r['issue_count'] and '--strict' in sys.argv else 0)
    elif pos[0] == 'block':
        block(pos[1])
    else:
        print(__doc__); sys.exit(1)

if __name__ == '__main__':
    main()
