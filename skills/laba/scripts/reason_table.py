#!/usr/bin/env python3
"""判例ごとの「理由の出所表」を作り、検査する（指標③ 判例理由の忠実度）。
usage:
  reason_table.py init  NOTE(.json|.py|.txt) --out reasons.json        ノート中の判例を拾い、雛形を作る（既存の reasons.json があれば追記）
  reason_table.py check reasons.json [--note NOTE] [--fulltext DIR] [--source SOURCE.txt] [--out reason_table.json]
  reason_table.py locate reasons.json --fulltext DIR [--write]           抜き書きが全文のどこにあるか（頁・段落の冒頭）を出す。--write で where の空欄に書き込む
  reason_table.py md    reasons.json [--out reasons.md]                  作業用の表（md）
  reason_table.py block reasons.json [--out reason_blocks.json]          ノートに載せる表のブロック（T）

reasons.json の1件の形（init が雛形を作る。人が埋めるのは ★）：
  {"key": "最判昭和43・3・15", "cite": "最判昭和43・3・15民集22巻3号607頁", "sections": ["(2) 第三者から…"],
   "note_reasons": ["（ノートがこの判例の近くに書いている理由の文。自動抽出）"],
 ★ "status": "判示を確認" | "判決は理由を述べていない" | "判決文未確認" | "判決文に当たれない",
 ★ "holding": "判決が挙げる理由（自分の言葉で要約。確かめたものだけ）",
 ★ "points": [{"text": "判決が挙げる理由の1点（ノートの欄に書く文と同じ内容）",
              "excerpt": "その1点に当たる判決文の抜き書き（125字以内。原文の表記のまま）",
              "where": "判決全文の該当箇所の控え。頁（「2頁」）か，段落の冒頭の語句（「「思うに、一個の物を」の段落」），または両方"}, …],
      holding の1文につき1点。①②③と番号を振ったら，番号ごとに1点。「判決は理由を述べていない」のときも，結論だけを述べた箇所を1点控える。
      （旧い形の "excerpt" だけの表は，where の控えがないので error になる）
 ★ "checked_against": "確かめた先（裁判所サイトの事件番号、全文の id など）",
 ★ "source_explanation": "資料（教科書等）がこの判例に付けている説明のうち、判決文にないもの",
 ★ "supplement": "ノートが足した説明（あれば）",
 ★ "relation": "対になる判例・緊張関係（あれば）"}

check が見ること：
  1. status が4種のどれかで、空でない
  2. 「判示を確認」なら excerpt と checked_against がある。excerpt は125字以内
  3. --fulltext DIR（case_lookup.py --save の出力）があれば、excerpt が全文の中に実在するか（空白・句読点・促音の表記の違いは無視）
  4. 「判決は理由を述べていない」なら holding が空で、source_explanation か supplement に理由の出所がある
  5. --note があれば、ノートが「判決が挙げる理由」「［判示］」「（判決）」として書いた理由が、status「判示を確認」の判例に限られているか
     また、status「判決は理由を述べていない」の判例の直後に「という理由である」「からである」が来て、出所の断りがない文がないか
  6. holding と source_explanation が同文（丸写し）でないか（出所を分けた意味がなくなる）
  7. 該当箇所の控え：「判示を確認」「判決は理由を述べていない」の判例に points があり，各点に excerpt と where がある。
     points の数が，holding の文の数（①②③があれば番号の数）に足りている。控えのない点は error（所見）
  8. --fulltext があれば：各点の excerpt が全文に実在する／where に書いた頁が実際の頁と合う／where の「…」の語句が全文にある
  9. 欄の文と判決文の照合（内容）：各点の text に出る術語（漢字2字以上の並び）が，その判決の全文にあるか。
     全文に無い術語が2語以上ある点は「欄の文が判決文の語でない」として所見にする（資料の言い方を写していないか読む）。
     --source を渡すと，全文に無い語が，前後3字を含めて資料にそのままあるかも見る。あれば1語でも所見にする
     （資料にあって判決文に無い言い回しは，資料の要約を写した疑いが強い）。
     所見が出たら，欄の文を判決文の語で書き直す。除外の一覧は置かない
 10. --note（blocks）があれば：ノートの表の「判決が挙げる理由」の欄と［判示］の札の文についても，9 と同じ照合をする（行の1列目かセル自身の書誌で判例を引く）
出す値：判例の数、status ごとの数、出所が確定した割合（＝未確認以外）、照合で実在した抜き書きの数。"""
import sys, os, json, glob, bisect
from laba_common import *
from laba_blocks import load_units

