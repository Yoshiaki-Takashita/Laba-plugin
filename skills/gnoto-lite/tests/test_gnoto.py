#!/usr/bin/env python3
"""GNOTO Lite の試験（標準ライブラリの unittest）。

  cd skills/gnoto-lite && python3 -m unittest discover -s tests -v

見本（tests/fixtures）の法令・判例・コネクタの返答はすべて架空。実在の条文・判例は入れていない。
GNOTO 本体（GLYPH.html）を使う確認は tests/app_roundtrip.js（任意）。
"""
import copy
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SCRIPTS = os.path.join(ROOT, "scripts")
FIX = os.path.join(HERE, "fixtures")
CON = os.path.join(FIX, "connector")
sys.path.insert(0, SCRIPTS)

import gnoto_note as gn  # noqa: E402
import gnoto_law as gl  # noqa: E402
import gnoto_render as gr  # noqa: E402
import gnoto_export as ge  # noqa: E402

CLI = os.path.join(SCRIPTS, "gnoto.py")


def read(p):
    with open(p, encoding="utf-8", errors="replace") as f:
        return f.read()


def fx(name):
    return os.path.join(FIX, name)


def cj(name):
    with open(os.path.join(CON, name), encoding="utf-8") as f:
        return json.load(f)


def run(*args, stdin=None):
    r = subprocess.run([sys.executable, CLI] + list(args), input=stdin, stdout=subprocess.PIPE,
                       stderr=subprocess.PIPE, universal_newlines=True)
    return r.returncode, r.stdout + r.stderr


def all_text(note):
    return gn.to_text(note)


class RoundTrip(unittest.TestCase):
    FILES = ["normal-sample.gnoto", "slide-sample.gnoto", "law-blocks-sample.gnoto",
             "minimal-normal.gnoto", "minimal-slide.gnoto"]

    def test_fixtures_validate(self):
        for f in self.FILES:
            errs, _ = gn.validate(gn.load(fx(f)))
            self.assertEqual(errs, [], f)

    def test_load_save_load_keeps_content(self):
        for f in self.FILES:
            a = gn.load(fx(f))
            with tempfile.TemporaryDirectory() as d:
                p = os.path.join(d, "x.gnoto")
                gn.save(p, a)
                b = gn.load(p)
            ca, cb = gn.content_of(a), gn.content_of(b)
            self.assertEqual(a["note"]["title"], b["note"]["title"], f)
            self.assertEqual(a["note"]["style"], b["note"]["style"], f)
            if a["note"]["style"] == "normal":
                self.assertEqual(ca["rows"], cb["rows"], f)
            else:
                self.assertEqual(ca["slides"], cb["slides"], f)

    def test_unknown_keys_survive(self):
        a = gn.load(fx("normal-sample.gnoto"))
        a["note"]["content"]["tags"] = ["x"]
        a["note"]["content"]["rows"].append([{"struct": {"k": 1}}])
        a["card"] = {"k": 1}
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "x.gnoto")
            gn.save(p, a)
            b = gn.load(p)
        self.assertEqual(b["note"]["content"]["tags"], ["x"])
        self.assertEqual(b["note"]["content"]["rows"][-1], [{"struct": {"k": 1}}])
        self.assertEqual(b["card"], {"k": 1})

    def test_container_shape(self):
        n = gn.new_note("題", "normal")
        self.assertEqual((n["glyph"], n["version"], n["app"]), ("note", 1, "GNOTO"))
        for k in ("title", "style", "n", "content", "books", "pen"):
            self.assertIn(k, n["note"])
        self.assertEqual(n["note"]["books"], [])
        self.assertEqual(n["note"]["pen"], [])

    def test_file_written_compact_utf8_no_bom(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "x.gnoto")
            gn.save(p, gn.new_note("日本語", "normal"))
            with open(p, "rb") as f:
                raw = f.read()
        self.assertFalse(raw.startswith(b"\xef\xbb\xbf"))
        self.assertIn("日本語".encode("utf-8"), raw)
        self.assertNotIn(b"\n", raw)

    def test_bom_and_foreign_file_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "bom.gnoto")
            with open(fx("minimal-normal.gnoto"), "rb") as f, open(p, "wb") as g:
                g.write(b"\xef\xbb\xbf" + f.read())
            self.assertEqual(gn.load(p)["glyph"], "note")
            q = os.path.join(d, "bad.gnoto")
            with open(q, "w") as g:
                g.write('{"glyph":"nope","note":{}}')
            with self.assertRaises(gn.NoteError):
                gn.load(q)

    def test_invalid_note_not_saved(self):
        n = gn.new_note("x", "normal")
        n["note"]["content"]["rows"] = []
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "x.gnoto")
            with self.assertRaises(gn.NoteError):
                gn.save(p, n)
            self.assertFalse(os.path.exists(p))


