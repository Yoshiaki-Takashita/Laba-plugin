#!/usr/bin/env python3
"""laba-book の状態と検査（標準ライブラリだけ・ネットに接続しない。gate だけ node で textbook_check.js を呼ぶ）。

使い方:
  book_state.py init    book.json --seed "<題>" [--level ug] [--kind word|field|sourced] [--lang ja]
  book_state.py next    book.json                      # 次に作る章と、済んだ章の要点だけを出す
  book_state.py chapter book.json --no N [--title T] [--status planned|writing|done] [--summary "a;b;c"] [--outline P] [--text P]
  book_state.py check   book.json                      # book.json の形の検査
  book_state.py outline outline.json                   # 構成の検査（見出しの字数・項の数・用語の重複・図の型）
  book_state.py gate    節.md [--level ug] [--json]    # 本文の数の検査（targets.json の目標。NG が 0 なら終了コード 0）。[R01] の印は外して測る
  book_state.py map     map.json [--ledger ledger.tsv] # 概念の地図（P1・資料なしの題）の検査
  book_state.py ledger  ledger.tsv [--sources work/sources] [--json]  # 出典の台帳（P3）の検査：V0・重複・URL・確かめ方の印・種類・事典のまとめ・原文の写し・未確認の数
  book_state.py claims  節.md --ledger ledger.tsv [--json] [--strip 出力.md]  # 主張の印 [R01] と台帳の突き合わせ・ID の無い主張の候補
  book_state.py facts   work/ch1/facts.tsv --ledger ledger.tsv [--sources work/sources] [--section s1] [--json]
                                                       # P3b 事実の表：台帳の ID・抜き書きが原文の写しにあるか・節ごとの深さ（事実・出典・種類・寄り）
  book_state.py figs    work/ch1 [--json]              # P5 図：構成の図の候補 → figs.json の記述・本文の :::fig id=・描いた SVG の検査（図にした数／候補の数）
  book_state.py page    work/ch1 --out ch1.gnoto [--format fam-f1] [--variant b1] [--plan plan.json]
                                                       # P6 紙面：章の本文（chapter.md か s*.md）＋figs.json → GNOTO の紙面ノート（v:2 読む順の塊）と検査
数の元：reportkiller/references/textbook-prose.md §1 → scripts/targets.json（写し）。"""
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))  # skills/
CHECKER = os.path.join(ROOT, "reportkiller", "scripts", "textbook_check.js")
FIG_KINDS = {"flow", "tree", "table", "matrix", "timeline", "concept", "relation", "compare", "chart", "scale"}  # laba-textbook figure.schema.json の kind（L3 で 10 型）
FIG_WANT = {"scene", "venn", "family", "ledger"}  # まだ描けない案の型（references/figure-judgment.md）
FIG_VARIANT = {"brace": "tree の treeStyle:\"brace\"", "bracket": "tree の treeStyle:\"bracket\""}  # 型でなく欄で描ける変種
TEXTBOOK_SCRIPTS = os.path.join(ROOT, "laba-textbook", "scripts")
MARK_RE = re.compile(r"\[((?:[RU]\d{1,3}[a-z]?)(?:\s*[,，、]\s*[RU]\d{1,3}[a-z]?)*)\]")
LEVELS = {"hs", "ug", "grad"}
KINDS = {"word", "field", "sourced"}
STATUS = {"planned", "writing", "done"}


def load_targets():
    with open(os.path.join(HERE, "targets.json"), encoding="utf-8") as f:
        return json.load(f)


def clen(s):
    return len(re.sub(r"\s", "", s))


def opt(args, name, default=None):
    if name in args:
        i = args.index(name)
        if i + 1 < len(args):
            return args[i + 1]
    return default