STATUS = ['判示を確認', '判決は理由を述べていない', '判決文未確認', '判決文に当たれない']
REASON_MARK = re.compile(r'(という理由である|を理由とする|からである|という点に求められ|ためである|と判示|と述べ|を挙げ)')
JUDG_TAG = re.compile(r'(［判示］|\[判示\]|（判決）|\(判決\)|判決が挙げる理由|判決は.{0,30}(とする|と述べ|と判示))')
DISCLAIM = re.compile(r'(理由を述べていない|理由を付していない|理由を付さ|特段の理由|資料の説明|教科書の説明|（資料）|［資料］|に求められている|と説明され|と解され)')

def squash(s):
    """照合用：空白・句読点・括弧を除き、旧い表記（つ／っ、かな遣い）の揺れを吸収する。"""
    s = norm(s)
    s = s.translate(str.maketrans('っゃゅょッャュョ', 'つやゆよツヤユヨ'))
    return re.sub(r'[ー‐―－\-「」『』]', '', s)

def init(note, out):
    units = load_units(note)
    old = {r['key']: r for r in json.load(open(out, encoding='utf-8'))['cases']} if os.path.exists(out) else {}
    rows, order = {}, []
    for u in units:
        if u['layer'] in ('head',):
            continue
        cs = find_cases(u['text'])
        if not cs:
            continue
        ss = sentences(u['text'], keep_heads=True) or [u['text']]
        for c in cs:
            k = c['key']
            if k not in rows:
                rows[k] = {'key': k, 'cite': '', 'sections': [], 'note_reasons': []}; order.append(k)
            r = rows[k]
            if c['cite'] and not r['cite']:
                r['cite'] = re.sub(r'^前掲', '', c['raw'])
            if u['section'] and u['section'] not in r['sections']:
                r['sections'].append(u['section'])
            if u['layer'] == 'body':
                for i, s in enumerate(ss):
                    if c['raw'] in s or c['date'] in s:
                        cand = [s] + ss[i + 1:i + 2]
                        for x in cand:
                            if REASON_MARK.search(x) and x not in r['note_reasons']:
                                r['note_reasons'].append(x[:260])
    cases = []
    for k in order:
        r = rows[k]
        o = old.get(k, {})
        for f in ('status', 'holding', 'checked_against', 'source_explanation', 'supplement', 'relation'):
            r[f] = o.get(f, '')
        r['points'] = o.get('points') or ([{'text': o.get('holding', ''), 'excerpt': o['excerpt'], 'where': o.get('where', '')}] if o.get('excerpt') else [{'text': '', 'excerpt': '', 'where': ''}])
        if not r['cite']:
            r['cite'] = o.get('cite', k)
        cases.append(r)
    dump({'cases': cases}, out)
    print(f'判例 {len(cases)} 件の雛形 -> {out}（既存 {len(old)} 件は引き継いだ）')
    for r in cases:
        if not r['status']:
            print('  未記入:', r['cite'])

PAGE_MARK = re.compile(r'(?:^|\n)[ \t　]*[-－‐] *\d+ *[-－‐][ \t　]*(?=\n|$)')
CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩'
REMARK = re.compile(r'（[^（）]*）|\([^()]*\)')
# 欄の文に出てよい，ノート側の言い回し（判決文に無くても数えない）
FRAME_WORDS = {'判決', '理由', '同旨', '趣旨', '独自', '踏襲', '言及', '前提', '結論', '判断', '同様', '本判決', '判例', '最判', '最決', '最大判', '昭和', '平成', '令和',
               '年判決', '確認', '請求', '場合', '必要', '以上', '双方', '各自', '全員', '単独', '当該', '関係', '部分', '事項', '内容', '問題'}