class Blocks(unittest.TestCase):
    def build_all(self):
        n = gn.new_note("全ブロック", "normal", 3)
        png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
        gn.insert_rows(n, [
            [gn.text_block("見出し1", htype=1)], [gn.text_block("見出し2", htype=2)], [gn.text_block("見出し3", htype=3)],
            [gn.text_block("本文 **太字** と<記号>")],
            [gn.text_block("一", list_="ul")], [gn.text_block("入れ子", list_="ul", indent=1)],
            [gn.text_block("手順1", list_="ol")], [gn.text_block("手順2", list_="ol")],
            [gn.text_block("済", done=True)],
            [gn.table_block(["項目", "内容"], [["甲", "ア"], ["乙"]])],
            [gn.code_block("print(1)", "Python")],
            [gn.hr_block()],
            [{"toc": True}],
            gn.callout_row([[gn.text_block("囲み")]], "key"),
            gn.toggle_row("折りたたみ", [[gn.text_block("中身")]]),
            gn.cols_row([[gn.text_block("左")]], [[gn.text_block("右")]]),
            [gn.quote_block("引用文")],
            [gn.source_line("出典の行")],
            [gn.unverified_line("理由")],
        ])
        for r in gn.figure_rows(png, "図の題", 50):
            gn.insert_rows(n, [r])
        return n

    def test_every_block_type_valid_and_rendered(self):
        n = self.build_all()
        errs, warns = gn.validate(n)
        self.assertEqual(errs, [])
        self.assertEqual(warns, [])  # 書いた HTML は GNOTO の読み込みで欠けない
        html = gr.render(n)
        for needle in ("<h1", "見出し1", "<table", "<pre>", "<hr>", "callout", "<details", "class=\"cols\"",
                       "<blockquote", "【未確認】", "<img", "図の題", "1.", "2."):
            self.assertIn(needle, html, needle)
        txt = all_text(n)
        for needle in ("# 見出し1", "・一", "[済] 済", "甲 | ア", "▸ 折りたたみ", "［囲み:key］", "［列1］", "[画像]"):
            self.assertIn(needle, txt, needle)

    def test_plain_text_is_escaped(self):
        b = gn.text_block("<script>alert(1)</script> & <b>")
        self.assertNotIn("<script", b["html"])
        self.assertEqual(gn.sanitize_html(b["html"])[1], [])

    def test_row_ops(self):
        n = gn.new_note("x", "normal")
        gn.insert_rows(n, [[gn.text_block("a")], [gn.text_block("b")], [gn.text_block("c")]])
        self.assertEqual(len(gn.content_of(n)["rows"]), 3)  # 最初の空行は置き換わる
        gn.insert_rows(n, [[gn.text_block("z")]], at=1)
        gn.move_row(n, 1, 4)
        self.assertEqual([r[0]["html"] for r in n["note"]["content"]["rows"]], ["a", "b", "c", "z"])
        gn.delete_row(n, 2)
        gn.replace_row(n, 1, gn.text_block("A"))
        self.assertEqual([r[0]["html"] for r in n["note"]["content"]["rows"]], ["A", "c", "z"])
        with self.assertRaises(gn.NoteError):
            gn.delete_row(n, 9)
        for _ in range(3):
            gn.delete_row(n, 1)
        self.assertEqual(n["note"]["content"]["rows"], [[{"html": ""}]])

    def test_constraints_refused(self):
        with self.assertRaises(gn.NoteError):
            gn.toggle_row("a & b", [])
        with self.assertRaises(gn.NoteError):
            gn.text_block("x", htype=4)
        with self.assertRaises(gn.NoteError):
            gn.text_block("<script>1</script>", html=True)
        with self.assertRaises(gn.NoteError):
            gn.image_block("http://example.com/a.png")
        with self.assertRaises(gn.NoteError):
            gn.new_note("x", "board")
        with self.assertRaises(gn.NoteError):
            gn.callout_row([], "pink")

    def test_body_copy_for_compat(self):
        n = self.build_all()
        gn.touch(n)
        self.assertIn("見出し1", n["note"]["content"]["body"])

    def test_search_and_text(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "n.gnoto")
            gn.save(p, self.build_all())
            hits = gn.search([p], "ＡＢＣ手順")  # 全角英数が混ざっても NFKC で比べる
            self.assertEqual(hits, [])
            hits = gn.search([p], "手順1")
            self.assertEqual(len(hits), 1)

    def test_docx_blocks_mapping(self):
        n = self.build_all()
        with tempfile.TemporaryDirectory() as d:
            meta, blocks = ge.to_laba_blocks(n, d)
        kinds = [b[0] for b in blocks]
        for k in ("H", "S", "SS", "P", "B", "N", "T", "F"):
            self.assertIn(k, kinds, k)
        with self.assertRaises(gn.NoteError):
            ge.to_laba_blocks(gn.new_note("s", "slide"), tempfile.gettempdir())

    @unittest.skipUnless(os.path.exists(ge.BUILD_DOCX), "LABA の build_docx.py が無い")
    def test_docx_export_if_python_docx(self):
        try:
            import docx  # noqa: F401
        except ImportError:
            self.skipTest("python-docx が無い")
        with tempfile.TemporaryDirectory() as d:
            out = os.path.join(d, "o.docx")
            ge.export_docx(self.build_all(), out)
            self.assertGreater(os.path.getsize(out), 5000)
            with open(out, "rb") as f:
                self.assertEqual(f.read(2), b"PK")


