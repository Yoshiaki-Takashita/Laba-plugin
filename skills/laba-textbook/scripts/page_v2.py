#!/usr/bin/env python3
"""page_v2.py ― 役割の印つき Markdown（laba-book の章）＋図の記述から、紙面の指示 v:2（読む順の塊）の .gnoto を作る。標準ライブラリだけ。

v:1（textbook_page.py build）は「スロットと文」＝ひな形のスロットの位置に置く。v:2 は「読む順の塊（blocks）」＝GNOTO の
レイアウトの決定（pgCompose）が、本の型の格子に読む順で行を割り当てて組む（GLYPH の docs/edit-app/laba-textbook/gnoto-lite-page.md 8 章）。
Laba が書くのは、ページの区切り・塊の種類（見出しの格・本文・囲み・図・傍注）・文（rows の pid）・図の記述だけ。座標・色・書体は書かない。

pgCompose はページをまたいで文を流さない（ページごとに割り当て、入らない行は「あふれ」として切れる）。だから
**ページの区切りは Laba が決める**：ここでは GNOTO の行の数え方の写し（字詰め・見出しの行・囲みの高さ・図の高さ）で
1 ページの行を見積もり、入らない段落は文の切れ目で次のページへ分ける。見積りは写しなので、真の確かめは GNOTO で開いて見ること。

  python3 textbook_page.py build2 --md chapter.md [--figs figs.json] --format fam-f1 --variant b1 --out ch1.gnoto
                                  [--chapter-title "第1章　…"] [--no-chapter-page] [--plan plan.json]
"""
import hashlib
import json
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import figure_check  # noqa: E402

FORMATS = os.path.join(HERE, "..", "formats")
ID_RE = re.compile(r"^[a-z0-9_]{1,16}$")
MARK_RE = re.compile(r"\[((?:[RU]\d{1,3}[a-z]?)(?:\s*[,，、]\s*[RU]\d{1,3}[a-z]?)*)\]")  # laba-book の台帳の印（book_state.py と同じ）

# ── GNOTO の写し（GLYPH.html v1.17.173 の pgSanPage2〈lite の v:2〉・PG_CMP・CMP_BOX・pgCmpBody の行の数え方）。GNOTO が正 ──
BT = ["h1", "h2", "h3", "h4", "h5", "p", "note", "foot", "box", "fig", "toc", "title", "overview"]
BX = ["case", "column", "model", "example", "setrei", "talk", "lead", "gray"]
KIND = ["body", "bodyfig", "bodybox", "bodyfigbox", "toc", "chapter", "figonly", "title", "blank"]
S24 = re.compile(r"^[^<>\u0000-\u001f]{1,24}$")
S60 = re.compile(r"^[^<>\u0000-\u001f]{1,60}$")
S80 = re.compile(r"^[^<>\u0000-\u001f]{1,80}$")
# 見出しの行（本ごとの見出しの型）。top＝ページの頭のとき。before＝ページの頭でないとき前に空ける行
CMP_H = {
    "_": {"h1": {"rows": 1}, "h2": {"rows": 1}, "h3": {"rows": 1}, "h4": {"rows": 1}, "h5": {"rows": 1}},
    "fam-f1|b1": {"h2": {"rows": 3, "part": True}, "h3": {"rows": 2, "part": True, "top": 1}, "h4": {"rows": 2, "part": True}},
    "fam-f1|b2": {"h2": {"rows": 2, "part": True, "top": 1}},
    "fam-f1|b3": {"h2": {"rows": 2, "part": True}, "h3": {"rows": 3, "part": True, "top": 1}, "h4": {"rows": 2, "part": True}},
    "fam-f2|b5": {"h2": {"rows": 1, "before": 1}, "h3": {"rows": 1, "before": 1}, "h4": {"rows": 1, "before": 1}},
    "fam-f3|b4": {},
}
# 囲みの種類 → 部品（無い種類は枠なしの本文の行＝lead）
CMP_BOXKIND = {"fam-f1|b1": {"case": "case-frame"}, "fam-f1|b2": {"column": "column-box"}, "fam-f1|b3": {"model": "model-frame"},
               "fam-f2|b5": {"talk": "dotted-box"}, "fam-f3|b4": {"example": "corner-box", "setrei": "corner-box", "column": "gray-column", "gray": "gray-column"}}
