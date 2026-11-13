#!/usr/bin/env python3
"""同時に走らせる道具が、順に走らせたときと同じ結果を出すことの試験。
usage: python3 test_parallel.py     （python-docx が要る。図の PNG の試験は node と sharp があるときだけ）"""
import os, sys, json, shutil, subprocess, tempfile, unittest, glob, filecmp

HERE = os.path.dirname(os.path.abspath(__file__))
SCR = os.path.normpath(os.path.join(HERE, '..', '..', 'scripts'))
PY = sys.executable

def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)

def same_dir(a, b, skip=()):
    bad = []
    for f in sorted(os.listdir(a)):
        if f in skip:
            continue
        pa, pb = os.path.join(a, f), os.path.join(b, f)
        with open(pa, encoding='utf-8') as fa, open(pb, encoding='utf-8') as fb:
            ta, tb = fa.read().replace(a, 'X'), fb.read().replace(b, 'X')
        if ta != tb:
            bad.append(f)
    return bad

class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.d = tempfile.mkdtemp(prefix='laba_t_')
        r = run([PY, os.path.join(SCR, 'build_docx.py'), os.path.join(HERE, 'blocks.json'), os.path.join(cls.d, 'n.docx'), '--body-out', os.path.join(cls.d, 'b.txt'), '--text-out', os.path.join(cls.d, 'n.txt')])
        assert r.returncode == 0, r.stderr

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.d, ignore_errors=True)

    def pipe(self, out, *extra):
        d = self.d
        return run([PY, os.path.join(SCR, 'pipeline.py'), '--note', os.path.join(d, 'n.txt'), '--body', os.path.join(d, 'b.txt'), '--out', out, '--source', os.path.join(HERE, 'source.txt'),
                    '--blocks', os.path.join(HERE, 'blocks.json'), '--default-law', '民法', *extra])

    def test_pipeline_same_result(self):
        a, b = os.path.join(self.d, 'j1'), os.path.join(self.d, 'j4')
        self.assertEqual(self.pipe(a, '--jobs', '1').returncode, 0)
        self.assertEqual(self.pipe(b, '--jobs', '4').returncode, 0)
        self.assertEqual(sorted(os.listdir(a)), sorted(os.listdir(b)))
        self.assertEqual(same_dir(a, b), [])

    def test_certainty_layered_overwrites_plain(self):
        # 全文の確度の検査と層つきの検査は同じ certainty.json に書く。同時でも、層つきが最後になること
        b = os.path.join(self.d, 'j8'); self.pipe(b, '--jobs', '8')
        self.assertIn('layer_candidates', json.load(open(os.path.join(b, 'certainty.json'), encoding='utf-8')))

    def test_run_checks_same_files(self):
        d = self.d
        r = run(['bash', os.path.join(SCR, 'run_checks.sh'), os.path.join(d, 'n.txt'), os.path.join(d, 'b.txt'), os.path.join(d, 'rc'), os.path.join(HERE, 'source.txt')])
        self.assertEqual(r.returncode, 0, r.stderr)
        for f in ('style.json', 'coverage.json', 'cite.json', 'match.json', 'certainty.json', 'density.json', 'statute.json', 'score.json'):
            self.assertTrue(os.path.exists(os.path.join(d, 'rc', f)), f)

    def test_build_and_check(self):
        o = os.path.join(self.d, 'bc')
        r = run([PY, os.path.join(SCR, 'build_and_check.py'), os.path.join(HERE, 'blocks.json'), '--out', o, '--source', os.path.join(HERE, 'source.txt'), '--default-law', '民法', '--no-pdf'])
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        for f in ('note.docx', 'note.txt', 'body.txt', 'checks/report.md', 'checks/score.json'):
            self.assertTrue(os.path.exists(os.path.join(o, f)), f)

    def test_build_and_check_pdf_failure(self):
        # PDF 化が失敗しても、頁数の検査は 300 秒待たずに進む。前の回の PDF は消してから作る（古い PDF の頁数を読まない）
        import time
        o, shim = os.path.join(self.d, 'bf'), os.path.join(self.d, 'shim')
        os.makedirs(o, exist_ok=True); os.makedirs(shim, exist_ok=True)
        with open(os.path.join(o, 'note.pdf'), 'w') as f:
            f.write('%PDF-1.4 stale')
        sp = os.path.join(shim, 'soffice')
        with open(sp, 'w') as f:
            f.write('#!/bin/sh\nexit 1\n')
        os.chmod(sp, 0o755)
        env = dict(os.environ, PATH=shim + os.pathsep + os.environ.get('PATH', ''))
        t = time.time()
        r = run([PY, os.path.join(SCR, 'build_and_check.py'), os.path.join(HERE, 'blocks.json'), '--out', o, '--source', os.path.join(HERE, 'source.txt'), '--default-law', '民法'], env=env, timeout=120)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertLess(time.time() - t, 60)
        self.assertFalse(os.path.exists(os.path.join(o, 'note.pdf')))
        self.assertFalse(os.path.exists(os.path.join(o, 'note.pdf.failed')))

    def test_verify_plan(self):
        st = os.path.join(self.d, 'j1', 'statute.json')
        if not os.path.exists(st):
            self.pipe(os.path.join(self.d, 'j1'), '--jobs', '1')
        r = run([PY, os.path.join(SCR, 'verify_plan.py'), '--statute', st, '--chunk', '2'])
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('民法467条1項', r.stdout); self.assertIn('第2組', r.stdout)
        self.assertEqual(r.stdout.count('民法467条2項'), 1)

    @unittest.skipUnless(shutil.which('node'), 'node がない')
    def test_figgen_batch_same_as_single(self):
        cli = os.path.join(SCR, 'figgen', 'cli.js'); specs = sorted(glob.glob(os.path.join(SCR, 'figgen', 'specs', '*.json')))[:6]
        a, b = os.path.join(self.d, 'fa'), os.path.join(self.d, 'fb')
        for s in specs:
            self.assertEqual(run(['node', cli, s, os.path.join(a, os.path.basename(s)[:-5] + '.svg'), '--quiet']).returncode, 0)
        r = run(['node', cli, 'batch', *specs, '--outdir', b, '--quiet', '--jobs', '3']); self.assertEqual(r.returncode, 0, r.stderr)
        for f in os.listdir(a):
            self.assertTrue(filecmp.cmp(os.path.join(a, f), os.path.join(b, f), shallow=False), f)
        # 誤りのある仕様は飛ばして残りを作り、終了コードは 1
        bad = os.path.join(self.d, 'bad.json'); json.dump({'type': 'nonexistent'}, open(bad, 'w'))
        r = run(['node', cli, 'batch', bad, specs[0], '--outdir', os.path.join(self.d, 'fc'), '--quiet'])
        self.assertEqual(r.returncode, 1); self.assertTrue(os.path.exists(os.path.join(self.d, 'fc', os.path.basename(specs[0])[:-5] + '.svg')))

if __name__ == '__main__':
    unittest.main(verbosity=2)