class FullText:
    """判決全文1件。頁の印（「- 1 -」）を除いた文と，照合用に潰した文，潰した文の各字が原文のどこか，を持つ。"""
    def __init__(self, raw):
        raw = raw.translate(Z2H)
        self.page_starts = []          # 頁の印を除いた文の中で，頁の印があった位置
        buf, last = [], 0
        ms = list(PAGE_MARK.finditer(raw))
        # 頁の印が頁の頭にある全文（冒頭が「- 1 -」）と，頁の末尾にある全文とがある
        self.mark_at_top = bool(ms) and not raw[:ms[0].start()].strip()
        for m in ms:
            buf.append(raw[last:m.start()]); last = m.end()
            self.page_starts.append(sum(len(x) for x in buf))
        buf.append(raw[last:]); self.text = ''.join(buf)
        sq, mp = [], []
        for i, ch in enumerate(self.text):
            c = squash(ch)
            if c:
                sq.append(c); mp.append(i)
        self.sq = ''.join(sq); self.map = mp
        # 段落の冒頭：行頭が空白で始まる行
        self.paras = [m.start() for m in re.finditer(r'(?:(?<=\n)|^)[　 ]+(?=[^　\s])', self.text)]

    def find(self, excerpt):
        ex = squash(excerpt)
        if not ex:
            return None
        i = self.sq.find(ex)
        if i < 0 and len(ex) >= 40:      # 前半・後半の各20字が同じ全文にあれば実在とみなす（従来どおり）
            a, b = self.sq.find(ex[:20]), self.sq.find(ex[-20:])
            i = a if (a >= 0 and b >= 0) else -1
        return self.map[i] if i >= 0 else None

    def page(self, pos):
        n = bisect.bisect_right(self.page_starts, pos)
        return max(1, n) if self.mark_at_top else n + 1

    def opening(self, pos, n=10):
        """pos を含む段落の冒頭の語句（字下げのない全文では，その文の冒頭）。返り値：(語句, '段落'|'文')"""
        k = bisect.bisect_right(self.paras, pos) - 1
        if k >= 0 and pos - self.paras[k] <= 1500:
            return re.sub(r'^[\s　]+', '', self.text[self.paras[k]:self.paras[k] + 60]).replace('\n', '')[:n], '段落'
        j = self.text.rfind('。', 0, pos)
        return re.sub(r'[\s　]+', '', self.text[j + 1:j + 60])[:n], '文'

    def has_phrase(self, phrase):
        return squash(phrase) in self.sq

def load_fulltexts(d):
    out = {}
    for p in glob.glob(os.path.join(d, '*.txt')):
        out[os.path.basename(p)] = FullText(open(p, encoding='utf-8').read())
    return out

def files_for(key, fts):
    """判例の鍵（裁判所＋年月日）の年月日を名前に含む全文ファイル。"""
    m = re.search(DATE, key)
    if not m:
        return []
    d = re.sub(r'[年月\.]', '・', m.group(0)); d = re.sub(r'日|\s', '', d)
    d1 = d.replace('元・', '1・')   # 保存名は「平成1・3・28」の形のことがある
    return [n for n in fts if n.startswith(d + '_') or n.startswith(d1 + '_')]

def locate_excerpt(key, excerpt, fts):
    """(ファイル名, FullText, 位置) か None。全文ファイルが無ければ 'nofile'。"""
    files = files_for(key, fts)
    if not files:
        return 'nofile'
    for n in files:
        pos = fts[n].find(excerpt)
        if pos is not None:
            return n, fts[n], pos
    return None

