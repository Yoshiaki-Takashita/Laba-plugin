#!/usr/bin/env python3
"""GNOTO Lite のノート部品：.gnoto ファイルの読み書き・検証・編集操作・文字への書き出し・検索。

このファイルは「ノートの形式」しか知らない。条文・判例・略称・引用の解析は持たない
（法律の動作は SKILL.md の手順で、Claude がコネクタを呼んで行う）。
形式の根拠は references/SPEC.md。Python 3.8+ の標準ライブラリだけで動く。

行（row）の形：
  [ブロック, …] ／ {"cols":[[B…],[B…]],"ratio":[1,1]} ／ {"callout":true,"tone":..,"rows":[行…]}
  ／ {"toggle":true,"open":false,"title":"題","rows":[行…]}
ブロック：{"html":…, "htype":"1"|"2"|"3", "list":"ul"|"ol", "indent":"1"|"2", "done":1}
  ／ {"hr":true} ／ {"table":{"head":[…],"rows":[[…]]}} ／ {"code":{"lang":…,"src":…}}
  ／ {"img":{"src":…,"wPct":40}} ／ {"toc":true} ／ {"embed":{"url":…,"kind":""}}
"""
import base64
import copy
import json
import mimetypes
import os
import re
import sys
import time
import unicodedata
from html import escape
from html.parser import HTMLParser

STYLES = ("normal", "slide")
EMPTY_ROWS = [[{"html": ""}]]
TONES = ("key", "warn", "example", "review")
MAX_SLIDES = 500
MAX_ELS = 500
MAX_TABLE_COLS = 50
MAX_TABLE_ROWS = 2000
IMG_MAX_BYTES = 4 * 1024 * 1024  # ノートに埋め込む画像の目安の上限（超えたら拒否）


class NoteError(Exception):
    """利用者に見せてよい、形式上の誤り。"""


# ---------------------------------------------------------------------------
# HTML の許可（読み込み側 GNOTO が通すものと同じ範囲。SPEC 1.4）
# ---------------------------------------------------------------------------
OK_TAGS = set("""a abbr b blockquote br caption code col colgroup dd div dl dt em font
h1 h2 h3 h4 h5 h6 hr i img li mark ol p pre q s small span strike strong sub sup table
tbody td tfoot th thead tr u ul wbr""".split())
VOID_TAGS = {"br", "hr", "img", "col", "wbr"}
DROP_WITH_CONTENT = set("""script style iframe form button input textarea select svg math object
embed noscript template head title meta link base frame frameset applet audio video canvas""".split())
OK_ATTRS = set("alt title width height dir lang color face start align valign colspan rowspan".split())
OK_STYLE = set("""color background-color background text-align font-weight font-style text-decoration
font-size font-family line-height margin margin-left margin-right padding padding-left list-style-type
white-space vertical-align border border-bottom border-left width max-width opacity""".split())
BAD_STYLE_VALUE = re.compile(r"url\(|var\(|expression|[<>\\]", re.I)
OK_DATA_ATTRS = {"data-ph", "data-nid", "data-ct"}
IMG_SRC_RE = re.compile(r"^data:image/(png|jpeg|gif|webp|bmp);base64,[A-Za-z0-9+/=\s]+$", re.I)
HREF_RE = re.compile(r"^(https?:|mailto:|tel:|/|#)", re.I)


def img_src_ok(src):
    s = str(src or "").strip()
    return bool(s.lower().startswith("https://") or IMG_SRC_RE.match(s))


def clean_style(style):
    """許可された性質だけ残した style を返す。(新しい文字列, 落とした性質の一覧)"""
    keep, dropped = [], []
    for part in str(style).split(";"):
        if ":" not in part:
            continue
        prop, val = part.split(":", 1)
        prop = prop.strip().lower()
        val = val.strip()
        if not prop:
            continue
        if prop in OK_STYLE and val and not BAD_STYLE_VALUE.search(val):
            keep.append("%s:%s" % (prop, val))
        else:
            dropped.append(prop)
    return ";".join(keep), dropped