CMP_BOX = {"case-frame": {"wr": 3, "pad": [30, 39.7, 18, 39.7], "size": 19, "lead": 1.5684},
           "column-box": {"wr": 34.6, "pad": [62, 24, 22, 24], "size": 18.9, "lead": 1.6},
           "corner-box": {"wr": 4.3, "pad": [8, 13.8, 8, 22], "size": 15.8, "lead": 1.6},
           "gray-column": {"wr": -204.8, "pad": [50, 20, 20, 20], "size": 16.5, "lead": 1.6},
           "dotted-box": {"wr": 94, "pad": [22, 26, 22, 26], "size": 18, "lead": 1.7778}}
# 図の題の札（fig-tag）が描かれる本（PG_CMP の ftag）。ページの頭の図は札の分（gap）だけ下がる
CMP_FTAG_GAP = {"fam-f1|b1": 41, "fam-f1|b2": 40.5}
# Laba のフォーマットの「aside」「box」の部品名 → 囲みの種類
BOX_OF_PART = {"case-frame": "case", "column-box": "column", "model-frame": "model", "dotted-box": "talk", "corner-box": "example"}
SVG_TAG_H = 38   # figure_svg.py の図表題の帯の高さ（GNOTO の pgFigLaba は帯を描かない＝札は fig-tag の部品）


class V2Error(Exception):
    pass


def load_format(fid):
    p = os.path.join(FORMATS, fid + ".json")
    if not re.match(r"^[a-z0-9-]{1,32}$", fid or "") or not os.path.exists(p):
        raise V2Error("知らないフォーマット %r" % fid)
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def geo(fmt, vname):
    """本の型の格子（w1000）：字詰め・行数・行送り・字の大きさ・版面の幅・傍注の列の有無。"""
    var = fmt["variants"][vname]
    b = fmt["base"]
    cpl = var.get("chars", b["chars"])
    em = var.get("em", b["em"])
    pitch = var.get("pitch", b["pitch"])
    side = var.get("side", b.get("side"))
    return {"cpl": cpl, "lines": b["lines"], "em": em, "pitch": pitch, "bw": cpl * em, "indent": b.get("indent", 1),
            "side": bool(side), "key": fmt["id"] + "|" + vname, "figWord": var.get("figWord") or "図", "box": var.get("box")}


def cmp_w(s):
    """GNOTO の cmpW：全角 1・半角（ASCII と半角カナ）0.5。"""
    return sum(0.5 if re.match(r"[ -~｡-ﾟ]", ch) else 1 for ch in s)


def plain(html):
    t = re.sub(r"<[^>]+>", "", html)
    return t.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"').replace("&#39;", "'").replace("&amp;", "&").rstrip()


def para_lines(html, cpl, ind):
    s = plain(html)
    if not s:
        return 1
    return max(1, math.ceil((cmp_w(s) + ind) / max(1, cpl) - 1e-6))


def head_rows(g, t, at_top):
    H = dict(CMP_H["_"].get(t, {"rows": 1}))
    H.update(CMP_H.get(g["key"], {}).get(t, {}))
    if at_top and H.get("top"):
        return H["top"]
    return H["rows"] + (0 if at_top else H.get("before", 0))


def box_rows(g, part, html_list):
    D = CMP_BOX.get(part)
    if not D:
        return sum(para_lines(h, g["cpl"], 0) for h in html_list)
    per = math.floor((g["bw"] - D["wr"] - D["pad"][1] - D["pad"][3]) / D["size"])
    n = sum(para_lines(h, per, 0) for h in html_list)
    h = D["pad"][0] + n * D["size"] * D["lead"] + D["pad"][2]
    return max(1, math.ceil((0.04 * g["pitch"] + h) / g["pitch"] + 0.35 - 1e-6))


