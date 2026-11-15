#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""trace.py — 図と本文を突き合わせ、点検役が読むべき「所見」を出す補助（図の追跡可能性）。

【位置づけ】trace は所見を出す補助であって、図と本文の一致を保証する検査ではない。
  ・「所見なし」は「機械で見られる範囲で、所見が出なかった」という意味でしかない。誤りがないことの根拠にしない。
    独立の採点では、新しい種類の誤りの約半分が所見なしで通り、木の兄弟の入替えのように誤りでも所見が出ない場合があった。
  ・照合できなかった要素は、毎回かならず一覧にして出す。その一覧と、機械で見ない種類（下の「機械で見ない種類」）は、
    点検役が reviewer-prompts/figure-check.md の読み上げの表で、一つずつ本文と読み比べる。読み上げは省略できない。
  ・所見を消すために、本文や図の語（要件・限定語・条文番号）を削ってはならない。所見が誤り（偽陽性）だと読んだときは、
    図を変えずに --dismiss の表に「どの所見を・なぜ退けるか」を書く。退けた所見は理由とともに出力に残る。

図に書いた語は、本文のどこかで説明されていなければならない。図にしかない語・数字・条文番号は、
読み手が確かめようがなく、誤りの温床になる（過去の失敗：限定語の脱落、勝敗の記載が本文と逆）。

