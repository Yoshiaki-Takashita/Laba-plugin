#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""法律語の辞書（lib/legal-words.json）を作る。折り返しで「語の途中で折れた」と判定するのに使う（core.js の wrap、fig_lint.py の W13）。

  python3 -B scripts/figgen/tools/build_words.py            # 作り直す（references/fields/*.md と下の手書きの語から）
  python3 -B scripts/figgen/tools/build_words.py --check    # 今の辞書と食い違えば終了コード 1

辞書の中身：
  terms   一つの術語（漢字 3〜8 字）。語の中の切れ目は、両側がそれぞれ術語か「二字＋接尾」（債権者・代位権）のときだけ安全。
          「共同｜正犯」「株主｜総会」「代表｜取締役」のような二字ずつの切れ目は、語の途中として warn にする。
          手書きの語（分野別）と、references/fields/*.md から機械的に集めた語（漢字 4〜6 字の連なりで 2 回以上出るもの）。
  known2  単独で語になる二字の語（「移転」「登記」）。術語に入っていない漢字の連なり（「所有権移転登記」）は、両側が known2・術語・二字＋接尾なら安全。
          references/fields/*.md で、前後が漢字でない二字の連なりとして 3 回以上出るもの。
術語に入っていない漢字 3 字以上の連なりで、両側が分からない切れ目は、語の途中として warn にする（辞書にない語の一般則）。
"""
import re, glob, json, os, sys, collections
HERE = os.path.dirname(os.path.abspath(__file__)); FIGGEN = os.path.dirname(HERE); ROOT = os.path.dirname(os.path.dirname(FIGGEN))
OUT = os.path.join(FIGGEN, 'lib', 'legal-words.json')
FIELDS = {
    '共通': '最高裁判所 大法廷判決 小法廷判決 原判決 差戻し 立法趣旨 反対解釈 類推適用 拡張解釈 縮小解釈 判例変更 学説対立 要件事実 法律効果 法律要件 権利濫用 信義則違反 公序良俗',
    '憲法': '違憲審査 違憲審査基準 法令違憲 適用違憲 合憲限定解釈 表現の自由 二重の基準 比例原則 立法裁量 立法不作為 投票価値 議員定数 国家賠償 公権力の行使 私人間効力 政教分離 目的効果基準 司法審査 統治行為 部分社会',
    '民法': '意思表示 心裡留保 虚偽表示 錯誤取消 詐欺取消 表見代理 無権代理 無権代理人 代理権授与 消滅時効 取得時効 完成猶予 時効更新 即時取得 物権変動 対抗要件 背信的悪意者 抵当権設定 抵当権設定登記 抵当権者 物上代位 法定地上権 共同抵当 譲渡担保 所有権留保 留置権 先取特権 質権 債権者代位 債権者代位権 被代位権利 詐害行為 詐害行為取消 詐害行為取消権 債務不履行 履行遅滞 履行不能 損害賠償 損害賠償請求 契約解除 危険負担 契約不適合 債権譲渡 債務引受 連帯債務 連帯保証 保証債務 主たる債務 相殺適状 弁済供託 第三者弁済 消費貸借 使用貸借 賃貸借契約 敷金返還 不法行為 共同不法行為 使用者責任 工作物責任 過失相殺 不当利得 事務管理 相続放棄 遺産分割 遺留分 遺留分侵害額 特別受益 寄与分 財産分与 嫡出推定 養子縁組',
    '商法・会社法': '株式会社 持分会社 公開会社 非公開会社 大会社 株主総会 株主総会決議 取締役 取締役会 代表取締役 業務執行取締役 非業務執行取締役 社外取締役 監査役 監査役会 監査役設置会社 会計参与 会計監査人 執行役 指名委員会 監査等委員会 役員等 善管注意義務 忠実義務 競業取引 利益相反取引 経営判断原則 任務懈怠 任務懈怠責任 最低責任限度額 責任限定契約 株主代表訴訟 代表訴訟 決議取消 決議取消しの訴え 自己株式 新株発行 新株予約権 募集株式 分配可能額 組織再編 合併 会社分割 株式交換 株式移転 事業譲渡 少数株主',
    '民事訴訟法': '訴訟物 処分権主義 弁論主義 職権探知主義 自由心証主義 証明責任 主張責任 主要事実 間接事実 補助事実 権利自白 裁判上の自白 既判力 既判力の時的限界 客観的範囲 主観的範囲 訴えの利益 確認の利益 当事者能力 当事者適格 訴訟能力 共同訴訟 通常共同訴訟 必要的共同訴訟 固有必要的共同訴訟 類似必要的共同訴訟 同時審判申出 補助参加 独立当事者参加 訴訟告知 参加的効力 訴えの変更 反訴 重複起訴 一部請求 口頭弁論 準備書面 争点整理 訴訟上の和解 請求の放棄 請求の認諾 訴えの取下げ 控訴 上告 再審 民事執行 民事保全 債務名義 強制執行 差押命令 転付命令 担保不動産競売 請求異議 第三者異議',
    '刑法': '構成要件 構成要件該当性 違法性 違法性阻却 責任能力 期待可能性 故意 過失 因果関係 相当因果関係 正当防衛 過剰防衛 誤想防衛 誤想過剰防衛 緊急避難 未遂犯 中止犯 不能犯 共同正犯 共謀共同正犯 間接正犯 教唆犯 幇助犯 共犯関係 承継的共同正犯 身分犯 真正身分犯 不真正身分犯 業務上横領 単純横領 収賄罪 常習賭博 観念的競合 併合罪 保護法益 窃盗罪 強盗罪 詐欺罪 横領罪 背任罪 放火罪 偽造罪',
    '刑事訴訟法': '任意捜査 強制捜査 強制処分 任意処分 令状主義 現行犯逮捕 緊急逮捕 別件逮捕 職務質問 所持品検査 任意同行 接見交通権 接見指定 公訴事実 訴因変更 公訴事実の同一性 起訴状一本主義 公判前整理手続 伝聞法則 伝聞証拠 伝聞例外 要証事実 証拠能力 証明力 自白法則 補強法則 違法収集証拠 違法収集証拠排除法則 一事不再理 検察官面前調書 被告人 被疑者 弁護人 検察官 供述録取書',
    '行政法': '行政行為 行政処分 処分性 原告適格 狭義の訴えの利益 取消訴訟 無効確認訴訟 義務付け訴訟 差止訴訟 当事者訴訟 執行停止 事情判決 行政指導 行政契約 行政立法 行政規則 法規命令 委任命令 執行命令 行政強制 代執行 直接強制 即時強制 行政刑罰 行政調査 不利益処分 申請に対する処分 審査基準 処分基準 理由の提示 聴聞 弁明の機会 意見公募手続 行政手続法 行政事件訴訟法 行政不服審査法 国家賠償法 損失補償 公権力 公務員 裁量権 裁量権の逸脱 裁量権の濫用',
    '労働・知財・倒産': '労働契約 労働協約 就業規則 解雇権濫用 不当労働行為 労働組合 団体交渉 時間外労働 職務発明 特許権 著作権 著作物 商標権 不正競争 破産手続 破産管財人 破産財団 財団債権 共益債権 支払不能 支払停止 否認権 民事再生 会社更生 別除権 相殺禁止',
}
EXTRA_KNOWN2 = '移転 登記 請求 訴訟 債権 債務 契約 譲渡 代理 取消 解除 弁済 相殺 保証 担保 判決 執行 責任 賠償 損害 効力 要件 効果 処分 命令 手続 申立 審理 審査 違法 適法 有効 無効 成立 不成立 存在 認定 判断 理由 結論 事実 証拠 供述 証人 当事者 原告 被告 裁判 法令 規則 条例 職務 権限 行使 範囲 期間 期限 時効 占有 所有 抵当 賃料 賃借 賃貸 売買 贈与 相続 遺言 婚姻 離婚 親権 扶養 監督 決議 株主 会社 役員 業務 財産 利益 費用 金銭 支払 返還 引渡 送達 差押 取立 発令 公示 通知 承諾 同意 免除 限定 加重 減軽 科刑'.split()


def harvest():
    c4 = collections.Counter(); c2 = collections.Counter()
    for f in glob.glob(os.path.join(ROOT, 'references', 'fields', '*.md')):
        if f.endswith('README.md'): continue
        t = open(f, encoding='utf-8').read()
        for m in re.findall(r'[一-龥々]+', t):
            if 4 <= len(m) <= 6: c4[m] += 1
            if len(m) == 2: c2[m] += 1
    noise = re.compile(r'(年法律第|当時|^判決|判決$|確認済|参照|整理軸|条文番号|一覧|手順)')
    terms = sorted(w for w, n in c4.items() if n >= 2 and not noise.search(w))
    known2 = sorted(w for w, n in c2.items() if n >= 3)
    return terms, known2


def build():
    h_terms, h_known2 = harvest()
    fields = {k: sorted(set(r for w in v.split() for r in re.findall(r'[一-龥々]{3,}', w))) for k, v in FIELDS.items()}      # 仮名を含む語（公権力の行使）は、漢字 3 字以上の連なりごとに入れる
    hand = set(w for v in fields.values() for w in v)
    d = {'about': 'figgen の折り返しの辞書。tools/build_words.py が作る（手で書き換えない）。terms＝一つの術語、known2＝単独で語になる二字の語',
         'fields': fields, 'harvested': [w for w in h_terms if w not in hand],
         'known2': sorted(set(h_known2) | set(EXTRA_KNOWN2))}
    d['count'] = {'terms': len(hand | set(d['harvested'])), 'hand': len(hand), 'harvested': len(d['harvested']), 'known2': len(d['known2'])}
    return d


if __name__ == '__main__':
    d = build(); s = json.dumps(d, ensure_ascii=False, indent=1)
    if '--check' in sys.argv:
        cur = open(OUT, encoding='utf-8').read() if os.path.exists(OUT) else ''
        print('辞書は最新' if cur == s else '辞書が古い：tools/build_words.py で作り直す'); sys.exit(0 if cur == s else 1)
    open(OUT, 'w', encoding='utf-8').write(s); print(f"lib/legal-words.json：術語 {d['count']['terms']}（手書き {d['count']['hand']}・集めた語 {d['count']['harvested']}）・二字の語 {d['count']['known2']}")
