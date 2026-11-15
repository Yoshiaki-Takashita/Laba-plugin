#!/usr/bin/env python3
"""スライドの相関図（型 sokan）の構成から、レジュメに貼る図（PNG・SVG）を作る。figgen の当事者関係図（parties）で描く。
usage: sokan_png.py DECK_SPEC.json OUT.png [--slide N] [--width-mm 150] [--spec-out parties.json]
  DECK_SPEC.json は build_deck.js に渡す構成（slides の中の type:"sokan" を使う。複数あれば --slide で何番目かを選ぶ）か、
  sokan の1枚だけを書いた JSON。
  変換の決まり（references/hanrei/04-facts-timeline.md の相関図の決まりと同じ）
   - groups（「親族関係」「取引関係」など）は、左右の囲みにする。親族の関係と取引の関係を混ぜない
   - emphasis:true の関係（争点の権利関係）だけを強調色にする。ほかは黒
   - arrow:false は矢じりのない線（親子・所有・代表など、向きのない結びつき）、dash:true は点線
   - 列（col）は小数でもよい。図では近い整数の列にそろえる（同じ行で同じ列になったら、右へずらす）
  レジュメの構成には facts.figure = {"path": "OUT.png", "caption": "図　当事者の相関図"} と書く（resume_build.py）。
  PNG には figgen の依存（sharp）が要る。無ければ SVG だけを作り、そのことを出す。"""
import sys, os, json, subprocess, shutil, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
FIGGEN = os.path.join(HERE, '..', 'figgen', 'cli.js')


def pick(spec, n=None):
    if spec.get('type') == 'sokan': return spec
    ss = [s for s in spec.get('slides', []) if s.get('type') == 'sokan']
    if not ss: raise SystemExit('構成に type:"sokan" の枚がない')
    if n is None and len(ss) > 1: print(f'  相関図が {len(ss)} 枚ある。1枚目を使う（--slide で選ぶ）', file=sys.stderr)
    return ss[(n or 1) - 1]


def to_parties(sl):
    d = sl.get('diagram', sl)
    actors = d.get('actors', [])
    # 列を整数にそろえる。同じ行で同じ列になったら右へ送る
    used = set(); nodes = []
    for a in sorted(actors, key=lambda a: (a.get('row', 0), a.get('col', 0))):
        c, r = int(round(a.get('col', 0))), int(a.get('row', 0))
        while (c, r) in used: c += 1
        used.add((c, r))
        sub = a.get('sub') or []
        sub = [sub] if isinstance(sub, str) else list(sub)
        n = {'id': a['id'], 'label': a.get('symbol') or a.get('name') or a['id'], 'pos': [c, r]}
        if sub: n['sub'] = '|'.join(sub)
        # 強調色は争点の関係（線）だけに使う。当事者の箱は黒（スライドで箱を強調していても、図では付けない）
        nodes.append(n)
    col_of = {n['id']: n['pos'][0] for n in nodes}
    edges = []
    for rel in d.get('relations', []):
        e = {'from': rel['from'], 'to': rel['to']}
        if rel.get('label'): e['label'] = rel['label']
        if rel.get('emphasis'): e['accent'] = True
        if rel.get('arrow') is False: e['head'] = 'none'
        if rel.get('dash'): e['dash'] = True
        edges.append(e)
    groups = []
    gs = sl.get('groups') or []
    if gs:
        # sokan の groups は左から順に cols 列ずつ。元の列（小数）で振り分ける
        bounds = []; acc = 0.0
        for g in gs:
            acc += g.get('cols', 1); bounds.append(acc)
        for gi, g in enumerate(gs):
            lo = bounds[gi - 1] if gi else -1e9
            mem = [a['id'] for a in actors if lo <= a.get('col', 0) < bounds[gi] or (gi == len(gs) - 1 and a.get('col', 0) >= lo)]
            if mem: groups.append({'label': g.get('title', ''), 'members': mem})
    cap = sl.get('caption')
    cap = '　'.join(cap) if isinstance(cap, list) else (cap or '')
    msg = cap.split('：', 1)[-1].rstrip('。') if cap else '当事者の関係'
    side = '、'.join(f'{"左右中"[i] if len(groups) <= 3 else ""}は{g["label"]}' for i, g in enumerate(groups[:2])) if groups else ''
    read = (side + '。' if side else '') + '強調の線は争点の関係、矢じりのない線は向きのない結びつき。'
    out = {'type': 'parties', 'message': msg, 'caption': f'図N　この図で分かること：{msg}。{read}', 'nodes': nodes, 'edges': edges}
    if groups: out['groups'] = groups
    return out


def main():
    a = sys.argv[1:]
    if len(a) < 2: print(__doc__); sys.exit(2)
    opt = lambda k, dflt=None: a[a.index(k) + 1] if k in a else dflt
    spec = json.load(open(a[0], encoding='utf-8'))
    sl = pick(spec, int(opt('--slide')) if opt('--slide') else None)
    p = to_parties(sl)
    tmp = tempfile.mkdtemp(prefix='sokan_')
    sp = opt('--spec-out') or os.path.join(tmp, 'parties.json')
    json.dump(p, open(sp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    out = os.path.abspath(a[1]); svg = os.path.splitext(out)[0] + '.svg'
    r = subprocess.run(['node', FIGGEN, sp, svg, '--png', '--width-mm', opt('--width-mm', '150')], capture_output=True, text=True)
    sys.stderr.write(r.stdout + r.stderr)
    png = os.path.splitext(svg)[0] + '.png'
    if r.returncode != 0: raise SystemExit('図を作れなかった（上の理由を見る）')
    if png != out and os.path.exists(png): shutil.move(png, out)
    print(f'相関図：{out if os.path.exists(out) else svg}（当事者 {len(p["nodes"])}、関係 {len(p["edges"])}、囲み {len(p.get("groups", []))}）')
    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    main()