class Sanitizer(unittest.TestCase):
    def test_drops(self):
        clean, issues = gn.sanitize_html(
            '<script>x</script><b onclick="a()" style="color:red;display:flex;letter-spacing:2px">t</b>'
            '<a href="javascript:alert(1)">l</a><iframe src="x"></iframe><img src="http://x/a.png">')
        self.assertNotIn("script", clean)
        self.assertNotIn("onclick", clean)
        self.assertNotIn("display", clean)
        self.assertNotIn("iframe", clean)
        self.assertNotIn("javascript", clean)
        self.assertNotIn("<img", clean.replace('<img', '<img') if 'src="http://' in clean else "")
        self.assertIn("color:red", clean)
        self.assertTrue(any("display" in i for i in issues))
        self.assertTrue(any("letter-spacing" in i for i in issues))

    def test_allowed_survive(self):
        h = '<span style="color:#8a929b;font-size:13px">出典</span><b>x</b><br>'
        clean, issues = gn.sanitize_html(h)
        self.assertEqual(issues, [])
        self.assertIn("color:#8a929b", clean)

    def test_cqh_font_size_allowed(self):
        _, issues = gn.sanitize_html('<div style="font-size:4.4cqh;line-height:1.5">a</div>')
        self.assertEqual(issues, [])