def fig_rows(g, h, first, cap):
    """図の行（pgCmpBody の図：ページの頭は版面の 1.05 行上から・途中は 0.45 行下から・札があればページの頭は札の分だけ下がる）。"""
    p = g["pitch"]
    gap = CMP_FTAG_GAP.get(g["key"], 0) if (cap and first) else 0
    tot = h + gap
    y0 = -1.05 * p if first else 0.45 * p
    return max(0, math.ceil((y0 + tot) / p + 0.2 - 1e-6))


# ── Markdown（laba-book の役割の印つき）→ 項目の並び ──
def inline(text):
    s = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)


def parse_chapter(md):
    """[{type:h, lv, text} | {type:p, text} | {type:box|aside|point, lines:[…]} | {type:fig, id, kind, line}]。台帳の印は外す。"""
    items, buf, cur = [], [], None
    md = re.sub(r"<!--.*?-->", "", md, flags=re.S)   # HTML の注釈（見本の頭書きなど）は紙面に出さない
    marks = len(MARK_RE.findall(md))
    md = MARK_RE.sub("", md)

    def flush():
        if buf:
            items.append({"type": "p", "text": "".join(x.strip() for x in buf)})
            buf.clear()
    for ln in md.replace("\r", "").split("\n"):
        s = ln.strip()
        if cur is not None:
            if s == ":::":
                items.append(cur)
                cur = None
            elif s:
                cur["lines"].append(s)
            continue
        m = re.match(r"^:::(\w+)(.*)$", s)
        if m:
            flush()
            role, args = m.group(1), m.group(2)
            cur = {"type": role, "lines": []}
            if role == "fig":
                im = re.search(r"id=([a-z][a-z0-9_]*)", args)
                km = re.search(r"kind=([a-z]+)", args)
                cur["id"] = im.group(1) if im else None
                cur["kind"] = km.group(1) if km else None
            continue
        hm = re.match(r"^(#{1,4})\s+(.*)$", s)
        if hm:
            flush()
            items.append({"type": "h", "lv": len(hm.group(1)), "text": hm.group(2).strip()})
            continue
        if not s:
            flush()
            continue
        buf.append(s)
    flush()
    if cur is not None:
        items.append(cur)
    return items, marks


def split_sentences(text):
    out = [x for x in re.split(r"(?<=[。．])", text) if x.strip()]
    return out or [text]


