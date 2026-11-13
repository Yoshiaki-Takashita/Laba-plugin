#!/usr/bin/env python3
"""一括の検査：一覧化→本文の検査→図の検査→採点→次に直す点、までを回し、レポート（md）を出す。
usage: pipeline.py --note NOTE.txt --body BODY.txt --out DIR
                   [--source SOURCE.txt] [--blocks blocks.json] [--figs 'figs/*.svg'] [--cards cards.json]
                   [--reviewer reviewer.json] [--default-law 民事訴訟法] [--no-reason '昭和43・3・8,…']
                   [--reasons reasons.json] [--fulltext DIR] [--tf items.json] [--terms 語1,語2]
                   [--coverage-ignore ignore.json] [--certainty-ignore ignore.json]
                   [--index index.json] [--pdf NOTE.pdf]
                   [--fig-specs 'figs/*.json'] [--deck DECK.pptx [--deck-theme teal|mono]]
                   [--ledger LEDGER.tsv --resume-text RESUME.txt] [--sync-resume RESUME.json --sync-deck DECK_SPEC.json]
  --note   ノートの全文（build_docx.py --text-out）   --body  本文だけ（--body-out）
  --source 資料の書き起こし（あれば、網羅・一致・確度・文体の比較をする）
  --blocks build_docx.py の入力 JSON、または DOC を定義した .py（表・まとめ・層を正確に読むため。無ければ全文テキストから層を推定する）
  --reasons 判例の理由の出所表（reason_table.py init で作り、人が埋めたもの）  --fulltext 判決全文の保存先（case_lookup.py --save）
  --tf     短答式の命題の一覧（tf_items.py の items.json）
  --index  巻末の概念の索引（xref_index.py --block の出力、または {"rows": …}）。derived_check.py が、語が書かれた節に出るかを見る
  --pdf    ノートの PDF。頁数と、下が4割を超えて空く頁を report_numbers.py が数える（報告に書く数値は numbers.md を写す）
  --coverage-ignore 網羅の機械照合の誤検知を、理由つきで除く一覧（coverage_check.py --ignore）
  --fig-specs 図の仕様（figgen の JSON）。ラベルが本文にあるかを figgen/trace.py で照合する（--figs は SVG の規則の検査）
  --deck    スライド（.pptx）の体裁を slides/deck_lint.py で検査する（python-pptx が要る）
  --ledger／--resume-text 判例研究の引用台帳と、ID つきの本文を hanrei/ledger.py で検査する
  --sync-resume／--sync-deck 判例研究のレジュメとスライドの構成を hanrei/sync_check.py で照らす
  --certainty-ignore 確度の検査（足した層の候補）のうち、読んで留保と別の点だと確かめた文を、理由つきで除く一覧（certainty_check.py --ignore）
出力：DIR/*.json（各検査）と DIR/report.md（結果の表、WARN の一覧、次に直す点）。
次に直す点は references/algorithms/next-fix.md の決定表（16指標）による。指標ごとの文書は references/metrics/。機械が見るのは形だけなので、
法的な正確さ・意味のずれ・書き手の判定は、独立点検（references/verification.md）で見る。"""
import sys, os, json, subprocess, glob

HERE = os.path.dirname(os.path.abspath(__file__))

def arg(flag, default=None):
    return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv and sys.argv.index(flag) + 1 < len(sys.argv) else default

def run(name, *args):
    r = subprocess.run([sys.executable, os.path.join(HERE, name)] + [a for a in args if a is not None], capture_output=True, text=True)
    return r.returncode, (r.stdout + r.stderr).strip()

def load(d, n):
    p = os.path.join(d, n)
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else None

METRIC = {1: '01-statute', 2: '02-case-cite', 3: '03-reason-fidelity', 4: '04-certainty', 5: '05-definition', 6: '06-argument-density', 7: '07-example-density',
          8: '08-hard-spots', 9: '09-system-links', 10: '10-originality', 11: '11-info-efficiency', 12: '12-exam-use', 13: '13-coverage', 14: '14-technique',
          15: '15-errors', 16: '16-style'}

