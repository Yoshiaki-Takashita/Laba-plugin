#!/usr/bin/env python3
"""情報効率を測り、削る候補を出す（指標⑪）。
usage: info_efficiency.py NOTE(.json|.py|.txt) [--source SOURCE.txt] [--out efficiency.json] [-v]
見るもの：
  1. 層の間の重複：ざっくり理解・全体像／まとめ／表／論点カード／図題 の各文（セル）が、本文と12字単位でどれだけ重なるか。
     本文の言い直し（重なり50%超）を、層ごとに数える。表と本文の二重記載（同じ理由文が両方にある）もここで出る。
  2. 言い直しの層の分量：まとめ＋全体像（ざっくり理解のうち見出しに「全体像」を含むもの）が全体の何%か。目標4%以下。
     まとめの数。目標は全体のまとめ1か所。
  3. 節ごとの分量比（--source があるとき）：上位2段の節（12-3、12-4 …）ごとに、ノートの本文＋足した層の字数 ÷ 資料の字数。
     全体は1.15倍以内が目標、1.3倍が上限。節が1.5倍を超えたら、その節を先に削る。
  4. 新しい情報の少ない文：本文の文のうち、(a) 漢語・カタカナの語がすべて既出で、(b) それまでの本文と8字単位で60%以上重なる文。
     「前述のとおり」で始まる再説明、同じ理由の言い直し、が拾われる。
  5. 削る候補の一覧（字数の多い順）：言い直しの層の文、二重記載の表セル、新しい情報の少ない文。
  6. 巻末（論点カード・短答・判例の理由の出所・索引の表）：分量は巻末を除いて数えるので、巻末は別に測る。
     (a) 巻末の字数と、資料・本編に対する比。巻末が本編の0.5倍を超えたら WARN（目安。巻末が増えても分量比の点は減らないため）。
     (b) 中身のない列：4行以上の表で、半分を超えるセルが「—」「同上」「同左」「規範の欄と同じ」「同じ」か空の列（列をやめ、中身のあるセルは隣の欄に移す）。
     (c) 巻末どうしの重複：巻末の表のセルが、巻末の別の表のセルと12字単位で50%超重なる（同じ問・同じ理由を2か所に載せている。一方を番号の参照にする）。
重複率（文書内の15字の反復）は density.py が出す。ここでは「どこを削るか」を出す。
注意：論点カード・結論一覧・短答の表は、本文の索引として重なるのが役目なので、削る候補にはしない（重なりの値だけ出す）。"""
import sys, collections
from laba_common import *
from laba_blocks import load_units, source_sections, top

def grams(s, k):
    n = norm(CASE_RE.sub('', s))
    return [n[i:i + k] for i in range(len(n) - k + 1)]

def words(s):
    return set(re.findall(r'[一-鿿々]{2,}|[ァ-ヺー]{3,}', CASE_RE.sub('', s)))

