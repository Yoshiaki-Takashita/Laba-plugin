#!/usr/bin/env python3
"""ノート本文の文体を profile.json（資料の実測値）と比べる。
usage: style_check.py NOTE_BODY.txt --profile profile.json [--out style.json]
本文だけ（ざっくり理解・表・図題・見出しを除いたテキスト）に掛ける。WARN が 0 になるまで直す。
資料が resume 型（手本になる文体なし）のときは、です・ます解説の既定値（references/style-imitation.md）で検査する。"""
import sys
from laba_common import *
from style_profile import measure

DEFAULT_DESUMASU = {  # レジュメ型の既定：です・ますの解説
    'sent_len': {'mean': 42}, 'len_dist_pct': {'>100': 2}, 'para_sents_mean': 2.6, 'desumasu_pct': 95,
    'connective_start_pct': 22, 'comma_fullwidth_pct': 0, 'register': 'desumasu', 'source_type': 'resume'}

def main():
    pos = positional()
    if not pos:
        print(__doc__); sys.exit(1)
    note = measure(read(pos[0]))
    ppath = arg('--profile')
    src = json.load(open(ppath, encoding='utf-8')) if ppath else DEFAULT_DESUMASU
    if src.get('source_type') == 'resume':
        base = dict(DEFAULT_DESUMASU); base['connectives_per_1000_sents'] = {}; base['watch_per_1000_sents'] = {}
        src = base
    res = []
    def chk(name, val, lo, hi, ref):
        ok = lo <= val <= hi
        res.append({'item': name, 'note': val, 'source': ref, 'range': [round(lo, 1), round(hi, 1)], 'status': 'ok' if ok else 'WARN'})
    m = src['sent_len']['mean']
    chk('平均文長', note['sent_len']['mean'], m * 0.85, m * 1.15, m)
    if 'median' in src['sent_len']:
        md = src['sent_len']['median']; chk('文長の中央値', note['sent_len']['median'], md * 0.8, md * 1.2, md)
    for k, v in src.get('len_dist_pct', {}).items():
        tol = 12 if k in ('41-60', '61-80') else 10
        chk(f'文長分布 {k}', note['len_dist_pct'][k], max(0, v - tol), v + tol, v)
    ps = src.get('para_sents_mean', 0)
    if ps:
        chk('段落あたりの文数', note['para_sents_mean'], ps * 0.6, ps * 1.4, ps)
    if src.get('register', 'dearu') == 'dearu':
        chk('です・ます率', note['desumasu_pct'], 0, 1.0, src.get('desumasu_pct', 0))
        d = src.get('dearu_family_pct', 20); chk('である文末率', note['dearu_family_pct'], max(5, d - 10), 100, d)
        chk('体言止め・句点なし率', note['noperiod_pct'], 0, max(2.0, src.get('noperiod_pct', 0) + 2), src.get('noperiod_pct', 0))
    else:
        chk('です・ます率', note['desumasu_pct'], 85, 100, src.get('desumasu_pct', 95))
    c = src.get('connective_start_pct', 30); chk('接続語で始まる文の率', note['connective_start_pct'], max(0, c - 10), c + 10, c)
    cf = src.get('comma_fullwidth_pct', 0)
    if cf >= 90:
        chk('読点「，」の率', note['comma_fullwidth_pct'], 99, 100, cf)
    elif cf <= 10:
        chk('読点「，」の率', note['comma_fullwidth_pct'], 0, 1, cf)
    if 'kanji_pct' in src:
        chk('漢字率', note['kanji_pct'], src['kanji_pct'] - 5, src['kanji_pct'] + 5, src['kanji_pct'])
    if 'parens_per_sentence' in src:
        chk('括弧／文', note['parens_per_sentence'], 0, src['parens_per_sentence'] + 0.3, src['parens_per_sentence'])
    chk('箇条書きの行（本文）', note['bullets_lines'], 0, max(0, src.get('bullets_lines', 0)), src.get('bullets_lines', 0))
    # 資料に出ない語・資料の3倍を超える語
    n = note['n_sentences'] or 1
    foreign = []
    for group in ('connectives_per_1000_sents', 'watch_per_1000_sents'):
        s = src.get(group, {})
        for w, rate in note[group].items():
            cnt = round(rate * n / 1000)
            sr = s.get(w, 0)
            if cnt >= 3 and (sr == 0 or rate > 3 * sr):
                foreign.append({'word': w, 'note_count': cnt, 'note_per_1000': rate, 'source_per_1000': sr,
                                'why': '資料に出ない' if sr == 0 else '資料の3倍超'})
    if src.get('source_type') != 'resume':
        res.append({'item': '資料に出ない語・3倍超の語', 'note': len(foreign), 'source': 0, 'range': [0, 0], 'status': 'ok' if not foreign else 'WARN'})
    warns = [r for r in res if r['status'] == 'WARN']
    out = {'checks': res, 'foreign_words': foreign, 'warn_count': len(warns), 'note_profile': note}
    if arg('--out'):
        dump(out, arg('--out'))
    for r in res:
        print(f"[{r['status']:4}] {r['item']}: ノート {r['note']} / 資料 {r['source']} / 許容 {r['range'][0]}〜{r['range'][1]}")
    for f in (foreign if src.get('source_type') != 'resume' else []):
        print(f"       - 「{f['word']}」 {f['note_count']}回（{f['why']}：資料 {f['source_per_1000']}／1000文）")
    print(f"WARN {len(warns)}")
    sys.exit(1 if warns and '--strict' in sys.argv else 0)

if __name__ == '__main__':
    main()
