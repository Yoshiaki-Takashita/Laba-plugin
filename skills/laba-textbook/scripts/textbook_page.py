#!/usr/bin/env python3
"""textbook_page.py ― Laba が「スロットと文だけ」の紙面ノート（.gnoto・style=page）を書き出す。標準ライブラリだけ。

Laba が書くのは「フォーマット名・変種・ページごとのスロットと文・図の記述」だけ。座標・色・書体・字の大きさ・
番号・柱は書かない（GNOTO が開いたとき、フォーマットから箱・部品・柱を決める）。このスクリプトは、その入力から
.gnoto（content.rows ＋ content.page ＋ content.page2）を作り、GNOTO の読み込みで落ちる・欠ける形を先に検査する。

  python3 textbook_page.py formats                                  フォーマットと変種の一覧
  python3 textbook_page.py slots --format fam-f1 [--variant b1] [--master body]
                                                                    スロットの要約（書く前に読む。フォーマット全文は読まない）
  python3 textbook_page.py build --in input.json --out note.gnoto   入力（references/output-format.md）→ .gnoto
  python3 textbook_page.py check note.gnoto                         検査だけ
  python3 textbook_page.py preview note.gnoto out.html              スロットの一覧（組んだ後の見た目ではない）

終了コード：0＝書けた・検査に通った　1＝誤りあり（書かない）。警告（目安の文字数超過など）は 0 のまま出す。
"""
import argparse
import hashlib
import json
import os
import re
import sys
from html import escape as hesc
from html.parser import HTMLParser

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import figure_check  # noqa: E402
import minischema  # noqa: E402

FORMATS = os.path.join(HERE, "..", "formats")
PID_RE = re.compile(r"^[a-z0-9_]{1,16}$")
# GNOTO が読み込みで通す HTML の許可（skills/gnoto-lite/references/SPEC.md 1.4）
OK_TAGS = set("a abbr b blockquote br caption code col colgroup dd div dl dt em font h1 h2 h3 h4 h5 h6 hr i img li mark "
              "ol p pre q s small span strike strong sub sup table tbody td tfoot th thead tr u ul wbr".split())
OK_ATTRS = set("href src style class colspan rowspan align valign alt title width height dir lang color face start".split())
PAPERS = {"A3": (297, 420), "A4": (210, 297), "A5": (148, 210), "A6": (105, 148),
          "B4": (257, 364), "B5": (182, 257), "B6": (128, 182)}
HTYPE = {"h1": "1", "h2": "2", "h3": "3"}


class BuildError(Exception):
    pass


# ───────────────────────── フォーマット ─────────────────────────
def list_formats():
    out = []
    for fn in sorted(os.listdir(FORMATS)):
        if fn.startswith("fam-") and fn.endswith(".json"):
            out.append(json.load(open(os.path.join(FORMATS, fn), encoding="utf-8")))
    return out


def load_format(fid):
    p = os.path.join(FORMATS, fid + ".json")
    if not re.match(r"^[a-z0-9-]{1,32}$", fid or "") or not os.path.exists(p):
        raise BuildError("知らないフォーマット %r（%s）" % (fid, "・".join(f["id"] for f in list_formats())))
    return json.load(open(p, encoding="utf-8"))


def resolve_variant(fmt, name):
    vs = fmt.get("variants", {})
    if name is None:
        if len(vs) == 1:
            return next(iter(vs)), next(iter(vs.values()))
        raise BuildError("variant を指定してください（%s）" % "・".join(vs))
    if name not in vs:
        raise BuildError("知らない variant %s（%s）" % (name, "・".join(vs)))
    return name, vs[name]


def body_capacity(fmt, var):
    return var.get("chars", fmt["base"]["chars"]) * fmt["base"]["lines"]


