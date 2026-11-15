#!/usr/bin/env python3
"""判例研究レジュメ（Word）を、構成の JSON から作る。build_docx.py の上に載せた層。
usage: resume_build.py RESUME.json OUT.docx [--config config.json] [--kit kit_profile.json] [--style hanrei|note]
                       [--text-out resume.txt] [--body-out body.txt] [--strip-ids] [--draft]
  --style hanrei（既定）：判例研究レジュメの体裁。完成版として認められたレジュメの実測に合わせてある（references/hanrei/08-style.md）。
        本文 10.5pt・字下げなし・段落の後ろ 6pt、章は下線つきで改頁、節 13.5pt、小見出し 11pt、
        表は黒い細罫線の格子（見出し行は太字だけ。塗りなし）、条文・判旨の引用は左に罫線を引いた段落、参考文献 8pt。
  --style note：講義ノートと同じ体裁（横罫だけの表、1字下げ、章 14pt・節 11.5pt）。ノートの付録として作るときだけ使う。
  --kit：利用者の完成版を kit_measure.py で測った結果。寸法（余白・文字サイズ・書体）をそれに合わせる。
  --strip-ids：本文の台帳 ID（〔R01〕など）を外して仕上げる。ledger.py の検査は外す前のテキスト（--text-out）に掛ける。
  --draft：仮の文字（「（…を書く）」「【要確認】」など）が残っていても作る。付けなければ、残っていると終了コード 1。
RESUME.json の項目（どれも省略可。順番は references/hanrei/03-structure.md の標準構成）
  case       {theme, court, date, bench, reporters:[…], docket, name}   表紙の判決情報
  premise    {lead, items:[{title, blocks:[…]}]}                         １．前提知識
  facts      {parties:[[記号, 立場, 備考]…], figure:{path, caption}, timeline:[{label, paras:[…]}], issue:[…], issue_table:{rows, caption}}
  instances  [{title, court, claim:[…], judgment:[…], comment:[…], blocks:[…]}]   第一審・控訴審・上告審
  compare    {rows:[[…]], caption, after:[…]}                             三審の比較
  significance {blocks:[…]}   commentary {source, lead, points:[{title, paras:[…]}]}
  doctrine   [{title, paras:[…], table:{rows, caption}, after:[…]}]       学説（対立軸ごと）
  evaluation {opposition:[…], considerations:[{title, paras:[…]}]}        評価と考察
  references [ "…" ] か [{group:"判例", items:[…]}]                       参考判例・文献（読んだものだけ）
  blocks の中身は build_docx.py のブロック（["P","…"], ["T",rows,表題], ["P2","事案：…"], ["SS","(1) …"]）に加えて、
  ["Q","…"]（条文・判旨の引用。左に罫線）、["QS","出典"]（引用の出典。小さい字で右寄せ）、["G","…"]（専門用語の注。小さい灰色の字）を書ける。
config.json：{year, affiliation, presenter, date, note, chapter_break（章ごとに改頁するか。既定 true）}。空欄なら表紙に「（報告者）」などの仮の文字を入れ、一覧を出す。
  探す順：--config → 構成と同じフォルダの config.json → 環境変数 LABA_CONFIG → ~/.config/laba/hanrei.json（利用者ごとの置き場所）。
文体の決まり：本文は である調。発表でそのまま読む段落だけ です・ます にしてよい（references/hanrei/08-style.md）。"""
import sys, os, json, re
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from build_docx import Builder, set_font  # noqa: E402
from docx.enum.text import WD_ALIGN_PARAGRAPH  # noqa: E402
from docx.enum.table import WD_TABLE_ALIGNMENT  # noqa: E402
from docx.oxml import OxmlElement  # noqa: E402
from docx.oxml.ns import qn  # noqa: E402
from docx.shared import Pt, Mm, RGBColor  # noqa: E402

KANSUJI = '１２３４５６７８９'
PLACEHOLDER = re.compile(r'（[^（）]{0,40}(?:を書く|を足す|を入れる|に直す|確認して書く|確かめて書く|未定|未記入|要確認|1行で|2行で)[^（）]{0,10}）|【要確認】|【未確認】|〔要確認〕|TODO|【仮】')

