#!/usr/bin/env python3
"""ブロックの列を Word（.docx）にする汎用ビルダー。python-docx が必要。
usage: build_docx.py BLOCKS.json OUT.docx [--comma-full] [--body-out body.txt] [--text-out note.txt]
       build_docx.py module.py OUT.docx        （module.py は META と DOC を定義する Python ファイル）
入力（JSON）：{"meta": {...}, "blocks": [[種別, 本文, ...], ...]}
meta：course（右上1行目）, session（右上2行目）, title, subtitle, toc（構成の行のリスト）, note（※の注記）,
      body_font（既定 游明朝）, head_font（既定 游ゴシック）
種別：
  H  章見出し（下に罫線）      S  節見出し          SS 小見出し        C  判例見出し（太字）
  P  本文の段落（字下げ1字）    P2 「ラベル：本文」の段（ぶら下げ）
  Z  ざっくり理解の段落（左に字下げ。見出しは ZH）   ZH ざっくり理解の見出し（太字）
  B  箇条書き（・）   N  番号付き（["N","1. …"] と書く）  ZB／ZN ざっくり理解の中の箇条書き／番号
  T  表：["T", [[行1のセル…],[行2…]], "表題", [列幅mm…]（省略可）]  1行目が見出し行。横罫3本。セル内の \\n は改行
  F  図：["F", "fig1.png", "図題", 幅mm（省略時 150）]
  K  結論・答えの段（先頭の「結論」「答え」を太字にする）   PB 改頁
  KD 論点カード表：["KD", [[論点, 問題の所在, 規範, 理由, 当てはめの要点], …], "表題"]（card_build.py が作る）
--comma-full：本文の読点「、」を「，」に統一する（Z 系は対象外）。
--body-out：本文だけ（P・P2・K）のテキストを書き出す（style_check 用）。--text-out：全文。"""
import sys, json, re, importlib.util, os
from docx import Document
from docx.shared import Pt, Mm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

def load(path):
    if path.endswith('.json'):
        d = json.load(open(path, encoding='utf-8')); return d.get('meta', {}), d['blocks']
    spec = importlib.util.spec_from_file_location('laba_doc', path); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return getattr(m, 'META', {}), m.DOC

def set_font(run, name, size, bold=False):
    run.font.name = name; run.font.size = Pt(size); run.bold = bold
    rpr = run._element.get_or_add_rPr(); rf = rpr.find(qn('w:rFonts'))
    if rf is None:
        rf = OxmlElement('w:rFonts'); rpr.insert(0, rf)
    for a in ('w:eastAsia', 'w:ascii', 'w:hAnsi'):
        rf.set(qn(a), name)

