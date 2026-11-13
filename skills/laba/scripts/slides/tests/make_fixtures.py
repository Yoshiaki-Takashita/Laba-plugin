#!/usr/bin/env python3
"""bad_cases.py が使う見本の .pptx（3枚：表紙・目次・壊す1枚）を、specs の見本から作り直す。
プラグインの配布物には .pptx を入れない（公式の一覧の審査で、テキストと画像以外のファイルは人の審査に回るため）。
回帰試験を回す前に一度だけ実行する。

usage: python3 tests/make_fixtures.py
要るもの：Node.js と pptxgenjs（build_deck.js と同じ）、python-pptx。
"""
import os
import subprocess
import sys
import tempfile

from pptx import Presentation

W = os.path.dirname(os.path.abspath(__file__))
SLIDES = os.path.dirname(W)
FX = os.path.join(W, 'fixtures')

# (見本の spec, 作るファイル, 残す枚の番号＝作った資料の中の0始まりの位置)
TARGETS = [
    ('note_review_sample.json', 'bad_base_note.pptx', [0, 1, 9]),
    ('hanrei_sample.json', 'bad_base_hanrei.pptx', [0, 1, 12]),
]


def keep_only(prs, keep):
    """keep に無い枚を消す（python-pptx に枚を消す関数が無いので、一覧の要素と関係を外す）。"""
    sld_id_lst = prs.slides._sldIdLst
    ids = list(sld_id_lst)
    for i in sorted(set(range(len(ids))) - set(keep), reverse=True):
        rid = ids[i].rId
        prs.part.drop_rel(rid)
        sld_id_lst.remove(ids[i])


def main():
    os.makedirs(FX, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for spec, out, keep in TARGETS:
            full = os.path.join(tmp, out)
            r = subprocess.run(['node', os.path.join(SLIDES, 'build_deck.js'), os.path.join(SLIDES, 'specs', spec), full],
                               cwd=SLIDES, stdin=subprocess.DEVNULL, capture_output=True, text=True)
            if r.returncode != 0 or not os.path.exists(full):
                sys.stderr.write(r.stdout + r.stderr)
                sys.exit('build_deck.js が失敗した：' + spec)
            prs = Presentation(full)
            if len(prs.slides) <= max(keep):
                sys.exit('%s の枚数が想定と違う（%d 枚）。TARGETS の番号を直すこと。' % (spec, len(prs.slides)))
            keep_only(prs, keep)
            prs.save(os.path.join(FX, out))
            print('作った：tests/fixtures/%s（%d 枚）' % (out, len(prs.slides)))


if __name__ == '__main__':
    main()