def read_json(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def write_json(p, d):
    with open(p, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
        f.write("\n")


# ---------- book.json ----------
def new_book(seed, level="ug", kind="word", lang="ja"):
    return {"v": 1, "topic": {"seed": seed, "kind": kind, "level": level, "lang": lang},
            "map": None, "chapters": [], "glossary": "glossary.json", "ledger": "ledger.tsv",
            "next": {"chapter": 1, "why": "最初の章"}}


def check_book(b):
    errs = []
    if not isinstance(b, dict) or b.get("v") != 1:
        return ["v が 1 でない"]
    t = b.get("topic") or {}
    if not t.get("seed"):
        errs.append("topic.seed が空")
    if t.get("level") not in LEVELS:
        errs.append("topic.level は hs・ug・grad のどれか")
    if t.get("kind") not in KINDS:
        errs.append("topic.kind は word・field・sourced のどれか")
    nos = []
    for c in b.get("chapters", []):
        if not isinstance(c.get("no"), int) or c["no"] < 1:
            errs.append("章の no は 1 以上の整数")
            continue
        nos.append(c["no"])
        if c.get("status") not in STATUS:
            errs.append(f"第 {c['no']} 章の status が不正")
        if c.get("status") == "done" and not c.get("summary"):
            errs.append(f"第 {c['no']} 章は done だが要点（summary）が無い（次の回が本文を読み直すことになる）")
        if len(c.get("summary", [])) > 5:
            errs.append(f"第 {c['no']} 章の要点が 6 項目以上（3〜5 にする）")
    if len(nos) != len(set(nos)):
        errs.append("章の no が重複")
    nx = b.get("next") or {}
    if not isinstance(nx.get("chapter"), int):
        errs.append("next.chapter が無い")
    return errs


def set_chapter(b, no, title=None, status=None, summary=None, outline=None, text=None):
    ch = next((c for c in b["chapters"] if c["no"] == no), None)
    if ch is None:
        ch = {"no": no, "title": "", "status": "planned"}
        b["chapters"].append(ch)
        b["chapters"].sort(key=lambda c: c["no"])
    if title is not None:
        ch["title"] = title
    if status is not None:
        ch["status"] = status
    if summary is not None:
        ch["summary"] = [s.strip() for s in summary.split(";") if s.strip()]
    if outline is not None:
        ch["outline"] = outline
    if text is not None:
        ch["text"] = text
    done = [c["no"] for c in b["chapters"] if c.get("status") == "done"]
    if status == "done":
        b["next"] = {"chapter": (max(done) + 1) if done else 1, "why": "前の章の続き（範囲の地図があればその前提の向き）"}
    return ch


def next_info(b):
    return {"next": b.get("next"), "topic": b.get("topic"),
            "done": [{"no": c["no"], "title": c.get("title", ""), "summary": c.get("summary", [])}
                     for c in b.get("chapters", []) if c.get("status") == "done"],
            "glossary": b.get("glossary"), "ledger": b.get("ledger")}


# ---------- outline.json ----------
def check_outline(o, targets=None):
    t = (targets or load_targets())["common"]
    errs, warns = [], []
    secs = o.get("sections") or []
    if not secs:
        errs.append("sections が空")
    seen_terms = {}
    ids = set()
    for s in secs:
        sid = s.get("id", "?")
        if sid in ids:
            errs.append(f"{sid}: id が重複")
        ids.add(sid)
        title = s.get("title", "")
        if not title:
            errs.append(f"{sid}: 節の題が空")
        elif clen(title) > t["h1Max"]:
            errs.append(f"{sid}: 節の題 {clen(title)} 字（{t['h1Max']} 字まで。8 字前後が目安）")
        if re.search(r"(について|とは|[ぁ-ん])$", title):
            errs.append(f"{sid}: 節の題が名詞で止まっていない「{title}」")
        items = s.get("items") or []
        if not 2 <= len(items) <= 4:
            warns.append(f"{sid}: 項が {len(items)} 個（2〜4 が目安）")
        for it in items:
            it_t = it.get("title", "")
            if clen(it_t) > t["h2Max"]:
                errs.append(f"{sid}: 項の題「{it_t}」{clen(it_t)} 字（{t['h2Max']} 字まで）")
            if re.search(r"(について|とは|[ぁ-ん])$", it_t):
                errs.append(f"{sid}: 項の題が名詞で止まっていない「{it_t}」")
        for term in s.get("terms") or []:
            if term in seen_terms:
                errs.append(f"{sid}: 用語「{term}」は {seen_terms[term]} でも定義している（1 つの節にだけ）")
            seen_terms[term] = sid
            if clen(term) > t["boldLenMax"]:
                warns.append(f"{sid}: 用語「{term}」が {clen(term)} 字（太字は 9 字以下）")
        fig = s.get("fig")
        if fig is not None and fig.get("kind") is not None and fig.get("kind") not in FIG_KINDS:
            errs.append(f"{sid}: 図の型「{fig.get('kind')}」は使えない（{'・'.join(sorted(FIG_KINDS))}）")
        if fig is not None and fig.get("want") is not None:
            w = fig["want"]
            if w in FIG_KINDS:
                warns.append(f"{sid}: want「{w}」はもう描ける（kind=\"{w}\" にする）")
            elif w in FIG_VARIANT:
                warns.append(f"{sid}: want「{w}」は {FIG_VARIANT[w]} で描ける")
            elif w not in FIG_WANT:
                errs.append(f"{sid}: want「{w}」は案の型ではない（{'・'.join(sorted(FIG_WANT))}）")
            else:
                warns.append(f"{sid}: 当たった型 {w} はまだ描けない（kind={fig.get('kind')} で代える。figure-judgment.md）")
        if fig is not None and fig.get("id") is not None and not re.match(r"^[a-z][a-z0-9_]{0,15}$", str(fig["id"])):
            errs.append(f"{sid}: 図の id「{fig['id']}」は英小文字で始まる 16 字以内")
        if fig is not None and fig.get("kind") is None and fig.get("want") is None and not fig.get("dropped"):
            errs.append(f"{sid}: fig に kind も want も無い（図にしないなら null）")
    return errs, warns


# ---------- gate（本文の数） ----------
def parse_md(md):
    """役割の印つき Markdown → 見出し・段落・役割ブロック・並び。"""
    heads, paras, roles, seq = [], [], [], []
    cur = None
    buf = []

    def flush():
        if buf:
            paras.append("".join(x.strip() for x in buf))
            seq.append("P")
            buf.clear()
    for ln in md.replace("\r", "").split("\n"):
        s = ln.strip()
        if cur is not None:
            if s == ":::":
                roles.append(cur)
                cur = None
            else:
                cur["lines"].append(s)
            continue
        m = re.match(r"^:::(\w+)(.*)$", s)
        if m:
            flush()
            cur = {"role": m.group(1), "args": m.group(2).strip(), "lines": []}
            seq.append(m.group(1))
            continue
        hm = re.match(r"^(#{1,4})\s+(.*)$", s)
        if hm:
            flush()
            heads.append((len(hm.group(1)), hm.group(2).strip()))
            seq.append("H")
            continue
        if not s:
            flush()
            continue
        buf.append(s)
    flush()
    return heads, paras, roles, seq


def sentences(text):
    plain = text.replace("**", "").replace("．", "。")
    return [x.strip() for x in re.split(r"(?<=。)", plain) if clen(x) > 1]


NOTE_IN_BODY = re.compile(r"(資料|出典|文献|台帳)(に|で|から|には|では)[^。]{0,12}(無|な[いく]|示され|書かれ|記され|確かめ|確認)|不明である|不明だ|不明とする|は不明|確認できなかった|確かめられなかった")
CLAUSE_COMMA = re.compile(r"[ぁ-ん]、")


def chain_sentences(paras, min_chars=100, commas=5):
    """読点で節をつなぐだけの長い文：min_chars 字以上で、かなの直後の読点（節の切れ目の読点）が commas 以上。
    「A・B・C」の並べ（中黒）や漢字の名詞の後の読点は数えない。"""
    out = []
    for p in paras:
        for s in sentences(strip_marks(p)):
            if clen(s) >= min_chars and len(CLAUSE_COMMA.findall(s)) >= commas:
                out.append(s)
    return out


def run_checker(path):
    r = subprocess.run(["node", CHECKER, "--json", path], capture_output=True, text=True)
    try:
        return json.loads(r.stdout)
    except ValueError:
        raise SystemExit("textbook_check.js が動かない：" + (r.stderr or r.stdout)[:300])


def gate(path, level="ug", targets=None):
    T = targets or load_targets()
    lv, c = T["levels"][level], T["common"]
    soft = set(T.get("soft", []))
    with open(path, encoding="utf-8") as f:
        md = f.read()
    if MARK_RE.search(md):  # 主張の印 [R01] は紙面に出ないので、外してから測る
        md = strip_marks(md)
        import tempfile
        with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8") as tf:
            tf.write(md)
        try:
            j = run_checker(tf.name)
        finally:
            os.unlink(tf.name)
    else:
        j = run_checker(path)
    M = j["測定"]
    heads, paras, roles, seq = parse_md(md)
    res = []

    def chk(key, ok, value, goal, hint=""):
        res.append({"id": key, "ok": bool(ok), "level": "soft" if key in soft else "hard", "value": value, "goal": goal, "hint": hint})
    sl = M["文の長さ"]
    if M["文数"] >= 8:
        lo, hi = lv["sentMedian"]
        chk("sentMedian", lo <= (sl["中央値"] or 0) <= hi, sl["中央値"], f"{lo}〜{hi}",
            "短い文を関係の語（〜ので・〜場合には・〜のに対し）でつなぐ" if (sl["中央値"] or 0) < lo else "長い文を 2 つに分ける")
        chk("sentP90Max", (sl["p90"] or 0) <= lv["sentP90Max"], sl["p90"], f"≤{lv['sentP90Max']}", "最も長い文を分ける")
        chk("cvMin", (sl["変動係数"] or 0) >= c["cvMin"], sl["変動係数"], f"≥{c['cvMin']}", "言い切りの短い文（20〜40 字）を 4〜5 文に 1 つ")
        a, b = c["short40Share"]
        chk("short40Share", a <= sl["40字以下の割合"] <= b, sl["40字以下の割合"], f"{a}〜{b}")
        a, b = c["long81Share"]
        chk("long81Share", a <= sl["81字以上の割合"] <= b, sl["81字以上の割合"], f"{a}〜{b}")
        a, b = c["comma"]
        chk("comma", a <= M["読点_1文"] <= b, M["読点_1文"], f"{a}〜{b}")
        dearu = M["文末"].get("である", 0)
        chk("dearuMax", dearu <= c["dearuMax"], dearu, f"≤{c['dearuMax']}", "「と呼ぶ・といえる・とされる・ことになる」を混ぜる")
    if M["段落数"] >= 3:
        a, b = c["paraChars"]
        pm = M["段落"]["字の中央値"]
        chk("paraChars", a <= (pm or 0) <= b, pm, f"{a}〜{b}", "1〜2 文の段落を前後と合わせる" if (pm or 0) < a else "段落を分ける")
        one = sum(1 for p in paras if len(sentences(p)) <= 1)
        chk("oneSentParaMax", one <= c["oneSentParaMax"], one, f"≤{c['oneSentParaMax']}")
        po = M["段落の頭の接続語の割合"]
        chk("paraOpenMax", po <= c["paraOpenMax"], po, f"≤{c['paraOpenMax']}", "段落の頭の「また・さらに・そして」を外す")
    bold = M["太字"]
    chk("boldPerParaMax", bold["1段落の最大"] <= c["boldPerParaMax"], bold["1段落の最大"], f"≤{c['boldPerParaMax']}")
    chk("boldLenMax", bold["長さの最大"] <= c["boldLenMax"], bold["長さの最大"], f"≤{c['boldLenMax']}", "用語の名前だけを太字に")
    a, b = c["boldPer1000"]
    chk("boldPer1000", a <= bold["1000字あたり"] <= b, bold["1000字あたり"], f"{a}〜{b}")
    chk("bullets", M["本文の箇条書き"] == 0, M["本文の箇条書き"], "0", "本文の箇条を段落に戻す（要点は :::point だけ）")
    for lvh, h in heads:
        mx = c["h1Max"] if lvh == 1 else c["h2Max"]
        name = "h1" if lvh == 1 else "h2"
        chk(f"{name}:{h}", clen(h) <= mx and not re.search(r"(について|とは|[ぁ-ん。？?])$", h), clen(h), f"≤{mx}・名詞止め")
    for i, t in enumerate(seq):
        if t == "box" and i > 0 and seq[i - 1] not in ("H", "box"):
            chk("boxPlace", False, f"{i + 1} 番目の要素", "見出しか事例の直後", "事例の枠を節（項）の頭に移す")
    for r in roles:
        txt = "".join(r["lines"])
        if r["role"] == "box":
            n = len(sentences(txt))
            chk("boxSentMax", n <= c["boxSentMax"] and clen(txt) <= c["boxCharsMax"], f"{n} 文・{clen(txt)} 字", f"≤{c['boxSentMax']} 文・≤{c['boxCharsMax']} 字", "事例は事実だけ。結論は本文へ")
        elif r["role"] == "aside":
            n = len(sentences(txt))
            chk("asideSentMax", n <= c["asideSentMax"], n, f"≤{c['asideSentMax']} 文")
            a, b = c["asideChars"]
            chk("asideChars", a <= clen(txt) <= b, clen(txt), f"{a}〜{b}")
        elif r["role"] == "point":
            items = [x for x in r["lines"] if x.startswith(("-", "・", "*"))]
            a, b = c["pointItems"]
            long_items = [clen(x.lstrip("-・* ")) for x in items if clen(x.lstrip("-・* ")) > c["pointItemMax"]]
            chk("point", a <= len(items) <= b and not long_items, f"{len(items)} 項目・長い項目 {len(long_items)}", f"{a}〜{b} 項目・各 ≤{c['pointItemMax']} 字")
        elif r["role"] == "fig":
            k = re.search(r"kind=(\w+)", r["args"])
            chk("figKind", bool(k) and k.group(1) in FIG_KINDS, k.group(1) if k else "", "・".join(sorted(FIG_KINDS)))
    a, b = c["sectionChars"]
    chk("sectionChars", a <= M["字数"] <= b, M["字数"], f"{a}〜{b}",
        "字数のために内容のない文を足さない。足りなければ親が事実の表（facts.tsv）に確かめた事実を足し、それで書き足す" if M["字数"] < a else "")
    # 読点で節をつなぐだけの長い文（変動の数を上げるために作られがち）
    chains = chain_sentences(paras, c.get("chainMinChars", 100), c.get("chainCommas", 5))
    if "chainMax" in c:
        chk("commaChain", len(chains) <= c["chainMax"], len(chains), f"≤{c['chainMax']}（{c.get('chainMinChars', 100)} 字以上で、かなの後の読点が {c.get('chainCommas', 5)} 以上の文）",
            "読点で節をつないだ文は 2〜3 文に分ける。長い文は定義・要件・条件と帰結の文だけにする：" + "／".join(x[:24] + "…" for x in chains[:3]))
    # 本文に作業の記録・資料の有無の断り（「資料には示されておらず不明」など）を書かない
    notes = [s for p in paras for s in sentences(p) if NOTE_IN_BODY.search(s)]
    if "noteInBodyMax" in c:
        chk("noteInBody", len(notes) <= c["noteInBodyMax"], len(notes), f"≤{c['noteInBodyMax']}",
            "資料・出典に無いことは本文で断らず、書かない（報告に書く）：" + "／".join(x[:24] + "…" for x in notes[:3]))
    if "boxCharsTarget" in c:
        for r in roles:
            if r["role"] == "box":
                n = clen("".join(r["lines"]))
                chk("boxCharsTarget", n <= c["boxCharsTarget"], n, f"≤{c['boxCharsTarget']} 字（事例は約 120 字・3 文）", "事例は場面・起きたことだけ。説明と結論は本文へ")
    # つなぐ候補：隣り合う短い文（どちらも 45 字未満）
    pairs = []
    for p in paras:
        ss = sentences(p)
        for x, y in zip(ss, ss[1:]):
            if clen(x) < 45 and clen(y) < 45:
                pairs.append(f"{x[:14]}…／{y[:14]}…（{clen(x)}+{clen(y)} 字）")
    ng = [r for r in res if not r["ok"] and r["level"] == "hard"]
    return {"file": path, "level": level, "pass": not ng, "ng": [r["id"] for r in ng],
            "soft_ng": [r["id"] for r in res if not r["ok"] and r["level"] == "soft"],
            "checks": res, "join_candidates": pairs[:6], "checker_findings": [f["id"] for f in j["所見"]],
            "measure": {"字数": M["字数"], "文数": M["文数"], "文の中央値": sl["中央値"], "p90": sl["p90"], "変動係数": sl["変動係数"], "段落の中央値": M["段落"]["字の中央値"]}}


# ---------- P1 概念の地図（map.json） ----------
def check_map(m, ledger=None):
    """ledger は parse_ledger の結果か None。誤りと注意を返す。"""
    errs, warns = [], []
    if not isinstance(m, dict):
        return ["map.json が JSON の物でない"], []
    if m.get("kind") not in ("word", "field"):
        errs.append("kind は word・field（資料つきの題は地図を作らない）")
    if not m.get("field"):
        errs.append("field（分野）が空")
    chs = m.get("chapters") or []
    cons = m.get("concepts") or []
    if not chs:
        errs.append("chapters が空")
    if m.get("kind") == "field" and chs and not 5 <= len(chs) <= 15:
        warns.append(f"分野の章立てが {len(chs)} 章（標準の章立ては 5〜15 章が目安）")
    ids = {}
    for c in cons:
        cid = c.get("id")
        if not cid or cid in ids:
            errs.append(f"概念の id が空か重複：{cid}")
            continue
        ids[cid] = c
    ch_of = {}
    nos = []
    for ch in chs:
        no = ch.get("no")
        nos.append(no)
        if not ch.get("title"):
            errs.append(f"第 {no} 章の title が空")
        for cid in ch.get("concepts") or []:
            if cid not in ids:
                errs.append(f"第 {no} 章の概念 {cid} が concepts に無い")
            elif cid in ch_of:
                errs.append(f"概念 {cid} が 2 つの章（{ch_of[cid]}・{no}）に入っている")
            else:
                ch_of[cid] = no
    if len(nos) != len(set(nos)):
        errs.append("章の no が重複")
    w = (m.get("write") or {}).get("chapter")
    wch = next((ch for ch in chs if ch.get("no") == w), None)
    if wch is None:
        errs.append("write.chapter（今回書く章）が chapters に無い")
    else:
        n = len(wch.get("concepts") or [])
        if not 5 <= n <= 15:
            errs.append(f"書く章（第 {w} 章）の概念が {n} 個（5〜15）")
    # 前提の向き：存在・循環・後ろの章を前提にしない
    for cid, c in ids.items():
        for p in c.get("pre") or []:
            if p not in ids:
                errs.append(f"{cid} の前提 {p} が concepts に無い")
            elif cid in ch_of and p in ch_of and isinstance(ch_of[p], int) and isinstance(ch_of[cid], int) and ch_of[p] > ch_of[cid]:
                errs.append(f"{cid}（第 {ch_of[cid]} 章）が後ろの章の {p}（第 {ch_of[p]} 章）を前提にしている")
    state = {}

    def visit(x, stack):
        if state.get(x) == 1:
            errs.append("前提が循環している：" + " → ".join(stack + [x]))
            return
        if state.get(x) == 2:
            return
        state[x] = 1
        for p in ids[x].get("pre") or []:
            if p in ids:
                visit(p, stack + [x])
        state[x] = 2
    for cid in ids:
        visit(cid, [])
    if not m.get("excluded"):
        warns.append("excluded（外すもの）が無い（隣の分野・発展の話題を 1 つ以上）")
    # 確認先
    std = m.get("standard") or {}
    if not std.get("check"):
        if not std.get("note"):
            errs.append("standard.check（標準の章立ての確認先）が空で、note に「確認先なし（未確認）」も無い")
        else:
            warns.append("標準の章立ての確認先が無い（未確認。報告の冒頭に書く）")
    elif len(std.get("check")) < 2:
        warns.append("標準の章立ての確認先が 1 つ（種類の違う 2 つ以上が目安）")
    known = {r["id"]: r for r in (ledger or {}).get("rows", [])}
    unconf = {u["id"] for u in (ledger or {}).get("unconfirmed", [])}

    def ids_ok(where, lst, allow_v2=False):
        for rid in lst or []:
            if ledger is None:
                continue
            if rid in unconf:
                errs.append(f"{where} の確認先 {rid} は未確認の行（確かめてから使う）")
            elif rid not in known:
                errs.append(f"{where} の確認先 {rid} が台帳に無い")
            elif known[rid]["v"] == 2 and not allow_v2 and "【構成】" not in known[rid]["use"]:
                warns.append(f"{where} の確認先 {rid} は V2（書誌だけ）。中身の根拠にはしない")
    ids_ok("standard", std.get("check"), True)
    no_check = 0
    for ch in chs:
        ids_ok(f"第 {ch.get('no')} 章", ch.get("check"), True)
        if not ch.get("check") and not ch.get("todo"):
            no_check += 1
    if no_check:
        warns.append(f"確認先（check か todo）の無い章が {no_check}")
    todo = []
    for cid, c in ids.items():
        ids_ok(f"概念 {cid}", c.get("check"))
        if not c.get("check"):
            if c.get("todo"):
                todo.append(cid)
            else:
                errs.append(f"概念 {cid}（{c.get('name', '')}）に確認先（check の台帳 ID か todo）が無い")
    if todo:
        warns.append("確かめていない概念（todo。本文で定義しない）：" + "・".join(todo))
    return errs, warns


# ---------- P3 出典の台帳（ledger.tsv） ----------
LEDGER_ROW = re.compile(r"^\s*\|?\s*([A-Za-z0-9][A-Za-z0-9_.\-]{0,23})\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*(V[0-3]|未確認)\s*\|\s*([^|]*?)\s*\|?\s*$")
METHOD_TAGS = ("【コネクタ】", "【ウェブ】", "【利用者資料】")


def parse_ledger(text):
    rows, unconf, bad = [], [], []
    for ln in text.replace("\r", "").split("\n"):
        s = ln.strip()
        if not s or s.startswith("#") or s.startswith("ID |") or s.startswith("ID|"):
            continue
        mm = LEDGER_ROW.match(s)
        if not mm:
            if "|" in s:
                bad.append(s[:60])
            continue
        rid, bib, url, v, use = mm.groups()
        if v == "未確認":
            unconf.append({"id": rid, "bib": bib, "where": url, "next": use})
        else:
            rows.append({"id": rid, "bib": bib, "url": url, "v": int(v[1]), "use": use})
    return {"rows": rows, "unconfirmed": unconf, "bad": bad}


def check_ledger(L, sources_dir=None):
    """sources_dir（work/sources）があれば、V3【ウェブ】の行に原文の写し <ID>.txt があるかも見る。"""
    errs, warns = [], []
    seen = set()
    for r in L["rows"] + L["unconfirmed"]:
        if r["id"] in seen:
            errs.append(f"ID の重複：{r['id']}")
        seen.add(r["id"])
    for r in L["rows"]:
        if r["v"] == 0:
            errs.append(f"V0（記憶のみ）の行：{r['id']}（台帳に載せない。読んでいない出典は書かない）")
        if r["id"].startswith("U"):
            errs.append(f"{r['id']}：U で始まる ID は未確認の行に使う（V を付けた行は R など）")
        if r["v"] >= 1 and not r["url"].strip() and "【利用者資料】" not in r["use"]:
            errs.append(f"確認に使った URL が空：{r['id']}")
        if not any(t in r["use"] for t in METHOD_TAGS):
            warns.append(f"確かめ方の印（【コネクタ】【ウェブ】【利用者資料】）が無い：{r['id']}")
        if r["v"] == 1 and "【二次】" not in r["use"] and not is_hint_row(r):
            warns.append(f"V1 の行に【二次】が無い：{r['id']}")
        if re.search(r"(法|令|規則)\s*第?\s*[0-9０-９一二三四五六七八九十百]+\s*条|判決|決定|判例", r["bib"]) and not any(t in r["use"] for t in ("【コネクタ】", "【ウェブ】")):
            warns.append(f"条文・判例の行で確かめ方が【コネクタ】【ウェブ】でない：{r['id']}")
        if is_hint_row(r) and "【手がかり】" not in r["use"]:
            errs.append(f"{r['id']}：Wikipedia・Wikibooks・コトバンクなどの事典のまとめは根拠にしない。使い方を【手がかり】にし、そこから元の出典を開いて別の行にする")
        if not is_hint_row(r) and "【構成】" not in r["use"] and not source_kind(r):
            warns.append(f"出典の種類の印（{'・'.join(KIND_TAGS)}）が無い：{r['id']}")
    for u in L["unconfirmed"]:
        if not u["id"].startswith("U"):
            errs.append(f"未確認の行の ID は U で始める：{u['id']}")
        if not u["where"].strip():
            warns.append(f"未確認の行 {u['id']} に探した先が無い")
        if re.search(r"存在しない|実在しない|架空", u["where"] + u["next"]):
            errs.append(f"未確認の行 {u['id']} に「存在しない」と書いている（見つからない＝存在しない、ではない）")
    if sources_dir:
        for r in L["rows"]:
            if r["v"] == 3 and "【ウェブ】" in r["use"] and "【構成】" not in r["use"] and not is_hint_row(r):
                if not os.path.exists(os.path.join(sources_dir, r["id"] + ".txt")):
                    warns.append(f"{r['id']}：V3【ウェブ】なのに原文の写し {r['id']}.txt が {sources_dir} に無い（WebFetch の要約しか読んでいなければ V1【二次】にする）")
    for b in L["bad"]:
        warns.append(f"台帳の形に合わない行：{b}")
    byv = [sum(1 for r in L["rows"] if r["v"] == v) for v in range(4)]
    content = [r for r in L["rows"] if r["v"] in (1, 3) and "【構成】" not in r["use"] and not is_hint_row(r)]
    kinds = sorted({source_kind(r) for r in content if source_kind(r)})
    return errs, warns, {"rows": len(L["rows"]), "byV": byv, "unconfirmed": len(L["unconfirmed"]),
                         "content": len(content), "kinds": kinds, "hints": sum(1 for r in L["rows"] if is_hint_row(r))}


# 出典の種類（深さの「種類の違う出典」を数える）。印が無ければ URL から推す
KIND_TAGS = ("【法令】", "【判例】", "【公的】", "【統計】", "【規格】", "【学会】", "【査読】", "【講義】", "【教科書】", "【事典】")
HINT_URL = re.compile(r"wikipedia\.org|wikibooks\.org|wiktionary\.org|kotobank\.jp|weblio\.jp|goo\.ne\.jp/word|chiebukuro|note\.com|hatena|ameblo|fc2\.com", re.I)
KIND_URL = [("【法令】", re.compile(r"laws\.e-gov\.go\.jp|elaws\.e-gov")), ("【判例】", re.compile(r"courts\.go\.jp")),
            ("【統計】", re.compile(r"e-stat\.go\.jp|stat\.go\.jp")), ("【規格】", re.compile(r"jisc\.go\.jp|iso\.org")),
            ("【査読】", re.compile(r"doi\.org|jstage\.jst\.go\.jp|ci\.nii\.ac\.jp|cir\.nii\.ac\.jp|repository|ndlsearch")),
            ("【公的】", re.compile(r"\.go\.jp|\.lg\.jp|\.gov\b|archives\.go\.jp|ndl\.go\.jp")),
            ("【講義】", re.compile(r"\.ac\.jp|\.edu\b|ocw\.")), ("【学会】", re.compile(r"\.or\.jp"))]


def is_hint_row(r):
    return "【手がかり】" in r.get("use", "") or bool(HINT_URL.search(r.get("url", "")))


def source_kind(r):
    for t in KIND_TAGS:
        if t in r.get("use", ""):
            return t
    for t, rx in KIND_URL:
        if rx.search(r.get("url", "")):
            return t
    return ""


# ---------- 主張の印と台帳の突き合わせ ----------
def strip_marks(md):
    return re.sub(r"\s*" + MARK_RE.pattern, "", md)


CLAIM_SIGNALS = [
    ("数", re.compile(r"[0-9０-９]")),
    ("条番号", re.compile(r"第\s*[一二三四五六七八九十百千0-9０-９]+\s*条")),
    ("引用", re.compile(r"「[^」]{6,}」")),
    ("定義", re.compile(r"\*\*[^*]+\*\*\s*(と(呼ぶ|呼ばれ|いう|言う|称する)|である。|とは)|(と(呼ぶ|呼ばれる|いう|称する))。?$")),
    ("人名・外来の名", re.compile(r"[ァ-ヴー]{2,}[・＝][ァ-ヴー]{2,}|[A-Z][a-z]+ [A-Z][a-z]+")),
    ("年・時代", re.compile(r"(世紀|年代|時代|明治|大正|昭和|平成|令和|江戸|室町|鎌倉)")),
]
NUM_FREE = re.compile(r"^(第?[一二三四五六七八九十]|[①-⑳]|[0-9０-９]+[つ点]?の)")


def claim_sentences(md):
    """主張の候補になる文：地の文と :::aside の中（:::box・:::point・:::fig・見出しは外す）。"""
    heads, paras, roles, seq = parse_md(md)
    texts = list(paras) + ["".join(r["lines"]) for r in roles if r["role"] == "aside"]
    out = []
    for t in texts:
        for s in re.split(r"(?<=[。？！])", t):
            s = s.strip()
            if clen(s) > 1:
                out.append(s)
    return out


def claims(md, L):
    known = {r["id"]: r for r in L["rows"]}
    unconf = {u["id"] for u in L["unconfirmed"]}
    sents = claim_sentences(md)
    marked, unknown, cite_unconf, cite_v2, cite_v0, unmarked = 0, [], [], [], [], []
    cite_hint, per_id = [], {}
    for s in sents:
        ms = MARK_RE.findall(s)
        if ms:
            marked += 1
            ids_here = set()
            for grp in ms:
                for rid in re.split(r"\s*[,，、]\s*", grp):
                    ids_here.add(rid)
                    if rid in known and is_hint_row(known[rid]):
                        cite_hint.append(rid)
                    if rid in unconf:
                        cite_unconf.append(rid)
                    elif rid not in known:
                        unknown.append(rid)
                    elif known[rid]["v"] == 0:
                        cite_v0.append(rid)
                    elif known[rid]["v"] == 2:
                        cite_v2.append(rid)
            for rid in ids_here:
                per_id[rid] = per_id.get(rid, 0) + 1
            continue
        if s.endswith(("？", "?")):
            continue
        plain = s.replace("**", "") if not re.search(r"\*\*[^*]+\*\*", s) else s
        hits = [name for name, rx in CLAIM_SIGNALS if rx.search(plain if name != "定義" else s)]
        if hits == ["数"] and not re.search(r"[0-9０-９]{2,}|[0-9０-９][.．][0-9０-９]|[0-9０-９]\s*(%|％|年|月|日|円|人|個|度|倍|km|kg|g|m|℃)", s):
            hits = []  # 1 桁の数え数（2 つの〜）だけなら主張の印に数えない
        if hits:
            unmarked.append({"sent": strip_marks(s)[:60], "signals": hits})
    errs = []
    if unknown:
        errs.append("台帳に無い ID：" + "・".join(sorted(set(unknown))))
    if cite_unconf:
        errs.append("未確認の行を根拠にした：" + "・".join(sorted(set(cite_unconf))))
    if cite_v0:
        errs.append("V0 の行を根拠にした：" + "・".join(sorted(set(cite_v0))))
    if cite_v2:
        errs.append("V2（書誌だけ）の行を中身の根拠にした：" + "・".join(sorted(set(cite_v2))))
    if cite_hint:
        errs.append("事典のまとめ（【手がかり】・Wikipedia 類）を根拠にした：" + "・".join(sorted(set(cite_hint))))
    if unmarked:
        errs.append(f"ID の無い主張の候補 {len(unmarked)}")
    # 深さ（注意）：引いた出典の数・種類・1 つの出典への寄り
    D = load_targets().get("depth", {})
    content_ids = [i for i in per_id if i in known and known[i]["v"] in (1, 3) and not is_hint_row(known[i])]
    kinds = sorted({source_kind(known[i]) for i in content_ids if source_kind(known[i])})
    top_id, top_n = max(per_id.items(), key=lambda kv: kv[1]) if per_id else ("", 0)
    top_share = round(top_n / marked, 2) if marked else 0
    warns = []
    if marked and len(content_ids) < D.get("sourcesMin", 3):
        warns.append(f"本文で引いた出典が {len(content_ids)}（目標 {D.get('sourcesMin', 3)} 以上・種類の違うもの）")
    if marked and len(kinds) < D.get("kindsMin", 2):
        warns.append(f"引いた出典の種類が {len(kinds)}（{'・'.join(kinds) or 'なし'}。目標 {D.get('kindsMin', 2)} 以上）")
    if marked >= 6 and top_share > D.get("topShareMax", 0.5):
        warns.append(f"印のある文の {int(top_share * 100)}% が 1 つの出典 {top_id}（目標 {int(D.get('topShareMax', 0.5) * 100)}% 以下。その出典の誤りをそのまま写す）")
    return {"sentences": len(sents), "marked": marked, "unmarked_claims": len(unmarked), "unmarked": unmarked,
            "ids_used": sorted(per_id), "per_id": per_id, "kinds": kinds, "top_share": top_share, "warnings": warns,
            "cited_hint": sorted(set(cite_hint)),
            "unknown_ids": sorted(set(unknown)), "cited_unconfirmed": sorted(set(cite_unconf)), "cited_v2": sorted(set(cite_v2)),
            "cited_v0": sorted(set(cite_v0)), "pass": not errs, "errors": errs}


# ---------- P3b 事実の表（facts.tsv。資料なしの題の深さ） ----------
FACT_ROW = re.compile(r"^\s*\|?\s*(F\d{1,3})\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|?\s*$")


def _norm(t):
    import unicodedata
    t = unicodedata.normalize("NFKC", t)
    return re.sub(r"[\s、。，．,.・「」『』（）()\[\]【】:：;；\"'“”‘’…―ー-]", "", t)


def parse_facts(text):
    rows, bad = [], []
    for ln in text.replace("\r", "").split("\n"):
        s = ln.strip()
        if not s or s.startswith("#") or s.startswith("ID |") or s.startswith("ID|"):
            continue
        m = FACT_ROW.match(s)
        if not m:
            if "|" in s:
                bad.append(s[:60])
            continue
        fid, sec, rid, fact, quote = m.groups()
        rows.append({"id": fid, "sec": sec, "rids": [x for x in re.split(r"\s*[,，、]\s*", rid) if x], "fact": fact, "quote": quote})
    return rows, bad


def check_facts(rows, L, sources_dir=None, section=None, targets=None):
    """事実の表の検査と、節ごとの深さ（事実の数・出典の数・種類・1 つの出典への寄り）。"""
    D = (targets or load_targets()).get("depth", {})
    known = {r["id"]: r for r in L["rows"]}
    unconf = {u["id"] for u in L["unconfirmed"]}
    errs, warns, seen = [], [], set()
    cache = {}
    for f in rows:
        if f["id"] in seen:
            errs.append(f"事実の ID の重複：{f['id']}")
        seen.add(f["id"])
        if not f["rids"]:
            errs.append(f"{f['id']}：台帳の ID が無い")
        for rid in f["rids"]:
            if rid in unconf:
                errs.append(f"{f['id']}：未確認の行 {rid} を根拠にした（確かめるまで表に入れない）")
                continue
            r = known.get(rid)
            if not r:
                errs.append(f"{f['id']}：台帳に無い ID {rid}")
                continue
            if r["v"] in (0, 2):
                errs.append(f"{f['id']}：{rid} は V{r['v']}（中身の根拠にしない）")
            if is_hint_row(r):
                errs.append(f"{f['id']}：{rid} は事典のまとめ（【手がかり】）。元の出典を開いて、その行で書く")
            if "【構成】" in r["use"] and "【一次】" not in r["use"] and "【二次】" not in r["use"]:
                warns.append(f"{f['id']}：{rid} は【構成】（章立て）の行。中身の根拠なら使い方の印を直す")
            if sources_dir and f["quote"].strip():
                tp = os.path.join(sources_dir, rid + ".txt")
                if os.path.exists(tp):
                    if tp not in cache:
                        with open(tp, encoding="utf-8", errors="replace") as fh:
                            cache[tp] = _norm(fh.read())
                    q = _norm(f["quote"])
                    if len(q) >= 6 and q not in cache[tp]:
                        errs.append(f"{f['id']}：抜き書きが原文の写し {rid}.txt に無い（原文のまま写す。言い換えは「事実」の欄に）：{f['quote'][:30]}")
                elif r["v"] == 3 and "【ウェブ】" in r["use"]:
                    warns.append(f"{f['id']}：{rid} の原文の写し {rid}.txt が無い（抜き書きを照らせない）")
        if not f["quote"].strip():
            warns.append(f"{f['id']}：抜き書き（原文のまま 10〜80 字）が空")
    secs = {}
    for f in rows:
        if section and f["sec"] != section:
            continue
        secs.setdefault(f["sec"], []).append(f)
    stats = {}
    for sec, fs in secs.items():
        ids = [rid for f in fs for rid in f["rids"] if rid in known and not is_hint_row(known[rid]) and known[rid]["v"] in (1, 3)]
        uniq = sorted(set(ids))
        kinds = sorted({source_kind(known[i]) for i in uniq if source_kind(known[i])})
        cnt = {i: ids.count(i) for i in uniq}
        top = max(cnt.values()) / len(fs) if fs and cnt else 0
        st = {"facts": len(fs), "sources": len(uniq), "kinds": kinds, "top_share": round(top, 2),
              "v1_share": round(sum(1 for i in ids if known[i]["v"] == 1) / len(ids), 2) if ids else 0}
        short = []
        if st["facts"] < D.get("factsMin", 12):
            short.append(f"事実 {st['facts']}（目標 {D.get('factsMin', 12)} 以上）")
        if st["sources"] < D.get("sourcesMin", 3):
            short.append(f"出典 {st['sources']}（目標 {D.get('sourcesMin', 3)} 以上）")
        if len(kinds) < D.get("kindsMin", 2):
            short.append(f"種類 {len(kinds)}（{'・'.join(kinds) or 'なし'}。目標 {D.get('kindsMin', 2)} 以上）")
        if st["top_share"] > D.get("topShareMax", 0.5):
            short.append(f"1 つの出典に {int(st['top_share'] * 100)}%（目標 {int(D.get('topShareMax', 0.5) * 100)}% 以下）")
        st["short"] = short
        stats[sec] = st
    return errs, warns, stats


# ---------- figs（P5 図） ----------
FIG_LINE = re.compile(r"^:::fig\b(.*)$", re.M)


def _textbook_tools():
    if TEXTBOOK_SCRIPTS not in sys.path:
        sys.path.insert(0, TEXTBOOK_SCRIPTS)
    import figure_check  # noqa: E402
    return figure_check


def check_figs(chdir):
    """章のフォルダ（outline.json・s*.md・figs.json・figs/<id>.svg）の図を検める。
    候補＝outline の fig が null でない節。各候補は「図にした（fig.id）」か「やめた（fig.dropped に理由）」のどちらか。
    図にした図：figs.json に記述がある・kind が構成と同じ・本文に :::fig id=<id> が 1 回・figure_check（--text＝その節の本文）の誤り 0・
    描いた SVG（figs/<id>.svg）がある・SVG の検査（形式と幾何）の誤り 0。"""
    fc = _textbook_tools()
    errs, warns = [], []
    o = read_json(os.path.join(chdir, "outline.json"))
    fp = os.path.join(chdir, "figs.json")
    figs = read_json(fp) if os.path.exists(fp) else {}
    texts = {}
    for s in o.get("sections", []):
        sp = os.path.join(chdir, s["id"] + ".md")
        if os.path.exists(sp):
            with open(sp, encoding="utf-8") as f:
                texts[s["id"]] = f.read()
    st = {"candidates": 0, "made": 0, "dropped": 0, "pending": 0, "fig_errors": 0, "fig_warnings": 0, "svg_errors": 0, "svg_warnings": 0, "kinds": {}, "per": []}
    used = set()
    for s in o.get("sections", []):
        sid, fig = s["id"], s.get("fig")
        md = texts.get(sid, "")
        refs = [m.group(1) for m in FIG_LINE.finditer(md)]
        ids_in_text = [re.search(r"id=([a-z][a-z0-9_]*)", r).group(1) for r in refs if re.search(r"id=([a-z][a-z0-9_]*)", r)]
        for r in refs:
            if not re.search(r"id=", r):
                errs.append(f"{sid}: 本文の :::fig に id が無い（:::fig id=f1 kind=… の形）")
        if len(refs) > 1:
            warns.append(f"{sid}: 1 つの節に図が {len(refs)} つ（本文のあるページに図は 1 つまで）")
        if fig is None:
            for i in ids_in_text:
                errs.append(f"{sid}: 構成に図の候補が無いのに本文に :::fig id={i} がある（outline の fig に id を書く）")
            continue
        st["candidates"] += 1
        row = {"section": sid, "kind": fig.get("kind"), "want": fig.get("want"), "id": fig.get("id"), "status": "pending"}
        if fig.get("id") is None:
            if fig.get("dropped"):
                st["dropped"] += 1
                row["status"] = "dropped"
                row["why"] = fig["dropped"]
            else:
                st["pending"] += 1
                errs.append(f"{sid}: 図の候補（{fig.get('kind') or fig.get('want')}）が図にもならず、やめた理由（fig.dropped）も無い")
            st["per"].append(row)
            continue
        fid = fig["id"]
        if fid in used:
            errs.append(f"{sid}: 図の id {fid} が 2 つの節で使われている")
        used.add(fid)
        f = figs.get(fid)
        if f is None:
            errs.append(f"{sid}: figs.json に図 {fid} の記述が無い")
            st["pending"] += 1
            st["per"].append(row)
            continue
        if fig.get("kind") and f.get("kind") != fig["kind"]:
            warns.append(f"{sid}: 構成の kind={fig['kind']} と図 {fid} の kind={f.get('kind')} が違う（構成を直す）")
        if ids_in_text.count(fid) != 1:
            errs.append(f"{sid}: 本文に :::fig id={fid} が {ids_in_text.count(fid)} 回（1 回だけ・参照する段落の直後に）")
        e, w = fc.check_fig(fid, f, text=fc_text(md))
        st["fig_errors"] += len(e)
        st["fig_warnings"] += len(w)
        errs += [f"{sid}: {x}" for x in e]
        warns += [f"{sid}: {x}" for x in w]
        svg = os.path.join(chdir, "figs", fid + ".svg")
        if not os.path.exists(svg):
            errs.append(f"{sid}: 描いた SVG が無い（figure_svg.py figs.json figs/ で描き、幾何の検査を通す）")
        else:
            e2, w2 = fc.svg_check(svg)
            st["svg_errors"] += len(e2)
            st["svg_warnings"] += len(w2)
            errs += [f"{sid}: {fid}.svg {x}" for x in e2]
            warns += [f"{sid}: {fid}.svg {x}" for x in w2]
        if not e and os.path.exists(svg) and not fc.svg_check(svg)[0] and ids_in_text.count(fid) == 1:
            st["made"] += 1
            row["status"] = "made"
            st["kinds"][f["kind"]] = st["kinds"].get(f["kind"], 0) + 1
        st["per"].append(row)
    for fid in figs:
        if fid not in used:
            warns.append(f"figs.json の図 {fid} はどの節の構成にも無い")
    return errs, warns, st


def make_page(chdir, out, fmt="fam-f1", variant="b1", plan_path=None):
    """P6：章のフォルダ → .gnoto（v:2）。戻り値 (errors, warnings, plan)。本文は chapter.md、無ければ構成の節の順に s*.md を連ねる。台帳の印は外す。"""
    _textbook_tools()
    import page_v2  # noqa: E402
    import textbook_page  # noqa: E402
    o = read_json(os.path.join(chdir, "outline.json"))
    cp = os.path.join(chdir, "chapter.md")
    if os.path.exists(cp):
        with open(cp, encoding="utf-8") as f:
            md = f.read()
    else:
        parts = []
        for s in o.get("sections", []):
            sp = os.path.join(chdir, s["id"] + ".md")
            if os.path.exists(sp):
                with open(sp, encoding="utf-8") as f:
                    parts.append(f.read())
        md = "\n\n".join(parts)
    if not md.strip():
        return ["本文が無い（chapter.md も s*.md も無い）"], [], None
    md = strip_marks(md)
    fp = os.path.join(chdir, "figs.json")
    figs = read_json(fp) if os.path.exists(fp) else {}
    ch = o.get("chapter", {})
    title = "第%s章　%s" % (ch.get("no", 1), ch.get("title", "")) if ch.get("title") else None
    try:
        note, plan, errs, warns = page_v2.build_v2(md, figs, fmt, variant, title, bool(title), title)
    except page_v2.V2Error as ex:
        return [str(ex)], [], None
    if note:
        e2, w2 = textbook_page.check_note(note)
        errs += e2
        warns += [w for w in w2 if w not in warns]
    if errs or not note:
        return errs, warns, plan
    with open(out, "w", encoding="utf-8") as f:
        json.dump(note, f, ensure_ascii=False, separators=(",", ":"))
    if plan_path:
        write_json(plan_path, plan)
    return errs, warns, plan


def fc_text(md):
    """図の語の突き合わせに使う本文（台帳の印を外し、:::fig の塊は中身ごと外す＝図の説明の行で語が見つかったことにしない）。"""
    out, infig = [], False
    for ln in strip_marks(md).split("\n"):
        s = ln.strip()
        if infig:
            infig = s != ":::"
            continue
        if s.startswith(":::fig"):
            infig = True
            continue
        if s.startswith(":::"):
            continue
        out.append(ln)
    return "\n".join(out)


def print_gate(g):
    print(f"# {g['file']}（段 {g['level']}）：{'通過' if g['pass'] else 'NG あり'}")
    m = g["measure"]
    print(f"字数 {m['字数']}・文 {m['文数']}・文の中央値 {m['文の中央値']}・p90 {m['p90']}・変動係数 {m['変動係数']}・段落の中央値 {m['段落の中央値']}")
    for r in g["checks"]:
        if not r["ok"]:
            tag = "NG" if r["level"] == "hard" else "注意"
            print(f"[{tag}] {r['id']}：{r['value']}（目標 {r['goal']}）{('→ ' + r['hint']) if r['hint'] else ''}")
    if g["join_candidates"] and "sentMedian" in g["ng"]:
        print("つなぐ候補（隣り合う短い文）：")
        for p in g["join_candidates"]:
            print("  " + p)


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    cmd, path, rest = argv[0], argv[1], argv[2:]
    if cmd == "init":
        if os.path.exists(path):
            print(f"{path} は既にある（続きの回は next を使う）")
            return 1
        seed = opt(rest, "--seed")
        if not seed:
            print("--seed が要る")
            return 2
        b = new_book(seed, opt(rest, "--level", "ug"), opt(rest, "--kind", "word"), opt(rest, "--lang", "ja"))
        errs = check_book(b)
        if errs:
            print("\n".join(errs))
            return 1
        write_json(path, b)
        print(f"作った：{path}")
        return 0
    if cmd in ("next", "check", "chapter"):
        b = read_json(path)
        if cmd == "chapter":
            no = opt(rest, "--no")
            if not no or not no.isdigit():
                print("--no が要る")
                return 2
            st = opt(rest, "--status")
            if st is not None and st not in STATUS:
                print("--status は planned・writing・done")
                return 2
            set_chapter(b, int(no), opt(rest, "--title"), st, opt(rest, "--summary"), opt(rest, "--outline"), opt(rest, "--text"))
            errs = check_book(b)
            if errs:
                print("\n".join(errs))
                return 1
            write_json(path, b)
            print(f"更新した：第 {no} 章（次は第 {b['next']['chapter']} 章）")
            return 0
        errs = check_book(b)
        if cmd == "check":
            print("\n".join(errs) if errs else "形の誤り 0")
            return 1 if errs else 0
        print(json.dumps(next_info(b), ensure_ascii=False, indent=1))
        return 1 if errs else 0
    if cmd == "outline":
        errs, warns = check_outline(read_json(path))
        for e in errs:
            print("[誤り] " + e)
        for w in warns:
            print("[注意] " + w)
        if not errs:
            print("構成の誤り 0")
        return 1 if errs else 0
    if cmd == "map":
        lp = opt(rest, "--ledger")
        L = None
        if lp:
            with open(lp, encoding="utf-8") as f:
                L = parse_ledger(f.read())
        errs, warns = check_map(read_json(path), L)
        for e in errs:
            print("[誤り] " + e)
        for w in warns:
            print("[注意] " + w)
        if not errs:
            print("地図の誤り 0" + ("" if lp else "（--ledger なし：確認先の ID は照合していない）"))
        return 1 if errs else 0
    if cmd == "ledger":
        with open(path, encoding="utf-8") as f:
            L = parse_ledger(f.read())
        sd = opt(rest, "--sources")
        if sd is None and os.path.isdir(os.path.join(os.path.dirname(os.path.abspath(path)), "sources")):
            sd = os.path.join(os.path.dirname(os.path.abspath(path)), "sources")
        errs, warns, st = check_ledger(L, sd)
        if "--json" in rest:
            print(json.dumps({"stats": st, "errors": errs, "warnings": warns, "pass": not errs}, ensure_ascii=False, indent=1))
        else:
            print(f"台帳 {st['rows']} 行（V3 {st['byV'][3]}・V2 {st['byV'][2]}・V1 {st['byV'][1]}・V0 {st['byV'][0]}）・未確認 {st['unconfirmed']}"
                  f"・中身の根拠になる行 {st['content']}（種類 {'・'.join(st['kinds']) or 'なし'}）・手がかり {st['hints']}")
            for e in errs:
                print("[誤り] " + e)
            for w in warns:
                print("[注意] " + w)
            if not errs:
                print("台帳の誤り 0")
        return 1 if errs else 0
    if cmd == "claims":
        lp = opt(rest, "--ledger")
        if not lp:
            print("--ledger が要る")
            return 2
        with open(lp, encoding="utf-8") as f:
            L = parse_ledger(f.read())
        with open(path, encoding="utf-8") as f:
            md = f.read()
        r = claims(md, L)
        sp = opt(rest, "--strip")
        if sp:
            with open(sp, "w", encoding="utf-8") as f:
                f.write(strip_marks(md))
        if "--json" in rest:
            print(json.dumps(r, ensure_ascii=False, indent=1))
        else:
            print(f"文 {r['sentences']}・印のある文 {r['marked']}・ID の無い主張の候補 {r['unmarked_claims']} → {'通過' if r['pass'] else 'NG'}")
            for e in r["errors"]:
                print("[NG] " + e)
            for w in r["warnings"]:
                print("[注意] " + w)
            print(f"引いた出典 {len(r['ids_used'])}（{'・'.join(f'{k}×{v}' for k, v in sorted(r['per_id'].items()))}）・種類 {'・'.join(r['kinds']) or 'なし'}")
            for u in r["unmarked"][:12]:
                print(f"  候補（{'・'.join(u['signals'])}）：{u['sent']}")
            if sp:
                print(f"印を外した本文：{sp}")
        return 0 if r["pass"] else 1
    if cmd == "facts":
        lp = opt(rest, "--ledger")
        if not lp:
            print("--ledger が要る")
            return 2
        with open(lp, encoding="utf-8") as f:
            L = parse_ledger(f.read())
        with open(path, encoding="utf-8") as f:
            rows, bad = parse_facts(f.read())
        sd = opt(rest, "--sources")
        if sd is None and os.path.isdir(os.path.join(os.path.dirname(os.path.abspath(lp)), "sources")):
            sd = os.path.join(os.path.dirname(os.path.abspath(lp)), "sources")
        errs, warns, stats = check_facts(rows, L, sd, opt(rest, "--section"))
        warns += [f"表の形に合わない行：{b}" for b in bad]
        short = any(st["short"] for st in stats.values())
        if "--json" in rest:
            print(json.dumps({"stats": stats, "errors": errs, "warnings": warns, "pass": not errs and not short}, ensure_ascii=False, indent=1))
        else:
            for sec, st in sorted(stats.items()):
                print(f"{sec}：事実 {st['facts']}・出典 {st['sources']}・種類 {'・'.join(st['kinds']) or 'なし'}・最大の寄り {int(st['top_share'] * 100)}%・V1 {int(st['v1_share'] * 100)}%"
                      + ("" if not st["short"] else " → 深さ不足：" + "・".join(st["short"])))
            for e in errs:
                print("[誤り] " + e)
            for w in warns[:20]:
                print("[注意] " + w)
            if not errs and not short:
                print("事実の表の誤り 0・深さの目標を満たす")
            elif not errs:
                print("事実の表の誤り 0（深さ不足：確認先を足して読む。探しても届かなければ報告に書く）")
        return 1 if errs or short else 0
    if cmd == "figs":
        errs, warns, st = check_figs(path)
        if "--json" in rest:
            print(json.dumps({"stats": st, "errors": errs, "warnings": warns, "pass": not errs}, ensure_ascii=False, indent=1))
        else:
            print(f"図の候補 {st['candidates']}・図にした {st['made']}・やめた {st['dropped']}・残り {st['pending']}"
                  f"（記述の誤り {st['fig_errors']}・警告 {st['fig_warnings']}／SVG の誤り {st['svg_errors']}・警告 {st['svg_warnings']}）")
            for e in errs:
                print("[誤り] " + e)
            for w in warns:
                print("[注意] " + w)
            if not errs:
                print("図の誤り 0")
        return 1 if errs else 0
    if cmd == "page":
        out = opt(rest, "--out")
        if not out:
            print("--out が要る")
            return 2
        errs, warns, plan = make_page(path, out, opt(rest, "--format", "fam-f1"), opt(rest, "--variant", "b1"), opt(rest, "--plan"))
        for w in warns:
            print("[注意] " + w)
        for e in errs:
            print("[誤り] " + e)
        if plan and not errs:
            print(f"書いた：{out}（v:2・{len(plan['pages'])} ページ・1 ページ {plan['lines']} 行）")
            for p in plan["pages"]:
                print(f"  {p['id']} {p['kind'] or '本文'} 見積り {p['rows']}/{plan['lines']} 行（{p['est']}）")
            print("紙面の誤り 0（GNOTO で開いた見た目は確かめていない）")
        return 1 if errs else 0
    if cmd == "gate":
        level = opt(rest, "--level", "ug")
        if level not in LEVELS:
            print("--level は hs・ug・grad")
            return 2
        g = gate(path, level)
        if "--json" in rest:
            print(json.dumps(g, ensure_ascii=False, indent=1))
        else:
            print_gate(g)
        return 0 if g["pass"] else 1
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
