#!/usr/bin/env python3
"""発表スライド（.pptx）の体裁を検査する。python-pptx が必要。描画後の検査には LibreOffice（soffice）と poppler（pdftotext）を使う。
usage: deck_lint.py DECK.pptx [--json out.json] [--theme teal|mono] [--strict] [--draft]
                    [--no-render] [--keep-pdf DIR] [--allow-pictures] [--no-pictos]
検査（E＝直す、W＝確かめる）。閾値は、完成版として認められた発表資料（48枚）が error 0 で通るように較正してある（09-quality-rubric.md）。
 形
  E out-of-slide     図形・文字がスライドの外にはみ出している
  E below-body       枠・文字が、本文の領域の下（頁番号の所）まではみ出している
  E text-overflow    文字が枠の高さに収まらない見込み（描画後の検査ができないときだけ。行ごとの文字サイズで見積もる）
  E font-floor       9pt 未満の文字
  E font-small       役割ごとの下限を下回る文字（本文・条文 14.5pt、表 13pt、図の中の短い注 10pt。灰色の注は font-floor の 9pt）
                     W  12pt 未満の黒い文章（25字以上の箱）が、その枚の文字の 25% を超える
  E density          1枚の文字数が 420 字を超える　／　W density  330 字を超える
  W sparse           本文の領域の下 35% に何もない（内容を足すか、前後の枚とまとめる）。45% を超えたら E（参考文献の枚は W どまり。閾値は lib/severity.json で build_deck.js と共通）
  W hidden-slide     非表示の枚。描画の頁の対応を補正し、その枚は描画後の検査をしない
  W frame-empty      枠の中の文字の実際の高さが、枠の高さの 45% に満たない（枠が広がりすぎ）。35% 未満は E
  E off-palette      決めた色以外の色（文字・線・塗り）。黒 #000000 は表の罫線などに使われるので許す
  E picture          大きな画像が貼られている（1.3 インチを超える。図は図形で描く）。小さい単色のピクト画像（正方形・1.1 インチ以下・20KB 以下）は許す
                     ピクトでも、横長・細かい画像（図や表の縮小）・同じ画像の並び・1枚の合計 3.5 平方インチ超は E
  E fill-dark        配色の中の濃い色で枠を塗っている（2か所以上か 1.5 平方インチ超。0.4 超は W）。目次の帯・ピクトは除く
                     （--no-pictos でピクト画像も error、--allow-pictures で画像をすべて許す）
  E decoration       影・角丸の四角・グラデーション・bullet 機能
  E overlap          文字どうしが重なっている（描画後の文字の位置で比べる。描画できないときは箱の見積りで比べる）
  E bad-break        指定した改行が、語・条文番号・判例の表記の途中に入っている（lib/textfit.js と同じ決まりで調べる）
  E short-line       指定した改行で、1〜2字だけの行ができている
  E placeholder      仮の文字・作業の印・作る人への指示文が残っている（「（役割）」「（…を1行で）」「_todo」「TODO」「要確認」「（仮）」
                     「ここに…を入れる」「〜てから書く」「※作成者」「※…確かめ」など）。--draft なら W
  W cover-unset      表紙の報告者・発表日などが仮の文字のまま（渡すときに伝える）
 描画後（PDF にして文字の位置を読む。--no-render で省く）
  E render-break     指定していない改行が、語・条文番号・判例の表記の途中に入った（条文の引用の中で、keep 語・番号に触れない折り返しだけ W）
  E render-short     指定していない改行で、1〜2字だけの行ができた（同上）
  W render-wrap      指定していない改行がある（文節の切れ目）。1枚につき1件にまとめる
  E render-outside   文字が、囲みの枠の外に出ている　／　W  枠線のない文字の箱から 0.1 インチを超えて出ている（0.3 インチ超は E）
 構成
  W heading-order    見出しの番号が戻る・飛ぶ
  W no-heading       見出しのないスライド（表紙・目次を除く）
  W heading-long     見出しが全角 25 字分を超える（2行になる）。27 字分を超えたら E
  W bold-ratio       太字でない文字が 40% を超える（条文・参考文献・注を除く）
  W accent-heavy     強調の色の文字が、その枚の文字の 40% を超える。70% を超えたら E
  W new-arrows       太い矢印（新しい関係、4pt）が1枚に5本以上（段を分ける）
  W notes-missing    発表原稿（ノート）のないスライドがある（一部にだけ原稿があるとき）
終了コード：E が1件でもあれば 1。--strict なら W でも 1。"""
import sys, os, json, re, zipfile, html, shutil, subprocess, tempfile, hashlib
from pptx import Presentation

# 作成（build_deck.js）と検査で重さをそろえる決まり。lib/severity.json が正
_SEV = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib', 'severity.json'), encoding='utf-8'))

THEMES = {
    'teal': {'1A1A1A', '2F6F6C', '17403F', 'C2543A', 'E3EDEB', '8A9493', 'D0D6D5', 'FFFFFF'},
    'mono': {'1A1A1A', '943522', 'EDEFEF', '8C9493', 'C9CECD', 'FFFFFF'},
}
ALWAYS_OK = {'000000'}          # 表の既定の罫線・黒。完成版でも使われている
ACCENTS = ('C2543A', '943522')
GRAYS = ('8A9493', '8C9493')
IN = 914400.0
BODY_Y, BODY_H = 0.95, 4.2      # 本文の領域（tokens.js の GRID.body）
BELOW_MAX = 5.45                # これより下に枠・文字があれば、はみ出し（完成版の最大は 5.41）
PICTO_MAX = 1.3                 # これ以下の画像はピクトとして許す（完成版は 0.6〜1.1）
LIMIT = {'density_e': 420, 'density_w': 330, 'heading': 25.0, 'new_arrows': 5, 'bold': 0.40, 'accent': 0.40, 'small': 0.25,
         'sparse': _SEV['sparse']['warn'], 'sparse_e': _SEV['sparse']['error'], 'frame_fill': 0.45, 'frame_fill_e': 0.35, 'accent_e': 0.70, 'heading_e': 27.0, 'outside_e': 0.30}
