#!/usr/bin/env python3
"""GNOTO Lite の命令行。Claude が 1 手ずつ呼んで .gnoto ファイルを作り・直す。

  python3 gnoto.py <命令> FILE.gnoto [オプション]      （Python 3.8+、標準ライブラリだけ）

どの編集命令も「読む→1 か所だけ直す→検査→書く」。検査で誤りが出たら書かない。
行番号・スライド番号は 1 始まり。--at N は「N 行目の前に入れる」（省略で末尾）。
終了コード：0 成功／1 誤り（形式・入力）／3 拒否（コネクタの結果が使えない状態。理由と候補を出す）。
法律の動作（条文・判例の取得）はこのプログラムにはない。Claude がコネクタを呼び、返った JSON を
law-* 命令に渡す（SKILL.md）。
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import gnoto_note as gn  # noqa: E402
import gnoto_law as gl  # noqa: E402


def out(msg):
    print(msg)


def read_arg(v):
    """'-' なら標準入力、'@path' ならファイル、それ以外はそのまま。"""
    if v == "-":
        return sys.stdin.read()
    if v and v.startswith("@"):
        with open(v[1:], "r", encoding="utf-8") as f:
            return f.read()
    return v


def read_json(path):
    with open(path, "r", encoding="utf-8") if path != "-" else sys.stdin as f:
        return json.load(f)


def edit(path, fn):
    note = gn.load(path)
    msg = fn(note)
    gn.save(path, note)
    _, warns = gn.validate(note)
    out(msg)
    for w in warns:
        out("注意：" + w)


# ---- 命令 --------------------------------------------------------------
def c_new(a):
    if os.path.exists(a.file) and not a.force:
        raise gn.NoteError("%s は既にある（上書きするなら --force）" % a.file)
    note = gn.new_note(a.title, a.style, a.n)
    # --heading は何もしない（互換のために残す）。GNOTO もプレビューも題を一番上に出すので、
    # 題と同じ見出しを本文に置くと、題が 2 回出る。
    gn.save(a.file, note)
    out("作った：%s（%s）" % (a.file, a.style))


def c_set(a):
    def f(note):
        n = note["note"]
        if a.title is not None:
            n["title"] = a.title
        if a.n is not None:
            n["n"] = a.n
        if a.style is not None:
            if a.style not in gn.STYLES:
                raise gn.NoteError("style は normal か slide だけ")
            if a.style != n.get("style"):
                c = gn.content_of(note)
                if a.style == "slide":
                    if not a.force:
                        raise gn.NoteError("normal→slide は本文が使われなくなる。--force で変える（本文は残る）")
                    c.setdefault("slides", [])
                    c.setdefault("cur", 0)
                else:
                    if not a.force:
                        raise gn.NoteError("slide→normal はスライドが表示されなくなる。--force で変える（スライドは残る）")
                    if not c.get("rows") or gn._is_blank_only(c["rows"]):
                        c["rows"] = [[{"html": ""}]]
                n["style"] = a.style
        return "直した：題=%s／style=%s／第%s回" % (n.get("title"), n.get("style"), n.get("n"))
    edit(a.file, f)


def c_info(a):
    note = gn.load(a.file)
    n = note["note"]
    out("題：%s／style：%s／第%s回" % (n.get("title"), gn.style_of(note), n.get("n", 0)))
    if gn.style_of(note) == "slide":
        for i, s in enumerate(gn.content_of(note).get("slides") or []):
            parts = []
            for e in s.get("els") or []:
                t = "[画像]" if e.get("type") == "image" else gn.strip_tags(e.get("html", "")).replace("\n", " ")
                parts.append("%s:%s" % (e.get("id"), t[:24]))
            out("%2d  %s  %s" % (i + 1, s.get("id"), " | ".join(parts)))
    else:
        for i, kind, pv in gn.describe_rows(note):
            out("%3d  %-8s %s" % (i, kind, pv))


def c_text(a):
    out(gn.to_text(gn.load(a.file)))


def c_check(a):
    note = gn.load(a.file)
    errs, warns = gn.validate(note)
    for e in errs:
        out("誤り：" + e)
    for w in warns:
        out("注意：" + w)
    out("検査：誤り %d・注意 %d" % (len(errs), len(warns)))
    return 1 if errs else 0


def c_search(a):
    paths = []
    for p in a.paths:
        if os.path.isdir(p):
            for root, _, files in os.walk(p):
                paths += [os.path.join(root, f) for f in files if f.lower().endswith((".gnoto", ".glyph"))]
        else:
            paths.append(p)
    hits = gn.search(sorted(paths), a.query)
    for p, ln, snip in hits:
        out("%s:%d: %s" % (p, ln, snip))
    out("一致 %d 件" % len(hits))


def c_render(a):
    import gnoto_render as gr
    note = gn.load(a.file)
    if a.html:
        with open(a.html, "w", encoding="utf-8") as f:
            f.write(gr.render(note))
        out("書いた：%s" % a.html)
    if a.png:
        r = gr.png(note, a.png, slide=a.slide)
        out("書いた：%s" % a.png if r else "PNG は作れなかった（ブラウザが見つからない、または失敗。HTML は有効）")
    if not a.html and not a.png:
        raise gn.NoteError("--html か --png のどちらかが要る")


def c_docx(a):
    import gnoto_export as ge
    ge.export_docx(gn.load(a.file), a.out)
    out("書いた：%s" % a.out)


# ---- ノーマルの追加 ------------------------------------------------------
def _add(a, rows):
    def f(note):
        n = gn.insert_rows(note, rows, a.at)
        return "追加：%d 行（%s）" % (n, "行 %d の前" % a.at if a.at else "末尾")
    edit(a.file, f)


def c_heading(a):
    t = read_arg(a.text)
    note = gn.load(a.file)
    title = str(note["note"].get("title", ""))
    rows = gn.content_of(note).get("rows") or []
    blank = all(not (isinstance(b, dict) and (b.get("html") or b.get("type"))) for r in rows for b in (r if isinstance(r, list) else [r]))
    if not a.html and blank and "".join(t.split()) == "".join(title.split()):
        out("省いた：題と同じ見出しは置かない（題は GNOTO とプレビューの一番上に出る）")
        return
    _add(a, [[gn.text_block(t, htype=a.level, html=a.html)]])


def c_text_add(a):
    t = read_arg(a.text)
    rows = []
    for para in ([t] if a.single else [x for x in t.split("\n\n") if x.strip()]):
        rows.append([gn.text_block(para, html=a.html)])
    _add(a, rows)


def c_list(a):
    items = [x for x in read_arg(a.items).split("\n") if x.strip()]
    rows = [[gn.text_block(x, list_="ol" if a.ordered else "ul", indent=a.indent, html=a.html)] for x in items]
    _add(a, rows)


def c_checks(a):
    rows = []
    for x in [x for x in read_arg(a.items).split("\n") if x.strip()]:
        done = x.startswith("[x]") or x.startswith("[X]")
        x = x[3:].strip() if x[:3] in ("[x]", "[X]", "[ ]") else x
        rows.append([gn.text_block(("☑ " if done else "☐ ") + x, done=done)])
    _add(a, rows)


def c_table(a):
    head = read_json_arg(a.head)
    rows = read_json_arg(a.rows)
    _add(a, [[gn.table_block(head, rows, html=a.html)]])


def read_json_arg(v):
    v = read_arg(v)
    return json.loads(v)


def c_quote(a):
    _add(a, [[gn.quote_block(read_arg(a.text), html=a.html)]])
    return


def c_code(a):
    _add(a, [[gn.code_block(read_arg(a.src), a.lang)]])


def c_hr(a):
    _add(a, [[gn.hr_block()]])


def c_toc(a):
    _add(a, [[{"toc": True}]])


def c_figure(a):
    src = gn.image_src_from_file(a.image) if not a.url else a.url
    _add(a, gn.figure_rows(src, a.caption or "", a.width))


def c_callout(a):
    rows = [[gn.text_block(p, html=a.html)] for p in read_arg(a.text).split("\n\n") if p.strip()]
    _add(a, [gn.callout_row(rows, a.tone)])


def c_toggle(a):
    rows = [[gn.text_block(p, html=a.html)] for p in read_arg(a.text).split("\n\n") if p.strip()]
    _add(a, [gn.toggle_row(a.title, rows, a.open)])


def c_cols(a):
    left = [[gn.text_block(p)] for p in read_arg(a.left).split("\n\n") if p.strip()]
    right = [[gn.text_block(p)] for p in read_arg(a.right).split("\n\n") if p.strip()]
    _add(a, [gn.cols_row(left, right)])


def c_addjson(a):
    """検査済みの行（JSON）をそのまま入れる。ブロック 1 個・ブロックの配列（＝1 行）・行の配列のどれでもよい。"""
    data = read_json(a.json)
    container = ("cols", "callout", "toggle")
    if isinstance(data, dict):
        rows = [data]
    elif isinstance(data, list) and data and all(isinstance(x, dict) and not any(k in x for k in container) for x in data):
        rows = [data]
    elif isinstance(data, list):
        rows = data
    else:
        raise gn.NoteError("JSON はブロック・行・行の配列のどれか")
    _add(a, rows)


def c_delete(a):
    edit(a.file, lambda note: (gn.delete_row(note, a.row), "消した：行 %d" % a.row)[1])


def c_move(a):
    edit(a.file, lambda note: (gn.move_row(note, a.frm, a.to), "動かした：行 %d → %d" % (a.frm, a.to))[1])


def c_replace(a):
    row = read_json(a.json)
    edit(a.file, lambda note: (gn.replace_row(note, a.row, row), "差し替えた：行 %d" % a.row)[1])


# ---- スライド ------------------------------------------------------------
def c_slide_add(a):
    def f(note):
        pos = gn.add_slide(note, a.layout, a.title or "", read_arg(a.body) if a.body else None,
                           read_arg(a.left) if a.left else None, read_arg(a.right) if a.right else None,
                           a.at, bullets=not a.no_bullets)
        return "スライド追加：%d 枚目（%s）" % (pos, a.layout)
    edit(a.file, f)


def c_slide_move(a):
    edit(a.file, lambda note: (gn.move_slide(note, a.frm, a.to), "動かした：%d → %d 枚目" % (a.frm, a.to))[1])


def c_slide_del(a):
    edit(a.file, lambda note: (gn.delete_slide(note, a.slide), "消した：%d 枚目" % a.slide)[1])


def c_slide_dup(a):
    edit(a.file, lambda note: "複製：%d 枚目" % gn.duplicate_slide(note, a.slide))


def c_slide_set(a):
    edit(a.file, lambda note: (gn.set_slide_props(note, a.slide, a.trans, read_arg(a.note) if a.note is not None else None),
                               "直した：%d 枚目" % a.slide)[1])


def c_el_text(a):
    def f(note):
        el = gn.add_text_el(note, a.slide, read_arg(a.text), a.x, a.y, a.w, a.h, size=a.size, weight=a.weight,
                            color=a.color, align=a.align, lh=a.lh)
        return "追加：%d 枚目に文字 %s" % (a.slide, el["id"])
    edit(a.file, f)


def c_el_image(a):
    def f(note):
        src = a.url or gn.image_src_from_file(a.image)
        el = gn.add_image_el(note, a.slide, src, a.x, a.y, a.w, a.h)
        return "追加：%d 枚目に画像 %s" % (a.slide, el["id"])
    edit(a.file, f)


def c_el_set(a):
    def f(note):
        gn.set_el(note, a.slide, a.el, x=a.x, y=a.y, w=a.w, h=a.h, z=a.z, anim=a.anim, anim_delay=a.anim_delay,
                  anim_dur=a.anim_dur, lines=read_arg(a.text) if a.text is not None else None, size=a.size,
                  weight=a.weight, color=a.color, align=a.align, lh=a.lh)
        return "直した：%d 枚目の %s" % (a.slide, a.el)
    edit(a.file, f)


def c_el_del(a):
    edit(a.file, lambda note: (gn.delete_el(note, a.slide, a.el), "消した：%d 枚目の %s" % (a.slide, a.el))[1])


# ---- 法律（コネクタの JSON を整形して書く。取得はしない） ----------------------
def _law_insert(a, rows, record):
    def f(note):
        if gn.style_of(note) != "normal":
            raise gn.NoteError("条文・判例の挿入はノーマルのノートだけ")
        gn.insert_rows(note, rows, a.at)
        gn.add_source_record(note, record)
        return "追加：%d 行（出典の記録つき）" % len(rows)
    edit(a.file, f)


def c_law_args(a):
    res = read_json(a.json)
    if a.all:
        ok, ng = gl.resolved_all(res)
        print(json.dumps({"resolved": ok, "refused": ng}, ensure_ascii=False, indent=1))
        return 3 if ng else 0
    print(json.dumps(gl.resolved_args(res, a.index), ensure_ascii=False, indent=1))


def c_law_statute(a):
    rows, rec = gl.statute_rows(read_json(a.json), asof=a.asof, numbers=a.numbers, paragraph=a.paragraph, item=a.item)
    _law_insert(a, rows, rec)


def c_law_case(a):
    verify = read_json(a.verify) if a.verify else None
    rows, rec = gl.case_rows(read_json(a.json), verify=verify)
    _law_insert(a, rows, rec)


def c_law_quote(a):
    rows, rec = gl.quote_rows(read_json(a.json), read_arg(a.quote), a.cite, as_judgment=not a.summary_ok)
    _law_insert(a, rows, rec)


def c_law_unverified(a):
    _law_insert(a, [[gn.unverified_line(read_arg(a.reason))]],
                {"kind": "unverified", "reason": read_arg(a.reason)})


# ---- 引数 ---------------------------------------------------------------
def build_parser():
    p = argparse.ArgumentParser(prog="gnoto.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    def add(name, fn, help_, file=True):
        sp = sub.add_parser(name, help=help_)
        if file:
            sp.add_argument("file")
        sp.set_defaults(fn=fn)
        return sp

    def at(sp):
        sp.add_argument("--at", type=int, default=None, help="N 行目の前に入れる（省略で末尾）")

    sp = add("new", c_new, "新しいノートを作る")
    sp.add_argument("--title", default="無題")
    sp.add_argument("--style", default="normal", choices=gn.STYLES)
    sp.add_argument("--n", type=int, default=0, help="第 n 回")
    sp.add_argument("--heading", action="store_true", help="（何もしない。題は一番上に出るので、同じ見出しは置かない）")
    sp.add_argument("--force", action="store_true")

    sp = add("set", c_set, "題・style・第 n 回を直す")
    sp.add_argument("--title")
    sp.add_argument("--style", choices=gn.STYLES)
    sp.add_argument("--n", type=int)
    sp.add_argument("--force", action="store_true")

    add("info", c_info, "行（またはスライド）の一覧")
    add("text", c_text, "ノートを素のテキストで読む")
    add("check", c_check, "形式の検査（誤り・注意）")
    sp = add("search", c_search, "ノートの中の文字列の検索（ファイルかフォルダを複数）", file=False)
    sp.add_argument("query")
    sp.add_argument("paths", nargs="+")
    sp = add("render", c_render, "静的な HTML プレビュー（--html）と PNG（--png。ブラウザがあるときだけ）")
    sp.add_argument("--html")
    sp.add_argument("--png")
    sp.add_argument("--slide", type=int, default=1, help="PNG にするスライドの番号")
    sp = add("docx", c_docx, "ノーマルを Word にする（LABA の build_docx.py と python-docx が要る）")
    sp.add_argument("out")

    sp = add("heading", c_heading, "見出しを足す")
    sp.add_argument("text")
    sp.add_argument("--level", type=int, default=1, choices=(1, 2, 3))
    sp.add_argument("--html", action="store_true", help="text を許可された HTML として扱う")
    at(sp)
    sp = add("add-text", c_text_add, "文章を足す（空行で段落を分ける。- か @file も可）")
    sp.add_argument("text")
    sp.add_argument("--single", action="store_true", help="分けずに 1 ブロック")
    sp.add_argument("--html", action="store_true")
    at(sp)
    sp = add("add-list", c_list, "箇条書き・番号つき（1 行 1 項目）")
    sp.add_argument("items")
    sp.add_argument("--ordered", action="store_true")
    sp.add_argument("--indent", choices=("1", "2"))
    sp.add_argument("--html", action="store_true")
    at(sp)
    sp = add("add-checks", c_checks, "チェックの列（[x] で済み・[ ] で未）")
    sp.add_argument("items")
    at(sp)
    sp = add("add-table", c_table, "表（--head と --rows は JSON）")
    sp.add_argument("--head", required=True, help='例：\'["項目","内容"]\'')
    sp.add_argument("--rows", required=True, help='例：\'[["甲","ア"]]\'')
    sp.add_argument("--html", action="store_true")
    at(sp)
    sp = add("add-quote", c_quote, "引用（blockquote）。条文・判旨の引用は law-quote を使う")
    sp.add_argument("text")
    sp.add_argument("--html", action="store_true")
    at(sp)
    sp = add("add-code", c_code, "コード（表示のみ。実行しない）")
    sp.add_argument("src")
    sp.add_argument("--lang", default="")
    at(sp)
    at(add("add-hr", c_hr, "区切り線"))
    at(add("add-toc", c_toc, "目次"))
    sp = add("add-figure", c_figure, "図（画像ファイルと見える題）")
    sp.add_argument("--image", help="利用者が渡した画像ファイル（png・jpeg・gif・webp・bmp）")
    sp.add_argument("--url", help="https の画像")
    sp.add_argument("--caption")
    sp.add_argument("--width", type=int, default=60, help="幅 15〜100（%%）")
    at(sp)
    sp = add("add-callout", c_callout, "囲み（key・warn・example・review）")
    sp.add_argument("text")
    sp.add_argument("--tone", choices=gn.TONES)
    sp.add_argument("--html", action="store_true")
    at(sp)
    sp = add("add-toggle", c_toggle, "折りたたみ（題に < > & は使えない）")
    sp.add_argument("title")
    sp.add_argument("text")
    sp.add_argument("--open", action="store_true")
    sp.add_argument("--html", action="store_true")
    at(sp)
    sp = add("add-cols", c_cols, "2 列")
    sp.add_argument("--left", required=True)
    sp.add_argument("--right", required=True)
    at(sp)
    sp = add("add-json", c_addjson, "行の JSON をそのまま足す（- で標準入力）")
    sp.add_argument("--json", required=True)
    at(sp)
    sp = add("delete", c_delete, "行を消す")
    sp.add_argument("row", type=int)
    sp = add("move", c_move, "行を動かす")
    sp.add_argument("frm", type=int)
    sp.add_argument("to", type=int)
    sp = add("replace", c_replace, "行を JSON で差し替える")
    sp.add_argument("row", type=int)
    sp.add_argument("--json", required=True)

    sp = add("slide-add", c_slide_add, "スライドを足す（layout：blank・title・title-body・section・two-col）")
    sp.add_argument("--layout", default="title-body", choices=gl_layouts())
    sp.add_argument("--title")
    sp.add_argument("--body")
    sp.add_argument("--left")
    sp.add_argument("--right")
    sp.add_argument("--no-bullets", action="store_true")
    sp.add_argument("--at", type=int)
    sp = add("slide-move", c_slide_move, "スライドを動かす")
    sp.add_argument("frm", type=int)
    sp.add_argument("to", type=int)
    sp = add("slide-del", c_slide_del, "スライドを消す")
    sp.add_argument("slide", type=int)
    sp = add("slide-dup", c_slide_dup, "スライドを複製する（直後に入る）")
    sp.add_argument("slide", type=int)
    sp = add("slide-set", c_slide_set, "切り替え（trans）と発表者ノート")
    sp.add_argument("slide", type=int)
    sp.add_argument("--trans")
    sp.add_argument("--note")
    sp = add("el-text", c_el_text, "スライドに文字の要素を足す（x y w h は面に対する %%）")
    sp.add_argument("slide", type=int)
    sp.add_argument("text")
    for k, d in (("x", 8), ("y", 26), ("w", 84), ("h", 66)):
        sp.add_argument("--" + k, type=float, default=d)
    sp.add_argument("--size", type=float, default=4.4, help="文字の大きさ（cqh＝面の高さの 1%%）")
    sp.add_argument("--weight")
    sp.add_argument("--color")
    sp.add_argument("--align", choices=("left", "center", "right"))
    sp.add_argument("--lh", type=float)
    sp = add("el-image", c_el_image, "スライドに画像の要素を足す")
    sp.add_argument("slide", type=int)
    sp.add_argument("--image")
    sp.add_argument("--url")
    for k, d in (("x", 60), ("y", 40), ("w", 30), ("h", 50)):
        sp.add_argument("--" + k, type=float, default=d)
    sp = add("el-set", c_el_set, "要素の位置・大きさ・重なり・動き・文字を直す")
    sp.add_argument("slide", type=int)
    sp.add_argument("el")
    for k in ("x", "y", "w", "h", "z", "size", "lh", "anim_delay", "anim_dur"):
        sp.add_argument("--" + k.replace("_", "-"), type=float, dest=k)
    sp.add_argument("--anim")
    sp.add_argument("--text")
    sp.add_argument("--weight")
    sp.add_argument("--color")
    sp.add_argument("--align", choices=("left", "center", "right"))
    sp = add("el-del", c_el_del, "要素を消す")
    sp.add_argument("slide", type=int)
    sp.add_argument("el")

    sp = add("law-args", c_law_args, "law_resolve_citation の JSON から law_get_article の引数を作る（曖昧なら拒否）", file=False)
    sp.add_argument("json")
    sp.add_argument("--index", type=int, default=0)
    sp.add_argument("--all", action="store_true")
    sp = add("law-statute", c_law_statute, "law_get_article の JSON を条文のブロックにする")
    sp.add_argument("--json", required=True)
    sp.add_argument("--asof")
    sp.add_argument("--numbers", choices=("auto", "always", "never"), default="auto")
    sp.add_argument("--paragraph", type=int, help="law_get_article に渡した項（見出しに「第N項」と出す）")
    sp.add_argument("--item", help="law_get_article に渡した号（見出しに「第M号」と出す）")
    at(sp)
    sp = add("law-case", c_law_case, "case_get（または case_verify_citation）の JSON を判例のブロックにする")
    sp.add_argument("--json", required=True)
    sp.add_argument("--verify", help="case_verify_citation の JSON（書誌の照合の行を足す）")
    at(sp)
    sp = add("law-quote", c_law_quote, "case_quote_check の JSON があるときだけ「」の引用を書く")
    sp.add_argument("--json", required=True)
    sp.add_argument("--quote", required=True, help="引用しようとした文")
    sp.add_argument("--cite", required=True, help="本文に出す判例の表記")
    sp.add_argument("--summary-ok", action="store_true", help="要旨・判示事項への一致でも書く（そう明記する）")
    at(sp)
    sp = add("law-unverified", c_law_unverified, "【未確認】の行を足す")
    sp.add_argument("--reason", required=True)
    at(sp)
    return p


def gl_layouts():
    return gn.LAYOUTS


def main(argv=None):
    p = build_parser()
    a = p.parse_args(argv)
    try:
        r = a.fn(a)
        return r or 0
    except gl.Refused as e:
        print("拒否：%s" % e)
        for c in e.candidates:
            print("  候補：%s" % json.dumps(c, ensure_ascii=False))
        return 3
    except gn.NoteError as e:
        print("誤り：%s" % e)
        return 1
    except (OSError, ValueError) as e:
        print("誤り：%s" % e)
        return 1


if __name__ == "__main__":
    sys.exit(main())