class Builder:
    def __init__(self, meta, comma_full=False):
        self.meta = meta; self.cf = comma_full
        self.bf = meta.get('body_font', '游明朝'); self.hf = meta.get('head_font', '游ゴシック')
        self.d = Document(); s = self.d.sections[0]
        s.page_width, s.page_height = Mm(210), Mm(297)
        s.left_margin = s.right_margin = Mm(25); s.top_margin = s.bottom_margin = Mm(27)
        st = self.d.styles['Normal']; st.font.name = self.bf; st.font.size = Pt(10.5)
        st.element.get_or_add_rPr().get_or_add_rFonts().set(qn('w:eastAsia'), self.bf)
        z = self.d.settings.element.find(qn('w:zoom'))
        if z is not None:
            z.set(qn('w:percent'), '100')
        self.body, self.full = [], []

    def tx(self, t, body=True):
        return t.replace('、', '，') if (self.cf and body) else t

    def para(self, text, size=10.5, bold=False, font=None, align=None, before=0, after=4, line=1.4, first=None, left=None, keep=False):
        p = self.d.add_paragraph(); pf = p.paragraph_format
        pf.space_before, pf.space_after, pf.line_spacing = Pt(before), Pt(after), line
        if first is not None:
            pf.first_line_indent = Pt(first)
        if left is not None:
            pf.left_indent = Pt(left)
        if align:
            p.alignment = align
        if keep:
            pf.keep_with_next = True
        # **太字** の簡易対応
        for i, part in enumerate(re.split(r'\*\*(.+?)\*\*', text)):
            if part:
                set_font(p.add_run(part), font or self.bf, size, bold or i % 2 == 1)
        return p

    def rule(self, p):
        ppr = p._element.get_or_add_pPr(); b = OxmlElement('w:pBdr'); bt = OxmlElement('w:bottom')
        for k, v in (('w:val', 'single'), ('w:sz', '6'), ('w:space', '1'), ('w:color', '000000')):
            bt.set(qn(k), v)
        b.append(bt)
        kn = [e for e in ppr if e.tag in (qn('w:keepNext'), qn('w:keepLines'), qn('w:pStyle'))]
        (kn[-1].addnext(b) if kn else ppr.insert(0, b))

    def cover(self):
        m = self.meta
        for k in ('course', 'session'):
            if m.get(k):
                self.para(m[k], 9.5, align=WD_ALIGN_PARAGRAPH.RIGHT, after=0, font=self.hf)
        if m.get('title'):
            self.para(m['title'], 20, True, self.hf, WD_ALIGN_PARAGRAPH.CENTER, before=14, after=2)
        if m.get('subtitle'):
            self.para(m['subtitle'], 13, True, self.hf, WD_ALIGN_PARAGRAPH.CENTER, after=10)
        if m.get('toc'):
            self.para('構成', 10.5, True, self.hf, after=2)
            for l in m['toc']:
                self.para(l, 10, after=0, left=10.5)
        if m.get('note'):
            self.para('※' + m['note'], 9, before=6, after=8)

    def table(self, rows, caption=None, widths=None):
        ncol = max(len(r) for r in rows); tb = self.d.add_table(rows=len(rows), cols=ncol); tb.alignment = WD_TABLE_ALIGNMENT.CENTER
        total = 160.0
        widths = widths or [total / ncol] * ncol
        tblPr = tb._tbl.tblPr; bd = OxmlElement('w:tblBorders')
        for side in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
            e = OxmlElement(f'w:{side}')
            e.set(qn('w:val'), 'single' if side in ('top', 'bottom') else 'nil')
            if side in ('top', 'bottom'):
                e.set(qn('w:sz'), '8'); e.set(qn('w:space'), '0'); e.set(qn('w:color'), '000000')
            bd.append(e)
        anchor = tblPr.find(qn('w:tblLayout'))
        if anchor is None:
            anchor = tblPr.find(qn('w:tblLook'))
        (anchor.addprevious(bd) if anchor is not None else tblPr.append(bd))
        for j in range(ncol):
            tb.columns[j].width = Mm(widths[j])
        for i, r in enumerate(rows):
            for j in range(ncol):
                c = tb.cell(i, j); c.width = Mm(widths[j]); txt = self.tx(str(r[j]) if j < len(r) else '', body=False)
                c.paragraphs[0].text = ''
                for li, line in enumerate(txt.split('\n')):
                    p = c.paragraphs[0] if li == 0 else c.add_paragraph()
                    p.paragraph_format.space_after = Pt(1); p.paragraph_format.line_spacing = 1.25
                    set_font(p.add_run(line), self.hf if i == 0 else self.bf, 9.5, i == 0)
                if i == 0:
                    tcPr = c._tc.get_or_add_tcPr(); tb_ = OxmlElement('w:tcBorders'); bt = OxmlElement('w:bottom')
                    for k, v in (('w:val', 'single'), ('w:sz', '4'), ('w:space', '0'), ('w:color', '000000')):
                        bt.set(qn(k), v)
                    tb_.append(bt); tcPr.append(tb_)
            self.full.append(' | '.join(str(x).replace('\n', ' ') for x in r))
        if caption:
            self.para(caption, 9, font=self.hf, align=WD_ALIGN_PARAGRAPH.CENTER, before=3, after=8); self.full.append(caption)

    def footer(self):
        p = self.d.sections[0].footer.paragraphs[0]; p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        def fld(code):
            for t, txt in (('begin', None), (None, code), ('end', None)):
                r = p.add_run(); set_font(r, self.hf, 9)
                if t:
                    f = OxmlElement('w:fldChar'); f.set(qn('w:fldCharType'), t); r._element.append(f)
                else:
                    it = OxmlElement('w:instrText'); it.set(qn('xml:space'), 'preserve'); it.text = txt; r._element.append(it)
        fld('PAGE'); set_font(p.add_run(' / '), self.hf, 9); fld('NUMPAGES')

    def build(self, blocks, basedir='.'):
        self.cover()
        for b in blocks:
            k, t = b[0], (b[1] if len(b) > 1 else '')
            if k == 'H':
                self.rule(self.para(t, 14, True, self.hf, before=14, after=6, keep=True))
            elif k == 'S':
                self.para(t, 11.5, True, self.hf, before=8, after=3, keep=True)
            elif k in ('SS', 'C'):
                self.para(t, 10.5, True, self.hf, before=5, after=2, keep=True)
            elif k == 'P':
                t = self.tx(t); self.para(t, first=10.5); self.body.append(t)
            elif k == 'P2':
                t = self.tx(t); lab, _, rest = t.partition('：')
                self.para(f'**{lab}：**{rest}' if rest else t, left=21, first=-21); self.body.append(t)
            elif k == 'K':
                t = self.tx(t); m = re.match(r'^(結論|答え)[　 ：:]?', t)
                self.para((f'**{m.group(0)}**' + t[m.end():]) if m else t, first=0, before=2); self.body.append(t)
            elif k == 'ZH':
                self.para(t, 10.5, True, self.hf, before=6, after=2, left=21, keep=True)
            elif k == 'Z':
                self.para(t, 10, left=21, first=0, after=3)
            elif k in ('B', 'ZB'):
                self.para('・' + t, 10 if k == 'ZB' else 10.5, left=(42 if k == 'ZB' else 21), first=-10.5, after=1)
            elif k in ('N', 'ZN'):
                self.para(t, 10 if k == 'ZN' else 10.5, left=(42 if k == 'ZN' else 21), first=-10.5, after=1)
            elif k == 'KD':  # 論点カード表：行＝[論点, 問題の所在, 規範, 理由, 当てはめの要点]
                head = ['論点', '問題の所在', '規範（条文・判例）', '理由', '当てはめの要点']
                self.table([head] + [[self.tx(str(c), body=False) for c in r] for r in b[1]], b[2] if len(b) > 2 else '論点カード',
                           b[3] if len(b) > 3 else [20, 28, 46, 34, 32]); continue
            elif k == 'T':
                self.table(b[1], b[2] if len(b) > 2 else None, b[3] if len(b) > 3 else None); continue
            elif k == 'F':
                path = b[1] if os.path.isabs(b[1]) else os.path.join(basedir, b[1])
                p = self.d.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER; p.paragraph_format.keep_with_next = True
                p.add_run().add_picture(path, width=Mm(b[3] if len(b) > 3 else 150))
                cap = self.tx(b[2], body=False) if len(b) > 2 else ''
                self.para(cap, 9, font=self.hf, align=WD_ALIGN_PARAGRAPH.CENTER, after=8); self.full.append(cap); continue
            elif k == 'PB':
                self.d.add_page_break(); continue
            else:
                raise SystemExit(f'未知のブロック種別: {k}')
            self.full.append(re.sub(r'\*\*', '', t))
        if '--no-footer' not in sys.argv:
            self.footer()

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    opt = {a: sys.argv[sys.argv.index(a) + 1] for a in ('--body-out', '--text-out') if a in sys.argv}
    args = [a for a in args if a not in opt.values()]
    if len(args) < 2:
        print(__doc__); sys.exit(1)
    meta, blocks = load(args[0]); b = Builder(meta, '--comma-full' in sys.argv)
    b.build(blocks, os.path.dirname(os.path.abspath(args[0]))); b.d.save(args[1])
    if '--body-out' in opt:
        open(opt['--body-out'], 'w', encoding='utf-8').write('\n'.join(b.body))
    if '--text-out' in opt:
        open(opt['--text-out'], 'w', encoding='utf-8').write('\n'.join(b.full))
    print(f'{args[1]}: blocks={len(blocks)} body_chars={sum(len(x) for x in b.body)}')

if __name__ == '__main__':
    main()
