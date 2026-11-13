#!/usr/bin/env python3
"""deck_lint.py の回帰試験：独立の採点で使った「悪い例」32件。
tests/fixtures の2枚（復習用の見本の1枚、判例研究の見本の1枚。前に表紙と目次を残してある）を python-pptx で1か所ずつ壊し、
検査が狙いの指摘（target の code）を出すかを調べる。目標は 9 割以上の検出、うち error での検出を優先。
usage: python3 tests/bad_cases.py [名前 ...] [--out DIR]   （LibreOffice・poppler が要る。1件 10〜20 秒）
終了コード：検出が 9 割に届かなければ 1。"""
import sys, os, copy, json, subprocess, re
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from lxml import etree

W = os.path.dirname(os.path.abspath(__file__)); FX = os.path.join(W, 'fixtures')
BASE = os.path.join(FX, 'bad_base_note.pptx')
BASE_T = os.path.join(FX, 'bad_base_hanrei.pptx')
IMG = os.path.join(FX, 'bad_diagram.png')  # 相関図を画像にしたもの
LINT = os.path.join(os.path.dirname(W), 'deck_lint.py')
SI = 3  # 改変する枚（1枚目は表紙、2枚目は目次）
OUT = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else None


def shp(s, name):
    for sh in s.shapes:
        if sh.name == name: return sh
    raise KeyError(name)


def frames(s):
    return [sh for sh in s.shapes if sh.name == 'frame']


def set_par(sh, k, text, size=None):
    p = sh.text_frame.paragraphs[k]
    r0 = p.runs[0]
    for r in p.runs[1:]: r._r.getparent().remove(r._r)
    for br in p._p.findall('{http://schemas.openxmlformats.org/drawingml/2006/main}br'): p._p.remove(br)
    parts = text.split('\v')
    r0.text = parts[0]
    if size: r0.font.size = Pt(size)
    prev = r0._r
    for part in parts[1:]:
        br = etree.SubElement(p._p, '{http://schemas.openxmlformats.org/drawingml/2006/main}br')
        rpr = r0._r.find('{http://schemas.openxmlformats.org/drawingml/2006/main}rPr')
        if rpr is not None: br.append(copy.deepcopy(rpr))
        prev.addnext(br)
        nr = copy.deepcopy(r0._r); nr.find('{http://schemas.openxmlformats.org/drawingml/2006/main}t').text = part
        br.addnext(nr); prev = nr


def all_runs(s):
    for sh in s.shapes:
        if sh.has_text_frame:
            for p in sh.text_frame.paragraphs:
                for r in p.runs: yield sh, r


def strip_breaks(prs):
    A = '{http://schemas.openxmlformats.org/drawingml/2006/main}'
    for s in prs.slides:
        for sh in s.shapes:
            if sh.has_text_frame:
                for p in sh.text_frame.paragraphs:
                    for br in p._p.findall(A + 'br'): p._p.remove(br)


CASES = {}
def case(name, target, base=BASE, si=SI):
    def deco(f): CASES[name] = (f, target, base, si); return f
    return deco

# ---- 改行 ----
@case('break-explicit-midword', 'bad-break')
def _(p, s): set_par(shp(s, 'Text 4'), 0, '◎建物を壊す損\v失を避けるための制度')

@case('break-explicit-keepword', 'bad-break')
def _(p, s): set_par(frames(s)[0], 1, '法定地\v上権は、設定の時に建物があり、土地と建物が同じ人のものだった場合に成立する')

@case('break-explicit-short', 'short-line')
def _(p, s): set_par(shp(s, 'Text 4'), 0, '◎建物を壊す損失を避けるための制度で\vある')

