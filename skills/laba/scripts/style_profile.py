#!/usr/bin/env python3
"""資料テキストの文体を測り profile.json を出す。
usage: style_profile.py SOURCE.txt --out profile.json
測る項目は references/style-imitation.md の表と同じ。数値だけを保存し、資料の文は保存しない。"""
import re, sys, collections
from laba_common import *

CONNECTIVES = ['また', 'したがって', 'もっとも', 'しかし', 'そこで', 'なお', 'ただし', 'これに対して', '他方', 'すなわち', 'たとえば', '例えば',
               'つまり', '要するに', 'そのため', 'このため', 'それゆえ', 'ゆえに', 'だから', 'なので', 'でも', 'ちなみに', 'さらに', '次に', 'まず',
               '第1', '第2', '第3', '第一', '第二', '第三', 'そして', 'ところが', 'ところで', 'このように', '以上', 'この場合', 'このような', 'かかる',
               'いずれにせよ', 'とはいえ', 'むしろ', '逆に', '一方', 'その結果', 'これは', 'それにもかかわらず', '加えて', 'そうすると', 'そうであれば']
WATCH = ['すなわち', 'ということである', 'ことを意味する', 'そのため', 'ほかない', 'ざるを得ない', '余地がある', 'からである', 'という理由である',
         'ことになる', 'にとどまる', 'べきである', 'と解される', 'とされる', 'のである', 'と考えられる', 'と思われる', 'といえる', 'といえよう',
         'かかる', '当該', '前者', '後者', '前述', '前掲', 'いわゆる', 'ポイント', '重要', 'ここで', '実は', 'しっかり', 'きちんと', 'シンプル',
         'わかりやすく', '見ていきましょう', 'みましょう', 'ましょう', 'でしょう', 'ですね', '一つは', 'もう一つは', '二つある', '三つある', 'まとめると']
ENDINGS = [('である', r'である。$'), ('からである', r'からである。$'), ('という理由である', r'という理由である。$'), ('ことになる', r'ことになる。$'),
           ('とされる', r'(?:とされる|とされている)。$'), ('と解される', r'(?:と解される|と解されている|と解する)。$'), ('ない', r'ない。$'),
           ('がある', r'がある。$'), ('できる', r'できる。$'), ('受動', r'(?:れる|られる|れている|られている)。$'), ('べきである', r'べきである。$'),
           ('ざるを得ない', r'ざるを得ない。$'), ('のである', r'のである。$'), ('よう(推量)', r'(?:よう|ろう)。$'), ('にとどまる', r'にとどまる。$'),
           ('です', r'です。$'), ('ます', r'ます。$'), ('でした・ました', r'(?:でした|ました)。$'), ('だ', r'[^ん]だ。$'), ('疑問', r'[か？]。?$')]

def measure(text):
    sents = sentences(text)
    n = len(sents) or 1
    lens = [len(s) for s in sents]
    b = [0, 0, 0, 0, 0]
    for L in lens:
        b[0 if L <= 40 else 1 if L <= 60 else 2 if L <= 80 else 3 if L <= 100 else 4] += 1
    paras = [p for p in text.split('\n') if p.strip() and not is_heading(p)]
    ps = [len(sentences(p, keep_heads=True)) for p in paras]
    ps = [x for x in ps if x]
    end = collections.OrderedDict()
    for name, rx in ENDINGS:
        end[name] = pct(sum(1 for s in sents if re.search(rx, s)), n)
    desumasu = pct(sum(1 for s in sents if re.search(r'(?:です|ます|でした|ました|ません|でしょう|ましょう)[。？]?$', s)), n)
    taigen = pct(sum(1 for s in sents if not re.search(r'[。？！]$', s) or re.search(r'[一-鿿々ァ-ヶ）)]。$', s)), n)
    noperiod = pct(sum(1 for s in sents if not re.search(r'[。？！]$', s)), n)
    conn = collections.Counter()
    for s in sents:
        for c in sorted(CONNECTIVES, key=len, reverse=True):
            if s.startswith(c):
                conn[c] += 1; break
    watch = {w: round(1000.0 * text.count(w) / n, 1) for w in WATCH}
    body = ''.join(sents)
    L = len(body) or 1
    return {
        'n_sentences': len(sents), 'n_chars': len(body),
        'sent_len': stats(lens),
        'len_dist_pct': {'<=40': pct(b[0], n), '41-60': pct(b[1], n), '61-80': pct(b[2], n), '81-100': pct(b[3], n), '>100': pct(b[4], n)},
        'para_sents_mean': round(sum(ps) / len(ps), 2) if ps else 0,
        'para_chars_mean': round(sum(len(p) for p in paras) / len(paras), 0) if paras else 0,
        'endings_pct': end, 'desumasu_pct': desumasu, 'taigen_pct': taigen, 'noperiod_pct': noperiod,
        'dearu_family_pct': pct(sum(1 for s in sents if re.search(r'である。$', s)), n),
        'connective_start_pct': pct(sum(conn.values()), n),
        'connectives_per_1000_sents': {k: round(1000.0 * v / n, 1) for k, v in conn.most_common()},
        'watch_per_1000_sents': watch,
        'comma_fullwidth_pct': pct(body.count('，'), body.count('，') + body.count('、')),
        'commas_per_sentence': round((body.count('，') + body.count('、')) / n, 2),
        'kanji_pct': pct(len(KANJI.findall(body)), L), 'katakana_pct': pct(len(KATA.findall(body)), L),
        'parens_per_sentence': round((body.count('（') + body.count('(')) / n, 2),
        'bullets_lines': sum(1 for l in text.split('\n') if re.match(r'^\s*[・•\-＊*]\s', l)),
        'question_pct': pct(sum(1 for s in sents if re.search(r'(?:か。|？)$', s)), n),
    }

def classify(p):
    """資料の型を推定：textbook（文章中心）／resume（箇条書き・短文中心）。"""
    if p['sent_len']['mean'] >= 45 and p['noperiod_pct'] < 25 and p['para_sents_mean'] >= 1.8:
        return 'textbook'
    return 'resume'

if __name__ == '__main__':
    pos = positional()
    if not pos:
        print(__doc__); sys.exit(1)
    prof = measure(read(pos[0]))
    prof['source_type'] = classify(prof)
    prof['register'] = 'desumasu' if prof['desumasu_pct'] >= 50 else 'dearu'
    out = arg('--out', 'profile.json')
    dump(prof, out)
    print(f"sentences={prof['n_sentences']} mean_len={prof['sent_len']['mean']} >100={prof['len_dist_pct']['>100']}% "
          f"desumasu={prof['desumasu_pct']}% connective_start={prof['connective_start_pct']}% comma_full={prof['comma_fullwidth_pct']}% "
          f"type={prof['source_type']} -> {out}")