# 判例研究レジュメの寸法（完成版の実測。kit で上書きできる）
HANREI = {
    'margin_mm': {'top': 25.4, 'bottom': 25.4, 'left': 27.5, 'right': 27.5},
    'body': 10.5, 'body_after': 6, 'body_line': 1.42,
    'chapter': 14, 'section': 13.5, 'sub': 11, 'label': 10.5,
    'table': 9.5, 'table_border_pt': 0.5, 'caption': 9,
    'quote_left_pt': 24, 'quote_right_pt': 12, 'quote_rule_pt': 1.5,
    'refs': 8, 'gloss': 9, 'chapter_break': True,
}


class ResumeBuilder(Builder):
    """--style note：講義ノートと同じ体裁（build_docx.py のまま）に、表紙だけ判例研究用を載せる"""
    def __init__(self, meta, case):
        super().__init__(meta); self.case = case or {}

    def cover(self):
        m, c = self.meta, self.case
        for k in ('course', 'session', 'presenter_line'):
            if m.get(k): self.para(m[k], 9.5, align=WD_ALIGN_PARAGRAPH.RIGHT, after=0, font=self.hf if self.meta.get('_note_style') else None)
        self.para('判例研究', 20, True, self.hf, WD_ALIGN_PARAGRAPH.CENTER, before=14, after=2)
        if c.get('theme'): self.para(c['theme'], 16, True, self.hf, WD_ALIGN_PARAGRAPH.CENTER, after=6)
        line1 = '　'.join(x for x in [c.get('court'), c.get('date'), c.get('bench')] if x)
        for ln in [line1, '・'.join(c.get('reporters', [])), '　'.join(x for x in [c.get('docket'), c.get('name')] if x)]:
            if ln: self.para(ln, 10.5, align=WD_ALIGN_PARAGRAPH.CENTER, after=0)
        if m.get('toc'):
            self.para('構成', 10.5, True, self.hf, before=10, after=2)
            for l in m['toc']: self.para(l, 10, after=0, left=10.5)
        self.para('※' + m.get('note', '条文番号は特に断りのない限り現行法による。'), 9.5 if not self.meta.get('_note_style') else 9, before=6, after=8)


