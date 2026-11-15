#!/usr/bin/env python3
"""段落ごとの論証の型を判定し、理由の欠けた段落を列挙する（指標⑥ 論証密度）。
usage: argument_check.py NOTE(.json|.py|.txt) [--source SOURCE.txt] [--out argument.json] [-v]
見るもの：
  1. 段落ごとに、文を5つの働きに分ける：主題（定義・規律）／理由／例／帰結／限定。
     2文以上の本文段落で「理由」がないものを列挙する（主題と帰結だけの段落）。
  2. 層ごとの論証密度（理由つきの文の割合）：本文／ざっくり理解・全体像／まとめ／図題／表・カード。
     足した層（ざっくり理解・全体像・まとめ・図題）の段落で、理由の文が1つもないものを列挙する。
  3. 「（補足）」で始まる文・段落に理由があるか（足した命題には根拠を付ける）。
  4. --source があれば、節ごと（上位2段：12-3、12-4 …）に資料と論証密度を比べ、3ポイントを超えて低い節を WARN にする。
理由の標識：からである／ためである／という理由／ので／ため，／ことから／以上，／趣旨である／に基づく／根拠
           （ざっくり理解の層では「からです／ためです／ので」も数える）
注意：これは形の検査である。標識を足せば数値は上がるが、論証が良くなるとは限らない。
      列挙された段落を読み、「なぜそう言えるのか」が書かれていないときだけ直す（references/metrics/06-argument-density.md）。"""
import sys, collections
from laba_common import *
from laba_blocks import load_units, source_sections, top

REASON = re.compile(r'(からである|からです|ためである|ためです|という理由|を理由と|ことから|(?<![もた])ので|のであ[るり]|のです|ため[，、]|以上[，、は]|趣旨である|趣旨です|に基づく|根拠|からにほかならない|ことによる|に求められ|けだし)')
NOTE_ONLY = re.compile(r'(の表記である|という表記|表記による|範囲外|範囲（|の範囲に|改正後の|改正前の|に当たる。?$|を指す。?$|頁まで）)')
EXAMPLE = re.compile(r'(たとえば|例えば|という場合|とします|を例にとると|がこれに当た|の例である|の例として|[XYZＡ-ＺA-Z][0-9１-９]?(?:が|は|と|に|を|の|ら))')
CONSEQ = re.compile(r'^(したがって|そこで|その結果|よって|ゆえに|それゆえ|このように|そうすると)|ことになる。|こととなる。|ことになります。|ほかはない。|ざるを得ない。')
LIMIT = re.compile(r'^(もっとも|ただし|しかし|他方|これに対して|なお)|に限られる|にとどまる|限りでない|とは限らない|余地がある|不明確|必ずしも')
TOPIC = re.compile(r'(とは[，、]|をいう。|を指す。|である。|と定める。|とされる。|とする。|を要する。|ならない。|できる。|できない。|です。|ます。)')

def roles(s):
    r = []
    if REASON.search(s):
        r.append('理由')
    if EXAMPLE.search(s):
        r.append('例')
    if CONSEQ.search(s):
        r.append('帰結')
    if LIMIT.search(s):
        r.append('限定')
    if not r and TOPIC.search(s):
        r.append('主題')
    return r or ['主題']

def density(sents):
    n = len(sents) or 1
    return pct(sum(1 for s in sents if REASON.search(s)), n), len(sents)