def cmd_formats():
    for f in list_formats():
        print("%s  %s  幅 %smm・比 %s" % (f["id"], f["name"], f["paper"]["widthMm"], f["paper"]["ratio"]))
        print("   場面：%s" % f["scene"])
        for k, v in f["variants"].items():
            print("   変種 %s：%s（%s）%s" % (k, v["title"], v["status"], "" if "chars" not in v else "・%d 字詰め" % v["chars"]))
    return 0


def cmd_slots(fid, variant, master):
    fmt = load_format(fid)
    vname, var = resolve_variant(fmt, variant)
    print("%s / %s（%s）・本文の目安 %d 字／ページ（%d 字 × %d 行）・句読点 %s"
          % (fmt["id"], vname, var["title"], body_capacity(fmt, var), var.get("chars", fmt["base"]["chars"]), fmt["base"]["lines"], var.get("punct") or "不明"))
    for mn, m in fmt["masters"].items():
        if master and mn != master:
            continue
        print("マスター %s（%s）" % (mn, m["role"]))
        for sn, s in m["slots"].items():
            cap = s.get("maxChars")
            if sn == "body":
                cap = body_capacity(fmt, var)
            ex = ""
            if s["kind"] == "notes":
                ex = "・1 件 %d 字（%d 字×%d 行）まで" % (s["perNote"]["charsPerLine"] * s["perNote"]["maxLines"], s["perNote"]["charsPerLine"], s["perNote"]["maxLines"])
            print("  %-9s %-5s %s %s%s%s" % (sn, s["kind"], "必須" if s["required"] else "任意", s["role"], "・%d 字まで" % cap if cap and s["kind"] != "notes" else "", ex))
    return 0


# ───────────────────────── 文の組み立て（最小のマークダウン → 行） ─────────────────────────
def pid_for(*parts):
    """pid（r_＋6 字）。同じ入力から同じ pid（差分が読める）。GNOTO は乱数で付けるが、形は同じ。"""
    h = hashlib.sha1("|".join(str(p) for p in parts).encode("utf-8")).hexdigest()
    return "r_" + h[:6]


def inline(text):
    s = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)


def md_blocks(text, key, htype=None):
    """text → [block]。# ## ### → htype 1〜3／- ・* → ul／1. → ol／空行区切り → 段落。htype を渡すとその見出しに固定。"""
    out, para, n = [], [], [0]

    def add(block):
        n[0] += 1
        block["pid"] = pid_for(key, n[0])
        out.append(block)

    def flush():
        if para:
            b = {"html": inline(" ".join(para))}
            if htype:
                b["htype"] = htype
            add(b)
            para.clear()

    for raw in text.split("\n"):
        line = raw.rstrip()
        m = re.match(r"^(#{1,3})\s+(.*)$", line)
        li = re.match(r"^[-*・]\s+(.*)$", line)
        ol = re.match(r"^\d+[.)]\s+(.*)$", line)
        if not line.strip():
            flush()
        elif m and not htype:
            flush()
            add({"html": inline(m.group(2)), "htype": str(len(m.group(1)))})
        elif li and not htype:
            flush()
            add({"html": inline(li.group(1)), "list": "ul"})
        elif ol and not htype:
            flush()
            add({"html": inline(ol.group(1)), "list": "ol"})
        else:
            para.append(line.strip())
    flush()
    return out


def plain_len(html):
    return len(re.sub(r"<[^>]+>", "", html).replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">"))


