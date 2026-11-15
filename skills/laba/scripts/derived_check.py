#!/usr/bin/env python3
"""派生物（本文から作り直した行）を、根拠にした本文の箇所と照合する（指標④⑫。failure-catalog「派生物で留保・条文がずれる」）。
usage: derived_check.py NOTE(.json|.py) [--cards cards.json] [--tf items.json] [--index index.json] [--out derived.json] [-v] [--strict]

派生物とは：論点カードの各欄、短答式の命題と根拠、全体のまとめ・全体像の各文、概念の索引の各行。
本文を短く言い直す場所なので、留保の語（とされる・考えられている・余地がある・不明確）が落ちて断定になる、
根拠の条文が入れ替わる、ということが起きやすい。本文の検査（certainty_check.py・statute_check.py）は資料と本文を比べるので、ここは見ない。

行ごとにすること：
  1. 根拠の節を引く。論点カードは "section"、短答は "section" に書いた節番号（12-3-4-2 など。複数は「，」で並べる。
     上位の節 12-3-3 を書けば 12-3-3-1 以下を含む）。書いていない行は所見（根拠の節がない）。
     まとめ・全体像の文は、本文の全体から探す。
  2. その節の本文・表の文のうち、行の文と術語（漢字2字の並び）の重なりが最も大きい文を「該当箇所」とする（前後1文も合わせて見る）。
     重なりが小さい（0.25未満）ときは「該当箇所が見当たらない」（本文にない内容を書いていないか読む）。
  3. 確度の語：該当箇所に留保の語（強い留保＝不明確・必ずしも・余地がある・なお検討を要する 等／帰属＝とされる・と考えられている・と解される・通説）
     があるのに、行の文に留保の語が一つもないとき
       強い留保が落ちた          → 所見「留保の脱落」（本文と同じ強さに戻す）
       帰属の語だけが落ちた      → 所見「断定になっている」（「とされる」「と考えられている」を戻す）。
                                   行に判例の書誌・条文番号・「判例」「通説」「（教科書の説明）」など出所の語があれば、所見にしない
     短答の命題も同じ規則で見る。× の肢は、強い留保だけを見る（本文が不明確とする点を、入れ替えた語で言い切って × にしていないか）。
  4. 条文番号：行に書いた条文（短答は根拠の欄、カードは規範・書き出し）が
       根拠の節の本文に一度も出ない                                   → 所見「根拠の条文が根拠の節にない」
       該当箇所で「〜は働かない／適用されない／によるのではない」と否定されている → 所見「根拠の条文を本文は否定の文脈で書いている」
       節にはあるが該当箇所（前後1文・同じ表の行）にない               → 注意「条文が該当箇所にない」（根拠の取り違えでないか読む）
     否定の文脈は、重なりの大きい3文（表のセルを含む）まで見る。
     行の側も同じ否定の言い方をしている（「41条3項は働かない」と根拠に書いた）ときは、所見にしない。
  5. 索引：語が、書かれた節の本文・表に実際に出るか。語の数を数える（報告には、この数を書く）。
除外の一覧は置かない。所見が出たら、行の文を本文の強さ・条文に合わせて書き直す。該当箇所の対応づけは近似なので、所見は一件ずつ読む。
出す値：行の数、該当箇所に留保があった行の数と、そのうち留保が保たれた行の数（派生物の確度の保存率）、条文の照合数と不一致、索引の語の数。"""
import sys, json, collections
from laba_common import *
from laba_blocks import load_units

# 強い留保：学説・判例の状況や解釈の確からしさについての留保
STRONG = ['不明確', '明らかではない', '明らかでない', '明確にされていない', '明確でない', '議論がある', '検討の余地', '検討を要する', '疑問である', '問題となり得る', '争いがある', '両立し難い',
          '余地がある', '余地が生じる', 'と考える余地', '妥当しない可能性', '要請されよう', 'であろう', 'なろう', 'と考えられる', 'と思われる', 'ようにみえる',
          'とみることもできる', '理解も有力', '有力である', '有力説', '傾向にある', '一般的には', '必ずしも', '少なくとも', '当然にはいえない']
