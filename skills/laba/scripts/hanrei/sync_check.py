#!/usr/bin/env python3
"""判例研究のレジュメとスライドが対応しているかを照らす。
usage: sync_check.py RESUME.json DECK_SPEC.json [--json out.json] [--strict]
  RESUME.json：resume_build.py の入力。DECK_SPEC.json：build_deck.js の入力（スライドの構成）。
検査（E＝直す、W＝確かめる）。18項目
  E heading-number   スライドの見出しの番号が、レジュメの節の番号にない
  E heading-title    番号は合うが、見出しの題がレジュメの節の題と違う
  E sub-heading      「(2) 時系列」のような小見出しが、レジュメのその節にない
  E sub-missing      レジュメの節にある小見出し（「3 (3) 本件の争点」「11 (2) 本判決の射程」）のスライドがない（その節のスライドはあるのに）
  E sub-jump         スライドの小見出しの番号が飛んでいる（(1) の次が (3)）
  W content-not-in-resume  スライドの文（8字以上）の語が、レジュメにほとんど出てこない（スライドにだけある内容を置かない）
  W hedge-dropped    レジュメの限定・確度の言い方（「〜とは読めない」「原則として」など）が、スライドで言い切りになっている疑い
  W section-name     右上の大項目名が、レジュメの章の名前と違う
  W uncovered        スライドのないレジュメの節（省くなら、発表で口頭で触れるかを決める）
  W no-number        番号のない見出し（参考文献・予備の枚を除く）
  E party-unknown    スライドの当事者の記号が、レジュメの当事者表にない
  W party-missing    レジュメの当事者が、スライドの当事者・関係図に出てこない
  W party-role       同じ記号の立場の書き方が、レジュメとスライドで違う（原告／被告など）
  W timeline-steps   時系列の段の数が、レジュメの時系列の小見出しの数と違う
  E fact-not-in-resume  スライドにある日付・金額が、レジュメにない
  W statute-not-in-resume  スライドにある条文番号が、レジュメにない
  W case-not-in-resume     スライドにある判例の表記が、レジュメにない
  W result-mismatch  審級の見出しの【結論】が、レジュメの審級の題と違う
終了コード：E が1件でもあれば 1。--strict なら W でも 1。
注意：照らすのは構成の JSON どうしである。作ったあとで .docx や .pptx を直接直したときは、JSON にも同じ直しを入れてから掛ける。"""
import sys, os, json, re

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
Z2H = str.maketrans('０１２３４５６７８９（）．　', '0123456789(). ')


def norm(t):
    t = re.sub(r'\{[rbgn]:(.*?)\}', r'\1', str(t))
    t = re.sub(r'〔R\d+〕', '', t).translate(Z2H)
    return re.sub(r'\s+', '', t)


def strings(o, skip=('type', '_todo', '_comment', 'kind', 'id', 'from', 'to')):
    if isinstance(o, str): yield o
    elif isinstance(o, list):
        for x in o: yield from strings(x, skip)
    elif isinstance(o, dict):
        for k, v in o.items():
            if k not in skip: yield from strings(v, skip)