# ───────────────────────── 作る ─────────────────────────
def build(inp):
    errors, warns = [], []
    errors += ["入力: " + e for e in minischema.validate(inp, minischema.load_schema("laba-page-input.schema.json"))]
    if errors:
        return None, errors, warns
    fmt = load_format(inp["format"])
    vname, var = resolve_variant(fmt, inp.get("variant"))
    if var.get("status") == "provisional":
        warns.append("variant %s は仮（測定が 1〜2 ページ・または判別が仮）。見た目は確かめきれていない" % vname)
    figs_in = inp.get("figs", {})
    for fid, f in figs_in.items():
        e, w = figure_check.check_fig(fid, f)
        errors += e
        warns += w
    rows, lite_pages, v1_pages = [], [], []
    used_figs = set()
    for pi, pg in enumerate(inp["pages"], 1):
        mname = pg.get("master", "body")
        master = fmt["masters"].get(mname)
        if not master:
            errors.append("p%d: 知らないマスター %s（%s）" % (pi, mname, "・".join(fmt["masters"])))
            continue
        sdefs = master["slots"]
        for sname, sdef in sdefs.items():
            if sdef.get("required") and sname not in pg["slots"]:
                errors.append("p%d: 必須のスロット %s（%s）が無い" % (pi, sname, sdef["role"]))
        lp = {"id": "p%d" % pi, "master": mname}
        blks_of = {}
        notes_in = []
        for sname, sval in pg["slots"].items():
            sdef = sdefs.get(sname)
            key = "p%d.%s" % (pi, sname)
            if sdef is None:
                # 知らないスロットは捨てず、本文の末尾へ（付け替えで文が欠けないため）。警告する
                if "text" in sval and "body" in sdefs:
                    blks = md_blocks(sval["text"], key)
                    blks_of.setdefault("body", []).extend(blks)
                    warns.append("p%d: 知らないスロット %s の文は本文の末尾に入れた" % (pi, sname))
                else:
                    warns.append("p%d: 知らないスロット %s は捨てた" % (pi, sname))
                continue
            kind = sdef["kind"]
            if kind in ("text", "md"):
                if "text" not in sval:
                    errors.append("p%d: %s は text が要る" % (pi, sname))
                    continue
                blks = md_blocks(sval["text"], key, HTYPE.get(sdef.get("style")))
                if kind == "text" and len(blks) != 1:
                    errors.append("p%d: %s は 1 段落だけ（%d 段落）" % (pi, sname, len(blks)))
                    continue
                n_chars = sum(plain_len(b["html"]) for b in blks)
                cap = body_capacity(fmt, var) if sname == "body" else sdef.get("maxChars")
                if cap and n_chars > cap:
                    warns.append("p%d: %s は %d 字で目安 %d 字を超える（%.0f%%）。GNOTO が次のページへ流す／短くする" % (pi, sname, n_chars, cap, 100.0 * n_chars / cap))
                blks_of[sname] = blks
            elif kind == "notes":
                items = sval.get("items")
                if not items:
                    errors.append("p%d: %s は items が要る" % (pi, sname))
                    continue
                per = sdef.get("perNote")
                for ni, it in enumerate(items, 1):
                    blks = md_blocks(it.get("text", ""), "%s.%d" % (key, ni))
                    if per:
                        cap = per["charsPerLine"] * per["maxLines"]
                        n = sum(plain_len(b["html"]) for b in blks)
                        if n > cap:
                            warns.append("p%d: %s の %d 件目は %d 字で目安 %d 字を超える（本文か Column にする）" % (pi, sname, ni, n, cap))
                    notes_in.append({"ref": it.get("ref", ""), "no": it.get("no", str(ni)), "blks": blks})
            elif kind == "fig":
                fid = sval.get("fig")
                if not fid or fid not in figs_in:
                    errors.append("p%d: %s の fig %r が figs に無い" % (pi, sname, fid))
                    continue
                used_figs.add(fid)
                lp["fig"] = fid
        # 脚注の印 [^key] → <sup>番号</sup>。注の ref は印のある段落の pid
        body_blks = blks_of.get("body", [])
        for note in notes_in:
            key, tgt = note["ref"], None
            if key:
                for b in body_blks:
                    if "[^%s]" % key in b["html"]:
                        b["html"] = b["html"].replace("[^%s]" % key, "<sup>%s</sup>" % note["no"])
                        tgt = b["pid"]
                        break
                if not tgt:
                    warns.append("p%d: 注 %r の印 [^%s] が本文に無い（置く行が決まらない）" % (pi, note["no"], key))
            note["ref"] = tgt
        for b in body_blks:
            if "[^" in b["html"]:
                warns.append("p%d: 本文に注の無い印 [^…] が残っている" % pi)
        # 出力：スロットは入力の順（本文の流れの順）で page2.lite に、文は rows に
        for sname, blks in blks_of.items():
            lp[sname] = [b["pid"] for b in blks]
            for b in blks:
                rows.append([b])
        if notes_in:
            lp["aside"] = []
            for note in notes_in:
                for b in note["blks"]:
                    rows.append([b])
                e = {"no": note["no"][:12], "rows": " ".join(b["pid"] for b in note["blks"])}
                if note["ref"]:
                    e["ref"] = note["ref"]
                lp["aside"].append(e)
        lite_pages.append(lp)
        v1_pages.append({"id": lp["id"], "boxes": [], "rules": []})
    for fid in figs_in:
        if fid not in used_figs:
            warns.append("図 %s はどのスロットからも使われていない" % fid)
    if errors:
        return None, errors, warns
    title = inp.get("title", "無題")
    w = fmt["paper"]["widthMm"]
    h = round(w * fmt["paper"]["ratio"], 2)
    page2 = {"v": 2, "paper": {"ratio": fmt["paper"]["ratio"], "widthMm": w},
             "fmt": {"id": fmt["id"], "variant": vname, "v": fmt["v"], "widthMm": w},
             "pages": [{"id": p["id"], "master": p["master"]} for p in lite_pages],
             "lite": {"v": 1, "pages": lite_pages}}
    if figs_in:
        page2["figs"] = json.loads(json.dumps(figs_in))
    shadow = {"v": 1, "paper": {"size": "custom", "orient": "portrait", "w": w, "h": h}, "pages": v1_pages}
    content = {"title": title, "rows": rows or [[{"html": ""}]], "scroll": 0, "updated": 0, "cCue": "", "cSum": "",
               "page": shadow, "page2": page2}
    note = {"glyph": "note", "version": 1, "exportedAt": 0, "app": "GNOTO", "card": None,
            "note": {"title": title, "style": "page", "n": 0, "content": content, "books": [], "pen": []}}
    return note, errors, warns


