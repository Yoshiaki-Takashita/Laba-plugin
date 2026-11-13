#!/usr/bin/env python3
"""裁判所サイトの判例検索を日付で引き、事件の一覧と全文（PDF→テキスト）を取る。判決文と照らすための補助。
usage: case_lookup.py 昭和46・10・7 [--save DIR] [--grep 語1,語2] [--court 1]
       case_lookup.py --from-note NOTE.txt --save DIR     ノート中の判例を全部引く（最高裁のみ）
  --save DIR  全文を DIR/<年月日>_<事件番号>.txt に保存する（pymupdf・pdfminer・pdftotext のどれかが要る）
  --grep      全文の中で、語を含む行の前後を表示する（理由の該当箇所を探す）
出力：事件番号・事件名・裁判所・結果・全文の id。network が無い環境では「取得できない」と表示して終わる。
注意：検索に出るのは最高裁判例集に載った事件が中心。大審院・多くの下級審は出ない（case-verification.md 4）。
      取れた全文は作業用であり、ノートやスキルに貼らない。"""
import sys, os, re, subprocess, urllib.parse, urllib.request, html
from laba_common import *

BASE = 'https://www.courts.go.jp/hanrei/search2/index.html'
PDF = 'https://www.courts.go.jp/assets/hanrei/hanrei-pdf-{}.pdf'

def parse_date(s):
    m = re.match(r'(明治|大正|昭和|平成|令和)\s*(元|\d{1,2})[年・\.]\s*(\d{1,2})[月・\.]\s*(\d{1,2})', s.translate(Z2H))
    if not m:
        raise SystemExit(f'日付の形が読めない：{s}')
    return m.group(1), 1 if m.group(2) == '元' else int(m.group(2)), int(m.group(3)), int(m.group(4))

def http(url, binary=False, timeout=40):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (case-verification helper)'})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            b = r.read()
            return b if binary else b.decode('utf-8', 'replace')
    except Exception as e:
        try:  # proxy 環境では curl のほうが通ることがある
            r = subprocess.run(['curl', '-sS', '-m', str(timeout), '-L', url], capture_output=True)
            if r.returncode == 0 and r.stdout:
                return r.stdout if binary else r.stdout.decode('utf-8', 'replace')
        except Exception:
            pass
        return None

def search(era, y, m, d, court='1'):
    q = [('courtCaseType', court), ('filter[judgeDateMode]', '1'), ('filter[judgeGengoFrom]', era),
         ('filter[judgeYearFrom]', str(y)), ('filter[judgeMonthFrom]', str(m)), ('filter[judgeDayFrom]', str(d))]
    t = http(BASE + '?' + urllib.parse.urlencode(q))
    if t is None:
        return None
    out = []
    # 結果の1件ごとに、事件番号・事件名・裁判所・結果・PDF の id が並ぶ
    for blk in re.split(r'(?=<tr[^>]*>)', t):
        pid = re.search(r'hanrei-pdf-(\d+)\.pdf', blk)
        did = re.search(r'hanrei/(\d+)/detail\d/index\.html', blk)
        if not (pid or did):
            continue
        txt = [x for x in (html.unescape(re.sub(r'<[^>]+>', ' ', blk))).split() if x]
        num = next((x for x in txt if re.match(r'(明治|大正|昭和|平成|令和)\d+\([^)]+\)\d+', x)), '')
        if not num:
            continue
        i = txt.index(num)
        out.append({'number': num, 'name': txt[i + 1] if i + 1 < len(txt) else '', 'court': next((x for x in txt if '法廷' in x or '裁判所' in x), ''),
                    'result': next((x for x in txt[i:] if x in ('棄却', '破棄差戻', '破棄自判', '却下', '破棄', 'その他', '取消', '認容')), ''),
                    'pdf_id': pid.group(1) if pid else '', 'detail_id': did.group(1) if did else ''})
    seen, uniq = set(), []
    for o in out:
        if o['number'] not in seen:
            seen.add(o['number']); uniq.append(o)
    return uniq

def pdf_text(path):
    """PDF からテキストを取る。pymupdf → pdfminer → pdftotext の順に試す（古い判決の PDF は pdftotext だけでは読めないことがある）。"""
    try:
        import pymupdf
        with pymupdf.open(path) as doc:
            t = '\n'.join(pg.get_text() for pg in doc)
        if len(t.strip()) > 50:
            return t
    except Exception:
        pass
    try:
        from pdfminer.high_level import extract_text
        t = extract_text(path)
        if len(t.strip()) > 50:
            return t
    except Exception:
        pass
    try:
        r = subprocess.run(['pdftotext', '-layout', path, '-'], capture_output=True)
        t = r.stdout.decode('utf-8', 'replace')
        if len(t.strip()) > 50:
            return t
    except FileNotFoundError:
        pass
    return None

def fulltext(pdf_id, save=None):
    b = http(PDF.format(pdf_id), binary=True)
    if not b or not b.startswith(b'%PDF'):
        return None
    tmp = os.path.join(save or '/tmp', f'_{pdf_id}.pdf')
    open(tmp, 'wb').write(b)
    t = pdf_text(tmp)
    os.remove(tmp)
    if t is None:
        return None
    return re.sub(r'[ \u3000]+\n', '\n', t)

def show(date, save=None, words=None, court='1'):
    era, y, m, d = parse_date(date)
    res = search(era, y, m, d, court)
    tag = f'{era}{y}・{m}・{d}'
    if res is None:
        print(f'{tag}：取得できない（接続不可）'); return None
    if not res:
        print(f'{tag}：検索に出ない（大審院・下級審・未登載の可能性。年月日の誤りも疑う）'); return []
    for o in res:
        print(f"{tag}｜{o['number']}｜{o['name']}｜{o['court']}｜{o['result']}｜全文 id {o['pdf_id'] or '—'}")
        if (save or words) and o['pdf_id']:
            t = fulltext(o['pdf_id'], save)
            if t is None:
                print('   全文：取得できない'); continue
            o['chars'] = len(t)
            if save:
                p = os.path.join(save, f"{tag}_{re.sub(r'[()（）]', '_', o['number'])}.txt")
                open(p, 'w', encoding='utf-8').write(t); o['file'] = p; print('   ->', p, f'（{len(t)}字）')
            if words:
                flat = re.sub(r'\s+', '', t)
                for w in words:
                    for mm in list(re.finditer(re.escape(w), flat))[:3]:
                        print(f'   「{w}」…{flat[max(0, mm.start() - 60):mm.end() + 90]}…')
    return res

def main():
    pos = positional()
    save = arg('--save'); words = [w for w in (arg('--grep') or '').split(',') if w]
    if save:
        os.makedirs(save, exist_ok=True)
    if arg('--from-note'):
        seen = []
        for c in find_cases(read(arg('--from-note'))):
            if c['court'] in ('最判', '最決', '最大判', '最大決') and c['key'] not in seen:
                seen.append(c['key']); show(c['date'], save, words, arg('--court', '1'))
        print(f'最高裁の判例 {len(seen)} 件を引いた'); return
    if not pos:
        print(__doc__); sys.exit(1)
    for d in pos:
        show(d, save, words, arg('--court', '1'))

if __name__ == '__main__':
    main()