def main():
    note, body, out = arg('--note'), arg('--body'), arg('--out')
    if not (note and body and out):
        print(__doc__); sys.exit(1)
    os.makedirs(out, exist_ok=True)
    src, blocks, figs, cards, rev = arg('--source'), arg('--blocks'), arg('--figs'), arg('--cards'), arg('--reviewer')
    J = lambda n: os.path.join(out, n)
    log = []
    def step(title, name, *a):
        rc, o = run(name, *a); log.append((title, name, rc, o)); return rc
    if src:
        step('一覧化', 'inventory.py', src, '--out', J('inventory.json'), '--md', J('inventory.md'))
        step('網羅（機械照合）', 'coverage_check.py', J('inventory.json'), note, '--out', J('coverage.json'), *(['--ignore', arg('--coverage-ignore')] if arg('--coverage-ignore') else []))
        step('文体の測定', 'style_profile.py', src, '--out', J('profile.json'))
        step('文体', 'style_check.py', body, '--profile', J('profile.json'), '--out', J('style.json'))
        step('一致（丸写しの程度）', 'match_check.py', src, body, '--out', J('match.json'))
        step('確度の語', 'certainty_check.py', src, note, '--out', J('certainty.json'))
        step('書誌', 'cite_check.py', note, '--inventory', J('inventory.json'), '--out', J('cite.json'))
        step('密度', 'density.py', body, '--source', src, '--out', J('density.json'))
    else:
        step('文体（既定値）', 'style_check.py', body, '--out', J('style.json'))
        step('書誌', 'cite_check.py', note, '--out', J('cite.json'))
        step('密度', 'density.py', body, '--out', J('density.json'))
    a = [note, '--out', J('statute.json'), '--md', J('statute.md')]
    if arg('--default-law'):
        a += ['--default-law', arg('--default-law')]
    step('条文の一覧', 'statute_check.py', *a)
    a = [note, '--out', J('reason.json')]
    if blocks:
        a += ['--blocks', blocks]
    if arg('--no-reason'):
        a += ['--no-reason', arg('--no-reason')]
    if arg('--reasons'):
        a += ['--reasons', arg('--reasons')]    # 判示を書いたセルごとに、判決全文の該当箇所の控えがあるかを見る
    step('判例の理由の出所', 'reason_source_check.py', *a)
    if blocks:
        step('まとめの重複', 'summary_dup_check.py', blocks, '--out', J('summary.json'))
    else:
        step('まとめの重複', 'summary_dup_check.py', note, '--text', '--out', J('summary.json'))
    if figs:
        fl = sorted(glob.glob(figs))
        if fl:
            step('図', 'fig_lint.py', *fl, '--out', J('figs.json'))
    # ---- 任意の段：図と本文の照合、スライド、判例研究（渡されたときだけ回す） ----
    if arg('--fig-specs'):
        sl = sorted(glob.glob(arg('--fig-specs')))
        if sl:
            step('図と本文の照合', 'figgen/trace.py', *sl, '--body', body, '--out', J('trace.json'), '--quiet')
    if arg('--deck'):
        step('スライドの体裁', 'slides/deck_lint.py', arg('--deck'), '--json', J('deck.json'), *(['--theme', arg('--deck-theme')] if arg('--deck-theme') else []))
    if arg('--ledger') and arg('--resume-text'):
        step('引用台帳', 'hanrei/ledger.py', arg('--resume-text'), '--ledger', arg('--ledger'), '--json', J('ledger.json'))
    if arg('--sync-resume') and arg('--sync-deck'):
        step('レジュメとスライドの照合', 'hanrei/sync_check.py', arg('--sync-resume'), arg('--sync-deck'), '--json', J('sync.json'))
    # ---- 指標ごとの検査（references/metrics/） ----
    lay = blocks or note   # 層つきで読めるもの（blocks が無ければ全文テキストから推定）
    a = [lay, '--out', J('argument.json')] + (['--source', src] if src else [])
    step('論証の型（⑥）', 'argument_check.py', *a)
    a = [lay, '--out', J('efficiency.json')] + (['--source', src] if src else [])
    step('情報効率（⑪）', 'info_efficiency.py', *a)
    a = [lay, '--out', J('xref.json')] + (['--source', src] if src else []) + (['--terms', arg('--terms')] if arg('--terms') else [])
    step('相互参照と対比（⑨）', 'xref_index.py', *a)
    a = [body, '--out', J('swap.json')] + (['--source', src] if src else [])
    step('置き換え・浮いた語（⑩・文体）', 'word_swap_check.py', *a)
    step('要件・効果の候補（⑫）', 'yoken_table.py', lay, '--check', '--out', J('yoken.json'))
    if src:
        step('定義の照合（⑤）', 'definition_check.py', src, lay, '--out', J('definition.json'), '--md', J('definition.md'))
    else:
        step('定義の照合（⑤）', 'definition_check.py', '--note-only', lay, '--out', J('definition.json'))
    if src and blocks:
        step('確度の語（層つき）', 'certainty_check.py', src, blocks, '--out', J('certainty.json'), *(['--ignore', arg('--certainty-ignore')] if arg('--certainty-ignore') else []))
    if arg('--reasons'):
        a = ['check', arg('--reasons'), '--note', lay, '--out', J('reason_table.json')] + (['--fulltext', arg('--fulltext')] if arg('--fulltext') else []) + (['--source', src] if src else [])
        step('判例の理由の出所表（③）', 'reason_table.py', *a)
    if arg('--tf'):
        step('短答式の命題（⑫）', 'tf_items.py', 'check', arg('--tf'), '--note', lay, '--out', J('tf.json'))
    if cards:
        sys.path.insert(0, HERE)
        import card_build
        from laba_blocks import load_units
        ntxt = '\n'.join(u['text'] for u in load_units(lay) if u['layer'] in ('body', 'table', 'zak'))
        cs = json.load(open(cards, encoding='utf-8'))['cards']
        tfi = json.load(open(arg('--tf'), encoding='utf-8'))['items'] if arg('--tf') else None
        iss = card_build.check(cs, ntxt, tfi)
        json.dump({'n_cards': len(cs), 'issue_count': len(iss), 'issues': iss, 'notes': card_build.check.notes,
                   'extended': all((c.get(k) or '').strip() for c in cs for k in ('tf', 'opening'))},
                  open(J('card.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
        log.append(('論点カード', 'card_build.py', 0, '\n'.join(['  所見: ' + x for x in iss] + [f'論点 {len(cs)}／所見 {len(iss)}／注意 {len(card_build.check.notes)}'])))
    if blocks and (cards or arg('--tf') or arg('--index')):
        # 派生物（カード・短答・まとめ・索引）を、根拠にした本文の箇所と照合する
        a = [blocks, '--out', J('derived.json')] + (['--cards', cards] if cards else []) + (['--tf', arg('--tf')] if arg('--tf') else []) + (['--index', arg('--index')] if arg('--index') else [])
        step('派生物と本文の照合（④⑫）', 'derived_check.py', *a)
    # 報告に書く数値（数え方つき）。頁の使い方（--pdf）は ⑪ の採点にも使う
    a = [note, '--out', J('numbers.json'), '--md', J('numbers.md')] + (['--blocks', blocks] if blocks else []) + (['--source', src] if src else []) \
        + (['--cards', cards] if cards else []) + (['--tf', arg('--tf')] if arg('--tf') else []) + (['--index', arg('--index')] if arg('--index') else []) \
        + (['--pdf', arg('--pdf'), '--pages-out', J('pages.json')] if arg('--pdf') else [])
    step('報告用の数値', 'report_numbers.py', *a)
    a = ['--dir', out, '--out', J('score.json'), '--md', J('score.md')]
    if rev:
        a += ['--reviewer', rev]
    step('採点', 'score.py', *a)

    # ---- 次に直す点（references/algorithms/next-fix.md の決定表） ----
    st, cov, m, ce, ci, de = (load(out, n) for n in ('style.json', 'coverage.json', 'match.json', 'certainty.json', 'cite.json', 'density.json'))
    rs, sm, fg, cd, sc, stt = (load(out, n) for n in ('reason.json', 'summary.json', 'figs.json', 'card.json', 'score.json', 'statute.json'))
    fixes = []  # (優先度, 何を, どう直す, 参照)
    if cov and cov['missing_items']:
        mk = {k: len(v) for k, v in cov['missing'].items() if v}
        fixes.append((1, f'資料の項目の欠落 {mk}', '欠落を一件ずつ見て、ノートに足す（機械の誤検知なら理由を書いて除く）', 'workflow.md ②、checklists/02'))
    if ci and ci['issue_count']:
        fixes.append((1, f"判例の書誌の所見 {ci['issue_count']} 件", '表記をそろえ、食い違う書誌は原典で確かめる', 'case-verification.md 6'))
    if rs and rs['issue_count']:
        fixes.append((1, f"判例の理由の出所の所見 {rs['issue_count']} 件", '表の列を「判決が挙げる理由」「資料の説明」に分ける。理由を述べていない判決はそう書く', 'techniques.md 4'))
    if stt and stt['conflict_candidates']:
        fixes.append((2, f"同じ条文に向きの違う説明 {len(stt['conflict_candidates'])} 組（候補）", '候補を読み、食い違いなら条文で確かめて直す', 'statute-verification.md'))
    if stt:
        fixes.append((2, f"条文 {stt['n_statutes']} 件の照合", 'statute.md の表を e-Gov の現行条文と1件ずつ照らす（限定の語・名宛人）', 'statute-verification.md'))
    df = load(out, 'definition.json')
    if df and df['issue_count']:
        fixes.append((2, f"定義の照合：語が落ちた候補 {len(df['lost'])}・定義なし {len(df['missing_terms'])}・ノートの中の食い違い {len(df['conflicts'])}", 'definition.md の表を1行ずつ読み、限定の語を戻す。表・カードの定義は本文の文を写す', 'metrics/05-definition.md'))
    if ce and ce.get('layer_candidates'):
        fixes.append((2, f"足した層（ざっくり理解・図題・表・巻末の表）で、本文の留保を落とした候補 {len(ce['layer_candidates'])} 文", '一文ずつ読む。留保を落としていれば戻す。別の点を述べた文なら、理由を書いて除く（--certainty-ignore）', 'metrics/04-certainty.md'))
    if ce and ce['lost']:
        fixes.append((2, f"確度の語が見当たらない文 {ce['lost']}", '一件ずつ見て、留保を落としていれば戻す', 'techniques.md 8'))
    if st and st['warn_count']:
        w = [c['item'] for c in st['checks'] if c['status'] == 'WARN']
        fixes.append((3, f'文体の WARN {w}', '該当の数値を資料に寄せる。語の置き換えで済ませない', 'style-imitation.md 5'))
    if m:
        f = m['filtered']
        if f['longest'] > 30 or f['gram12_rate_pct'] > 10:
            fixes.append((3, f"丸写しに近い（除外後：最長 {f['longest']} 字・12字一致率 {f['gram12_rate_pct']}%）", '最長の一致から順に、術語以外を自分の言葉に戻す', 'style-imitation.md 7'))
        if m['length_ratio'] > 1.15:
            fixes.append((3 if m['length_ratio'] <= 1.3 else 2, f"分量が資料の {m['length_ratio']} 倍", '二重記載（判例の本文と表）、言い直し、範囲外の加筆を削る（目標1.15倍、上限1.3倍）', 'algorithms/table-or-prose.md'))
    if de:
        for w in de.get('warn', []):
            fixes.append((3, w, '足した説明（全体像・ざっくり理解・まとめ・図題）の段落ごとに、理由の文を1つ置く', 'techniques.md 3・9'))
    if sm:
        for w in sm.get('warn', []):
            fixes.append((3, w, 'まとめは全体の1か所にし、章末のまとめは論点カードに置き換える', 'ronten-card.md'))
    if fg:
        ne = sum(len(x['errors']) for x in fg)
        if ne:
            fixes.append((2, f'図の error {ne}', 'fig_lint の指摘を直し、PNG を目で見る', 'figures.md 4'))
    tr, dk, lg, sy = (load(out, n) for n in ('trace.json', 'deck.json', 'ledger.json', 'sync.json'))
    if tr:
        nn = sum(v.get('none', 0) for v in tr.values()); np_ = sum(v.get('partial', 0) for v in tr.values())
        if nn or np_:
            fixes.append((2, f'図のラベルが本文に見当たらない {nn}・部分一致 {np_}（図 {len(tr)} 枚）', '所見は要確認の手がかりで、誤りの証明ではない。読み上げの表で本文と並べ、誤りなら直し、正しければ trace --dismiss で理由を残す。所見を消すために図の語（要件など）を削らない', 'figures/06-traceability.md'))
    if dk and dk.get('errors'):
        fixes.append((2, f"スライドの体裁の error {dk['errors']}（warn {dk.get('warnings', 0)}）", 'deck_lint の指摘を直し、全枚を画像にして見る', 'slides/09-quality-rubric.md、slides/05-text-fitting.md'))
    if lg and lg.get('errors'):
        fixes.append((1, f"引用台帳の error {lg['errors']}（warn {lg.get('warnings', 0)}）", '読んでいない文献の「」と頁を外す。格付けを直す', 'hanrei/02-citation-grade.md'))
    if sy and sy.get('errors'):
        fixes.append((2, f"レジュメとスライドの照合の error {sy['errors']}（warn {sy.get('warnings', 0)}）", '見出しの番号と題、当事者の記号をレジュメに合わせる', 'slides/06-speech-sync.md'))
    ag, ef, xr, sw, rt, tf, yk = (load(out, n) for n in ('argument.json', 'efficiency.json', 'xref.json', 'swap.json', 'reason_table.json', 'tf.json', 'yoken.json'))
    if rt:
        if rt['issue_count']:
            fixes.append((1, f"理由の出所表の所見 {rt['issue_count']} 件（抜き書きの不一致 {rt['excerpt_not_found']}・該当箇所の控えなし {rt.get('points_without_where', 0)}・欄の文が判決文の語でない {len(rt.get('wording_issues', []))}）",
                          '判決文に当たり直し、抜き書きを原文どおりに。各点に頁か段落の冒頭を控える（reason_table.py locate）。欄の文は判決文の語で書き、資料の言い方は「資料の説明」へ移す', 'metrics/03-reason-fidelity.md'))
        if rt['by_status'].get('判決文未確認', 0):
            fixes.append((2, f"判決文を確かめていない判例 {rt['by_status']['判決文未確認']} 件", 'case_lookup.py で全文を取り、理由の箇所を抜き書きする', 'case-verification.md 7'))
    elif not arg('--reasons'):
        fixes.append((4, '判例の理由の出所表がない', 'reason_table.py init で雛形を作り、判例ごとに判決文を確かめる（指標③を9.5にする条件）', 'metrics/03-reason-fidelity.md'))
    if ag:
        if ag['added_blocks_without_reason']:
            fixes.append((3, f"足した層（ざっくり理解・全体像・まとめ）で理由の文がない塊 {len(ag['added_blocks_without_reason'])} 個", '塊ごとに「なぜか」を1文（〜からです／〜ためです）。標識だけを足さない', 'metrics/06-argument-density.md'))
        if ag['hosoku_without_reason']:
            fixes.append((3, f"（補足）の命題に根拠が続いていない {len(ag['hosoku_without_reason'])} 個", '補足の直後に根拠（条文・本文の箇所）を添えるか、補足をやめる', 'added-text-safety.md 1'))
        for w in ag.get('warn', []):
            if '論証密度が資料より' in w:
                fixes.append((3, w, '該当の節の本文段落（argument.json の paragraphs_without_reason）を読み、理由が抜けた段落に資料の理由を戻す', 'metrics/06-argument-density.md'))
    if ef:
        if ef['restatement']['summary_blocks'] > 1 or ef['restatement']['restatement_pct'] > 4:
            fixes.append((3, f"まとめ {ef['restatement']['summary_blocks']} か所・言い直しの層 {ef['restatement']['restatement_pct']}%", 'まとめは全体の1か所にし、章末のまとめは論点カードに置き換える', 'metrics/11-info-efficiency.md'))
        if ef.get('length_ratio_main', 0) > 1.15:
            fixes.append((3 if ef['length_ratio_main'] <= 1.3 else 2, f"分量が資料の {ef['length_ratio_main']} 倍（巻末の表を除く）", f"削る候補 {len(ef['cut_candidates'])} 件・{ef['cut_chars']} 字（efficiency.json の cut_candidates）から、言い直し・二重記載を削る", 'metrics/11-info-efficiency.md'))
        c = ef['cross_layer'].get('table')
        if c and c['restated'] >= 3:
            fixes.append((3, f"表のセル {c['restated']} 個が本文と二重", '判例は本文か表の一方に書く', 'algorithms/case-placement.md'))
        if len(ef['low_new_info_sentences']) >= 3:
            fixes.append((3, f"新しい情報の少ない文 {len(ef['low_new_info_sentences'])} 個", '再説明は「前述のとおり」＋節番号の参照に縮める', 'metrics/11-info-efficiency.md'))
    if xr:
        if xr.get('source_arrows', {}).get('missing'):
            fixes.append((1, f"資料の相互参照（⇨）の欠落 {xr['source_arrows']['missing']}", '資料の ⇨ を全部残す', 'techniques.md 11'))
        if xr['link_candidates']:
            fixes.append((4, f"3つ以上の節に出るのに参照のない語 {len(xr['link_candidates'])} 個", '2回目以降の箇所に「前述の（12-3-4）」のような参照を1つ添える。巻末に概念の索引を付ける', 'metrics/09-system-links.md'))
    if sw and sw['float_count']:
        fixes.append((3, f"置き換えの型 {len(sw['swap_hits'])}・資料に出ない語 {len(sw['foreign_words'])}・出にくい言い回し {len(sw['unusual_phrases'])}・平易な言い換え {len(sw['plain_in_body'])}", '語を替えて済ませず、資料の同じ働きの文に倣って書き直す', 'style-imitation.md 5、metrics/16-style.md'))
    if tf:
        if tf['issue_count']:
            fixes.append((3, f"短答式の命題の所見 {tf['issue_count']} 件", '×の割合・根拠・重複・確度を直す', 'metrics/12-exam-use.md'))
    elif not arg('--tf'):
        fixes.append((4, '短答式の命題の一覧がない', 'tf_items.py candidates で候補を出し、20〜30問を巻末に付ける（指標⑫を9.5にする条件）', 'metrics/12-exam-use.md'))
    dv = load(out, 'derived.json')
    if dv and dv['issue_count']:
        fixes.append((1, f"派生物（カード・短答・まとめ・索引）と本文の照合の所見 {dv['issue_count']} 件 {dv['by_kind']}", '行の文を、根拠にした本文の箇所と同じ強さ・同じ条文に書き直す。根拠の節（section）を書く。除外の一覧は置かない', 'metrics/04-certainty.md、metrics/12-exam-use.md、failure-catalog.md'))
    elif not dv and (cards or arg('--tf')):
        fixes.append((2, '派生物と本文の照合をしていない（--blocks が無い）', 'blocks を渡して derived_check.py を回す', 'metrics/04-certainty.md'))
    if ef and ef.get('back'):
        bk = ef['back']
        if bk['filler_columns'] or bk['dup_cells'] or bk['back_to_main'] > 0.5:
            fixes.append((3, f"巻末：中身のない列 {len(bk['filler_columns'])}・巻末どうしの重複 {len(bk['dup_cells'])} セル・本編の {bk['back_to_main']} 倍", '中身のない列をやめる。同じ問・同じ理由は一方を番号の参照にする', 'metrics/11-info-efficiency.md、ronten-card.md'))
    pgj = load(out, 'pages.json')
    if pgj and pgj['blank_pages']:
        fixes.append((3, f"下が4割を超えて空く頁 {pgj['blank_pages']}（全 {pgj['n_pages']} 頁）", '図・表の前後の段落の順を入れ替える、長い表は行の間で頁をまたがせる、巻末の改頁を減らす', 'metrics/11-info-efficiency.md'))
    if yk and yk.get('issues'):
        fixes.append((2, f"要件・効果の候補に所見 {len(yk['issues'])} 件", '効果を言い切りに。同じ条文で向きの違う効果は、原則と例外の書き分けかを確かめる', 'statute-verification.md 4'))
    if cd is None:
        fixes.append((4, '論点カードがない（または検査していない）', '巻末に論点カード表（8〜12個）を付ける', 'ronten-card.md'))
    elif cd['issue_count']:
        fixes.append((3, f"論点カードの所見 {cd['issue_count']}", '空欄を埋め、規範に条文か判例を入れる。書誌は本文と同じ表記に', 'ronten-card.md'))
    elif not cd.get('extended'):
        fixes.append((4, '論点カードに、短答で問われる形・論述での書き出しの欄がない', '2欄を全論点に足す（短答の表と同じ問は「→短答N」。指標⑫を9.5にする条件）', 'ronten-card.md 7'))
    if de and de.get('source') and de['source'].get('example_density_pct'):
        r7 = de['note']['example_density_pct'] / de['source']['example_density_pct']
        if r7 < 1.1:
            fixes.append((3, f"具体例密度が資料比 {r7:.2f}（1.1未満）", '規範の直後に記号事例を置く。資料の事例を節をまたいで使い回す。足した例は帰結を確かめ、（補足）を付ける', 'metrics/07-example-density.md'))
    if m:
        per10k = 10000.0 * m['filtered']['count'] / max(1, m['note_chars'])
        if per10k > 7.5 and not (m['filtered']['longest'] > 30 or m['filtered']['gram12_rate_pct'] > 10):
            fixes.append((3, f"地の文の20字一致が1万字あたり {per10k:.1f} か所（除外後 {m['filtered']['count']} か所。生の値 {m['raw']['count']} か所）", 'match.json の一致を長い順に読み、文の組み立てを変える。術語・定義・条文は変えない', 'metrics/10-originality.md'))
    rvj = json.load(open(rev, encoding='utf-8')) if rev else None
    if rvj:
        er = rvj.get('errors') or {}
        if er.get('major', 0) or er.get('mid', 0):
            fixes.append((1, f"点検者が挙げた誤り：重大 {er.get('major', 0)}・中 {er.get('mid', 0)}・軽微 {er.get('minor', 0)}", '全部直す。直した箇所の前後と、図・表・カード・短答の同じ内容も直す。記憶による指摘は原典で確かめてから', 'metrics/15-errors.md、verification.md 5'))
        for x in rvj.get('must_fix', []):
            fixes.append((1, f'点検者の「必ず直す点」：{x}', '指摘の箇所を原典と照らして直す', 'verification.md 5'))
        if rvj.get('coverage_pct') is not None and rvj['coverage_pct'] < 95:
            fixes.append((1, f"点検者の網羅率 {rvj['coverage_pct']}%（95%未満）", '点検者が挙げた欠落を足す。知識の単位の一覧に節番号を書く', 'metrics/13-coverage.md'))
        if rvj.get('technique_24') is not None and rvj['technique_24'] < 20:
            fixes.append((3, f"説明技法 {rvj['technique_24']}／24", '0点・1点の項目を、techniques.md の「検査」で節ごとに当てる', 'metrics/14-technique.md'))
        if rvj.get('style_5') is not None and rvj['style_5'] < 4:
            fixes.append((3, f"書き手の判定 {rvj['style_5']}／5", '浮いていると指摘された文を、資料の同じ働きの文に倣って書き直す', 'metrics/16-style.md'))
        hs = (rvj.get('indicators') or {}).get('hard_spots')
        if hs and hs.get('listed') and hs['handled'] / hs['listed'] < 1:
            fixes.append((3, f"難所 {hs['listed']} のうち手当て済み {hs['handled']}", '手当てのない難所に、型の合う図・表・ざっくり理解を足す', 'metrics/08-hard-spots.md、algorithms/figure-type.md'))
    if not (rvj and (rvj.get('indicators') or {}).get('hard_spots')):
        fixes.append((4, '難所の一覧が点検者に渡っていない（指標⑧は未採点）', '作図の前に書き出した難所の一覧（難所／型／手当て）を点検者に渡し、listed／handled を数えてもらう', 'metrics/08-hard-spots.md'))
    if sc:
        for i in sc['indicators']:
            if i['score'] is not None and i['score'] < 7:
                fixes.append((1 if i['no'] in (1, 2, 3) else 2 if i['no'] in (4, 5) else 3, f"指標「{i['name']}」が {i['score']} 点", 'next-fix.md 2 の該当行と、指標の文書の「手順」を見る', f"metrics/{METRIC[i['no']]}.md"))
        if not sc['independent_review']:
            fixes.append((5, '独立点検が未実施', '法的正確さ・足した文の意味・書き手の判定を、本文を書いていない点検者に頼む', 'verification.md、reviewer-prompts/'))
    fixes.sort(key=lambda x: x[0])

    md = ['# 検査レポート', '', f'- ノート：{note}', f'- 本文：{body}', f"- 資料：{src or '（なし）'}", '']
    md += ['## 検査の結果', '', '| 検査 | 結果（要約） |', '|---|---|']
    for title, name, rc, o in log:
        if name == 'score.py':
            continue
        last = [l for l in o.split('\n') if l.strip()]
        summ = next((l for l in reversed(last) if not l.startswith(' ')), last[-1] if last else '')
        if name == 'match_check.py':
            summ = ' ／ '.join(l.strip() for l in last[:2])
        md.append(f"| {title}（{name}） | {summ[:160]} |")
    if sc:
        md += ['', '## 採点', '', f"総合点 **{sc['total_100']}／100**　判定：**{sc['verdict']}**" + ('' if sc['independent_review'] else '（点検者の採点なし。機械の値だけ）')]
        md += ['', '| № | 指標 | 点 | 根拠 |', '|---|---|---|---|'] + [f"| {i['no']} | {i['name']} | {i['score'] if i['score'] is not None else '未採点'} | {i['basis']} |" for i in sc['indicators']]
        if sc.get('gap_to_9_5'):
            md += ['', '### 9.5 に届く条件のうち未達（機械で分かるもの）', '', '| № | 未達の条件 | 文書 |', '|---|---|---|'] + [f"| {g['no']} | {g['unmet']} | metrics/{METRIC[g['no']]}.md |" for g in sc['gap_to_9_5']]
        else:
            md += ['', '機械で分かる範囲では、9.5 に届く条件の未達は無い（点検者が付ける指標は、点検を受けるまで未採点）。']
    md += ['', '## 次に直す点（優先度の高い順）', '']
    if fixes:
        md += ['| 優先 | 何が | どう直す | 参照 |', '|---|---|---|---|'] + [f'| {p} | {w} | {h} | {r} |' for p, w, h, r in fixes]
    else:
        md.append('機械の検査では、直す点は見つからなかった。')
    md += ['', '優先度：1＝誤りにつながる　2＝確かめる必要がある　3＝質を上げる　4＝足すとよい　5＝手続（点検）', '',
           '## 各検査の出力', '']
    for title, name, rc, o in log:
        md += [f'### {title}（{name}）', '```', o[:1800], '```', '']
    open(J('report.md'), 'w', encoding='utf-8').write('\n'.join(md))
    print(f"検査 {len(log)} 本／次に直す点 {len(fixes)} 件 -> {J('report.md')}")
    for p, w, h, r in fixes[:12]:
        print(f'  [{p}] {w} → {h}')

if __name__ == '__main__':
    main()
