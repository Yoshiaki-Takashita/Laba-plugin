#!/usr/bin/env python3
"""講義ノートから、復習用スライドの構成（build_deck.js の入力）の下書きを作る。
usage: note_to_deck.py NOTE OUT_SPEC.json [--theme mono|teal] [--max-points 4] [--budget 30]
                       [--only 節番号か見出しの先頭] [--with-advanced] [--tf TF_ITEMS.json] [--hide-answers]
NOTE に渡せるもの
  .json  build_docx.py の入力（{"meta":…, "blocks":[[種別, 本文, …], …]}）。いちばん正確
  .py    META と DOC を定義した Python ファイル
  .docx  出来上がったノート（Word）。段落の書式と番号で見出しを見分け、表はそのまま読む（python-docx が要る）
  .txt   ノートの全文テキスト（build_docx.py --text-out の出力、または貼り付けたテキスト）。番号つきの行を見出しとみる。
         表は「 | 」区切りの行だけ読める。空白区切りの表らしい行は飛ばして知らせる
対応（references/slides/07-from-note.md）
  H  章見出し            → 大項目（type: section）。扉スライドは作らない
  S/SS 節・小見出し       → 次に作るスライドの見出し（ノートの番号「12-3-1」はそのまま使う。ノートに番号がなければ通し番号を振る）
  ZH／「ざっくり理解」で始まる C・SS／「ざっくり」「全体像」を含む H ＋ Z/ZB/ZN
                         → zakkuri（場面／何が困るのか／そこで／ひとことで）。「困るのは」「そこで」「ひとこと」の語で振り分ける
  P/B/N 本文             → points。1つの見出しにつき1枚、段落の要の1文を --max-points 件まで（残りは _dropped に数を書く）
                            「第2は，上訴である」のような前置きだけの文は拾わず、「上訴：次の文」の形にする。
                            「前述の」「（⇨…）」「（表1）」「（補足）…」のような、ノートの中だけで通じる語は外す
  「発展」で始まる小見出し → 飛ばす（--with-advanced で入れる）
  T  表                  → 見出し行で振り分ける（1セルが120字を超える「文章の表」は飛ばす）
                            論点・問題の所在・規範 … → ronten_card（1行1枚）
                            命題・正誤 …             → tf_check（3問で1枚）
                            出てくる節／短答・論述 … → 飛ばす（ノートで見る表）
                            そのほか                 → compare_table（4列・6行・1セル40字を超えたら _todo）
  K  結論・答え          → conclusion
  KD 論点カード          → ronten_card
  C ＋ P2（事案：／判断：）→ case_ref　　／　P2 を伴わない C は小見出しとして扱う
  F  図                  → 図題の語で型を選ぶ（図は貼らない。図形で描き直す）。図題の「この図で分かること」を key に入れる
                            比較・対比・違い・整理・見比べ・左右 → compare_table の雛形　／　流れ・手続・順 → instance_flow の雛形
                            場合分け・分かれる・振り分け → branch の雛形　／　期間・時効・いつまで → time_axis の雛形　／　そのほか → relation の雛形
  見出し                 → 長い見出し（全角22字超）は、親の見出しと重なる部分を外して短くする（「12-3-4-1　同時審判申出共同訴訟の意義」→「12-3-4-1　意義」。
                            親の見出しは右上の大項目名に出す）
  --tf                   → {"items":[{"q","a","basis","why"}]} を tf_check の枚として末尾に足す
下書きには "_todo" を付ける。_todo を片づけ（文字を削る、図を図形に直す）、枚数を --budget 以内に絞ってから build_deck.js に掛ける。
_todo や仮の文字が残ったままでは、build_deck.js は止まる（下書きを見るだけなら --draft）。"""
import sys, os, json, re
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

LIMIT = 68          # 要点1件の上限（全角。2行分）
HEAD_MAX = 22       # 見出しの上限（全角）
NUMBERED = re.compile(r'^(\d+(-\d+)+|[（(][0-9a-zA-Z０-９]+[)）])')
CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'


def plain(t):
    return re.sub(r'\*\*', '', str(t)).strip()


def first_sentence(t):
    t = plain(t)
    m = re.match(r'(.+?[。．])', t)
    return (m.group(1) if m else t).rstrip('。．')


