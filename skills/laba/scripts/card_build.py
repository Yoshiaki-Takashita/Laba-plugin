#!/usr/bin/env python3
"""論点カード表を JSON から作る（references/ronten-card.md）。
usage: card_build.py cards.json [--out card_blocks.json] [--check-only] [--note NOTE(.json|.py|.txt)] [--tf items.json]
入力：{"cards": [{"issue": "論点名", "section": "根拠にした本文の節番号（12-3-4-2。複数は「，」で並べる）",
                  "problem": "問題の所在", "norm": "規範（条文・判例つき）", "reason": "理由", "apply": "当てはめの要点",
                  "tf": "短答で問われる形（任意。「○：…」「×：…（誤りは…）」か、短答の表と同じ知識なら「→短答3」）",
                  "opening": "論述での書き出し（任意）", "cases": "関連判例（任意。規範の欄にない判例がある論点が半分以上のときだけ）"}, …]}
出力：build_docx.py に渡せるブロックを書いた JSON。blocks の末尾に足して使う。
      tf／opening があれば、1論点を1行にまとめた表（["T", …]。右の欄に ［問題］［規範］／［理由］［当てはめ］／［短答］［書き出し］ を並べる）1個。
      1つの論点を2つの表に分けない（別の頁になり、カードとして1か所で読めなくなる）。
      基本の5欄だけなら、5列の表（["KD", …]）1個。
検査（基本）：5つの欄が全部埋まっている／規範に条文番号か判例がある／規範は160字以内／論点は8〜12個が目安／「同左」「同上」がない／
              section（根拠にした本文の節）がある（derived_check.py が本文との照合に使う）。
検査（答案での使い方の欄があるとき）：
  tf      「○：」か「×：」で始まる1文。×なら「（誤りは…）」を添える。120字以内。
          短答の表（--tf）に同じ知識を問う問があるときは、文を書かずに「→短答N」と番号で示す（同じ問を2か所に載せない）。
          --tf を渡すと、参照先の番号があるか、文で書いた tf が短答の表の問と重なっていないかを見る
          （術語の重なり 0.6 以上は所見、0.45 以上は注意。近似なので、注意は読んで決める）
  opening 答案の最初の1〜2文として使える形：問題の所在を受けて規範を言い切る文。条文番号か判例の立場を含み、「〜と解する」「〜である」で終わる。110字以内
          「〜が問題となる」で終わるだけの文は不可（問題提起で止まっている）
  tf と opening は、全部の論点にあるか、どの論点にもないか、のどちらかにそろえる
  cases   判例の書誌の形。「規範の欄と同じ」「—」が半分を超える列は、列ごとやめる（中身のある論点は「当てはめの要点」に書く）
検査（--note を渡したとき）：規範・関連判例の書誌が本文と同じ表記か／本文にない判例・条文を足していないか。"""
import sys, json
from laba_common import *

BASE = ('issue', 'problem', 'norm', 'reason', 'apply')
EXT = ('cases', 'tf', 'opening')

TF_REF = re.compile(r'^→短答(\d+)$')

def _bg(t):
    out = set()
    for w in re.findall(r'[一-鿿々]{2,}', t):
        for i in range(len(w) - 1):
            out.add(w[i:i + 2])
    return out