# 役割ごとの文字の下限（pt）。完成版 48 枚の実測：本文（黒・25字以上の箱）の最小 14.5、表 13、図の中の短い注 10、灰色の注 9
FLOOR = {'body': 14.5, 'table': 13.0, 'label': 10.0}
BODY_W = 4.5                    # これより狭く、60字未満の箱は「図の中の注」として扱う
SMALL_OK = ('role', 'arrowLabel', 'axisLabel', 'refs', 'note', 'date', 'coverInfo', 'diagramNote', 'actorBox', 'symbol', 'picto')
DARK = {'17403F', '2F6F6C', 'C2543A', '943522', '8A9493', '8C9493', '1A1A1A'}   # 濃い色。塗りに使うのは目次の帯など決まった所だけ
PICTO_SIDE, PICTO_BYTES, PICTO_AREA = 1.1, 20000, 3.5   # 完成版のピクト：正方形 0.6〜1.1in、6KB 以下、1枚の合計 2.94 平方in
STATUTE_HEAD = re.compile(r'^\s*(?:[一-鿿]{1,10}法)\s*[0-9０-９]+条')

PLACEHOLDER = re.compile(
    r'（役割）|（関係）|（説明）|（題）|（見出し）|（[^（）]{0,30}(?:1行|１行|一行|2行|２行)で[^（）]{0,8}）'
    r'|（[^（）]{0,40}(?:確認して書く|確かめて書く|を書く|を足す|を入れる|に直す|を選ぶ|未定|未記入|要確認)[^（）]{0,10}）'
    r'|_todo|TODO|FIXME|【要確認】|【未確認】|〔要確認〕|【仮】|（仮）|〔仮〕|XXX|lorem ipsum|要確認|未確認のまま'
    # 作業の指示文（作る人への覚え書き）。発表の画面に出してはいけない
    r'|ここに[^。\n]{0,24}(?:入れる|入る|書く|置く|貼る|足す)|[^。\n]{0,30}てから書く|確かめてから|確認してから(?:書く|入れる)'
    r'|※\s*作成者|※[^。\n]{0,40}(?:確かめ|確認す|調べて|差し替え)|(?:あとで|後で)(?:書く|直す|足す|確かめる)', re.I)
COVER_UNSET = re.compile(r'（報告者）|（発表日）|（所属[^（）]*）|（氏名）')

# ---- 文字の幅と、切ってよい位置（lib/textfit.js と同じ決まり） ----
KEEP = ['特段の事情', '背信的行為', '信頼関係', '善意の第三者', '悪意の第三者', '権利の濫用', '信義則', '公序良俗', '正当な理由', '正当の事由', '相当の期間',
        '訴えの利益', '法律上の利益', '当事者の一方', '第三者', '被上告人', '被控訴人', '上告人', '控訴人', '法定地上権', '根抵当権', '抵当権', '一部判決',
        '共同訴訟', '必要的共同訴訟', '通常共同訴訟', '合一確定', '既判力', '弁論の分離', '訴訟資料', '証拠共通', '主張共通', '利益相反', '代理権の濫用']
NO_HEAD = '、。，．・）〕］｝」』】〉》：；！？ー―…‥々ゝゞぁぃぅぇぉっゃゅょァィゥェォッャュョ)]}%％'
NO_TAIL = '（〔［｛「『【〈《([{'
COMPOUND_KANA = 'きりしいちみびぎえけせてれめべげね'
STRONG = 'はがをにへでともや'


def is_hira(c): return 'ぁ' <= c <= 'ゖ'
def is_kata(c): return ('゠' <= c <= 'ヿ') or c == 'ー'
def is_kanji(c): return ('一' <= c <= '鿿') or c in '々〇ヶ'
def is_ascii(c): return '!' <= c <= '~'
def is_alnum(c): return c.isascii() and c.isalnum() or ('０' <= c <= '９') or ('Ａ' <= c <= 'Ｚ') or ('ａ' <= c <= 'ｚ')


def cw(ch):
    c = ord(ch)
    if c <= 0x20: return 0.3
    if c < 0x7f:
        if ch in "ilI.,:;'|!": return 0.28
        if ch in 'MW@': return 0.85
        if ch.isdigit(): return 0.56
        if 'A' <= ch <= 'Z': return 0.66
        return 0.54
    if 0xff61 <= c <= 0xff9f: return 0.5
    return 1.0


def text_w(s):
    """全角を1とした幅。和文と英数字の境には 0.25 字分の空きを足す（LibreOffice は自動で空ける）"""
    w = 0.0; prev = ''
    for ch in s:
        w += cw(ch)
        if prev and ((is_ascii(prev) and (is_kanji(ch) or is_hira(ch) or is_kata(ch))) or (is_ascii(ch) and (is_kanji(prev) or is_hira(prev) or is_kata(prev)))): w += 0.25
        prev = ch
    return w


UNIT_RE = re.compile(
    r'(?:[一-鿿]{1,5}法)?[0-9０-９]+条(?:の[0-9０-９]+)*(?:第?[0-9０-９]+項)?(?:第?[0-9０-９]+号)?(?:本文|ただし書|前段|後段|柱書)?(?:[・〜～][0-9０-９]+(?:条|項|号)(?:の[0-9０-９]+)*)*'
    r'|(?:最大?[判決]|大判|大決|[一-鿿]{2,3}[高地]判)?(?:昭和|平成|令和|大正|明治)[0-9０-９元○]+[・.．年][0-9０-９○]+[・.．月][0-9０-９○]+日?'
    r'|(?:民集|刑集|集民|判時|判タ|金法|金判|民録|刑録)[0-9０-９]+(?:巻[0-9０-９]+)?号?[0-9０-９]*頁?'
    r'|[0-9０-９][0-9０-９,，.．]*(?:億|万|千)*(?:円|人|件|個|回|年|か月|ヶ月|箇月|月|日|時間|分|秒|％|%|歳|枚|字|行|点|倍|割|審|号|巻|頁|条|項)'
    r'|[（(][^（）()]{1,8}[）)]|「[^「」]{1,8}」')
REPORTER = re.compile(r'民集|刑集|集民|判時|判タ|金法|金判|民録|刑録')


