#!/usr/bin/env python3
"""ノートを 1 つの HTML にする静的プレビューと、（ブラウザがあれば）PNG のサムネイル。

・表示だけ。入力欄・候補・Enter での展開・ホバーの小窓など、編集や法律の対話機能は入れない。
・スライドの表示は、1 画面に 1 枚＋矢印キーで送る（JS はこれだけ）。ノートの中身の文字は、
  gnoto_note.sanitize_html で GNOTO の読み込みと同じ許可に絞ってから出す。
・外部のスクリプト・スタイル・フォントは読み込まない（画像は利用者が入れた https か data: だけ）。
"""
import glob
import os
import shutil
import subprocess
import sys
import tempfile
from html import escape

import gnoto_note as gn

CSS_COMMON = """
*{box-sizing:border-box}
body{margin:0;font-family:"Hiragino Sans","Yu Gothic UI","Noto Sans CJK JP","Noto Sans JP",sans-serif;color:#1a1a1a;background:#fff}
a{color:#185FA5}
"""

CSS_NORMAL = """
.page{max-width:780px;margin:0 auto;padding:40px 40px 80px;line-height:1.5}
.title{font-size:26px;font-weight:700;margin:0 0 4px}
.meta{color:#8a929b;font-size:13px;margin-bottom:24px}
.blk{margin:3px 0;min-height:1.5em;word-break:break-word}
.h1{font-size:26px;font-weight:700;margin-top:22px}
.h2{font-size:21px;font-weight:700;margin-top:18px}
.h3{font-size:17px;font-weight:600;color:#185FA5;margin-top:14px}
.li{position:relative;padding-left:1.4em}
.li:before{content:attr(data-mark);position:absolute;left:0;color:#555}
.done{color:#6b7380;text-decoration:line-through}
table{border-collapse:collapse;margin:8px 0;max-width:100%}
th,td{border:1px solid #cfd4da;padding:5px 10px;text-align:left;vertical-align:top}
th{background:#f3f5f7}
pre{background:#f5f6f8;border-radius:6px;padding:10px 12px;overflow:auto;font-size:13px;line-height:1.5}
hr{border:0;border-top:1px solid #d6dae0;margin:14px 0}
.callout{border-radius:8px;padding:8px 14px;margin:8px 0;background:#fff8dc;border-left:4px solid #e0b400}
.callout[data-tone=key]{background:#eaf3fc;border-color:#185FA5}
.callout[data-tone=warn]{background:#fdeceb;border-color:#c0392b}
.callout[data-tone=example]{background:#eaf7ee;border-color:#2e9e5b}
.callout[data-tone=review]{background:#f1ecfa;border-color:#7a52c7}
details{border:1px solid #d6dae0;border-radius:8px;padding:6px 14px;margin:8px 0}
summary{cursor:pointer;font-weight:600}
.cols{display:grid;gap:20px;margin:6px 0}
img{max-width:100%}
.toc a{display:block;text-decoration:none;color:#185FA5;margin:2px 0}
.unsup{color:#8a929b;font-size:13px}
.foot{margin-top:48px;color:#8a929b;font-size:12px;border-top:1px solid #e3e6ea;padding-top:8px}
@media print{.page{padding:0}.foot{display:none}details{break-inside:avoid}}
"""

CSS_SLIDE = """
body{background:#222}
.deck{--w:min(100vw,177.7778vh)}
.slide{display:block;margin:0 auto}
.js .slide{display:none}
.js .slide.on{display:block}
.surface{container-type:size;position:relative;background:#fff;width:var(--w);aspect-ratio:16/9;overflow:hidden;margin:0 auto}
.el{position:absolute;padding:.5cqh .7cqw;overflow:hidden;font-size:4.4cqh;line-height:1.4;color:#1a1a1a;word-break:break-word}
.el img{width:100%;height:100%;object-fit:contain;display:block}
.hud{position:fixed;left:0;right:0;bottom:0;display:flex;justify-content:center;gap:14px;padding:6px;color:#aab;font-size:12px;pointer-events:none}
body.ov .slide{display:inline-block!important;--w:29vw;margin:1vw;vertical-align:top;outline:1px solid #555}
.ov .slide.on{outline:3px solid #6ab0ff}
.ov .hud{display:none}
@media print{@page{size:297mm 167mm;margin:0}body{background:#fff}.slide{display:block!important;page-break-after:always;--w:297mm;margin:0}
.surface{width:297mm;height:167mm}.hud{display:none}}
"""