class HanreiBuilder(ResumeBuilder):
    """--style hanrei：判例研究レジュメの体裁。色は黒だけ。色帯・塗り・色つきの枠は使わない。"""
    def __init__(self, meta, case, dim=None):
        super().__init__(meta, case)
        self.D = dict(HANREI); self.D.update(dim or {})
        s = self.d.sections[0]; mg = self.D['margin_mm']
        s.top_margin, s.bottom_margin, s.left_margin, s.right_margin = Mm(mg['top']), Mm(mg['bottom']), Mm(mg['left']), Mm(mg['right'])
        self.text_w_mm = 210 - mg['left'] - mg['right']
        if self.D.get('body_font'): self.bf = self.D['body_font']
        if self.D.get('head_font'): self.hf = self.D['head_font']
        self.first_chapter = True

    def body_para(self, t, **kw):
        D = self.D
        return self.para(t, D['body'], after=kw.pop('after', D['body_after']), line=D['body_line'], **kw)

    def quote(self, t):
        """条文・判旨の引用：左に罫線を引いた段落。原文のまま写す（言い換えには使わない）"""
        D = self.D
        p = self.para(t, D['body'], after=D['body_after'], line=D['body_line'], left=D['quote_left_pt'])
        p.paragraph_format.right_indent = Pt(D['quote_right_pt'])
        ppr = p._element.get_or_add_pPr(); b = OxmlElement('w:pBdr'); lf = OxmlElement('w:left')
        for k, v in (('w:val', 'single'), ('w:sz', str(int(D['quote_rule_pt'] * 8))), ('w:space', '8'), ('w:color', '000000')): lf.set(qn(k), v)
        b.append(lf)
        kn = [e for e in ppr if e.tag in (qn('w:keepNext'), qn('w:keepLines'), qn('w:pStyle'))]
        (kn[-1].addnext(b) if kn else ppr.insert(0, b))
        return p

    def table(self, rows, caption=None, widths=None):
        """黒い細罫線の格子。見出し行は太字のゴシックだけ（塗りつぶし・白字にしない）"""
        D = self.D
        ncol = max(len(r) for r in rows); tb = self.d.add_table(rows=len(rows), cols=ncol); tb.alignment = WD_TABLE_ALIGNMENT.CENTER
        total = self.text_w_mm
        if widths: k = total / sum(widths); widths = [w * k for w in widths]
        else: widths = [total / ncol] * ncol
        tblPr = tb._tbl.tblPr; bd = OxmlElement('w:tblBorders')
        for side in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
            e = OxmlElement(f'w:{side}')
            for k, v in (('w:val', 'single'), ('w:sz', str(int(D['table_border_pt'] * 8))), ('w:space', '0'), ('w:color', 'auto')): e.set(qn(k), v)
            bd.append(e)
        anchor = tblPr.find(qn('w:tblLayout'))
        if anchor is None: anchor = tblPr.find(qn('w:tblLook'))
        (anchor.addprevious(bd) if anchor is not None else tblPr.append(bd))
        for j in range(ncol): tb.columns[j].width = Mm(widths[j])
        for i, r in enumerate(rows):
            for j in range(ncol):
                c = tb.cell(i, j); c.width = Mm(widths[j]); txt = str(r[j]) if j < len(r) else ''
                tcPr = c._tc.get_or_add_tcPr(); mar = OxmlElement('w:tcMar')
                for side, w in (('top', 60), ('left', 100), ('bottom', 60), ('right', 100)):
                    e = OxmlElement(f'w:{side}'); e.set(qn('w:w'), str(w)); e.set(qn('w:type'), 'dxa'); mar.append(e)
                tcPr.append(mar)
                c.paragraphs[0].text = ''
                for li, line in enumerate(txt.split('\n')):
                    p = c.paragraphs[0] if li == 0 else c.add_paragraph()
                    p.paragraph_format.space_after = Pt(0); p.paragraph_format.line_spacing = 1.21
                    for k, part in enumerate(re.split(r'\*\*(.+?)\*\*', line)):
                        if part: set_font(p.add_run(part), self.hf if i == 0 else self.bf, D['table'], i == 0 or k % 2 == 1)
            self.full.append(' | '.join(str(x).replace('\n', ' ') for x in r))
        if caption:
            self.para(caption, D['caption'], font=self.hf, align=WD_ALIGN_PARAGRAPH.CENTER, before=3, after=8); self.full.append(caption)
        else:
            self.para('', 4, after=2)

    def build(self, blocks, basedir='.'):
        D = self.D
        self.cover()
        in_refs = False
        for b in blocks:
            k, t = b[0], (b[1] if len(b) > 1 else '')
            if k == 'H':
                p = self.para(t, D['chapter'], True, self.hf, before=0 if D['chapter_break'] else 16, after=12, keep=True)
                self.rule(p)
                if D['chapter_break']: p.paragraph_format.page_break_before = True
                in_refs = False
            elif k == 'S':
                self.para(t, D['section'], True, self.hf, before=16, after=7, keep=True); in_refs = '参考' in t and ('文献' in t or '判例' in t)
            elif k == 'SS':
                self.para(t, D['sub'], True, self.hf, before=11, after=5, keep=True)
            elif k == 'C':
                self.para(t, D['label'], True, self.hf, before=7, after=3, keep=True)
            elif k == 'P':
                self.body_para(t); self.body.append(t)
            elif k == 'P2':
                lab, _, rest = t.partition('：')
                self.body_para(f'**{lab}：**{rest}' if rest else t, left=21, first=-21, after=4); self.body.append(t)
            elif k == 'K':
                m = re.match(r'^(結論|答え)[　 ：:]?', t)
                self.body_para((f'**{m.group(0)}**' + t[m.end():]) if m else t); self.body.append(t)
            elif k == 'Q':
                self.quote(t); self.body.append(t)
            elif k == 'QS':
                self.para(t, D['caption'], align=WD_ALIGN_PARAGRAPH.RIGHT, after=6)
            elif k == 'G':
                p = self.para(t, D['gloss'], after=4, left=21)
                for r in p.runs: r.font.color.rgb = RGBColor(0x59, 0x59, 0x59)
            elif k in ('B', 'N'):
                if in_refs: self.para('・' + t, D['refs'], left=10, first=-8, after=0, line=1.0)
                else: self.body_para(('・' if k == 'B' else '') + t, left=21, first=-10.5, after=2)
                if not in_refs: self.body.append(t)
            elif k == 'T':
                self.table(b[1], b[2] if len(b) > 2 else None, b[3] if len(b) > 3 else None); continue
            elif k == 'KD':
                head = ['論点', '問題の所在', '規範（条文・判例）', '理由', '当てはめの要点']
                self.table([head] + [[str(c) for c in r] for r in b[1]], b[2] if len(b) > 2 else None, b[3] if len(b) > 3 else [20, 28, 46, 34, 32]); continue
            elif k == 'F':
                path = b[1] if os.path.isabs(b[1]) else os.path.join(basedir, b[1])
                p = self.d.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER; p.paragraph_format.keep_with_next = True
                p.add_run().add_picture(path, width=Mm(min(b[3] if len(b) > 3 else 150, self.text_w_mm)))
                cap = b[2] if len(b) > 2 else ''
                self.para(cap, D['caption'], align=WD_ALIGN_PARAGRAPH.CENTER, after=8); self.full.append(cap); continue
            elif k == 'PB':
                self.d.add_page_break(); continue
            elif k in ('ZH', 'Z', 'ZB', 'ZN'):
                self.body_para(('・' if k == 'ZB' else '') + t, left=21); self.body.append(t)
            else:
                raise SystemExit(f'未知のブロック種別: {k}')
            self.full.append(re.sub(r'\*\*', '', t))
        if '--no-footer' not in sys.argv:
            self.footer()