# ───────────────────────── 検査（GNOTO の読み込みで落ちる・欠ける形を先に見つける） ─────────────────────────
class _Tags(HTMLParser):
    def __init__(self):
        super().__init__()
        self.bad = []

    def handle_starttag(self, tag, attrs):
        if tag not in OK_TAGS:
            self.bad.append("<%s>" % tag)
        for k, _ in attrs:
            if k not in OK_ATTRS:
                self.bad.append("%s@%s" % (k, tag))


def check_html(h):
    p = _Tags()
    p.feed(h)
    return p.bad


def check_note(note):
    """(errors, warnings)。"""
    errs, warns = [], []
    if not isinstance(note, dict) or note.get("glyph") != "note" or not isinstance(note.get("note"), dict):
        return ["GNOTO のノートではない（glyph/note）"], warns
    n = note["note"]
    if not re.match(r"^[a-z0-9_-]{1,24}$", str(n.get("style", ""))):
        errs.append("style の形が違う（読み込みで normal になる）")
    c = n.get("content")
    if not isinstance(c, dict):
        return errs + ["content が無い"], warns
    pids = []
    for ri, row in enumerate(c.get("rows", [])):
        if not isinstance(row, list):
            errs.append("rows[%d]: 行は配列" % ri)
            continue
        for b in row:
            if "html" not in b:
                errs.append("rows[%d]: html の無いブロック（スロット方式では使わない）" % ri)
                continue
            extra = set(b) - {"html", "htype", "list", "indent", "callout", "done", "pid", "md", "src"}
            if extra:
                errs.append("rows[%d]: 読み込みで落ちるキー %s" % (ri, sorted(extra)))
            if "htype" in b and not re.match(r"^[a-z0-9]{1,12}$", str(b["htype"]), re.I):
                errs.append("rows[%d]: htype の形" % ri)
            bad = check_html(b["html"])
            if bad:
                errs.append("rows[%d]: HTML に通らないもの %s" % (ri, bad[:4]))
            if "pid" in b:
                if not PID_RE.match(str(b["pid"])):
                    errs.append("rows[%d]: pid の形が違う（落ちる）" % ri)
                pids.append(b["pid"])
            else:
                warns.append("rows[%d]: pid が無い（紙面に置けない）" % ri)
    if len(pids) != len(set(pids)):
        errs.append("pid が重複している（GNOTO が付け直す＝ページの紐づけが壊れる）")
    p1 = c.get("page")
    if p1 is not None:
        if not isinstance(p1, dict):
            errs.append("page がオブジェクトでない（無害化で消える）")
        else:
            pp = p1.get("paper") or {}
            if pp.get("size") == "custom" and not (50 <= pp.get("w", 0) <= 1200 and 50 <= pp.get("h", 0) <= 1200):
                errs.append("page.paper の寸法が 50〜1200mm の外（無害化で変わる）")
            if not isinstance(p1.get("pages"), list) or not 1 <= len(p1["pages"]) <= 500:
                errs.append("page.pages は 1〜500 ページ")
    p2 = c.get("page2")
    if p2 is None:
        return errs + ["page2 が無い"], warns
    se = ["page2: " + e for e in minischema.validate(p2, minischema.load_schema("page2-lite.schema.json"))]
    if se:
        return errs + se, warns   # 形が違うと、後の突き合わせが成り立たない
    lite = p2.get("lite") or {}
    # GNOTO の pgSanAny が落とす形（キー名・文字列・深さ）
    for k in ("lite", "figs"):
        if k in p2:
            tmp = []
            figure_check.any_walk(p2[k], "page2." + k, 1, tmp)
            errs += tmp
    pid_set = set(pids)
    placed = []
    ids_p2 = [x.get("id") for x in p2.get("pages", [])]
    ids_lite = [x.get("id") for x in lite.get("pages", [])]
    ids_v1 = [x.get("id") for x in (p1 or {}).get("pages", [])]
    if not (ids_p2 == ids_lite == ids_v1):
        errs.append("ページの id が page・page2.pages・page2.lite.pages でそろっていない（%s／%s／%s）" % (ids_v1, ids_p2, ids_lite))
    for lp in lite.get("pages", []):
        for k, v in lp.items():
            if k in ("id", "master"):
                continue
            if k == "fig":
                if v not in (p2.get("figs") or {}):
                    errs.append("page2.lite: 図 %s が figs に無い" % v)
            elif k == "aside":
                for it in v:
                    for pid in it["rows"].split():
                        placed.append(pid)
                    if it.get("ref") and it["ref"] not in pid_set:
                        errs.append("page2.lite: 注の参照 %s が rows に無い" % it["ref"])
            else:
                placed += v
    for pid in placed:
        if pid not in pid_set:
            errs.append("page2.lite: pid %s が rows に無い" % pid)
    if len(placed) != len(set(placed)):
        errs.append("page2.lite: 同じ pid が 2 回置かれている")
    for pid in pids:
        if pid not in placed:
            warns.append("pid %s がどのスロットにも置かれていない（未配置になる）" % pid)
    for fid, f in (p2.get("figs") or {}).items():
        e, w = figure_check.check_fig(fid, f)
        errs += e
        warns += w
    return errs, warns


