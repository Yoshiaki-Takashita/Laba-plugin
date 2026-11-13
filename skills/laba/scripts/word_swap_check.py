#!/usr/bin/env python3
"""語の置き換えで済ませた文と、資料から浮いた語・言い回しを拾う（指標⑩ 独自性の裏面、文体の「同じ書き手に見えるか」）。
usage: word_swap_check.py NOTE_BODY.txt [--source SOURCE.txt] [--out swap.json] [-v]
style_check.py は数値（文長・接続語の率など）を見る。ここでは、数値に出ない「浮き」を文単位で拾う。
見るもの：
  1. 置き換えの型：禁止した語を別の語に替えただけの文。
       「すなわち，…ということである」「つまり」→「すなわち」の連発（文頭「すなわち」が全体で4本以上）
       「言い換えれば」「換言すれば」「要するに」で始まる言い直し、「…ということを意味する。」の連続
       判例の理由文（「という理由である。」「からである。」）の直後に来る言い直し文
  2. 資料に出ない語（--source があるとき）：
       文頭の語（読点までの語）で、ノートに3回以上・資料に0〜1回のもの
       文末の型（最後の6字）で、ノートに4回以上・資料に0回のもの
       資料の3倍を超える率で出る文頭の語
  3. 解説書に出にくい言い回し（資料の有無にかかわらず）：強調の副詞、評価語、案内文、呼びかけ、ノート自身への言及。
       例：「非常に」「極めて重要」「注目すべき」「〜と言えるだろう」「〜を見ていこう」「ここで重要なのは」「本ノートでは」
  4. 数の予告の型：「一つは…。もう一つは…。」「…は二通りである。」（1節1回まで）
  5. 平易な言い換えが本文に入り込んでいないか：「両負け」「足並み」などの口語的な言い換えは、ざっくり理解の層だけで使う
     （--plain 語1,語2 で、その資料用の語を渡す。資料に出る語は除かれる）
出力は「読み直す文の一覧」である。語を別の語に替えて済ませず、資料の同じ働きの文に倣って書き直す（references/style-imitation.md）。"""
import sys, collections
from laba_common import *

SWAP = [(re.compile(r'^すなわち[，、].*(ということである|ことを意味する|にほかならない)。'), '「すなわち…ということである」型の言い直し'),
        (re.compile(r'^(言い換えれば|換言すれば|要するに|つまり|簡単にいえば|端的にいえば)[，、]'), '言い直しの標識で始まる文'),
        (re.compile(r'(ということである|ことを意味する)。$'), None)]   # 連続を見る
AIISH = [r'非常に', r'極めて重要', r'きわめて重要', r'注目すべき', r'注目に値', r'興味深い', r'と言えるだろう', r'といえよう', r'言うまでもな', r'周知のとおり',
         r'見ていこう', r'みていこう', r'確認しよう', r'押さえておきたい', r'押さえておこう', r'ここで重要なのは', r'重要なのは', r'ポイントは', r'鍵となる', r'カギとなる',
         r'本ノートでは', r'本稿では', r'以下では.*解説する', r'まず.*次に.*最後に', r'一言でいえば', r'いわば', r'まさに', r'そもそも', r'大きな役割', r'重要な役割',
         r'ことが分かる。', r'ことがわかる。', r'でしょう。', r'しましょう。', r'ください。', r'！', r'[?？]$']
COUNT_AHEAD = re.compile(r'(一つは|ひとつは|第一は|1つは).*。?$|は[二三2-3]通りである。|は[二三2-3]つある。|次の[二三2-3]点である。')
PLAIN_DEFAULT = ['両負け', '足並み', 'ばらばら', 'まとめて', 'そろえる', 'ぶつかる', '世間', 'ざっくり', 'ひとこと', '困る', 'ずれる']

def head_word(s):
    m = re.match(r'^([^，、。（(「]{1,10})[，、]', s)
    return m.group(1) if m else None

def tail(s, k=6):
    n = re.sub(r'[（(][^）)]*[）)]', '', s).rstrip('。')
    return n[-k:] if len(n) >= k else None