# ノートの中だけで通じる語（スライドに持ち込まない）
CROSSREF = re.compile(r'（[^（）]*(?:⇨|→本ノート|本ノート|表[0-9０-９]+|図[0-9０-９]+|[0-9]+(?:-[0-9]+)+)[^（）]*）|⇨[^，、。）]*|（補足）[^。]*。?|\([0-9]+(?:-[0-9]+)+\)')
ENUM_ONLY = re.compile(r'^第[0-9０-９一二三四五六七八九十]+(?:は|に)[，、]?(.{1,14}?)(?:である|です|がある|があります)?$')
LEADIN = re.compile(r'^(?:前述の|上記の|上述の|先に見た|以上の|この|これらの)?(?:設例|例)において[，、]|^前述の|^上記の|^上述の|^すなわち[，、]|^つまり[，、]'
    r'|^以上のとおり[，、]?|^以上から[，、]|^以上より[，、]|^このように[，、]|^そうすると[，、]|^もっとも[，、]|^なお[，、]|^この点[，、]')
# 要点にしない文（つなぎ・予告・評価の紹介だけで、中身がない）。段落の中に別の文があれば、そちらを要点にする
META = re.compile(r'(?:問題(?:点)?も指摘されている|指摘されている|が考えられる|応答が考えられる|議論がある|見解もある|検討する|検討しよう|見ていく|見ていこう|述べる|確認しておく|整理しておく)$')


def tidy(t):
    t = CROSSREF.sub('', plain(t))
    t = LEADIN.sub('', t)
    return re.sub(r'[　 ]{2,}', ' ', t).strip('，、 ')


def key_sentence(par):
    """段落から、要点にする1文を選ぶ。前置きだけの文（「第2は，上訴である」）は見出し語にして次の文とつなぐ"""
    sents = [x.strip() for x in re.split(r'(?<=[。．])', tidy(par)) if x.strip()]
    if not sents: return ''
    body = [x for x in sents if not META.search(x.rstrip('。．'))]
    if body and len(body) < len(sents): sents = body
    s0 = sents[0].rstrip('。．')
    m = ENUM_ONLY.match(s0)
    if m and len(sents) > 1:
        topic = m.group(1).rstrip('のこと')
        nxt = re.sub(r'^(たとえば|例えば)[，、]', '', sents[1]).rstrip('。．')
        return f'{topic}：{nxt}'
    if len(s0) < 10 and len(sents) > 1: return (s0 + '。' + sents[1]).rstrip('。．')
    return s0


FIG_KIND = [(re.compile('比較|対比|違い|整理|一覧|対応|見比べ|左右|並べ'), 'compare_table'), (re.compile('流れ|手続|順|経過'), 'instance_flow'),
            (re.compile('場合分け|分かれる|振り分け|分岐|しだいで'), 'branch'), (re.compile('期間|時効|いつまで|起算'), 'time_axis')]


def blocks_from_text(text):
    """全文テキスト → ブロックの列。番号つきの行を見出し、「ざっくり理解：」を ZH、「図n」を F、「 | 」区切りを表とみる"""
    B = []; rows = []; zak = False; skipped_rows = 0
    def flush_rows():
        nonlocal rows
        if rows: B.append(['T', rows]); rows = []
    for raw in text.split('\n'):
        s = raw.strip()
        if not s: continue
        if ' | ' in s:
            rows.append([c.strip() for c in s.split(' | ')]); continue
        flush_rows()
        m = re.match(r'^(\d+(?:-\d+)*)[　 ]+(\S.*)$', s)
        if m and len(s) <= 40 and not s.endswith('。') and ('-' in m.group(1) or len(m.group(2)) <= 20):
            depth = m.group(1).count('-')
            B.append(['H' if depth == 0 else 'S' if depth == 1 else 'SS', s]); zak = False; continue
        if re.match(r'^ざっくり理解[：:]', s) or (s.startswith('ざっくり理解') and len(s) <= 30):
            B.append(['ZH', s]); zak = True; continue
        if re.match(r'^(発展|コラム|補論)[：:]', s) and len(s) <= 50:
            B.append(['SS', s]); zak = False; continue
        if re.match(r'^図\s*[0-9０-９]+', s):
            B.append(['F', '', s]); continue
        if re.match(r'^[（(][0-9a-zA-Z０-９一二三四五]+[)）][　 ]*\S', s) and len(s) <= 30 and not s.endswith('。'):
            B.append(['C', s]); zak = False; continue
        if re.match(r'^(結論|答え)[　 ：:]', s):
            B.append(['K', s]); continue
        if '。' not in s and len(s) <= 160 and len(re.split(r'[ 　]+', s)) >= 3:
            skipped_rows += 1; continue        # 空白区切りの表らしい行（復元できない）
        if zak and re.search(r'(です|ます|でしょうか|ません|でした|ました)[。（）」]', s + '。'):
            B.append(['Z', s]); continue
        zak = False
        B.append(['P', s])
    flush_rows()
    return B, skipped_rows


