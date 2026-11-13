#!/usr/bin/env python3
"""速さの測定：検査（pipeline.py）と図の一括作成（figgen/cli.js）を、順に走らせた場合と同時に走らせた場合で測る。
usage: python3 bench.py [--tile N] [--runs 3] [--figs]
  --tile N  見本の資料とノートを N 回つなげた大きい入力でも測る（既定 1 と 12。つなげた入力は速さの測定だけに使う。内容の評価には使えない）
  --figs    figgen/specs の全仕様（46本）を PNG にする時間も測る（node と sharp が要る。無ければ SVG だけ）
結果は表で出る。数値はこの計算機の値で、CPU の数・負荷で変わる（CPU の数も出す）。"""
import sys, os, json, time, shutil, subprocess, tempfile, statistics, glob

HERE = os.path.dirname(os.path.abspath(__file__))
SCR = os.path.normpath(os.path.join(HERE, '..', '..', 'scripts'))

def arg(f, d=None):
    return sys.argv[sys.argv.index(f) + 1] if f in sys.argv else d

def timed(cmd, runs, env=None):
    ts = []
    for _ in range(runs):
        t = time.time(); r = subprocess.run(cmd, capture_output=True, text=True, env=env); ts.append(time.time() - t)
        if r.returncode not in (0,):
            sys.stderr.write((r.stdout + r.stderr)[-400:])
    return statistics.median(ts)

def tiled(d, n):
    b = json.load(open(os.path.join(HERE, 'blocks.json'), encoding='utf-8'))
    blocks = []
    for i in range(n):
        blocks += [list(x) for x in b['blocks']]
    b['blocks'] = blocks
    bp = os.path.join(d, f'blocks{n}.json'); json.dump(b, open(bp, 'w', encoding='utf-8'), ensure_ascii=False)
    sp = os.path.join(d, f'source{n}.txt'); src = open(os.path.join(HERE, 'source.txt'), encoding='utf-8').read()
    open(sp, 'w', encoding='utf-8').write('\n'.join([src] * n))
    return bp, sp

def main():
    runs = int(arg('--runs', 3)); tiles = sorted({1, int(arg('--tile', 12))})
    print(f'CPU {os.cpu_count()} 個／Python {sys.version.split()[0]}／各 {runs} 回の中央値')
    d = tempfile.mkdtemp(prefix='laba_bench_')
    try:
        print('\n| 入力 | 本文の字数 | 順に走らせる（--jobs 1） | 同時に走らせる（既定） | 倍率 |\n|---|---:|---:|---:|---:|')
        for n in tiles:
            bp, sp = tiled(d, n); out = os.path.join(d, f'o{n}')
            subprocess.run([sys.executable, os.path.join(SCR, 'build_docx.py'), bp, os.path.join(d, f'n{n}.docx'), '--body-out', os.path.join(d, f'b{n}.txt'), '--text-out', os.path.join(d, f'n{n}.txt')], capture_output=True)
            base = [sys.executable, os.path.join(SCR, 'pipeline.py'), '--note', os.path.join(d, f'n{n}.txt'), '--body', os.path.join(d, f'b{n}.txt'), '--out', out, '--source', sp, '--blocks', bp, '--default-law', '民法']
            seq = timed(base + ['--jobs', '1'], runs); par = timed(base, runs)
            chars = len(open(os.path.join(d, f'b{n}.txt'), encoding='utf-8').read())
            print(f'| ×{n} | {chars} | {seq:.2f} s | {par:.2f} s | {seq / par:.1f} 倍 |')
        if '--figs' in sys.argv:
            specs = sorted(glob.glob(os.path.join(SCR, 'figgen', 'specs', '*.json'))); cli = os.path.join(SCR, 'figgen', 'cli.js')
            print(f'\n図 {len(specs)} 本（SVG と PNG）：')
            t = time.time()
            for i, s in enumerate(specs):
                subprocess.run(['node', cli, s, os.path.join(d, 'f1', os.path.basename(s)[:-5] + '.svg'), '--png', '--quiet'], capture_output=True)
            one = time.time() - t
            seq = timed(['node', cli, 'batch', *specs, '--outdir', os.path.join(d, 'f2'), '--png', '--quiet', '--jobs', '1'], 1)
            par = timed(['node', cli, 'batch', *specs, '--outdir', os.path.join(d, 'f3'), '--png', '--quiet'], runs)
            print(f'| 1本ずつ呼ぶ | まとめて・順に（--jobs 1） | まとめて・同時（既定） |\n|---:|---:|---:|\n| {one:.1f} s | {seq:.1f} s | {par:.1f} s |')
    finally:
        shutil.rmtree(d, ignore_errors=True)

if __name__ == '__main__':
    main()