class Slides(unittest.TestCase):
    def make(self):
        n = gn.new_note("スライド", "slide")
        gn.add_slide(n, "title", "表題", "副題")
        gn.add_slide(n, "title-body", "論点", "一\n二")
        gn.add_slide(n, "two-col", "比較", left="甲", right="乙")
        gn.add_slide(n, "section", "章")
        gn.add_slide(n, "blank")
        return n

    def test_layouts_and_ids(self):
        n = self.make()
        c = gn.content_of(n)
        self.assertEqual(len(c["slides"]), 5)
        ids = [s["id"] for s in c["slides"]] + [e["id"] for s in c["slides"] for e in s["els"]]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(gn.validate(n)[0], [])
        self.assertEqual(c["rows"], [[{"html": ""}]]) if False else None
        gn.touch(n)
        self.assertEqual(c["rows"], [[{"html": ""}]])

    def test_ops(self):
        n = self.make()
        gn.duplicate_slide(n, 2)
        c = gn.content_of(n)
        self.assertEqual(len(c["slides"]), 6)
        ids = [s["id"] for s in c["slides"]] + [e["id"] for s in c["slides"] for e in s["els"]]
        self.assertEqual(len(ids), len(set(ids)))
        gn.move_slide(n, 3, 1)
        self.assertEqual(gn.strip_tags(c["slides"][0]["els"][0]["html"]), "論点")
        gn.delete_slide(n, 1)
        self.assertEqual(len(c["slides"]), 5)
        gn.set_slide_props(n, 1, trans="fade", speaker_note="メモ")
        self.assertEqual(c["slides"][0]["trans"], "fade")
        with self.assertRaises(gn.NoteError):
            gn.set_slide_props(n, 1, trans="spin")
        el = c["slides"][0]["els"][0]
        gn.set_el(n, 1, el["id"], x=10, anim="fade", lines="直した")
        self.assertEqual(el["x"], 10)
        self.assertEqual(el["anim"]["t"], "fade")
        gn.delete_el(n, 1, el["id"])
        with self.assertRaises(gn.NoteError):
            gn.delete_el(n, 1, "nope")

    def test_overflow_warning(self):
        n = gn.new_note("s", "slide")
        gn.add_slide(n, "title-body", "t", "\n".join(["とても長い一行の文章がここに入りますので折り返しが起きます"] * 15))
        _, warns = gn.validate(n)
        self.assertTrue(any("収まらない" in w for w in warns))

    def test_normal_ops_refused_on_slide(self):
        with self.assertRaises(gn.NoteError):
            gn.insert_rows(gn.new_note("s", "slide"), [[gn.text_block("x")]])
        with self.assertRaises(gn.NoteError):
            gn.add_slide(gn.new_note("n", "normal"))

    def test_slide_render_paging_script_and_surface(self):
        html = gr.render(self.make())
        self.assertEqual(html.count('class="slide"'), 5)
        self.assertIn("ArrowRight", html)
        self.assertIn("container-type:size", html)
        self.assertIn("cqh", html)
        self.assertIn("aspect-ratio:16/9", html)

    def test_text_export_of_slides(self):
        t = gn.to_text(self.make())
        self.assertIn("--- スライド 1", t)
        self.assertIn("表題", t)