def blocks_from(spec):
    """構成（JSON）→ ブロックの列と、章の一覧。番号は、章＝１．２．…、節＝通し番号 1 2 3 …、小見出し＝(1)(2)…"""
    B = []; sec = 0; toc = []
    def H(title):
        nonlocal sec; sec += 1; t = f'{KANSUJI[sec - 1]}．{title}'; B.append(['H', t]); toc.append(t)
    num = 0
    def S(title):
        nonlocal num; num += 1; B.append(['S', f'{num}　{title}'])
    P = lambda arr: [B.append(['P', t]) for t in (arr or [])]
    if spec.get('premise'):
        H('前提知識'); pr = spec['premise']; P([pr['lead']] if pr.get('lead') else [])
        for it in pr.get('items', []):
            S(it['title']); B.extend(it.get('blocks', []))
    if spec.get('facts') or spec.get('instances'):
        H('事案と各審級の判断')
    f = spec.get('facts')
    if f:
        S('事実の概要')
        if f.get('parties'):
            B.append(['SS', '(1) 当事者']); B.append(['T', [['記号', '立場', '備考']] + f['parties'], None, [18, 62, 80]])
        if f.get('figure'): B.append(['F', f['figure']['path'], f['figure'].get('caption', '図　当事者の相関図'), f['figure'].get('width', 150)])
        if f.get('timeline'):
            B.append(['SS', '(2) 時系列'])
            for st in f['timeline']:
                B.append(['C', st['label']]); P(st.get('paras'))
        if f.get('issue') or f.get('issue_table'):
            B.append(['SS', '(3) 本件の争点']); P(f.get('issue'))
            if f.get('issue_table'): B.append(['T', f['issue_table']['rows'], f['issue_table'].get('caption'), f['issue_table'].get('widths')])
    for ins in spec.get('instances', []):
        S(ins['title'])
        if ins.get('court'): B.append(['P2', f"裁判所：{ins['court']}"])
        for lab, key in (('当事者の主張', 'claim'), ('判断', 'judgment')):
            if ins.get(key):
                B.append(['SS', lab]); P(ins[key])
        if ins.get('comment'):
            B.append(['SS', '解説']); P(ins['comment'])
        B.extend(ins.get('blocks', []))
    if spec.get('compare'):
        c = spec['compare']; S('三審の比較'); B.append(['T', c['rows'], c.get('caption'), c.get('widths')]); P(c.get('after'))
    if spec.get('significance') or spec.get('commentary'):
        H('本判決の意義と調査官解説')
    if spec.get('significance'):
        S('本判決の趣旨と意義'); B.extend(spec['significance'].get('blocks', []))
    cm = spec.get('commentary')
    if cm:
        S('調査官解説')
        if cm.get('source'): B.append(['P2', f"調査官：{cm['source']}"])
        P([cm['lead']] if cm.get('lead') else [])
        for i, pt in enumerate(cm.get('points', []), 1):
            B.append(['SS', f"({i}) {pt['title']}"]); P(pt.get('paras'))
    if spec.get('doctrine'):
        H('学説')
        for d in spec['doctrine']:
            S(d['title']); P(d.get('paras'))
            if d.get('table'): B.append(['T', d['table']['rows'], d['table'].get('caption')])
            P(d.get('after'))
    ev = spec.get('evaluation')
    if ev:
        H('評価と考察')
        if ev.get('opposition'):
            S('本判決に反対する立場'); P(ev['opposition'])
        if ev.get('considerations'):
            S('考察')
            for i, c in enumerate(ev['considerations'], 1):
                B.append(['SS', f"({i}) {c['title']}"]); P(c.get('paras'))
    if spec.get('references'):
        B.append(['S', '参考判例・文献'])
        for r in spec['references']:
            if isinstance(r, dict):
                B.append(['C', r.get('group', '')])
                for x in r.get('items', []): B.append(['B', x])
            else: B.append(['B', r])
    return B, toc