def check(cards, note_text=None, tf_items=None):
    issues = []; check.notes = []
    if not (6 <= len(cards) <= 14):
        issues.append(f'論点の数が {len(cards)}（目安は8〜12）')
    has_ext = {k: sum(1 for c in cards if (c.get(k) or '').strip()) for k in EXT}
    for k, n in has_ext.items():
        if 0 < n < len(cards):
            issues.append(f'{k} の欄が {n}/{len(cards)} 論点にしかない（全部に書くか、欄ごとやめる）')
    empty_cases = sum(1 for c in cards if (c.get('cases') or '').strip() in ('規範の欄と同じ', '—', '-'))
    if has_ext['cases'] and empty_cases * 2 > len(cards):
        issues.append(f'cases の欄は {empty_cases}/{len(cards)} 論点が「規範の欄と同じ」「—」（中身のない列。列をやめ、判例のある論点は当てはめの要点に書く）')
    tf_bg = [(_bg(it.get('q', '')), k) for k, it in enumerate(tf_items or [], 1)]
    note_cases = {c['key']: c for c in find_cases(note_text)} if note_text else None
    note_cites = set(re.sub(r'\s', '', c['raw']).replace('前掲', '') for c in find_cases(note_text) if c['cite']) if note_text else None
    note_stats = set(s['article'] for s in find_statutes(note_text)) if note_text else None
    for i, c in enumerate(cards, 1):
        name = c.get('issue', '')
        for k in BASE:
            v = (c.get(k) or '').strip()
            if not v or v in ('—', '-', '同左', '同上'):
                issues.append(f"{i}「{name}」：{k} が空")
        n = c.get('norm', '')
        if not (find_statutes(n) or find_cases(n)):
            issues.append(f"{i}「{name}」：規範に条文番号も判例もない")
        if len(n) > 160:
            issues.append(f"{i}「{name}」：規範が {len(n)} 字（160字以内に）")
        if not (c.get('section') or '').strip():
            issues.append(f"{i}「{name}」：section（根拠にした本文の節番号）がない")
        tf = (c.get('tf') or '').strip()
        mref = TF_REF.match(tf)
        if mref:
            if tf_items is not None and not (1 <= int(mref.group(1)) <= len(tf_items)):
                issues.append(f"{i}「{name}」：tf の参照先 短答{mref.group(1)} が短答の表にない")
        elif tf:
            if tf_bg:
                g = _bg(re.sub(r'（誤りは.*$', '', tf))
                sc, k = max(((len(g & h) / (len(g) ** 0.5 * len(h) ** 0.5) if g and h else 0.0), k) for h, k in tf_bg)
                if sc >= 0.6:
                    issues.append(f"{i}「{name}」：tf が短答{k} と同じ知識を問うている（重なり {round(sc, 2)}）。「→短答{k}」と番号で示す")
                elif sc >= 0.45:
                    check.notes.append(f"{i}「{name}」：tf に近い問が短答の表にある（短答{k}。重なり {round(sc, 2)}）。同じ知識なら「→短答{k}」にする")
            if not re.match(r'^[○×][：:]', tf):
                issues.append(f"{i}「{name}」：tf は「○：」か「×：」で始める（短答の表と同じ問なら「→短答N」）")
            if len(tf) > 120:
                issues.append(f"{i}「{name}」：tf が {len(tf)} 字（120字以内に）")
            if tf.startswith('×') and not re.search(r'誤り|正しくは|ではなく', tf):
                issues.append(f"{i}「{name}」：×の tf に、どこが誤りかが添えられていない")
        op = (c.get('opening') or '').strip()
        if op:
            if len(op) > 110:
                issues.append(f"{i}「{name}」：opening が {len(op)} 字（110字以内に）")
            if re.search(r'(が問題となる|か[。．]?|であろうか)[。．]?$', op):
                issues.append(f"{i}「{name}」：opening が問題提起で止まっている（規範まで言い切る）")
            if not (find_statutes(op) or find_cases(op) or '判例' in op or '通説' in op):
                issues.append(f"{i}「{name}」：opening に条文番号も判例の立場もない")
        cs = (c.get('cases') or '').strip()
        if cs and cs not in ('規範の欄と同じ', '—') and not find_cases(cs):
            issues.append(f"{i}「{name}」：cases が判例の書誌の形でない")
        if note_text is not None:
            for fld in ('norm', 'cases', 'reason', 'apply', 'opening', 'tf'):
                for x in find_cases(c.get(fld) or ''):
                    if x['key'] not in note_cases:
                        issues.append(f"{i}「{name}」：{fld} の判例 {x['raw']} が本文にない")
                    elif x['cite'] and re.sub(r'\s', '', x['raw']).replace('前掲', '') not in note_cites:
                        issues.append(f"{i}「{name}」：{fld} の判例 {x['raw']} の書誌が本文の表記と違う")
                for s in find_statutes(c.get(fld) or ''):
                    if s['article'] not in note_stats:
                        issues.append(f"{i}「{name}」：{fld} の条文 {s['raw']} が本文にない")
    return issues

def main():
    pos = positional()
    if not pos:
        print(__doc__); sys.exit(1)
    d = json.load(open(pos[0], encoding='utf-8')); cards = d['cards']
    note_text = None
    if arg('--note'):
        from laba_blocks import load_units
        note_text = '\n'.join(u['text'] for u in load_units(arg('--note')) if u['layer'] in ('body', 'table', 'zak'))
    tf_items = json.load(open(arg('--tf'), encoding='utf-8'))['items'] if arg('--tf') else None
    issues = check(cards, note_text, tf_items)
    for x in issues:
        print('  所見:', x)
    for x in check.notes:
        print('  注意:', x)
    ext = any((c.get(k) or '').strip() for c in cards for k in EXT)
    print(f"論点 {len(cards)}／拡張の欄 {'あり' if ext else 'なし'}／所見 {len(issues)}")
    if '--check-only' in sys.argv:
        sys.exit(1 if issues else 0)
    blocks = [['PB'], ['H', d.get('title', '論点カード')]]
    if d.get('lead'):
        blocks.append(['P', d['lead']])
    if ext:   # 1論点を1行にまとめる（1か所で読めるように、表を分けない）
        rows = [['論点', '問題の所在・規範（条文・判例）／理由・当てはめの要点／短答で問われる形・論述での書き出し']]
        for i, c in enumerate(cards, 1):
            tf = (c.get('tf') or '').strip(); m = TF_REF.match(tf)
            tf = f"短答式の命題の№{m.group(1)}と同じ" if m else tf
            cell = f"［問題］{c['problem']}　［規範］{c['norm']}\n［理由］{c['reason']}　［当てはめ］{c['apply']}"
            cs = (c.get('cases') or '').strip()
            if cs and cs not in ('規範の欄と同じ', '—', '-'):
                cell += f"　［関連判例］{cs}"
            last = '　'.join(x for x in ((f"［短答］{tf}" if tf else ''), (f"［書き出し］{c['opening']}" if c.get('opening') else '')) if x)
            rows.append([f"{i}　{c['issue']}", cell + ('\n' + last if last else '')])
        blocks.append(['T', rows, d.get('caption', '論点カード'), [22, 134]])
    else:
        blocks.append(['KD', [[f"{i}　{c['issue']}", c['problem'], c['norm'], c['reason'], c['apply']] for i, c in enumerate(cards, 1)], d.get('caption', '論点カード')])
    out = arg('--out', 'card_blocks.json')
    dump({'blocks': blocks}, out)
    print('->', out)

if __name__ == '__main__':
    main()
