#!/usr/bin/env python3
"""機械検査の結果（json）と点検者の採点（json）から、総合点と判定を出す（算式は references/scoring.md）。
usage: score.py --dir CHECKS_DIR [--reviewer reviewer.json] [--out score.json] [--md score.md]
CHECKS_DIR には run_checks.sh が出す style.json / match.json / coverage.json / cite.json / certainty.json / density.json を置く。
reviewer.json（点検者が書く。無い項目は「未採点」として総合点から外し、満点を按分する）:
{"coverage_pct": 99.7, "technique_24": 23, "errors": {"major": 0, "mid": 1, "minor": 2}, "style_5": 4.5,
 "indicators": {"statute": 9, "case_cite": 10, "reason_fidelity": 8, "definition": 9, "exam_use": 8,
                "hard_spots": {"listed": 6, "handled": 6}}}"""
import sys, os, json

def clamp(x, lo=0.0, hi=10.0):
    return round(max(lo, min(hi, x)), 1)

def load(d, name):
    p = os.path.join(d, name)
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else None

def arg(flag, default=None):
    return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv else default

def main():
    d = arg('--dir')
    if not d:
        print(__doc__); sys.exit(1)
    rv = json.load(open(arg('--reviewer'), encoding='utf-8')) if arg('--reviewer') else {}
    ri = rv.get('indicators', {})
    style, match, cov, cite, cert, dens = (load(d, n) for n in ('style.json', 'match.json', 'coverage.json', 'cite.json', 'certainty.json', 'density.json'))
    ind = []  # (番号, 名前, 点, 測り方, 根拠)
    def add(no, name, score, how, basis):
        ind.append({'no': no, 'name': name, 'score': score, 'how': how, 'basis': basis})
    # ① 条文の正確さ
    add(1, '条文の正確さ', ri.get('statute'), '点検者', '条番号・項号・ただし書の誤りの件数')
    # ② 判例書誌の正確さ
    s2 = None
    if cite is not None:
        s2 = 10 - 2 * cite['issue_count'] - (3 * len(cov['missing']['case_cites']) if cov else 0)
        s2 = clamp(s2)
    add(2, '判例書誌の正確さ', ri.get('case_cite', s2), '機械＋点検者', f"形式の所見 {cite['issue_count'] if cite else '-'} 件／資料との食い違い {len(cov['missing']['case_cites']) if cov else '-'} 件")
    # ③ 判例理由の忠実度
    rt0 = load(d, 'reason_table.json')
    add(3, '判例理由の忠実度', ri.get('reason_fidelity'), '点検者（出所表が補助）', '判例が挙げた理由と、ノートの理由欄の一致' +
        (f"（出所表：判例 {rt0['n_cases']}・出所が確定 {rt0['settled_pct']}%・抜き書きの実在 {rt0['excerpt_found']}・所見 {rt0['issue_count']}）" if rt0 else '（出所表なし）'))
    # ④ 確度の保存率
    s4 = clamp((cert['preservation_pct'] - 50) / 5) if cert and cert['matched'] else None
    drv = load(d, 'derived.json')
    drv_lost = sum(v for k, v in (drv.get('by_kind') or {}).items() if k in ('留保の脱落', '断定になっている')) if drv else 0
    if s4 is not None and drv:
        s4 = clamp(s4 - 1.0 * drv_lost)     # 派生物（カード・短答・まとめ）で留保が落ちた行は、1行につき1点
    add(4, '確度の保存率', ri.get('certainty', s4), '機械（点検者が補正）', (f"保存率 {cert['preservation_pct']}%（{cert['kept']}/{cert['matched']}）" if cert else '-') +
        (f"／派生物の保存率 {drv['hedge_preservation_pct']}%（{drv['hedge_kept']}/{drv['hedged_rows']}。留保の脱落・断定 {drv_lost}）" if drv else '／派生物の照合なし'))
    # ⑤ 定義の精度
    add(5, '定義の精度', ri.get('definition'), '点検者', '定義文の過不足・限定語')
    # ⑥⑦⑨ 密度と連関（資料比）
    def ratio(key):
        if dens and 'source' in dens and dens['source'][key]:
            return dens['note'][key] / dens['source'][key]
        return None
    r6, r7, r9 = ratio('reasoning_density_pct'), ratio('example_density_pct'), ratio('links_per_10k_chars')
    argu, eff, xref, swap, rtab, tfj = (load(d, n) for n in ('argument.json', 'efficiency.json', 'xref.json', 'swap.json', 'reason_table.json', 'tf.json'))
    s6 = clamp(10 * (r6 - 0.5) / 0.5) if r6 is not None else (clamp(dens['note']['reasoning_density_pct'] / 2.5) if dens else None)
    b6 = (f"ノート {dens['note']['reasoning_density_pct']}%" + (f"／資料比 {r6:.2f}" if r6 is not None else '')) if dens else '-'
    if argu:
        # 層つきの値：地の文の全体（本文＋足した層）を資料と比べ、足した層に理由がない塊を減点する
        if 'source' in argu and argu['source']['reasoning_density_pct']:
            ra = argu['prose_all']['reasoning_density_pct'] / argu['source']['reasoning_density_pct']
            s6 = clamp(10 * (ra - 0.5) / 0.5 - 0.5 * len(argu['added_blocks_without_reason']) - 0.25 * len(argu['hosoku_without_reason']))
            b6 = f"地の文全体 {argu['prose_all']['reasoning_density_pct']}%／資料 {argu['source']['reasoning_density_pct']}%（比 {ra:.2f}）／本文 {argu['layers']['body']['reasoning_density_pct']}%／足した層で理由のない塊 {len(argu['added_blocks_without_reason'])}"
        else:
            s6 = clamp(argu['prose_all']['reasoning_density_pct'] / 2.5 - 0.5 * len(argu['added_blocks_without_reason']))
            b6 = f"地の文全体 {argu['prose_all']['reasoning_density_pct']}%／足した層で理由のない塊 {len(argu['added_blocks_without_reason'])}"
    add(6, '論証密度', s6, '機械', b6)
    add(7, '具体例密度', clamp(10 * (r7 - 0.5) / 0.6) if r7 is not None else (clamp(dens['note']['example_density_pct'] / 2.0) if dens else None), '機械',
        f"ノート {dens['note']['example_density_pct']}%" + (f"／資料比 {r7:.2f}" if r7 is not None else '') if dens else '-')
    # ⑧ 難所の可視化率
    hs = ri.get('hard_spots')
    add(8, '難所の可視化率', clamp(10.0 * hs['handled'] / hs['listed']) if hs and hs.get('listed') else None, '作成者の一覧＋点検者', f"{hs['handled']}/{hs['listed']}" if hs else '難所の一覧が未提出')
    s9 = clamp(10 * (r9 - 0.4) / 0.8) if r9 is not None else (clamp(dens['note']['links_per_10k_chars'] / 1.5) if dens else None)
    b9 = (f"1万字あたり {dens['note']['links_per_10k_chars']}" + (f"／資料比 {r9:.2f}" if r9 is not None else '')) if dens else '-'
    if xref and s9 is not None:
        miss = len(xref.get('source_arrows', {}).get('missing', []))
        s9 = clamp(s9 - 1.5 * miss - 0.3 * len(xref['link_candidates']))
        b9 += f"／資料の⇨の欠落 {miss}／参照のない語 {len(xref['link_candidates'])}／対比 {xref['n_contrasts']}／索引の語 {xref['n_terms']}"
    add(9, '体系連関', s9, '機械', b9)
    # ⑩ 独自性
    s10 = None
    if match:
        f = match['filtered']; per10k = 10000.0 * f['count'] / max(1, match['note_chars'])
        s10 = 10 - max(0, (per10k - 5) / 5) - (5 if f["longest"] > 50 else 2 if f['longest'] > 30 else 0) - max(0, (f['gram12_rate_pct'] - 10) / 2)
        s10 = clamp(s10)
    add(10, '独自性（非転写）', s10, '機械', f"地の文の20字一致 {match['filtered']['count']} か所・最長 {match['filtered']['longest']} 字・12字一致率 {match['filtered']['gram12_rate_pct']}%（生の値 {match['raw']['count']} か所・{match['raw']['gram12_rate_pct']}%）" if match else '資料なし')
    # ⑪ 情報効率
    s11 = None
    if dens:
        s11 = 10 - max(0, dens['note']['duplication_pct'] - 3)
        if match:
            lr = match['length_ratio']
            s11 -= (max(0, (lr - 1.3) / 0.1) * 2 + max(0, (min(lr, 1.3) - 1.15) / 0.15) * 1 + max(0, (0.7 - lr) / 0.1))
        summ = load(d, 'summary.json')
        b11 = f"重複率 {dens['note']['duplication_pct']}%" + (f"／分量は資料の {match['length_ratio']} 倍" if match else '')
        if eff:
            # 層つきの値：分量は巻末の表（論点カード・短答）を除いて数える。言い直しの層と、層の間の二重記載を減点する
            s11 = 10 - max(0, dens['note']['duplication_pct'] - 3)
            lr = eff.get('length_ratio_main')
            if lr is not None:
                s11 -= (max(0, (lr - 1.3) / 0.1) * 2 + max(0, (min(lr, 1.3) - 1.15) / 0.15) * 1 + max(0, (0.7 - lr) / 0.1))
            rs = eff['restatement']
            s11 -= max(0, rs['restatement_pct'] - 4) + (1 if rs['summary_blocks'] > 1 else 0)
            tb = eff['cross_layer'].get('table', {}).get('restated', 0)
            s11 -= 0.3 * max(0, tb - 2) + 0.2 * max(0, len(eff['low_new_info_sentences']) - 2)
            b11 = f"重複率 {dens['note']['duplication_pct']}%／分量 {lr if lr is not None else '-'} 倍（巻末の表を除く）／まとめ {rs['summary_blocks']} か所・言い直しの層 {rs['restatement_pct']}%／表と本文の二重 {tb}／新情報の少ない文 {len(eff['low_new_info_sentences'])}"
            bk = eff.get('back')
            if bk:   # 巻末：分量比は巻末を除いて数えるので、巻末の無駄は別に減点する
                s11 -= 0.5 * len(bk['filler_columns']) + 0.2 * len(bk['dup_cells']) + max(0, (bk['back_to_main'] - 0.5) / 0.1)
                b11 += f"／巻末は本編の {bk['back_to_main']} 倍・中身のない列 {len(bk['filler_columns'])}・巻末どうしの重複 {len(bk['dup_cells'])}"
            pg = load(d, 'pages.json')
            if pg:   # 頁の使い方：下が4割を超えて空く頁（最後の頁を除く）
                s11 -= 0.3 * len(pg['blank_pages'])
                b11 += f"／{pg['n_pages']}頁・下が4割超空く頁 {len(pg['blank_pages'])}"
        elif summ:
            s11 -= max(0, summ['restatement_share_pct'] - 4) + (1 if summ['n_summaries'] > 2 else 0)
        s11 = clamp(s11)
    add(11, '情報効率', s11, '機械', b11 if dens else '-')
    card = load(d, 'card.json'); tf0 = load(d, 'tf.json')
    add(12, '答案転用性', ri.get('exam_use'), '点検者', '要件・効果・結論が答案にそのまま使える形か' + (f"（論点カード {card['n_cards']} 枚・所見 {card['issue_count']}）" if card else '（論点カードの検査なし）'))
    # 基本4指標
    cov_pct = rv.get('coverage_pct', cov['coverage_pct'] if cov else None)
    tech = rv.get('technique_24'); er = rv.get('errors'); st5 = rv.get('style_5')
    parts = []  # (名前, 得点, 満点)
    if cov_pct is not None:
        parts.append(('網羅率', round(20 * max(0, (cov_pct - 50) / 50), 1), 20))
    if tech is not None:
        parts.append(('説明技法', round(15 * tech / 24, 1), 15))
    if er is not None:
        parts.append(('誤り', max(0, 15 - 6 * er.get('major', 0) - 3 * er.get('mid', 0) - 1 * er.get('minor', 0)), 15))
    if st5 is not None:
        parts.append(('文体', round(10 * st5 / 5, 1), 10))
    elif style is not None:
        parts.append(('文体（機械のみ）', max(0, 10 - 1.5 * style['warn_count']) * 0.8, 10))
    scored = [i for i in ind if i['score'] is not None]
    if scored:
        parts.append(('独自12指標', round(40 * sum(i['score'] for i in scored) / (10 * len(scored)), 1), 40))
    got = sum(p[1] for p in parts); full = sum(p[2] for p in parts)
    total = round(100 * got / full, 1) if full else None
    unscored = [i['name'] for i in ind if i['score'] is None] + [n for n, v in (('網羅率', cov_pct), ('説明技法', tech), ('誤り', er)) if v is None]
    # 判定
    verdict, why = '判定不能（点検者の採点が必要）', []
    if er is not None and cov_pct is not None and total is not None:
        hs_ok = (hs is None) or (hs.get('listed') and hs['handled'] / hs['listed'] >= 0.7)
        low = [i['name'] for i in scored if i['score'] < 5]
        if er.get('major', 0) == 0 and er.get('mid', 0) <= 1 and cov_pct >= 95 and total >= 85 and hs_ok and not low:
            verdict = '資料を上回る'
        elif er.get('major', 0) == 0 and cov_pct >= 85 and total >= 70:
            verdict = '資料と同等'
        else:
            verdict = '資料を下回る'
        if er.get('major', 0): why.append(f"重大な誤り {er['major']} 件")
        if er.get('mid', 0) > 1: why.append(f"中程度の誤り {er['mid']} 件")
        if cov_pct < 95: why.append(f'網羅率 {cov_pct}%')
        if low: why.append('5点未満の指標：' + '・'.join(low))
        if not hs_ok: why.append('難所の手当てが7割未満')
    # 9.5 に届く条件のうち、機械で分かる未達（references/metrics/ の各ファイルの「9.5 に届く条件」）
    gap = []
    def need(no, cond, ok):
        if not ok:
            gap.append({'no': no, 'unmet': cond})
    if cite is not None:
        need(2, '書誌の形式の所見0・資料との食い違い0', cite['issue_count'] == 0 and not (cov and cov['missing']['case_cites']))
    need(3, '理由の出所表があり、全判例の出所が確定（未確認0）・各点に判決全文の該当箇所の控え・欄の文が判決文の語・所見0', bool(rt0) and rt0['by_status'].get('判決文未確認', 1) == 0 and rt0['issue_count'] == 0)
    if cert:
        need(4, '確度の保存率95%以上・足した層の候補0・派生物（カード・短答・まとめ）の照合で留保の脱落0', cert['preservation_pct'] >= 95 and not cert.get('layer_candidates') and bool(drv) and drv_lost == 0)
    if argu:
        need(6, '地の文全体の論証密度が資料の−1ポイント以内・足した層で理由のない塊0・補足に根拠', argu.get('prose_gap_pt', 0) >= -1 and not argu['added_blocks_without_reason'] and not argu['hosoku_without_reason'])
    if r7 is not None:
        need(7, '具体例密度が資料比1.1以上', r7 >= 1.1)
    if xref:
        need(9, '資料の⇨の欠落0・参照のない語0・巻末に概念の索引（語が本文の節に実在。derived_check --index）',
             not xref.get('source_arrows', {}).get('missing') and not xref['link_candidates'] and bool(drv) and drv.get('n_index_terms', 0) > 0
             and not any(k.startswith('索引') for k in (drv.get('by_kind') or {})))
    if match:
        f = match['filtered']
        need(10, '地の文の20字一致が1万字あたり5か所以下・最長30字以下・12字一致率10%以下・置き換えの型0', 10000.0 * f['count'] / max(1, match['note_chars']) <= 5 and f['longest'] <= 30 and f['gram12_rate_pct'] <= 10 and not (swap and swap['swap_hits']))
    if eff:
        bk = eff.get('back') or {'filler_columns': [], 'dup_cells': [], 'back_to_main': 0}
        need(11, '分量1.15倍以内（巻末の表を除く）・まとめ1か所・言い直しの層4%以下・表と本文の二重2以下・巻末（中身のない列0・巻末どうしの重複0・本編の0.5倍以内）',
             (eff.get('length_ratio_main') or 0) <= 1.15 and eff['restatement']['summary_blocks'] <= 1 and eff['restatement']['restatement_pct'] <= 4 and eff['cross_layer'].get('table', {}).get('restated', 0) <= 2
             and not bk['filler_columns'] and not bk['dup_cells'] and bk['back_to_main'] <= 0.5)
    need(12, '論点カード（1論点1か所・短答と書き出しつき・所見0）と短答式の命題20〜30問（所見0）、派生物の照合（条文・留保・根拠の節）の所見0',
         bool(card) and card.get('extended') and card['issue_count'] == 0 and bool(tf0) and tf0['issue_count'] == 0 and bool(drv) and drv['issue_count'] == 0)
    if style is not None:
        need(16, '文体の WARN 0・置き換えの型0・資料に出ない語0', style['warn_count'] == 0 and not (swap and (swap['swap_hits'] or swap['foreign_words'])))
    res = {'total_100': total, 'verdict': verdict, 'verdict_notes': why, 'gap_to_9_5': gap, 'parts': [{'name': n, 'got': g, 'full': f} for n, g, f in parts],
           'indicators': ind, 'unscored': unscored, 'independent_review': bool(rv)}
    if arg('--out'):
        json.dump(res, open(arg('--out'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    md = [f"# 採点結果\n\n総合点 **{total}／100**　判定：**{verdict}**" + (f"（{'／'.join(why)}）" if why else ''), '',
          '| 区分 | 得点 | 満点 |', '|---|---|---|'] + [f'| {n} | {g} | {f} |' for n, g, f in parts] + ['',
          '| № | 独自指標 | 点（10点満点） | 測り方 | 根拠 |', '|---|---|---|---|---|'] + \
         [f"| {i['no']} | {i['name']} | {i['score'] if i['score'] is not None else '未採点'} | {i['how']} | {i['basis']} |" for i in ind]
    if gap:
        md += ['', '### 9.5 に届く条件のうち未達（機械で分かるもの）', ''] + [f"- 指標{g['no']}：{g['unmet']}" for g in gap]
    if unscored:
        md += ['', '未採点：' + '、'.join(unscored) + '（総合点は採点済みの項目だけで按分）']
    if not rv:
        md += ['', '※点検者の採点なし。機械で測れる項目だけの値であり、成果として報告しない。']
    md = '\n'.join(md)
    if arg('--md'):
        open(arg('--md'), 'w', encoding='utf-8').write(md)
    print(md)

if __name__ == '__main__':
    main()