def same(a, b):
    a, b = norm(a), norm(b)
    return bool(a) and bool(b) and (a.startswith(b) or b.startswith(a))


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if len(args) < 2:
        print(__doc__); sys.exit(2)
    out_json = sys.argv[sys.argv.index('--json') + 1] if '--json' in sys.argv else None
    args = [a for a in args if a != out_json]
    from resume_build import blocks_from
    spec = json.load(open(args[0], encoding='utf-8')); deck = json.load(open(args[1], encoding='utf-8'))
    blocks, toc = blocks_from(spec)
    # レジュメの節：番号 → {題, 小見出し}
    secs = {}; cur = None
    for b in blocks:
        if b[0] == 'S':
            m = re.match(r'^(\d+)[　 ]+(.+)$', b[1])
            if m: cur = int(m.group(1)); secs[cur] = {'title': m.group(2), 'subs': []}
            else: cur = None
        elif b[0] == 'SS' and cur:
            m = re.match(r'^\((\d+)\)\s*(.+)$', b[1])
            if m: secs[cur]['subs'].append((m.group(1), m.group(2)))
    rtext = norm(' '.join(strings(spec)))
    findings = []
    add = lambda sev, code, where, msg: findings.append({'sev': sev, 'code': code, 'where': where, 'msg': msg})
    covered = set(); chapters = [norm(t) for t in toc]; subs_seen = {}
    slides = deck.get('slides', [])
    for i, sl in enumerate(slides):
        if sl.get('type') == 'section':
            n = norm(sl.get('name', ''))
            if chapters and not any(c.startswith(n) or n.startswith(c) for c in chapters):
                add('W', 'section-name', sl.get('name', ''), f"大項目名「{sl.get('name')}」が、レジュメの章（{'、'.join(toc)}）にない")
            continue
        if sl.get('type') in ('cover', 'toc'): continue
        h = sl.get('heading', '')
        m = re.match(r'^\s*(\d+)[.．]\s*(.*)$', h)
        if not m:
            if sl.get('type') not in ('references', 'qa') and not re.search('参考|予備|補足', h):
                add('W', 'no-number', h or f'{i + 1}番目', '見出しに番号がない。レジュメの節の番号を付ける')
            continue
        no = int(m.group(1)); rest = [p for p in re.split(r'[　 ]{1,}(?=[^　 ])', m.group(2).replace(' ', '　')) if p]
        if no not in secs:
            add('E', 'heading-number', h, f'番号 {no} の節がレジュメにない（レジュメの節は 1〜{max(secs) if secs else 0}）'); continue
        covered.add(no); rt = secs[no]['title']
        title = re.sub(r'[①-⑳]+$', '', rest[0]) if rest else ''
        base = lambda t: re.sub(r'【.*?】|\(.*?\)|（.*?）', '', t)
        if not same(base(title), base(rt)):
            add('E', 'heading-title', h, f'レジュメの {no} は「{rt}」。スライドの見出しを合わせる')
        rs, ss = re.search(r'【(.+?)】', rt), re.search(r'【(.+?)】', h)
        if rs and ss and norm(rs.group(1)) != norm(ss.group(1)):
            add('W', 'result-mismatch', h, f'結論の書き方が違う（レジュメ【{rs.group(1)}】、スライド【{ss.group(1)}】）')
        tail = m.group(2)
        for sm in re.finditer(r'[(（](\d+)[)）]\s*([^　 (（]*)', tail.translate(Z2H)):
            k, st = sm.group(1), re.sub(r'[①-⑳]+$', '', sm.group(2))
            hit = [s for s in secs[no]['subs'] if s[0] == k]
            subs_seen.setdefault(no, []).append(int(k))
            if not hit: add('E', 'sub-heading', h, f'レジュメの {no} に小見出し ({k}) がない')
            elif st and not same(st, hit[0][1]): add('E', 'sub-heading', h, f'レジュメの {no} の ({k}) は「{hit[0][1]}」')
    for no in sorted(set(secs) - covered):
        add('W', 'uncovered', f"{no}　{secs[no]['title']}", 'この節のスライドがない')
    # 小見出しの抜けと飛び（その節のスライドがあり、小見出しを見出しに使っているとき）
    for no, seen in subs_seen.items():
        have = sorted(set(seen))
        for k, title in secs[no]['subs']:
            if int(k) not in have: add('E', 'sub-missing', f'{no} ({k}) {title}', f'レジュメの {no} の小見出し ({k})「{title}」のスライドがない。枚を足すか、省くならレジュメの側も合わせる')
        order = []
        for k in seen:
            if not order or order[-1] != k: order.append(k)
        for a_, b_ in zip(order, order[1:]):
            if b_ > a_ + 1 and not any(int(k) == a_ + 1 for k, _ in secs[no]['subs'] if int(k) not in have):
                add('E', 'sub-jump', f'{no}', f'スライドの小見出しの番号が ({a_}) から ({b_}) に飛んでいる')
    # 当事者
    rparties = {p[0]: (p[1] if len(p) > 1 else '') for p in (spec.get('facts') or {}).get('parties', [])}
    dsyms = {}
    for sl in slides:
        for p in sl.get('parties', []) or []:
            if p.get('symbol'): dsyms.setdefault(p['symbol'], []).append(' '.join([p.get('role', '')] + list(p.get('lines', []))))
        for a in (sl.get('actors') or (sl.get('diagram') or {}).get('actors') or []):
            if a.get('symbol'): dsyms.setdefault(a['symbol'], []).append(' '.join([a.get('role', '')] + [x for x in ([a.get('sub')] if isinstance(a.get('sub'), str) else (a.get('sub') or []))]))
    # 記号は「Z社」「Y銀行」のような書き方も同じ当事者とみる。「本件建物」のような物は当事者表と照らさない
    def psym(x):
        y = re.sub(r'(株式会社|会社|社|銀行|協会|ら)$', '', x)
        return y if re.match(r'^[A-Za-zＡ-Ｚ][0-9０-９]?$', y) else None
    dsyms2 = {}
    for k, v in dsyms.items():
        if psym(k): dsyms2.setdefault(psym(k), []).extend(v)
    dsyms = dsyms2
    if rparties:
        for s in dsyms:
            if s not in rparties: add('E', 'party-unknown', s, f'当事者「{s}」がレジュメの当事者表にない')
        for s in rparties:
            if dsyms and s not in dsyms: add('W', 'party-missing', s, f'レジュメの当事者「{s}」がスライドに出てこない')
        standing = lambda t: set(re.findall(r'被?(?:上告人|控訴人)|原告|被告', t))
        for s, roles in dsyms.items():
            if s in rparties:
                want = standing(rparties[s])
                bad = [r for r in roles if standing(r) and want and standing(r) != want]
                if bad: add('W', 'party-role', s, f'立場の書き方が違う（レジュメ「{rparties[s]}」、スライド「{bad[0]}」）')
    # 時系列の段
    rt_n = len((spec.get('facts') or {}).get('timeline', []))
    for sl in slides:
        if sl.get('type') == 'timeline' and rt_n and len(sl.get('steps', [])) != rt_n:
            add('W', 'timeline-steps', sl.get('heading', ''), f"時系列の段が {len(sl.get('steps', []))}、レジュメの時系列の小見出しが {rt_n}。丸数字が対応しなくなる")
    # 数字・条文・判例
    seen = set()
    for sl in slides:
        if sl.get('type') in ('section', 'toc'): continue
        where = sl.get('heading') or sl.get('type')
        for t in strings(sl):
            n = norm(t)
            for pat, sev, code, what in ((r'(?:昭和|平成|令和|大正|明治)\d+年(?:\d+月(?:\d+日)?)?', 'E', 'fact-not-in-resume', '日付'),
                                         (r'\d[\d,]*(?:億|万)?円', 'E', 'fact-not-in-resume', '金額'),
                                         (r'\d+条(?:の\d+)?(?:\d+項)?', 'W', 'statute-not-in-resume', '条文'),
                                         (r'(?:最大?[判決]|大判|[^\s、。]{2,4}[高地]判)(?:昭和|平成|令和|大正|明治)\d+[・.年]\d+[・.月]\d+', 'W', 'case-not-in-resume', '判例')):
                for mm in re.finditer(pat, n):
                    v = mm.group(0)
                    if (code, v) in seen: continue
                    seen.add((code, v))
                    key = re.sub(r'\d+項$', '', v) if what == '条文' else v
                    if v not in rtext and key not in rtext:
                        add(sev, code, where, f'{what}「{v}」がレジュメにない（スライドにだけある内容を置かない）')
    # スライドにだけある内容（語の重なりで調べる）
    def grams(t):
        """文字の2字組（句読点・括弧・記号を除く）。語の重なりの近似に使う"""
        t = re.sub(r'[^一-鿿゠-ヿぁ-ゖA-Za-z0-9]', ' ', norm(t)); out = set()
        for w in t.split():
            out.update(w[i:i + 2] for i in range(len(w) - 1))
        return out
    rgrams = grams(' '.join(strings(spec)))
    COV_MIN = 0.62
    HEDGES = ('とは読めない', 'とは限らない', 'にとどまる', '原則として', 'と解される', 'とみられる', 'と読める', '余地がある', 'にすぎない', '場合に限', 'かぎり', '限り')
    rnorm_sents = [x for t0 in strings(spec) for x in re.split(r'[。\n]', re.sub(r'〔R\d+〕', '', t0)) if len(x.strip()) >= 8]
    flagged = 0
    for sl in slides:
        if sl.get('type') in ('section', 'toc', 'cover', 'references'): continue
        where = sl.get('heading') or sl.get('type')
        for t in strings(sl, skip=('type', '_todo', '_comment', 'kind', 'id', 'from', 'to', 'heading', 'notes', 'symbol', 'head', 'tag', 'title', 'label', 'hereLabel', 'note', 'statutes', 'source', 'court')):
            n = norm(t)
            if len(n) < 8: continue
            g = grams(t)
            if len(g) < 6: continue
            cov = len(g & rgrams) / len(g)
            if '--debug' in sys.argv: print(f'    cov {cov:.2f} {n[:40]}')
            if cov < COV_MIN:
                flagged += 1
                if flagged <= 12: add('W', 'content-not-in-resume', where, f'「{n[:28]}」の語の {round((1 - cov) * 100)}% がレジュメにない。レジュメにある言い方に直すか、レジュメに足す')
            # 限定・確度の語：スライドの文と語がよく重なるレジュメの文に限定の語があり、スライドの文にないとき
            if len(g) >= 8 and not any(hd in n for hd in HEDGES):
                best = None
                for rs in rnorm_sents:
                    rg = grams(rs)
                    if not rg: continue
                    ov = len(g & rg) / len(g)
                    if ov >= 0.55 and (best is None or ov > best[0]): best = (ov, rs)
                if best:
                    hd = next((x for x in HEDGES if x in norm(best[1])), None)
                    if hd and hd not in ('特段の事情',) and re.search(r'(ない|である|できる|する|した|及ぶ|当たる)$', n):
                        add('W', 'hedge-dropped', where, f'スライド「{n[:24]}」／レジュメ「…{hd}…」。言い切りになっていないか確かめる')
    if flagged > 12: add('W', 'content-not-in-resume', '全体', f'ほかに {flagged - 12} 件')
    E = [f for f in findings if f['sev'] == 'E']; W = [f for f in findings if f['sev'] == 'W']
    out = {'resume': args[0], 'deck': args[1], 'sections': len(secs), 'covered': len(covered), 'errors': len(E), 'warnings': len(W), 'findings': findings}
    if out_json: json.dump(out, open(out_json, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f"レジュメの節 {len(secs)}、うちスライドのある節 {len(covered)}。error {len(E)}、warn {len(W)}")
    for f in findings: print(f"  {f['sev']} [{f['code']}] {f['where']}：{f['msg']}")
    sys.exit(1 if E or ('--strict' in sys.argv and W) else 0)


if __name__ == '__main__':
    main()