SLIDE_JS = """
(function(){
document.documentElement.className+=' js';
var s=[].slice.call(document.querySelectorAll('.slide')),i=0,n=s.length;
function go(k){i=Math.max(0,Math.min(n-1,k));s.forEach(function(e,j){e.classList.toggle('on',j===i)});
var h=document.getElementById('pos');if(h)h.textContent=(i+1)+' / '+n;
try{history.replaceState(null,'','#'+(i+1))}catch(e){}}
document.addEventListener('keydown',function(e){var k=e.key;
if(k==='ArrowRight'||k==='PageDown'||k===' '||k==='Enter'||k==='ArrowDown'){go(i+1);e.preventDefault()}
else if(k==='ArrowLeft'||k==='PageUp'||k==='ArrowUp'||k==='Backspace'){go(i-1);e.preventDefault()}
else if(k==='Home')go(0);else if(k==='End')go(n-1);
else if(k==='o'||k==='O')document.body.classList.toggle('ov');
else if(k==='Escape')document.body.classList.remove('ov');});
document.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('.slide');
if(document.body.classList.contains('ov')&&t){go(s.indexOf(t));document.body.classList.remove('ov')}
else if(e.clientX>window.innerWidth/2)go(i+1);else go(i-1);});
var m=/^#(\\d+)$/.exec(location.hash);go(m?parseInt(m[1],10)-1:0);
})();
"""