def keep_mask(s):
    """切ってはいけない位置（i と i-1 の間）の集合"""
    mask = set()
    for m in UNIT_RE.finditer(s):
        mask.update(range(m.start() + 1, m.end()))
    for k in KEEP:
        i = s.find(k)
        while i >= 0:
            mask.update(range(i + 1, i + len(k))); i = s.find(k, i + 1)
    return mask


def break_prio(s, i, mask=None):
    """s[i-1] と s[i] の間で切ってよいか。0＝切らない（語・番号の途中）、1〜4＝切ってよい（大きいほどよい切れ目）"""
    if i <= 0 or i >= len(s): return 4
    a, b = s[i - 1], s[i]; p = s[i - 2] if i >= 2 else ''
    if mask is None: mask = keep_mask(s)
    if b in NO_HEAD or a in NO_TAIL: return 0
    if a in ' 　': return 3
    if i in mask:
        return 0
    if a in '。．！？': return 4
    if a in '、，：；': return 3
    if a in '）」』】〉》］〕)': return 0 if is_hira(b) else 3
    if b in '→⇒⇨': return 3
    if a in '／＝': return 2
    if a in '→⇒⇨◎・●○◆■□※' or ('①' <= a <= '⑳'): return 1 if (a == '・' and i >= 2 and not is_alnum(p)) else 0
    if is_hira(a):
        if is_hira(b): return 0
        if is_kanji(b) and is_kanji(p) and a in COMPOUND_KANA: return 0          # 建て替え・取り消し・引き渡し
        if a in 'おご' and not is_hira(p): return 0
        return 2 if a in STRONG else 1
    if is_alnum(a): return 1 if REPORTER.match(s, i) else 0
    if is_kanji(a) or is_kata(a):
        if b in '（「『〈【': return 1
        return 0
    return 0


def norm(t):
    return re.sub(r'[\s　 ​]+', '', t or '')


# ---- pptx の読み取り ----
def para_lines(p):
    """段落を、指定された改行（a:br）で分けた行の列にする。[(文字列, その行の最大 pt, 太字の字数, 字数)]"""
    lines = [['', 0.0]]
    for ch in p._p:
        tag = ch.tag.split('}')[1]
        if tag == 'br': lines.append(['', 0.0])
        elif tag in ('r', 'fld'):
            t = ''.join(x.text or '' for x in ch if x.tag.endswith('}t'))
            sz = None
            rpr = next((x for x in ch if x.tag.endswith('}rPr')), None)
            if rpr is not None and rpr.get('sz'): sz = int(rpr.get('sz')) / 100
            lines[-1][0] += t
            if sz and t.strip(): lines[-1][1] = max(lines[-1][1], sz)
    return [(t, pt) for t, pt in lines]


def line_spacing_pt(p):
    m = re.search(r'<a:lnSpc><a:spcPts val="(\d+)"', p._p.xml) if hasattr(p._p, 'xml') else None
    return int(m.group(1)) / 100 if m else None


def space_after_pt(p):
    m = re.search(r'<a:spcAft><a:spcPts val="(\d+)"', p._p.xml) if hasattr(p._p, 'xml') else None
    return int(m.group(1)) / 100 if m else 0.0


def rgb_of(font):
    try:
        c = font.color
        if c is not None and c.type is not None and c.rgb is not None: return str(c.rgb)
    except Exception:
        pass
    return None


def has_border(sh):
    try:
        return sh.line.fill.type is not None and (sh.line.width or 0) > 0
    except Exception:
        return False


