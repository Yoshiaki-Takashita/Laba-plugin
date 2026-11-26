#!/usr/bin/env python3
"""laba-book の状態と検査（標準ライブラリだけ・ネットに接続しない。gate だけ node で textbook_check.js を呼ぶ）。

使い方:
  book_state.py init    book.json --seed "<題>" [--level ug] [--kind word|field|sourced] [--lang ja]
  book_state.py next    book.json                      # 次に作る章と、済んだ章の要点だけを出す
  book_state.py chapter book.json --no N [--title T] [--status planned|writing|done] [--summary "a;b;c"] [--outline P] [--text P]
  book_state.py check   book.json                      # book.json の形の検査
  book_state.py outline outline.json                   # 構成の検査（見出しの字数・項の数・用語の重複・図の型）
  book_state.py gate    節.md [--level ug] [--json]    # 本文の数の検査（targets.json の目標。NG が 0 なら終了コード 0）
数の元：reportkiller/references/textbook-prose.md §1 → scripts/targets.json（写し）。"""
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))  # skills/
CHECKER = os.path.join(ROOT, "reportkiller", "scripts", "textbook_check.js")
FIG_KINDS = {"flow", "tree", "table", "matrix", "timeline", "concept", "relation"}
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
        if fig is not None and fig.get("kind") not in FIG_KINDS:
            errs.append(f"{sid}: 図の型「{fig.get('kind')}」は使えない（{'・'.join(sorted(FIG_KINDS))}）")
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
    chk("sectionChars", a <= M["字数"] <= b, M["字数"], f"{a}〜{b}", "字数のために内容のない文を足さない")
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
