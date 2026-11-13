#!/usr/bin/env python3
"""報告に書く数値を、機械で数えて出す（数え方つき）。報告・納品文・比較表の数値は、この出力を写す。手で数えた値、前の版の値を書かない。
usage: report_numbers.py NOTE.txt [--blocks blocks.json|text.py] [--source SOURCE.txt] [--pdf NOTE.pdf]
                         [--cards cards.json] [--tf items.json] [--index index.json] [--out numbers.json] [--md numbers.md] [--pages-out pages.json]
出す値（かっこ内は数え方）：
  字数          全文（NOTE.txt の空白・改行を除いた字数。句読点・括弧・記号は数える）
  本編／巻末    --blocks があるとき。巻末＝見出しに「論点カード」「短答」「正誤」「索引」「出所」「結論一覧」「要件・効果」を含む章の下の全部（見出し・導入文・表・表題）。
                本編＝それ以外（表紙の注記は NOTE.txt に入っていれば全文の側にだけ入る）
  分量比        本編の字数 ÷ 資料の字数、全文の字数 ÷ 資料の字数（どちらも空白を除く）
  頁数          --pdf（pdfinfo の Pages）。あわせて、頁ごとの下の空き（本文域の最後の行から下端まで）を出し、4割を超えて空く頁（最後の頁を除く）を挙げる
                （pdftoppm と PIL が要る。無ければ頁数だけ）
  判例・条文    全文に出る判例（裁判所＋年月日で数えた異なり数）と、条文（法令名＋条番号の異なり数）
  表・図        --blocks の T／KD ブロックと F ブロックの数
  論点カード    --cards の論点の数。短答を番号の参照（→短答N）にした論点の数
  短答          --tf の問の数、○と×の数
  索引          --index の表の語の数（2段組みの表は、語の列を全部数える）
数え方を変えたら、前の版も同じ数え方で数え直して並べる（数え方の違う値を前後に並べない）。"""
import sys, os, json, subprocess, shutil, tempfile, glob
from laba_common import *

BACK_WORDS = ('論点カード', '短答', '正誤', '結論一覧', '要件・効果', '索引', '出所')

def nospace(t):
    return len(re.sub(r'\s', '', t.replace('**', '')))

def block_text(b):
    k = b[0]
    if k in ('T', 'KD'):
        rows = b[1] if len(b) > 1 and isinstance(b[1], (list, tuple)) else []
        return '\n'.join(' '.join(str(c) for c in r) for r in rows) + ('\n' + str(b[2]) if len(b) > 2 and isinstance(b[2], str) else '')
    if k == 'F':
        return str(b[2]) if len(b) > 2 else ''
    if k == 'BH':
        return str(b[1]) + ' ' + (str(b[2]) if len(b) > 2 else '')
    if k == 'PB':
        return ''
    return str(b[1]) if len(b) > 1 and isinstance(b[1], str) else ''

def page_fill(pdf, out):
    """頁ごとの下の空き（mm）。pdftoppm と PIL が無ければ None。"""
    if not shutil.which('pdftoppm'):
        return None
    try:
        from PIL import Image
    except Exception:
        return None
    d = tempfile.mkdtemp(prefix='laba_pages_')
    try:
        subprocess.run(['pdftoppm', '-r', '40', '-gray', '-png', pdf, os.path.join(d, 'p')], check=True, capture_output=True)
        rows = []
        for i, f in enumerate(sorted(glob.glob(os.path.join(d, 'p-*.png'))), 1):
            im = Image.open(f).convert('L'); w, h = im.size; px = im.load()
            top, bottom = int(h * 0.06), int(h * 0.90)        # 柱と頁番号を除いた本文域（A4・上下の余白25mm前後を想定）
            last = top
            for y in range(bottom - 1, top, -1):
                if any(px[x, y] < 160 for x in range(int(w * 0.08), int(w * 0.92), 2)):
                    last = y; break
            rows.append({'page': i, 'blank_mm': round((bottom - last) * 297.0 / h), 'blank_pct': round(100.0 * (bottom - last) / (bottom - top))})
        return rows
    finally:
        shutil.rmtree(d, ignore_errors=True)

