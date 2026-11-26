#!/usr/bin/env python3
"""page2_direct_check.py：座標つきで直接書いた紙面ノート（.gnoto・content.page2.parts と content.page.pages[].boxes）の形の検査。
使い方: python3 page2_direct_check.py ノート.gnoto [--json]
見るもの：部品の名前（GNOTO が描けるものだけ）・矩形が紙の中・ページ id の対応・箱が指す行（rows）の存在・pid の重複・fmt.pages の key・
  本文の行の数（字詰め×行数に対する）。見ないもの：見た目の良し悪し・文の正しさ（GNOTO で開いて見る）。
標準ライブラリだけ。ファイルは書かず、ネットワークに接続しない。終了コード 1＝誤り。"""
import json, sys

PARTS = {'band-title', 'outline-num', 'rule-dot', 'bar-pair', 'case-frame', 'fig-tag', 'fig-frame', 'folio', 'chapter-band', 'side-note',
         'column-box', 'note-rule', 'toc-line', 'toc-chapter', 'fig-shadow', 'gray-head', 'dotted-box', 'corner-box', 'gray-column',
         'shaded-table', 'foot-rule', 'model-frame', 'photo-band', 'fig-box'}
TYPES = {'chapter', 'body', 'bodyfig', 'bodybox', 'figonly', 'toc', 'bodynf'}
BLEED_MM = 4.0


def main():
    a = [x for x in sys.argv[1:] if not x.startswith('--')]
    as_json = '--json' in sys.argv
    if not a:
        print('使い方: page2_direct_check.py ノート.gnoto [--json]'); return 2
    d = json.load(open(a[0], encoding='utf-8'))
    err, warn = [], []
    note = d.get('note', {}); c = note.get('content', {})
    if note.get('style') != 'page': err.append('note.style が page でない')
    p1, p2 = c.get('page') or {}, c.get('page2') or {}
    if not isinstance(p2.get('v'), int) or p2.get('v') < 2: err.append('page2.v が 2 以上でない（GLYPH v1.17 の紙面は 5）')
    paper = p2.get('paper', {}); W = float(paper.get('widthMm', 0) or 0); H = W * float(paper.get('ratio', 0) or 0)
    if not (W > 0 and H > 0): err.append('page2.paper.widthMm・ratio が無い')
    rows = c.get('rows', []); pids = []
    for r in rows:
        for cell in r: pids.append(cell.get('pid'))
    if len(pids) != len(set(pids)): err.append('pid が重複している')
    pidset = set(pids)
    ids1 = [p.get('id') for p in p1.get('pages', [])]; ids2 = [p.get('id') for p in p2.get('pages', [])]
    if ids1 != ids2: err.append(f'page.pages と page2.pages の id が合わない：{ids1} / {ids2}')
    for pid, t in (p2.get('fmt', {}).get('pages') or {}).items():
        if pid not in ids2: err.append(f'fmt.pages の key {pid} が page2.pages に無い')
        if t not in TYPES: warn.append(f'fmt.pages[{pid}]＝{t} は知らない種類（{sorted(TYPES)}）')
    for pt in p2.get('parts', []):
        n = pt.get('part'); pg = pt.get('pg')
        if n not in PARTS: err.append(f'部品 {n} は GNOTO が描けない（{pg}）'); continue
        if pg not in ids2: err.append(f'部品 {n} の pg={pg} が無いページ')
        x, y, w, h = (float(pt.get(k, 0) or 0) for k in ('x', 'y', 'w', 'h'))
        if not (w > 0 and h > 0): err.append(f'部品 {n}（{pg}）の w・h が 0 以下'); continue
        if W and (x < -BLEED_MM or y < -BLEED_MM or x + w > W + BLEED_MM or y + h > H + BLEED_MM):
            (warn if n in ('chapter-band', 'photo-band') else err).append(f'部品 {n}（{pg}）が紙の外：x={x} y={y} w={w} h={h}（紙 {W}×{H:.1f}）')
        if not isinstance(pt.get('prm'), dict): err.append(f'部品 {n}（{pg}）に prm が無い')
    tg = p2.get('tgrid') or {}
    cap = int(tg.get('chars', 0) or 0) * int(tg.get('lines', 0) or 0)
    for P in p1.get('pages', []):
        for b in P.get('boxes', []):
            for rid in (b.get('src') or {}).get('rows', []) or []:
                if rid not in pidset: err.append(f'箱 {b.get("id")} が指す行 {rid} が rows に無い')
            if b.get('kind') == 'text' and W and (b.get('w', 0) > W or b.get('h', 0) > H): warn.append(f'箱 {b.get("id")} が紙より大きい')
    # 本文の行の数：空の行（全角空白だけ）を除いた字数が、ページ数×容量を超えないか
    text = sum(len((cell.get('html') or '').replace('　', '').replace('&nbsp;', '')) for r in rows for cell in r)
    npages_body = sum(1 for t in (p2.get('fmt', {}).get('pages') or {}).values() if t in ('body', 'bodyfig', 'bodybox', 'bodynf')) or len(ids2)
    if cap and text > cap * npages_body * 1.2: warn.append(f'字数 {text} が 本文ページ {npages_body} 枚の容量 {cap * npages_body} を超える（次のページが要る）')
    res = {'file': a[0], 'errors': err, 'warnings': warn, 'pages': len(ids2), 'parts': len(p2.get('parts', []))}
    if as_json: print(json.dumps(res, ensure_ascii=False, indent=1))
    else:
        print(f'{a[0]}：ページ {len(ids2)}・部品 {len(p2.get("parts", []))}')
        for e in err: print('誤り:', e)
        for w_ in warn: print('警告:', w_)
        if not err and not warn: print('形の範囲内（見た目は GNOTO で開いて確かめる）')
    return 1 if err else 0


if __name__ == '__main__':
    sys.exit(main())