# ── 組み立て ──
def build_v2(md, figs=None, fmt_id="fam-f1", variant="b1", chapter_title=None, chapter_page=True, title=None, fig_sizes=None):
    """戻り値 (note, plan, errors, warnings)。fig_sizes＝{id:(w,h)}（w1000。無ければ figure_svg で描いて測る）。"""
    errs, warns = [], []
    fmt = load_format(fmt_id)
    if variant not in fmt["variants"]:
        raise V2Error("知らない variant %s（%s）" % (variant, "・".join(fmt["variants"])))
    var = fmt["variants"][variant]
    if var.get("status") == "provisional":
        warns.append("variant %s は仮（見た目を確かめきれていない）" % variant)
    g = geo(fmt, variant)
    L = g["lines"]
    figs = figs or {}
    for fid, f in figs.items():
        e, w = figure_check.check_fig(fid, f, text=md)
        errs += e
        warns += w
    items, marks = parse_chapter(md)
    if marks:
        warns.append("台帳の印 [R01] が %d 個あった（紙面には出さないので外した。本文は claims --strip の後を渡す）" % marks)
    boxkind = BOX_OF_PART.get(g["box"] or "", "case")
    if boxkind == "model":
        boxkind = "lead"
    boxpart = CMP_BOXKIND.get(g["key"], {}).get(boxkind)
    rows, pages = [], []
    seq = [0]

    def new_pid(html):
        seq[0] += 1
        pid = "r_" + hashlib.sha1(("%d|%s" % (seq[0], html)).encode("utf-8")).hexdigest()[:6]
        while any(r[0]["pid"] == pid for r in rows):
            pid = "r_" + hashlib.sha1((pid + "x").encode("utf-8")).hexdigest()[:6]
        b = {"html": html, "pid": pid}
        rows.append([b])
        return b

    # 章扉
    if chapter_page and chapter_title:
        b = new_pid(inline(chapter_title))
        b["htype"] = "1"
        pages.append({"id": "p1", "kind": "chapter", "blocks": [{"t": "h1", "rows": [b["pid"]]}], "_rows": 0, "_est": []})
    # 図の大きさ（w1000）：figure_svg で描いた SVG の幅と高さ（帯の分を引く）
    sizes = dict(fig_sizes or {})
    if figs and any(fid not in sizes for fid in figs):
        import figure_svg  # noqa: E402
        for fid, f in figs.items():
            if fid in sizes:
                continue
            try:
                svg = figure_svg.render(f, g["figWord"])
                m = re.search(r'viewBox="0 0 ([0-9.]+) ([0-9.]+)"', svg)
                sizes[fid] = (float(m.group(1)), max(60.0, float(m.group(2)) - SVG_TAG_H))
            except Exception as ex:  # 描けない図（記述の誤り）は上の check_fig が誤りにする
                warns.append("図 %s の大きさを測れない（%s）。既定の 600×200" % (fid, ex))
                sizes[fid] = (600.0, 200.0)

    state = {"page": None, "r": 0, "floats": [], "last_p": None, "sec": 0, "fig_no": 0}

    def open_page():
        pg = {"id": "p%d" % (len(pages) + 1), "blocks": [], "_rows": 0, "_est": []}
        pages.append(pg)
        state["page"], state["r"], state["last_p"] = pg, 0, None
        # 前のページに入らなかった図はページの頭へ
        fl, state["floats"] = state["floats"], []
        for fb in fl:
            place_fig(fb, force=True)
        return pg

    def cur():
        return state["page"] or open_page()

    def at_top():
        return state["r"] == 0

    def add(block, n, what):
        pg = cur()
        pg["blocks"].append(block)
        state["r"] += n
        pg["_rows"] = state["r"]
        pg["_est"].append("%s%d" % (what, n))

    def fits(n):
        return state["r"] + n <= L

    def place_fig(fb, force=False):
        first = at_top()
        n = fig_rows(g, fb["h"], first, fb.get("cap"))
        if not force and not fits(n):
            state["floats"].append(fb)
            return
        blk = {"t": "fig", "fig": fb["fig"], "rows": [], "w": round(fb["w"], 1), "h": round(fb["h"], 1)}
        if fb.get("cap"):
            blk["cap"] = fb["cap"]
        if n > L:
            warns.append("図 %s は 1 ページの行（%d）より高い（%d 行）。小さくするか図だけのページに" % (fb["fig"], L, n))
        add(blk, n, "F")

    def place_para(html, ind, box_lead=False):
        n = para_lines(html, g["cpl"], ind)
        if not fits(n):
            room = L - state["r"]
            sents = split_sentences(html)
            if room >= 2 and len(sents) > 1:
                head = ""
                k = 0
                while k < len(sents) and para_lines(head + sents[k], g["cpl"], ind) <= room:
                    head += sents[k]
                    k += 1
                if k > 0:
                    b = new_pid(head)
                    add({"t": "box", "box": "lead", "rows": [b["pid"]]} if box_lead else {"t": "p", "rows": [b["pid"]]}, para_lines(head, g["cpl"], ind), "P")
                    state["last_p"] = b["pid"]
                    warns.append("%s：段落を文の切れ目で次のページへ分けた（続きは字下げの段落になる）" % state["page"]["id"])
                    open_page()
                    place_para("".join(sents[k:]), ind, box_lead)
                    return
            open_page()
            n = para_lines(html, g["cpl"], ind)
        b = new_pid(html)
        add({"t": "box", "box": "lead", "rows": [b["pid"]]} if box_lead else {"t": "p", "rows": [b["pid"]]}, n, "P")
        state["last_p"] = b["pid"]

    def next_rows(i):
        """見出しの直後の項目の最初の 2 行（見出しをページの末に残さない）。"""
        for it in items[i + 1:]:
            if it["type"] == "p":
                return min(2, para_lines(inline(it["text"]), g["cpl"], g["indent"]))
            if it["type"] in ("box", "point"):
                return 2
            if it["type"] == "h":
                return 1
        return 0

    for i, it in enumerate(items):
        t = it["type"]
        if t == "h":
            lv = min(5, it["lv"] + 1)   # # 節 → h2・## 項 → h3・### → h4
            text = it["text"]
            if lv == 2:
                state["sec"] += 1
                if not re.match(r"^\s*[0-9０-９]+", text) and CMP_H.get(g["key"], {}).get("h2", {}).get("part"):
                    text = "%d　%s" % (state["sec"], text)   # 輪郭数字の見出しは番号を文の頭から取る（無ければ GNOTO は 1 と描く）
            n = head_rows(g, "h%d" % lv, at_top())
            if not fits(n + next_rows(i)) and not at_top():
                open_page()
                n = head_rows(g, "h%d" % lv, True)
            b = new_pid(inline(text))
            b["htype"] = str(min(lv, 3))
            add({"t": "h%d" % lv, "rows": [b["pid"]]}, n, "H")
        elif t == "p":
            place_para(inline(it["text"]), g["indent"])
        elif t == "box":
            html = [inline(x) for x in it["lines"]]
            if not html:
                continue
            if boxpart:
                n = box_rows(g, boxpart, html)
                if not fits(n) and not at_top():
                    open_page()
                ids = [new_pid(h)["pid"] for h in html]
                add({"t": "box", "box": boxkind, "rows": ids}, n, "B")
                if n > L:
                    warns.append("%s：囲みが 1 ページより高い（%d 行）" % (state["page"]["id"], n))
            else:
                for h in html:
                    place_para(h, 0, box_lead=True)
        elif t == "point":
            # 要点の枠の部品は GNOTO に無い（gnoto-lite-page.md 7）。枠なしの囲み（lead）の行として、項目ごとに「・」を付けて置く
            for x in it["lines"]:
                x = re.sub(r"^[-*・]\s*", "", x)
                place_para(inline("・" + x), 0, box_lead=True)
        elif t == "aside":
            text = "".join(it["lines"])
            if not text:
                continue
            b = new_pid(inline(text))
            blk = {"t": "note" if g["side"] else "foot", "rows": [b["pid"]]}
            if state["last_p"] and g["side"]:
                blk["ref"] = state["last_p"]
            elif g["side"]:
                warns.append("%s：補足の前に本文の段落が無い（傍注の行が決まらない）" % cur()["id"])
            if not g["side"]:
                # 傍注の列の無い本：本文の枠の下の注の帯。GNOTO は帯の分だけ本文の行を減らさないので、ここで行を空けておく
                n = math.ceil(para_lines(b["html"], math.floor(g["cpl"] / 0.8), 0) * g["em"] * 0.8 * 1.6 / g["pitch"]) + 1
                state["r"] += n
                cur()["_est"].append("N%d" % n)
            cur()["blocks"].append(blk)
        elif t == "fig":
            fid = it.get("id")
            if not fid or fid not in figs:
                errs.append(":::fig id=%s が図の記述（figs.json）に無い" % fid)
                continue
            f = figs[fid]
            w, h = sizes.get(fid, (600.0, 200.0))
            state["fig_no"] += 1
            cap_t = (f.get("caption") or {}).get("title") or (it["lines"][0] if it["lines"] else "")
            cap = None
            if cap_t:
                cap = ("%s %s　%s" % (g["figWord"], f.get("caption", {}).get("no") or state["fig_no"], cap_t))[:60]
                cap = re.sub(r"[<>\u0000-\u001f]", "", cap)
            place_fig({"fig": fid, "w": w, "h": h, "cap": cap})
        else:
            warns.append("知らない役割の印 :::%s（本文の段落として置いた）" % t)
            for x in it.get("lines", []):
                place_para(inline(x), g["indent"])
    if state["floats"]:
        open_page()
    for pg in pages:
        if not pg["blocks"]:
            warns.append("%s：空のページ" % pg["id"])
    used_figs = {b["fig"] for pg in pages for b in pg["blocks"] if b["t"] == "fig"}
    for fid in figs:
        if fid not in used_figs:
            warns.append("図 %s は本文の :::fig から使われていない（紙面に出ない）" % fid)
    if errs:
        return None, None, errs, warns
    plan = {"format": g["key"], "lines": L, "cpl": g["cpl"],
            "pages": [{"id": p["id"], "kind": p.get("kind", ""), "rows": p["_rows"], "est": " ".join(p["_est"]), "over": max(0, p["_rows"] - L)} for p in pages]}
    lite_pages = []
    for p in pages:
        o = {"id": p["id"], "master": "body"}   # GNOTO の読み込みが master を足すので、写しと同じ形に
        if p.get("kind"):
            o["kind"] = p["kind"]
        o["blocks"] = p["blocks"]
        lite_pages.append(o)
    title = title or chapter_title or "無題"
    w = fmt["paper"]["widthMm"]
    page2 = {"v": 2, "paper": {"ratio": fmt["paper"]["ratio"], "widthMm": w},
             "fmt": {"id": fmt["id"], "variant": variant, "v": fmt["v"], "widthMm": w},
             "pages": [{"id": p["id"], "master": "body"} for p in pages],
             "lite": {"v": 2, "pages": lite_pages}}
    if figs:
        page2["figs"] = json.loads(json.dumps(figs))
    shadow = {"v": 1, "paper": {"size": "custom", "orient": "portrait", "w": w, "h": round(w * fmt["paper"]["ratio"], 2)},
              "pages": [{"id": p["id"], "boxes": [], "rules": []} for p in pages]}
    content = {"title": title, "rows": rows, "scroll": 0, "updated": 0, "cCue": "", "cSum": "", "page": shadow, "page2": page2}
    note = {"glyph": "note", "version": 1, "exportedAt": 0, "app": "GNOTO", "card": None,
            "note": {"title": title, "style": "page", "n": 0, "content": content, "books": [], "pen": []}}
    return note, plan, errs, warns


