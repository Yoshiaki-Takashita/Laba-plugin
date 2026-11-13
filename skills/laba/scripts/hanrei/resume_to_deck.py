#!/usr/bin/env python3
"""判例研究レジュメの構成（resume_build.py の入力 JSON）から、発表スライドの構成（build_deck.js の入力）の下書きを作る。
usage: resume_to_deck.py RESUME.json OUT_SPEC.json [--theme teal|mono]
レジュメとスライドは、見出しの番号を1対1に揃える（references/slides/06-speech-sync.md）。この道具は、レジュメの章・節の番号を
そのままスライドの見出しに写し、節ごとに型を当てはめる。文は1文目だけを拾うので、長い。_todo を片づけてから build_deck.js に掛ける。
対応
  表紙の判決情報 case      → cover、toc（章と節）
  前提知識 premise.items   → points（条文を引く節には「statute に直す」の _todo）
  事実の概要 facts.parties → sokan（相関図の雛形。当事者・時系列の前に置く）＋ parties
             facts.timeline → timeline（段ごと。関係は雛形）＋ timeline_table
             facts.issue_table → issues（条文の箱を並べて争点を1つに絞る）　／　表がなく facts.issue だけなら points（強調の枠）
  各審級 instances         → instance（見出しに【結論】。主張・判断・解説の1文目）
  三審の比較 compare       → compare_table（表をそのまま）
  意義 significance        → significance（「第一に」「第二に」で分ける）
  調査官解説 commentary    → commentary（要点2つで1枚）
  学説 doctrine            → 表があれば compare_table、なければ points（「doctrine_lr に直す」の _todo）
  反対する立場・考察 evaluation → opposition、考察は1項目1枚の points（「reasoning_chain に直す」の _todo）
  参考判例・文献 references → references
本文の台帳 ID（〔R01〕）は外す。出来た下書きは sync_check.py でレジュメと照らす。
下書きのままでは build_deck.js は止まる（_todo と仮の文字があるため）。見るだけなら build_deck.js … --draft。"""
import sys, os, json, re

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
KANSUJI = '１２３４５６７８９'
CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫'
LIMIT = 68


def clean(t):
    return re.sub(r'〔R\d+〕', '', re.sub(r'\*\*', '', str(t))).strip()


def first(t):
    t = clean(t); m = re.match(r'(.+?[。．])', t)
    return (m.group(1) if m else t).rstrip('。．')