for wid in (3.3, 3.6, 4.1):
    def mk(wid):
        def f(p, s):
            t = shp(s, 'Text 4'); t.width = Inches(wid)
            set_par(t, 1, '◎成否は、抵当権者が設定の時に予測できたことで決まる', 18)
        return f
    CASES[f'break-render-w{wid}'] = (mk(wid), 'render-break|render-short|render-wrap', BASE, SI)
    def mk2(wid):
        def f(p, s):
            strip_breaks(p)
            t = shp(s, 'Text 4'); t.width = Inches(wid)
            set_par(t, 1, '◎成否は、抵当権者が設定の時に予測できたことで決まる', 18)
        return f
    CASES[f'break-render-nobr-w{wid}'] = (mk2(wid), 'render-break|render-short|render-wrap', BASE, SI)

# ---- はみ出し ----
@case('overflow-frame', 'render-outside|text-overflow|below-body')
def _(p, s):
    f = frames(s)[1]
    set_par(f, 1, '要件①②を「設定の時」で判断することを、最初に書く\v次に要件③④を確かめる\v特段の事情を検討する\v最後に結論を書く')

@case('overflow-offslide', 'out-of-slide')
def _(p, s): shp(s, 'Text 4').left = Inches(7.5)

@case('overflow-box-noborder', 'render-outside|text-overflow')
def _(p, s):
    t = shp(s, 'Text 4'); t.height = Inches(0.4)

# ---- 文字の大きさ ----
for pt, tgt in ((13, 'font-small'), (11, 'font-small'), (10, 'font-small'), (8, 'font-floor')):
    def mk(pt):
        def f(p, s):
            for sh, r in all_runs(s):
                if sh.name not in ('heading', 'section') and 'Slide Number' not in sh.name: r.font.size = Pt(pt)
        return f
    CASES[f'font-all-{pt}pt'] = (mk(pt), tgt, BASE, SI)

@case('font-part-11pt', 'font-small')
def _(p, s):
    for r in shp(s, 'Text 4').text_frame.paragraphs[0].runs: r.font.size = Pt(11)

# ---- 余白 ----
@case('sparse', 'sparse')
def _(p, s):
    for sh in [shp(s, 'Text 4'), frames(s)[1]]: sh._element.getparent().remove(sh._element)

@case('frame-empty', 'frame-empty')
def _(p, s):
    shp(s, 'Text 4')._element.getparent().remove(shp(s, 'Text 4')._element)
    f = frames(s)[1]; f.top = Inches(2.65); f.height = Inches(2.5)

@case('frame-empty-big', 'frame-empty|sparse')
def _(p, s):
    for sh in [shp(s, 'Text 4'), frames(s)[1]]: sh._element.getparent().remove(sh._element)
    f = frames(s)[0]; f.height = Inches(4.2)

# ---- 仮の文字 ----
@case('todo', 'placeholder')
def _(p, s): set_par(shp(s, 'Text 4'), 2, '◎ _todo 判例の書誌を確かめる')

@case('placeholder-role', 'placeholder')
def _(p, s): set_par(shp(s, 'Text 4'), 2, '◎（役割）')

@case('workflow-note', 'placeholder')
def _(p, s): set_par(shp(s, 'Text 4'), 2, '※ 登載誌は、判例検索で確かめてから書く。')

@case('workflow-note2', 'placeholder')
def _(p, s): set_par(shp(s, 'Text 4'), 2, '◎ ここに設例の結論を入れる')

# ---- 画像の図 ----
@case('picture-big', 'picture')
def _(p, s): s.shapes.add_picture(IMG, Inches(5.5), Inches(2.6), Inches(4.0), Inches(2.25))

@case('picture-small-diagram', 'picture')
def _(p, s): s.shapes.add_picture(IMG, Inches(8.3), Inches(2.7), Inches(1.25), Inches(0.7))

@case('picture-tiles', 'picture')
def _(p, s):
    for k in range(3):
        s.shapes.add_picture(IMG, Inches(5.6 + k * 1.25), Inches(2.7), Inches(1.25), Inches(0.7))

# ---- 色 ----
@case('color-offpalette', 'off-palette')
def _(p, s):
    for r in shp(s, 'Text 4').text_frame.paragraphs[0].runs: r.font.color.rgb = RGBColor(0x00, 0x55, 0xFF)