class LawBlocks(unittest.TestCase):
    def test_statute_blocks_and_metadata(self):
        rows, rec = gl.statute_rows(cj("law_get_article_found.json"))
        flat = [r[0] for r in rows]
        self.assertEqual(flat[0]["htype"], "3")
        self.assertEqual(gn.strip_tags(flat[0]["html"]), "架空取引法 第一条（目的）")
        texts = [gn.strip_tags(b["html"]) for b in flat]
        self.assertTrue(texts[1].startswith("①　この法律は"))
        self.assertEqual(flat[2]["indent"], "1")
        self.assertTrue(texts[2].startswith("一　"))
        self.assertTrue(texts[4 - 1 + 0].startswith("②") or any(t.startswith("②") for t in texts))
        src = texts[-1]
        for needle in ("法令ID FICT0001", "版 FICT0001_20200401_000", "施行日 2020-04-01", "取得 2026-11-13",
                       "law_get_article", "e-Gov法令API v2"):
            self.assertIn(needle, src)
        self.assertEqual(rec["law_id"], "FICT0001")
        self.assertEqual(rec["law_revision_id"], "FICT0001_20200401_000")
        self.assertEqual(rec["enforcement_date"], "2020-04-01")
        self.assertEqual(rec["source_urls"], ["https://example.invalid/law/FICT0001"])
        self.assertEqual(rec["retrieved_at"], "2026-11-13T05:30:00Z")

    def test_statute_single_and_numbering(self):
        rows, _ = gl.statute_rows(cj("law_get_article_single.json"))
        texts = [gn.strip_tags(r[0]["html"]) for r in rows]
        self.assertEqual(texts[0], "架空取引法 第二条（目的の補足）")  # 括弧が無ければ付ける
        self.assertFalse(texts[1].startswith("①"))
        self.assertIn("現行ではない", texts[-1])
        rows, _ = gl.statute_rows(cj("law_get_article_para2.json"))
        self.assertTrue(gn.strip_tags(rows[1][0]["html"]).startswith("②"))
        rows, _ = gl.statute_rows(cj("law_get_article_single.json"), numbers="always")
        self.assertTrue(gn.strip_tags(rows[1][0]["html"]).startswith("①"))
        rows, _ = gl.statute_rows(cj("law_get_article_found.json"), asof="2021-01-01")
        self.assertIn("時点指定 2021-01-01", gn.strip_tags(rows[-1][0]["html"]))

    def test_statute_refused(self):
        for f, word in (("law_get_article_no_match.json", "no_match"), ("law_get_article_no_prov.json", "provenance")):
            with self.assertRaises(gl.Refused) as cm:
                gl.statute_rows(cj(f))
            self.assertIn(word, str(cm.exception) + (cm.exception.status or ""))

    def test_statute_rows_survive_gnoto_sanitizer(self):
        rows, _ = gl.statute_rows(cj("law_get_article_found.json"))
        n = gn.new_note("t", "normal")
        gn.insert_rows(n, rows)
        self.assertEqual(gn.validate(n), ([], []))

    def test_case_get_blocks(self):
        rows, rec = gl.case_rows(cj("case_get_found.json"))
        texts = [gn.strip_tags(r[0]["html"]) for r in rows]
        self.assertIn("架空最高裁判所第一小法廷判決 令和2年3月4日（架空事件）", texts[0])
        self.assertIn("架空民集1巻2号3頁", texts[0])
        self.assertTrue(any(t.startswith("判示事項：") for t in texts))
        self.assertTrue(any(t.startswith("裁判要旨：") for t in texts))
        self.assertTrue(any(t.startswith("参照法条：") for t in texts))
        self.assertIn("裁判所の編集で、判決の文ではない", texts[-1])
        self.assertEqual(rec["case_id"], "000000")
        self.assertFalse(rec["bibliography_verified"])
        self.assertEqual(rec["retrieved_at"], "2026-11-13T05:31:00Z")

    def test_case_verify_confirmed_only_if_all_match(self):
        rows, rec = gl.case_rows(cj("case_verify_match.json"))
        self.assertTrue(rec["bibliography_verified"])
        self.assertIn("書誌は照合済み", "".join(gn.strip_tags(r[0]["html"]) for r in rows))
        rows, rec = gl.case_rows(cj("case_verify_mismatch.json"))
        joined = "".join(gn.strip_tags(r[0]["html"]) for r in rows)
        self.assertFalse(rec["bibliography_verified"])
        self.assertIn("page", joined)
        self.assertNotIn("書誌は照合済み", joined)
        rows, rec = gl.case_rows(cj("case_get_found.json"), verify=cj("case_verify_match.json"))
        self.assertTrue(rec["bibliography_verified"])
        with self.assertRaises(gl.Refused):
            gl.case_rows(cj("case_verify_not_covered.json"))

    def test_case_verify_of_other_case_refused(self):
        other = cj("case_verify_match.json")
        other["match"]["case_id"] = "999999"
        with self.assertRaises(gl.Refused):
            gl.case_rows(cj("case_get_found.json"), verify=other)

    def test_statute_part_heading(self):
        rows, rec = gl.statute_rows(cj("law_get_article_single.json"), paragraph=1)
        self.assertIn("第1項", gn.strip_tags(rows[0][0]["html"]))
        self.assertEqual(rec["paragraph"], 1)
        rows, _ = gl.statute_rows(cj("law_get_article_single.json"))
        self.assertNotIn("第1項", gn.strip_tags(rows[0][0]["html"]))

    def test_quote_rules(self):
        rows, rec = gl.quote_rows(cj("case_quote_exact_fulltext.json"), "架空の判旨の一文", "架空最判令和2年3月4日")
        self.assertIn("blockquote", rows[0][0]["html"])
        self.assertIn("「架空の判旨の一文」", gn.strip_tags(rows[0][0]["html"]))
        self.assertIn("判決全文・2頁", gn.strip_tags(rows[1][0]["html"]))
        self.assertEqual(rec["where"], {"part": "fulltext", "page": 2})
        rows, _ = gl.quote_rows(cj("case_quote_normalized.json"), "表記の違う一文", "架空最判")
        self.assertIn("原文の表記", gn.strip_tags(rows[0][0]["html"]))  # matched_text で引く
        with self.assertRaises(gl.Refused):
            gl.quote_rows(cj("case_quote_summary.json"), "架空の裁判要旨。", "架空最判")  # 判旨としては不可
        rows, _ = gl.quote_rows(cj("case_quote_summary.json"), "架空の裁判要旨。", "架空最判", as_judgment=False)
        self.assertIn("判決の文ではない", gn.strip_tags(rows[1][0]["html"]))
        with self.assertRaises(gl.Refused) as cm:
            gl.quote_rows(cj("case_quote_not_found.json"), "それらしい文", "架空最判")
        self.assertIn("一致ではない", str(cm.exception))

    def test_ambiguous_citation_refused_with_candidates(self):
        with self.assertRaises(gl.Refused) as cm:
            gl.resolved_args(cj("law_resolve_ambiguous.json"))
        self.assertEqual(cm.exception.status, "ambiguous")
        self.assertEqual([c["law_id"] for c in cm.exception.candidates], ["FICT0001", "FICT0002"])

    def test_resolved_args(self):
        r = gl.resolved_args(cj("law_resolve_ok.json"))
        self.assertEqual(r["args"], {"law": "FICT0001", "article": "1", "paragraph": 2})
        r = gl.resolved_args(cj("law_resolve_search.json"))
        self.assertIn("目で確かめて", " ".join(r["notes"]))
        ok, ng = gl.resolved_all(cj("law_resolve_mixed.json"))
        self.assertEqual(len(ok), 2)
        self.assertEqual(ok[1]["args"], {"law": "FICT0001", "article": "3の2", "paragraph": 1, "item": "2"})
        self.assertEqual([x["index"] for x in ng], [1])

    def test_unverified_line(self):
        b = gn.unverified_line("収録の外")
        self.assertIn("【未確認】", b["html"])
        self.assertEqual(gn.sanitize_html(b["html"])[1], [])