# ---- 描画（PDF にして文字の位置を読む） ----
def render(pptx, keep=None):
    """戻り値：(頁ごとの語の列 [(文字列, x0, y0, x1, y1)]（インチ）, 置き換わった書体の説明) か (None, 理由)"""
    so = shutil.which('soffice') or shutil.which('libreoffice'); p2t = shutil.which('pdftotext')
    if not so or not p2t: return None, 'soffice か pdftotext が無い'
    tmp = tempfile.mkdtemp(prefix='decklint_')
    try:
        prof = os.path.join(tmp, 'profile')
        r = subprocess.run([so, f'-env:UserInstallation=file://{prof}', '--headless', '--convert-to', 'pdf', '--outdir', tmp, os.path.abspath(pptx)],
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=300)
        pdf = os.path.join(tmp, os.path.splitext(os.path.basename(pptx))[0] + '.pdf')
        if not os.path.exists(pdf): return None, 'PDF にできなかった'
        xml = os.path.join(tmp, 'bbox.html')
        subprocess.run([p2t, '-bbox-layout', pdf, xml], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120)
        data = open(xml, encoding='utf-8', errors='ignore').read()
        pages = []
        for chunk in re.split(r'<page ', data)[1:]:
            words = []
            for m in re.finditer(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', chunk, re.S):
                x0, y0, x1, y1 = (float(m.group(k)) / 72 for k in (1, 2, 3, 4))
                words.append((html.unescape(m.group(5)), x0, y0, x1, y1))
            pages.append(words)
        if keep:
            os.makedirs(keep, exist_ok=True); shutil.copy(pdf, os.path.join(keep, os.path.basename(pdf)))
        return pages, None
    except Exception as e:
        return None, f'描画に失敗（{type(e).__name__}）'
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def font_note(faces):
    fc = shutil.which('fc-match')
    if not fc: return None
    out = []
    for f in sorted(faces):
        try:
            got = subprocess.run([fc, '-f', '%{family}', f], stdout=subprocess.PIPE, timeout=20).stdout.decode('utf8', 'ignore').split(',')[0]
            if got and got.lower() != f.lower(): out.append(f'{f} → {got}')
        except Exception:
            pass
    return '、'.join(out) if out else None


def merge_words(words):
    """隣り合う語（すき間が小さい）をつないで、ひと続きの文字列にする。重なっている語はつながない。[(文字列, x0, y0, x1, y1)]"""
    segs = []
    for w in sorted(words, key=lambda w: (round((w[2] + w[4]) / 2, 2), w[1])):
        cy = (w[2] + w[4]) / 2; h = w[4] - w[2]
        for s in segs:
            sh = s[4] - s[2]
            if abs((s[2] + s[4]) / 2 - cy) < max(sh, h) * 0.4 and -0.03 <= w[1] - s[3] <= max(sh, h) * 0.6:
                s[0] += w[0]; s[3] = max(s[3], w[3]); s[2] = min(s[2], w[2]); s[4] = max(s[4], w[4]); break
        else:
            segs.append([w[0], w[1], w[2], w[3], w[4]])
    return [tuple(s) for s in segs]


def cluster_lines(segs):
    """同じ箱に入った文字列を、高さの近いものどうしで行にまとめる（全角の空きで分かれた語を1行に戻す）。[(文字列, x0, y0, x1, y1)]"""
    rows = []
    for w in sorted(segs, key=lambda w: ((w[2] + w[4]) / 2, w[1])):
        cy = (w[2] + w[4]) / 2
        for r in rows:
            if abs(r['cy'] - cy) < max(0.05, (r['y1'] - r['y0']) * 0.4): r['ws'].append(w); r['y0'] = min(r['y0'], w[2]); r['y1'] = max(r['y1'], w[4]); break
        else:
            rows.append({'cy': cy, 'y0': w[2], 'y1': w[4], 'ws': [w]})
    out = []
    for r in rows:
        ws = sorted(r['ws'], key=lambda w: w[1])
        out.append((''.join(w[0] for w in ws), min(w[1] for w in ws), r['y0'], max(w[3] for w in ws), r['y1']))
    return out


def check_breaks(pl, si, add):
    """指定した改行（a:br）が、語・番号の途中に入っていないか。続きの行の字下げは外して調べる"""
    if len(pl) < 2: return
    parts = [pl[0][0]] + [re.sub(r'^[ 　]+', '', t) for t, _ in pl[1:]]
    joined = ''.join(parts); k = 0; mask = keep_mask(joined)
    for a_, b_ in zip(parts, parts[1:]):
        k += len(a_)
        if a_.strip() and b_.strip() and break_prio(joined, k, mask) == 0:
            add('E', 'bad-break', si, f'語・番号の途中で改行を指定している：「{joined[max(0, k - 6):k]}／{joined[k:k + 6]}」')
    for t_ in parts:
        if 0 < len(re.sub(r'[、。，．）」』（「『・…\s　]', '', t_)) <= 2 and len(joined) > 6:
            add('E', 'short-line', si, f'1〜2字だけの行を指定している：「{t_}」（{joined[:14]}…）')


def main():
    argv = sys.argv[1:]
    valued = ('--json', '--theme', '--keep-pdf')
    args = [a for i, a in enumerate(argv) if not a.startswith('--') and not (i > 0 and argv[i - 1] in valued)]
    if not args:
        print(__doc__); sys.exit(2)
    opt = lambda n: argv[argv.index(n) + 1] if n in argv else None
    draft = '--draft' in argv
    prs = Presentation(args[0])
    SW, SH = prs.slide_width / IN, prs.slide_height / IN
    theme = opt('--theme')
    raw = zipfile.ZipFile(args[0])
    names = set(raw.namelist())
    allxml = ''.join(raw.read(n).decode('utf8', 'ignore') for n in names if n.startswith('ppt/slides/slide'))
    if not theme: theme = 'teal' if '2F6F6C' in allxml or 'C2543A' in allxml else 'mono'
    palette = THEMES[theme] | ALWAYS_OK
    explicit = '<a:br' in allxml           # 改行を指定している資料か（build_deck.js の出力は指定している）
    pages, why = (None, '--no-render') if '--no-render' in argv else render(args[0], opt('--keep-pdf'))
    faces = set(re.findall(r'<a:(?:latin|ea) typeface="([^"+][^"]*)"', allxml))
    subst = font_note(faces) if pages is not None else None

    findings = []
    add = lambda sev, code, slide, msg: findings.append({'sev': sev, 'code': code, 'slide': slide, 'msg': msg})
    last_no = 0; notes_have = []; stats = []
    # 非表示の枚（show="0"）は LibreOffice が PDF に出さないので、描画の頁は表示する枚だけで数える
    hidden = [s_._element.get('show') in ('0', 'false') for s_ in prs.slides]
    page_of = {}; pg = 0
    for i_, h_ in enumerate(hidden, 1):
        if not h_: page_of[i_] = pg; pg += 1
    if pages is not None and len(pages) == len(hidden) and pg != len(hidden):
        page_of = {i_: i_ - 1 for i_ in range(1, len(hidden) + 1)}; pg = len(hidden)   # 非表示の枚も PDF に出た場合
    if pages is not None and len(pages) != pg:
        add('W', 'render-pages', 0, f'描画の頁数（{len(pages)}）が表示する枚の数（{pg}）と合わない。描画後の検査は頁の対応が確かな所だけ見る')
    for si, slide in enumerate(prs.slides, 1):
        if hidden[si - 1]: add('W', 'hidden-slide', si, '非表示の枚。描画後の検査はしていない（発表で出さないなら消す。出すなら表示に戻す）')
        key = f'ppt/slides/slide{si}.xml'
        xml = raw.read(key).decode('utf8', 'ignore') if key in names else ''
        if '<a:outerShdw' in xml or '<a:innerShdw' in xml: add('E', 'decoration', si, '影が付いている')
        if 'prst="roundRect"' in xml: add('E', 'decoration', si, '角丸の四角がある（白地＋枠線の四角にする）')
        if '<a:gradFill' in xml: add('E', 'decoration', si, 'グラデーションがある')
        if '<a:buChar' in xml or '<a:buAutoNum' in xml: add('E', 'decoration', si, 'bullet 機能を使っている（行頭記号は ◎・→ を文字で書く）')
        for m in sorted(set(x.upper() for x in re.findall(r'srgbClr val="([0-9A-Fa-f]{6})"', xml))):
            if m not in palette: add('E', 'off-palette', si, f'決めた色以外の色 #{m}（配色 {theme}）')

        heading = ''; chars = 0; nb = 0; nbold = 0; nacc = 0; nall = 0; nsmall = 0; pictos = 0
        low = {}      # 役割ごとの、下限を下回った最小の文字：{'body'|'table'|'label': (pt, 文字列)}
        def under(role, pt, txt):
            if pt < FLOOR[role] and (role not in low or pt < low[role][0]): low[role] = (pt, norm(txt)[:14])
        pics = []; dark = []
        T = []        # 文字の箱：{name,x,y,w,h,lines:[(文字列,pt)],full,border,anchor,kind}
        frames = []   # 枠線のある四角（文字なし）：(x,y,w,h)
        solid_bottom = 0.0
        for sh in slide.shapes:
            if sh.left is None: continue
            x, y, w, h = sh.left / IN, sh.top / IN, sh.width / IN, sh.height / IN
            name = sh.name or ''
            if x < -0.02 or y < -0.02 or x + w > SW + 0.02 or y + h > SH + 0.02:
                add('E', 'out-of-slide', si, f'「{name}」がスライドの外に出ている（x={x:.2f}, y={y:.2f}, w={w:.2f}, h={h:.2f}）')
            if sh.shape_type == 13:
                big = max(w, h) > PICTO_MAX
                try: blob = sh.image.blob
                except Exception: blob = b''
                pics.append((w, h, hashlib.md5(blob).hexdigest(), len(blob)))
                if '--allow-pictures' not in argv:
                    asp = max(w, h) / max(0.01, min(w, h))
                    if big or '--no-pictos' in argv:
                        add('E', 'picture', si, f'画像が貼られている（{w:.1f}×{h:.1f}）。図は図形で描く' if big else f'ピクトの画像（{w:.1f}×{h:.1f}）。--no-pictos が指定されている')
                    elif asp > 1.3 or max(w, h) > PICTO_SIDE:
                        add('E', 'picture', si, f'小さな図の画像（{w:.2f}×{h:.2f}in）。ピクトは正方形で {PICTO_SIDE}in まで。関係図・表は画像にせず図形で描く')
                    elif len(blob) > PICTO_BYTES:
                        add('E', 'picture', si, f'細かい画像（{len(blob) // 1000}KB、{w:.2f}in）。ピクトは単色の簡単な絵だけ。図や写真の縮小は使わない')
                pictos += 0 if big else 1
                solid_bottom = max(solid_bottom, y + h); continue
            if getattr(sh, 'has_table', False) and sh.has_table:
                tb = sh.table; cx = x
                th = sum(r.height for r in tb.rows) / IN
                solid_bottom = max(solid_bottom, y + th)
                for ci, col in enumerate(tb.columns):
                    cwid = col.width / IN; col_lines = []
                    for row in tb.rows:
                        cell = row.cells[ci]
                        lines = []
                        for p in cell.text_frame.paragraphs:
                            check_breaks(para_lines(p), si, add)
                            for t, pt in para_lines(p):
                                lines.append((t, pt or 14))
                                if pt and pt < 9 and t.strip(): add('E', 'font-floor', si, f'表に {pt}pt の文字')
                                elif pt and t.strip(): under('table', pt, t)
                        txt = ''.join(t for t, _ in lines)
                        chars += len(norm(txt)); nall += len(norm(txt))
                        for p in cell.text_frame.paragraphs:
                            for r in p.runs:
                                if (rgb_of(r.font) or '') in ACCENTS: nacc += len(norm(r.text))
                        m = PLACEHOLDER.search(txt)
                        if m: add('W' if draft else 'E', 'placeholder', si, f'仮の文字が残っている：「{m.group(0)}」（表）')
                        col_lines.extend(lines)
                    # 表は、行の高さが描画で決まるので、列ごとにまとめて照らす
                    if any(t.strip() for t, _ in col_lines):
                        T.append({'name': 'column', 'x': cx, 'y': y, 'w': cwid, 'h': SH - y, 'lines': col_lines, 'full': '\n'.join(norm(t) for t, _ in col_lines), 'border': False, 'kind': 'cell'})
                    cx += cwid
                continue
            try:
                fc = str(sh.fill.fore_color.rgb) if sh.fill.type == 1 else None
            except Exception:
                fc = None
            if fc in DARK and w * h > 0.25 and name not in ('picto', 'tocBar') and not (x < 0.05 and h > SH - 0.1):
                dark.append((fc, w * h, bool(sh.has_text_frame and sh.text_frame.text.strip())))
            if not sh.has_text_frame or not sh.text_frame.text.strip():
                is_line = sh._element.tag.endswith('}cxnSp') or 'prst="line"' in (sh._element.xml[:1500] if hasattr(sh._element, 'xml') else '')
                if has_border(sh) and w > 0.5 and h > 0.3 and not is_line: frames.append((x, y, w, h))
                if name == 'band' or (w > 9.5 and h > 0.8 and y > 2.5): solid_bottom = max(solid_bottom, y + h)
                elif w > 0.05 and h > 0.05 and y > 0.8 and name != 'rule': solid_bottom = max(solid_bottom, y + h)
                elif (w > 0.3 or h > 0.3) and y > 0.85: solid_bottom = max(solid_bottom, y + h)     # 線・矢印
                continue
            tfm = sh.text_frame; text = tfm.text
            lines = []; gaps = 0.0; fixed = None
            for p in tfm.paragraphs:
                pl = para_lines(p)
                lines.extend((t, pt) for t, pt in pl)
                gaps += space_after_pt(p); fixed = fixed or line_spacing_pt(p)
                if name not in ('arrowLabel', 'role', 'axisLabel', 'coverInfo', 'diagramNote', 'actorBox'): check_breaks(pl, si, add)
            sizes = [pt for t, pt in lines if pt and t.strip()]
            maxpt = max(sizes or [0])
            runs = [(r.font.size.pt if r.font.size else None, len(norm(r.text)), bool(r.font.bold), rgb_of(r.font) or '') for p in tfm.paragraphs for r in p.runs]
            gray = any(c in GRAYS for _, n, _, c in runs if n)
            # このビルダー以外で作ったスライドも見られるよう、名前がなければ位置と大きさで役割を推定する
            if name not in ('heading', 'section'):
                if sh.is_placeholder and y < 0.8 and h < 0.9 and w > 3: name = 'heading'
                elif y < 0.75 and maxpt >= 18 and h < 0.8 and not heading and si > 1: name = 'heading'
                elif y < 0.75 and x > 6 and 0 < maxpt <= 12: name = 'section'
            if name.startswith('Slide Number'): continue
            if name == 'heading': heading = text
            border = has_border(sh)
            if name not in ('heading', 'section'):
                n = len(norm(text)); chars += n
                for pt, k, b, c in runs:
                    nall += k; nacc += k if c in ACCENTS else 0
                    if name not in ('statute', 'refs', 'role', 'coverInfo', 'note', 'tfBody') and c not in GRAYS:
                        nb += k; nbold += k if b else 0
                    if pt and pt < 12 and c not in GRAYS and maxpt < 12 and n >= 25 and name not in ('role', 'arrowLabel', 'axisLabel', 'refs', 'note', 'date'): nsmall += k
                    if pt and k and c not in GRAYS and name not in SMALL_OK:
                        if n >= 25 and (w >= BODY_W or n >= 60): under('body', pt, text)
                        else: under('label', pt, text)
            for pt in sorted(set(s for s in sizes if s < 9)): add('E', 'font-floor', si, f'「{norm(text)[:12]}…」に {pt}pt の文字（下限 9pt）')
            m = PLACEHOLDER.search(text)
            if m: add('W' if draft else 'E', 'placeholder', si, f'仮の文字が残っている：「{m.group(0)}」（{norm(text)[:16]}…）')
            m = COVER_UNSET.search(text)
            if m: add('W', 'cover-unset', si, f'仮の文字のまま：「{m.group(0)}」。config に値を入れるか、渡すときに伝える')
            ins = tfm.margin_left / IN + tfm.margin_right / IN if tfm.margin_left is not None and tfm.margin_right is not None else 0.2
            vin = tfm.margin_top / IN + tfm.margin_bottom / IN if tfm.margin_top is not None and tfm.margin_bottom is not None else 0.1
            anc = str(tfm.vertical_anchor or '')
            T.append({'name': name, 'x': x, 'y': y, 'w': w, 'h': h, 'lines': lines, 'full': norm(text), 'border': border, 'kind': 'text', 'ins': ins, 'vin': vin,
                      'gaps': gaps, 'fixed': fixed, 'anchor': 'm' if 'MIDDLE' in anc else 'b' if 'BOTTOM' in anc else 't', 'maxpt': maxpt})
            if border: solid_bottom = max(solid_bottom, y + h)

        # ---- 見積り（行ごとの文字サイズ） ----
        for t in T:
            if t['kind'] != 'text': continue
            need = 0.0
            for s, pt in t['lines']:
                pt = pt or t['maxpt'] or 16
                room = max(0.2, t['w'] - t['ins']) * 72 / pt
                n = max(1, -(-int(text_w(s) * 100) // int(room * 100)))
                need += n * (t['fixed'] or pt * 1.2) / 72
            need += max(0.0, t['gaps'] - (space_after_pt_last := 0)) / 72
            t['need'] = need
            if t['anchor'] == 'm': t['ty0'] = t['y'] + (t['h'] - need) / 2
            elif t['anchor'] == 'b': t['ty0'] = t['y'] + t['h'] - need
            else: t['ty0'] = t['y'] + t['vin'] / 2
            t['ty1'] = t['ty0'] + need

        # ---- 描画後の検査 ----
        pi_ = page_of.get(si)
        words = pages[pi_] if pages is not None and pi_ is not None and len(pages) == pg else None
        content_bottom = solid_bottom
        rboxes = []   # 描画された行の箱：(箱の番号, x0,y0,x1,y1, 文字列)
        if words is not None:
            assigned = {}
            for wd in merge_words(words):
                wt = norm(wd[0])
                if not wt: continue
                if wt == str(si) and wd[2] > SH - 0.5 and wd[1] > SW - 1.2: continue      # 頁番号
                cx, cy = (wd[1] + wd[3]) / 2, (wd[2] + wd[4]) / 2
                best = None
                for ti, t in enumerate(T):
                    if wt not in t['full']: continue
                    if not (t['x'] - 0.12 <= cx <= t['x'] + t['w'] + 0.12): continue
                    inside = t['y'] - 0.06 <= cy <= t['y'] + t['h'] + 0.06
                    dist = 0 if inside else min(abs(cy - t['y']), abs(cy - (t['y'] + t['h'])))
                    if dist > 1.2: continue
                    score = (dist, 0 if t['kind'] == 'text' else 1, t['w'] * t['h'])
                    if best is None or score < best[0]: best = (score, ti)
                if best: assigned.setdefault(best[1], []).append(wd)
            wraps = []
            for ti, ws in assigned.items():
                t = T[ti]; rl = cluster_lines(ws)
                if t['name'] not in ('heading', 'section'):
                    content_bottom = max(content_bottom, max(r[4] for r in rl))
                for r in rl: rboxes.append((ti, r[1], r[2], r[3], r[4], r[0]))
                intended = [norm(s) for s, _ in t['lines'] if norm(s)]
                iset = set(intended)
                for r in rl:
                    R = norm(r[0])
                    if not R or R in iset: continue
                    src = next((L for L in intended if L.startswith(R)), None) or next((L for L in intended if R in L), None)
                    if not src or src == R: continue
                    pos = src.find(R)
                    for k in (pos, pos + len(R)):
                        if 0 < k < len(src): wraps.append((ti, src, k, R))
                # 文字が箱の外に出ているか
                if t['kind'] == 'text' and t['name'] not in ('heading', 'section'):
                    top = min(r[2] for r in rl); bot = max(r[4] for r in rl)
                    box = (t['x'], t['y'], t['w'], t['h'])
                    if not t['border']:
                        enc = [f for f in frames if f[0] - 0.02 <= t['x'] and f[1] - 0.02 <= t['y'] and t['x'] + t['w'] <= f[0] + f[2] + 0.02 and t['y'] + t['h'] <= f[1] + f[3] + 0.02]
                        if enc: box = min(enc, key=lambda f: f[2] * f[3]); t['frame'] = box
                    over = max(box[1] - top, bot - (box[1] + box[3]))
                    if (t['border'] or t.get('frame')) and over > 0.03:
                        add('E', 'render-outside', si, f'文字が枠の外に出ている（{over:.2f}in）：「{t["full"][:16]}…」')
                    elif not t['border'] and not t.get('frame') and max(t['y'] - top, bot - (t['y'] + t['h'])) > 0.1:
                        add('E' if max(t['y'] - top, bot - (t['y'] + t['h'])) > LIMIT['outside_e'] else 'W', 'render-outside', si, f'文字が箱から出ている（{max(t["y"] - top, bot - (t["y"] + t["h"])):.2f}in）：「{t["full"][:16]}…」')
                    t['rh'] = bot - top; t['rn'] = len(rl)
            seen = set(); soft = []
            for ti, src, k, R in wraps:
                if (src, k) in seen: continue
                seen.add((src, k))
                ctx = f'{src[max(0, k - 6):k]}／{src[k:k + 6]}'
                pr = break_prio(src, k)
                short = len(re.sub(r'[、。，．）」』（「『・…]', '', R)) <= 2
                # 改行を指定していない資料でも error。例外は、条文の引用（長い地の文）の中で、語・番号の決まり（keep 語・条文番号・判例の表記）に触れない折り返しだけ
                tt = T[ti]; first = norm(tt['lines'][0][0]) if tt.get('lines') else ''
                statute_like = tt['name'] == 'statute' or (bool(STATUTE_HEAD.match(first)) and len(tt['full']) >= 60)
                hard = k in keep_mask(src)
                sev = 'E' if (explicit or hard or not statute_like) else 'W'
                if short: add(sev, 'render-short', si, f'1〜2字だけの行ができた：「{ctx}」（行「{R}」）')
                elif pr == 0: add(sev, 'render-break', si, f'語・番号の途中で改行された：「{ctx}」')
                else: soft.append(ctx)
            if soft: add('W', 'render-wrap', si, f'指定していない改行が {len(soft)} か所（例：「{soft[0]}」）。枠の幅か文字サイズの見積りを確かめる')
            # 文字どうしの重なり（描画された行の箱で比べる）
            for i in range(len(rboxes)):
                for j in range(i + 1, len(rboxes)):
                    a, b = rboxes[i], rboxes[j]
                    if a[0] == b[0]: continue
                    ox = min(a[3], b[3]) - max(a[1], b[1]); oy = min(a[4], b[4]) - max(a[2], b[2])
                    if ox > 0.04 and oy > 0.04 and ox * oy > 0.3 * min((a[3] - a[1]) * (a[4] - a[2]), (b[3] - b[1]) * (b[4] - b[2])):
                        add('E', 'overlap', si, f'「{norm(a[5])[:10]}」と「{norm(b[5])[:10]}」が重なっている')
        else:
            for t in T:
                if t['kind'] != 'text' or t['name'] in ('heading', 'section'): continue
                content_bottom = max(content_bottom, min(t['ty1'], t['y'] + t['h']) if t['anchor'] != 't' else t['ty1'])
                if t['need'] > (t['h'] - (t['vin'] if t['border'] else 0)) * 1.12 + 0.08:
                    add('E', 'text-overflow', si, f'「{t["full"][:14]}…」が枠に収まらない見込み（要る高さ {t["need"]:.2f}in、枠 {t["h"]:.2f}in）')
            bx = [t for t in T if t['kind'] == 'text' and t['name'] not in ('heading', 'section')]
            for i in range(len(bx)):
                for j in range(i + 1, len(bx)):
                    a, b = bx[i], bx[j]
                    if {a['name'], b['name']} == {'role', 'symbol'}: continue
                    ox = min(a['x'] + a['w'], b['x'] + b['w']) - max(a['x'], b['x']); oy = min(a['ty1'], b['ty1']) - max(a['ty0'], b['ty0'])
                    if ox > 0.03 and oy > 0.03 and ox * oy > 0.3 * min(a['w'] * max(0.05, a['ty1'] - a['ty0']), b['w'] * max(0.05, b['ty1'] - b['ty0'])):
                        add('E', 'overlap', si, f'「{a["full"][:10]}」と「{b["full"][:10]}」が重なっている（見積り）')

        # 枠の中の空き
        for t in T:
            if t['kind'] != 'text' or 'rh' not in t: continue
            box = (t['x'], t['y'], t['w'], t['h']) if t['border'] else t.get('frame')
            if box and box[3] > 1.3 and box[2] > 4.0 and t['rh'] / box[3] < LIMIT['frame_fill']:
                sev = 'E' if t['rh'] / box[3] < LIMIT['frame_fill_e'] else 'W'
                add(sev, 'frame-empty', si, f'枠の中が {100 - t["rh"] / box[3] * 100:.0f}% 空いている（文字 {t["rh"]:.2f}in／枠 {box[3]:.2f}in）：「{t["full"][:14]}…」。枠を詰めるか、内容を足す')

        # 文字の大きさ（役割ごとの下限）
        if 'body' in low: add('E', 'font-small', si, f'本文が {low["body"][0]}pt（下限 {FLOOR["body"]}pt）：「{low["body"][1]}…」。縮めずに、文を要約するか2枚に分ける')
        if 'table' in low: add('E', 'font-small', si, f'表の文字が {low["table"][0]}pt（下限 {FLOOR["table"]}pt）：「{low["table"][1]}…」。列の幅を変えるか、表を分ける')
        if 'label' in low: add('E', 'font-small', si, f'図の中の文字が {low["label"][0]}pt（下限 {FLOOR["label"]}pt）：「{low["label"][1]}…」')
        # 画像の並び・面積
        if '--allow-pictures' not in argv and pics:
            hs = [p_[2] for p_ in pics]
            dup = max(hs.count(h_) for h_ in hs)
            if dup >= 2: add('E', 'picture', si, f'同じ画像が {dup} 枚並んでいる。図形で描く')
            area = sum(p_[0] * p_[1] for p_ in pics if max(p_[0], p_[1]) <= PICTO_MAX)
            if area > PICTO_AREA: add('E', 'picture', si, f'ピクトの面積の合計が {area:.1f} 平方in（{PICTO_AREA} まで）')
        # 濃い色の塗り（白地＋枠線が決まり。濃い塗りは目次の帯・表の見出し行だけ）
        if dark and heading:
            da = sum(d_[1] for d_ in dark); dn = len([d_ for d_ in dark if d_[2]])
            if dn >= 2 or da > 1.5: add('E', 'fill-dark', si, f'濃い色の塗りが {len(dark)} か所（{da:.1f} 平方in、{"・".join(sorted(set("#" + d_[0] for d_ in dark)))}）。枠は白地＋枠線にする')
            elif da > 0.4: add('W', 'fill-dark', si, f'濃い色の塗り（{da:.1f} 平方in）。強調は枠線の色と語の色で付ける')

        is_plain = not heading
        if is_plain and si > 2: add('W', 'no-heading', si, '見出しがない')
        if heading:
            hw = text_w(heading.strip())
            if hw > LIMIT['heading']: add('E' if hw > LIMIT['heading_e'] else 'W', 'heading-long', si, f'見出しが長い（全角 {hw:.0f} 字分）。{LIMIT["heading"]:.0f} 字以内にする')
            m = re.match(r'\s*(\d+)[.．]', heading)
            if m:
                n = int(m.group(1))
                if n < last_no: add('W', 'heading-order', si, f'見出しの番号が戻っている（{last_no} → {n}）')
                elif n > last_no + 1 and last_no: add('W', 'heading-order', si, f'見出しの番号が飛んでいる（{last_no} → {n}）')
                last_no = n
        # 本文の領域の下（頁番号の所）まで文字・枠がはみ出していないか（下部の帯は除く）
        low = max([t['y'] + t['h'] for t in T if t['kind'] == 'text' and t['border']] + [f[1] + f[3] for f in frames if f[2] < 9.9 and f[1] > 0.8 and f[3] < 4.6] + [r[4] for r in rboxes if T[r[0]]['name'] not in ('bandText',) and not (T[r[0]]['kind'] == 'text' and T[r[0]]['y'] > 5.2)] + [0])
        has_band = any(sh.name == 'band' or (sh.width / IN > 9.9 and sh.height / IN > 0.8 and sh.top / IN > 2.5) for sh in slide.shapes if sh.left is not None)
        if low > BELOW_MAX and not has_band and heading and si > 2: add('E', 'below-body', si, f'本文の領域の下にはみ出している（下端 {low:.2f}in。{BODY_Y + BODY_H:.2f} までに収める）。文字を減らすか、2枚に分ける')
        empty = max(0.0, (BODY_Y + BODY_H - content_bottom) / BODY_H)
        if not is_plain:
            if chars > LIMIT['density_e']: add('E', 'density', si, f'文字が多すぎる（{chars}字）。2枚に分ける')
            elif chars > LIMIT['density_w']: add('W', 'density', si, f'文字が多い（{chars}字）')
            refs_like = any(t['name'] in _SEV['sparse']['warn_only_kinds'] for t in T) or bool(re.search(_SEV['sparse']['warn_only_heading'], heading))
            if empty > LIMIT['sparse']: add('E' if empty > LIMIT['sparse_e'] and not refs_like else 'W', 'sparse', si, f'本文の領域の下 {empty * 100:.0f}% が空いている。内容を足すか、前後の枚とまとめる')
            if nall > 40 and nacc / nall > LIMIT['accent']: add('E' if nacc / nall > LIMIT['accent_e'] else 'W', 'accent-heavy', si, f'強調の色の文字が {nacc / nall * 100:.0f}%（要点の1〜3語と新しい関係だけに付ける）')
            thick = len(re.findall(r'<a:ln w="50800"', xml))
            if thick >= LIMIT['new_arrows']: add('W', 'new-arrows', si, f'太い矢印（新しい関係）が {thick} 本。1枚（1段）に多くても4本まで。段を分ける')
            if nb > 40 and (nb - nbold) / nb > LIMIT['bold']: add('W', 'bold-ratio', si, f'太字でない文字が {(nb - nbold) / nb * 100:.0f}%（本文は太字が基本）')
            if nall > 40 and nsmall / nall > LIMIT['small']: add('W', 'font-small', si, f'12pt 未満の文字が {nsmall / nall * 100:.0f}%（本文は 15pt 以上、注は少しだけ）')
        has_notes = slide.has_notes_slide and slide.notes_slide.notes_text_frame.text.strip() != ''
        notes_have.append(has_notes)
        stats.append({'slide': si, 'heading': heading, 'chars': chars, 'empty_lower': round(empty, 2), 'pictos': pictos})
    if any(notes_have) and not all(notes_have[2:] or [True]):
        miss = [i + 1 for i, v in enumerate(notes_have) if not v and i >= 2]
        if miss: add('W', 'notes-missing', 0, f'発表原稿のないスライド：{miss}')
    # 同じ指摘の重複を落とす
    uniq = []; seen = set()
    for f in findings:
        k = (f['sev'], f['code'], f['slide'], f['msg'])
        if k not in seen: seen.add(k); uniq.append(f)
    findings = uniq
    E = [f for f in findings if f['sev'] == 'E']; W = [f for f in findings if f['sev'] == 'W']
    body = [s for s in stats if s['heading']]
    avg = round(sum(s['chars'] for s in body) / max(1, len(body)))
    out = {'file': args[0], 'slides': len(stats), 'theme': theme, 'avg_chars': avg, 'max_chars': max([s['chars'] for s in body] or [0]),
           'rendered': pages is not None, 'render_note': why, 'explicit_breaks': explicit, 'font_substitution': subst,
           'errors': len(E), 'warnings': len(W), 'findings': findings, 'stats': stats}
    if opt('--json'): json.dump(out, open(opt('--json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f"{args[0]}：{len(stats)}枚、配色 {theme}、1枚平均 {avg}字（最大 {out['max_chars']}字）。error {len(E)}、warn {len(W)}")
    if pages is None: print(f'  ※ 描画後の検査はしていない（{why}）。語の途中の改行は、画像にして目で確かめる')
    else:
        print('  描画後の検査：済み' + ('（改行を指定している資料）' if explicit else '（改行を指定していない資料。条文の引用の中の折り返しだけ W）'))
        if subst: print(f'  ※ 書体が置き換わっている（{subst}）。実機とは改行の位置が違うことがある')
    for f in findings: print(f"  {f['sev']} [{f['code']}] {'全体' if not f['slide'] else str(f['slide']) + '枚目'}：{f['msg']}")
    print('  ※ error 0 は崩れがないことの証明ではない。全枚を画像にして目視する（図形の重なり、帯の下端で切れる行、白字・灰色、書体・飾り、'
          '判例研究の決まり＝条文番号・判旨の出典・相関図の順序・強調の付け先。references/slides/09-quality-rubric.md）')
    sys.exit(1 if E or ('--strict' in argv and W) else 0)


if __name__ == '__main__':
    main()
