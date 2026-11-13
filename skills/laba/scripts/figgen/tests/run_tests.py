#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""figgen の回帰試験。過去に実際に起きた失敗（線の貫通・重なり、語の途中での折れ、本文と逆の矢印）を、二度と通さないための試験。
使い方（laba のフォルダで）:  python3 -B scripts/figgen/tests/run_tests.py [-v]
node が要る（SVG だけ作るので sharp は不要）。出力は一時フォルダに作り、終わったら消す。終了コード：全部通れば 0。

試験の組：
  routing  線の経路：端点でない箱を貫通しない・別の線と重ならない（機関設計 5 者、2×2 の対角 2 本、下向きの木の長い枝の語）
  lint     fig_lint が、貫通（E11）・重なり（E12）・文字と線の交差（E07）を、旧エンジンの出力（tests/broken/）から見つける
  trace    trace.py が、本文と逆の図を見つける（勝敗の入替え、対抗の矢印の逆向き、効果の取り違え、条文番号の誤り）。正しい図は通す
  inject   過去の独立の採点で注入した誤り（tests/inj/）で所見が出て、もとの正しい図では出ない（検出率を上げる目的で規則を足さない：過学習になる）
  advisory trace は所見を出す補助：正しい図（tests/fp/）で偽陽性が出ない、保証の語を出さない、照合できなかった要素と機械で見ない種類を毎回出す、退ける表
  swimlane スイムレーン：段の幅を中身から決め、6 段・7 段が warn なしで入る
  wrap     折り返し：条文番号・判例の表記・熟語・短い括弧の途中で折らない。法律語の辞書（lib/legal-words.json）の術語の途中・辞書にない連なりは warn・W13
  validate 仕様の検証：型の書き間違い、参照先のない id、知らない項目、列数の不一致
  parts    部品：範囲の枠、人でない対象の箱、凡例、基準時の補助線、「ない」状態の帯、流れ図の出口の箱、小枝（右向きの流れ図でも描く・三つ目は warn）
  bundle   同梱の用例：全部が warn なしで作れて lint の error が 0、README に全項目がある、書き込み用の文言が残っていない