class _Sanitizer(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out = []
        self.issues = []
        self._skip = 0
        self._skip_tag = None
        self._open = []

    def handle_starttag(self, tag, attrs):
        if self._skip:
            if tag == self._skip_tag:
                self._skip += 1
            return
        if tag in DROP_WITH_CONTENT:
            self.issues.append("<%s> は中身ごと落ちる" % tag)
            self._skip, self._skip_tag = 1, tag
            return
        if tag not in OK_TAGS:
            self.issues.append("<%s> はタグだけ落ちる" % tag)
            return
        parts = []
        for k, v in attrs:
            k = k.lower()
            v = "" if v is None else v
            if k.startswith("on"):
                self.issues.append("%s 属性は落ちる" % k)
            elif k == "style":
                st, dropped = clean_style(v)
                for d in dropped:
                    self.issues.append("style の %s は落ちる" % d)
                if st:
                    parts.append(' style="%s"' % escape(st, quote=True))
            elif k == "href" and tag == "a":
                if HREF_RE.match(v.strip()):
                    parts.append(' href="%s"' % escape(v.strip(), quote=True))
                else:
                    self.issues.append("href が許可外（http・https・mailto・tel・/・# 以外）")
            elif k == "src" and tag == "img":
                if img_src_ok(v):
                    parts.append(' src="%s"' % escape(v.strip(), quote=True))
                else:
                    self.issues.append("img の src が許可外（https か data:image だけ）")
            elif k == "class":
                if re.match(r"^[A-Za-z0-9 _-]*$", v):
                    parts.append(' class="%s"' % escape(v, quote=True))
                else:
                    self.issues.append("class に使えない文字")
            elif k in OK_ATTRS:
                parts.append(' %s="%s"' % (k, escape(v, quote=True)))
            elif k in OK_DATA_ATTRS:
                parts.append(' %s="%s"' % (k, escape(v, quote=True)))
            elif k == "target" or k == "rel":
                pass
            else:
                self.issues.append("%s 属性は落ちる" % k)
        if tag == "a":
            parts.append(' rel="noopener noreferrer" target="_blank"')
        self.out.append("<%s%s>" % (tag, "".join(parts)))
        if tag not in VOID_TAGS:
            self._open.append(tag)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID_TAGS and self._open and self._open[-1] == tag and not self._skip:
            self.out.append("</%s>" % self._open.pop())

    def handle_endtag(self, tag):
        if self._skip:
            if tag == self._skip_tag:
                self._skip -= 1
            return
        if tag in OK_TAGS and tag not in VOID_TAGS and tag in self._open:
            while self._open:
                t = self._open.pop()
                self.out.append("</%s>" % t)
                if t == tag:
                    break

    def handle_data(self, data):
        if not self._skip:
            self.out.append(escape(data, quote=False))

    def close(self):
        super().close()
        while self._open:
            self.out.append("</%s>" % self._open.pop())


def sanitize_html(s):
    """(安全な html, 落ちるものの一覧)。表示（preview）でも検査（check）でも同じものを使う。"""
    p = _Sanitizer()
    p.feed(str(s or ""))
    p.close()
    return "".join(p.out), sorted(set(p.issues))


def inline(text):
    """書く人が渡す素の文字を html にする。HTML の記号は文字として扱い、**太字** と改行だけ変える。"""
    t = escape(str(text), quote=False)
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    return t.replace("\r\n", "\n").replace("\n", "<br>")


def strip_tags(html):
    """html から見える文字だけ取り出す（検索・読み出し用）。"""
    s = re.sub(r"<br\s*/?>", "\n", str(html or ""), flags=re.I)
    s = re.sub(r"</(p|div|li|tr|h[1-6]|blockquote)>", "\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    from html import unescape
    return unescape(s).strip()


# ---------------------------------------------------------------------------
# ファイルの読み書き
# ---------------------------------------------------------------------------
def now_ms():
    return int(time.time() * 1000)


def new_note(title="無題", style="normal", n=0):
    if style not in STYLES:
        raise NoteError("style は normal か slide だけ（%r は不可）" % style)
    content = {"title": title, "rows": copy.deepcopy(EMPTY_ROWS), "scroll": 0, "updated": now_ms(),
               "cCue": "", "cSum": ""}
    if style == "slide":
        content["cur"] = 0
        content["slides"] = []
    else:
        content["body"] = ""
    note = {"glyph": "note", "version": 1, "exportedAt": now_ms(), "app": "GNOTO", "card": None,
            "note": {"title": title, "style": style, "n": int(n), "content": content, "books": [], "pen": []}}
    return note


def load(path):
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()
    if text.startswith("﻿"):
        text = text[1:]
    try:
        obj = json.loads(text)
    except ValueError as e:
        raise NoteError("JSON として読めない：%s" % e)
    if not isinstance(obj, dict) or obj.get("glyph") != "note" or not isinstance(obj.get("note"), dict):
        raise NoteError("GNOTO のノートではない（glyph が note でない、または note が無い）")
    return obj


def save(path, note):
    """検査してから書く。誤りがあれば書かない。UTF-8・BOM なし・インデントなし（アプリの書き出しと同じ）。"""
    errors, _ = validate(note)
    if errors:
        raise NoteError("検査で誤りが出たので書かない：" + "；".join(errors[:5]))
    touch(note)
    data = json.dumps(note, ensure_ascii=False, separators=(",", ":"))
    tmp = "%s.tmp%d" % (path, os.getpid())
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        f.write(data)
    os.replace(tmp, path)


def content_of(note):
    n = note["note"]
    c = n.get("content")
    if not isinstance(c, dict):
        c = {"title": n.get("title", ""), "rows": copy.deepcopy(EMPTY_ROWS)}
        n["content"] = c
    return c


def style_of(note):
    return str(note["note"].get("style") or "normal")


def touch(note):
    note["exportedAt"] = now_ms()
    c = content_of(note)
    c["updated"] = now_ms()
    c["title"] = note["note"].get("title", c.get("title", ""))
    if style_of(note) == "normal":
        c["body"] = rows_to_body(c.get("rows") or [])
    elif "body" not in c:
        c["body"] = ""
    if style_of(note) == "slide":
        c["rows"] = copy.deepcopy(EMPTY_ROWS)


def rows_to_body(rows):
    """互換用の簡易な HTML の写し（rows が正）。"""
    out = []

    def blk(b):
        if "html" in b:
            return "<div>%s</div>" % (b.get("html") or "")
        if "hr" in b:
            return "<hr>"
        if "table" in b:
            return "<div></div>"
        return "<div></div>"

    def row(r):
        if isinstance(r, list):
            return "".join(blk(b) for b in r if isinstance(b, dict))
        if isinstance(r, dict):
            if "rows" in r:
                return "".join(row(x) for x in r["rows"])
            if "cols" in r:
                return "".join(blk(b) for c in r["cols"] for b in c if isinstance(b, dict))
        return ""
    for r in rows:
        out.append(row(r))
    return "".join(out)


# ---------------------------------------------------------------------------
# ブロック・行の作り方
# ---------------------------------------------------------------------------
def text_block(text, htype=None, list_=None, indent=None, done=None, html=False):
    """文章ブロック。html=True のときは許可された HTML だけ（落ちるものがあれば拒否）。"""
    h = str(text) if html else inline(text)
    if html:
        _, issues = sanitize_html(h)
        if issues:
            raise NoteError("HTML に GNOTO が読み込みで落とすものがある：" + "、".join(issues[:4]))
    b = {"html": h}
    if htype is not None:
        if str(htype) not in ("1", "2", "3"):
            raise NoteError("見出しは 1・2・3 だけ")
        b["htype"] = str(htype)
    if list_ is not None:
        if list_ not in ("ul", "ol"):
            raise NoteError("list は ul か ol だけ")
        b["list"] = list_
    if indent is not None and str(indent) not in ("0", ""):
        if str(indent) not in ("1", "2"):
            raise NoteError("indent は 1 か 2 だけ")
        b["indent"] = str(indent)
    if done:
        b["done"] = 1
    return b


def table_block(head, rows, html=False):
    if not head:
        raise NoteError("表には見出し行（head）が要る")
    if len(head) > MAX_TABLE_COLS or len(rows) > MAX_TABLE_ROWS:
        raise NoteError("表が大きすぎる（列 %d・行 %d まで）" % (MAX_TABLE_COLS, MAX_TABLE_ROWS))
    conv = (lambda s: str(s)) if html else inline
    h = [conv(c) for c in head]
    body = []
    for r in rows:
        r = [conv(c) for c in r][:len(h)]
        r += [""] * (len(h) - len(r))
        body.append(r)
    return {"table": {"head": h, "rows": body}}


def code_block(src, lang=""):
    return {"code": {"lang": re.sub(r"[^a-z0-9+#-]", "", str(lang).lower())[:20], "src": str(src)}}


def image_src_from_file(path):
    """利用者が渡した画像ファイルを data URI にする（ネットからは取らない）。"""
    mt = mimetypes.guess_type(path)[0] or ""
    if mt not in ("image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp"):
        raise NoteError("画像は png・jpeg・gif・webp・bmp だけ：%s" % path)
    with open(path, "rb") as f:
        raw = f.read()
    if len(raw) > IMG_MAX_BYTES:
        raise NoteError("画像が大きすぎる（%d バイト。上限 %d）" % (len(raw), IMG_MAX_BYTES))
    return "data:%s;base64,%s" % (mt, base64.b64encode(raw).decode("ascii"))


def image_block(src, w_pct=60):
    if not img_src_ok(src):
        raise NoteError("画像の src は https:// か data:image/(png|jpeg|gif|webp|bmp);base64 だけ")
    w = max(15, min(100, int(w_pct)))
    return {"img": {"src": src, "wPct": w}}


def figure_rows(src, caption="", w_pct=60):
    """図：画像ブロック＋見える題（文章ブロック）。"""
    rows = [[image_block(src, w_pct)]]
    if caption:
        rows.append([{"html": '<span style="color:#666;font-size:13px">%s</span>' % inline(caption)}])
    return rows


def hr_block():
    return {"hr": True}


def callout_row(rows, tone=None):
    r = {"callout": True, "rows": rows}
    if tone:
        if tone not in TONES:
            raise NoteError("tone は %s のどれか" % "・".join(TONES))
        r["tone"] = tone
    return r


def toggle_row(title, rows, open_=False):
    if re.search(r"[<>&]", title):
        raise NoteError("折りたたみの題には < > & を入れない（読み込みで文字として見えてしまう）")
    return {"toggle": True, "open": bool(open_), "title": str(title), "rows": rows}


def cols_row(left_rows, right_rows, ratio=(1, 1)):
    return {"cols": [[b for r in left_rows for b in r], [b for r in right_rows for b in r]],
            "ratio": [float(ratio[0]), float(ratio[1])]}


def quote_block(text, html=False):
    """引用（見た目は blockquote。引用の見た目の保存は GNOTO に無いので、タグで書く）。"""
    inner = str(text) if html else inline(text)
    h = ('<blockquote style="margin:0;padding-left:12px;border-left:3px solid #c8ccd2;color:#444">%s</blockquote>'
         % inner)
    _, issues = sanitize_html(h)
    if issues:
        raise NoteError("引用の HTML に落ちるものがある：" + "、".join(issues[:4]))
    return {"html": h}


def source_line(text):
    """出典・注記の行（灰色の小さな文字）。"""
    return {"html": '<span style="color:#8a929b;font-size:13px">%s</span>' % inline(text)}


def unverified_line(reason):
    return {"html": '<span style="color:#c0392b">【未確認】</span>%s' % inline(reason)}


# ---------------------------------------------------------------------------
# 行の編集（ノーマル）
# ---------------------------------------------------------------------------
def _norm_row(r):
    """1 行を正規の形にする。ブロック 1 個だけ渡されたら配列に包む。"""
    if isinstance(r, dict) and not any(k in r for k in ("cols", "callout", "toggle")):
        return [r]
    return r


def _rows(note):
    if style_of(note) != "normal":
        raise NoteError("行の編集はノーマルのノートだけ（スライドは slide- の命令を使う）")
    c = content_of(note)
    if not isinstance(c.get("rows"), list):
        c["rows"] = copy.deepcopy(EMPTY_ROWS)
    return c["rows"]


def _is_blank_only(rows):
    return len(rows) == 1 and isinstance(rows[0], list) and len(rows[0]) == 1 and \
        rows[0][0] == {"html": ""}


def insert_rows(note, new_rows, at=None):
    """at は 1 始まり（その行の前に入れる）。省略すると末尾。最初の空行だけのノートでは空行を置き換える。"""
    rows = _rows(note)
    new_rows = [_norm_row(r) for r in new_rows]
    if _is_blank_only(rows):
        rows[:] = []
    if at is None or at > len(rows):
        rows.extend(new_rows)
    else:
        if at < 1:
            raise NoteError("位置は 1 以上")
        rows[at - 1:at - 1] = new_rows
    return len(new_rows)


def delete_row(note, idx):
    rows = _rows(note)
    if not 1 <= idx <= len(rows):
        raise NoteError("行 %d は無い（1〜%d）" % (idx, len(rows)))
    rows.pop(idx - 1)
    if not rows:
        rows.append([{"html": ""}])


def move_row(note, frm, to):
    rows = _rows(note)
    n = len(rows)
    if not (1 <= frm <= n and 1 <= to <= n):
        raise NoteError("行の番号は 1〜%d" % n)
    rows.insert(to - 1, rows.pop(frm - 1))


def replace_row(note, idx, row):
    rows = _rows(note)
    if not 1 <= idx <= len(rows):
        raise NoteError("行 %d は無い（1〜%d）" % (idx, len(rows)))
    rows[idx - 1] = _norm_row(row)


# ---------------------------------------------------------------------------
# スライド
# ---------------------------------------------------------------------------
def _slides(note):
    if style_of(note) != "slide":
        raise NoteError("スライドの編集は slide のノートだけ")
    c = content_of(note)
    if not isinstance(c.get("slides"), list):
        c["slides"] = []
    return c["slides"]


def _all_ids(note):
    ids = set()
    for s in content_of(note).get("slides") or []:
        ids.add(s.get("id"))
        for e in s.get("els") or []:
            ids.add(e.get("id"))
    return ids


def _new_id(note, prefix):
    ids = _all_ids(note)
    i = 1
    while "%s%d" % (prefix, i) in ids:
        i += 1
    return "%s%d" % (prefix, i)


def slide_text_html(lines, size=4.4, weight=None, color=None, align=None, lh=None):
    """スライドの文字要素の html。size は cqh（面の高さの 1%）。"""
    st = ["font-size:%gcqh" % size]
    if weight:
        st.append("font-weight:%s" % weight)
    if color:
        st.append("color:%s" % color)
    if align:
        st.append("text-align:%s" % align)
    if lh:
        st.append("line-height:%s" % lh)
    if isinstance(lines, str):
        lines = lines.split("\n")
    return '<div style="%s">%s</div>' % (";".join(st), "<br>".join(inline(x) for x in lines))


def _clamp(v, lo, hi):
    return max(lo, min(hi, float(v)))


def add_text_el(note, slide_idx, lines, x, y, w, h, size=4.4, weight=None, color=None, align=None,
                lh=None, html=None):
    slides = _slides(note)
    sl = _slide_at(slides, slide_idx)
    if len(sl["els"]) >= MAX_ELS:
        raise NoteError("1 枚の要素は %d まで" % MAX_ELS)
    h_html = html if html is not None else slide_text_html(lines, size, weight, color, align, lh)
    _, issues = sanitize_html(h_html)
    if issues:
        raise NoteError("HTML に GNOTO が読み込みで落とすものがある：" + "、".join(issues[:4]))
    z = max([e.get("z", 0) for e in sl["els"]] + [0]) + 1
    el = {"id": _new_id(note, "e"), "type": "text", "x": _clamp(x, -100, 200), "y": _clamp(y, -100, 200),
          "w": _clamp(w, 0, 300), "h": _clamp(h, 0, 300), "z": z, "html": h_html}
    sl["els"].append(el)
    return el


def add_image_el(note, slide_idx, src, x, y, w, h):
    if not img_src_ok(src):
        raise NoteError("画像の src は https:// か data:image だけ")
    slides = _slides(note)
    sl = _slide_at(slides, slide_idx)
    z = max([e.get("z", 0) for e in sl["els"]] + [0]) + 1
    el = {"id": _new_id(note, "e"), "type": "image", "x": _clamp(x, -100, 200), "y": _clamp(y, -100, 200),
          "w": _clamp(w, 0, 300), "h": _clamp(h, 0, 300), "z": z, "src": src}
    sl["els"].append(el)
    return el


def _slide_at(slides, idx):
    if not 1 <= idx <= len(slides):
        raise NoteError("スライド %d は無い（1〜%d）" % (idx, len(slides)))
    return slides[idx - 1]


LAYOUTS = ("blank", "title", "title-body", "section", "two-col")


def add_slide(note, layout="blank", title="", body=None, left=None, right=None, at=None, bullets=True):
    """型（レイアウト）は寸法の目安だけ。SPEC 2.2 の値（題 8,7,84,14／本文 8,26,84,66／2 カラム 8,26,42,66・50,26,42,66）。"""
    if layout not in LAYOUTS:
        raise NoteError("layout は %s のどれか" % "・".join(LAYOUTS))
    slides = _slides(note)
    if len(slides) >= MAX_SLIDES:
        raise NoteError("スライドは %d 枚まで" % MAX_SLIDES)
    sl = {"id": _new_id(note, "sl"), "els": []}
    pos = len(slides) + 1 if at is None else max(1, min(at, len(slides) + 1))
    slides.insert(pos - 1, sl)

    def lines(v):
        if v is None:
            return []
        v = v.split("\n") if isinstance(v, str) else list(v)
        return [("・" + x) if bullets and x and not x.startswith("・") else x for x in v]
    if layout == "title":
        add_text_el(note, pos, [title], 8, 30, 84, 20, size=9, weight="800", color="#185FA5", align="center")
        if body:
            sub = body.split("\n") if isinstance(body, str) else list(body)
            add_text_el(note, pos, sub, 8, 56, 84, 10, size=4.4, color="#666", align="center")
    elif layout == "section":
        add_text_el(note, pos, [title], 8, 38, 84, 20, size=8, weight="800", color="#185FA5", align="center")
    elif layout == "title-body":
        add_text_el(note, pos, [title], 8, 7, 84, 14, size=7, weight="700")
        add_text_el(note, pos, lines(body), 8, 26, 84, 66, size=4.4, lh=1.5)
    elif layout == "two-col":
        add_text_el(note, pos, [title], 8, 7, 84, 14, size=7, weight="700")
        add_text_el(note, pos, lines(left), 8, 26, 42, 66, size=4.4, lh=1.5)
        add_text_el(note, pos, lines(right), 50, 26, 42, 66, size=4.4, lh=1.5)
    c = content_of(note)
    c["cur"] = pos - 1
    return pos


def move_slide(note, frm, to):
    slides = _slides(note)
    n = len(slides)
    if not (1 <= frm <= n and 1 <= to <= n):
        raise NoteError("スライドの番号は 1〜%d" % n)
    slides.insert(to - 1, slides.pop(frm - 1))


def delete_slide(note, idx):
    slides = _slides(note)
    _slide_at(slides, idx)
    slides.pop(idx - 1)
    c = content_of(note)
    c["cur"] = max(0, min(int(c.get("cur") or 0), len(slides) - 1))


def duplicate_slide(note, idx):
    slides = _slides(note)
    src = _slide_at(slides, idx)
    dup = copy.deepcopy(src)
    dup["id"] = _new_id(note, "sl")
    slides.insert(idx, dup)
    for e in dup["els"]:
        e["id"] = _new_id(note, "e")  # 1 つずつ割り当てるので衝突しない
        # _new_id は dup が入った後の全 id を見るので、順に一意になる
    return idx + 1


SLIDE_TRANS = ("none", "morph", "fade", "pushL", "pushR", "up", "wipe", "zoom", "flip")
EL_ANIMS = ("none", "fade", "flyL", "flyR", "flyU", "flyD", "zoom", "rotate")


def set_slide_props(note, idx, trans=None, speaker_note=None):
    sl = _slide_at(_slides(note), idx)
    if trans is not None:
        if trans not in SLIDE_TRANS:
            raise NoteError("trans は %s のどれか" % "・".join(SLIDE_TRANS))
        sl["trans"] = trans
    if speaker_note is not None:
        sl["note"] = str(speaker_note)


def set_el(note, slide_idx, el_id, **kw):
    sl = _slide_at(_slides(note), slide_idx)
    el = next((e for e in sl["els"] if e.get("id") == el_id), None)
    if el is None:
        raise NoteError("要素 %s は無い" % el_id)
    for k in ("x", "y", "w", "h"):
        if kw.get(k) is not None:
            el[k] = _clamp(kw[k], -100 if k in "xy" else 0, 200 if k in "xy" else 300)
    if kw.get("z") is not None:
        el["z"] = int(kw["z"])
    if kw.get("anim") is not None:
        if kw["anim"] not in EL_ANIMS:
            raise NoteError("anim は %s のどれか" % "・".join(EL_ANIMS))
        el["anim"] = {"t": kw["anim"], "d": float(kw.get("anim_delay") or 0), "dur": float(kw.get("anim_dur") or 0.5)}
    if kw.get("lines") is not None:
        if el.get("type") != "text":
            raise NoteError("文字を直せるのは文字の要素だけ")
        el["html"] = slide_text_html(kw["lines"], kw.get("size") or 4.4, kw.get("weight"), kw.get("color"),
                                     kw.get("align"), kw.get("lh"))
    return el


def delete_el(note, slide_idx, el_id):
    sl = _slide_at(_slides(note), slide_idx)
    n = len(sl["els"])
    sl["els"] = [e for e in sl["els"] if e.get("id") != el_id]
    if len(sl["els"]) == n:
        raise NoteError("要素 %s は無い" % el_id)


def estimate_overflow(el):
    """文字要素が、箱に収まらなさそうなら警告の文を返す（面は 16:9。文字は全角 1 字 ≒ font-size 幅として概算）。"""
    html = el.get("html") or ""
    m = re.search(r"font-size:([0-9.]+)cqh", html)
    size = float(m.group(1)) if m else 4.4
    lm = re.search(r"line-height:([0-9.]+)", html)
    lh = float(el.get("lh") or (lm.group(1) if lm else 1.4))
    text = strip_tags(html)
    width_cqh = 100.0 * 16 / 9 * float(el.get("w", 0)) / 100.0 - 1.4 * 16 / 9
    per_line = max(1, int(width_cqh / size))
    nlines = 0
    for ln in text.split("\n"):
        w = sum(2 if unicodedata.east_asian_width(ch) in "WF" else 1 for ch in ln)
        nlines += max(1, -(-w // (2 * per_line))) if ln else 1
    need = nlines * size * lh + 1.0
    if need > float(el.get("h", 0)) + 0.5:
        return "文字が箱に収まらない可能性（約 %d 行・高さ %.0f 必要／箱 %.0f）" % (nlines, need, float(el.get("h", 0)))
    return None


# ---------------------------------------------------------------------------
# 検査
# ---------------------------------------------------------------------------
def _walk_blocks(rows, path, depth=0):
    """(場所, ブロック) を順に返す。"""
    if depth > 64:
        return
    for i, r in enumerate(rows if isinstance(rows, list) else []):
        here = "%s行%d" % (path, i + 1)
        if isinstance(r, list):
            for b in r:
                yield here, b
        elif isinstance(r, dict):
            if "cols" in r:
                for ci, col in enumerate(r.get("cols") or []):
                    for b in col if isinstance(col, list) else []:
                        yield "%s列%d" % (here, ci + 1), b
            elif "rows" in r:
                for x in _walk_blocks(r["rows"], here + "の中の", depth + 1):
                    yield x
        else:
            yield here, r


def validate(note):
    """(errors, warnings)。errors があると save しない。warnings は GNOTO で欠ける・崩れる恐れ。"""
    errors, warns = [], []
    if not isinstance(note, dict) or note.get("glyph") != "note":
        return ["glyph が note でない"], warns
    n = note.get("note")
    if not isinstance(n, dict):
        return ["note が無い"], warns
    if not isinstance(n.get("title", ""), str):
        errors.append("title は文字列")
    style = n.get("style", "normal")
    if not re.match(r"^[a-z0-9_-]{1,24}$", str(style)):
        errors.append("style の形が不正（英数・_・- で 24 字まで）")
    elif style not in STYLES:
        warns.append("style=%s は Lite の対象外（そのまま残す。編集はしない）" % style)
    c = n.get("content")
    if c is None:
        return errors, warns
    if not isinstance(c, dict):
        return errors + ["content がオブジェクトでない"], warns
    rows = c.get("rows")
    if rows is not None and not isinstance(rows, list):
        errors.append("rows が配列でない")
        rows = []
    if style == "normal" and (not rows):
        errors.append("ノーマルは rows が 1 行以上要る")
    for where, b in _walk_blocks(rows or [], ""):
        if not isinstance(b, dict):
            errors.append("%s：ブロックがオブジェクトでない" % where)
            continue
        if "html" in b:
            if not isinstance(b["html"], str):
                errors.append("%s：html が文字列でない" % where)
                continue
            for k in ("htype", "indent"):
                if k in b and not isinstance(b[k], str):
                    errors.append("%s：%s は文字列（\"1\" のように）" % (where, k))
            _, issues = sanitize_html(b["html"])
            for i in issues:
                warns.append("%s：%s" % (where, i))
        elif "table" in b:
            t = b["table"]
            if not isinstance(t, dict) or not isinstance(t.get("head"), list) or not isinstance(t.get("rows"), list):
                errors.append("%s：表は head と rows が要る" % where)
            elif len(t["head"]) > MAX_TABLE_COLS or len(t["rows"]) > MAX_TABLE_ROWS:
                errors.append("%s：表が大きすぎる" % where)
        elif "img" in b:
            if not isinstance(b["img"], dict) or not img_src_ok(b["img"].get("src")):
                errors.append("%s：画像の src が許可外（https か data:image だけ）" % where)
        elif "embed" in b:
            u = (b.get("embed") or {}).get("url", "")
            if not str(u).lower().startswith("https://"):
                errors.append("%s：埋め込みは https だけ" % where)
        elif any(k in b for k in ("hr", "code", "toc", "struct", "phys", "kanbun")):
            pass
        elif any(k in b for k in ("noteref", "noteembed", "collection")):
            warns.append("%s：このブロックは GNOTO の読み込みで空の文章になる" % where)
        else:
            warns.append("%s：知らない形のブロック（GNOTO の読み込みで空行になる）" % where)
    if style == "slide":
        slides = c.get("slides")
        if not isinstance(slides, list):
            errors.append("slide のノートに slides が無い")
            slides = []
        if len(slides) > MAX_SLIDES:
            errors.append("スライドが %d 枚を超えている" % MAX_SLIDES)
        ids = set()
        for si, s in enumerate(slides):
            if not isinstance(s, dict) or not isinstance(s.get("els"), list):
                errors.append("スライド%d：els が無い" % (si + 1))
                continue
            if s.get("id") in ids:
                errors.append("スライド%d：id が重複" % (si + 1))
            ids.add(s.get("id"))
            if s.get("trans") is not None and s["trans"] not in SLIDE_TRANS:
                warns.append("スライド%d：trans=%s は知らない値" % (si + 1, s["trans"]))
            if len(s["els"]) > MAX_ELS:
                errors.append("スライド%d：要素が %d を超えている" % (si + 1, MAX_ELS))
            for e in s["els"]:
                if not isinstance(e, dict):
                    errors.append("スライド%d：要素がオブジェクトでない" % (si + 1))
                    continue
                if e.get("id") in ids:
                    errors.append("スライド%d：要素 id %s が重複" % (si + 1, e.get("id")))
                ids.add(e.get("id"))
                for k in ("x", "y", "w", "h"):
                    if not isinstance(e.get(k), (int, float)):
                        errors.append("スライド%d：要素 %s の %s が数でない" % (si + 1, e.get("id"), k))
                if e.get("type") == "image":
                    if not img_src_ok(e.get("src")):
                        errors.append("スライド%d：画像の src が許可外" % (si + 1))
                else:
                    _, issues = sanitize_html(e.get("html", ""))
                    for i in issues:
                        warns.append("スライド%d 要素%s：%s" % (si + 1, e.get("id"), i))
                    if all(isinstance(e.get(k), (int, float)) for k in ("w", "h")):
                        w = estimate_overflow(e)
                        if w:
                            warns.append("スライド%d 要素%s：%s" % (si + 1, e.get("id"), w))
        if slides and not (0 <= int(c.get("cur") or 0) < len(slides)):
            warns.append("cur が範囲外")
    return errors, warns


# ---------------------------------------------------------------------------
# 読み出し・検索
# ---------------------------------------------------------------------------
def describe_rows(note):
    """行の一覧（行番号 1 始まり・種類・要約）。Claude が編集の位置を決めるための表。"""
    out = []
    for i, r in enumerate(content_of(note).get("rows") or []):
        out.append((i + 1, _row_kind(r), _row_preview(r)))
    return out


def _row_kind(r):
    if isinstance(r, dict):
        if r.get("toggle"):
            return "toggle"
        if r.get("callout"):
            return "callout"
        if "cols" in r:
            return "cols"
    b = r[0] if isinstance(r, list) and r else {}
    if "html" in b:
        if b.get("htype"):
            return "h" + str(b["htype"])
        if b.get("list"):
            return b["list"]
        return "text"
    for k in ("hr", "table", "code", "img", "toc", "embed"):
        if k in b:
            return k
    return "other"


def _row_preview(r, limit=50):
    if isinstance(r, dict):
        if r.get("toggle"):
            return str(r.get("title", ""))[:limit]
        if "rows" in r:
            return " / ".join(_row_preview(x, limit) for x in r["rows"])[:limit]
        if "cols" in r:
            return " | ".join(strip_tags(b.get("html", "")) for c in r["cols"] for b in c)[:limit]
    b = r[0] if isinstance(r, list) and r else {}
    if "html" in b:
        return strip_tags(b["html"]).replace("\n", " ")[:limit]
    if "table" in b:
        return " | ".join(strip_tags(h) for h in b["table"].get("head", []))[:limit]
    if "code" in b:
        return str(b["code"].get("src", "")).split("\n")[0][:limit]
    return ""


def to_text(note):
    """ノートを Claude が読むための素のテキストにする。"""
    n = note["note"]
    c = content_of(note)
    out = ["# %s" % n.get("title", ""), "（style=%s）" % style_of(note), ""]

    def blk(b, ind=""):
        if not isinstance(b, dict):
            return
        if "html" in b:
            t = strip_tags(b["html"])
            ht = b.get("htype")
            if ht:
                out.append("%s%s %s" % (ind, "#" * (int(ht) + 1), t))
            elif b.get("list") == "ul":
                out.append("%s%s・%s" % (ind, "  " * int(b.get("indent") or 0), t))
            elif b.get("list") == "ol":
                out.append("%s%s1. %s" % (ind, "  " * int(b.get("indent") or 0), t))
            else:
                out.append("%s%s%s" % (ind, "[済] " if b.get("done") else "", t))
        elif "hr" in b:
            out.append(ind + "---")
        elif "table" in b:
            t = b["table"]
            out.append(ind + " | ".join(strip_tags(h) for h in t.get("head", [])))
            for r in t.get("rows", []):
                out.append(ind + " | ".join(strip_tags(x) for x in r))
        elif "code" in b:
            out.append("%s```%s" % (ind, b["code"].get("lang", "")))
            out.append(b["code"].get("src", ""))
            out.append(ind + "```")
        elif "img" in b:
            out.append(ind + "[画像]")
        elif "toc" in b:
            out.append(ind + "[目次]")
        elif "embed" in b:
            out.append("%s[埋め込み %s]" % (ind, b["embed"].get("url", "")))
        else:
            out.append(ind + "[対応外のブロック]")

    def row(r, ind=""):
        if isinstance(r, list):
            for b in r:
                blk(b, ind)
        elif isinstance(r, dict):
            if r.get("toggle"):
                out.append("%s▸ %s" % (ind, r.get("title", "")))
                for x in r.get("rows", []):
                    row(x, ind + "  ")
            elif r.get("callout"):
                out.append("%s［囲み%s］" % (ind, (":" + r["tone"]) if r.get("tone") else ""))
                for x in r.get("rows", []):
                    row(x, ind + "  ")
            elif "cols" in r:
                for ci, col in enumerate(r["cols"]):
                    out.append("%s［列%d］" % (ind, ci + 1))
                    for b in col:
                        blk(b, ind + "  ")
    if style_of(note) == "slide":
        for si, s in enumerate(c.get("slides") or []):
            out.append("--- スライド %d%s ---" % (si + 1, "（切り替え %s）" % s["trans"] if s.get("trans") else ""))
            for e in sorted(s.get("els") or [], key=lambda e: (e.get("y", 0), e.get("x", 0))):
                if e.get("type") == "image":
                    out.append("[画像 %s]" % e.get("id"))
                else:
                    out.append("[%s] %s" % (e.get("id"), strip_tags(e.get("html", "")).replace("\n", " / ")))
            if s.get("note"):
                out.append("（発表者ノート）%s" % s["note"])
    else:
        for r in c.get("rows") or []:
            row(r)
    meta = c.get("gnotoLite")
    if meta and meta.get("sources"):
        out += ["", "［出典の記録 %d 件］" % len(meta["sources"])]
        for s in meta["sources"]:
            out.append("- %s" % json.dumps(s, ensure_ascii=False))
    return "\n".join(out)


def _fold(s):
    return unicodedata.normalize("NFKC", str(s)).casefold()


def search(paths, query, context=24):
    """ノートの中の文字列検索（一致するかだけ。法律の知識はない）。(ファイル, 場所, 抜粋) の一覧。"""
    q = _fold(query)
    hits = []
    for p in paths:
        try:
            note = load(p)
        except (NoteError, OSError):
            continue
        for i, line in enumerate(to_text(note).split("\n")):
            f = _fold(line)
            k = f.find(q)
            if k >= 0 and len(f) == len(line):
                a, b = max(0, k - context), k + len(q) + context
                hits.append((p, i + 1, line[a:b]))
            elif k >= 0:
                hits.append((p, i + 1, line[:context * 2]))
    return hits


def add_source_record(note, record):
    """条文・判例・引用の出典を、ノートの中に機械可読で残す（content.gnotoLite.sources）。
    GNOTO が知らないキーなので、アプリは何もしないが読み込みで残る（見える出典の行が正）。"""
    c = content_of(note)
    meta = c.setdefault("gnotoLite", {"v": 1, "sources": []})
    meta.setdefault("sources", []).append(record)


def main():
    sys.stderr.write("gnoto_note.py は部品。使うのは gnoto.py\n")
    return 2


if __name__ == "__main__":
    sys.exit(main())