def paras_of(blocks):
    return [clean(b[1]) for b in (blocks or []) if b and b[0] in ('P', 'P2', 'B', 'N', 'K') and len(b) > 1]


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if len(args) < 2:
        print(__doc__); sys.exit(2)
    theme = sys.argv[sys.argv.index('--theme') + 1] if '--theme' in sys.argv else 'teal'
    spec = json.load(open(args[0], encoding='utf-8'))
    c = spec.get('case', {}); slides = []; toc = []; sec = 0; num = 0

    def H(title):
        nonlocal sec; sec += 1; name = f'{KANSUJI[sec - 1]}．{title}'
        slides.append({'type': 'section', 'name': name}); toc.append({'title': name, 'sub': []})

    def S(title):
        nonlocal num; num += 1
        if toc: toc[-1]['sub'].append(f'{num}　{re.sub("【.*?】", "", title)}')
        return f'{num}. {title}'

    def add(sl, todo=None):
        long = []
        def walk(o):
            if isinstance(o, str):
                if len(o) > LIMIT: long.append(o)
            elif isinstance(o, list): [walk(x) for x in o]
            elif isinstance(o, dict): [walk(v) for k, v in o.items() if k not in ('heading', 'notes', '_todo', 'rows')]
        walk(sl)
        todos = ([todo] if todo else []) + ([f'文が長い（{len(long)}件）。1行は全角34字、1項目2行までに削る'] if long else [])
        if todos: sl['_todo'] = '／'.join(todos)
        slides.append(sl)

    info = ['　'.join(x for x in [c.get('court'), c.get('date'), c.get('bench')] if x), '　'.join(x for x in [c.get('name')] if x)]
    slides.append({'type': 'cover', 'kind': '判例研究', 'theme': f"〜{c.get('theme', '')}〜", 'info': [x for x in info if x]})
    slides.append({'type': 'toc', 'items': toc})

    pr = spec.get('premise')
    if pr:
        H('前提知識')
        for it in pr.get('items', []):
            ps = paras_of(it.get('blocks'))
            has_statute = any(re.search(r'\d+条', p) for p in ps)
            add({'type': 'points', 'heading': S(it['title']), 'points': [first(p) for p in ps[:4]]},
                '条文を引く節は statute（条文の枠＋要点＋「本件では」）に直す。条文は e-Gov で確かめた文言を写す' if has_statute else '「本件では」の1〜2行（accent）を足す')
    f = spec.get('facts')
    if f or spec.get('instances'): H('事案と各審級の判断')
    if f:
        h = S('事実の概要')
        if f.get('parties'):
            n = len(f['parties']); per = 2 if n <= 4 else 3
            add({'type': 'sokan', 'heading': f'{h}　当事者の相関図', 'groups': [{'title': '（左の関係の名）', 'cols': per}, {'title': '（右の関係の名）', 'cols': per}],
                 'diagram': {'cols': per * 2, 'actors': [{'id': p[0], 'symbol': p[0], 'sub': [clean(p[2]) if len(p) > 2 else clean(p[1])], 'col': (i % (per * 2)) * 1.0, 'row': i // (per * 2)} for i, p in enumerate(f['parties'])],
                             'relations': [{'from': f['parties'][0][0], 'to': f['parties'][1][0], 'label': '（関係）', 'arrow': False}] if n > 1 else []},
                 'caption': ['（争いの中心を1行で）']},
                '相関図を図形で描く。左右の関係の名（親族関係／取引関係など）、当事者の位置（col・row）、線（relations。結びつきは arrow:false、世話などは dash:true、争いの中心だけ emphasis:true）を書く（references/slides/03-diagram-on-slide.md）')
            add({'type': 'parties', 'heading': f'{h}　(1) 当事者', 'parties': [{'kind': 'person', 'symbol': p[0], 'role': clean(p[1]) if len(p) > 1 else '', 'lines': [clean(x) for x in p[2:] if x]} for p in f['parties']]},
                'ピクトの絵柄（kind）を当事者に合わせる（person／woman／child／suit／company／bank／landmark／court。物は land／landpin／house）。争いの中心の当事者に accent:true')
        if f.get('timeline'):
            syms = [p[0] for p in f.get('parties', [])]
            actors = [{'id': s, 'kind': 'person', 'symbol': s, 'role': clean(p[1]) if len(p) > 1 else '', 'col': i % 3, 'row': i // 3, 'step': 1} for i, (s, p) in enumerate(zip(syms, f.get('parties', [])))]
            steps = [{'label': re.sub(r'^[①-⑳]\s*', '', clean(st['label'])), 'items': [first(p) for p in st.get('paras', [])[:3]]} for st in f['timeline']]
            add({'type': 'timeline', 'heading': f'{h}　(2) 時系列', 'actors': actors, 'relations': [], 'steps': steps},
                '関係（relations：from・to・label・step）を、段ごとに1〜2本ずつ書く。当事者の位置（col・row）と、出てくる段（step）を直す（references/slides/04-step-reveal.md）')
            add({'type': 'timeline_table', 'heading': f'{h}　(2) 時系列　まとめ', 'head': ['段階', '出来事'], 'colW': [1.2, 8],
                 'rows': [[CIRCLED[i] if i < len(CIRCLED) else str(i + 1), first(st.get('paras', [''])[0]) if st.get('paras') else clean(st['label'])] for i, st in enumerate(f['timeline'])]})
        if f.get('issue_table'):
            rows = f['issue_table']['rows'][1:]
            add({'type': 'issues', 'heading': f'{h}　(3) 本件の争点', 'items': [{'head': clean(r[0]), 'lines': [clean(r[1])], 'answer': [clean(r[2])] if len(r) > 2 else [], **({'accent': True} if i == len(rows) - 1 else {})} for i, r in enumerate(rows[:4])],
                 'conclusion': [first(p) for p in (f.get('issue') or [])[-1:]]}, '箱の中の文を2行以内に削る。最後に残る争点の箱だけ accent にする')
        elif f.get('issue'):
            add({'type': 'points', 'heading': f'{h}　(3) 本件の争点', 'accent': [first(p) for p in f['issue'][:2]]})
    for ins in spec.get('instances', []):
        sl = {'type': 'instance', 'heading': S(ins['title'])}
        if ins.get('court'): sl['court'] = clean(ins['court'])
        if ins.get('claim'): sl['claim'] = {'title': '当事者の主張', 'lines': [first(p) for p in ins['claim'][:3]]}
        if ins.get('judgment'): sl['judgment'] = {'title': '判断', 'lines': [first(p) for p in ins['judgment'][:4]]}
        if ins.get('comment'): sl['key'] = [first(ins['comment'][0])]
        add(sl, None if '【' in ins['title'] else '見出しに結論を入れる（「上告審【破棄差戻し】」）')
    if spec.get('compare'):
        cp = spec['compare']
        sl = {'type': 'compare_table', 'heading': S('三審の比較'), 'rows': [[clean(x) for x in r] for r in cp['rows']]}
        if cp.get('after'): sl['key'] = [first(cp['after'][0])]
        add(sl, '審級が一直線に進むだけなら instance_flow（横に並ぶ箱）のほうが伝わる')
    if spec.get('significance') or spec.get('commentary'): H('本判決の意義と調査官解説')
    if spec.get('significance'):
        text = ' '.join(paras_of(spec['significance'].get('blocks')))
        parts = [p.strip('、。 ') for p in re.split(r'第[一二三四五1-5１-５]に[、，]', text)[1:]]
        pts = [{'lines': [first(p)]} for p in parts[:3]] or [{'lines': [first(text)]}]
        add({'type': 'significance', 'heading': S('本判決の趣旨と意義'), 'points': pts}, '射程（どこまで及ぶか）を key に1行で足す')
    cm = spec.get('commentary')
    if cm:
        h = S('調査官解説'); pts = cm.get('points', [])
        for i in range(0, max(1, len(pts)), 2):
            chunk = pts[i:i + 2]
            sl = {'type': 'commentary', 'heading': h + (f'　({i + 1})' + (f'({i + 2})' if len(chunk) > 1 else '') if pts else ''),
                  'items': [{'title': clean(p['title']), 'lines': [first(x) for x in p.get('paras', [])[:3]]} for p in chunk]}
            if cm.get('source'): sl['source'] = clean(cm['source'])
            add(sl)
    if spec.get('doctrine'):
        H('学説')
        for d in spec['doctrine']:
            h = S(d['title'])
            if d.get('table'): add({'type': 'compare_table', 'heading': h, 'rows': [[clean(x) for x in r] for r in d['table']['rows']]}, '2説の対比なら doctrine_lr（左右の枠）に直し、本判決の側を強調の枠にする')
            else: add({'type': 'points', 'heading': h, 'points': [first(p) for p in d.get('paras', [])[:4]]}, '2説の対比なら doctrine_lr（左右の枠）に直し、違いがどこに現れるかを key に書く')
    ev = spec.get('evaluation')
    if ev:
        H('評価と考察')
        if ev.get('opposition'):
            add({'type': 'opposition', 'heading': S('本判決に反対する立場'), 'position': {'title': '反対する立場', 'lines': [first(p) for p in ev['opposition'][:3]]}, 'evaluation': {'title': '評価', 'lines': ['（この立場をどう評価するかを1〜2行で）']}}, '評価（evaluation）を書く')
        if ev.get('considerations'):
            h = S('考察')
            for i, cs in enumerate(ev['considerations'], 1):
                concl = '結論' in cs['title']
                if concl: add({'type': 'conclusion', 'heading': f'{h}　({i}) {clean(cs["title"])}', 'lines': [first(p) for p in cs.get('paras', [])[:2]]}, '言い切りの結論を1〜2行に。理由（reasons）を2つ足す')
                else: add({'type': 'points', 'heading': f'{h}　({i}) {clean(cs["title"])}', 'points': [first(p) for p in cs.get('paras', [])[:4]]}, '事実→読み取れること→評価→疑問 の筋なら reasoning_chain に直す')
    if spec.get('references'):
        add({'type': 'references', 'heading': '参考判例・文献', 'items': [({'group': r.get('group', ''), 'items': [clean(x) for x in r.get('items', [])]} if isinstance(r, dict) else clean(r)) for r in spec['references']]})
    out = {'meta': {'title': f"判例研究 {c.get('theme', '')}".strip(), 'theme': theme, '_comment': 'resume_to_deck.py が作った下書き。_todo を片づけ、sync_check.py でレジュメと照らしてから build_deck.js に掛ける。'}, 'slides': slides}
    json.dump(out, open(args[1], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    real = [s for s in slides if s['type'] != 'section']
    n = sum(len(s.get('steps', [1])) if s['type'] == 'timeline' else 1 for s in real)
    print(f"下書き：{args[1]}（スライド {n} 枚、直す所 _todo {sum(1 for s in real if '_todo' in s)} 件）")
    for i, s in enumerate(real, 1):
        if '_todo' in s: print(f"  {s.get('heading', s['type'])}：{s['_todo']}")


if __name__ == '__main__':
    main()
