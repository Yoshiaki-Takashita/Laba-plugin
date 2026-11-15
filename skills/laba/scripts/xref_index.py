#!/usr/bin/env python3
"""相互参照の索引（概念→出てくる節）と、他制度との対比の一覧を作る（指標⑨ 体系連関）。
usage: xref_index.py NOTE(.json|.py|.txt) [--source SOURCE.txt] [--terms 語1,語2] [--out xref.json] [--md xref.md] [--block xref_blocks.json] [-v]
出すもの：
  1. 概念の索引：鍵となる語（「」で括られた術語、見出しの語、--terms で渡した語、条文番号）ごとに、出てくる節の一覧。
     3つ以上の節に出るのに、どの節にも相互参照（⇨、「前述の」「後述の」「12-3-4」「表N」「図N」）がない語を「つなぎの候補」として出す。
  2. 相互参照の数：⇨、節番号への参照、表・図への参照、前掲。--source があれば、資料の ⇨ がノートに残っているかも見る。
  3. 対比の一覧：対比の標識（これに対して／とは異なり／と異なり／とは別である／とは区別／他方／と同様に／と反対の）を含む文と、その節。
     「何と何を比べているか」が文の中にあるか（比べる相手の語が、別の節の見出し・術語であるか）を付ける。
  4. 節どうしのつながり：節Aの本文が節Bを参照している組（A→B）。どこからも参照されず、どこも参照しない節を「孤立した節」として出す。
--only-terms：--block の表を --terms で渡した語だけにする（自動で拾った語は載せない。索引の語を人が選ぶとき）。
--block：巻末に載せる索引の表（概念／出てくる節）を作る。語は、2つ以上の節に出るものに限る。
        ただし --terms で渡した語（資料の見出し語、論点カードの論点、短答の命題で問う術語）は、1つの節にしか出なくても載せる。
        --terms の語が本文のどの節にも出ないときは WARN を出す（索引に載せられない語を、載せたことにしない）。
        表に載せた語の数は、出力の index_table_terms と標準出力に出る。報告には、この数を書く（手で数えない）。"""
import sys, collections
from laba_common import *
from laba_blocks import load_units, top

REF = re.compile(r'(⇨|→\s*\d|前述の|後述の|前掲|本ノート\d|\d+-\d+(?:-\d+)*(?:で|に|の|を|参照)|表\s*\d+|図\s*\d+|\(\s*[a-c1-3]\s*\))')
SECREF = re.compile(r'(\d+(?:-\d+)+)')
STOP = {'ある', 'ない', 'はい', 'いいえ', '場合', '意義', '要件', '問題', '理解', '全体像', '審理', '判決'}
CONTRAST = re.compile(r'(これに対して|のに対し|とは異なり|と異なり|とは別である|とは区別|他方[，、]|と同様に|と同じく|と反対の|とは反対|と対比|ちょうど逆|のとは違)')

