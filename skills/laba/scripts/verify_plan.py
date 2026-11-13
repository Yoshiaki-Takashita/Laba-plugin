#!/usr/bin/env python3
"""条文・判例の確認を「まとめて呼ぶ」ための計画表を作る。確認そのものはしない（ネットワークは使わない）。
usage: verify_plan.py --statute statute.json [--inventory inventory.json] [--chunk 20] [--out plan.json] [--md plan.md]
  --statute   statute_check.py の出力（ノートが引く条文の一覧）。法令名が欠けている行は「法令名なし」として別に挙げる
  --inventory inventory.py の出力（資料に出る判例）。ノートにだけ出る判例は、ノートを inventory.py にかけたものを渡す
  --chunk N   1回に同時に出す呼び出しの目安（既定 20）。これを超えたら次の組に分ける
出力：同じ条・同じ判例を1件にまとめ、条文は「法令名つきの表記」（例：民法467条1項）で1件ずつ並べる。
      Claude は、組ごとに、中の呼び出しを同じ回で一緒に出す（条文の組と判例の組は同じ回に並べてよい）（references/connector.md 7）。
      条文の読みの結果は返り値の law_title で確かめる（法令名を省くと別の法令に読まれることがある）。"""
import sys, json, collections

def arg(f, d=None):
    return sys.argv[sys.argv.index(f) + 1] if f in sys.argv and sys.argv.index(f) + 1 < len(sys.argv) else d

def chunks(xs, n):
    return [xs[i:i + n] for i in range(0, len(xs), n)]

def main():
    if '--statute' not in sys.argv and '--inventory' not in sys.argv:
        print(__doc__); sys.exit(1)
    n = max(1, int(arg('--chunk', 20)))
    stat, noname = collections.OrderedDict(), []
    if arg('--statute'):
        for s in json.load(open(arg('--statute'), encoding='utf-8')).get('statutes', []):
            if not s.get('law') or s['law'].startswith('（'):
                noname.append(s['cite']); continue
            e = stat.setdefault((s['law'], s['article']), {'law': s['law'], 'article': s['article'], 'cites': []})
            if s['cite'] not in e['cites']:
                e['cites'].append(s['cite'])
    cases = []
    if arg('--inventory'):
        cases = json.load(open(arg('--inventory'), encoding='utf-8')).get('cases', [])
    st_items = [{'query': f"{e['law']}{c}", 'law': e['law'], 'cite': c} for e in stat.values() for c in (e['cites'] or [e['article']])]
    ca_items = [{'query': c['key'], 'cites': c['cites']} for c in cases]
    plan = {'statutes': st_items, 'cases': ca_items, 'statute_no_law_name': noname,
            'waves': [
                {'turn': 1, 'do': '条文の第1組・判例の第1組・文献を同じ回に出す（組が複数なら、次の組も続けて同じように）', 'calls': ['law_get_article（条文ごと）', 'case_verify_citation（判例ごと）', 'biblio_search（文献ごと）']},
                {'turn': 2, 'do': '1回目で found の判例について全部出す', 'calls': ['case_get（要旨・結果）', 'case_get_fulltext の find（理由を書く判例）', 'case_quote_check（「」で引く箇所）']},
                {'turn': 3, 'do': '1・2回目で no_match・multiple・upstream_error だったものだけ、直して引き直す', 'calls': ['入力（日付・巻号頁・条番号・時点）を直した呼び出し']}],
            'chunks': {'statutes': chunks([x['query'] for x in st_items], n), 'cases': chunks([x['query'] for x in ca_items], n)}}
    if arg('--out'):
        json.dump(plan, open(arg('--out'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    md = ['# 確認の計画（まとめて呼ぶ）', '', f'条文 {len(st_items)} 件・判例 {len(ca_items)} 件。1回に同時に出す目安は {n} 件。', '']
    for k, title in (('statutes', '条文'), ('cases', '判例')):
        for i, c in enumerate(plan['chunks'][k], 1):
            md += [f'## {title} 第{i}組（{len(c)}件）'] + [f'- {q}' for q in c] + ['']
    if noname:
        md += ['## 法令名が分からない引用（先に法令名を決める）'] + [f'- {x}' for x in noname] + ['']
    md += ['## 回の分け方'] + [f"{w['turn']}回目：{w['do']}（{'／'.join(w['calls'])}）" for w in plan['waves']]
    if arg('--md'):
        open(arg('--md'), 'w', encoding='utf-8').write('\n'.join(md))
    print('\n'.join(md))

if __name__ == '__main__':
    main()