def main():
    pos = positional()
    if not pos:
        print(__doc__); sys.exit(1)
    raw = open(pos[0], encoding='utf-8').read()
    N = {}
    def put(key, value, how):
        N[key] = {'value': value, 'how': how}
    put('字数（全文）', nospace(raw), 'NOTE.txt の空白・改行を除いた字数')
    src_chars = None
    if arg('--source'):
        src_chars = nospace(open(arg('--source'), encoding='utf-8').read())
        put('字数（資料）', src_chars, '資料の書き起こしの空白・改行を除いた字数')
        put('分量比（全文÷資料）', round(N['字数（全文）']['value'] / src_chars, 2), '上の2つの比')
    if arg('--blocks'):
        from laba_blocks import load_blocks
        blocks = load_blocks(arg('--blocks'))
        main_c = back_c = 0; in_back = False; nt = nf = 0
        for b in blocks:
            if b[0] == 'H':
                in_back = any(w in str(b[1]) for w in BACK_WORDS)
            c = nospace(block_text(b))
            if in_back:
                back_c += c
            else:
                main_c += c
            nt += b[0] in ('T', 'KD'); nf += b[0] == 'F'
        put('字数（本編）', main_c, 'blocks のうち、巻末の章（見出しに 論点カード・短答・正誤・索引・出所 等を含む H の下）を除いた部分。空白を除く')
        put('字数（巻末）', back_c, '巻末の章の見出し・導入文・表・表題。空白を除く')
        if src_chars:
            put('分量比（本編÷資料）', round(main_c / src_chars, 2), '字数（本編）÷ 字数（資料）')
            put('分量比（巻末÷資料）', round(back_c / src_chars, 2), '字数（巻末）÷ 字数（資料）')
        put('表の数', nt, 'blocks の T・KD ブロックの数'); put('図の数', nf, 'blocks の F ブロックの数')
    t = raw.translate(Z2H)
    put('判例の数', len(set(c['key'] for c in find_cases(t))), '全文に出る判例を、裁判所＋年月日で数えた異なり数')
    put('条文の数', len(set(s['key'] for s in find_statutes(t))), '全文に出る条文を、法令名＋条項号で数えた異なり数（法令名を省いた表記は別に数える）')
    if arg('--cards'):
        cs = json.load(open(arg('--cards'), encoding='utf-8'))['cards']
        put('論点カードの論点', len(cs), 'cards.json の件数')
        put('短答を番号の参照にした論点', sum(1 for c in cs if re.match(r'^→短答\d+$', (c.get('tf') or '').strip())), 'tf が「→短答N」の論点の数')
    if arg('--tf'):
        it = json.load(open(arg('--tf'), encoding='utf-8'))['items']
        put('短答の問', len(it), 'items.json の件数')
        put('短答の○／×', f"{sum(1 for x in it if x.get('a') == '○')}／{sum(1 for x in it if x.get('a') == '×')}", '"a" が ○／× の問の数')
    if arg('--index'):
        d = json.load(open(arg('--index'), encoding='utf-8')); rows = d.get('rows') or d['blocks'][0][1]
        n = sum(1 for r in rows[1:] for k in range(0, len(r), 2) if str(r[k]).strip())
        put('索引の語', n, '索引の表の語の列（偶数番目の列）の、空でないセルの数')
    pages = None
    if arg('--pdf'):
        try:
            o = subprocess.run(['pdfinfo', arg('--pdf')], capture_output=True, text=True).stdout
            m = re.search(r'Pages:\s*(\d+)', o)
            if m:
                put('頁数', int(m.group(1)), 'pdfinfo の Pages（PDF は docx を LibreOffice で変換したもの。Word とは頁の切れ目が違うことがある）')
        except FileNotFoundError:
            pass
        pf = page_fill(arg('--pdf'), None)
        if pf:
            blank = [r['page'] for r in pf[:-1] if r['blank_pct'] > 40]
            put('下が4割を超えて空く頁', blank, '頁の画像で、本文域の最後の行から本文域の下端までが本文域の4割を超える頁（最後の頁を除く）')
            pages = {'n_pages': len(pf), 'blank_pages': blank, 'pages': pf}
            if arg('--pages-out'):
                dump(pages, arg('--pages-out'))
    if arg('--out'):
        dump({'numbers': N, 'pages': pages}, arg('--out'))
    L = ['| 項目 | 値 | 数え方 |', '|---|---|---|'] + [f"| {k} | {v['value']} | {v['how']} |" for k, v in N.items()]
    if arg('--md'):
        open(arg('--md'), 'w', encoding='utf-8').write('# 報告用の数値（機械で数えた値）\n\n' + '\n'.join(L) + '\n')
    for k, v in N.items():
        print(f"{k}：{v['value']}")

if __name__ == '__main__':
    main()