def points_of(r):
    """該当箇所の控え。points が無く，旧い形の excerpt だけがあるときは，where の無い1点として返す。"""
    if r.get('points'):
        return r['points']
    if r.get('excerpt'):
        return [{'text': r.get('holding', ''), 'excerpt': r['excerpt'], 'where': r.get('where', '')}]
    return []

def required_points(holding):
    """holding の文の数（①②③があれば番号の数）。括弧の中は数えない。"""
    h = REMARK.sub('', holding or '')
    n = 0
    for s in re.split(r'。', h):
        if s.strip():
            n += max(1, sum(s.count(c) for c in CIRCLED))
    return max(1, n)

def absent_terms(text, sq_full, sq_source=None):
    """text の術語（漢字2字以上の並び）のうち，全文に無いもの。括弧の中（ノート側の注記）は見ない。"""
    t = REMARK.sub('', text or '')
    out = []
    for w in re.findall(r'[一-鿿々]{2,}', t):
        if w in FRAME_WORDS or w in sq_full:
            continue
        if len(w) >= 4 and all(w[i:i + 2] in sq_full for i in range(len(w) - 1)):
            continue
        if w not in [x[0] for x in out]:
            # 資料の言い回しか：その語の前後3字を含めた並びが，資料にそのままあるか
            i = t.find(w); ctx = squash(t[max(0, i - 3):i + len(w) + 3])
            out.append((w, bool(sq_source and len(ctx) >= len(w) + 3 and ctx in sq_source)))
    return out

def wording_flag(ab):
    """所見にするか：全文に無い術語が2語以上，または，資料の言い回しと一致する語が1語でもある。"""
    return len(ab) >= 2 or any(s_ for _, s_ in ab)

def match_fulltext(row, fts):
    """row の年月日を名前に含む全文ファイルの中に、excerpt があるか。"""
    r = locate_excerpt(row['key'], row.get('excerpt', ''), fts)
    if r == 'nofile' or not squash(row.get('excerpt', '')):
        return None
    return r is not None