def main():
    pos = positional()
    if not pos:
        print(__doc__); sys.exit(1)
    units = load_units(pos[0])
    body = [u for u in units if u['layer'] in ('body', 'zak', 'summary')]
    terms = collections.Counter()
    for u in units:
        if u['layer'] == 'head':
            for w in re.findall(r'[一-鿿々]{4,}(?:[ァ-ヺー]+)?', re.sub(r'^[\d\-（）()a-zA-Z：\s　発展すこし詳しく]+', '', u['text'])):
                if w not in STOP and not re.match(r'^(最判|最決|最大判|大判)', w):
                    terms[w] += 3
        else:
            for w in re.findall(r'「([^」]{3,16})」', u['text']):
                if not re.search(r'[。，、？]', w) and len(re.findall(r'[一-鿿々]', w)) >= 2 and w not in STOP:
                    terms[w] += 2
    for w in (arg('--terms') or '').split(','):
        if w:
            terms[w] += 10
    keys = [w for w, c in terms.items() if c >= 2]
    where = {w: [] for w in keys}; has_ref = collections.Counter()
    sec_text = collections.OrderedDict()
    for u in body:
        sec_text.setdefault(u['section'], []).append(u['text'])
    for sec, ts in sec_text.items():
        t = '\n'.join(ts)
        for w in keys:
            if w in t:
                where[w].append(sec)
                # その語を含む文に参照があるか
                for s in sentences(t, keep_heads=True):
                    if w in s and REF.search(s):
                        has_ref[w] += 1
    given = [w for w in (arg('--terms') or '').split(',') if w]
    # --terms の語は、本文の表（T）のセルに出る節も数える（表にしか出ない術語を索引から落とさない）
    tbl_text = collections.OrderedDict()
    for u in units:
        if u['layer'] == 'table' and not u.get('caption_only'):
            tbl_text.setdefault(u['section'], []).append(u['text'])
    order = list(dict.fromkeys(u['section'] for u in units if u['layer'] in ('body', 'zak', 'summary', 'table')))
    for w in given:
        if w in where:
            hit = set(where[w]) | {sec for sec, ts in tbl_text.items() if any(w in t for t in ts)}
            where[w] = [sec for sec in order if sec in hit]
    index = [{'term': w, 'sections': v, 'n_sections': len(v), 'refs': has_ref[w]} for w, v in where.items() if len(v) >= 2 or (w in given and len(v) >= 1)]
    absent_given = [w for w in given if not where.get(w)]
    index.sort(key=lambda x: (-x['n_sections'], x['term']))
    link_cands = [x for x in index if x['n_sections'] >= 3 and x['refs'] == 0]
    # 相互参照
    alltxt = '\n'.join(u['text'] for u in body)
    counts = {'arrow': alltxt.count('⇨'), 'table_fig': len(re.findall(r'[表図]\s*\d+', alltxt)), 'prev': len(re.findall(r'前掲|前述の|後述の', alltxt)),
              'section_refs': len(re.findall(r'(?<![⇨\d-])(?:本ノート)?\d+-\d+(?:-\d+)*(?=[でにのを）)，、])', alltxt))}
    chars = len(norm(alltxt)) or 1
    counts['per_10k_chars'] = round(10000.0 * sum(v for k, v in counts.items()) / chars, 1)
    res = {'n_terms': len(index), 'index': index, 'link_candidates': link_cands, 'references': counts, 'warn': []}
    if absent_given:
        res['warn'].append(f"--terms の語のうち、本文のどの節にも出ないもの {absent_given}（索引には載らない）")
    if arg('--source'):
        st = read(arg('--source')); sx = XREF_RE.findall(st); nx = XREF_RE.findall(alltxt + '\n'.join(u['text'] for u in units))
        miss = sorted(set(sx) - set(nx))
        res['source_arrows'] = {'source': len(set(sx)), 'kept': len(set(sx) & set(nx)), 'missing': miss}
        if miss:
            res['warn'].append(f'資料の相互参照（⇨）のうち、ノートにないもの {miss}')
    # 対比
    cons = []
    heads = [re.sub(r'^[\d\-（）()a-zA-Z：\s　]+', '', u['text']) for u in units if u['layer'] == 'head']
    for u in body:
        for s in sentences(u['text'], keep_heads=True) or []:
            m = CONTRAST.search(s)
            if m:
                other = [h for h in heads if h and len(h) >= 4 and h in s and h not in u['section']][:2]
                cons.append({'section': u['section'][:26], 'marker': m.group(1), 'cross_section_target': other, 'head': s[:60]})
    res['contrasts'] = cons; res['n_contrasts'] = len(cons); res['contrasts_per_10k_chars'] = round(10000.0 * len(cons) / chars, 1)
    # 節どうしのつながり
    secnos = collections.OrderedDict()
    for u in units:
        if u['secno'] and re.match(r'^\d+(-\d+)+$', u['secno']):
            secnos.setdefault(u['secno'], u['section'])
    edges = set()
    for u in body:
        for m in SECREF.finditer(u['text']):
            tgt = m.group(1)
            if tgt in secnos and tgt != u['secno'] and not tgt.startswith(u['secno'] + '-') and u['secno']:
                edges.add((u['secno'], tgt))
    linked = set(a for a, b in edges) | set(b for a, b in edges)
    iso = [k for k in secnos if k.count('-') >= 2 and k not in linked and top(k, 3) == k]
    res['section_links'] = sorted(edges); res['isolated_sections'] = iso
    if link_cands:
        res['warn'].append(f"3つ以上の節に出るのに参照のない語 {len(link_cands)} 個：{'・'.join(x['term'] for x in link_cands[:8])}")
    if arg('--out'):
        dump(res, arg('--out'))
    if arg('--md'):
        L = ['# 概念の索引（作業用）', '', '| 概念 | 出てくる節 |', '|---|---|'] + [f"| {x['term']} | {'／'.join(s[:18] for s in x['sections'])} |" for x in index]
        L += ['', '## 対比の一覧', ''] + [f"- {c['section']}｜{c['marker']}｜{c['head']}…" for c in cons]
        open(arg('--md'), 'w', encoding='utf-8').write('\n'.join(L) + '\n')
    if arg('--block'):
        secno_of = {u['section']: u['secno'] for u in units}
        def short(s):
            """節の見出しを、索引に載せる短い札にする。全体像・まとめ（言い直しの層）は載せない。"""
            if any(k in s for k in ('全体像', 'まとめ')):
                return None
            m = re.match(r'^((?:\d+)(?:-\d+)+)', s)
            if m:
                return m.group(1)
            m = re.search(r'(\d+-\d+)\s*$|(\d+-\d+)[\s　]', s)
            if '発展' in s or 'すこし詳しく' in s or 'コラム' in s:
                return '発展' + (m.group(1) or m.group(2) if m else '')
            m = re.match(r'^(\([^)]+\)|（[^）]+）)', s)
            if m:
                return (secno_of.get(s, '') + m.group(1)) if secno_of.get(s) else m.group(1)
            return s[:10]
        ent = []
        for x in index:
            labs = [l for l in dict.fromkeys(short(s) for s in x['sections']) if l]
            if len(labs) >= 2 or (x['term'] in given and labs):
                ent.append((x['term'], labs))
        # 別の語に含まれる語で、出てくる節が同じものは、長い方だけを残す
        keep = [(w, l) for w, l in ent if w in given or not any(w != w2 and w in w2 and set(l) <= set(l2) and len(l2) - len(l) <= 1 for w2, l2 in ent)]
        mx = int(arg('--max-sections', '8'))
        rows = [['概念', '出てくる節']]
        if '--only-terms' in sys.argv:
            keep = [(w, l) for w, l in keep if w in given]
        keep = keep[:int(arg('--max-terms', '40'))]
        res['index_table_terms'] = len(keep); res['index_table_missing_given'] = [w for w in given if w not in [k for k, _ in keep]]
        if arg('--out'):
            dump(res, arg('--out'))
        print(f"索引の表に載せた語 {len(keep)}" + (f"／--terms の語で載らなかったもの {res['index_table_missing_given']}" if res['index_table_missing_given'] else ''))
        for w, l in keep:
            rows.append([w, '，'.join(l) if len(l) <= mx else '，'.join(l[:3]) + f' ほか（全{len(l)}節。最初の節に定義）'])
        dump({'blocks': [['T', rows, '概念の索引（2つ以上の節に出てくるもの）', [50, 106]]]}, arg('--block'))
    for w in res['warn']:
        print('  WARN:', w)
    print(f"索引の語 {len(index)}／相互参照 ⇨{counts['arrow']}・表図 {counts['table_fig']}・前掲前述 {counts['prev']}・節 {counts['section_refs']}（1万字あたり {counts['per_10k_chars']}）／対比 {len(cons)}（1万字あたり {res['contrasts_per_10k_chars']}）／節のつながり {len(edges)}・孤立 {len(iso)}")
    if '-v' in sys.argv:
        for x in index[:20]:
            print(f"  {x['term']}：{x['n_sections']} 節（参照のある文 {x['refs']}）")
        print('  孤立した節：', iso)

if __name__ == '__main__':
    main()
