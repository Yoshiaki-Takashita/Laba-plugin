#!/usr/bin/env python3
"""利用者の「キット」（前に仕上げた判例研究の .docx・.pptx と、それを作ったスクリプト）を測り、体裁を合わせるための値を取り出す。
usage: kit_measure.py KIT [KIT…] [--out kit_profile.json]
  KIT：フォルダ、.zip、または個々のファイル（.docx・.pptx・.js・.py）。フォルダと zip は中を探す。
出力
  kit_profile.json  測った値（measured）と、作成に渡す値（apply）、LABA の既定との違い（diff）、見つけたスクリプトと関数名（scripts）
  画面              違いの一覧
使い方（references/hanrei/README.md の「キットの再利用」）
  1 利用者が、前回の完成版（レジュメと発表スライド）と、あれば生成スクリプトを渡す
  2 kit_measure.py で測る。違いの一覧を利用者に見せ、「前回に合わせる」か「LABA の既定にする」かを決めてもらう
  3 合わせるなら、resume_build.py … --kit kit_profile.json、build_deck.js … --kit kit_profile.json で作る
  4 スクリプトの部品（図の関数など）は、一覧（scripts）を見て、要るものだけを人の目で確かめてから使う。このツールは実行しない
測るもの
  docx：余白、本文の書体と大きさ、見出しの大きさ（大きい順に2段）、表の罫線、表の文字、引用段落（左の罫線）、参考文献の大きさ、章の改頁
  pptx：枚数、1枚の文字数、文字サイズの分布、書体、色（文字・枠線・帯・区切り線）、枠線の太さ、帯の位置、ピクト画像の数と大きさ
注意：測るのは寸法だけで、本文・氏名・所属などの文字は取り出さない（キットの中身をスキルに写さない）。python-docx は不要、python-pptx が要る。"""
import sys, os, re, json, zipfile, tempfile, shutil, collections

IN = 914400.0
LABA_DOCX = {'body': 10.5, 'section': 13.5, 'sub': 11, 'table': 9.5, 'refs': 8, 'margin_mm': {'top': 25.4, 'bottom': 25.4, 'left': 27.5, 'right': 27.5}}
LABA_PPTX = {'font': 'Yu Gothic', 'colors': {'ink': '1A1A1A', 'base': '2F6F6C', 'dark': '17403F', 'accent': 'C2543A', 'band': 'E3EDEB', 'gray': '8A9493', 'rule': 'D0D6D5'}, 'heading': 20}


def collect(paths):
    files = []; tmp = None
    for p in paths:
        if os.path.isdir(p):
            for root, _, fs in os.walk(p):
                files += [os.path.join(root, f) for f in fs]
        elif p.lower().endswith('.zip'):
            tmp = tmp or tempfile.mkdtemp(prefix='kit_')
            with zipfile.ZipFile(p) as z:
                for n in z.namelist():
                    if n.endswith('/') or '..' in n or n.startswith('/'): continue
                    if os.path.splitext(n)[1].lower() in ('.docx', '.pptx', '.js', '.py'):
                        dst = os.path.join(tmp, os.path.basename(n)); open(dst, 'wb').write(z.read(n)); files.append(dst)
        else: files.append(p)
    return [f for f in files if os.path.splitext(f)[1].lower() in ('.docx', '.pptx', '.js', '.py') and not os.path.basename(f).startswith('~$')], tmp