def find_config(explicit, spec_path, name='hanrei.json'):
    """利用者ごとの値の置き場所を順に探す"""
    cands = [explicit, os.path.join(os.path.dirname(os.path.abspath(spec_path)), 'config.json'), os.environ.get('LABA_CONFIG'),
             os.path.join(os.path.expanduser('~'), '.config', 'laba', name)]
    for c in cands:
        if c and os.path.exists(c): return c
    return None


def main():
    argv = sys.argv[1:]
    valued = ('--config', '--text-out', '--body-out', '--kit', '--style')
    opt = {a: argv[argv.index(a) + 1] for a in valued if a in argv}
    args = [a for i, a in enumerate(argv) if not a.startswith('--') and not (i > 0 and argv[i - 1] in valued)]
    if len(args) < 2:
        print(__doc__); sys.exit(2)
    style = opt.get('--style', 'hanrei')
    if style not in ('hanrei', 'note'): raise SystemExit('--style は hanrei か note')
    raw = open(args[0], encoding='utf-8').read()
    if '--strip-ids' in argv: raw = re.sub(r'〔R\d+〕', '', raw)
    spec = json.loads(raw)
    cfgp = find_config(opt.get('--config'), args[0])
    cfg = json.load(open(cfgp, encoding='utf-8')) if cfgp else {}
    blocks, toc = blocks_from(spec)
    marks = sorted({m.group(0) for b in blocks for x in b[1:2] if isinstance(x, str) for m in PLACEHOLDER.finditer(x)})
    todo = [k for k in ('affiliation', 'presenter', 'date') if not cfg.get(k)]
    meta = {'course': ' '.join(x for x in [cfg.get('year', ''), cfg.get('affiliation') or '（所属・演習名）'] if x), 'session': '判例研究報告レジュメ',
            'presenter_line': f"報告者　{cfg.get('presenter') or '（報告者）'}　{cfg.get('date') or '（発表日）'}", 'toc': toc,
            'note': spec.get('note') or cfg.get('note') or '条文番号は特に断りのない限り現行法による。'}
    if style == 'note':
        meta['_note_style'] = True; b = ResumeBuilder(meta, spec.get('case'))
        blocks = [['P', x[1]] if x[0] in ('Q', 'G') else x for x in blocks if x[0] != 'QS']
    else:
        dim = {}
        if opt.get('--kit'):
            kit = json.load(open(opt['--kit'], encoding='utf-8')); dim = (kit.get('docx') or {}).get('apply', {})
        if 'chapter_break' in cfg: dim = {**dim, 'chapter_break': bool(cfg['chapter_break'])}
        b = HanreiBuilder(meta, spec.get('case'), dim)
    b.build(blocks, os.path.dirname(os.path.abspath(args[0]))); b.d.save(args[1])
    if '--text-out' in opt: open(opt['--text-out'], 'w', encoding='utf-8').write('\n'.join(b.full))
    if '--body-out' in opt: open(opt['--body-out'], 'w', encoding='utf-8').write('\n'.join(b.body))
    chars = sum(len(x) for x in b.body)
    print(f'{args[1]}: 体裁 {style}、blocks={len(blocks)} 本文 {chars} 字、章 {len(toc)}' + (f'、config {cfgp}' if cfgp else '、config なし'))
    if todo: print('  未設定（仮の文字を入れた）：' + '、'.join(todo) + '。渡すときに利用者に伝える')
    if marks:
        print(f"  仮の文字・作業の印が {len(marks)} 種類残っている：" + '、'.join(m[:24] for m in marks[:5]) + ('（--draft なので続けた）' if '--draft' in argv else '。片づけてから作り直す（下書きなら --draft）'))
        if '--draft' not in argv: sys.exit(1)


if __name__ == '__main__':
    main()