def main():
    pos = positional()
    if not pos:
        print(__doc__); sys.exit(1)
    t = read(pos[0]); S = sentences(t); n = len(S) or 1
    src = read(arg('--source')) if arg('--source') else None
    SS = sentences(src) if src else []
    hits = []
    # 1. 置き換えの型
    sunawachi = [s for s in S if s.startswith('すなわち')]
    for i, s in enumerate(S):
        for rx, why in SWAP[:2]:
            if rx.search(s):
                hits.append({'kind': '置き換え', 'why': why, 'sentence': s[:70]})
        if i and re.search(r'(という理由である|からである)。$', S[i - 1]) and re.match(r'^(すなわち|つまり|言い換えれば|これは[，、]|要するに)', s):
            hits.append({'kind': '置き換え', 'why': '理由文の直後の言い直し（理由文の前に「たとえば，」で具体化を入れる）', 'sentence': s[:70]})
        if i and SWAP[2][0].search(s) and SWAP[2][0].search(S[i - 1]):
            hits.append({'kind': '置き換え', 'why': '「ということである／ことを意味する」で終わる文が続く', 'sentence': s[:70]})
    src_sunawachi = sum(1 for s in SS if s.startswith('すなわち'))
    lim = max(3, round(3 * src_sunawachi * n / max(1, len(SS)))) if SS else 3
    if len(sunawachi) > lim:
        hits.append({'kind': '置き換え', 'why': f'文頭「すなわち」が {len(sunawachi)} 本（上限 {lim}。資料 {src_sunawachi} 本）', 'sentence': sunawachi[0][:70]})
    # 2. 資料に出ない語
    foreign = []
    if SS:
        nh = collections.Counter(filter(None, (head_word(s) for s in S))); sh = collections.Counter(filter(None, (head_word(s) for s in SS)))
        for w, c in nh.most_common():
            rate, srate = c / n, sh[w] / (len(SS) or 1)
            if c >= 3 and sh[w] <= 1:
                foreign.append({'where': '文頭', 'word': w, 'note': c, 'source': sh[w], 'why': '資料にほぼ出ない'})
            elif c >= 4 and srate and rate > 3 * srate:
                foreign.append({'where': '文頭', 'word': w, 'note': c, 'source': sh[w], 'why': '資料の3倍超'})
        nt = collections.Counter(filter(None, (tail(s) for s in S))); stl = collections.Counter(filter(None, (tail(s) for s in SS)))
        srcn = norm(src)
        for w, c in nt.most_common():
            if c >= 4 and stl[w] == 0 and norm(w) not in srcn:
                foreign.append({'where': '文末', 'word': w, 'note': c, 'source': 0, 'why': '資料に出ない文末の型'})
    # 3. 解説書に出にくい言い回し
    ai = []
    for s in S:
        for p in AIISH:
            m = re.search(p, s)
            if m and (not src or not re.search(p, src)):
                ai.append({'pattern': m.group(0), 'sentence': s[:70]})
    # 4. 数の予告
    cnt = [s[:70] for s in S if COUNT_AHEAD.search(s)]
    # 5. 平易な言い換え
    plain_words = [w for w in ((arg('--plain') or '').split(',') if arg('--plain') else PLAIN_DEFAULT) if w]
    plain = []
    for s in S:
        for w in plain_words:
            if w in s and (not src or w not in src):
                plain.append({'word': w, 'sentence': s[:70]})
    res = {'n_sentences': n, 'swap_hits': hits, 'foreign_words': foreign, 'unusual_phrases': ai, 'count_ahead': cnt, 'plain_in_body': plain,
           'sunawachi': len(sunawachi), 'warn': []}
    if hits:
        res['warn'].append(f'置き換えの型 {len(hits)} 件')
    if foreign:
        res['warn'].append(f"資料に出ない語・型 {len(foreign)} 個：{'・'.join(f['word'] for f in foreign[:8])}")
    if ai:
        res['warn'].append(f'解説書に出にくい言い回し {len(ai)} 件')
    if len(cnt) > max(2, n // 80):
        res['warn'].append(f'数を予告して並べる型が {len(cnt)} 回（1節1回まで）')
    if plain:
        res['warn'].append(f"平易な言い換えが本文に {len(plain)} 件：{'・'.join(sorted(set(p['word'] for p in plain)))}（ざっくり理解の層だけで使う）")
    res['float_count'] = len(hits) + len(foreign) + len(ai) + len(plain)
    if arg('--out'):
        dump(res, arg('--out'))
    for w in res['warn']:
        print('  WARN:', w)
    print(f"文 {n}／置き換えの型 {len(hits)}／資料に出ない語 {len(foreign)}／出にくい言い回し {len(ai)}／数の予告 {len(cnt)}／平易な言い換え {len(plain)}／文頭すなわち {len(sunawachi)}")
    if '-v' in sys.argv:
        for h in hits:
            print(f"  置き換え｜{h['why']}｜{h['sentence']}…")
        for f in foreign:
            print(f"  {f['where']}「{f['word']}」ノート {f['note']}／資料 {f['source']}（{f['why']}）")
        for a in ai:
            print(f"  言い回し「{a['pattern']}」｜{a['sentence']}…")
        for p in plain:
            print(f"  平易「{p['word']}」｜{p['sentence']}…")

if __name__ == '__main__':
    main()