@case('color-accent-all', 'accent-heavy')
def _(p, s):
    for sh, r in all_runs(s):
        if sh.name not in ('heading', 'section') and 'Slide Number' not in sh.name: r.font.color.rgb = RGBColor(0x94, 0x35, 0x22)

@case('color-palette-carnival', 'off-palette|accent-heavy|decoration|fill-dark', BASE_T, 3)
def _(p, s):
    # 配色の中の色だけで、塗りと文字をばらばらに使う（濃い地に白字、灰の地、強調の地）
    cols = [RGBColor(0x17, 0x40, 0x3F), RGBColor(0xC2, 0x54, 0x3A), RGBColor(0x8A, 0x94, 0x93)]
    k = 0
    for sh in s.shapes:
        if sh.name == 'frame':
            sh.fill.solid(); sh.fill.fore_color.rgb = cols[k % 3]; k += 1
            for pp in sh.text_frame.paragraphs:
                for r in pp.runs: r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

# ---- 飾り・重なり・見出し・文字量 ----
@case('decoration-roundrect', 'decoration')
def _(p, s):
    f = frames(s)[0]
    f._element.spPr.find('{http://schemas.openxmlformats.org/drawingml/2006/main}prstGeom').set('prst', 'roundRect')

@case('overlap', 'overlap')
def _(p, s): shp(s, 'Text 4').top = Inches(1.15)

@case('heading-long', 'heading-long')
def _(p, s): set_par(shp(s, 'heading'), 0, '9. まとめ：法定地上権の成立要件と共同抵当の後の建替えの扱い')

@case('density', 'density')
def _(p, s):
    t = shp(s, 'Text 4')
    set_par(t, 0, '◎' + '建物を壊す損失を避けるための制度であり、土地と建物を別の不動産とする日本法に特有の仕組みである。' * 3, 10)
    set_par(t, 1, '◎' + '成否は、抵当権者が設定の時に予測できたことで決まる。設定後の事情は原則として考えない。' * 3, 10)


def run(name, outdir):
    f, target, base, si = CASES[name]
    prs = Presentation(base)
    f(prs, prs.slides[si - 1])
    out = os.path.join(outdir, name + '.pptx')
    prs.save(out)
    js = out[:-5] + '.lint.json'
    subprocess.run([sys.executable, LINT, out, '--json', js], capture_output=True, text=True, timeout=300)
    d = json.load(open(js, encoding='utf-8'))
    hits = [x for x in d['findings'] if x['slide'] == si and re.fullmatch(target, x['code'])]
    other = [x for x in d['findings'] if x['slide'] == si and not re.fullmatch(target, x['code'])]
    return dict(case=name, target=target, hits=[(x['sev'], x['code'], x['msg'][:60]) for x in hits],
                other=[(x['sev'], x['code'], x['msg'][:50]) for x in other])


if __name__ == '__main__':
    import tempfile
    names = [a for i, a in enumerate(sys.argv[1:]) if not a.startswith('--') and sys.argv[i] != '--out'] or list(CASES)
    outdir = OUT or tempfile.mkdtemp(prefix='badcases_'); os.makedirs(outdir, exist_ok=True)
    res = []
    for n in names:
        r = run(n, outdir); res.append(r)
        sev = 'E' if any(h[0] == 'E' for h in r['hits']) else ('W' if r['hits'] else '-')
        r['sev'] = sev
        print(f"{sev}  {n:28s} {r['hits'][:1]}", flush=True)
    json.dump(res, open(os.path.join(outdir, 'results.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    det = sum(r['sev'] != '-' for r in res); err = sum(r['sev'] == 'E' for r in res)
    print(f'検出 {det}/{len(res)}（うち error {err}）。結果：{outdir}/results.json')
    sys.exit(0 if det >= -(-len(res) * 9 // 10) else 1)