def main():
    pos = positional()
    if not pos:
        print(__doc__); sys.exit(1)
    units = load_units(pos[0])
    by_layer = collections.defaultdict(list); no_reason, added_no_reason, hosoku_no_reason = [], [], []
    by_top = collections.defaultdict(list); para_types = collections.Counter()
    cur_added = []  # 足した層の連続した段を1つの塊として見る
    def flush():
        if cur_added:
            txt = ' '.join(u['text'] for u in cur_added)
            if not REASON.search(txt) and len(norm(txt)) >= 60:
                added_no_reason.append({'layer': cur_added[0]['layer'], 'section': cur_added[0]['section'][:24], 'head': cur_added[0]['text'][:36], 'chars': len(norm(txt))})
            cur_added.clear()
    for u in units:
        if u['layer'] == 'head':
            flush(); continue
        ss = sentences(u['text'], keep_heads=True) or [u['text']]
        by_layer[u['layer']] += ss
        if u['layer'] == 'body':
            flush()
            by_top[top(u['secno'])] += ss
            rs = [roles(s) for s in ss]; flat = set(x for r in rs for x in r)
            para_types['+'.join(sorted(flat))] += 1
            if len(ss) >= 2 and '理由' not in flat and u['kind'] in ('P', 'BH', 'P2'):
                no_reason.append({'section': u['section'][:24], 'head': u['text'][:36], 'n_sent': len(ss), 'has': sorted(flat)})
            for i, s in enumerate(ss):
                if '（補足）' in s or '(補足)' in s:
                    if NOTE_ONLY.search(s):
                        continue  # 表記・範囲・改正の対応を断るだけの注記は、命題ではないので根拠を求めない
                    win = ' '.join(ss[i:i + 2])
                    # 根拠とみるもの：理由の文／条文番号・判例の書誌／（表N・図N・節番号）への参照／
                    # 「（補足）したがって」のように、同じ段落の前の文から導いた帰結（前の文が根拠）
                    based = (find_statutes(win) or find_cases(win) or re.search(r'（[^（）]*(?:表\s*\d+|図\s*\d+|\d+-\d+(?:-\d+)*)[^（）]*）', win)
                             or (i > 0 and re.search(r'（補足）\s*(したがって|それゆえ|そうすると|その結果)', s)))
                    if not REASON.search(win) and not based:
                        hosoku_no_reason.append({'section': u['section'][:24], 'head': s[:40]})
        elif u['layer'] in ('zak', 'summary'):
            cur_added.append(u)
        elif u['layer'] == 'fig':
            flush()
            if not REASON.search(u['text']) and len(norm(u['text'])) >= 60:
                pass  # 図題は「何が分かるか＋読み方」が役目。理由は求めない（数値には入れる）
    flush()
    layers = {}
    for k in ('body', 'zak', 'summary', 'fig', 'table', 'card'):
        d, n = density(by_layer[k]); layers[k] = {'reasoning_density_pct': d, 'n_sentences': n}
    prose = by_layer['body'] + by_layer['zak'] + by_layer['summary'] + by_layer['fig']
    res = {'layers': layers, 'prose_all': {'reasoning_density_pct': density(prose)[0], 'n_sentences': len(prose)},
           'paragraphs_without_reason': no_reason, 'added_blocks_without_reason': added_no_reason, 'hosoku_without_reason': hosoku_no_reason,
           'paragraph_types': dict(para_types.most_common(8)), 'warn': []}
    if arg('--source'):
        secs = source_sections(read(arg('--source')))
        st = collections.defaultdict(list)
        for c in secs:
            st[top(c['secno'])] += sentences(c['text'])
        all_src = [s for v in st.values() for s in v]
        res['source'] = {'reasoning_density_pct': density(all_src)[0], 'n_sentences': len(all_src)}
        rows = []
        for k in sorted(set(st) | set(by_top)):
            if not k:
                continue
            dn, nn = density(by_top.get(k, [])); ds, ns = density(st.get(k, []))
            if nn >= 8 and ns >= 8:
                rows.append({'section': k, 'note_pct': dn, 'source_pct': ds, 'gap_pt': round(dn - ds, 1), 'note_sentences': nn, 'source_sentences': ns})
                if dn - ds < -3:
                    res['warn'].append(f'{k}：本文の論証密度が資料より {round(ds - dn, 1)} ポイント低い（{dn}% ← {ds}%）')
        res['by_section'] = rows
        g = round(res['prose_all']['reasoning_density_pct'] - res['source']['reasoning_density_pct'], 1); res['prose_gap_pt'] = g
        gb = round(layers['body']['reasoning_density_pct'] - res['source']['reasoning_density_pct'], 1); res['body_gap_pt'] = gb
        if g < -3:
            res['warn'].append(f'地の文の全体（本文＋足した層）の論証密度が資料より {abs(g)} ポイント低い（足した層に理由が少ない）')
    if added_no_reason:
        res['warn'].append(f'足した層で理由の文がない塊 {len(added_no_reason)} 個（ざっくり理解・全体像・まとめ。各1文は「なぜか」を）')
    if hosoku_no_reason:
        res['warn'].append(f'（補足）の命題で、根拠が続いていないもの {len(hosoku_no_reason)} 個')
    if arg('--out'):
        dump(res, arg('--out'))
    for w in res['warn']:
        print('  WARN:', w)
    print('層ごとの論証密度：' + '／'.join(f"{k} {v['reasoning_density_pct']}%（{v['n_sentences']}文）" for k, v in layers.items() if v['n_sentences']))
    if 'source' in res:
        print(f"資料 {res['source']['reasoning_density_pct']}%／本文との差 {res['body_gap_pt']} pt／地の文全体との差 {res['prose_gap_pt']} pt")
    print(f"理由のない本文段落 {len(no_reason)}／足した層の塊 {len(added_no_reason)}／補足 {len(hosoku_no_reason)}")
    if '-v' in sys.argv:
        for x in no_reason[:30]:
            print(f"  本文｜{x['section']}｜{x['head']}…（{x['n_sent']}文，{'・'.join(x['has'])}）")
        for x in added_no_reason:
            print(f"  足した層（{x['layer']}）｜{x['section']}｜{x['head']}…")
        for x in hosoku_no_reason:
            print(f"  補足｜{x['section']}｜{x['head']}…")

if __name__ == '__main__':
    main()