def measure_docx(path):
    z = zipfile.ZipFile(path); x = z.read('word/document.xml').decode('utf8', 'ignore')
    styles = z.read('word/styles.xml').decode('utf8', 'ignore') if 'word/styles.xml' in z.namelist() else ''
    m = {}
    pg = re.search(r'<w:pgMar [^>]*>', x)
    if pg:
        g = lambda k: round(int(re.search(rf'w:{k}="(\d+)"', pg.group(0)).group(1)) / 1440 * 25.4, 1)
        m['margin_mm'] = {k: g(k) for k in ('top', 'bottom', 'left', 'right')}
    dflt = re.search(r'<w:rPrDefault>.*?<w:sz w:val="(\d+)"', styles, re.S)
    sizes = collections.Counter(); bold_sizes = collections.Counter(); fonts = collections.Counter(); hfonts = collections.Counter()
    for r in re.findall(r'<w:r[ >].*?</w:r>', x, re.S):
        n = len(''.join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', r)))
        if not n: continue
        s = re.search(r'<w:sz w:val="(\d+)"', r); sz = int(s.group(1)) / 2 if s else (int(dflt.group(1)) / 2 if dflt else 10.5)
        sizes[sz] += n
        f = re.search(r'w:eastAsia="([^"]+)"', r)
        if '<w:b/>' in r or '<w:b ' in r:
            bold_sizes[sz] += n
            if f: hfonts[(sz, f.group(1))] += n
        elif f: fonts[f.group(1)] += n
    body = sizes.most_common(1)[0][0] if sizes else 10.5
    m['body'] = body; m['sizes'] = {str(k): v for k, v in sizes.most_common(8)}
    heads = sorted([s for s, n in bold_sizes.items() if body < s <= 15 and n >= 8], reverse=True)
    if heads: m['section'] = heads[0]
    if len(heads) > 1: m['sub'] = heads[1]
    small = sorted([s for s, n in sizes.items() if s < body and n >= 50])
    if small: m['refs'] = small[0]
    tcs = re.findall(r'<w:tc>.*?</w:tc>', x, re.S); tsz = collections.Counter()
    for tc in tcs:
        for s in re.findall(r'<w:sz w:val="(\d+)"', tc): tsz[int(s) / 2] += 1
    if tsz: m['table'] = tsz.most_common(1)[0][0]
    tb = re.search(r'<w:tblBorders>(.*?)</w:tblBorders>', x, re.S)
    if tb:
        sides = dict(re.findall(r'<w:(top|left|bottom|right|insideH|insideV) w:val="(\w+)"', tb.group(1)))
        m['table_grid'] = all(sides.get(k) == 'single' for k in ('left', 'right', 'insideV', 'insideH'))
    m['table_header_fill'] = bool(re.search(r'<w:shd [^>]*w:fill="(?!auto|FFFFFF)[0-9A-Fa-f]{6}"', x))
    m['quote_left_rule'] = len(re.findall(r'<w:pBdr><w:left ', x))
    m['chapter_break'] = '<w:pageBreakBefore/>' in x
    m['first_line_indent'] = bool(re.search(r'<w:ind [^>]*w:firstLine="[1-9]', x))
    colors = collections.Counter(c.upper() for c in re.findall(r'<w:color w:val="([0-9A-Fa-f]{6})"', x))
    m['text_colors'] = [c for c, _ in colors.most_common(4)]
    if fonts: m['body_font'] = fonts.most_common(1)[0][0]
    hf = collections.Counter()
    for (sz, f), n in hfonts.items():
        if sz > body: hf[f] += n
    if hf: m['head_font'] = hf.most_common(1)[0][0]
    apply = {k: m[k] for k in ('margin_mm', 'body', 'section', 'sub', 'table', 'refs', 'body_font', 'head_font', 'chapter_break') if k in m}
    return m, apply


def measure_pptx(path):
    from pptx import Presentation
    prs = Presentation(path); z = zipfile.ZipFile(path)
    m = {'slides': len(prs.slides), 'size_in': [round(prs.slide_width / IN, 3), round(prs.slide_height / IN, 3)]}
    sizes = collections.Counter(); tcol = collections.Counter(); lcol = collections.Counter(); lw = collections.Counter(); faces = collections.Counter()
    chars = []; pics = collections.Counter(); bands = collections.Counter(); small_col = collections.Counter(); head_sizes = collections.Counter(); rules = collections.Counter(); fills = collections.Counter()
    for si, s in enumerate(prs.slides, 1):
        n = 0
        xml = z.read(f'ppt/slides/slide{si}.xml').decode('utf8', 'ignore') if f'ppt/slides/slide{si}.xml' in z.namelist() else ''
        for f in re.findall(r'<a:(?:latin|ea) typeface="([^"+][^"]*)"', xml): faces[f] += 1
        for sh in s.shapes:
            if sh.left is None: continue
            x, y, w, h = sh.left / IN, sh.top / IN, sh.width / IN, sh.height / IN
            if sh.shape_type == 13: pics[(round(w, 1), round(h, 1))] += 1; continue
            if getattr(sh, 'has_table', False) and sh.has_table:
                for row in sh.table.rows:
                    for c in row.cells: n += len(c.text_frame.text)
                continue
            try:
                if sh.line.fill.type is not None and sh.line.width:
                    c = str(sh.line.color.rgb); wpt = round(sh.line.width / 12700, 2)
                    if w > 9.5 and h < 0.05: rules[c] += 1
                    elif w > 1 and h > 0.3: lcol[c] += 1; lw[wpt] += 1
            except Exception: pass
            try:
                if w > 9.9 and h > 0.8 and y > 2 and sh.fill.type is not None: bands[round(y, 2)] += 1; fills[str(sh.fill.fore_color.rgb)] += 1
            except Exception: pass
            if not sh.has_text_frame: continue
            for p in sh.text_frame.paragraphs:
                for r in p.runs:
                    k = len(r.text.strip())
                    if not k: continue
                    sz = r.font.size.pt if r.font.size else None
                    if sz:
                        sizes[sz] += k
                        if y < 0.75 and sz >= 18 and si > 2: head_sizes[sz] += k
                    try:
                        c = str(r.font.color.rgb) if r.font.color and r.font.color.type is not None else None
                    except Exception: c = None
                    if c:
                        tcol[c] += k
                        if sz and sz <= 12: small_col[c] += k
                    if not (y < 0.75 and h < 0.8): n += k
        chars.append(n)
    body = chars[2:] or chars
    m['chars_avg'] = round(sum(body) / max(1, len(body))); m['chars_max'] = max(body or [0]); m['chars_min'] = min(body or [0])
    m['font_sizes'] = {str(k): v for k, v in sizes.most_common(10)}
    m['fonts'] = [f for f, _ in faces.most_common(3)]
    m['text_colors'] = {k: v for k, v in tcol.most_common(6)}; m['frame_colors'] = {k: v for k, v in lcol.most_common(4)}
    m['frame_line_pt'] = [k for k, _ in lw.most_common(3)]; m['band_y'] = [k for k, _ in bands.most_common(2)]
    m['pictos'] = {f'{a}x{b}': v for (a, b), v in pics.most_common(5)}; m['picto_images'] = sum(pics.values())
    colors = {}
    tc = [c for c, _ in tcol.most_common()]
    if tc: colors['ink'] = tc[0]
    fc = [c for c, _ in lcol.most_common() if c not in ('FFFFFF',)]
    if fc: colors['base'] = fc[0]
    acc = [c for c in fc[1:] + tc[1:] if c not in (colors.get('ink'), colors.get('base')) and c not in [x for x, _ in small_col.most_common(1)]]
    if acc: colors['accent'] = acc[0]
    if small_col: colors['gray'] = small_col.most_common(1)[0][0]
    if fills: colors['band'] = fills.most_common(1)[0][0]
    if rules: colors['rule'] = rules.most_common(1)[0][0]
    apply = {'colors': colors}
    if m['fonts']: apply['font'] = m['fonts'][0]
    if head_sizes: apply['heading'] = head_sizes.most_common(1)[0][0]
    return m, apply


def scan_script(path):
    src = open(path, encoding='utf-8', errors='ignore').read()
    if path.endswith('.js'): names = re.findall(r'(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_]\w*)|(?:^|\n)\s*const\s+([A-Za-z_]\w*)\s*=\s*(?:async\s*)?\(', src)
    else: names = re.findall(r'(?:^|\n)def\s+([A-Za-z_]\w*)|(?:^|\n)class\s+([A-Za-z_]\w*)', src)
    libs = sorted(set(re.findall(r'require\(["\']([\w@/.-]+)["\']\)|^import\s+([\w.]+)|^from\s+([\w.]+)\s+import', src, re.M) and [x for t in re.findall(r'require\(["\']([\w@/.-]+)["\']\)|^import\s+([\w.]+)|^from\s+([\w.]+)\s+import', src, re.M) for x in t if x]))
    return {'file': os.path.basename(path), 'lines': src.count('\n') + 1, 'functions': [a or b for a, b in names][:40], 'uses': libs[:12]}


def main():
    argv = sys.argv[1:]
    out = argv[argv.index('--out') + 1] if '--out' in argv else 'kit_profile.json'
    paths = [a for i, a in enumerate(argv) if not a.startswith('--') and not (i > 0 and argv[i - 1] == '--out')]
    if not paths: print(__doc__); sys.exit(2)
    files, tmp = collect(paths)
    prof = {'_comment': 'kit_measure.py が測った値。apply の値を resume_build.py・build_deck.js の --kit が使う。値を変えたいときは apply を直す。', 'scripts': []}
    diff = []
    try:
        # 同じ種類が複数あれば、名前の順で最後（版の番号が大きいもの）を使う
        def latest(ext):
            c = sorted([f for f in files if f.lower().endswith(ext)], key=lambda f: [int(t) if t.isdigit() else t for t in re.split(r'(\d+)', os.path.basename(f))])
            return c[-1] if c else None
        dx, px = latest('.docx'), latest('.pptx')
        if dx:
            m, ap = measure_docx(dx); prof['docx'] = {'measured': m, 'apply': ap}
            for k, v in LABA_DOCX.items():
                if k in m and m[k] != v: diff.append(f'レジュメ {k}：キット {m[k]}、LABA の既定 {v}')
            if m.get('table_grid') is False: diff.append('レジュメ 表：キットは格子の罫線でない（LABA の判例研究の体裁は黒い細罫線の格子）')
            if m.get('table_header_fill'): diff.append('レジュメ 表：キットは見出し行に塗りがある（LABA は塗らない）')
            if m.get('first_line_indent'): diff.append('レジュメ 本文：キットは1字下げがある（LABA の判例研究の体裁は字下げなし）')
            if not m.get('quote_left_rule'): diff.append('レジュメ 引用：キットに左罫線の引用段落がない')
        if px:
            m, ap = measure_pptx(px); prof['pptx'] = {'measured': m, 'apply': ap}
            for k, v in LABA_PPTX['colors'].items():
                if ap['colors'].get(k) and ap['colors'][k] != v: diff.append(f'スライド 色 {k}：キット #{ap["colors"][k]}、LABA の既定 #{v}')
            if ap.get('font') and ap['font'] != LABA_PPTX['font']: diff.append(f'スライド 書体：キット {ap["font"]}、LABA の既定 {LABA_PPTX["font"]}')
            if ap.get('heading') and ap['heading'] != LABA_PPTX['heading']: diff.append(f'スライド 見出し：キット {ap["heading"]}pt、LABA の既定 {LABA_PPTX["heading"]}pt')
            if m['picto_images']: diff.append(f'スライド ピクト：キットは画像のピクトを {m["picto_images"]} 個使っている（LABA は図形で描く。deck_lint.py は 1.3 インチ以下の画像を許す）')
            diff.append(f'スライド 文字量：キットは {m["slides"]} 枚、1枚平均 {m["chars_avg"]} 字（最小 {m["chars_min"]}、最大 {m["chars_max"]}）。LABA の目標は 190 字前後')
        for f in files:
            if f.lower().endswith(('.js', '.py')): prof['scripts'].append(scan_script(f))
        prof['diff'] = diff
        json.dump(prof, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    finally:
        if tmp: shutil.rmtree(tmp, ignore_errors=True)
    print(f'キット：docx {"あり" if "docx" in prof else "なし"}、pptx {"あり" if "pptx" in prof else "なし"}、スクリプト {len(prof["scripts"])} 本 → {out}')
    if not diff: print('  LABA の既定との違いは見つからなかった')
    for d in diff: print('  ・' + d)
    for s in prof['scripts']: print(f"  スクリプト {s['file']}（{s['lines']} 行）：関数 {len(s['functions'])} 個（{'、'.join(s['functions'][:8])}{' ほか' if len(s['functions']) > 8 else ''}）")


if __name__ == '__main__':
    main()