# ── 検査：GNOTO の読み込み（pgSanPage2 の lite v:2）の写しと、行の見積り ──
def _int(v, lo, hi, d):
    try:
        x = float(v)
        if not math.isfinite(x):
            x = d
    except (TypeError, ValueError):
        x = d
    return int(round(min(hi, max(lo, x))))


def _num(v, lo, hi, d):
    try:
        x = float(v)
        if not math.isfinite(x):
            x = d
    except (TypeError, ValueError):
        x = d
    return round(min(hi, max(lo, x)), 2)


def _ids(a):
    if isinstance(a, str):
        a = a.split()
    if not isinstance(a, list):
        return []
    return [str(x) for x in a[:2000] if ID_RE.match(str(x if x is not None else ""))]


def san_lite_v2(src):
    """pgSanPage2 の lite（v:2 の欄）の写し。GNOTO が残す形を返す（形の違う欄・塊は落とす）。"""
    if not isinstance(src, dict) or not isinstance(src.get("pages"), list):
        return None
    L = {"v": _int(src.get("v"), 1, 99, 1), "pages": []}
    for e in src["pages"][:500]:
        if not isinstance(e, dict) or not ID_RE.match(str(e.get("id", ""))):
            continue
        o = {"id": str(e["id"]), "master": str(e["master"]) if ID_RE.match(str(e.get("master", ""))) else "body"}
        if e.get("kind") in KIND:
            o["kind"] = e["kind"]
        if e.get("start") is not None:
            o["start"] = _int(e["start"], 1, 9999, 1)
        if isinstance(e.get("run"), str) and S80.match(e["run"]):
            o["run"] = e["run"]
        if isinstance(e.get("blocks"), list):
            bl = []
            for x in e["blocks"][:400]:
                if not isinstance(x, dict) or x.get("t") not in BT:
                    continue
                r = {"t": x["t"], "rows": _ids(x.get("rows"))}
                for k in ("fig", "tag", "ref"):
                    if ID_RE.match(str(x.get(k) if x.get(k) is not None else "")):
                        r[k] = str(x[k])
                for k in ("no", "page", "label"):
                    if isinstance(x.get(k), str) and S24.match(x[k]):
                        r[k] = x[k]
                if isinstance(x.get("cap"), str) and S60.match(x["cap"]):
                    r["cap"] = x["cap"]
                if x.get("box") in BX:
                    r["box"] = x["box"]
                if x.get("lv") in ("c", "l", "s"):
                    r["lv"] = x["lv"]
                if x.get("lines") is not None:
                    r["lines"] = _int(x["lines"], 1, 400, 1)
                for c in ("w", "h"):
                    if x.get(c) is not None:
                        r[c] = _num(x[c], 1, 2000, 100)
                if x.get("at") in ("top", "bottom", "here"):
                    r["at"] = x["at"]
                bl.append(r)
            if bl:
                o["blocks"] = bl
        L["pages"].append(o)
    if src.get("exact") is True:
        L["exact"] = True
    if src.get("done") is True:
        L["done"] = True
    return L


