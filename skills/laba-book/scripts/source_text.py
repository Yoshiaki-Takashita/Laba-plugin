#!/usr/bin/env python3
"""取ってきた出典のファイル（HTML・PDF・テキスト）から本文の字を取り出し、原文の写し work/sources/<ID>.txt にする（P3）。
ネットには接続しない（取るのは利用者の環境の curl など。この道具は手元のファイルを読むだけ）。標準ライブラリだけ。PDF は pdftotext があれば使う。

使い方:
  source_text.py <取ったファイル> --out work/sources/R03.txt [--grep 語 [語 …]] [--width 120]
    → 本文の字を書き出し、字数と、--grep の語のある所の前後（原文のまま）を出す。抜き書き（facts.tsv の 5 列目）はここから写す。
  source_text.py --show work/sources/R03.txt --grep 語 [語 …]
    → 書き出した写しの中を探すだけ。

WebFetch は頁を要約して返すことがあるので、要約しか読んでいない出典は V1【二次】にする。原文の写し（この道具の出力）があるときだけ V3。"""
import html.parser
import os
import re
import shutil
import subprocess
import sys

SKIP = {"script", "style", "noscript", "nav", "header", "footer", "aside", "form", "svg", "button", "select", "template"}
BLOCK = {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "dd", "dt", "table", "blockquote", "pre"}


class _Text(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.skip = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in SKIP:
            self.skip += 1
        elif tag in BLOCK:
            self.out.append("\n")

    def handle_endtag(self, tag):
        if tag in SKIP and self.skip:
            self.skip -= 1
        elif tag in BLOCK:
            self.out.append("\n")

    def handle_data(self, data):
        if not self.skip:
            self.out.append(data)


def _decode(raw):
    m = re.search(rb'charset=["\']?([A-Za-z0-9_\-]+)', raw[:4000])
    encs = ([m.group(1).decode("ascii", "ignore")] if m else []) + ["utf-8", "cp932", "euc_jp", "iso2022_jp"]
    for e in encs:
        try:
            return raw.decode(e)
        except (LookupError, UnicodeDecodeError):
            continue
    return raw.decode("utf-8", "replace")


def extract(path):
    with open(path, "rb") as f:
        raw = f.read()
    if raw[:5] == b"%PDF-":
        if not shutil.which("pdftotext"):
            raise SystemExit("PDF だが pdftotext が無い。字を取り出せないので、この出典は V1（読めた範囲）か未確認にする")
        r = subprocess.run(["pdftotext", "-layout", path, "-"], capture_output=True)
        text = r.stdout.decode("utf-8", "replace")
    else:
        s = _decode(raw)
        if re.search(r"<(html|body|div|p)\b", s[:20000], re.I):
            p = _Text()
            p.feed(s)
            text = "".join(p.out)
        else:
            text = s
    text = re.sub(r"[ \t　]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n", text)
    return text.strip()


def show(text, words, width=120):
    for w in words:
        hits = [m.start() for m in re.finditer(re.escape(w), text)]
        print(f"「{w}」{len(hits)} か所")
        for h in hits[:6]:
            a, b = max(0, h - width // 2), min(len(text), h + len(w) + width // 2)
            print("  …" + text[a:b].replace("\n", " ") + "…")


def main(argv):
    if not argv:
        print(__doc__)
        return 2
    words, width = [], 120
    if "--grep" in argv:
        i = argv.index("--grep")
        words = [w for w in argv[i + 1:] if not w.startswith("--")]
    if "--width" in argv:
        width = int(argv[argv.index("--width") + 1])
    if argv[0] == "--show":
        with open(argv[1], encoding="utf-8") as f:
            show(f.read(), words, width)
        return 0
    src = argv[0]
    out = argv[argv.index("--out") + 1] if "--out" in argv else None
    text = extract(src)
    n = len(re.sub(r"\s", "", text))
    if out:
        os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
        with open(out, "w", encoding="utf-8") as f:
            f.write(text + "\n")
        print(f"書いた：{out}（{n} 字）")
    else:
        print(text[:3000])
    if n < 300:
        print("[注意] 取り出せた字が 300 字未満（ログインの頁・画像だけの PDF・動的な頁かもしれない）。原文を読めていなければ V3 にしない")
    if words:
        show(text, words, width)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
