#!/usr/bin/env python3
"""deck_lint.py の回帰試験。語の途中の改行・1〜2字の行・枠からのはみ出し・仮の文字を、検査が見つけることを確かめる。
usage: python3 tests/lint_regress.py   （失敗があれば終了コード 1。python-pptx・LibreOffice・poppler が要る）
独立の採点で、語の途中で折れた枚（「…3号／551／頁）」「41条1項・2／項」「Y2に／は／抗弁」）が検査を通ってしまった。
同じ形（幅の足りない箱に1行で入れた文、語の途中に入れた改行）を python-pptx で作り、検査が error にすることを確かめる。
あわせて、tests/midword_spec.json（同じ文を構成に書いたもの）を build_deck.js で作り、error 0 で通ることを確かめる。"""
import os, sys, json, subprocess, tempfile, shutil
from pptx import Presentation
from pptx.util import Inches, Pt

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)


def lint(path, *extra):
    out = path + '.lint.json'
    subprocess.run([sys.executable, os.path.join(ROOT, 'deck_lint.py'), path, '--json', out, *extra], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return json.load(open(out, encoding='utf-8'))


def bad_deck(path):
    """わざと悪い資料を作る：1枚目は見出しだけ、2枚目に (a) 幅の足りない箱 (b) 語の途中の改行 (c) 仮の文字"""
    prs = Presentation(); prs.slide_width = Inches(10); prs.slide_height = Inches(5.625)
    for k in range(3):
        s = prs.slides.add_slide(prs.slide_layouts[6])
        tb = s.shapes.add_textbox(Inches(0.4), Inches(0.15), Inches(6.7), Inches(0.55)); r = tb.text_frame.paragraphs[0].add_run(); r.text = f'{k + 1}. 試験の枚'; r.font.size = Pt(20); r.font.bold = True
        tb.name = 'heading'
        if k == 1:
            # (a) 幅 4.6 インチの箱に、改行を1か所だけ指定した文。描画側がもう一度折り、条文番号の途中で切れる
            tb = s.shapes.add_textbox(Inches(0.4), Inches(1.0), Inches(4.6), Inches(1.2)); tf_ = tb.text_frame; tf_.word_wrap = True
            p = tf_.paragraphs[0]
            for i, t in enumerate(['同時審判の申出があれば、弁論と裁判は分離できない（41条1項・2項）', '代理権は、Y1には請求原因、Y2には抗弁']):
                if i: p.add_line_break()
                r = p.add_run(); r.text = t; r.font.size = Pt(18); r.font.bold = True
            # (b) 語の途中に改行を指定
            tb = s.shapes.add_textbox(Inches(0.4), Inches(2.6), Inches(9.2), Inches(1.0)); p = tb.text_frame.paragraphs[0]
            for i, t in enumerate(['背信的行為と認めるに足りない特段の', '事情があるときは、建物が建て', '替えられた場合でも解除できない']):
                if i: p.add_line_break()
                r = p.add_run(); r.text = t; r.font.size = Pt(18); r.font.bold = True
        if k == 2:
            tb = s.shapes.add_textbox(Inches(0.4), Inches(1.0), Inches(9.2), Inches(1.0)); p = tb.text_frame.paragraphs[0]
            p.add_run().text = '〈最判平成○年○月○日〉（書誌は裁判所の判例検索で確認して書く）'; p.add_line_break(); p.add_run().text = '当事者：（役割）と（関係）'
            for r in p.runs: r.font.size = Pt(18); r.font.bold = True
    prs.save(path)


def with_hidden(src, dst):
    """src の2枚目の位置に、非表示の枚（本文あり）を差し込む。頁がずれても別の枚に偽の error が付かないことを見る"""
    prs = Presentation(src)
    s = prs.slides.add_slide(prs.slide_layouts[-1])
    tb = s.shapes.add_textbox(Inches(0.4), Inches(0.15), Inches(6.7), Inches(0.55)); tb.name = 'heading'
    r = tb.text_frame.paragraphs[0].add_run(); r.text = '9. 非表示の枚'; r.font.size = Pt(20); r.font.bold = True
    tb = s.shapes.add_textbox(Inches(0.4), Inches(1.0), Inches(9.2), Inches(3.5)); p = tb.text_frame.paragraphs[0]
    for i in range(8):
        if i: p.add_line_break()
        r = p.add_run(); r.text = f'非表示の枚の本文の行 {i + 1}。ここは発表では出さない'; r.font.size = Pt(18); r.font.bold = True
    s._element.set('show', '0')
    ids = prs.slides._sldIdLst; el = ids[-1]; ids.remove(el); ids.insert(1, el)
    prs.save(dst)


def refs_deck(path):
    """件数の少ない参考文献の枚（下が大きく空く）。作成時と同じく warn どまりになることを見る"""
    prs = Presentation(); prs.slide_width = Inches(10); prs.slide_height = Inches(5.625)
    for k, (h, body) in enumerate([('1. 本文の枚', ['本文の行。' * 6] * 8), ('2. 参考文献', ['最判平成10年1月1日民集52巻1号1頁', '架空の著者『架空の本』（架空社、2020年）'])]):
        s = prs.slides.add_slide(prs.slide_layouts[6])
        tb = s.shapes.add_textbox(Inches(0.4), Inches(0.15), Inches(6.7), Inches(0.55)); tb.name = 'heading'
        r = tb.text_frame.paragraphs[0].add_run(); r.text = h; r.font.size = Pt(20); r.font.bold = True
        tb = s.shapes.add_textbox(Inches(0.4), Inches(1.0), Inches(9.2), Inches(0.4 * len(body))); tb.text_frame.word_wrap = True; p = tb.text_frame.paragraphs[0]
        for i, t in enumerate(body):
            if i: p.add_line_break()
            r = p.add_run(); r.text = t; r.font.size = Pt(16)
    prs.save(path)


def main():
    tmp = tempfile.mkdtemp(prefix='lintreg_'); fails = []
    try:
        bad = os.path.join(tmp, 'bad.pptx'); bad_deck(bad)
        r = lint(bad); codes = {}
        for f in r['findings']: codes.setdefault(f['code'], []).append(f)
        def need(code, sev='E'):
            if not any(f['sev'] == sev for f in codes.get(code, [])): fails.append(f'{code}（{sev}）が出ない')
        need('bad-break'); need('placeholder')
        if r.get('rendered'): need('render-break') if 'render-break' in codes else need('render-short')
        else: print('  ※ 描画後の検査はできなかった（soffice か pdftotext が無い）。render-break の試験は飛ばした')
        # 参考文献の枚の空きは warn どまり（build_deck.js と同じ重さ。lib/severity.json）
        rf = os.path.join(tmp, 'refs.pptx'); refs_deck(rf); rr = lint(rf, '--no-render')
        sp = [f for f in rr['findings'] if f['code'] == 'sparse' and f['slide'] == 2]
        if not sp: fails.append('参考文献の枚の空きを知らせない')
        elif any(f['sev'] == 'E' for f in sp): fails.append('参考文献の枚の空きが error になる（作成時は知らせだけ）')
        rd = lint(bad, '--draft')
        if any(f['code'] == 'placeholder' and f['sev'] == 'E' for f in rd['findings']): fails.append('--draft でも placeholder が error のまま')
        # 同じ文を build_deck.js で作ると、error 0 で通る
        node = shutil.which('node'); good = os.path.join(tmp, 'good.pptx')
        if node:
            env = dict(os.environ)
            if 'NODE_PATH' not in env:
                try: env['NODE_PATH'] = subprocess.run(['npm', 'root', '-g'], stdout=subprocess.PIPE).stdout.decode().strip()
                except Exception: pass
            b = subprocess.run([node, os.path.join(ROOT, 'build_deck.js'), os.path.join(HERE, 'midword_spec.json'), good], stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
            if b.returncode != 0: fails.append('midword_spec.json の作成が止まった：' + b.stderr.decode('utf8', 'ignore')[-300:])
            else:
                g = lint(good)
                errs = [f for f in g['findings'] if f['sev'] == 'E']
                if errs: fails.append('build_deck.js で作った資料に error：' + '／'.join(f"{f['code']} {f['msg'][:40]}" for f in errs[:4]))
                # 非表示の枚を差し込んでも、ほかの枚に偽の error が付かない（頁ずれの不具合の回帰）
                hid = os.path.join(tmp, 'hidden.pptx'); with_hidden(good, hid); h = lint(hid)
                herr = [f for f in h['findings'] if f['sev'] == 'E']
                if herr: fails.append('非表示の枚があると error：' + '／'.join(f"{f['slide']}枚目 {f['code']}" for f in herr[:4]))
                if not any(f['code'] == 'hidden-slide' and f['slide'] == 2 for f in h['findings']): fails.append('非表示の枚（2枚目）を知らせない')
            # 見本（24枚）の途中の枚を非表示にする。後ろの枚が別の頁の文字と照合されると、偽の render-* が出る
            hs = os.path.join(tmp, 'hs.pptx')
            b = subprocess.run([node, os.path.join(ROOT, 'build_deck.js'), os.path.join(ROOT, 'specs', 'hanrei_sample.json'), hs], stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
            if b.returncode == 0:
                prs = Presentation(hs); n = len(prs.slides); prs.slides[n - 6]._element.set('show', '0'); prs.save(hs)
                h2 = lint(hs); herr = [f for f in h2['findings'] if f['sev'] == 'E']
                if herr: fails.append('見本の枚を非表示にすると error：' + '／'.join(f"{f['slide']}枚目 {f['code']}" for f in herr[:4]))
            # 下書きの印があれば止まる。--draft なら作る
            dj = os.path.join(tmp, 'draft.json'); d = json.load(open(os.path.join(HERE, 'midword_spec.json'), encoding='utf-8'))
            d['slides'][-1]['_todo'] = '要点を選び直す'; json.dump(d, open(dj, 'w', encoding='utf-8'), ensure_ascii=False)
            b1 = subprocess.run([node, os.path.join(ROOT, 'build_deck.js'), dj, os.path.join(tmp, 'd.pptx')], stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
            b2 = subprocess.run([node, os.path.join(ROOT, 'build_deck.js'), dj, os.path.join(tmp, 'd.pptx'), '--draft'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
            if b1.returncode == 0: fails.append('_todo が残っているのに build_deck.js が止まらない')
            if b2.returncode != 0: fails.append('--draft でも build_deck.js が止まる')
        else: print('  ※ node が無いので、作成の試験は飛ばした')
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print(f'deck_lint の回帰試験：失敗 {len(fails)} 件' + (''.join('\n  - ' + x for x in fails)))
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