# 帰属：だれの見解かを示す語（落ちると、ノート自身の断定になる）
ATTRIB = ['とされる', 'とされている', 'とされ，', 'とされ、', 'と考えられている', 'と解される', 'と解されている', 'と解するのが相当', '通説', '多数説', 'と理解することができる']
# 行の側にあれば「出所を示している」とみる語（判例の書誌・条文があれば、それも出所）
SOURCED = ['判例', '（判決）', '教科書の説明', '資料の説明', '（教科書', '（資料', '通説', '有力', 'とする見解']
NEG = r'(は働かない|は適用されない|の適用はない|によるものではない|によるのではない|は及ばない|の問題ではない|では防がれない|までは防がれない)'
TF_HEAD = re.compile(r'^[○×][：:]\s*')
TF_TAIL = re.compile(r'（誤りは.*$')

def reserve(s):
    return [w for w in STRONG if w in s], [w for w in ATTRIB if w in s]

def sourced(s):
    return bool(find_cases(s)) or bool(find_statutes(s)) or any(w in s for w in SOURCED)

def bigrams(s):
    out = set()
    for w in re.findall(r'[一-鿿々]{2,}', s):
        for i in range(len(w) - 1):
            out.add(w[i:i + 2])
    return out

def score(a, b):
    return len(a & b) / (len(a) ** 0.5 * len(b) ** 0.5) if a and b else 0.0

def secno_of(s):
    """根拠の節。節番号を「，」で並べれば複数の節（「12-3-4-2，12-3-4-3」）。上位の節（12-3-3）を書けば、その下の節を全部含む。"""
    return '，'.join(m.group(1) for x in re.split(r'[，、,]', s or '') for m in [re.match(r'^\s*(\d+(?:-\d+)+)', x)] if m)

class Body:
    """本文の文（節つき）。層：body・table。図題・巻末（card）・まとめ・ざっくり理解は入れない（どれも本文を言い直したものだから）。"""
    def __init__(self, units):
        self.sents = []
        rows = collections.defaultdict(list)          # 同じ表の同じ行のセルをまとめる
        for u in units:
            if u['layer'] not in ('body', 'table') or u.get('caption_only'):
                continue
            if u['layer'] == 'table':
                rows[(u.get('caption', ''), u.get('row'))].append(u)
                continue
            ss = sentences(u['text'], keep_heads=True) or [u['text']]
            base = len(self.sents)
            for k, s in enumerate(ss):
                self.sents.append({'s': s, 'g': bigrams(s), 'secno': u['secno'], 'section': u['section'], 'layer': u['layer'],
                                   'win': ' '.join(ss[max(0, k - 1):k + 2])})
        for (cap, r), us in rows.items():
            t = ' '.join(u['text'] for u in us)
            for u in us:
                for s in (sentences(u['text'], keep_heads=True) or [u['text']]):
                    self.sents.append({'s': s, 'g': bigrams(s), 'secno': us[0]['secno'], 'section': us[0]['section'], 'layer': 'table', 'win': t})
        self.by_sec = collections.defaultdict(list)
        for i, x in enumerate(self.sents):
            self.by_sec[x['secno']].append(i)

    def in_section(self, secno):
        """節番号が同じか、その下位の節（12-3-4 → 12-3-4-1 …）の文。"""
        secs = [x for x in secno.split('，') if x]
        return [i for k, v in self.by_sec.items() if any(k == x or k.startswith(x + '-') for x in secs) for i in v]

    def text_of(self, idx):
        return '\n'.join(self.sents[i]['s'] for i in idx)

    def best(self, s, idx):
        g = bigrams(s); b, bi = 0.0, -1
        for i in idx:
            sc = score(g, self.sents[i]['g'])
            if sc > b:
                b, bi = sc, i
        return b, bi

