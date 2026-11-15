#!/usr/bin/env python3
"""⑨を1回の呼び出しで：図の PNG（任意）→ docx と本文テキスト → （PDF 化 ‖ 全部の検査）を、重なる所は同時に走らせる。
usage: build_and_check.py BLOCKS.json|DOC.py --out DIR [--render-figs FIGDIR] [--no-pdf] [--comma-full] [pipeline.py の引数…]
  BLOCKS      build_docx.py の入力（JSON、または META と DOC を定義した .py）
  --out DIR   DIR/note.docx・note.txt・body.txt・note.pdf と、DIR/checks/（pipeline.py の結果と report.md）を作る
  --render-figs FIGDIR  --fig-specs で渡した図の仕様を、先にまとめて SVG・PNG にして FIGDIR に置く（figgen/cli.js batch。PNG は同時に作る。node と sharp が要る）
  --no-pdf    PDF を作らない（LibreOffice が無いとき）
  それ以外の引数（--source、--figs、--cards、--tf、--default-law、--reasons、--jobs など）は、そのまま pipeline.py に渡す。--note・--body・--blocks・--out・--pdf は、この道具が決める。
順に走らせたときと、各ファイルの中身は同じ。変わるのは、PDF 化（数秒）と検査が重なる分だけ速いこと。
走らせるもの：python3（build_docx.py・pipeline.py）、node（図があるとき）、soffice（PDF 化。あれば）。ネットワークは使わない。"""
import sys, os, subprocess, glob, shutil, threading, time

HERE = os.path.dirname(os.path.abspath(__file__))

def pop(args, flag, has_value=True):
    if flag not in args:
        return None
    i = args.index(flag)
    v = args[i + 1] if has_value else True
    del args[i:i + (2 if has_value else 1)]
    return v

def main():
    a = sys.argv[1:]
    if not a or a[0].startswith('--'):
        print(__doc__); sys.exit(1)
    blocks = a.pop(0)
    out = pop(a, '--out'); figdir = pop(a, '--render-figs'); nopdf = pop(a, '--no-pdf', False); cf = pop(a, '--comma-full', False)
    if not out:
        print(__doc__); sys.exit(1)
    os.makedirs(out, exist_ok=True)
    t0 = time.time(); marks = []
    def mark(name):
        marks.append((name, time.time() - t0))
    if figdir:
        specs = []
        if '--fig-specs' in a:
            specs = sorted(glob.glob(a[a.index('--fig-specs') + 1]))
        if specs:
            r = subprocess.run(['node', os.path.join(HERE, 'figgen', 'cli.js'), 'batch', *specs, '--outdir', figdir, '--png', '--quiet'], capture_output=True, text=True)
            print(r.stdout.strip() + r.stderr.strip())
            if r.returncode:
                print('図の作成に誤りがある。仕様を直してから続ける'); sys.exit(1)
        mark('図')
    note, body, docx, pdf = (os.path.join(out, n) for n in ('note.txt', 'body.txt', 'note.docx', 'note.pdf'))
    r = subprocess.run([sys.executable, os.path.join(HERE, 'build_docx.py'), blocks, docx, '--body-out', body, '--text-out', note] + (['--comma-full'] if cf else []), capture_output=True, text=True)
    print((r.stdout + r.stderr).strip())
    if r.returncode:
        sys.exit(r.returncode)
    mark('docx')
    # PDF 化と検査を同時に。検査のうち頁数だけが PDF を待つ
    pdf_ok = [False]
    failed = pdf + '.failed'    # PDF 化に失敗した印。頁数の検査は、これを見たら待つのをやめる
    for f in (pdf, failed):     # 前の回の PDF が残っていると、頁数の検査が古い PDF を読んでしまうので、先に消す
        if os.path.exists(f):
            os.remove(f)
    def to_pdf():
        if nopdf or not shutil.which('soffice'):
            return
        tmp = os.path.join(out, 'pdf_tmp'); os.makedirs(tmp, exist_ok=True)
        try:
            subprocess.run(['soffice', '--headless', '--convert-to', 'pdf', '--outdir', tmp, docx], capture_output=True, text=True, timeout=300)
            made = os.path.join(tmp, 'note.pdf')
            if os.path.exists(made):
                os.replace(made, pdf); pdf_ok[0] = True      # できあがってから名前を付ける（検査はこの名前の出現を待つ）
        except Exception:
            pass
        finally:
            if not pdf_ok[0]:
                open(failed, 'w').close()
            shutil.rmtree(tmp, ignore_errors=True)
    th = threading.Thread(target=to_pdf); th.start()
    use_pdf = not nopdf and shutil.which('soffice')
    cmd = [sys.executable, os.path.join(HERE, 'pipeline.py'), '--note', note, '--body', body, '--blocks', blocks, '--out', os.path.join(out, 'checks')] + a
    if use_pdf:
        cmd += ['--pdf', pdf, '--pdf-wait', '300']
    r = subprocess.run(cmd, capture_output=True, text=True)
    print((r.stdout + r.stderr).strip())
    mark('検査')
    th.join(); mark('PDF')
    if os.path.exists(failed):
        os.remove(failed)
    if use_pdf and not pdf_ok[0]:
        print('PDF にできなかった（頁数の検査は、頁数なしで走った）。LibreOffice を確かめる')
    print('所要（実時間）：' + '／'.join(f'{n} {t:.1f}s' for n, t in marks) + f'／全体 {time.time() - t0:.1f}s')
    sys.exit(0 if r.returncode == 0 else r.returncode)

if __name__ == '__main__':
    main()