"""
import json, os, re, subprocess, sys, tempfile, shutil, glob

HERE = os.path.dirname(os.path.abspath(__file__))
FIGGEN = os.path.dirname(HERE)
SCRIPTS = os.path.dirname(FIGGEN)
ROOT = os.path.dirname(SCRIPTS)
CLI = os.path.join(FIGGEN, 'cli.js')
LINT = os.path.join(SCRIPTS, 'fig_lint.py')
TRACE = os.path.join(FIGGEN, 'trace.py')
TMP = tempfile.mkdtemp(prefix='figgen-test-')
V = '-v' in sys.argv
results = []


def run(cmd, **kw):
    p = subprocess.run(cmd, capture_output=True, text=True, **kw)
    return p.returncode, p.stdout + p.stderr


def gen(spec_path, name=None):
    out = os.path.join(TMP, (name or os.path.basename(spec_path)).replace('.json', '.svg'))
    code, o = run(['node', CLI, spec_path, out, '--quiet'])
    return out, code, o


def gen_inline(spec, name):
    p = os.path.join(TMP, name + '.json'); json.dump(spec, open(p, 'w', encoding='utf-8'), ensure_ascii=False)
    return gen(p)


def lint(svg, spec=None):
    out = os.path.join(TMP, 'lint.json')
    run([sys.executable, '-B', LINT, svg, '--out', out] + (['--spec', spec] if spec else []))
    return json.load(open(out, encoding='utf-8'))[0]


def codes(r, key='errors'):
    return sorted(set(x.split()[0] for x in r[key]))


def check(group, name, ok, detail=''):
    results.append((group, name, bool(ok), detail))
    if V or not ok: print(('  ok   ' if ok else '  FAIL ') + f'[{group}] {name}' + (f'　— {detail}' if detail and not ok else ''))


def node_eval(js):
    code, o = run(['node', '-e', js], cwd=FIGGEN)
    return o.strip()


# ---------- routing ----------
for f, what in (('kikan-5nodes', '機関設計（5者）：斜めの線が真下の箱を貫通しない'), ('grid-2x2-diagonals', '2×2 の対角 2 本：貫通も重なりもしない'), ('tree-down-long-edge', '下向きの木：長い枝の語が箱に重ならない')):
    svg, code, o = gen(os.path.join(HERE, 'routing', f + '.json')); r = lint(svg)
    bad = [c for c in codes(r) if c in ('E06', 'E07', 'E10', 'E11', 'E12')]
    check('routing', what, code == 0 and not bad and '貫通' not in o and '同じ筋' not in o, f'lint {codes(r)} / cli {o.strip()[-120:]}')

# ---------- lint ----------
for f, need in (('kikan-5nodes.pierced', ['E11']), ('grid-2x2-diagonals.pierced', ['E11', 'E12']), ('tree-down-long-edge.overlap', ['E07'])):
    r = lint(os.path.join(HERE, 'broken', f + '.svg'))
    check('lint', f'旧エンジンの出力 {f} から {"・".join(need)} を見つける', all(c in codes(r) for c in need), f'出た error：{codes(r)}')

# ---------- trace ----------
for f, need, what in (('compare-flip-winner', 'T06', '勝つ・負けるの入替え'), ('chain-reversed-arrow', 'T06', '対抗の矢印が逆向き'), ('flow-wrong-effect', 'T06', '効果の取り違え（教唆犯に「減軽」）'), ('flow-wrong-article', 'T01', '条文番号の誤り')):
    base = os.path.join(HERE, 'trace', f)
    code, o = run([sys.executable, '-B', TRACE, base + '.bad.json', '--body', base + '.body.md', '--strict'])
    check('trace', f'注入した誤りを見つける：{what}（{need}）', code == 1 and need + '：' in o, o.strip()[-160:])
    code, o = run([sys.executable, '-B', TRACE, base + '.good.json', '--body', base + '.body.md', '--strict'])
    check('trace', f'正しい図は通す：{what}', code == 0 and not re.search(r'T0[167]：', o), o.strip()[-160:])
# 注入した誤り（独立の採点で使った 23 件。8 種：勝敗の入替え・矢印の逆向き・効果の取り違え・条文番号・主体の入替え・限定語・枝の語と順序・範囲の枠）
# tests/inj/bad/<記号>_<題>_<種>.json を、本文 tests/inj/body/<題>.md と照合して要修正（終了コード 1）になること。正しい図 tests/inj/good/ は通ること
INJ = os.path.join(HERE, 'inj')
for f in sorted(glob.glob(os.path.join(INJ, 'bad', '*.json'))):
    k = os.path.basename(f).split('_')[1]
    code, o = run([sys.executable, '-B', TRACE, f, '--body', os.path.join(INJ, 'body', k + '.md'), '--strict'])
    check('inject', f'注入した誤りを見つける：{os.path.basename(f)[:-5]}', code == 1, o.strip()[-200:])
for f in sorted(glob.glob(os.path.join(INJ, 'good', '*.json'))):
    k = os.path.basename(f).split('-')[0]
    code, o = run([sys.executable, '-B', TRACE, f, '--body', os.path.join(INJ, 'body', k + '.md'), '--strict'])
    check('inject', f'正しい図は通す（偽陽性なし）：{os.path.basename(f)[:-5]}', code == 0 and not re.search(r'T0[167]：', o), o.strip()[-200:])
# 新しい図への注入（round4 の 8 図に後から入れた 15 件）。*.miss.json は機械が見ない種類（時点の前後の入替え・段の見出しの意味の取り違え）で、
# 人の点検（reviewer-prompts/figure-check.md）に回す。見つけられるようになったら .miss を外す
FR = os.path.join(INJ, 'fresh')
for f in sorted(glob.glob(os.path.join(FR, 'bad', '*.json'))):
    k = os.path.basename(f).split('_')[1]
    code, o = run([sys.executable, '-B', TRACE, f, '--body', os.path.join(FR, 'body', k + '.md'), '--strict'])
    if f.endswith('.miss.json'): continue
    check('inject', f'新しい図への注入を見つける：{os.path.basename(f)[:-5]}', code == 1, o.strip()[-200:])
for f in sorted(glob.glob(os.path.join(FR, 'good', '*.json'))):
    k = os.path.basename(f).split('-')[0]
    code, o = run([sys.executable, '-B', TRACE, f, '--body', os.path.join(FR, 'body', k + '.md'), '--strict'])
    check('inject', f'新しい図の正しい版は通す：{os.path.basename(f)[:-5]}', code == 0 and not re.search(r'T0[167]：', o), o.strip()[-200:])
# 関係の表：本文に書かれていない向きを、表で与えると照合できる
tbl = os.path.join(TMP, 'rel.md'); open(tbl, 'w', encoding='utf-8').write('| 主語 | 相手 | 述語 | 根拠 |\n|---|---|---|---|\n| 第二譲受人 | 第一譲受人 | 所有権を対抗できる | 177条 |\n')
body = os.path.join(TMP, 'thin.md'); open(body, 'w', encoding='utf-8').write('売主（もとの所有者）は第一譲受人と第二譲受人に売った。①売買、②売買と移転登記。第一譲受人は先に契約したが、登記がない。第二譲受人は後に契約したが、先に登記を備えた。登記を先に備えた方が優先する（民法177条）。第二譲受人が背信的悪意者に当たるときは、第一譲受人は登記がなくても対抗できる（判例）。二重譲渡では、契約の先後ではなく登記の先後で決まる。\n')
code, o = run([sys.executable, '-B', TRACE, os.path.join(HERE, 'trace', 'chain-reversed-arrow.bad.json'), '--body', body, '--relations', tbl, '--strict'])
check('trace', '関係の表（--relations）と逆向きの矢印を見つける', code == 1 and 'T06：' in o, o.strip()[-200:])
code, o = run([sys.executable, '-B', TRACE, os.path.join(HERE, 'trace', 'chain-reversed-arrow.good.json'), '--body', body, '--relations', tbl, '--strict'])
check('trace', '関係の表と同じ向きの矢印は通す', code == 0 and 'T06：' not in o, o.strip()[-200:])

# ---------- advisory（round 5：trace は所見を出す補助。保証の語を出さない・正しい図を止めない・退ける道がある） ----------
# tests/fp/：正しい図（独立の採点者が本文を先に書いて作った図の、法的な書き方を直した版と、作成側が新しく作った図）。
# 偽陽性（T06・T07・T01・「なし」）が一つも出ないこと。ここに入れた図に合わせて照合の規則を書き換えたときは、新しい正しい図を足して確かめる
FP = os.path.join(HERE, 'fp')
for f in sorted(glob.glob(os.path.join(FP, '*.json'))):
    k = os.path.basename(f).split('-')[0]
    code, o = run([sys.executable, '-B', TRACE, f, '--body', os.path.join(FP, k + '.md'), '--strict'])
    check('advisory', f'正しい図で所見が出ない（偽陽性なし）：{os.path.basename(f)[:-5]}', code == 0 and not re.search(r'(T0[167]：|^\s+なし\s+：)', o, re.M), o.strip()[:300])
code, o = run([sys.executable, '-B', TRACE, os.path.join(FP, 'p5-parties-kokubai.json'), '--body', os.path.join(FP, 'p5.md'), '--strict'])
head = o.splitlines()[0] if o else ''
check('advisory', '出力に保証の語（一致・通過）を出さず、「所見なし（機械で見られる範囲で）」と書く', '所見なし（機械で見られる範囲で）' in head and not re.search(r'(一致|通過|要修正)', head), head)
check('advisory', '照合できなかった要素の一覧・機械で見ない種類・「一致の保証ではない」を毎回出す', all(x in o for x in ('照合できなかった要素', '機械で見ない種類', '一致の保証ではない', '止め線')), o[-300:])
code, o = run([sys.executable, '-B', TRACE, os.path.join(FP, 'p5-parties-kokubai.json'), '--body', os.path.join(FP, 'p5.md'), '--strict', '--quiet'])
check('advisory', '--quiet でも、照合できなかった要素の件数と機械で見ない種類を出す', '照合できなかった要素' in o and '機械で見ない種類' in o, o[-200:])
check('advisory', '止め線は「照合できず」として一覧に載る（照合したことにしない）', '（止め線）（照合できず）' in run([sys.executable, '-B', TRACE, os.path.join(FP, 'p5-parties-kokubai.json'), '--body', os.path.join(FP, 'p5.md')])[1], '')
# 退ける表：理由つきなら退け（終了コード 0、出力に理由が残る）、理由が空なら退けない
sp = os.path.join(TMP, 'dis-spec.json'); json.dump({'type': 'timeline', 'message': 'x。', 'caption': '図1　この図で分かること：x。', 'events': [{'date': '設定時', 'label': '抵当権を設定'}, {'date': '後', 'label': '賃料債権の差押え'}]}, open(sp, 'w', encoding='utf-8'), ensure_ascii=False)
bd = os.path.join(TMP, 'dis-body.md'); open(bd, 'w', encoding='utf-8').write('設定者は抵当権を設定し、その後、抵当権者は賃料債権の差押えをした。\n')
d1 = os.path.join(TMP, 'dis1.md'); open(d1, 'w', encoding='utf-8').write('| 記号 | 場所 | 理由 |\n|---|---|---|\n| なし | 設定時 | 本文の「抵当権を設定し」の時点を指す。語を本文に足す |\n')
d2 = os.path.join(TMP, 'dis2.md'); open(d2, 'w', encoding='utf-8').write('| 記号 | 場所 | 理由 |\n|---|---|---|\n| なし | 設定時 |  |\n')
c0, o0 = run([sys.executable, '-B', TRACE, sp, '--body', bd, '--strict'])
c1, o1 = run([sys.executable, '-B', TRACE, sp, '--body', bd, '--strict', '--dismiss', d1])
c2, o2 = run([sys.executable, '-B', TRACE, sp, '--body', bd, '--strict', '--dismiss', d2])
check('advisory', '所見を図を変えずに退ける：理由つきなら退けて理由を出力に残し、理由が空なら退けない', c0 == 1 and c1 == 0 and '退けた：' in o1 and c2 == 1 and '理由が書かれていない' in o2, f'{c0} {c1} {c2}')
# 問いの言い回しをそのまま答えた枝（「…でないか」→「でない」）を、逆の向きに読まない
code, o = run([sys.executable, '-B', TRACE, os.path.join(FP, 'p1-flow-daii.json'), '--body', os.path.join(FP, 'p1.md'), '--strict'])
check('advisory', '否定の問いの流れ図（「…でないか」→「でない」）・答えの語（でない・した）で所見を出さない', code == 0 and 'でない」の行き先' not in o, o[:200])

# ---------- swimlane ----------
# 段の幅を中身から決める：6 段（3 帯）・7 段（3 帯）が、cli の warn なし・lint の error なし・箱の語 3 行以内で入る
for f, what in (('six-daihyo', '6 段・3 帯（代表訴訟。採点者の仕様そのまま）'), ('seven-minso', '7 段・3 帯（短い段）'), ('seven-long', '7 段・3 帯（長い二行目と via）')):
    svg, code, o = gen(os.path.join(HERE, 'swimlane', f + '.json')); r = lint(svg)
    check('swimlane', f'スイムレーン {what}：warn なし・error なし・箱の語 3 行以内', code == 0 and 'warn' not in o and not r['errors'] and not any(w.startswith('W11') for w in r['warnings']), f'lint {r["errors"]} {r["warnings"][:2]} / cli {o.strip()[-160:]}')

# ---------- wrap ----------
W = json.loads(node_eval("""
const c=require('./lib/core');const out={};
for(const [k,t,w] of [['jobun1','取消しと財産の返還を請求（424条1項・424条の6第1項）',250],['jobun2','職務の執行を監査（381条1項）',190],['jobun3','検察官は24時間以内に請求する（205条1項）',200],['jobun4','民法424条の2の詐害行為取消請求',150],
 ['hanrei','最判昭和43・3・8民集22巻3号551頁は所有権移転登記を対抗できないとした',260],['jukugo1','公認会計士又は監査法人',150],['jukugo2','事情をさらに審理させる',110],['jukugo3','会計監査人が計算書類を監査する',130],
 ['kakko1','逮捕（身体の拘束）',170],['kakko2','訴えの利益（9条1項かっこ書）',200],['tanni','控訴期間は2週間の不変期間である',140]]) out[k]=c.wrap(t,w,21);