def _norm(v):
    """比べるための形（数は小数 2 桁）。"""
    if isinstance(v, dict):
        return {k: _norm(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_norm(x) for x in v]
    if isinstance(v, float):
        return round(v, 2)
    return v


def _diff(a, b, path, out):
    if isinstance(a, dict) and isinstance(b, dict):
        for k in a:
            if k not in b:
                out.append("%s.%s が落ちる" % (path, k))
            else:
                _diff(a[k], b[k], "%s.%s" % (path, k), out)
        return
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            out.append("%s の数が変わる（%d → %d）" % (path, len(a), len(b)))
        for i, (x, y) in enumerate(zip(a, b)):
            _diff(x, y, "%s[%d]" % (path, i), out)
        return
    if a != b:
        out.append("%s が変わる（%r → %r）" % (path, a, b))


def check_v2(note):
    """(errors, warnings, stats)。v:2 の紙面ノートを、GNOTO の読み込みの写し・pid の置き場・行の見積りで検める。"""
    errs, warns = [], []
    c = note["note"]["content"]
    p2 = c.get("page2") or {}
    lite = p2.get("lite") or {}
    if lite.get("v") != 2:
        return ["page2.lite.v が 2 でない（v:2 の検査）"], warns, {}
    d = []
    # ページの欄と塊を 1 つずつ写しに通して比べる（落ちた塊があっても、後ろの塊の比べがずれない）
    for pi, pg in enumerate(lite.get("pages", []) if isinstance(lite.get("pages"), list) else []):
        path = "page2.lite.pages[%d]" % pi
        head = {k: v for k, v in pg.items() if k != "blocks"} if isinstance(pg, dict) else pg
        s1 = san_lite_v2({"v": 2, "pages": [head]})
        if not s1 or not s1["pages"]:
            d.append("%s が落ちる" % path)
            continue
        _diff(_norm(head), _norm(s1["pages"][0]), path, d)
        for bi, b in enumerate(pg.get("blocks", []) if isinstance(pg.get("blocks"), list) else []):
            s2 = san_lite_v2({"v": 2, "pages": [{"id": "p1", "blocks": [b]}]})
            got = (s2["pages"][0].get("blocks") or [None])[0]
            bp = "%s.blocks[%d]" % (path, bi)
            if got is None:
                d.append("%s（t=%r）が落ちる" % (bp, b.get("t") if isinstance(b, dict) else b))
            else:
                _diff(_norm(b), _norm(got), bp, d)
    errs += ["読み込み（pgSanPage2 の写し）で " + x for x in d]
    for fid, f in (p2.get("figs") or {}).items():   # 図の読み込み（pgSanFig：深さ 8・400 字・制御文字）の写し
        tmp = []
        figure_check.fig_walk(f, "page2.figs." + fid, 1, tmp)
        errs += tmp
    by = {}
    for row in c.get("rows", []):
        for b in row:
            if "pid" in b:
                by[b["pid"]] = b
    placed = []
    fmt = p2.get("fmt") or {}
    try:
        f = load_format(fmt.get("id"))
        g = geo(f, fmt.get("variant")) if fmt.get("variant") in f["variants"] else None
    except V2Error as ex:
        errs.append(str(ex))
        g = None
    ids_lite = [p["id"] for p in lite.get("pages", [])]
    if ids_lite != [p.get("id") for p in p2.get("pages", [])] or ids_lite != [p.get("id") for p in (c.get("page") or {}).get("pages", [])]:
        errs.append("ページの id が page・page2.pages・page2.lite.pages でそろっていない")
    figs = p2.get("figs") or {}
    st = {"pages": len(ids_lite), "over_pages": 0, "est": []}
    for lp in lite.get("pages", []):
        r = 0
        here = set()
        for bi, b in enumerate(lp.get("blocks", [])):
            for pid in b.get("rows", []):
                placed.append(pid)
                here.add(pid)
                if pid not in by:
                    errs.append("%s: 塊の pid %s が rows に無い" % (lp["id"], pid))
            if b["t"] == "fig" and b.get("fig") not in figs:
                errs.append("%s: 図 %s が figs に無い" % (lp["id"], b.get("fig")))
            if b.get("ref") and b["ref"] not in by:
                errs.append("%s: 傍注の参照 %s が rows に無い" % (lp["id"], b["ref"]))
            if g and lp.get("kind") != "chapter":
                top = r == 0
                if b["t"] in ("h2", "h3", "h4", "h5"):
                    r += head_rows(g, b["t"], top)
                elif b["t"] == "p":
                    r += sum(b.get("lines") or para_lines(by[x]["html"], g["cpl"], g["indent"]) for x in b["rows"] if x in by)
                elif b["t"] == "box":
                    part = CMP_BOXKIND.get(g["key"], {}).get(b.get("box") or "lead")
                    r += box_rows(g, part, [by[x]["html"] for x in b["rows"] if x in by])
                elif b["t"] == "fig":
                    r += fig_rows(g, b.get("h") or 200, top, b.get("cap"))
        for b in lp.get("blocks", []):
            if b.get("ref") and b["ref"] in by and b["ref"] not in here:
                warns.append("%s: 傍注の参照 %s が同じページに無い（行が決まらない）" % (lp["id"], b["ref"]))
        if g:
            st["est"].append(r)
            if r > g["lines"]:
                st["over_pages"] += 1
                errs.append("%s: 見積りで %d 行（1 ページ %d 行）＝あふれる。ページを分ける" % (lp["id"], r, g["lines"]))
    if len(placed) != len(set(placed)):
        errs.append("同じ pid が 2 回置かれている")
    for pid in by:
        if pid not in placed:
            errs.append("pid %s がどの塊にも無い（GNOTO で未配置になる）" % pid)
    for fid, f in figs.items():
        e, w = figure_check.check_fig(fid, f)
        errs += e
        warns += w
    return errs, warns, st