使い方:
  python3 trace.py spec.json --body note.md            # 仕様（JSON）のラベルを本文と照合
  python3 trace.py fig.svg   --body note.md            # SVG の文字を本文と照合
  python3 trace.py spec.json --body note.md --fig 3    # 図3 として、本文での参照と位置も調べる
  python3 trace.py specs/*.json --body note.md --out trace.json --strict
  python3 trace.py spec.json --body note.md --relations relations.md   # 関係の表とも突き合わせる

  python3 trace.py spec.json --body note.md --dismiss dismiss.md   # 点検役が偽陽性と読んだ所見を、理由つきで退ける

出力（ラベルごと。語が本文に出てくるかだけで、意味が合うかは見ない）:
  語あり            ラベル全体が本文に出てくる
  語あり（語ごと）  ラベルを語に分けると全部が本文に出てくる（言い回しだけが違う）
  一部の語          ラベルを語に分けると 6 割以上が本文に出てくる（足りない語を並べる）
  なし              本文に語が見つからない → 本文に説明を書き足す（図の語を消すのは、その語が誤りだと読んだときだけ）
  問いへの答えの語（流れ図の通過の語「でない」「した」、木の枝の「ある」「ない」など、仮名と問いの語だけの語）は、問いの側で照合する
出力（図ごとのまとめ）:
  所見なし（機械で見られる範囲で）  ／  要確認（所見 n 件）
  照合できなかった要素：機械が決めなかった関係（要読み比べ・照合できず）の一覧。0 件でも見出しを出す
  機械で見ない種類：要件と効果の取り違え、範囲の枠の余分な要素、小枝の帰属、時間軸の帯の語、止め線、本文にある別の条文、包含図のすり替え など
関係ごとの状態: 所見なし／逆の疑い（T06）／組合せなし（T07）／要読み比べ（T08）／照合できず
ほかに:
  T01 数字・条文番号が本文にない（「388条」「3か月」など。最優先で直す）
  T02 本文に「図N」への参照がない／図題より後ろにしか出てこない
  T03 図の番号が本文で昇順に出てこない
  T04 図の言い切り（勝つ・負ける・成立する・できない 等）が本文では逆の形でしか出てこない（候補）
  T05 本文で対になっている限定語（「数人による」「善意の」等）が図のラベルで落ちている（候補）
  T06 関係の組合せが本文と逆・取り違え（error）：矢印の向きが本文と逆、勝敗・成否の語が別の当事者・別の類型について書かれている、
      効果の語（「減軽する」など）が本文では別の類型のもの
  T07 関係の組合せが本文にない（error）：矢印の両端と述語、または「誰について」と「どうなる」を合わせて述べる段落がない
  T08 機械で決められない関係（一覧。点検者が、矢印を一本ずつ声に出して本文と読み比べる。reviewer-prompts/figure-check.md）
関係は仕様（JSON）から、全部の型について取り出す（references/figures/06-traceability.md の表）：矢印と箱の二行目、範囲の枠の構成員、
比較図の列×段（例外の行と段の帰属を含む）、流れ図・木の「問い＋枝の語→行き先」、座標図の「軸の値の組→セル」、スイムレーンの帯と段の順、
時間軸・数直線の帯と区間の両端、包含図の内外、すべての要素の「条文番号→その要素の述語が同じ文にあるか」。SVG からは取り出せない。
矢印の語が端点の名前に含まれていても外さない（外すのは名前と同じ語だけ）。語が残らない関係は T08 に回す。
--relations 関係の表：本文を読んで先に作った「主語｜相手｜述語｜根拠」の表を、本文と同じ重みで照合に使う（書式は references/figures/06-traceability.md）。
--strict を付けると、退けていない「なし」・T01・T06・T07 が一つでもあれば終了コード 1（要確認）。終了コード 0 は「所見なし（機械で見られる範囲で）」であって、
納品してよいという意味ではない。機械が見るのは、同じ文と隣の文の中の助詞と語の位置だけ。
--dismiss 退ける所見の表（Markdown の表「記号｜場所（の一部）｜理由」か JSON の [{code, where, reason}]）。理由が空の行は退けない。
"""
import sys, re, json, argparse, unicodedata
import xml.etree.ElementTree as ET

SKIP_KEYS = {'type', 'message', 'caption', 'id', 'from', 'to', 'a', 'b', 'pos', 'kind', 'direction', 'scale',
             'side', 'head', 'port', 'exitStyle', 'lane', 'via', 'date_iso'}
TEXT_KEYS = {'label', 'sub', 'text', 'title', 'name', 'lines', 'cells', 'items', 'effect', 'against', 'why', 'court',
             'date', 'result', 'reason', 'mark', 'holder', 'values', 'split', 'corner', 'cols', 'lanes', 'pass', 'band'}
NOTE_KEYS = {'notes'}
STOP = set('こと もの とき ため よう 場合 関係 これ それ ほか など 以上 以下 一方 双方 当たる 当たらない 満たす'.split())
ASSERT_PAIRS = [('勝つ', '負ける'), ('成立する', '成立しない'), ('できる', 'できない'), ('及ぶ', '及ばない'), ('ある', 'ない'),
                ('認容', '棄却'), ('有効', '無効'), ('対抗できる', '対抗できない'), ('負う', '負わない')]
QUALIFIERS = ['数人による', '数人の', '善意の', '悪意の', '善意無過失の', '第三者の', '一部の', '全員の', '確定した', '明示の', '黙示の',
              '設定時の', '設定時に', '実行時の', '口頭弁論終結時の', '当初の', '法律上', '事実上']


def norm(s):
    s = unicodedata.normalize('NFKC', s)
    s = re.sub(r'[\s　|｜]+', '', s)
    return s.replace('（', '(').replace('）', ')')


def labels_from_spec(d):
    out = []

    def walk(v, key=None, note=False):
        if isinstance(v, str):
            if key in SKIP_KEYS:
                return
            whole = norm(v)                                  # 「|」は手で入れた改行。行ごとに照合するが、ラベル全体が本文にあれば、行の切れ目に左右されず語ありとする
            for part in re.split(r'[\n|]', v):
                part = part.strip()
                if part:
                    out.append((part, note, whole))
        elif isinstance(v, list):
            for x in v:
                walk(x, key, note)
        elif isinstance(v, dict):
            for k, x in v.items():
                if k in SKIP_KEYS and not isinstance(x, (dict, list)):
                    continue
                if isinstance(x, (bool, int, float)) or x is None:
                    continue
                walk(x, k, note or k in NOTE_KEYS)
    walk(d)
    seen, res = set(), []
    for t, n, w in out:
        if t not in seen:
            seen.add(t); res.append((t, n, w))
    return res


def labels_from_svg(path):
    root = ET.parse(path).getroot(); out = []
    for el in root.iter():
        if el.tag.split('}')[-1] != 'text':
            continue
        t = ''.join(el.itertext()).strip()
        if t:
            out.append((t, False, norm(t)))
    return out


def words(label):
    """ラベルを照合用の語に分ける：漢字の連なり、カタカナの連なり、数字＋単位、英字。ひらがなだけの部分は捨てる。"""
    s = unicodedata.normalize('NFKC', label)
    ws = re.findall(r'\d+(?:\.\d+)?(?:条の\d+|条|項|号|か月|箇月|年|日|週間|分の\d+|円|万円|%|人|回)?|[一-龥々]{2,}(?:(?![がはをにのもとでへや])[ぁ-ん])?(?=[一-龥々]|$|[^ぁ-ん])|[一-龥々]{2,}|[ァ-ヶー]{2,}|[A-Za-z]{2,}', s)
    ws = [w for w in ws if w and w not in STOP]
    nl = re.sub(r'[()「」]', '', norm(label))                   # 括弧だけ違う（「（ただし書）」）は括弧を外して探す
    return ws or ([nl] if len(nl) >= 2 else [])


def nums(label):
    s = unicodedata.normalize('NFKC', label)
    return re.findall(r'\d+(?:条の\d+|条|項|号|か月|箇月|年|日|週間|分の\d+|万円|円|%)', s)


ANSWER_END = r'(ない|なし|ある|あり|する|しない|した|しなかった|できる|できない|でない|である|いる|いない|る|た|はい|いいえ)'


def is_answer(nl):
    """問いへの答えの語か：仮名だけ、または漢字一〜二字＋仮名で、肯定・否定の言い切りで終わる短い語（「でない」「した」「用いない」「当たる」）"""
    return len(nl) <= 6 and bool(re.fullmatch(r'[ぁ-ん]+', nl) or re.fullmatch(r'[一-龥々]{1,2}[ぁ-ん]{1,4}', nl)) and bool(re.search(ANSWER_END + '$', nl))


def check(labels, body, fig=None):
    nb = norm(body); res = []; flags = []
    for lab, is_note, whole in labels:
        nl = norm(lab)
        if len(nl) < 2 and not re.search(r'[一-龥]', nl):
            continue
        if re.fullmatch(r'[①-⑳\d\(\)a-zA-Z（）]+', nl):
            continue
        ws = words(lab)
        if is_answer(nl):                                   # 問いへの答えの語（でない・した・用いない・ある）：漢字の部分だけを本文で探す
            stem = re.match(f'[{KANJI}]+[ぁ-ん]?', nl)
            if not stem or norm(stem.group(0)) in nb: continue
        if nl in nb or (whole and whole in nb):
            st, miss = '語あり', []
        else:
            miss = [w for w in ws if norm(w) not in nb]
            hit = 1 - len(miss) / max(1, len(ws))
            st = '語あり（語ごと）' if not miss else ('一部の語' if hit >= 0.6 else 'なし')
        row = {'label': lab, 'status': st, 'missing': miss, 'note': is_note}
        res.append(row)
        for q in nums(lab):
            if norm(q) not in nb:
                flags.append({'code': 'T01', 'label': lab, 'msg': f'数字・条文番号「{q}」が本文にない'})
        for pos, neg in ASSERT_PAIRS:
            for a, b in ((pos, neg), (neg, pos)):
                if nl.endswith(norm(a)) and not nl.endswith(norm(b)):
                    stem = nl[:-len(norm(a))]
                    key = stem[-6:] if len(stem) >= 4 else None
                    if key and (key + norm(b)) in nb and (key + norm(a)) not in nb:
                        flags.append({'code': 'T04', 'label': lab, 'msg': f'本文では「…{key}{b}」の形でしか出てこない（図と向きが逆の疑い）'})
        for q in QUALIFIERS:
            nq = norm(q)
            if nq in nl:
                continue
            for w in ws:
                nw = norm(w)
                if len(nw) >= 3 and (nq + nw) in nb and nb.count(nw) == nb.count(nq + nw):
                    flags.append({'code': 'T05', 'label': lab, 'msg': f'本文では常に「{q}{w}」。図で限定語「{q}」が落ちている疑い'})
    if fig is not None:
        tag = f'図{fig}'
        refs = [m.start() for m in re.finditer(re.escape(norm(tag)) + r'(?!\d)', nb)]
        cap = [m.start() for m in re.finditer(re.escape(norm(tag)) + r'(?!\d)(?=この図で分かること|[　:：])', nb)]
        body_refs = [r for r in refs if r not in cap]
        if not body_refs:
            flags.append({'code': 'T02', 'label': tag, 'msg': f'本文に「{tag}」への参照がない（図は、それを指す文の近くに置く）'})
        elif cap and min(body_refs) > min(cap):
            flags.append({'code': 'T02', 'label': tag, 'msg': f'「{tag}」への参照が図題より後ろにしかない（先に本文で触れてから図を置く）'})
        order = [int(m.group(1)) for m in re.finditer(r'図(\d+)', nb)]
        first = []
        for n in order:
            if n not in first:
                first.append(n)
        if first != sorted(first):
            flags.append({'code': 'T03', 'label': tag, 'msg': f'図の番号が本文で昇順に出てこない：{first}'})
    return res, flags


# ---------------------------------------------------------------------------
# 関係の照合（T06〜T08）：語が本文にあるかではなく、「誰について・誰から誰へ・どうなるか」の組合せが本文と合うかを見る
# ---------------------------------------------------------------------------
KANJI = r'一-龥々〇'
PARTICLES = 'はがをにでとのへもやか'
GODAN = ['わいうえおっ', 'かきくけこい', 'がぎぐげごい', 'さしすせそ', 'たちつてとっ', 'なにぬねのん', 'ばびぶべぼん', 'まみむめもん', 'らりるれろっ']
NEG_RE = re.compile(r'^[ぁ-ん]{0,7}?(?:ない|ず(?![ぁ-ん])|ぬ|ません|なかった|なく|なけれ(?!ばなら))')      # 「…でなければ」も否定（「…なければならない」は OBLIG_RE が先に拾う）
OBLIG_RE = re.compile(r'^[ぁ-ん]{0,7}?(?:なければなら|なくてはなら|ねばなら|ざるを得|にすぎ|かもしれ|に限ら|だけでなく|のみなら)')
POS_RE = re.compile(r'^(?:を|が|は|に)?[ぁ-ん]{0,2}?(?:できる|でき、|できた|する|した|して|し、|される|された|がある|があり|である|であり|となる|となり|になる|うる|つ|ける|う|ぶ|る)')


def polarity(tail):
    """語の直後の形：'neg'（…ない）／'pos'（…する・できる・である）／''（名詞として出ているだけ）。「…でなければならない」は否定ではない"""
    if OBLIG_RE.match(tail): return 'pos'
    if NEG_RE.match(tail): return 'neg'
    return 'pos' if POS_RE.match(tail) else ''

REL_STOP = STOP | {'場合', '関係', '当事', '原則', '例外', '必要', '問題', '以外', '結果', '全部', '一部', '部分', '自分', '相手', '双方', '同様', '当該'}


def strip_par(s):
    return re.sub(r'\([^()]*\)', '', s)


def aliases(label):
    """箱・列・段の名前を、本文で探すための語にする。「無権代理型（法律上併存しない）」→ 全体、括弧の外、括弧の中"""
    n = norm(re.sub(r'^[①-⑳\d]+[\s　.．]*', '', label.replace('|', '')))
    out = [n]; base = strip_par(n)
    if base and base != n: out.append(base)
    if re.search('[:：]', base): out.append(re.split('[:：]', base)[0])
    for m in re.findall(r'\(([^()]{3,})\)', n):
        if not re.fullmatch(r'[\d条項号の・、第民法刑会社訴行憲a-zA-Z\s]+', m): out.append(m)
    return [x for i, x in enumerate(out) if len(x) >= 1 and x not in out[:i]]


def occurrences(text, alias):
    """text の中の alias の位置。漢字の語の途中（無権｜代理人）は数えない"""
    res = []; i = text.find(alias)
    while i >= 0:
        pre, post = text[i - 1] if i else '', text[i + len(alias)] if i + len(alias) < len(text) else ''
        solo = len(alias) == 1 and (re.match(r'[A-Za-z0-9]', pre or ' ') or re.match(r'[A-Za-z0-9]', post or ' '))      # 一字の記号（A・甲）は前後が英数字なら別の語
        conj = text.startswith(('及び', '又は', '並びに', '若しくは', '等'), i + len(alias))      # 「債務者及び…」の「及」は語の続きではない
        if not solo and not (re.match(f'[{KANJI}]', alias[0]) and re.match(f'[{KANJI}]', pre or ' ')) and not (re.match(f'[{KANJI}]', alias[-1]) and re.match(f'[{KANJI}]', post or ' ') and not conj):
            res.append(i)
        i = text.find(alias, i + 1)
    return res


def clause_neg(tail):
    """語の後ろ、節の終わり（次の読点・句点）までが否定で終わるか。「…は許されない」「…を審理することはない」。義務の「…なければならない」は否定に数えない"""
    m = re.search('[、。]', tail); c = re.sub(r'\([^()]*\)$', '', tail[:m.start()] if m else tail[:40])
    return bool(re.search(r'(ない|ず|ません|なかった)$', c)) and not re.search(r'(なければなら(ない|ず)|なくてはなら(ない|ず)|ねばなら(ない|ず|ぬ)|にすぎ(ない|ず)|かもしれない)$', c)


def term_info(text, exclude=()):
    """言い切りの語を、照合の単位に分ける。[(表示, 正規表現, 否定か, 形が明示か)]。
       否定か＝語の直後が否定、または語を含む節が否定で終わる。形が明示か＝語の直後が動詞・否定の形（名詞として出ているだけなら False）。
       除外するのは、端点・見出しの名前と完全に一致する語だけ（「監査役」が端点でも「監査」は残す）"""
    s = norm(text.replace('|', '')); out = []; ex = set()
    for e in exclude: ex |= set(aliases(e)) | {norm(e)}
    for m in re.finditer(rf'\d+条(?:の\d+)?|\d+(?:\.\d+)?(?:か月|箇月|週間|時間|分の\d+|万円|年|日|円|%|項|号)|(?:(?!又は|及び|並びに|若しくは)[{KANJI}])+|[ァ-ヶー]{{2,}}', s):
        w = m.group(0); tail = s[m.end():]
        if w in ex or w in REL_STOP: continue
        if re.match(r'\d', w):
            rx = r'(?<!\d)' + re.escape(w) + (r'(?!の\d)' if w.endswith('条') else '')
        elif re.match(f'[{KANJI}]', w) and len(w) == 1:
            k = tail[:1]
            if k and re.match(r'[ぁ-ん]', k) and k not in PARTICLES:          # 一字の動詞：勝つ・負ける・負う・及ぶ・科する
                nxt = tail[1:2]; row = next((r for r in GODAN if k in r), None)
                ichidan = nxt == 'る' and k in 'えけげせぜてでねべめれいきぎしじちぢにびみり'
                rx = rf'(?<![{KANJI}])' + re.escape(w) + (re.escape(k) if ichidan or not row else f'[{row}]'); w = w + k
            else:
                rx = rf'(?<![{KANJI}])' + re.escape(w) + rf'(?![{KANJI}])'
        else:
            rx = re.escape(w)
        pl = polarity(tail); cn = clause_neg(tail); neg = pl == 'neg' or cn
        if not tail and len(w) >= 2 and re.match(f'[{KANJI}]', w) and s[m.start() - 1:m.start()] == 'を': pl = 'pos'      # 「…を提起」で終わる体言止めは肯定の言い切り
        if not any(o[0] == w and o[2] == neg for o in out): out.append((w, rx, neg, bool(pl)))
    return out


def claim_terms(text, exclude=()):
    """[(表示, 正規表現, 否定か)]（term_info の短縮形）"""
    return [t[:3] for t in term_info(text, exclude)]


ART_RE = re.compile(r'(\d+)条(?:の(\d+))?(?:第?(\d+)項)?')
LAWS = r'(?:民法|刑法|会社法|商法|憲法|民事訴訟法|刑事訴訟法|民事執行法|民事保全法|行政手続法|行政事件訴訟法|国家賠償法|借地借家法|破産法|刑訴法|民訴法|行訴法|行手法)'


def arts_in(s):
    """文字列の中の条文番号 [(「424条の6」, 項 or None)]"""
    return [(f"{m.group(1)}条" + (f"の{m.group(2)}" if m.group(2) else ''), m.group(3)) for m in ART_RE.finditer(norm(s))]


def strip_arts(s):
    """条文番号と、条文番号だけの括弧書きを除いた中身"""
    t = norm(s)
    t = re.sub(r'\([^()]*\d+条[^()]*\)', '', t)
    t = re.sub(LAWS + r'?(?:第)?\d+条(?:の\d+)?(?:第?\d+項)?(?:第?\d+号)?(?:[〜~・、]\d+(?:項|号))*(?:本文|ただし書|前段|後段|柱書|各号|かっこ書)?', '', t)
    return t


def sent_has_art(sen, art, para):
    for m in re.finditer(r'(?<!\d)' + re.escape(art) + (r'(?!\d)' if art[-1].isdigit() else r'(?!の\d)'), sen):
        if not para: return True
        w = re.split(r'\d+条', sen[m.end():m.end() + 18])[0]
        if re.search(rf'(?<!\d)第?{para}項', w): return True
    return False


def head_term(terms):
    """述語の中心の語：数でない最後の語（二字以上の漢語か、送り仮名つきの一字の動詞）"""
    for t in reversed(terms):
        w = t[0]
        if re.match(r'\d', w): continue
        if len(w) >= 2 and w not in LIGHT: return t
    return None


LIGHT = {'受け', '行い', '行う', '行っ', '有す', '有し', '執ら', '執る', '経る', '求め', '置か', '置く', '設け'}      # 軽い動詞（「訴訟告知を受ける」の中心は「訴訟告知」）


NEG_HDR = re.compile(r'(ない|ず|不成立|否定|除外)(もの|場合|者|事由|とき|類型)?$')


def is_identity(sub):
    """箱の二行目が、その者の言い換え（「債務者の全ての債権者」）か。言い切り（「被告になる」）でなく、者・人で終わる名詞"""
    s_ = norm(lab_(sub))
    s_ = re.sub(r'(など|等|ら)$', '', s_)
    return bool(s_) and bool(re.search(r'(者|人|会社|機関|権者)$', s_)) and not re.search(r'(する|しない|ない|できる|なる|負う|受ける)', s_)


def lab_(x):
    return (x or '').replace('|', '') if isinstance(x, str) else ''.join(x or [])


def relations_from_spec(d, prefix=''):
    """仕様から関係を取り出す（本文と突き合わせる「関係の表」を、図の側から作る）。
       attr ：{anchor（誰・どの類型・どの段について）, siblings（取り違えうる相手）, claim（どうなるか）, sib_claims}
       edge ：{frm, to, claim, directed, names}（矢印：frm が to に claim する）
       cond ：{q（問い）, edge（枝の語）, out（行き先）, sib_outs, leaf}（木の枝・流れ図の出口・座標図のセル：この条件ならこの結論）
       order：{items:[(語, 条文)]}（スイムレーンの段・時間軸の出来事の順）
       group：{label, members, nonmembers}（範囲の枠の構成員）
       span ：{claim, ends, others}（時間軸の帯・数直線の区間の始まりと終わり）
       art  ：{claim, arts}（条文番号が、その要素の述語と同じ文で本文に出てくるか）"""
    R = []; t = d.get('type')
    lab = lambda x: (x or '').replace('|', '') if isinstance(x, str) else ''.join(x or [])
    txt = lambda x: lab(x.get('text') if 'text' in x else x.get('lines')) if isinstance(x, dict) else lab(x)
    def head1(x):                                      # 見出しの一行目（「時的範囲|いつの時点の」→「時的範囲」）。二行目が括弧書きなら全体
        if isinstance(x, str) and '|' in x and not x.split('|', 1)[1].lstrip().startswith(('（', '(')): return x.split('|', 1)[0]
        return x
    def attr(anchor, sibs, claim, where, sib_claims=None, nopol=False):
        anchor = head1(anchor); sibs = [head1(x) for x in sibs]
        if anchor and claim: R.append({'kind': 'attr', 'anchor': lab(anchor), 'siblings': [lab(x) for x in sibs if x and lab(x) != lab(anchor)], 'claim': lab(claim), 'sib_claims': [lab(c) for c in (sib_claims or []) if c], 'where': prefix + where, 'nopol': nopol})
    def edge(frm, to, claim, where, directed=True, names=(), stop=False):
        if frm and to and (claim or stop): R.append({'kind': 'edge', 'frm': lab(frm), 'to': lab(to), 'claim': lab(claim) or '（止め線）', 'directed': directed, 'stop': stop, 'where': prefix + where, 'names': [lab(x) for x in names if x and lab(x) not in (lab(frm), lab(to))]})
    def cond(q, e, out, sib_outs, where, leaf=True):
        if (q or e) and out: R.append({'kind': 'cond', 'q': lab(q), 'edge': lab(e), 'out': lab(out), 'sib_outs': [lab(x) for x in sib_outs if x and lab(x) != lab(out)], 'leaf': leaf, 'grp': prefix, 'where': prefix + where, 'claim': lab(out)})
    def art_from(text, sub, where):
        for s_, other in ((sub, text), (text, None)):
            s_ = lab(s_)
            if not s_ or not arts_in(s_): continue
            content = re.sub(r'(?:^|[\s　、,])(?:例|たとえば|例えば)[:：　\s].*$', '', strip_arts(s_)).strip()      # 例示（「例：収賄罪」）は条文の内容ではないので、条文と照らす語に入れない
            main = content if any(not re.match(r'\d', x[0]) for x in term_info(content)) else (lab(other) if other else '')
            main = strip_arts(main) if main else ''
            if main: R.append({'kind': 'art', 'claim': main, 'arts': arts_in(s_), 'where': prefix + where})
            return
    def groups(nodes):
        name = {n.get('id'): n for n in nodes}
        for g in d.get('groups', []):
            mem = [name[i] for i in g.get('members', []) if i in name]
            if not g.get('label') or not mem: continue
            R.append({'kind': 'group', 'label': lab(g['label']), 'claim': lab(g['label']), 'members': [(lab(n.get('label')), lab(n.get('sub'))) for n in mem],
                      'nonmembers': [(lab(n.get('label')), lab(n.get('sub'))) for n in nodes if n not in mem and n.get('kind') not in ('thing', 'proc')], 'where': prefix + f"範囲の枠「{lab(g['label'])}」"})
    if t in ('parties', 'chain'):
        nodes = d.get('nodes', []); name = {n.get('id'): n.get('label') for n in nodes}; names = list(name.values())
        for n in nodes:
            if not is_identity(n.get('sub')):
                n0 = len(R); attr(n.get('label'), names, n.get('sub'), f"nodes「{lab(n.get('label'))}」の二行目", [m.get('sub') for m in nodes if m is not n])
                if len(R) > n0: R[-1]['actor'] = True
            art_from(n.get('label'), n.get('sub'), f"nodes「{lab(n.get('label'))}」の条文")
        for i, e in enumerate(d.get('edges', []) + d.get('links', [])):
            w = f"矢印「{lab(name.get(e.get('from')))}→{lab(name.get(e.get('to')))}」"
            edge(name.get(e.get('from')), name.get(e.get('to')), e.get('label'), w + ('（止め線）' if e.get('stop') else ''), e.get('head') not in ('none', 'both') and not e.get('stop'), names, bool(e.get('stop')))
            art_from(e.get('label'), e.get('sub'), w + 'の条文')
        for r in d.get('relations', []):
            h = r.get('head', 'both'); a, b = name.get(r.get('a')), name.get(r.get('b'))
            if h == 'a': edge(b, a, r.get('label'), f"関係の矢印「{lab(b)}→{lab(a)}」", names=names)
            elif h == 'b': edge(a, b, r.get('label'), f"関係の矢印「{lab(a)}→{lab(b)}」", names=names)
            else: edge(a, b, r.get('label'), f"関係「{lab(a)}―{lab(b)}」", False, names)
            art_from(r.get('label'), r.get('sub'), f"関係「{lab(a)}―{lab(b)}」の条文")
        groups(nodes)
    elif t == 'compare':
        cols = [c.get('title') for c in d.get('columns', [])]; rows = d.get('rows', [])
        is_split = lambda c: isinstance(c, dict) and isinstance(c.get('split'), list)
        hdr = {}                                       # 列ごとの、列を割った見出し（最初に割った段）
        for r in rows:
            for i, c in enumerate(r.get('cells', [])):
                if is_split(c) and i not in hdr: hdr[i] = (r, [txt(x) for x in c['split']])
        allh = [h for _, hs in hdr.values() for h in hs]
        for r in rows:
            cells = r.get('cells', []); flat = []; nopol = bool(NEG_HDR.search(norm(lab(r.get('label')))))     # 段の見出しが否定（「及ばないもの」）なら、セルの肯定・否定は見出しに掛かる
            for i, c in enumerate(cells):
                if is_split(c): flat += [txt(x) for x in c['split']]
                else: flat.append(txt(c))
            for i, c in enumerate(cells):
                if is_split(c):
                    if i in hdr and hdr[i][0] is r: continue
                    for k, x in enumerate(c['split']):
                        anc = hdr[i][1][k] if i in hdr and k < len(hdr[i][1]) else cols[i]
                        attr(anc, allh, txt(x), f"{lab(r.get('label'))}の段・{lab(cols[i])}・{anc}", [y for y in flat], nopol)
                        art_from(txt(x), None, f"{lab(r.get('label'))}の段・{lab(cols[i])}・{anc}の条文")
                else:
                    attr(cols[i], cols, txt(c), f"{lab(r.get('label'))}の段・{lab(cols[i])}", flat, nopol)
                    if r.get('label') and len(rows) > 1 and (isinstance(c, dict) and c.get('except') or arts_in(txt(c))):      # 条文・例外を持つセルだけ         # 段の帰属：セルの語が、本文で別の段の話題として書かれていないか
                        attr(r.get('label'), [x.get('label') for x in rows], txt(c) + ('、' + lab(c['except']) if isinstance(c, dict) and c.get('except') else ''), f"{lab(r.get('label'))}の段（段の帰属）・{lab(cols[i])}", [], True); R[-1]['rowcheck'] = True
                    if isinstance(c, dict) and c.get('except'): attr(cols[i], cols, lab(c['except']), f"{lab(r.get('label'))}の段・{lab(cols[i])}の例外", flat, nopol); art_from(lab(c['except']), None, f"{lab(r.get('label'))}の段・{lab(cols[i])}の例外の条文")
                    art_from(txt(c), None, f"{lab(r.get('label'))}の段・{lab(cols[i])}の条文")
    elif t == 'flow':
        steps = d.get('steps', []); st = [x.get('text') for x in steps]; ex = [x['exit'] for x in steps if x.get('exit')]
        ext = list(dict.fromkeys([lab(x.get('text')) for x in ex] + ([lab(d['end'].get('text'))] if d.get('end') else [])))
        for i, x in enumerate(steps):
            attr(x.get('text'), st, x.get('sub'), f"段「{lab(x.get('text'))}」の二行目", [y.get('sub') for y in steps if y is not x])
            art_from(x.get('text'), x.get('sub'), f"段「{lab(x.get('text'))}」の条文")
            nxt = steps[i + 1].get('text') if i + 1 < len(steps) else (d['end'].get('text') if d.get('end') else None)
            ps = x.get('pass') or d.get('pass') or ''
            if x.get('exit'):
                if len(set(lab(e.get('text')) for e in ex)) > 1:
                    attr(x.get('text'), st, x['exit'].get('text'), f"段「{lab(x.get('text'))}」の出口", [lab(e.get('text')) for e in ex])
                if x['exit'].get('sub'):
                    attr(x['exit'].get('text'), ext, x['exit'].get('sub'), f"出口「{lab(x['exit'].get('text'))}」の二行目", [e.get('sub') for e in ex if e is not x['exit']] + ([d['end'].get('sub')] if d.get('end') else []))
                art_from(x['exit'].get('text'), x['exit'].get('sub'), f"出口「{lab(x['exit'].get('text'))}」の条文")
                cond(x.get('text'), x['exit'].get('label'), x['exit'].get('text'), [nxt], f"段「{lab(x.get('text'))}」→「{lab(x['exit'].get('label'))}」→「{lab(x['exit'].get('text'))}」")
                if nxt and ps: cond(x.get('text'), ps, nxt, [x['exit'].get('text')], f"段「{lab(x.get('text'))}」→「{lab(ps)}」→「{lab(nxt)}」", leaf=i + 1 >= len(steps))
            for b in x.get('branch', []) or []:          # 段の中の小さな分岐（例外の小枝）
                cond(x.get('text'), b.get('label'), b.get('text'), [nxt], f"段「{lab(x.get('text'))}」の小枝「{lab(b.get('label'))}」")
                art_from(b.get('text'), b.get('sub'), f"段「{lab(x.get('text'))}」の小枝の条文")
                if b.get('sub'): attr(b.get('text'), [b.get('text')] + st, b.get('sub'), f"段「{lab(x.get('text'))}」の小枝の二行目", [y.get('sub') for y in steps])
        if d.get('end'):
            attr(d['end'].get('text'), ext, d['end'].get('sub'), f"終点「{lab(d['end'].get('text'))}」の二行目", [e.get('sub') for e in ex])
            art_from(d['end'].get('text'), d['end'].get('sub'), f"終点「{lab(d['end'].get('text'))}」の条文")
    elif t == 'tree':
        allt = []
        def walk(n): allt.append(n); [walk(c) for c in n.get('children', [])]
        walk(d.get('root', {}))
        for n in allt:
            attr(n.get('text'), [m.get('text') for m in allt], n.get('sub'), f"節「{lab(n.get('text'))}」の二行目", [m.get('sub') for m in allt if m is not n])
            art_from(n.get('text'), n.get('sub'), f"節「{lab(n.get('text'))}」の条文")
            ch = n.get('children', [])
            for c in ch:
                if c.get('edge'): cond(n.get('text'), c.get('edge'), c.get('text'), [o.get('text') for o in ch if o is not c], f"節「{lab(n.get('text'))}」→枝「{lab(c.get('edge'))}」→「{lab(c.get('text'))}」", leaf=not c.get('children'))
    elif t == 'quadrant':
        xs = (d.get('xAxis') or {}).get('values', []); ys = (d.get('yAxis') or {}).get('values', [])
        cells = d.get('cells', []); titles = [c.get('title') for row in cells for c in row if isinstance(c, dict)]
        for r_, row in enumerate(cells):
            for c_, c in enumerate(row):
                if not isinstance(c, dict) or c.get('na'): continue
                xv = xs[c_] if c_ < len(xs) else ''; yv = ys[r_] if r_ < len(ys) else ''
                if c.get('title'): cond('', f"{lab(xv)}、{lab(yv)}", c.get('title'), [x for x in titles if x != c.get('title')], f"セル「{lab(xv)}×{lab(yv)}」→「{lab(c.get('title'))}」")
                others = [l for row2 in cells for c2 in row2 if isinstance(c2, dict) and c2 is not c for l in (c2.get('lines') or [])]
                for ln in c.get('lines') or []:
                    attr(c.get('title') or f"{lab(xv)}{lab(yv)}", titles, ln, f"セル「{lab(c.get('title'))}」の「{lab(ln)}」", others)
                    art_from(ln, None, f"セル「{lab(c.get('title'))}」の「{lab(ln)}」の条文")
    elif t == 'swimlane':
        lanes = d.get('lanes', []); sts = d.get('steps', [])
        for i, x in enumerate(sts):
            ln = lanes[x.get('lane', 0)] if x.get('lane', 0) < len(lanes) else ''
            if not re.search(r'(受け|され|られ)', lab(x.get('text'))):
                n0 = len(R); attr(ln, lanes, x.get('text'), f"段{i + 1}「{lab(x.get('text'))}」の帯（{lab(ln)}）", [y.get('text') for y in sts if y.get('lane') != x.get('lane')])
                if len(R) > n0: R[-1]['actor'] = True
            art_from(x.get('text'), x.get('sub'), f"段{i + 1}「{lab(x.get('text'))}」の条文")
            for b in x.get('branch', []) or []:
                art_from(b.get('text'), b.get('sub'), f"段{i + 1}の分岐「{lab(b.get('text'))}」の条文")
        R.append({'kind': 'order', 'items': [(lab(x.get('text')), lab(x.get('sub'))) for x in sts], 'what': '段', 'where': prefix + '段の順', 'claim': '段の順'})
    elif t == 'timeline':
        ev = d.get('events', []); el = [f"{lab(e.get('date'))} {lab(e.get('label'))}".strip() for e in ev]
        R.append({'kind': 'order', 'items': [(lab(e.get('label')), '') for e in ev], 'what': '出来事', 'where': prefix + '出来事の順', 'claim': '出来事の順', 'soft': True})     # 本文は時の順に書くとは限らない：逆なら T08
        for e in ev: art_from(e.get('label'), None, f"出来事「{lab(e.get('label'))}」の条文")
        for tr in d.get('tracks', []):
            for sg in tr.get('segments', []):
                a_ = sg.get('from', 0); b_ = sg.get('to')
                ends = [lab(ev[a_].get('label'))] if isinstance(a_, int) and a_ < len(ev) else []
                if isinstance(b_, int) and b_ < len(ev): ends.append(lab(ev[b_].get('label')))
                R.append({'kind': 'span', 'claim': lab(sg.get('label')), 'ends': ends, 'others': [lab(e.get('label')) for e in ev if lab(e.get('label')) not in ends], 'where': prefix + f"帯「{lab(tr.get('name'))}」の「{lab(sg.get('label'))}」"})
                art_from(sg.get('label'), None, f"帯「{lab(sg.get('label'))}」の条文")
    elif t == 'numberline':
        tk = d.get('ticks', []); vals = {x.get('v'): lab(x.get('value')) for x in tk}
        for x in tk:
            art_from(x.get('label'), None, f"目盛り「{lab(x.get('value'))}」の条文")
        for rg in d.get('ranges', []):
            ends = [vals[k] for k in (rg.get('from'), rg.get('to')) if k in vals and vals[k]]
            R.append({'kind': 'span', 'claim': lab(rg.get('label')), 'ends': ends, 'others': [v for v in vals.values() if v and v not in ends], 'where': prefix + f"区間「{lab(rg.get('label'))}」"})
    elif t == 'matrix':
        rows = d.get('rows', []); rl = [r.get('label') for r in rows]
        for r in rows:
            for c in r.get('cells', []):
                ct = txt(c) if isinstance(c, dict) else lab(c)
                attr(r.get('label'), rl, ct, f"行「{lab(r.get('label'))}」のセル", [txt(c2) if isinstance(c2, dict) else lab(c2) for r2 in rows if r2 is not r for c2 in r2.get('cells', [])])
                art_from(ct, None, f"行「{lab(r.get('label'))}」のセルの条文")
    elif t == 'nest':
        alln = []
        def walk(n, par=None): alln.append((n, par)); [walk(c, n) for c in n.get('children', [])]
        walk(d.get('root', {}))
        for n, par in alln:
            attr(n.get('label'), [m.get('label') for m, _ in alln], n.get('lines'), f"「{lab(n.get('label'))}」の説明", [m.get('lines') for m, _ in alln if m is not n])
            if par is not None: R.append({'kind': 'nest', 'outer': lab(par.get('label')), 'inner': lab(n.get('label')), 'claim': '含む', 'where': prefix + f"「{lab(par.get('label'))}」の中の「{lab(n.get('label'))}」"})
    elif t == 'bar':
        for r in d.get('rows', []):
            ps = r.get('parts', []); hs = [p.get('holder') or p.get('label') for p in ps]
            for p in ps:
                if p.get('holder') and p.get('label'): attr(p.get('holder'), hs, p.get('label'), f"「{lab(r.get('label'))}」の「{lab(p.get('holder'))}」", [q.get('label') for q in ps if q is not p])
    elif t == 'stack':
        lv = d.get('levels', [])
        for x in lv:
            attr(x.get('name'), [y.get('name') for y in lv], x.get('effect'), f"段「{lab(x.get('name'))}」の効果", [y.get('effect') for y in lv if y is not x])
            art_from(x.get('name'), x.get('effect'), f"段「{lab(x.get('name'))}」の条文")
    elif t == 'instances':
        sg = d.get('stages', [])
        for x in sg: attr(x.get('court'), [y.get('court') for y in sg], x.get('result'), f"「{lab(x.get('court'))}」の結論", [y.get('result') for y in sg if y is not x])
    elif t == 'statute':
        ps = d.get('parts', [])
        for x in ps:
            attr(x.get('kind'), [y.get('kind') for y in ps], x.get('effect'), f"「{lab(x.get('kind'))}」の効果", [y.get('effect') for y in ps if y is not x])
    elif t == 'movement':
        its = d.get('items', [])
        for x in its: attr(x.get('label'), [y.get('label') for y in its], x.get('why'), f"「{lab(x.get('label'))}」の理由", [y.get('why') for y in its if y is not x])
    elif t == 'panel':
        for i, pn in enumerate(d.get('panels', [])):
            if isinstance(pn.get('spec'), dict): R += relations_from_spec(pn['spec'], prefix + f"区画{i + 1}：")
    return R


def read_relations_table(path):
    """関係の表（Markdown の表か JSON）を、本文と同じに扱える文に直す。
       列：主語（誰が・どの場面で）｜相手（誰に。なければ —）｜述語（何をする・どうなる）｜根拠（条文など。任意）"""
    raw = open(path, encoding='utf-8').read(); rows = []
    if path.endswith('.json'):
        for r in json.load(open(path, encoding='utf-8')): rows.append([r.get('主語') or r.get('subject') or '', r.get('相手') or r.get('object') or '', r.get('述語') or r.get('predicate') or '', r.get('根拠') or r.get('basis') or ''])
    else:
        for ln in raw.splitlines():
            if not ln.strip().startswith('|'): continue
            c = [x.strip() for x in ln.strip().strip('|').split('|')]
            if len(c) < 3 or set(''.join(c)) <= set('-: ') or c[0] in ('主語', '誰が', '主語（誰が・どの場面で）'): continue
            rows.append((c + [''])[:4])
    out = []
    for s_, o_, p_, b_ in rows:
        if not s_ or not p_: continue
        o_ = '' if o_ in ('—', '-', 'ー', '―', 'なし') else o_
        out.append(f"{s_}は、" + (f"{o_}に対し、" if o_ else '') + p_ + (f"（{b_}）" if b_ else '') + '。')
    return out


class Body:
    """本文を段落・文に分け、位置を引けるようにする"""
    def __init__(self, text, table_rows=()):
        self.paras = []
        for ln in list(table_rows) + re.split(r'\n+', text):
            ln = re.sub(r'^[#>\-\*\s]+', '', ln.strip())
            if not ln or ln.startswith('|') or re.match(r'^図\s*[\dN]+[\s　]', ln): continue      # 図題は本文に数えない
            p = norm(ln); bounds = [0]; dep = 0
            for i_, ch in enumerate(p):                        # 括弧の中の句点（「（選定・監督。362条2項）」）では文を切らない
                if ch == '(': dep += 1
                elif ch == ')': dep = max(0, dep - 1)
                elif ch == '。' and dep == 0: bounds.append(i_ + 1)
            if bounds[-1] != len(p): bounds.append(len(p))
            bounds = [b_ for i, b_ in enumerate(bounds) if not (0 < i < len(bounds) - 1 and re.match(r'\([^()]{1,40}\)。?$', p[b_:bounds[i + 1]]))]   # 「…監督する。（362条2項）」の括弧は前の文に付ける
            self.paras.append({'t': p, 'b': bounds})

    @staticmethod
    def sent(p, pos):
        for i in range(len(p['b']) - 1):
            if p['b'][i] <= pos < p['b'][i + 1]: return i
        return len(p['b']) - 2


def after(text, end):
    """語の直後（括弧書きは飛ばす）"""
    t = text[end:]
    while t.startswith('('):
        j = t.find(')'); t = t[j + 1:] if j >= 0 else ''
    return t


def is_topic(text, end):
    t = after(text, end)
    return bool(re.match(r'(は|が|も|なら|では|には|にも|でも|とは|の場合|については|について|との関係|に対する関係|であり|である|のとき|、)', t))


def edge_role(text, end):
    t = after(text, end)
    if re.match(r'(は|が|も)', t): return 'ga'
    m = re.match(r'(に対して、?|に対し、?|に(?!つい|おい|より|よる|よっ|当た|は|も)、?|へ、?|を、?)', t)
    if m: return 'ni'
    return ''


def anchor_hits(para, names):
    """段落の中の、名前（別名を含む）の出現。[(位置, 終わり, 名前の番号, 主題か)]"""
    hits = []
    for k, al in enumerate(names):
        for a in al:
            for i in occurrences(para['t'], a): hits.append((i, i + len(a), k, is_topic(para['t'], i + len(a))))
    hits.sort(); res = []
    for h in hits:                                          # 長い別名に含まれる短い別名の重複を落とす
        if not any(o[0] <= h[0] and h[1] <= o[1] and o is not h and (o[1] - o[0]) > (h[1] - h[0]) for o in hits): res.append(h)
    return res


def attribute(para, pos, hits):
    """位置 pos の語が、どの名前について言われているか。同じ文の手前の主題 → 同じ文の手前 → 前の文からの持ち越し → 同じ文の後ろ"""
    attribute.weak = False
    si = Body.sent(para, pos); lo, hi = para['b'][si], para['b'][si + 1]
    ce0 = re.search('[、。]', para['t'][pos:hi]); cend0 = pos + ce0.start() if ce0 else hi
    mod = [h for h in hits if pos < h[0] and h[1] <= cend0]
    if mod:                                                  # 連体修飾：「国の公権力の行使に当たる公務員が」の「公権力」は、後ろの「公務員」を修飾する語で、手前の「国」の属性ではない
        h0 = min(mod); gap = para['t'][pos:h0[0]]
        if len(gap) <= 16 and not re.search(r'(は|が|も|、)', gap) and re.search(r'(る|た|の|い|な|し)$', gap): return {h0[2]}
    before = [h for h in hits if lo <= h[0] and h[1] <= pos]
    pick = None
    if before:
        tp = [h for h in before if h[3]]; pick = max(tp or before)
    else:
        ce = re.search('[、。]', para['t'][pos:hi]); cend = pos + ce.start() if ce else hi
        inclause = [h for h in hits if pos <= h[0] and h[1] <= cend]
        prev = [h for h in hits if h[1] <= lo]
        if inclause: pick = min(inclause)
        elif prev:
            attribute.weak = bool(re.search(rf'[{KANJI}ァ-ヶー]{{2,}}は(?![ずじ])', para['t'][lo:hi]))      # この文に自分の主題（「裁判長は」「当事者は」）があるのに前の文の主語を持ち越す：弱い帰属（自分への帰属には数えるが、取り違えの根拠にはしない）
            last_s = Body.sent(para, max(prev)[0]); same = [h for h in prev if Body.sent(para, h[0]) == last_s]
            tp = [h for h in same if h[3]]; pick = (tp or same)[-1] if (tp or same) else None
            if pick is not None and tp and len(set(h[2] for h in tp)) > 1: pick = max(tp)
        else:
            aft = [h for h in hits if pos <= h[0] and h[1] <= hi]
            pick = min(aft) if aft else None
    if pick is None: return set()
    got = {pick[2]}; cur = pick                              # 並列：「甲にも乙にも」「教唆犯・幇助犯は」
    while True:
        prevs = [h for h in hits if h[1] <= cur[0]]
        if not prevs: break
        q = max(prevs); gap = para['t'][q[1]:cur[0]]
        if len(gap) <= 8 and not re.search('[、。]', gap) and (gap == '' or re.search(r'(も|と|・|及び|又は|や|か)', gap)): got.add(q[2]); cur = q
        else: break
    return got


def sentences(B):
    """本文の文の一覧 [(段落の番号, 文の番号, 文)]"""
    return [(pi, si, p['t'][p['b'][si]:p['b'][si + 1]]) for pi, p in enumerate(B.paras) for si in range(len(p['b']) - 1)]


def occ_pol(text, m):
    """本文のその出現が否定の形か"""
    tl = text[m.end():]
    return polarity(tl) == 'neg' or clause_neg(tl)


def term_status(t, sen, first=False):
    if len(t) > 4 and t[4]:                                  # 「ある／ない」から作った語：本文でも肯定・否定の形が付いた出現だけを数える
        ms = [m for m in re.finditer(t[1], sen) if polarity(sen[m.end():]) or clause_neg(sen[m.end():])]
        if not ms: return 'absent'
        if first: ms = ms[:1]
        return 'same' if any(occ_pol(sen, m) == t[2] for m in ms) else 'opp'
    """文の中の語の状態：'same'（同じ形で出る）・'opp'（逆の形でしか出ない）・'absent'。形が明示でない語（名詞）は、出れば same"""
    w, rx, neg, explicit = t[:4]
    ms = list(re.finditer(rx, sen))
    if not ms: return 'absent'
    if not explicit: return 'same'
    ex_ = [m for m in ms if polarity(after(sen, m.end())) or clause_neg(sen[m.end():])]       # 本文で肯定・否定の形が付いた出現
    if not ex_: return 'noun'                                 # 名詞として出ているだけ（「違憲かどうか」）：同じとも逆とも数えない
    if first: ex_ = ex_[:1]
    return 'same' if any(occ_pol(sen, m) == neg for m in ex_) else 'opp'


def fuzzy_has(w, sen):
    """三字以上の漢語は、二字の部分（「提訴請求」→「請求」）が出ればよい（言い換えの許容。一致の判定にだけ使う）"""
    if len(w) < 3 or not re.fullmatch(f'[{KANJI}]+', w): return False
    return any(w[i:i + 2] in sen for i in range(len(w) - 1) if w[i:i + 2] not in REL_STOP)


def check_art(r, B, S):
    """条文番号と述語が同じ文に出てくるか。その要素の語（述語の中心と、ほかの語の半分以上）を、条文番号を挙げる本文の文が述べているかを見る。
       述べておらず、本文でその語を述べる文が別の条文を挙げていれば T06。条文番号の文が要素の語を一つも含まなければ T06"""
    terms = [t for t in term_info(r['claim']) if not re.match(r'\d', t[0])]; h = head_term(terms)
    if not h: return dict(r, status='照合できず', code='', msg='述語の語がない')
    SA = [x for x in S if any(sent_has_art(x[2], a_, p_) for a_, p_ in r['arts'])]
    if not SA: return dict(r, status='照合できず', code='', msg='条文番号が本文にない（T01）')
    sc = lambda sen: sum(1 if term_status(t, sen) == 'same' else (0.5 if fuzzy_has(t[0], sen) else 0) for t in terms) / len(terms)
    hd = lambda sen: term_status(h, sen) == 'same' or fuzzy_has(h[0], sen)
    if any(hd(x[2]) and (sc(x[2]) >= 0.4 or len(terms) <= 2) for x in SA): return dict(r, status='所見なし', code='', msg='')
    idx = [k for k, x in enumerate(S) if x in SA]
    near = [S[j] for k in idx for j in (k - 1, k + 1) if 0 <= j < len(S) and S[j][0] == S[k][0] and S[j] not in SA and not arts_in(S[j][2])]      # 隣の文が自分の条文を挙げていれば、その文の条文が正（取り違えの疑いのまま）      # 同じ段落の隣の文（条文番号は、前の文の述語に付けて次の文の末尾に書くことがある）
    nh = [x for x in near if hd(x[2]) and (sc(x[2]) >= 0.4 or len(terms) <= 2)]
    if nh:
        return dict(r, status='要読み比べ', code='T08', msg=f"「{'・'.join(a_ + (f'{p_}項' if p_ else '') for a_, p_ in r['arts'])}」を挙げる文の隣の文が「{r['claim'][:20]}」を述べる（同じ文ではないので、どちらの条文か読み比べる）：「{nh[0][2][:50]}」")
    best_a = max(sc(x[2]) for x in SA); th = max(0.6, best_a + 0.2) if any(hd(x[2]) for x in SA) else 0.5
    others = sorted([x for x in S if x not in SA and arts_in(x[2]) and term_status(h, x[2]) == 'same' and sc(x[2]) >= th], key=lambda x: -sc(x[2]))
    an = '・'.join(a_ + (f'{p_}項' if p_ else '') for a_, p_ in r['arts'])
    if others:
        oa = '・'.join(dict.fromkeys(a_ + (f'{p_}項' if p_ else '') for a_, p_ in arts_in(others[0][2])))
        return dict(r, status='逆の疑い', code='T06', msg=f"「{an}」を挙げる本文の文は「{r['claim'][:20]}」を述べていない。本文でそれを述べる文の条文は「{oa}」：「{others[0][2][:50]}」")
    if best_a == 0 and len(terms) >= 2:
        return dict(r, status='逆の疑い', code='T06', msg=f"「{an}」を挙げる本文の文は、図の「{r['claim'][:20]}」の語を一つも含まない（別のことの条文）：「{SA[0][2][:50]}」")
    return dict(r, status='要読み比べ', code='T08', msg=f"「{an}」を挙げる本文の文に「{h[0]}」がない（言い換えか、条文の取り違えか、読み比べる）")


def end_neg(text):
    """文・ラベルの言い切りが否定か（括弧書きと句点を除いた最後の節の終わり）"""
    t = re.sub(r'\([^()]*\)', '', norm(text)).rstrip('。')
    t = re.split('[、。]', t)[-1] if t else t
    return bool(re.search(r'(ない|ず|ません|なかった|不可|否定)$', t)) and not re.search(r'(なければなら(ない|ず)|にすぎない)$', t)


def check_conds(conds, B, S):
    """木の枝・流れ図の出口・座標図のセル：本文の各文を、条件（問いの語＋枝の語）が最もよく合う枝に割り当て、
       その文（行き先が次の問いなら、次の文まで）が行き先を述べるかを見る。行き先と逆の形・兄弟の行き先が書かれていれば T06"""
    out = []; prep = []
    for c in conds:
        qt = [t for t in term_info(c['q']) if not re.match(r'\d', t[0])]
        et = [t for t in term_info(c['edge']) if not re.match(r'\d', t[0])]
        if not et and c['q']:                                   # 枝の語が「ある／ない」だけ：問いの述語の語に、肯定・否定を掛ける
            h = head_term(qt) or (qt[-1] if qt else None)
            if h:
                eneg = bool(re.search(r'(ない|なし|しない|いいえ|否)', norm(c['edge'])))
                if re.fullmatch(r'(はい|いいえ|yes|no|Yes|No|○|×)', norm(c['edge'])):      # 問いへの「はい／いいえ」だけは、問いの形に掛ける
                    et = [(h[0], h[1], eneg != h[2], True, True)]
                else:                                          # 「ある／ない」「でない／である」「した／しない」は、事実の形をそのまま述べる（問い「…でないか」→「でない」は否定）
                    et = [(h[0], h[1], eneg, True, True)]
        prep.append((c, qt, et, bool(et) and not [t for t in term_info(c['edge']) if not re.match(r'\d', t[0])]))      # 4 番目：枝の語が「ある／ない」だけ（中身は問いの語）
    assign = {i: [] for i in range(len(prep))}
    for k, (pi, si, sen) in enumerate(S):
        if re.search(r'(か。$|か、である|かである|かどうか)', sen): continue          # 問いを述べる文（「前か後か、である」）は、条件の文に数えない
        sc = {}
        for i, (c, qt, et, bare) in enumerate(prep):
            if not et or any(term_status(t, sen, first=True) != 'same' for t in et): continue
            qs = sum(1 for t in qt if re.search(t[1], sen) and t[0] not in [e[0] for e in et])
            qn = len([t for t in qt if t[0] not in [e[0] for e in et]])
            if bare and qs < max(1, qn // 2): continue          # 「ある／ない」だけの枝は、問いの中身の語を半分以上含む文でなければ、その条件の文と数えない
            sc[i] = (2 * len(et) + qs) / (2 * len(et) + qn)
        if not sc: continue
        best = max(sc.values())
        for i, v in sc.items():
            if v == best and (prep[i][0]['grp'] == prep[max(sc, key=sc.get)][0]['grp']): assign[i].append(k)
    for i, (c, qt, et, bare) in enumerate(prep):
        if not et: out.append(dict(c, status='照合できず', code='', msg='枝の語がない')); continue
        ot = term_info(c['out']); sup = False; contra = []; sup_k = []
        sibw = {t[0] for so in c['sib_outs'] for t in term_info(so)}
        dist = [t for t in ot if t[0] not in sibw and not re.match(r'\d', t[0])]      # 兄弟の行き先と共通の語（「身分」「者」）では、どの枝の行き先かを決められない：兄弟にない語で見る
        if c['sib_outs'] and dist: ot = dist
        for k in assign[i]:
            was = sup
            win = one = S[k][2]
            if not c['leaf'] and k + 1 < len(S) and S[k + 1][0] == S[k][0]: win += S[k + 1][2]
            st = [term_status(t, win) for t in ot]
            need = max(1, (len(ot) + 1) // 2)
            if c['leaf']:
                if st.count('same') >= need and 'opp' not in [s_ for s_, t in zip(st, ot) if t[3]]: sup = True
                elif any(s_ == 'opp' for s_, t in zip(st, ot) if t[3]): contra.append(('逆の形', S[k][2]))
            elif sum(1 for s_ in st if s_ != 'absent') >= need: sup = True
            if sup and not was: sup_k.append(k)
            elif sup and c['leaf'] and st.count('same') >= need: sup_k.append(k)
            if not sup:
                for so in c['sib_outs']:
                    mine = {t[0] for t in ot}; dt = [t for t in term_info(so) if t[0] not in mine and not re.match(r'\d', t[0])]
                    if end_neg(one) == end_neg(c['out']) != end_neg(so): continue      # 文の言い切りの肯定・否定が図の行き先と同じで、兄弟の行き先と逆：兄弟の行き先を述べる文ではない
                    if dt and sum(1 for t in dt if term_status(t, one) == 'same') >= max(1, -(-2 * len(dt) // 3)): contra.append((f'別の行き先「{so}」', S[k][2]))
        sibs = [j for j, (c2, _, et2, _) in enumerate(prep) if j != i and et2 and c2['q'] == c['q'] and c2['grp'] == c['grp'] and c2['out'] != c['out']]
        shared = lambda k: any(all(term_status(t, S[k][2]) == 'same' for t in prep[j][2]) for j in sibs)
        if sup and sup_k and all(shared(k) for k in sup_k):      # 根拠の文が兄弟の枝の条件も同時に述べている：どちらの枝の行き先か、機械では区別できない（入れ替えても所見が出ない）
            out.append(dict(c, status='要読み比べ', code='T08', msg=f"条件「{c['edge']}」→「{c['out']}」の根拠の文は、兄弟の枝の条件も同じ文で述べている。枝と行き先の組を入れ替えても機械では区別できないので、読み比べる：「{S[sup_k[0]][2][:50]}」"))
        elif sup: out.append(dict(c, status='所見なし', code='', msg=''))
        elif contra: out.append(dict(c, status='逆の疑い', code='T06', msg=f"条件「{(c['q'] + '→') if c['q'] else ''}{c['edge']}」の行き先は図では「{c['out']}」だが、本文のその条件の文は{contra[0][0]}：「{contra[0][1][:60]}」"))
        elif not assign[i]: out.append(dict(c, status='要読み比べ', code='T08', msg=f"条件「{c['edge']}」を述べる文が本文に見つからない（枝の語を本文の語に合わせるか、読み比べる）"))
        else: out.append(dict(c, status='要読み比べ', code='T08', msg=f"条件「{c['edge']}」の文に、行き先「{c['out']}」が書かれていない（読み比べる）"))
    return out


def check_order(r, B, S):
    """段・出来事の順：それぞれを最もよく述べる文の位置を比べる。前の段の文が、次の段の文より後ろにしかなければ T06"""
    loc = []
    for text, sub in r['items']:
        ts = [t for t in term_info(text) if not re.match(r'\d', t[0])]; A = arts_in(sub) + arts_in(text)
        if not ts: loc.append(None); continue
        best, bk = 0, None
        for k, (pi, si, sen) in enumerate(S):
            v = sum(1 if term_status(t, sen) == 'same' else (0.5 if fuzzy_has(t[0], sen) else 0) for t in ts) / len(ts)
            if A and any(sent_has_art(sen, a_, p_) for a_, p_ in A): v += 0.5
            if v > best: best, bk = v, k
        if bk is not None:                                   # 同じ文に二つの段があるときは、文の中の位置（述語の中心の語の出現）で比べる
            h = head_term(ts) or ts[-1]; sen = S[bk][2]
            ms = [m for m in re.finditer(h[1], sen) if not h[3] or occ_pol(sen, m) == h[2]]
            pos = ms[0].start() if ms else 0
        loc.append(((bk, pos), best) if bk is not None else None)
    bad = []
    for i in range(len(loc) - 1):
        a_, b_ = loc[i], loc[i + 1]
        if a_ and b_ and a_[1] >= 1 and b_[1] >= 1 and a_[0] > b_[0]: bad.append((i, a_, b_))
    if bad:
        i, a_, b_ = bad[0]
        return dict(r, status='要読み比べ' if r.get('soft') else '逆の疑い', code='T08' if r.get('soft') else 'T06', msg=f"{r['what']}{i + 1}「{r['items'][i][0]}」と{r['what']}{i + 2}「{r['items'][i + 1][0]}」の順が本文と逆：本文では「{S[b_[0][0]][2][:30]}」が先、「{S[a_[0][0]][2][:30]}」が後")
    if sum(1 for x in loc if x and x[1] >= 1) < 2: return dict(r, status='要読み比べ', code='T08', msg=f"{r['what']}の順を述べる文を、機械では十分に特定できない（読み比べる）")
    return dict(r, status='所見なし', code='', msg='')


def node_aliases(label, sub=''):
    """箱の名前の別名。二行目が「債務者の全ての債権者」のような名詞なら、その「の」の後ろの部分も別名にする"""
    al = aliases(label); s_ = norm(sub or '')
    if s_ and re.search(r'(者|人|会社|機関)$', s_) and not re.search(r'(する|しない|ない|できる)', s_):
        parts = s_.split('の')
        for k in range(1, len(parts) - 1):                  # 「の」を含む後ろの部分だけ（最後の一語「債権者」は別の箱の名前とぶつかる）
            tl = 'の'.join(parts[k:])
            if len(tl) >= 3 and tl not in al: al.append(tl)
        if s_ not in al: al.append(s_)
    return al


def check_group(r, B, S):
    """範囲の枠：枠の語（「判決の効力が及ぶ」）を述べる文で、本文が名前を挙げる者と、枠の中の者とを比べる"""
    allnodes = r['members'] + r['nonmembers']; names = [node_aliases(l, s_) for l, s_ in allnodes]
    key = [t for t in term_info(r['label']) if not re.match(r'\d', t[0]) and len(t[0]) >= 2 and t[0] not in REL_STOP and not any(t[0] in norm(l) for l, _ in allnodes)]
    if not key: return dict(r, status='照合できず', code='', msg='枠の語がない')
    need = min(2, len(key)); said = set(); nsent = 0
    for p in B.paras:
        for si in range(len(p['b']) - 1):
            lo, hi = p['b'][si], p['b'][si + 1]; sen = p['t'][lo:hi]
            if sum(1 for t in key if re.search(t[1], sen)) < need: continue
            nsent += 1; hits = [h for h in anchor_hits(p, names) if lo <= h[0] and h[1] <= hi]
            if not hits: continue
            for t in key:
                for m in re.finditer(t[1], sen):
                    if t[3] and occ_pol(sen, m) != t[2]: continue
                    said |= attribute(p, lo + m.start(), hits)
    mem = set(range(len(r['members']))); nm = {k for k in said if k not in mem}
    if not nsent: return dict(r, status='要読み比べ', code='T08', msg=f"枠の語「{r['label']}」を述べる文が本文にない（読み比べる）")
    if nm:
        miss = [r['members'][k][0] for k in sorted(mem - said)]
        return dict(r, status='逆の疑い', code='T06', msg=f"本文は「{'・'.join(allnodes[k][0] for k in sorted(nm))}」について「{r['label']}」と書くが、枠の外にある" + (f"。枠の中の「{'・'.join(miss)}」は、本文ではそう書かれていない" if miss else ''))
    if not said & mem: return dict(r, status='要読み比べ', code='T08', msg=f"枠の中の者を、本文の枠の語の文で特定できない（読み比べる）")
    return dict(r, status='所見なし', code='', msg='')


def check_span(r, B, S):
    """時間軸の帯・数直線の区間：帯の語を述べる文に、始まり・終わりの出来事が出てくるか"""
    ct = [t for t in term_info(r['claim']) if not re.match(r'\d', t[0])]
    if not ct or not r['ends']: return dict(r, status='照合できず', code='', msg='')
    ends = [term_info(e) for e in r['ends']]; oth = [(o, term_info(o)) for o in r['others']]
    hit = lambda ts, sen: ts and sum(1 for t in ts if re.search(t[1], sen)) >= max(1, (len(ts) + 1) // 2)
    cs = [x for x in S if hit(ct, x[2])]
    if any(hit(e, x[2]) for e in ends for x in cs): return dict(r, status='所見なし', code='', msg='')
    wrong = [o for o, ts in oth for x in cs if hit(ts, x[2])]
    if wrong: return dict(r, status='逆の疑い', code='T06', msg=f"「{r['claim']}」を述べる本文の文は「{wrong[0]}」と結びつき、図の始まり・終わり（{'・'.join(r['ends'])}）とは結びつかない")
    return dict(r, status='要読み比べ', code='T08', msg=f"「{r['claim']}」の始まり・終わりを本文で特定できない（読み比べる）")


def check_nest(r, B, S):
    """包含図：「内 は 外 の一種／に含まれる」の向き。逆（「外 は 内 に含まれる」）なら T06"""
    O, I = aliases(r['outer']), aliases(r['inner'])
    for _, _, sen in S:
        for a_ in O:
            for b_ in I:
                if re.search(re.escape(a_) + r'(は|が)[^。]{0,20}' + re.escape(b_) + r'(の一種|の一つ|に含まれ|に属)', sen): return dict(r, status='逆の疑い', code='T06', msg=f"本文は「{r['outer']}」が「{r['inner']}」に含まれると読めるが、図は逆：「{sen[:50]}」")
                if re.search(re.escape(b_) + r'(は|が|も)[^。]{0,20}' + re.escape(a_) + r'(の一種|の一つ|に含まれ|に属)', sen) or re.search(re.escape(a_) + r'(のうち|の中で|には)[^。]{0,20}' + re.escape(b_), sen): return dict(r, status='所見なし', code='', msg='')
    return dict(r, status='要読み比べ', code='T08', msg=f"「{r['inner']}」が「{r['outer']}」に含まれることを述べる文を、機械では特定できない（読み比べる）")


def pair_check(r, ti, B, names):
    """名詞＋動詞の組（「違法性を阻却する」）：本文で、見出しについて述べた文の同じ節に二つが出るとき、動詞の肯定・否定が図と同じか。逆だけなら T06"""
    s_ = norm(r['claim']); bad = []
    pos = []
    for t in ti:
        m = re.search(t[1], s_)
        if m: pos.append((m.start(), m.end(), t))
    pos.sort()
    for (a0, a1, n), (b0, b1, v) in zip(pos, pos[1:]):
        if n[3] or not v[3] or not re.fullmatch(r'(を|が|は|も|に)?', s_[a1:b0]): continue
        vneg = polarity(s_[b1:]) == 'neg'                      # 動詞のすぐ後の形だけで比べる（節の終わりの「…しない」は数えない）
        if not polarity(s_[b1:]): continue
        same = opp = False
        for p in B.paras:
            hits = None
            for m in re.finditer(v[1], p['t']):
                if hits is None: hits = anchor_hits(p, names)
                cl0 = max(p['t'].rfind('、', 0, m.start()), p['t'].rfind('。', 0, m.start())) + 1
                if not re.search(n[1], p['t'][cl0:m.start()]): continue
                pl = polarity(after(p['t'], m.end()))
                if not pl: continue
                if 0 not in attribute(p, m.start(), hits): continue
                if (pl == 'neg') == vneg: same = True
                else: opp = True
        if opp and not same: bad.append(f"「{n[0]}…{v[0]}」は、本文では「{r['anchor']}」について{'肯定' if vneg else '否定'}の形（図と逆）で書かれている")
    return bad


def check_relations(rels, body, table_rows=()):
    B = Body(body, table_rows); S = sentences(B); out = []
    conds = [r for r in rels if r['kind'] == 'cond']
    if conds: out += check_conds(conds, B, S)
    for r in rels:
        if r['kind'] == 'cond': continue
        if r['kind'] == 'art': out.append(check_art(r, B, S)); continue
        if r['kind'] == 'order': out.append(check_order(r, B, S)); continue
        if r['kind'] == 'group': out.append(check_group(r, B, S)); continue
        if r['kind'] == 'span': out.append(check_span(r, B, S)); continue
        if r['kind'] == 'nest': out.append(check_nest(r, B, S)); continue
        if r['kind'] == 'attr':
            names = [aliases(r['anchor'])] + [aliases(x) for x in r['siblings']]
            ti = term_info(r['claim'], exclude=[r['anchor']] + r['siblings'])        # 他の見出し・箱の名前（「取締役」）は述語でなく相手なので除く
            terms = [t[:3] for t in ti]
            if terms and all(re.match(r'\d', w) for w, _, _ in terms):             # 条文番号だけの二行目（根の「709条」）は、帰属ではなく条文の照合（art）で見る
                out.append(dict(r, status='照合できず', code='', msg='条文番号だけ（条文の照合で見る）')); continue
            if not terms: out.append(dict(r, status='照合できず', code='', msg='述語の語が見出しの名前と同じ')); continue
            found_anchor = any(occurrences(p['t'], a) for p in B.paras for a in names[0])
            if not found_anchor and r.get('rowcheck'): out.append(dict(r, status='照合できず', code='', msg='段の見出しが本文にない')); continue
            if not found_anchor:
                out.append(dict(r, status='要読み比べ', code='T08', msg=f"「{r['anchor']}」という語が本文にないので、組合せを機械で確かめられない")); continue
            ti = [t for t in ti if not re.match(r'\d', t[0])]; terms = [t[:3] for t in ti]        # 条文番号は条文の照合（art）で見る
            if r.get('rowcheck'):                                  # 段の帰属は述語（動詞の形の語）だけで見る（当事者の名前などは段をまたいで出る）
                ti = [t for t in ti if t[3]]; terms = [t[:3] for t in ti]
                if not ti: out.append(dict(r, status='照合できず', code='', msg='述語の語がない')); continue
            bad, okc, unk, near = [], 0, [], 0
            cpass = bool(re.search(r'(され|られ|受け)', norm(r['claim'])))
            for w, rx, neg, expl in ti:
                mine, others, opp_mine, seen = False, set(), False, 0
                for p in B.paras:
                    hits = None
                    for m in re.finditer(rx, p['t']):
                        if hits is None: hits = anchor_hits(p, names)
                        if any(h[0] <= m.start() < h[1] for h in hits): continue           # 名前の中の語（「監査役」の「監査」）は数えない
                        if not cpass and re.match(r'(され|られ|を受け)', after(p['t'], m.end())): continue      # 本文が受け身（「送達される」）：文の主語は行為者ではないので、帰属に数えない
                        seen += 1; who = attribute(p, m.start(), hits); weak = attribute.weak; po = polarity(p['t'][m.end():])
                        cn = clause_neg(p['t'][m.end():]); eo = po == 'neg' or cn          # 本文のその語が否定の形で言われているか
                        if r.get('nopol'): same, opp, same_o = True, False, True      # 見出しが否定の段：肯定・否定は見出しに掛かるので、帰属だけを見る
                        elif not expl: same, opp, same_o = True, False, eo == neg   # 名詞として出ている語：自分への帰属は形を問わず、他への帰属は節の形が同じときだけ
                        else: same = eo == neg; opp = (eo != neg) and (po in ('neg', 'pos') or cn); same_o = same
                        if 0 in who:
                            if same: mine = True
                            elif opp: opp_mine = True
                        elif who and same_o and not (weak and r.get('actor')): others |= who      # 行為者（当事者・帯）の持ち越しは、文に別の主題があれば取り違えの根拠にしない
                if mine: okc += 1; continue
                shared = bool(r['sib_claims']) and all(re.search(rx, norm(c)) for c in r['sib_claims'])      # どの相手にも共通の語は、取り違えの判定に使わない
                if opp_mine: bad.append(f"「{w}」は、本文では「{r['anchor']}」について{'肯定' if neg else '否定'}の形（図と逆）で書かれている")
                elif others and not shared: bad.append(f"「{w}」は、本文では「{'・'.join(r['siblings'][k - 1] for k in sorted(others))}」について書かれ、「{r['anchor']}」については書かれていない")
                elif seen: unk.append(w)
                else: near += 1
            cooc = any(any(occurrences(p['t'], a) for a in names[0]) and sum(1 for w, rx, neg in terms if re.search(rx, p['t'])) * 2 >= len(terms) for p in B.paras)
            if not bad and not r.get('nopol'): bad = pair_check(r, ti, B, names)
            if r.get('rowcheck'):                              # 段の帰属は、別の段の話題として書かれているときだけ言う
                out.append(dict(r, status='逆の疑い', code='T06', msg='（段の取り違え）' + '；'.join(bad)) if bad and okc == 0 else dict(r, status='所見なし' if okc else '照合できず', code='', msg='')); continue
            if bad: out.append(dict(r, status='逆の疑い', code='T06', msg='；'.join(bad)))
            elif not cooc and near + len(unk) == len(terms): out.append(dict(r, status='組合せなし', code='T07', msg=f"「{r['anchor']}」と「{r['claim']}」の組合せを述べる段落が本文にない"))
            elif unk and not okc: out.append(dict(r, status='要読み比べ', code='T08', msg=f"「{'・'.join(unk)}」が「{r['anchor']}」について言われているかを機械で決められない"))
            else: out.append(dict(r, status='所見なし', code='', msg=''))
        else:
            if r.get('stop'):
                out.append(dict(r, status='照合できず', code='', msg='止め線（及ばない・できない）は、機械では照合しない。「〔元〕は〔先〕に〔語〕できない」と読み上げて本文と比べる')); continue
            F, T = aliases(r['frm']), aliases(r['to']); terms = claim_terms(strip_par(norm(r['claim'])), exclude=[r['frm'], r['to']]) or claim_terms(r['claim'], exclude=[r['frm'], r['to']])
            if not terms: out.append(dict(r, status='要読み比べ', code='T08', msg=f"矢印の語「{r['claim']}」が端点の名前と同じで、機械では照合できない（読み比べる）")); continue
            sup, con, loose = [], [], 0
            for p in B.paras:
                tx = p['t']
                fo = [(i, i + len(a)) for a in F for i in occurrences(tx, a)]; to = [(i, i + len(a)) for a in T for i in occurrences(tx, a)]
                if fo and to and sum(1 for w, rx, neg in terms if re.search(rx, tx)) * 2 >= len(terms): loose += 1
                if not (fo and to) or not r['directed']: continue
                for si in range(len(p['b']) - 1):
                    lo, hi = p['b'][si], p['b'][si + 1]; sen = tx[lo:hi]
                    f2 = [x for x in fo if lo <= x[0] < hi]; t2 = [x for x in to if lo <= x[0] < hi]
                    if not f2 or not t2: continue
                    spans = f2 + t2
                    tm = [(m.start() + lo, w, neg, polarity(tx[m.end() + lo:]) == 'neg' or clause_neg(tx[m.end() + lo:])) for w, rx, neg in terms for m in re.finditer(rx, sen) if not any(a <= m.start() + lo < b for a, b in spans)]
                    if not tm or len(set(x[1] for x in tm)) * 2 < len(terms): continue
                    first = min(x[0] for x in tm)
                    if re.search(r'(され|られ)(る|た|て|ない)', tx[first:hi]): continue          # 述語が受け身の文は機械では決めない（前置きの「取り消されたときは」は見る）
                    # 「主語 は … 相手 に（対し）、述語」の形だけを見る：相手の語の直後（助詞を除く）から述語の語までが近いこと
                    def tight(obj):
                        m = re.match(r'(に対して、?|に対し、?|に、?|へ、?|を、?)', after(tx, obj[1]))
                        if not m: return False
                        st = tx.find(m.group(0), obj[1]) + len(m.group(0)); return 0 <= first - st <= 6 and not re.search('[、。]', tx[st:first])
                    pol_same = all(n1 == n2 for _, w, n1, n2 in tm if _ >= first)
                    fwd = any(edge_role(tx, a[1]) == 'ga' and a[1] <= first for a in f2) and any(tight(b) for b in t2)
                    rev = any(edge_role(tx, b[1]) == 'ga' and b[1] <= first for b in t2) and any(tight(a) for a in f2)
                    if fwd and pol_same: sup.append(sen)
                    elif rev and pol_same: con.append(('向きが逆', sen))
                    elif fwd and not pol_same and not re.search(r'(ときは|ときに|場合は|場合には|限り|ときでも)', tx[lo:first]): con.append(('肯定・否定が逆', sen))      # 条件つきの否定（「軽過失にとどまるときは、…できない」）は例外の場面で、矢印の原則と逆とはいえない
            if not sup and not con:                                # 肯定・否定：相手の名前と述語の中心の語が同じ文に出るとき、形がいつも逆なら T06
                ti_e = term_info(strip_par(norm(r['claim'])), exclude=[r['frm'], r['to']]); h = head_term(ti_e) or (ti_e[-1] if ti_e else None)
                if h and h[3]:
                    sm = op = False; osen = ''
                    for _, _, sen in S:
                        if not any(occurrences(sen, a) for a in T): continue
                        for m in re.finditer(h[1], sen):
                            if re.search(r'(ときは|ときに|場合は|場合には|場合に|限り|ときでも|ても)', sen[:m.start()]): continue      # 条件つきの文（「軽過失にとどまるときは、…求償できない」）は例外の場面なので、原則の肯定・否定と比べない
                            if not (polarity(after(sen, m.end())) or clause_neg(sen[m.end():])): continue
                            if occ_pol(sen, m) == h[2]: sm = True
                            else: op = True; osen = osen or sen
                    if op and not sm: con.append(('肯定・否定が逆', osen))
            subj = None
            if not sup and not con and r['directed']:                 # 主語の帰属：述語の語が、本文で誰について言われているか（相手が同じ文にない本文でも向きを見る）
                names = [F, T] + [aliases(x) for x in r.get('names', [])]; sf = st_ = False
                for p in B.paras:
                    hits = None
                    for w, rx, neg in terms:
                        if re.match(r'\d', w): continue
                        for m in re.finditer(rx, p['t']):
                            if hits is None: hits = anchor_hits(p, names)
                            if any(h[0] <= m.start() < h[1] for h in hits): continue
                            if occ_pol(p['t'], m) != neg or not polarity(after(p['t'], m.end())): continue      # 動詞として出ている語（「監査する」）だけ
                            si = Body.sent(p, m.start()); lo, hi = p['b'][si], p['b'][si + 1]
                            hs = [h for h in hits if lo <= h[0] and h[1] <= hi and edge_role(p['t'], h[1]) == 'ga']      # 主語（は・が・も）の名前だけ
                            if not hs: continue
                            who = attribute(p, m.start(), hs)
                            if 0 in who: sf = True
                            elif 1 in who: st_ = True
                subj = 'frm' if sf else ('to' if st_ else None)
            if sup: out.append(dict(r, status='所見なし', code='', msg=''))
            elif con: out.append(dict(r, status='逆の疑い', code='T06', msg=f"矢印は「{r['frm']}が{r['to']}に{r['claim']}」と読めるが、本文は{con[0][0]}：「{con[0][1][:60]}」"))
            elif subj == 'to': out.append(dict(r, status='逆の疑い', code='T06', msg=f"矢印は「{r['frm']}が{r['to']}に{r['claim']}」と読めるが、本文で「{r['claim']}」の主語は「{r['to']}」で、「{r['frm']}」が主語の文はない（向きが逆の疑い）"))
            elif subj == 'frm': out.append(dict(r, status='要読み比べ', code='T08', msg=f"「{r['frm']}が{r['claim']}」は本文と合うが、相手「{r['to']}」を同じ文で確かめられない（読み比べる）"))
            elif not loose: out.append(dict(r, status='組合せなし', code='T07', msg=f"「{r['frm']}」「{r['to']}」「{r['claim']}」を合わせて述べる段落が本文にない"))
            elif r['directed']: out.append(dict(r, status='要読み比べ', code='T08', msg=f"「{r['frm']}が{r['to']}に{r['claim']}」の向きを機械で決められない（声に出して本文と読み比べる）"))
            else: out.append(dict(r, status='所見なし', code='', msg=''))
    return out


BLIND_ALL = ['要件と効果の取り違え（要件の語と効果の語の入替え）', '本文にある別の条文・別の項への付け替え', '段の見出し（問い）の意味の取り違え']
BLIND = {      # 機械で見ない（見ても止まらない）種類。毎回出し、点検役が読み上げの表で見る（reviewer-prompts/figure-check.md）
    'parties': ['範囲の枠に余分な要素・足りない要素', '止め線（及ばない・できない）の有無', '複数の矢印のうち一本だけの逆向き'],
    'chain': ['矢印の順と向き', '止め線の有無'],
    'flow': ['小枝がどの段に属するか（小枝の帰属）', '出口が原則か例外か、成功か失敗か'],
    'tree': ['兄弟の枝と行き先の組の入替え（一つの段落が複数の枝を述べる本文では区別できない）'],
    'timeline': ['帯の語（「…の前は」「…の後は」）と始まり・終わりの出来事の組', '時点の前後の入替え'],
    'numberline': ['区間の両端と語の組', '目盛りの前後'],
    'swimlane': ['受け身で書いた段の帯（主体）', '段の順（本文が条文の順に書くとき）'],
    'nest': ['内側の箱のすり替え（別の語の箱）', '内と外の関係のうち本文が書かない組'],
    'compare': ['セルの段の帰属', '列の入替え'], 'matrix': ['セルの行の帰属'], 'quadrant': ['軸の値の組とセルの対応'],
}


def read_dismiss(path):
    """退ける所見の表：[{code, where, reason}]。Markdown の表は「記号｜場所（の一部）｜理由」。理由が空なら退けない"""
    rows = []
    if path.endswith('.json'):
        for r in json.load(open(path, encoding='utf-8')): rows.append((r.get('code', ''), r.get('where', ''), r.get('reason', '')))
    else:
        for ln in open(path, encoding='utf-8').read().splitlines():
            if not ln.strip().startswith('|'): continue
            c = [x.strip() for x in ln.strip().strip('|').split('|')]
            if len(c) < 3 or set(''.join(c)) <= set('-: ') or c[0] in ('記号', 'code'): continue
            rows.append(tuple(c[:3]))
    return [r for r in rows if r[0]]


def main():
    ap = argparse.ArgumentParser(description='図と本文を突き合わせ、点検役が読む所見を出す（一致の保証ではない）')
    ap.add_argument('figs', nargs='+', help='spec.json または fig.svg')
    ap.add_argument('--body', required=True, help='本文（.md / .txt）')
    ap.add_argument('--relations', help='関係の表（.md の表か .json）。本文を読んで先に作っておき、図の矢印と突き合わせる')
    ap.add_argument('--dismiss', help='退ける所見の表（記号｜場所の一部｜理由）。偽陽性と読んだ所見を、図を変えずに理由つきで退ける')
    ap.add_argument('--fig', type=int, help='図の番号（本文での参照も調べる）')
    ap.add_argument('--out', help='結果を JSON で保存')
    ap.add_argument('--strict', action='store_true')
    ap.add_argument('--quiet', action='store_true')
    a = ap.parse_args()
    body = open(a.body, encoding='utf-8').read()
    table = read_relations_table(a.relations) if a.relations else []
    dis = read_dismiss(a.dismiss) if a.dismiss else []
    allres, bad = {}, 0
    for f in a.figs:
        spec = None if f.endswith('.svg') else json.load(open(f, encoding='utf-8'))
        labels = labels_from_svg(f) if spec is None else labels_from_spec(spec)
        res, flags = check(labels, body + '\n' + '\n'.join(table), a.fig)
        rel = check_relations(relations_from_spec(spec), body, table) if spec is not None else []
        for x in rel:
            if x['code']: flags.append({'code': x['code'], 'label': x['where'], 'msg': x['msg']})
        for r in res:
            if r['status'] == 'なし': flags.append({'code': 'なし', 'label': r['label'], 'msg': '本文に語が見つからない' + (f"（{'・'.join(r['missing'])}）" if r['missing'] else '')})
        dismissed, noreason = [], []
        for x in flags:                                   # 退ける所見：記号が同じで、場所（ラベル）に表の語を含むもの。理由が空なら退けない
            for code, where, reason in dis:
                if code == x['code'] and where and where in x['label']:
                    if reason: x['dismissed'] = reason; dismissed.append(x)
                    else: noreason.append(x)
                    break
        n = len(res); ok = sum(r['status'] in ('語あり', '語あり（語ごと）') for r in res); part = sum(r['status'] == '一部の語' for r in res)
        none = [r for r in res if r['status'] == 'なし']
        rate = (ok + part * 0.5) / n if n else 1.0
        rc = {k: sum(1 for x in rel if x['status'] == k) for k in ('所見なし', '逆の疑い', '組合せなし', '要読み比べ', '照合できず')}
        hardf = [x for x in flags if x['code'] in ('なし', 'T01', 'T06', 'T07') and not x.get('dismissed')]
        unchecked = [x for x in rel if x['status'] in ('要読み比べ', '照合できず')]
        blind = BLIND_ALL + BLIND.get((spec or {}).get('type'), []) + (['関係のすべて（SVG からは関係を取り出せない。仕様で照合する）'] if spec is None else [])
        verdict = '所見なし（機械で見られる範囲で）' if not hardf else f'要確認（所見 {len(hardf)} 件）'
        allres[f] = {'labels': n, 'match': ok, 'partial': part, 'none': len(none), 'rate': round(rate, 3), 'rows': res, 'flags': flags,
                     'verdict': verdict, 'findings': len(hardf), 'dismissed': [{'code': x['code'], 'where': x['label'], 'reason': x['dismissed']} for x in dismissed],
                     'unchecked_elements': [{'where': x['where'], 'status': x['status'], 'msg': x['msg']} for x in unchecked], 'not_checked_by_machine': blind,
                     'note': 'trace は所見を出す補助で、一致の保証ではない。所見なしでも、照合できなかった要素と機械で見ない種類は、点検役が読み上げの表で本文と読み比べる。',
                     'relations': {'total': len(rel), 'no_finding': rc['所見なし'], 'wrong': rc['逆の疑い'], 'absent': rc['組合せなし'], 'manual': rc['要読み比べ'], 'unchecked': rc['照合できず'],
                                   'rows': [{k: x[k] for k in ('kind', 'where', 'claim', 'status', 'code', 'msg')} for x in rel]}}
        bad += len(hardf)
        print(f'{f}: ラベル {n}（本文に語あり {ok}・一部の語 {part}・なし {len(none)}）　'
              + (f"関係 {len(rel)}（所見なし {rc['所見なし']}・逆の疑い {rc['逆の疑い']}・組合せなし {rc['組合せなし']}・要読み比べ {rc['要読み比べ']}・照合できず {rc['照合できず']}）　" if spec is not None else '関係 照合できず（SVG からは関係を取り出せない。仕様で照合する）　') + verdict)
        if not a.quiet:
            for r in res:
                if r['status'] == 'なし':
                    x = next((y for y in flags if y['code'] == 'なし' and y['label'] == r['label']), {})
                    print(f"  なし    ：「{r['label']}」" + ('（注記）' if r['note'] else '') + (f"　本文にない語：{'・'.join(r['missing'])}" if r['missing'] else '') + (f"　［退けた：{x['dismissed']}］" if x.get('dismissed') else ''))
            for r in res:
                if r['status'] == '一部の語':
                    print(f"  一部の語：「{r['label']}」　本文にない語：{'・'.join(r['missing'])}")
            for x in flags:
                if x['code'] == 'なし': continue
                print(f"  {x['code']}：{x['msg']}　← {x['label'] if x['code'] in ('T06', 'T07', 'T08') else '「' + x['label'] + '」'}" + (f"　［退けた：{x['dismissed']}］" if x.get('dismissed') else ''))
            for x in noreason:
                print(f"  注意：退ける表に理由が書かれていないので、所見を退けない（{x['code']}：{x['label'][:40]}）")
        print(f"  照合できなかった要素 {len(unchecked)} 件" + ('：' + '；'.join(f"{x['where']}（{x['status']}）" for x in unchecked) if unchecked and not a.quiet else ('（一覧は --out の unchecked_elements）' if unchecked else '')))
        print(f"  機械で見ない種類：{'、'.join(blind)}")
        print('  ※ trace は所見を出す補助で、一致の保証ではない。上の二つと全部の関係を、点検役が読み上げの表で本文と読み比べる（reviewer-prompts/figure-check.md）。所見を消すために本文や図の語を削らない')
    if a.out:
        json.dump(allres, open(a.out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    sys.exit(1 if (a.strict and bad) else 0)


if __name__ == '__main__':
    main()