def check(path):
    cases = json.load(open(path, encoding='utf-8'))['cases']
    issues, by = [], {s: 0 for s in STATUS}
    fts = load_fulltexts(arg('--fulltext')) if arg('--fulltext') else {}
    sq_source = squash(read(arg('--source'))) if arg('--source') else None
    found = notfound = nofile = 0
    no_where = where_bad = n_points = 0; term_iss = []
    for r in cases:
        st = r.get('status', '')
        if st not in STATUS:
            issues.append(f"{r['cite']}：status が未記入（{' / '.join(STATUS)} のどれか）"); continue
        by[st] += 1
        if st == '判示を確認':
            if not r.get('holding'):
                issues.append(f"{r['cite']}：holding（判決が挙げる理由）が空")
            if not points_of(r) or not r.get('checked_against'):
                issues.append(f"{r['cite']}：「判示を確認」なのに excerpt（points）か checked_against が空")
            need = required_points(r.get('holding', ''))
            if r.get('points') and len(r['points']) < need:
                issues.append(f"{r['cite']}：holding は {need} 点（文・①②③の数）なのに，該当箇所の控え（points）が {len(r['points'])} 点しかない")
            if r.get('holding') and r.get('source_explanation') and squash(r['holding']) == squash(r['source_explanation']):
                issues.append(f"{r['cite']}：holding と source_explanation が同文（同じなら source_explanation は「判決の理由と同じ」と書く）")
        elif st == '判決は理由を述べていない':
            if r.get('holding'):
                issues.append(f"{r['cite']}：理由を述べていない判決なのに holding が書かれている")
            if not (r.get('source_explanation') or r.get('supplement')):
                issues.append(f"{r['cite']}：理由の出所（資料の説明か補足）が空。理由を書かないなら、そう分かるように")
            if not r.get('checked_against'):
                issues.append(f"{r['cite']}：「理由を述べていない」と言うには判決文を読んでいる必要がある（checked_against が空）")
            if not points_of(r):
                issues.append(f"{r['cite']}：結論だけを述べた箇所の抜き書き（points）が無い（「理由を述べていない」ことを確かめた箇所を控える）")
        else:
            if r.get('holding'):
                issues.append(f"{r['cite']}：判決文を確かめていないのに holding が書かれている（資料の説明は source_explanation へ）")
        # 該当箇所の控え（判決文を読んだ判例の全部の点について）
        if st in ('判示を確認', '判決は理由を述べていない'):
            for k, pt in enumerate(points_of(r), 1):
                n_points += 1
                tag = f"{r['cite']} の{k}点目"
                ex = (pt.get('excerpt') or '').strip(); wh = (pt.get('where') or '').strip()
                if not ex:
                    issues.append(f"{tag}：excerpt（判決文の抜き書き）が空"); continue
                if len(ex) > 125:
                    issues.append(f"{tag}：excerpt が {len(ex)} 字（125字以内の短い抜き書きに）")
                if not wh:
                    no_where += 1; issues.append(f"{tag}：判決全文の該当箇所の控え（where：頁か段落の冒頭）が無い")
                elif not re.search(r'\d+\s*頁|「[^」]{4,}」', wh):
                    where_bad += 1; issues.append(f"{tag}：where は頁（「2頁」）か段落の冒頭の語句（「…」）で書く｜{wh[:30]}")
                if not fts:
                    continue
                loc = locate_excerpt(r['key'], ex, fts)
                if loc == 'nofile':
                    nofile += 1; continue
                if loc is None:
                    notfound += 1; issues.append(f"{tag}：excerpt が全文の中に見つからない（抜き書きを原文どおりに）"); continue
                found += 1
                name, ft, pos = loc
                mp = re.search(r'(\d+)\s*頁', wh)
                if mp and ft.page_starts and int(mp.group(1)) != ft.page(pos):
                    where_bad += 1; issues.append(f"{tag}：where は {mp.group(1)}頁だが，抜き書きは全文の {ft.page(pos)}頁にある")
                for ph in re.findall(r'「([^」]{4,})」', wh):
                    if not ft.has_phrase(ph):
                        where_bad += 1; issues.append(f"{tag}：where の語句「{ph}」が全文に無い")
                if st == '判示を確認' and pt.get('text'):
                    ab = absent_terms(pt['text'], ft.sq, sq_source)
                    if wording_flag(ab):
                        term_iss.append({'case': r['cite'], 'where': f'reasons.json の{k}点目', 'text': pt['text'][:60],
                                         'absent': [w for w, _ in ab], 'in_source': [w for w, s_ in ab if s_]})
    # ノートとの突き合わせ
    note_iss = []
    if arg('--note'):
        units = load_units(arg('--note'))
        st_of = {r['key']: r.get('status', '') for r in cases}
        for u in units:
            if u['layer'] == 'head':
                continue
            cs = find_cases(u['text'])
            if not cs:
                continue
            if u['layer'] in ('table', 'card'):
                head = u.get('head', '')
                tagged = bool(JUDG_TAG.search(u['text'])) or head in ('判決が挙げる理由', '判決の理由', '判示')
                # 同じ行のセルは別単位なので、行の判例は caption/row で引けない。ここではセル自身に書誌がある場合だけ見る
                for c in cs:
                    if tagged and st_of.get(c['key']) and st_of[c['key']] != '判示を確認':
                        note_iss.append(f"表・カード：{c['raw']} の理由が判決の理由として書かれているが、status は「{st_of[c['key']]}」")
                continue
            ss = sentences(u['text'], keep_heads=True) or [u['text']]
            for i, s in enumerate(ss):
                for c in find_cases(s):
                    st = st_of.get(c['key'], '')
                    nxt = ' '.join(ss[i:i + 3])
                    if st == '判決は理由を述べていない' and REASON_MARK.search(nxt) and not DISCLAIM.search(nxt):
                        note_iss.append(f"{u['section'][:14]}：{c['raw']} は理由を述べていないのに、直後に理由文があり出所の断りがない｜{s[:40]}")
                    if st in ('判決文未確認', '判決文に当たれない') and JUDG_TAG.search(nxt) and not DISCLAIM.search(nxt):
                        note_iss.append(f"{u['section'][:14]}：{c['raw']} は判決文未確認なのに「判決は…」と書いている｜{s[:40]}")
                    if not st:
                        note_iss.append(f"{c['raw']}：reasons.json に無い（init をやり直す）")
    # ノートの表の「判決が挙げる理由」の欄・［判示］の札の文を，同じ行の判例の全文と照合する
    n_cells = 0
    if arg('--note') and fts and arg('--note').endswith(('.json', '.py')):
        from laba_blocks import load_blocks
        for b in load_blocks(arg('--note')):
            if b[0] not in ('T', 'KD') or len(b) < 2 or not isinstance(b[1], (list, tuple)) or not b[1]:
                continue
            head = [str(h) for h in b[1][0]]
            if '論点' in head[0] or any('問題の所在' in h for h in head):
                continue
            for row in b[1][1:]:
                row_cases = find_cases(str(row[0]))
                for j, c in enumerate(row):
                    c = str(c); h = head[j] if j < len(head) else ''
                    segs = []
                    if h in ('判決が挙げる理由', '判決の理由', '判示') and j > 0:
                        segs = [c]
                    elif '［判示］' in c or '[判示]' in c:
                        segs = [x for x in re.split(r'［資料］|［補足］|\[資料\]|\[補足\]', re.split(r'［判示］|\[判示\]', c, maxsplit=1)[1])[:1]]
                    for seg in segs:
                        if re.search(r'理由を述べていない|判決文に当たれない|確認していない|独自の理由は述べ', seg):
                            continue
                        cs = row_cases or find_cases(c)
                        names = [n_ for x in cs for n_ in files_for(x['key'], fts)]
                        if not names:
                            continue
                        n_cells += 1
                        sq_all = ''.join(fts[n_].sq for n_ in names)
                        for part in re.split(r'(?=[' + CIRCLED + r'])|。', seg):
                            if len(part.strip()) < 8:
                                continue
                            ab = absent_terms(part, sq_all, sq_source)
                            if wording_flag(ab):
                                term_iss.append({'case': '・'.join(x['raw'] for x in cs)[:60], 'where': 'ノートの表（' + (str(b[2])[:12] if len(b) > 2 else '') + '）',
                                                 'text': part.strip()[:60], 'absent': [w for w, _ in ab], 'in_source': [w for w, s_ in ab if s_]})
    for t in term_iss:
        issues.append(f"{t['case']}（{t['where']}）：欄の文が判決文の語でない。全文に無い語 {'・'.join(t['absent'])}"
                      + (f"（うち資料の言い回しと一致 {'・'.join(t['in_source'])}）" if t['in_source'] else '') + f"｜{t['text'][:40]}")
    n = len(cases); settled = n - by['判決文未確認']
    res = {'n_cases': n, 'by_status': by, 'settled_pct': pct(settled, n), 'excerpt_found': found, 'excerpt_not_found': notfound,
           'excerpt_no_fulltext': nofile, 'points': n_points, 'points_without_where': no_where, 'where_mismatch': where_bad,
           'cells_checked': n_cells, 'wording_issues': term_iss,
           'issue_count': len(issues) + len(note_iss), 'issues': issues, 'note_issues': sorted(set(note_iss))}
    if arg('--out'):
        dump(res, arg('--out'))
    for x in issues + res['note_issues']:
        print('  所見:', x)
    print(f"判例 {n}／" + '・'.join(f'{k} {v}' for k, v in by.items()) + f"／出所が確定 {res['settled_pct']}%／該当箇所の控え {n_points} 点（where なし {no_where}・頁や語句の不一致 {where_bad}）／抜き書きの実在 {found}（不一致 {notfound}・全文なし {nofile}）／欄の文が判決文の語でない {len(term_iss)}／所見 {res['issue_count']}")
    return res