def _num(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _inner(html):
    clean, _ = gn.sanitize_html(html or "")
    return clean


def _render_block(b, st):
    """ブロック 1 個 → html。st は番号の数え（リストの連番）。"""
    if not isinstance(b, dict):
        return ""
    if "html" in b:
        inner = _inner(b["html"])
        ht = b.get("htype")
        ind = int(b.get("indent") or 0) if str(b.get("indent") or "0").isdigit() else 0
        if ht in ("1", "2", "3"):
            st["ol"] = {}
            return '<div class="blk h%s">%s</div>' % (ht, inner)
        li = b.get("list")
        if li in ("ul", "ol"):
            if li == "ol":
                cnt = st["ol"].get(ind, 0) + 1
                st["ol"][ind] = cnt
                for k in [k for k in st["ol"] if k > ind]:
                    del st["ol"][k]
                mark = "%d." % cnt
            else:
                st["ol"] = {k: v for k, v in st["ol"].items() if k < ind}
                mark = "・"
            return '<div class="blk li" data-mark="%s" style="margin-left:%dpx">%s</div>' % (mark, ind * 24, inner)
        st["ol"] = {}
        cls = "blk done" if b.get("done") else "blk"
        pre = "☑ " if b.get("done") else ""
        return '<div class="%s">%s%s</div>' % (cls, pre, inner)
    st["ol"] = {}
    if "hr" in b:
        return "<hr>"
    if "table" in b:
        t = b["table"] or {}
        head = "".join("<th>%s</th>" % _inner(h) for h in t.get("head", []))
        rows = "".join("<tr>%s</tr>" % "".join("<td>%s</td>" % _inner(c) for c in r) for r in t.get("rows", []))
        return "<table><thead><tr>%s</tr></thead><tbody>%s</tbody></table>" % (head, rows)
    if "code" in b:
        return "<pre><code>%s</code></pre>" % escape(str((b["code"] or {}).get("src", "")))
    if "img" in b:
        src = (b["img"] or {}).get("src", "")
        if not gn.img_src_ok(src):
            return ""
        w = max(15, min(100, _num((b["img"] or {}).get("wPct"), 60)))
        return '<div class="blk"><img src="%s" style="width:%g%%" alt=""></div>' % (escape(src, quote=True), w)
    if "toc" in b:
        return "<!--TOC-->"
    if "embed" in b:
        u = (b["embed"] or {}).get("url", "")
        if str(u).lower().startswith("https://"):
            return '<div class="blk unsup">［埋め込み］<a href="%s" rel="noopener noreferrer" target="_blank">%s</a></div>' % (
                escape(u, quote=True), escape(u))
        return ""
    return '<div class="blk unsup">［このプレビューでは表示しないブロック］</div>'


def _render_rows(rows, st, depth=0):
    out = []
    if depth > 64:
        return ""
    for r in rows or []:
        if isinstance(r, list):
            out.append("".join(_render_block(b, st) for b in r))
        elif isinstance(r, dict):
            if r.get("toggle"):
                st["ol"] = {}
                out.append("<details%s><summary>%s</summary>%s</details>" % (
                    " open" if r.get("open") else "", escape(str(r.get("title", ""))), _render_rows(r.get("rows"), st, depth + 1)))
            elif r.get("callout"):
                st["ol"] = {}
                tone = r.get("tone") if r.get("tone") in gn.TONES else ""
                out.append('<div class="callout"%s>%s</div>' % (' data-tone="%s"' % tone if tone else "",
                                                                _render_rows(r.get("rows"), st, depth + 1)))
            elif "cols" in r:
                st["ol"] = {}
                cols = r.get("cols") or []
                ratio = r.get("ratio") or []
                fr = [max(0.1, _num(x, 1)) for x in ratio][:len(cols)]
                fr += [1.0] * (len(cols) - len(fr))
                cells = "".join("<div>%s</div>" % "".join(_render_block(b, st) for b in c) for c in cols)
                out.append('<div class="cols" style="grid-template-columns:%s">%s</div>' % (
                    " ".join("%gfr" % f for f in fr), cells))
    return "".join(out)


def _toc(rows):
    heads = []
    for where, b in gn._walk_blocks(rows, ""):
        if isinstance(b, dict) and b.get("htype") in ("1", "2", "3") and "html" in b:
            heads.append((int(b["htype"]), gn.strip_tags(b["html"])))
    return '<div class="toc blk">%s</div>' % "".join(
        '<div style="padding-left:%dpx">%s</div>' % ((lv - 1) * 16, escape(t)) for lv, t in heads)


def render_normal(note):
    n = note["note"]
    c = gn.content_of(note)
    st = {"ol": {}}
    body = _render_rows(c.get("rows"), st)
    if "<!--TOC-->" in body:
        body = body.replace("<!--TOC-->", _toc(c.get("rows") or []))
    title = escape(str(n.get("title", "")))
    meta = []
    if n.get("n"):
        meta.append("第%s回" % n["n"])
    meta.append("GNOTO Lite ノート")
    return ("<!doctype html><html lang=\"ja\"><head><meta charset=\"utf-8\">"
            "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
            "<title>%s</title><style>%s%s</style></head><body><div class=\"page\">"
            "<h1 class=\"title\">%s</h1><div class=\"meta\">%s</div>%s"
            "<div class=\"foot\">静的プレビュー（編集・入力の機能はありません）</div></div></body></html>") % (
        title, CSS_COMMON, CSS_NORMAL, title, escape("　".join(meta)), body)


def _render_el(e):
    x, y, w, h = (_num(e.get(k)) for k in ("x", "y", "w", "h"))
    z = int(_num(e.get("z"), 1))
    st = "left:%g%%;top:%g%%;width:%g%%;height:%g%%;z-index:%d" % (x, y, w, h, z)
    if e.get("type") == "image":
        src = e.get("src", "")
        if not gn.img_src_ok(src):
            return ""
        return '<div class="el" style="%s;padding:0"><img src="%s" alt=""></div>' % (st, escape(src, quote=True))
    if e.get("lh") is not None:
        st += ";line-height:%g" % _num(e["lh"], 1.4)
    if e.get("ls") not in (None, ""):
        st += ";letter-spacing:%gpx" % _num(e["ls"])
    return '<div class="el" style="%s">%s</div>' % (st, _inner(e.get("html", "")))


def render_slides(note):
    n = note["note"]
    c = gn.content_of(note)
    secs = []
    for s in c.get("slides") or []:
        els = "".join(_render_el(e) for e in sorted(s.get("els") or [], key=lambda e: _num(e.get("z"), 1)))
        secs.append('<section class="slide"><div class="surface">%s</div></section>' % els)
    title = escape(str(n.get("title", "")))
    if not secs:
        secs = ['<section class="slide on"><div class="surface"><div class="el" style="left:8%;top:40%;width:84%;'
                'height:20%;text-align:center;color:#888">スライドがありません</div></div></section>']
    return ("<!doctype html><html lang=\"ja\"><head><meta charset=\"utf-8\">"
            "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
            "<title>%s</title><style>%s%s</style></head><body><div class=\"deck\">%s</div>"
            "<div class=\"hud\"><span id=\"pos\"></span><span>← → で送る／O で一覧／クリックでも送れる</span></div>"
            "<script>%s</script></body></html>") % (title, CSS_COMMON, CSS_SLIDE, "".join(secs), SLIDE_JS)


def render(note):
    return render_slides(note) if gn.style_of(note) == "slide" else render_normal(note)


# ---------------------------------------------------------------------------
# PNG（ブラウザがあるときだけ）
# ---------------------------------------------------------------------------
def find_browser():
    env = os.environ.get("GNOTO_BROWSER")
    if env and os.path.exists(env):
        return env
    for name in ("chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "chrome", "msedge"):
        p = shutil.which(name)
        if p:
            return p
    for pat in ("/opt/pw-browsers/chromium-*/chrome-linux*/chrome",
                "/opt/pw-browsers/chromium_headless_shell-*/chrome-linux*/headless_shell",
                os.path.expanduser("~/.cache/ms-playwright/chromium-*/chrome-linux*/chrome"),
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                "C:/Program Files/Google/Chrome/Application/chrome.exe"):
        hits = sorted(glob.glob(pat))
        if hits:
            return hits[-1]
    return None


def png(note, out_png, slide=1, width=1280):
    """プレビューを PNG にする。ブラウザが無ければ None を返す（失敗ではない）。"""
    b = find_browser()
    if not b:
        return None
    is_slide = gn.style_of(note) == "slide"
    height = int(width * 9 / 16) if is_slide else 1800
    with tempfile.TemporaryDirectory() as d:
        page = os.path.join(d, "p.html")
        with open(page, "w", encoding="utf-8") as f:
            f.write(render(note))
        url = "file://" + os.path.abspath(page).replace("\\", "/") + ("#%d" % slide if is_slide else "")
        cmd = [b, "--headless", "--disable-gpu", "--hide-scrollbars",
               "--screenshot=" + os.path.abspath(out_png), "--window-size=%d,%d" % (width, height), url]
        # root では Chromium が砂場（sandbox）なしでしか起動しないので、そのときだけ外す（利用者の普段の環境では外さない）
        if hasattr(os, "geteuid") and os.geteuid() == 0:
            cmd.insert(2, "--no-sandbox")
        try:
            subprocess.run(cmd, check=True, timeout=60, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except (subprocess.SubprocessError, OSError):
            return None
    return out_png if os.path.exists(out_png) else None


def main():
    sys.stderr.write("gnoto_render.py は部品。使うのは gnoto.py render\n")
    return 2


if __name__ == "__main__":
    sys.exit(main())