out.toks=c.tokenize('民法424条の2と203条1項、最判昭和43・3・8民集22巻3号551頁').join('|');out.kanji=c.splitKanji('所有権移転登記').join('|')+'/'+c.splitKanji('債権者代位権').join('|')+'/'+c.splitKanji('代表取締役').join('|');
console.log(JSON.stringify(out));"""))
joined = lambda k: '／'.join(W[k])
check('wrap', '条文番号の途中で折らない（424条の6第1項、381条1項、205条1項、民法424条の2）', not any(re.search(r'(条／の?\d|\d／条|条の／\d|項／|（／|\d／\d)', joined(k)) or re.search(r'条／\d+項', joined(k)) for k in ('jobun1', 'jobun2', 'jobun3', 'jobun4')), ' '.join(joined(k) for k in ('jobun1', 'jobun2', 'jobun3', 'jobun4')))
check('wrap', '条文番号・判例の表記がひとかたまりになる', all(t in W['toks'].split('|') for t in ('民法424条の2', '203条1項', '最判昭和43・3・8', '民集22巻3号551頁')), W['toks'])
check('wrap', '判例の表記の途中で折らない', not re.search(r'(昭和／|43／|・／|巻／|号／\d|\d／頁)', joined('hanrei')), joined('hanrei'))
check('wrap', '熟語の途中で折らない（公認会計士、さらに、会計監査人）', not any(x in joined('jukugo1') + joined('jukugo2') + joined('jukugo3') for x in ('公認会／', '会計／士', 'さ／ら', '会計監査／人', '計算／書類', '監／査')), joined('jukugo1') + ' ' + joined('jukugo2') + ' ' + joined('jukugo3'))
check('wrap', '熟語の区切り（所有権｜移転｜登記、債権者｜代位権、代表｜取締役）', W['kanji'] == '所有権|移転|登記/債権者|代位権/代表|取締役', W['kanji'])
check('wrap', '短い括弧の途中で折らない・行末に開き括弧を残さない', W['kakko1'] == ['逮捕', '（身体の拘束）'] and not any(l.endswith('（') or l.startswith('）') for k in W if isinstance(W[k], list) for l in W[k]), joined('kakko1') + ' ' + joined('kakko2'))
check('wrap', '数字と単位の間で折らない（2週間）', '2／週間' not in joined('tanni') and '2週／間' not in joined('tanni'), joined('tanni'))
# 法律語の辞書と、辞書にない漢字の連なりの一般則（round 5）
W2 = json.loads(node_eval("""
const c=require('./lib/core');const out={};
const t=(s,w)=>{c.wrapLog.length=0;const l=c.wrap(s,w,21);return {l:l.join('／'),warn:c.wrapLog.length>0};};
out.bad=[['共同正犯の成立',60],['株主総会に提出する',80],['代表取締役の選定',70],['非業務執行取締役等との責任限定契約',120],['業務上横領罪の共同正犯',110]].map(([s,w])=>t(s,w));
out.good=[['損害賠償請求権',100],['所有権移転登記',90],['債権者代位権の行使',90],['司法警察員',70],['公権力の行使に当たる公務員',110]].map(([s,w])=>t(s,w));
out.terms=c.TERMS.size; out.known2=c.KNOWN2.size; out.unk=c.unsafeKK('甲乙丙丁',2,'甲乙','丙丁');
console.log(JSON.stringify(out));"""))
check('wrap', '辞書の法律語の途中で折ったら warn（共同｜正犯、株主｜総会、代表｜取締役、非業務執｜行取締役等、業務上横｜領）', all(x['warn'] for x in W2['bad']), ' '.join(x['l'] + ('' if x['warn'] else '（warn なし）') for x in W2['bad']))
check('wrap', '語の切れ目での折り返しは warn にしない（損害賠償｜請求権、所有権｜移転登記、債権者｜代位権、司法｜警察員）', not any(x['warn'] for x in W2['good']), ' '.join(x['l'] + ('（warn）' if x['warn'] else '') for x in W2['good']))
check('wrap', f"辞書にない漢字の連なりを、分からない二字ずつで折るのは安全でない（一般則）。辞書は術語 {W2['terms']}・二字の語 {W2['known2']}", W2['unk'] is True and W2['terms'] >= 300, str(W2))
code, o = run([sys.executable, '-B', os.path.join(FIGGEN, 'tools', 'build_words.py'), '--check'])
check('wrap', '辞書（lib/legal-words.json）が、references/fields と手書きの語から作り直したものと同じ', code == 0, o.strip())
sp = {'type': 'tree', 'direction': 'down', 'message': 'x。', 'caption': '図1　この図で分かること：x。強調は一か所。', 'root': {'text': '身分はどう働くか', 'children': [{'edge': 'ある', 'text': '業務上横領罪の共同|正犯', 'accent': True}, {'edge': 'ない', 'text': '株主総会の|決議'}]}}
svg, code, o = gen_inline(sp, 'w13'); r = lint(svg)
check('wrap', 'lint（W13）が、法律語の途中の折れ（共同／正犯）を見つけ、語の切れ目（株主総会の／決議）は見逃す', any('W13' in w and '共同' in w for w in r['warnings']) and not any('W13' in w and '決議' in w for w in r['warnings']), str(r['warnings']))

# ---------- validate ----------
def cli_out(spec, name):
    _, code, o = gen_inline(spec, name); return code, o
code, o = cli_out({'type': 'party', 'message': 'x。', 'caption': '図1　この図で分かること：x。', 'nodes': []}, 'v1')
check('validate', '型の書き間違い（party）を止め、parties を示す', code != 0 and 'parties' in o, o[-200:])
code, o = cli_out({'type': 'parties', 'message': 'x。', 'caption': '図1　この図で分かること：x。強調は a。', 'nodes': [{'id': 'a', 'label': '債権者'}, {'id': 'b', 'label': '債務者'}], 'edges': [{'from': 'a', 'to': 'c', 'label': '請求', 'accent': True}]}, 'v2')
check('validate', '参照先のない id（edges の to）を止める', code != 0 and 'nodes にない id' in o, o[-200:])
code, o = cli_out({'type': 'parties', 'message': 'x。', 'caption': '図1　この図で分かること：x。強調は a。', 'nodeWith': 200, 'nodes': [{'id': 'a', 'label': '債権者'}, {'id': 'b', 'label': '債務者', 'pos': [1, 0]}], 'edges': [{'from': 'a', 'to': 'b', 'label': '請求', 'accent': True}]}, 'v3')
check('validate', '知らない項目（nodeWith）に warn を出し、nodeWidth を示す', code == 0 and 'nodeWidth' in o and '知らない項目' in o, o[-200:])
code, o = cli_out({'type': 'compare', 'message': 'x。', 'caption': '図1　この図で分かること：x。', 'columns': [{'title': 'A の場合'}, {'title': 'B の場合'}], 'rows': [{'label': '結論', 'cells': ['認める']}]}, 'v4')
check('validate', '列の数と cells の数の不一致を止める', code != 0 and 'cells が 1 個' in o, o[-200:])
code, o = cli_out({'type': 'timeline', 'message': 'x。', 'caption': '図1　この図で分かること：x。', 'events': [{'date': '当初', 'label': '契約'}, {'date': '後', 'label': '解除'}], 'tracks': [{'name': '状態', 'segments': [{'from': 0, 'to': 5, 'label': '有効'}]}]}, 'v5')
check('validate', '帯の to が出来事の番号の外にあるのを止める', code != 0 and 'events の番号' in o, o[-200:])

# ---------- parts ----------
svg, code, o = gen(os.path.join(FIGGEN, 'specs', 'parties-hanketsuko-hani.json')); s = open(svg, encoding='utf-8').read(); r = lint(svg)
check('parts', '範囲の枠・物の箱・凡例が描かれ、lint の error が 0', 'data-role="group"' in s and 'data-role="legend"' in s and 'data-role="shape"' in s and not r['errors'], str(r['errors']))
svg, code, o = gen(os.path.join(FIGGEN, 'specs', 'parties-daihyososho.json')); s = open(svg, encoding='utf-8').read(); r = lint(svg)
check('parts', '機関の箱（二重の枠）・手続の箱（山形）・注記の吹き出し', s.count('data-role="shape"') >= 2 and 'data-role="callout"' in s and 'data-role="leader"' in s and not r['errors'], str(r['errors']) + o[-100:])
svg, code, o = gen(os.path.join(FIGGEN, 'specs', 'panel-hoteichijoken.json')); s = open(svg, encoding='utf-8').read(); r = lint(svg)
check('parts', '基準時の補助線が、強調した時点から帯まで下りる', s.count('data-role="guide"') >= 2 and not r['errors'] and '太い実線' not in o, str(r['errors']) + o[-100:])
code, o = cli_out({'type': 'timeline', 'message': 'x。', 'caption': '図1　この図で分かること：x。強調は基準時。', 'events': [{'date': '設定時', 'label': '抵当権を設定', 'accent': True}, {'date': '競売後', 'label': '買受け'}], 'tracks': [{'name': '利用権', 'segments': [{'from': 1, 'label': '成立しない'}]}]}, 'p4')
check('parts', '「成立しない」を太い実線の帯で描くと warn', '太い実線' in o, o[-200:])
svg, code, o = gen(os.path.join(FIGGEN, 'specs', 'flow-torikeshisosho.json')); r = lint(svg)
rects = [tuple(float(x) for x in m) for m in re.findall(r'<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"[^>]*data-role="node"', open(svg, encoding='utf-8').read())]
exitbox = max(rects, key=lambda t: t[0]); endbox = max((t for t in rects if t[0] < exitbox[0]), key=lambda t: t[1])
check('parts', '流れ図：出口の箱は中身の高さ（終点の箱より低い）、左右の片寄り（W03）が出ない', exitbox[3] < endbox[3] and not any(w.startswith('W03') for w in r['warnings']) and not r['errors'], f'出口 {exitbox[3]} / 終点 {endbox[3]} / {r["warnings"]}')

svg, code, o = gen(os.path.join(HERE, 'parts', 'flow-branch.json')); s = open(svg, encoding='utf-8').read(); r = lint(svg)
check('parts', '流れ図の段の中の小枝（例外）：小さな箱と矢印が段の箱の中に入り、warn なし・lint の error が 0', code == 0 and 'warn' not in o and s.count('data-role="shape"') >= 4 and not r['errors'], str(r['errors']) + o[-120:])
# 右向きの流れ図：小枝と段ごとの通過の語が黙って消えない（round 4 の採点で、right() が branch と steps[].pass を読まず、warn も出なかった）
svg, code, o = gen(os.path.join(HERE, 'parts', 'flow-branch-right.json')); s = re.sub(r'<[^>]+>|\s', '', open(svg, encoding='utf-8').read()); r = lint(svg)
fr = json.load(open(os.path.join(HERE, 'parts', 'flow-branch-right.json'), encoding='utf-8'))
want = [b['text'] for st_ in fr['steps'] for b in st_.get('branch', [])] + [st_['pass'] for st_ in fr['steps'] if st_.get('pass')]
check('parts', '右向きの流れ図：小枝の箱と段ごとの通過の語が全部描かれ、warn なし・lint の error が 0', code == 0 and all(w in s for w in want) and 'warn' not in o and not r['errors'], '描かれない語：' + '・'.join(w for w in want if w not in s) + ' ' + o[-120:])
fr3 = json.loads(json.dumps(fr)); fr3['steps'][0]['branch'].append({'label': '三つ目', 'text': '三つ目の小枝', 'sub': '1条'})
_, code, o = gen_inline(fr3, 'flow-right-3'); fd = json.loads(json.dumps(fr3)); fd['direction'] = 'down'; _, code2, o2 = gen_inline(fd, 'flow-down-3')
check('parts', '流れ図の三つ目の小枝：右向き・下向きとも、黙って落とさず warn を出す', '小枝は一つの段に二つまで' in o and '小枝は一つの段に二つまで' in o2, o[-160:] + ' / ' + o2[-160:])
sp = json.load(open(os.path.join(FIGGEN, 'specs', [f for f in os.listdir(os.path.join(FIGGEN, 'specs')) if f.startswith('compare')][0]), encoding='utf-8'))
sp['rows'][0]['cells'][0] = {'text': sp['rows'][0]['cells'][0] if isinstance(sp['rows'][0]['cells'][0], str) else '本文の帰結', 'except': 'ただし、例外の一行（1条2項）'}
svg, code, o = gen_inline(sp, 'cmp-except'); s = open(svg, encoding='utf-8').read(); r = lint(svg)
check('parts', '比較図の見出しの帯と、セルの例外の一行：warn なし・lint の error が 0', code == 0 and 'warn: ' not in o and '例外の一行' in s and s.count('stroke-width="2.5"') >= len(sp['columns']) and not r['errors'], str(r['errors']) + o[-120:])

# ---------- bundle ----------
specs = sorted(glob.glob(os.path.join(FIGGEN, 'specs', '*.json'))); badgen, badlint = [], []
for f in specs:
    svg, code, o = gen(f)
    if code != 0 or re.search(r'warn: (線が|ラベルの置き場|語の途中|幅に入らない|文字の重なり|文字が版面|箱の語|線の横の語|知らない項目)', o): badgen.append(os.path.basename(f) + ': ' + o.strip()[-90:])
    else:
        r = lint(svg, f)
        if r['errors']: badlint.append(os.path.basename(f) + ': ' + str(r['errors'][:2]))
check('bundle', f'同梱の用例 {len(specs)} 本が、経路・折り返し・行数の warn なしで作れる', not badgen, ' / '.join(badgen[:4]))
check('bundle', f'同梱の用例 {len(specs)} 本の lint の error が 0', not badlint, ' / '.join(badlint[:4]))
readme = open(os.path.join(FIGGEN, 'README.md'), encoding='utf-8').read()
keys = sorted(set(re.findall(r'spec\.([a-zA-Z]+)', ''.join(open(f, encoding='utf-8').read() for f in glob.glob(os.path.join(FIGGEN, 'lib', 'renderers', '*.js'))))))
miss = [k for k in keys if f'`{k}`' not in readme]
check('bundle', f'レンダラが読む仕様の項目 {len(keys)} 個が、全部 README にある', not miss, '無い項目：' + '・'.join(miss))
# README の「型ごとの最小の仕様」が、そのまま動く
mins = [json.loads(l) for l in readme.split('## 4　型ごとの最小の仕様')[1].split('```json')[1].split('```')[0].strip().splitlines() if l.strip().startswith('{')]
badmin = []
for i, m in enumerate(mins):
    m.update({'message': '試験のための図である。', 'caption': '図1　この図で分かること：試験のための図である。強調は一か所。'})
    svg, code, o = gen_inline(m, f'min{i}')
    if code != 0 or 'error' in o or '知らない項目' in o: badmin.append(m['type'] + ': ' + o.strip()[-80:])
    elif lint(svg)['errors']: badmin.append(m['type'] + ': lint ' + str(lint(svg)['errors'][:1]))
check('bundle', f'README の最小の仕様 {len(mins)} 型が、そのまま作れて lint の error が 0', len(mins) == 17 and not badmin, ' / '.join(badmin[:4]))
hits = []
for base in (os.path.join(FIGGEN, 'specs'), os.path.join(ROOT, 'references', 'figures')):
    for f in glob.glob(os.path.join(base, '**', '*.*'), recursive=True):
        t = open(f, encoding='utf-8').read()
        for w in ('判決書の送達', '資料で確認する', '一行で書く'):
            if re.search(r'(?<!電子)' + w, t): hits.append(os.path.relpath(f, ROOT) + '：' + w)
check('bundle', '用例に、古い条文の文言・書き込み用の文言が残っていない', not hits, ' / '.join(hits[:4]))

shutil.rmtree(TMP, ignore_errors=True)
n = len(results); ng = [x for x in results if not x[2]]
by = {}
for g, _, ok, _ in results: by.setdefault(g, [0, 0]); by[g][0] += 1; by[g][1] += ok
print(f'回帰試験 {n} 本：通過 {n - len(ng)}・失敗 {len(ng)}　（' + '、'.join(f'{g} {v[1]}/{v[0]}' for g, v in by.items()) + '）')
sys.exit(1 if ng else 0)