def blocks_from_docx(path):
    """Word のノート → ブロックの列。番号つきの短い段落を見出し、表を T、「図n」で始まる段落を F とみる"""
    from docx import Document
    from docx.table import Table
    from docx.text.paragraph import Paragraph
    d = Document(path); lines = []; tables = {}
    for el in d.element.body.iterchildren():
        tag = el.tag.split('}')[1]
        if tag == 'p':
            t = Paragraph(el, d).text.strip()
            if t: lines.append(t)
        elif tag == 'tbl':
            tb = Table(el, d); key = f'\x00TABLE{len(tables)}\x00'
            tables[key] = [[c.text.strip() for c in r.cells] for r in tb.rows]; lines.append(key)
    B, skipped = blocks_from_text('\n'.join(l for l in lines if not l.startswith('\x00')) if not tables else '\n'.join(lines))
    out = []
    for b in B:
        if b[0] == 'P' and b[1] in tables: out.append(['T', tables[b[1]]])
        else: out.append(b)
    # 表の直後・直前の「表n　…」の段落は表題
    for i, b in enumerate(out):
        if b[0] == 'T' and len(b) == 2:
            for j in (i + 1, i - 1):
                if 0 <= j < len(out) and out[j][0] == 'P' and re.match(r'^表\s*[0-9０-９]+', out[j][1]): b.append(out[j][1]); out[j] = ['PB']; break
    return out, skipped


def load_note(path):
    """戻り値：(meta, blocks, 知らせること)"""
    ext = os.path.splitext(path)[1].lower()
    if ext == '.json':
        d = json.load(open(path, encoding='utf-8'))
        return (d.get('meta', {}) if isinstance(d, dict) else {}), (d['blocks'] if isinstance(d, dict) else d), []
    if ext == '.py':
        from laba_blocks import load_blocks
        return {}, load_blocks(path), []
    if ext == '.docx':
        b, sk = blocks_from_docx(path)
        return {}, b, ([f'表らしい行 {sk} 行を飛ばした'] if sk else [])
    text = open(path, encoding='utf-8').read()
    b, sk = blocks_from_text(text)
    return {}, b, ([f'空白区切りの表らしい行 {sk} 行を飛ばした（テキストからは表を復元できない。表も起こすなら、ブロックの JSON か .docx を渡す）'] if sk else [])


def is_zak(t):
    return plain(t).startswith('ざっくり理解') or plain(t).startswith('ざっくり')