def check_row(body, kind, label, text, secno, cites, res, hedge=True):
    """1行（1文）を照合する。cites：この行の根拠として照合する条文を含む文字列。"""
    idx = body.in_section(secno) if secno else list(range(len(body.sents)))
    if secno and not idx:
        res['issues'].append({'kind': '根拠の節が本文にない', 'row': label, 'detail': f'節 {secno}'}); return
    row = {'row': label, 'kind': kind, 'section': secno, 'text': text[:70], 'matched': ''}
    res['rows'].append(row)
    wins = []                                   # 該当箇所（重なりの大きい順に3つまで。条文の否定の文脈を見るのに使う）
    if len(norm(text)) >= 16:                   # 短い行（「39条。影響を及ぼさない」など）は、文の対応づけをしない
        g = bigrams(text)
        ranked = sorted(((score(g, body.sents[i]['g']), i) for i in idx), reverse=True)[:3]
        sc, bi = ranked[0] if ranked else (0.0, -1)
        row['score'] = round(sc, 2)
        if bi < 0 or sc < 0.25:
            if kind in ('card', 'tf'):
                res['issues'].append({'kind': '該当箇所が見当たらない', 'row': label, 'detail': f'{text[:40]}…（重なり {round(sc, 2)}）。本文にない内容を書いていないか'})
            elif kind == 'summary':
                res['notes'].append({'kind': '該当箇所が見当たらない', 'row': label, 'detail': f'{text[:40]}…（重なり {round(sc, 2)}）'})
        else:
            m = body.sents[bi]; row['matched'] = m['s'][:70]
            wins = [body.sents[i]['win'] for s_, i in ranked if s_ >= 0.25]
            if hedge or kind == 'tf×':
                st, at = reserve(m['s'])
                if kind == 'tf×':
                    at = []                     # × の肢：帰属の語は見ない（根拠の欄に判例・条文がある）。強い留保だけを見る
                mine_st, mine_at = reserve(text)
                if st or at:
                    res['hedged_rows'] += 1
                    if mine_st or mine_at or (not st and sourced(text + ' ' + cites)):
                        res['hedge_kept'] += 1
                    elif st:
                        res['issues'].append({'kind': '留保の脱落', 'row': label, 'detail': f"本文の留保 {st}｜行：{text[:44]}…｜本文：{m['s'][:44]}…"})
                    else:
                        res['issues'].append({'kind': '断定になっている', 'row': label, 'detail': f"本文は {at}｜行：{text[:44]}…｜本文：{m['s'][:44]}…"})
    win = ' '.join(wins)
    # 条文
    sec_text = body.text_of(idx)
    for a in dict.fromkeys(s['article'] for s in find_statutes(cites)):
        res['statutes_checked'] += 1
        esc = re.escape(a)
        own_neg = re.search(esc + r'[^。，、）]{0,6}' + NEG, cites)
        if a not in sec_text:
            res['issues'].append({'kind': '根拠の条文が根拠の節にない', 'row': label, 'detail': f'{a}（節 {secno or "全体"}）'}); res['statute_mismatch'] += 1
        elif win and re.search(esc + r'(?:第?\d+項)?[^。，、）]{0,6}' + NEG, win) and not own_neg:
            res['issues'].append({'kind': '根拠の条文を本文は否定の文脈で書いている', 'row': label,
                                  'detail': f"{a}｜本文：{re.search(esc + r'(?:第?[0-9]+項)?[^。，、）]{0,6}' + NEG, win).group(0)}｜行の根拠：{cites[:40]}"}); res['statute_mismatch'] += 1
        elif wins and a not in wins[0]:
            res['notes'].append({'kind': '条文が該当箇所にない', 'row': label, 'detail': f'{a} は節 {secno} にはあるが、該当箇所（{row.get("matched", "")[:24]}…）の前後にない'})

def split_sents(t):
    return [s for s in sentences(t, keep_heads=True) if len(norm(s)) >= 10] or ([t] if len(norm(t)) >= 10 else [])