def main():
    pos = positional()
    if not pos:
        print(__doc__); sys.exit(1)
    units = load_units(pos[0])
    body_units = [u for u in units if u['layer'] == 'body']
    body_g12 = set(g for u in body_units for g in grams(u['text'], 12))
    total = sum(len(norm(u['text'])) for u in units if u['layer'] != 'head') or 1
    # 1. 層の間の重複
    cross, cut = collections.defaultdict(lambda: {'n': 0, 'restated': 0, 'chars': 0, 'restated_chars': 0}), []
    for u in units:
        if u['layer'] in ('zak', 'summary', 'table', 'card', 'fig'):
            parts = sentences(u['text'], keep_heads=True) if u['layer'] in ('zak', 'summary', 'fig') else [u['text']]
            for s in parts:
                g = grams(s, 12)
                if len(g) < 6:
                    continue
                ov = pct(sum(1 for x in g if x in body_g12), len(g)); c = cross[u['layer']]
                c['n'] += 1; c['chars'] += len(norm(s))
                if ov > 50:
                    c['restated'] += 1; c['restated_chars'] += len(norm(s))
                    if u['layer'] in ('summary', 'zak', 'table') and not (u['layer'] == 'table' and u.get('col') == 0):   # 表の第1列は行の見出し（事案・判例名）なので、本文と同じ語になるのは二重記載ではない
                        cut.append({'why': {'summary': 'まとめが本文の言い直し', 'zak': 'ざっくり理解が本文と同文', 'table': '表のセルが本文と二重'}[u['layer']],
                                    'section': u['section'][:22], 'overlap_pct': ov, 'chars': len(norm(s)), 'head': s[:44]})
    # 2. 言い直しの層
    summ_heads = [u for u in units if u['layer'] == 'head' and 'まとめ' in u['text']]
    over_heads = [u for u in units if u['layer'] == 'head' and '全体像' in u['text']]
    summ_chars = sum(len(norm(u['text'])) for u in units if u['layer'] == 'summary')
    over_chars = sum(len(norm(u['text'])) for u in units if u['layer'] == 'zak' and '全体像' in u['section'])
    zak_chars = sum(len(norm(u['text'])) for u in units if u['layer'] == 'zak')
    restate = {'summary_blocks': len(summ_heads), 'summary_chars': summ_chars, 'overview_chars': over_chars, 'zakkuri_chars': zak_chars,
               'restatement_pct': pct(summ_chars + over_chars, total), 'zakkuri_pct': pct(zak_chars, total)}
    # 4. 新しい情報の少ない文
    seen_w, seen_g, low = set(), set(), []
    for u in body_units:
        for s in sentences(u['text'], keep_heads=True) or [u['text']]:
            w = words(s); g = grams(s, 8)
            if len(g) >= 20 and len(w) >= 4:
                ov = pct(sum(1 for x in g if x in seen_g), len(g))
                neww = [x for x in w if x not in seen_w]
                if not neww and ov >= 60:
                    low.append({'section': u['section'][:22], 'overlap_pct': ov, 'chars': len(norm(s)), 'head': s[:44]})
                    cut.append({'why': '新しい情報が少ない（既出の語だけで，前の文と重なる）', 'section': u['section'][:22], 'overlap_pct': ov, 'chars': len(norm(s)), 'head': s[:44]})
            seen_w |= w; seen_g |= set(g)
    res = {'total_chars': total, 'cross_layer': {k: dict(v, restated_pct=pct(v['restated'], v['n'])) for k, v in cross.items()},
           'restatement': restate, 'low_new_info_sentences': low, 'warn': []}
    # 3. 節ごとの分量比
    if arg('--source'):
        secs = source_sections(read(arg('--source')))
        sc = collections.Counter(); nc = collections.Counter()
        for c in secs:
            sc[top(c['secno'])] += len(norm(c['text']))
        for u in units:
            if u['layer'] in ('body', 'zak', 'summary', 'table', 'fig') and u['secno']:
                nc[top(u['secno'])] += len(norm(u['text']))
        rows = []
        for k in sorted(set(sc) | set(nc)):
            if k and sc[k] >= 300:
                r = round(nc[k] / sc[k], 2); rows.append({'section': k, 'note_chars': nc[k], 'source_chars': sc[k], 'ratio': r})
                if r > 1.5:
                    res['warn'].append(f'{k}：資料の {r} 倍（1.5倍超。この節から削る）')
        src_total = sum(sc.values()) or 1
        note_main = sum(len(norm(u['text'])) for u in units if u['layer'] in ('body', 'zak', 'summary', 'table', 'fig'))
        note_all = sum(len(norm(u['text'])) for u in units if u['layer'] != 'head')
        res['by_section'] = rows
        res['length_ratio_main'] = round(note_main / src_total, 2)   # 本文＋ざっくり理解＋まとめ＋表＋図題
        res['length_ratio_all'] = round(note_all / src_total, 2)     # 論点カード等の巻末の表も含む
        body_only = sum(len(norm(u['text'])) for u in units if u['layer'] == 'body')
        res['length_ratio_body'] = round(body_only / src_total, 2)
        if res['length_ratio_main'] > 1.3:
            res['warn'].append(f"分量が資料の {res['length_ratio_main']} 倍（上限1.3倍を超える）")
        elif res['length_ratio_main'] > 1.15:
            res['warn'].append(f"分量が資料の {res['length_ratio_main']} 倍（目標1.15倍を超える。巻末の表を除いた値）")
    # 6. 巻末
    FILL = {'', '—', '-', '－', '同上', '同左', '同じ', '規範の欄と同じ'}
    cards = [u for u in units if u['layer'] == 'card' and not u.get('caption_only') and u.get('row') is not None]
    back_chars = sum(len(norm(u['text'])) for u in units if u['layer'] == 'card')
    main_chars = sum(len(norm(u['text'])) for u in units if u['layer'] in ('body', 'zak', 'summary', 'table', 'fig')) or 1
    tabs = collections.OrderedDict()
    for u in units:
        if u['layer'] in ('card', 'table') and not u.get('caption_only') and u.get('row') is not None:
            tabs.setdefault(u.get('caption', ''), []).append(u)
    filler_cols = []
    for cap, us in tabs.items():
        nrow = len(set(u['row'] for u in us))
        cols = collections.defaultdict(list)
        for u in us:
            cols[(u['col'], u.get('head', ''))].append(u['text'].strip())
        if nrow >= 4:
            for (j, h), cells in cols.items():
                # セルが空のときは単位にならないので、行の数との差も「中身なし」に数える
                nf = sum(1 for c in cells if c in FILL) + (nrow - len(cells))
                if j > 0 and nf * 2 > nrow:
                    filler_cols.append({'table': cap[:24], 'column': h, 'filler': nf, 'rows': nrow})
    by_cap = collections.defaultdict(set)
    for u in cards:
        by_cap[u.get('caption', '')] |= set(grams(u['text'], 12))
    back_dup = []
    for u in cards:
        if u.get('col') == 0:
            continue
        for s_ in (sentences(u['text'], keep_heads=True) or [u['text']]):
            g = grams(s_, 12)
            if len(g) < 12:
                continue
            for cap, gs in by_cap.items():
                if cap == u.get('caption', ''):
                    continue
                ov = pct(sum(1 for x in g if x in gs), len(g))
                if ov > 50:
                    back_dup.append({'table': u.get('caption', '')[:20], 'other': cap[:20], 'overlap_pct': ov, 'chars': len(norm(s_)), 'head': s_[:40]}); break
    res['back'] = {'back_chars': back_chars, 'back_to_main': round(back_chars / main_chars, 2), 'filler_columns': filler_cols, 'dup_cells': back_dup,
                   'dup_chars': sum(x['chars'] for x in back_dup)}
    if arg('--source'):
        res['back']['back_to_source'] = round(back_chars / src_total, 2)
    if res['back']['back_to_main'] > 0.5:
        res['warn'].append(f"巻末の表が本編の {res['back']['back_to_main']} 倍（目安0.5倍。巻末は本文の索引である。巻末どうしの重複・中身のない列・長い欄を削る）")
    for f in filler_cols:
        res['warn'].append(f"中身のない列：{f['table']}「{f['column']}」は {f['filler']}/{f['rows']} 行が「—」「同じ」など（列をやめ、中身は隣の欄へ）")
    if back_dup:
        res['warn'].append(f"巻末どうしの重複 {len(back_dup)} セル・{res['back']['dup_chars']} 字（同じ内容を2つの表に載せている。一方を番号の参照にする）")
    if restate['summary_blocks'] > 1:
        res['warn'].append(f"まとめが {restate['summary_blocks']} か所（全体のまとめ1か所に。章末のまとめは論点カードに置き換える）")
    if restate['restatement_pct'] > 4:
        res['warn'].append(f"言い直しの層（まとめ＋全体像）が全体の {restate['restatement_pct']}%（4%以下に）")
    for lay, lab in (('summary', 'まとめ'), ('zak', 'ざっくり理解'), ('table', '表')):
        c = res['cross_layer'].get(lay)
        if c and c['restated'] and (lay != 'table' or c['restated'] >= 3):
            res['warn'].append(f"{lab}の文（セル）のうち {c['restated']} 個が本文と50%超重なる（{c['restated_chars']}字）")
    if len(low) >= 3:
        res['warn'].append(f'新しい情報の少ない文 {len(low)} 個（再説明・言い直しの候補）')
    cut.sort(key=lambda x: -x['chars']); res['cut_candidates'] = cut; res['cut_chars'] = sum(x['chars'] for x in cut)
    if arg('--out'):
        dump(res, arg('--out'))
    for w in res['warn']:
        print('  WARN:', w)
    print(f"全体 {total} 字／まとめ {restate['summary_blocks']} か所・言い直しの層 {restate['restatement_pct']}%／ざっくり理解 {restate['zakkuri_pct']}%"
          + (f"／分量比 本文 {res['length_ratio_body']}・巻末の表を除く全体 {res['length_ratio_main']}・全部 {res['length_ratio_all']}" if 'length_ratio_main' in res else ''))
    print('層の間の重複（本文と50%超重なる文・セル）：' + '／'.join(f"{k} {v['restated']}/{v['n']}" for k, v in res['cross_layer'].items()))
    print(f"新しい情報の少ない文 {len(low)}／削る候補 {len(cut)} 件・{res['cut_chars']} 字")
    b = res['back']
    print(f"巻末 {b['back_chars']} 字（本編の {b['back_to_main']} 倍" + (f"・資料の {b['back_to_source']} 倍" if 'back_to_source' in b else '') + f"）／中身のない列 {len(b['filler_columns'])}／巻末どうしの重複 {len(b['dup_cells'])} セル")
    if '-v' in sys.argv:
        for x in cut[:25]:
            print(f"  {x['chars']:4d}字｜{x['why']}｜{x['section']}｜{x['head']}…（重なり {x['overlap_pct']}%）")
        for r in res.get('by_section', []):
            print(f"  節 {r['section']}：{r['note_chars']} ÷ {r['source_chars']} ＝ {r['ratio']}")

if __name__ == '__main__':
    main()