def main():
    argv = sys.argv[1:]
    valued = ('--theme', '--max-points', '--budget', '--only', '--tf')
    opt = {}; args = []; i = 0
    while i < len(argv):
        a = argv[i]
        if a in valued and i + 1 < len(argv): opt[a] = argv[i + 1]; i += 2
        elif a.startswith('--'): opt[a] = True; i += 1
        else: args.append(a); i += 1
    if len(args) < 2:
        print(__doc__); sys.exit(2)
    theme = opt.get('--theme', 'mono'); maxp = int(opt.get('--max-points', 4)); budget = int(opt.get('--budget', 30))
    only = opt.get('--only'); adv = '--with-advanced' in opt; show = '--hide-answers' not in opt
    meta, blocks, input_notes = load_note(args[0])
    title = meta.get('title') or next((plain(b[1]) for b in blocks if b[0] == 'H' and not re.search('ざっくり|全体像', b[1])), '')
    if only and re.match(r'^[\d-]+$', only or ''):   # 節を絞ったときは、その節の題を表紙に出す
        title = next((plain(b[1]) for b in blocks if b[0] in ('H', 'S', 'SS') and plain(b[1]).startswith(only + '　') or plain(b[1]).startswith(only + ' ')), title)
    if not title: title = os.path.splitext(os.path.basename(args[0]))[0]
    slides = [{'type': 'cover', 'kind': '復習スライド', 'theme': f"〜{title}〜", 'info': [x for x in [meta.get('course', ''), meta.get('subtitle', '')] if x]}]
    seq = 0; heading = None; pbuf = []; zak = None; case = None; pendC = None
    skipping = False; in_scope = not only; skipped = []

    own = any(b[0] in ('H', 'S', 'SS') and NUMBERED.match(plain(b[1])) for b in blocks)   # ノートが自前の番号を持つか

    def num(h):
        """ノートの番号つき見出しはそのまま。ノートに番号がなければ通し番号を振る（番号は push のときに決める）"""
        h = plain(h or title or '要点')
        if NUMBERED.match(h): return re.sub(r'[　 ]+', '　', h, count=1)
        if own: return h
        return '\x00' + re.sub(r'^[０-９0-9一二三四五六七八九十]+[．.、][　 ]*', '', h)

    def push(sl):
        nonlocal seq
        if not (in_scope and not skipping): return
        if sl.get('heading', '').startswith('\x00'):
            seq += 1; sl['heading'] = f"{seq}. {sl['heading'][1:]}"
        slides.append(sl)

    def flush_points():
        nonlocal pbuf
        if not pbuf: return
        pts = [x for x in (key_sentence(p) for p in pbuf) if len(x) >= 8]
        if not pts: pbuf = []; return
        sl = {'type': 'points', 'heading': num(heading), 'points': pts[:maxp]}
        todo = []
        if len(pts) > maxp: sl['_dropped'] = len(pts) - maxp; todo.append(f'段落 {len(pts)} 件のうち先頭 {maxp} 件だけを拾った。要点を選び直す')
        long = [p for p in sl['points'] if len(p) > LIMIT]
        if long: todo.append(f'要点が長い（{len(long)}件）。1点2行（全角{LIMIT}字）以内に削る')
        if todo: sl['_todo'] = '／'.join(todo)
        push(sl); pbuf = []

    def flush_zak():
        nonlocal zak
        if not zak: return
        body = [tidy(x) for x in zak['body']]; bullets = [tidy(x) for x in zak['bullets']]
        sl = {'type': 'zakkuri', 'heading': num(re.sub(r'^ざっくり理解[：:　 ]*', '', zak['title']) or 'ざっくり理解')}
        one = []; trouble = []; so = []; scene = []
        for t in body:
            m = re.search(r'ひとこと(?:でまとめると|で言うと|で)?[，、：:　 ]*(.+)$', t)
            if m:
                one.append(m.group(1).rstrip('。'))
                t = t[:m.start()].strip()
                if not t: continue
            if re.match(r'^(困るのは|何が困る|問題は)', t): trouble.append(re.sub(r'^困るのは[，、]?', '', first_sentence(t)))
            elif re.match(r'^(そこで|そのため|これに対し)', t): so.append(re.sub(r'^そこで[，、]?', '', first_sentence(t)))
            elif not scene: scene.append(first_sentence(t))
            elif not so: so.append(first_sentence(t))
        trouble += [first_sentence(b) for b in bullets[:3]]
        if scene: sl['scene'] = scene[:1]
        if trouble: sl['trouble'] = trouble[:3]
        if so: sl['so'] = so[:1]
        if one: sl['oneLine'] = one[:1]
        long = [t for k in ('scene', 'trouble', 'so', 'oneLine') for t in sl.get(k, []) if len(t) > LIMIT]
        if long: sl['_todo'] = f'文が長い（{len(long)}件）。各欄2行（全角{LIMIT}字）以内に削る'
        push(sl); zak = None

    def flush_case():
        nonlocal case
        if not case: return
        push({'type': 'case_ref', 'heading': num('参考判例'), 'name': re.sub(r'^参考判例[①-⑳0-9]*[　 ]*', '', case['name']), 'facts': case.get('facts', '（事案を1行で）'), 'holding': case.get('holding', '（判断を1行で）'), '_todo': '本件・設例との関係（relation）を1行で足す'})
        case = None

    stack = {}     # 番号 → 題（親の見出しを引くため）
    cur_section = ''

    def set_heading(t, level):
        nonlocal heading, skipping, in_scope, cur_section
        flush_points(); heading = plain(t)
        mnum = re.match(r'^(\d+(?:-\d+)*)[　 ]+(.+)$', heading)
        if mnum:
            no, title = mnum.group(1), mnum.group(2); stack[no] = title
            if only and re.match(r'^[\d-]+$', only): in_scope = (no == only or no.startswith(only + '-'))
            elif only and level in ('H', 'S'): in_scope = heading.startswith(only)
            # 長い見出しは、親の題と重なる部分を外す。親の題は右上の大項目名に出す
            parent = no.rsplit('-', 1)[0] if '-' in no else None
            if parent and parent in stack:
                pt = stack[parent]
                if len(heading) > HEAD_MAX - 2 and title.startswith(pt) and len(title) > len(pt) + 1:   # ①②を付ける余地を見込む
                    heading = f"{no}　{re.sub('^の', '', title[len(pt):])}"
                if no.count('-') >= 2 and in_scope:
                    name = f'{parent}　{pt}'
                    if name != cur_section: cur_section = name; push({'type': 'section', 'name': name})
        elif only and level in ('H', 'S') and not re.match(r'^[\d-]+$', only):
            in_scope = heading.startswith(only) or (in_scope and level == 'S')
        if level in ('H', 'S'): skipping = False
        if level in ('SS', 'C'): skipping = (not adv) and heading.startswith('発展')
        elif mnum: skipping = False
        if skipping and in_scope: skipped.append(heading)

    def table(b):
        rows = b[1]
        if not rows: return
        head = [plain(c) for c in rows[0]]; hs = ' '.join(head); cap = plain(b[2]) if len(b) > 2 and b[2] else ''
        if '論点' in hs and '問題の所在' in hs and '規範' in hs:
            ix = lambda key, dflt: next((i for i, c in enumerate(head) if key in c), dflt)
            for r in rows[1:]:
                push({'type': 'ronten_card', 'heading': num('論点カード'), 'issue': re.sub(r'^\d+[　 ]*', '', plain(r[ix('論点', 0)])), 'problem': plain(r[ix('問題の所在', 1)]), 'norm': plain(r[ix('規範', 2)]), 'reason': plain(r[ix('理由', 3)]), 'application': plain(r[ix('当てはめ', 4)]),
                      '_todo': '各欄を2行以内に削る（ノートの文のままでは長い）'})
            return
        if '命題' in hs and '正誤' in hs:
            iq = next(i for i, c in enumerate(head) if '命題' in c); ia = next(i for i, c in enumerate(head) if '正誤' in c)
            ib = next((i for i, c in enumerate(head) if '根拠' in c or '誤り' in c), None)
            tf_slides([{'q': plain(r[iq]), 'a': plain(r[ia]), 'basis': plain(r[ib]) if ib is not None else ''} for r in rows[1:]])
            return
        if re.search('出てくる節|短答|論述での書き出し', hs) or re.search('索引|さくいん', cap):
            if in_scope: skipped.append(f'表（{cap or hs[:20]}）')
            return
        mx = max(len(plain(c)) for r in rows for c in r)
        if mx > 120:
            if in_scope and not skipping: skipped.append(f'文章の表（{cap or hs[:20]}。1セル最大{mx}字。スライドにするなら要点に直す）')
            return
        sl = {'type': 'compare_table', 'heading': num(re.sub(r'^表[0-9０-９]+[　 ]*', '', cap).split('：')[0].split('（')[0] if cap else (heading or '比較')), 'rows': [[plain(c) for c in r] for r in rows]}
        if len(b) > 3 and b[3]: sl['colW'] = b[3]
        todo = []
        if len(rows) > 6 or len(rows[0]) > 4: todo.append(f'表が大きい（{len(rows)}行・{len(rows[0])}列。6行・4列まで）。列と行を絞るか2枚に分ける')
        if mx > 40: todo.append(f'セルの文が長い（最大{mx}字。1セル40字まで）。語句に削る')
        if todo: sl['_todo'] = '／'.join(todo)
        push(sl)

    def tf_slides(items):
        for i in range(0, len(items), 3):
            chunk = items[i:i + 3]
            its = []
            for j, it in enumerate(chunk):
                e = {'no': f'{i + j + 1}', 'statement': it['q'], 'answer': '×' if re.match(r'^[×✕xX]', it.get('a', '')) else '○'}
                basis = [x for x in [it.get('basis', ''), it.get('why', '')] if x]
                if basis: e['basis'] = basis[:2]
                its.append(e)
            sl = {'type': 'tf_check', 'heading': num('確認（正誤）'), 'items': its}
            if not show: sl['answers'] = False
            long = [e for e in its if len(e['statement']) > 60 or any(len(x) > 60 for x in e.get('basis', []))]
            if long: sl['_todo'] = f'命題か根拠が長い（{len(long)}件）。命題は2行（全角60字）、根拠は1行に削る'
            push(sl)

    n_blocks = len(blocks)
    for bi, b in enumerate(blocks):
        k = b[0]; nxt = blocks[bi + 1][0] if bi + 1 < n_blocks else None
        if zak and k not in ('Z', 'ZB', 'ZN'): flush_zak()
        if case and k != 'P2': flush_case()
        if k == 'H':
            set_heading(b[1], 'H')
            if re.search('ざっくり|全体像', b[1]) and nxt == 'Z': zak = {'title': plain(b[1]), 'body': [], 'bullets': []}
            else: push({'type': 'section', 'name': plain(b[1])})
        elif k == 'S': set_heading(b[1], 'S')
        elif k in ('SS', 'C', 'ZH'):
            if k == 'ZH' or (is_zak(b[1]) and nxt in ('Z', 'ZB', 'ZN')):
                flush_points(); zak = {'title': plain(b[1]), 'body': [], 'bullets': []}
            elif k == 'C' and nxt == 'P2':
                flush_points(); case = {'name': plain(b[1])}
            else: set_heading(b[1], k)
        elif k == 'Z' and zak: zak['body'].append(b[1])
        elif k in ('ZB', 'ZN') and zak: zak['bullets'].append(b[1])
        elif k in ('P', 'B', 'N', 'Z'): pbuf.append(b[1])
        elif k == 'P2':
            if case:
                lab, _, body = plain(b[1]).partition('：')
                if '事案' in lab: case['facts'] = first_sentence(body)
                elif '判断' in lab or '判旨' in lab: case['holding'] = first_sentence(body)
            else: pbuf.append(b[1])
        elif k == 'T': flush_points(); table(b)
        elif k == 'K':
            flush_points(); t = re.sub(r'^(結論|答え)[　 ：:]*', '', plain(b[1]))
            sents = [s for s in re.split(r'(?<=[。．])', t) if s.strip()]
            push({'type': 'conclusion', 'heading': num('結論'), 'lines': [sents[0].rstrip('。')], **({'reasons': [s.rstrip('。') for s in sents[1:3]]} if len(sents) > 1 else {})})
        elif k == 'KD':
            flush_points()
            for r in b[1]:
                push({'type': 'ronten_card', 'heading': num('論点カード'), 'issue': plain(r[0]), 'problem': plain(r[1]), 'norm': plain(r[2]), 'reason': plain(r[3]), 'application': plain(r[4])})
        elif k == 'F':
            flush_points(); cap = plain(b[2]) if len(b) > 2 else ''
            m = re.search(r'この図で分かること[：:](.+?[。．])', cap + ('' if cap.endswith(('。', '．')) else '。'))
            kind = next((kd for rx, kd in FIG_KIND if rx.search(cap)), 'relation')
            src = f'ノートの図（{b[1] or cap[:12]}）'
            h = num(heading or '図')
            if kind == 'compare_table':
                sl = {'type': 'compare_table', 'heading': h, 'rows': [['（比べる観点）', '（一方）', '（他方）'], ['（観点1）', '（…を書く）', '（…を書く）'], ['（観点2）', '（…を書く）', '（…を書く）']],
                      '_todo': f'{src}は比較の図。貼らずに、比べる観点を行、比べる対象を列にした表に直す（6行・4列まで）'}
            elif kind == 'instance_flow':
                sl = {'type': 'instance_flow', 'heading': h, 'items': [{'head': '（段階1）', 'lines': ['（…を書く）']}, {'head': '（段階2）', 'lines': ['（…を書く）']}, {'head': '（段階3）', 'lines': ['（…を書く）'], 'accent': True}],
                      '_todo': f'{src}は流れの図。貼らずに、横に並ぶ箱（3〜4個）に直す'}
            elif kind == 'branch':
                sl = {'type': 'branch', 'heading': h, 'questions': [{'q': '（1つ目の問いを書く）', 'yes': {'title': '（結論）', 'lines': ['（…を書く）']}}, {'q': '（2つ目の問いを書く）', 'yes': {'title': '（結論）', 'lines': ['（…を書く）']}, 'no': {'title': '（結論）', 'lines': ['（…を書く）'], 'accent': True}}],
                      '_todo': f'{src}は場合分けの図。貼らずに、問いを上から順に並べる型（branch）に直す'}
            elif kind == 'time_axis':
                sl = {'type': 'time_axis', 'heading': h, 'events': [{'id': 'a', 'when': '（いつ）', 'label': '（出来事）'}, {'id': 'b', 'when': '（いつ）', 'label': '（出来事）', 'accent': True}], 'spans': [{'from': 'a', 'to': 'b', 'label': '（期間）'}],
                      '_todo': f'{src}は期間の図。貼らずに、時間軸（time_axis）に直す'}
            else:
                sl = {'type': 'relation', 'heading': h,
                      '_todo': f'{src}を貼らずに、図形で描き直す。当事者（actors）と関係（relations）を書く（references/slides/03-diagram-on-slide.md）',
                      'diagram': {'actors': [{'id': 'A', 'kind': 'person', 'symbol': 'A', 'role': '（役割）', 'col': 0, 'row': 0}, {'id': 'B', 'kind': 'person', 'symbol': 'B', 'role': '（役割）', 'col': 1, 'row': 0}], 'relations': [{'from': 'A', 'to': 'B', 'label': '（関係）'}]}}
            if m: sl['key'] = [tidy(m.group(1)).rstrip('。．')]
            push(sl)
        # PB（改頁）ほかは無視する
    flush_zak(); flush_case(); flush_points()
    if opt.get('--tf'):
        in_scope = True; skipping = False
        tfd = json.load(open(opt['--tf'], encoding='utf-8'))
        slides.append({'type': 'section', 'name': '確認'})
        tf_slides(tfd['items'] if isinstance(tfd, dict) else tfd)
    # 中身のない大項目を落とす
    out_slides = []
    for i, s in enumerate(slides):
        if s['type'] == 'section' and (i + 1 >= len(slides) or slides[i + 1]['type'] == 'section'): continue
        out_slides.append(s)
    # 同じ見出しが続くときは ①②… を付ける。長い見出しに _todo
    real = [s for s in out_slides if s['type'] not in ('section', 'cover')]
    i = 0
    while i < len(real):
        j = i
        while j + 1 < len(real) and real[j + 1]['heading'] == real[i]['heading']: j += 1
        if j > i:
            for n, s in enumerate(real[i:j + 1]): s['heading'] += CIRCLED[n] if n < len(CIRCLED) else f'({n + 1})'
        i = j + 1
    for s in real:
        if len(s['heading']) > HEAD_MAX:
            s['_todo'] = (s.get('_todo', '') + '／' if s.get('_todo') else '') + f'見出しが長い（{len(s["heading"])}字。全角{HEAD_MAX}字まで）'
    cmt = 'note_to_deck.py が作った下書き。_todo を片づけてから build_deck.js に掛ける。'
    out = {'meta': {'title': f"復習スライド {title}".strip(), 'theme': theme, '_comment': cmt}, 'slides': out_slides}
    json.dump(out, open(args[1], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    n_real = len(real) + 1
    todos = [s for s in out_slides if '_todo' in s]
    from collections import Counter
    kinds = Counter(s['type'] for s in real)
    print(f"下書き：{args[1]}（スライド {n_real} 枚、直す所 _todo {len(todos)} 件）")
    print('  型の内訳：' + '、'.join(f'{k} {v}' for k, v in kinds.most_common()))
    if n_real > budget:
        print(f"  枚数が目安（{budget}枚）を超えている。--only で章を絞るか、要点の枚をまとめる・削る（復習用は1章 15〜30 枚）")
    if skipped: print(f"  飛ばしたもの {len(skipped)} 件：" + '、'.join(skipped[:6]) + (' ほか' if len(skipped) > 6 else ''))
    for x in input_notes: print('  ' + x)
    for i, s in enumerate([x for x in out_slides if x['type'] != 'section'], 1):
        if '_todo' in s: print(f"  {i}枚目（{s['type']}）：{s['_todo']}")


if __name__ == '__main__':
    main()