def main():
    pos = positional()
    if not pos:
        print(__doc__); sys.exit(1)
    units = load_units(pos[0]); body = Body(units)
    res = {'rows': [], 'issues': [], 'notes': [], 'hedged_rows': 0, 'hedge_kept': 0, 'statutes_checked': 0, 'statute_mismatch': 0}
    n_cards = n_tf = 0
    # ---- 論点カード
    if arg('--cards'):
        cards = json.load(open(arg('--cards'), encoding='utf-8'))['cards']; n_cards = len(cards)
        for i, c in enumerate(cards, 1):
            sec = secno_of(c.get('section') or c.get('sec') or '')
            if not sec:
                res['issues'].append({'kind': '根拠の節がない', 'row': f'カード{i}', 'detail': f"「{c.get('issue', '')}」に section（根拠にした本文の節番号）を書く"})
            for fld, lab in (('norm', '規範'), ('reason', '理由'), ('apply', '当てはめ'), ('opening', '書き出し'), ('tf', '短答')):
                v = (c.get(fld) or '').strip()
                if not v or re.match(r'^→', v):
                    continue
                if fld == 'tf':
                    x = v.startswith('×'); v = TF_TAIL.sub('', TF_HEAD.sub('', v))
                    check_row(body, 'tf×' if x else 'card', f'カード{i}・{lab}', v, sec, v, res, hedge=not x)
                    continue
                for s in split_sents(v):
                    check_row(body, 'card', f'カード{i}・{lab}', s, sec, s if fld in ('norm', 'opening') else '', res)
    # ---- 短答式の命題
    if arg('--tf'):
        items = json.load(open(arg('--tf'), encoding='utf-8'))['items']; n_tf = len(items)
        for i, it in enumerate(items, 1):
            sec = secno_of(it.get('section') or '')
            if not sec:
                res['issues'].append({'kind': '根拠の節がない', 'row': f'短答{i}', 'detail': 'section（根拠にした本文の節番号）を書く'})
            x = it.get('a') == '×'
            check_row(body, 'tf×' if x else 'tf', f'短答{i}', it.get('q', ''), sec, it.get('basis', ''), res, hedge=not x)
    # ---- まとめ・全体像
    n_sum = 0
    for u in units:
        if u['layer'] in ('summary',) or (u['layer'] == 'zak' and '全体像' in u['section']):
            for s in split_sents(u['text']):
                n_sum += 1
                check_row(body, 'summary', f"{u['section'][:8]}・文{n_sum}", s, '', s, res)
    # ---- 索引
    n_index = 0; idx_iss = 0
    if arg('--index'):
        d = json.load(open(arg('--index'), encoding='utf-8')); rows = d.get('rows') or d.get('blocks', [[None, []]])[0][1]
        alltext = collections.defaultdict(str)
        for u in units:
            if u['layer'] in ('body', 'table', 'zak', 'fig'):
                alltext[u['section']] += u['text'] + '\n'
        for r in rows[1:]:
            for k in range(0, len(r) - 1, 2):
                term, labs = str(r[k]).strip(), str(r[k + 1])
                if not term:
                    continue
                n_index += 1
                hit = [sec for sec, t in alltext.items() if term in t]
                if not hit:
                    idx_iss += 1; res['issues'].append({'kind': '索引の語が本文にない', 'row': f'索引「{term}」', 'detail': labs[:30]}); continue
                for lab in re.split(r'[，、,]', re.sub(r'\s*ほか（.*$', '', labs)):
                    lab = lab.strip()
                    if not lab:
                        continue
                    m = re.match(r'^(発展)?(\d+(?:-\d+)+)?(\([^)]+\)|（[^）]+）)?', lab)
                    ok = False
                    for sec in hit:
                        if m and m.group(1) and '発展' in sec and (m.group(2) or '') in sec:
                            ok = True
                        elif m and not m.group(1) and m.group(3) and sec.startswith(m.group(3)):
                            ok = True
                        elif m and not m.group(1) and not m.group(3) and m.group(2) and sec.startswith(m.group(2)):
                            ok = True
                    if not ok:
                        idx_iss += 1; res['issues'].append({'kind': '索引の節に語が出ない', 'row': f'索引「{term}」', 'detail': f'節 {lab}'})
    by = collections.Counter(x['kind'] for x in res['issues'])
    res.update({'n_cards': n_cards, 'n_tf': n_tf, 'n_summary_sentences': n_sum, 'n_index_terms': n_index, 'n_rows': len(res['rows']),
                'hedge_preservation_pct': pct(res['hedge_kept'], res['hedged_rows']) if res['hedged_rows'] else 100.0,
                'issue_count': len(res['issues']), 'by_kind': dict(by), 'note_count': len(res['notes'])})
    if arg('--out'):
        dump(res, arg('--out'))
    for x in res['issues']:
        print(f"  所見［{x['kind']}］{x['row']}：{x['detail']}")
    if '-v' in sys.argv:
        for x in res['notes']:
            print(f"  注意［{x['kind']}］{x['row']}：{x['detail']}")
    print(f"派生物の行 {res['n_rows']}（カード {n_cards} 論点・短答 {n_tf} 問・まとめ等 {n_sum} 文・索引 {n_index} 語）／"
          f"該当箇所に留保のある行 {res['hedged_rows']}、うち留保が保たれた行 {res['hedge_kept']}（保存率 {res['hedge_preservation_pct']}%）／"
          f"条文の照合 {res['statutes_checked']}（不一致 {res['statute_mismatch']}）／所見 {res['issue_count']}・注意 {res['note_count']}")
    sys.exit(1 if res['issue_count'] and '--strict' in sys.argv else 0)

if __name__ == '__main__':
    main()