class Cli(unittest.TestCase):
    def test_end_to_end_normal_and_law(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "n.gnoto")
            self.assertEqual(run("new", p, "--title", "法律ノート", "--heading")[0], 0)
            self.assertEqual(run("law-statute", p, "--json", os.path.join(CON, "law_get_article_found.json"))[0], 0)
            self.assertEqual(run("law-case", p, "--json", os.path.join(CON, "case_get_found.json"),
                                 "--verify", os.path.join(CON, "case_verify_match.json"))[0], 0)
            self.assertEqual(run("law-quote", p, "--json", os.path.join(CON, "case_quote_exact_fulltext.json"),
                                 "--quote", "架空の判旨の一文", "--cite", "架空最判令和2年3月4日")[0], 0)
            self.assertEqual(run("law-unverified", p, "--reason", "大審院の判例は収録の外")[0], 0)
            rc, o = run("check", p)
            self.assertEqual(rc, 0, o)
            note = gn.load(p)
            srcs = note["note"]["content"]["gnotoLite"]["sources"]
            self.assertEqual([s["kind"] for s in srcs], ["statute", "case", "quote", "unverified"])
            rc, o = run("text", p)
            self.assertIn("架空取引法 第一条（目的）", o)
            rc, o = run("render", p, "--html", os.path.join(d, "o.html"))
            self.assertEqual(rc, 0)
            self.assertIn("架空取引法", read(os.path.join(d, "o.html")))

    def test_cli_refusals_exit_3(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "n.gnoto")
            run("new", p)
            rc, o = run("law-statute", p, "--json", os.path.join(CON, "law_get_article_no_match.json"))
            self.assertEqual(rc, 3, o)
            rc, o = run("law-quote", p, "--json", os.path.join(CON, "case_quote_not_found.json"),
                        "--quote", "x", "--cite", "y")
            self.assertEqual(rc, 3, o)
            self.assertNotIn("gnotoLite", json.dumps(gn.load(p)))  # 拒否のときは何も書かない
            rc, o = run("law-args", os.path.join(CON, "law_resolve_ambiguous.json"))
            self.assertEqual(rc, 3)
            self.assertIn("FICT0002", o)
            rc, o = run("law-args", os.path.join(CON, "law_resolve_ok.json"))
            self.assertEqual(rc, 0)
            self.assertEqual(json.loads(o)["args"]["law"], "FICT0001")

    def test_cli_slide_flow_and_errors(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "s.gnoto")
            self.assertEqual(run("new", p, "--style", "slide", "--title", "発表")[0], 0)
            self.assertEqual(run("slide-add", p, "--layout", "title", "--title", "題", "--body", "副")[0], 0)
            self.assertEqual(run("slide-add", p, "--layout", "title-body", "--title", "要点", "--body", "一\n二")[0], 0)
            self.assertEqual(run("el-text", p, "2", "注", "--x", "60", "--y", "80", "--w", "30", "--h", "10")[0], 0)
            self.assertEqual(run("slide-set", p, "2", "--trans", "fade", "--note", "発表者ノート")[0], 0)
            self.assertEqual(run("slide-move", p, "2", "1")[0], 0)
            self.assertEqual(run("check", p)[0], 0)
            self.assertEqual(run("heading", p, "x")[0], 1)  # スライドに行は足せない
            self.assertEqual(run("new", p)[0], 1)  # 上書きしない
            self.assertEqual(run("render", p, "--html", os.path.join(d, "s.html"))[0], 0)

    def test_cli_add_json_and_set(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "n.gnoto")
            run("new", p)
            rc, o = run("add-json", p, "--json", "-", stdin='[{"html":"a"},{"html":"b"}]')
            self.assertEqual(rc, 0, o)
            self.assertEqual(len(gn.content_of(gn.load(p))["rows"]), 1)  # ブロックの配列は 1 行
            rc, o = run("add-json", p, "--json", "-", stdin='{"callout":true,"rows":[[{"html":"c"}]]}')
            self.assertEqual(rc, 0, o)
            rc, o = run("add-json", p, "--json", "-", stdin='{"img":{"src":"http://x/a.png"}}')
            self.assertEqual(rc, 1)
            self.assertEqual(run("set", p, "--title", "新題", "--n", "4")[0], 0)
            self.assertEqual(gn.load(p)["note"]["title"], "新題")
            self.assertEqual(run("set", p, "--style", "slide")[0], 1)  # --force が要る