def preview(note, out):
    c = note["note"]["content"]
    by = {b["pid"]: b for row in c["rows"] for b in row if "pid" in b}
    fmt = load_format(c["page2"]["fmt"]["id"])
    var = fmt["variants"].get(c["page2"]["fmt"].get("variant"), {})
    cap = body_capacity(fmt, var)
    h = ['<!doctype html><meta charset="utf-8"><title>スロットの一覧</title><style>body{font:14px sans-serif;margin:16px;max-width:860px}'
         'section{border:1px solid #bbb;margin:12px 0;padding:8px}h2{font-size:15px}.s{margin:6px 0;border-left:3px solid #888;padding-left:8px}'
         '.n{color:#666;font-size:12px}</style><h1>スロットの一覧</h1><p class="n">組んだ後の見た目ではありません（座標は GNOTO が決めます）。字数は目安に対する割合です。</p>']
    for lp in c["page2"]["lite"]["pages"]:
        h.append('<section><h2>%s・マスター %s</h2>' % (hesc(lp["id"]), hesc(lp["master"])))
        for k, v in lp.items():
            if k in ("id", "master"):
                continue
            if k == "fig":
                f = c["page2"]["figs"][v]
                h.append('<div class="s"><b>fig</b> %s：%s</div>' % (hesc(f["kind"]), hesc(f.get("caption", {}).get("title", ""))))
            elif k == "aside":
                for it in v:
                    t = " ".join(re.sub(r"<[^>]+>", "", by[p]["html"]) for p in it["rows"].split())
                    h.append('<div class="s"><b>aside</b> 注%s：%s <span class="n">%d 字</span></div>' % (hesc(it["no"]), hesc(t), len(t)))
            else:
                t = " ".join(re.sub(r"<[^>]+>", "", by[p]["html"]) for p in v)
                pct = (" <span class='n'>%d 字・目安の %d%%</span>" % (len(t), 100 * len(t) // cap)) if k == "body" else " <span class='n'>%d 字</span>" % len(t)
                h.append('<div class="s"><b>%s</b>%s<br>%s</div>' % (hesc(k), pct, hesc(t[:300])))
        h.append("</section>")
    open(out, "w", encoding="utf-8").write("\n".join(h))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest="cmd", required=True)
    sp.add_parser("formats")
    s = sp.add_parser("slots")
    s.add_argument("--format", required=True)
    s.add_argument("--variant")
    s.add_argument("--master")
    b = sp.add_parser("build")
    b.add_argument("--in", dest="inp", required=True)
    b.add_argument("--out", required=True)
    c = sp.add_parser("check")
    c.add_argument("file")
    pv = sp.add_parser("preview")
    pv.add_argument("file")
    pv.add_argument("out")
    a = ap.parse_args(argv)
    try:
        if a.cmd == "formats":
            return cmd_formats()
        if a.cmd == "slots":
            return cmd_slots(a.format, a.variant, a.master)
        if a.cmd == "build":
            inp = json.load(open(a.inp, encoding="utf-8"))
            note, errs, warns = build(inp)
            if note:
                e2, w2 = check_note(note)
                errs, warns = errs + e2, warns + w2
            for w in warns:
                print("警告:", w)
            if errs or not note:
                for e in errs:
                    print("誤り:", e)
                return 1
            with open(a.out, "w", encoding="utf-8") as f:
                json.dump(note, f, ensure_ascii=False, separators=(",", ":"))
            print("書いた:", a.out, "（行 %d・ページ %d）" % (len(note["note"]["content"]["rows"]), len(note["note"]["content"]["page2"]["pages"])))
            return 0
        note = json.load(open(a.file, encoding="utf-8"))
        if a.cmd == "preview":
            preview(note, a.out)
            print("書いた:", a.out)
            return 0
        errs, warns = check_note(note)
        for w in warns:
            print("警告:", w)
        for e in errs:
            print("誤り:", e)
        print("検査:", "通らない" if errs else "通る")
        return 1 if errs else 0
    except BuildError as e:
        print("誤り:", e)
        return 1


if __name__ == "__main__":
    sys.exit(main())
