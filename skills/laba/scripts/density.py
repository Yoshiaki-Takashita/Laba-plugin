#!/usr/bin/env python3
"""論証密度・具体例密度・重複率・体系連関を測る。
usage: density.py NOTE.txt [--source SOURCE.txt] [--out density.json]
  論証密度：理由を示す型（からである／ためである／という理由／ので／ため，／ことから／以上，／趣旨である／に基づく／根拠 など。argument_check.py と同じ集合）を含む文の割合
  具体例密度：例示の型（たとえば／という場合／を例にとると／X1・Y1 などの当事者記号）を含む文の割合
  重複率：ノートの中で15字以上の同じ並びが2回以上出る割合（判例書誌は除く）
  体系連関：相互参照（⇨）と対比の標識（これに対して／とは異なり／と同様に／とは別である）の数（1万字あたり）
--source を付けると資料の値も出し、差を見られる。論証密度が資料より3ポイントを超えて低いと WARN（足した説明に理由が付いていない）。"""
import sys, collections
from laba_common import *

# 理由の標識は argument_check.py と同じ集合にそろえる（同じレポートの中で論証密度の定義が二つにならないように）
REASON = re.compile(r'(からである|からです|ためである|ためです|という理由|を理由と|ことから|(?<![もた])ので|のであ[るり]|のです|ため[，、]|以上[，、は]|趣旨である|趣旨です|に基づく|根拠|からにほかならない|ことによる|に求められ|けだし)')
EXAMPLE = re.compile(r'(たとえば|例えば|という場合|を例にとると|がこれに当たる|の例である|の例として|[XYZＡ-ＺA-Z][0-9１-９]?(?:が|は|と|に|を|の|ら))')
LINK = re.compile(r'(⇨|→\s*\d|これに対して|とは異なり|と異なり|と同様に|と同じく|とは別である|とは区別|との関係|前述の|後述の|前掲)')

def measure(t):
    ss = sentences(t); n = len(ss) or 1
    body = norm(CASE_RE.sub('', '\x00'.join(ss)))
    k = 15; c = collections.Counter(body[i:i + k] for i in range(len(body) - k + 1) if '\x00' not in body[i:i + k])
    dup = sum(v for v in c.values() if v >= 2)
    chars = len(body) or 1
    return {'n_sentences': len(ss), 'chars': chars,
            'reasoning_density_pct': pct(sum(1 for s in ss if REASON.search(s)), n),
            'example_density_pct': pct(sum(1 for s in ss if EXAMPLE.search(s)), n),
            'duplication_pct': pct(dup, sum(c.values()) or 1),
            'links_per_10k_chars': round(10000.0 * sum(len(LINK.findall(s)) for s in ss) / chars, 1),
            'tables_hint': t.count('表') and len(re.findall(r'表\s*\d+', t)), 'figures_hint': len(set(re.findall(r'図\s*\d+', t)))}

def main():
    pos = positional()
    if not pos:
        print(__doc__); sys.exit(1)
    res = {'note': measure(read(pos[0]))}
    if arg('--source'):
        res['source'] = measure(read(arg('--source')))
    res['warn'] = []
    if 'source' in res:
        gap = round(res['note']['reasoning_density_pct'] - res['source']['reasoning_density_pct'], 1)
        res['reasoning_gap_pt'] = gap
        if gap < -3:
            res['warn'].append(f'論証密度が資料より {abs(gap)} ポイント低い（−3ポイント以内に。足した説明の段落ごとに理由の文を1つ）')
    if res['note']['duplication_pct'] > 4:
        res['warn'].append(f"重複率 {res['note']['duplication_pct']}%（4%以下に）")
    if arg('--out'):
        dump(res, arg('--out'))
    for w in res['warn']:
        print('  WARN:', w)
    for who, m in ((k, v) for k, v in res.items() if k in ('note', 'source')):
        print(f"{who}: 論証密度 {m['reasoning_density_pct']}%／具体例密度 {m['example_density_pct']}%／重複率 {m['duplication_pct']}%／連関 {m['links_per_10k_chars']}（1万字あたり）／図 {m['figures_hint']}・表 {m['tables_hint']}")

if __name__ == '__main__':
    main()