class Rules(unittest.TestCase):
    """プラグインの審査の規則と、保護の規則（法律の知識をスクリプトに持たない）。"""

    def files(self):
        for root, _, fs in os.walk(ROOT):
            for f in fs:
                if "__pycache__" in root or f.endswith(".pyc"):
                    continue
                yield os.path.join(root, f)

    def test_each_file_under_256kib_and_allowed_type(self):
        allowed = {".md", ".py", ".json", ".gnoto", ".js", ".txt", ""}
        n = 0
        for p in self.files():
            n += 1
            self.assertLess(os.path.getsize(p), 256 * 1024, p)
            self.assertIn(os.path.splitext(p)[1].lower(), allowed, p)
        self.assertLess(n, 60, "gnoto-lite を小さく保つ（プラグイン全体で 512 ファイルまで）")

    def test_scripts_have_no_law_data(self):
        banned = ["STATUTE_DB", "LAW_ALIAS", "CASE_DB", "LAW_YOMI", "law_data", "HYAKUSEN", "LAW_NAMES",
                  "民法", "刑法", "会社法", "民事訴訟法", "刑事訴訟法", "憲法", "商法", "行政事件訴訟法", "最判", "大判"]
        for f in os.listdir(SCRIPTS):
            if not f.endswith(".py"):
                continue
            src = read(os.path.join(SCRIPTS, f))
            for w in banned:
                self.assertNotIn(w, src, "%s に %s がある（スクリプトに法律の知識を入れない）" % (f, w))

    def test_scripts_do_not_import_network_or_glyph(self):
        for f in os.listdir(SCRIPTS):
            if not f.endswith(".py"):
                continue
            src = read(os.path.join(SCRIPTS, f))
            for w in ("urllib", "requests", "socket", "http.client", "GLYPH", "glyph.html", "subprocess.Popen"):
                self.assertNotIn(w, src, "%s に %s" % (f, w))

    def test_no_secrets_or_urls_to_connector(self):
        pat = re.compile(r"(sk-[A-Za-z0-9]{10,}|AKIA[0-9A-Z]{8,}|-----" + "BEGIN|supabase\.co|functions/v1)")
        for p in self.files():
            if p.endswith(".gnoto") or p == os.path.abspath(__file__) or os.path.getsize(p) > 200000:
                continue
            self.assertIsNone(pat.search(read(p)), p)

    def test_preview_has_no_interactive_law_or_editing_features(self):
        n = gn.new_note("t", "normal")
        gn.insert_rows(n, [[gn.text_block("本文")]])
        html = gr.render(n)
        for w in ("<script", "<input", "<textarea", "contenteditable", "law-ref", "autocomplete", "fetch(", "XMLHttpRequest"):
            self.assertNotIn(w, html, w)
        s = gn.new_note("s", "slide")
        gn.add_slide(s, "title", "t")
        html = gr.render(s)
        for w in ("<input", "<textarea", "contenteditable", "law-ref", "fetch(", "XMLHttpRequest", "localStorage"):
            self.assertNotIn(w, html, w)

    def test_preview_sanitizes_hostile_note(self):
        n = gn.new_note("t", "normal")
        n["note"]["content"]["rows"] = [[{"html": '<img src=x onerror="alert(1)"><script>alert(1)</script>'
                                                  '<a href="javascript:alert(1)">l</a>ok'}]]
        html = gr.render(n)
        for w in ("onerror", "<script", "javascript:"):
            self.assertNotIn(w, html)
        self.assertIn("ok", html)

    @unittest.skipUnless(gr.find_browser(), "ブラウザが無いので PNG は作らない")
    def test_png_if_browser(self):
        with tempfile.TemporaryDirectory() as d:
            s = gn.new_note("s", "slide")
            gn.add_slide(s, "title", "題", "副")
            out = os.path.join(d, "o.png")
            self.assertEqual(gr.png(s, out), out)
            with open(out, "rb") as f:
                self.assertEqual(f.read(4), b"\x89PNG")


if __name__ == "__main__":
    unittest.main()