def locate(path):
    """各点の抜き書きが全文のどこにあるか（頁・段落の冒頭）を出す。--write で，where が空の点に書き込む。
    控えは，抜き書きを人が選んだうえで，その場所を機械が記すものである。抜き書きが全文に無い点には書き込まない。"""
    d = json.load(open(path, encoding='utf-8')); fts = load_fulltexts(arg('--fulltext')); wrote = 0
    for r in d['cases']:
        for k, pt in enumerate(points_of(r), 1):
            loc = locate_excerpt(r['key'], pt.get('excerpt', ''), fts)
            if loc in (None, 'nofile'):
                print(f"  {r['cite']} {k}点目：{'全文ファイルが無い' if loc == 'nofile' else '抜き書きが全文に無い'}"); continue
            name, ft, pos = loc
            op, kind = ft.opening(pos)
            wh = (f"{ft.page(pos)}頁・" if ft.page_starts else '') + (f"「{op}」の段落" if kind == '段落' else f"「{op}」で始まる文")
            print(f"  {r['cite']} {k}点目：{wh}（{name}）")
            if '--write' in sys.argv and r.get('points') and not (pt.get('where') or '').strip():
                pt['where'] = wh; wrote += 1
    if '--write' in sys.argv:
        dump(d, path); print(f'where を {wrote} 点に書き込んだ -> {path}')

def to_md(path):
    cases = json.load(open(path, encoding='utf-8'))['cases']
    L = ['| 判例 | 状態 | 判決が挙げる理由 | 判決文の抜き書き〔該当箇所〕 | 資料の説明（判決文にないもの） | 補足 | 対になる判例 | 確かめた先 |', '|---|---|---|---|---|---|---|---|']
    for r in cases:
        g = lambda k: (r.get(k) or '—').replace('|', '／').replace('\n', ' ')
        hold = '判決は理由を述べていない' if r.get('status') == '判決は理由を述べていない' else g('holding')
        ex = ' ／ '.join(f"{(p.get('excerpt') or '').replace('|', '／')}〔{p.get('where') or '控えなし'}〕" for p in points_of(r)) or '—'
        L.append(f"| {g('cite')} | {g('status')} | {hold} | {ex} | {g('source_explanation')} | {g('supplement')} | {g('relation')} | {g('checked_against')} |")
    s = '\n'.join(L)
    if arg('--out'):
        open(arg('--out'), 'w', encoding='utf-8').write('# 判例の理由の出所表（作業用）\n\n' + s + '\n')
    print(s if not arg('--out') else f"-> {arg('--out')}")

def to_block(path):
    cases = json.load(open(path, encoding='utf-8'))['cases']
    rows = [['判例', '判決が挙げる理由', '資料の説明・補足']]
    for r in cases:
        st = r.get('status', '')
        hold = {'判示を確認': r.get('holding', ''), '判決は理由を述べていない': '判決は理由を述べていない',
                '判決文未確認': '判決文は確認していない', '判決文に当たれない': '判決文に当たれない（大審院等）'}.get(st, '')
        ex = r.get('source_explanation', '') or ''
        if r.get('supplement'):
            ex += ('\n' if ex else '') + '（補足）' + r['supplement']
        rows.append([r['cite'], hold, ex or '判決の理由と同じ内容'])
    blk = {'blocks': [['T', rows, '判例の理由の出所（判決が挙げる理由は，判決文で確かめたものに限る）', [44, 62, 54]]]}
    out = arg('--out', 'reason_blocks.json'); dump(blk, out); print('->', out)

def main():
    pos = positional()
    if len(pos) < 2:
        print(__doc__); sys.exit(1)
    cmd, path = pos[0], pos[1]
    if cmd == 'init':
        init(path, arg('--out', 'reasons.json'))
    elif cmd == 'check':
        r = check(path); sys.exit(1 if r['issue_count'] and '--strict' in sys.argv else 0)
    elif cmd == 'locate':
        locate(path)
    elif cmd == 'md':
        to_md(path)
    elif cmd == 'block':
        to_block(path)
    else:
        print(__doc__); sys.exit(1)

if __name__ == '__main__':
    main()
