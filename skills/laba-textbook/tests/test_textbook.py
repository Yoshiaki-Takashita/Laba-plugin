"""laba-textbook の試験。実行：python3 -m unittest discover -s skills/laba-textbook/tests（リポジトリの直下で。または tests/ の中で python3 -I test_textbook.py）
材料は意味のない文だけ（教科書の文章・画像は使わない）。"""
import copy
import json
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
TB = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(TB, "scripts"))
import figure_check as fc  # noqa: E402
import figure_svg as fs  # noqa: E402
import textbook_page as tp  # noqa: E402


def load(*p):
    with open(os.path.join(TB, *p), encoding="utf-8") as f:
        return json.load(f)


SAMPLE = load("samples", "f1-b1-input.json")
FIGS = load("samples", "figs-examples.json")


class Build(unittest.TestCase):
    def build(self, inp):
        note, errs, warns = tp.build(inp)
        if note:
            e2, w2 = tp.check_note(note)
            errs, warns = errs + e2, warns + w2
        return note, errs, warns

    def test_sample_builds_and_passes(self):
        note, errs, warns = self.build(SAMPLE)
        self.assertEqual(errs, [])
        c = note["note"]["content"]
        self.assertEqual(note["note"]["style"], "page")
        self.assertEqual([p["id"] for p in c["page"]["pages"]], [p["id"] for p in c["page2"]["pages"]])

    def test_no_coordinates_or_colors_in_output(self):
        note, _, _ = self.build(SAMPLE)
        s = json.dumps(note)
        for k in ('"x":', '"y":', '"w":', '"h":', '"color"', '"font"', '"left"', '"top"'):
            if k in ('"w":', '"h":'):
                continue   # content.page.paper の w・h は紙の寸法（箱ではない）
            self.assertNotIn(k, s)
        self.assertEqual(note["note"]["content"]["page"]["pages"][0]["boxes"], [])

    def test_input_cannot_carry_coordinates_or_html(self):
        for bad in ({"x": 10}, {"html": "<b>"}, {"style": "color:red"}):
            inp = copy.deepcopy(SAMPLE)
            inp["pages"][1]["slots"]["body"].update(bad)
            _, errs, _ = self.build(inp)
            self.assertTrue(errs, bad)

    def test_pids_unique_and_all_placed(self):
        note, errs, warns = self.build(SAMPLE)
        c = note["note"]["content"]
        pids = [b["pid"] for r in c["rows"] for b in r]
        self.assertEqual(len(pids), len(set(pids)))
        self.assertFalse([w for w in warns if "未配置" in w])

    def test_deterministic(self):
        a, _, _ = self.build(SAMPLE)
        b, _, _ = self.build(copy.deepcopy(SAMPLE))
        self.assertEqual(json.dumps(a), json.dumps(b))

    def test_note_ref_points_at_body_paragraph(self):
        note, _, _ = self.build(SAMPLE)
        c = note["note"]["content"]
        lp = c["page2"]["lite"]["pages"][1]
        self.assertEqual(lp["aside"][0]["ref"], lp["body"][0])
        body_html = [b["html"] for r in c["rows"] for b in r if b["pid"] == lp["body"][0]][0]
        self.assertIn("<sup>1</sup>", body_html)

    def test_required_slot_missing(self):
        inp = copy.deepcopy(SAMPLE)
        del inp["pages"][1]["slots"]["body"]
        self.assertTrue(any("必須" in e for e in self.build(inp)[1]))

    def test_unknown_slot_goes_to_body_with_warning(self):
        inp = copy.deepcopy(SAMPLE)
        inp["pages"][1]["slots"]["zzz"] = {"text": "余りの文。"}
        note, errs, warns = self.build(inp)
        self.assertEqual(errs, [])
        self.assertTrue(any("知らないスロット" in w for w in warns))
        txt = json.dumps(note, ensure_ascii=False)
        self.assertIn("余りの文。", txt)

    def test_overflow_warns_not_errors(self):
        inp = copy.deepcopy(SAMPLE)
        inp["pages"][1]["slots"]["body"] = {"text": "あ" * 1200}
        _, errs, warns = self.build(inp)
        self.assertEqual(errs, [])
        self.assertTrue(any("目安" in w for w in warns))

    def test_aside_too_long_warns(self):
        inp = copy.deepcopy(SAMPLE)
        inp["pages"][1]["slots"]["aside"]["items"][0]["text"] = "い" * 100
        self.assertTrue(any("目安" in w for w in self.build(inp)[2]))

    def test_unknown_variant_format_master(self):
        for mod in (lambda i: i.update(variant="zz"), lambda i: i.update(format="fam-zz"), lambda i: i["pages"][0].update(master="zz")):
            inp = copy.deepcopy(SAMPLE)
            mod(inp)
            try:
                _, errs, _ = self.build(inp)
            except tp.BuildError as e:
                errs = [str(e)]
            self.assertTrue(errs)

    def test_provisional_variant_warns(self):
        inp = copy.deepcopy(SAMPLE)
        inp["variant"] = "b2"
        self.assertTrue(any("仮" in w for w in self.build(inp)[2]))

    def test_headings_get_htype_and_titles(self):
        note, _, _ = self.build(SAMPLE)
        rows = [b for r in note["note"]["content"]["rows"] for b in r]
        self.assertIn("1", [b.get("htype") for b in rows])
        self.assertIn("2", [b.get("htype") for b in rows])

    def test_bad_html_pid_and_duplicate_are_caught(self):
        note, _, _ = self.build(SAMPLE)
        n2 = copy.deepcopy(note)
        n2["note"]["content"]["rows"][0][0]["html"] = "<script>x</script>"
        self.assertTrue(tp.check_note(n2)[0])
        n3 = copy.deepcopy(note)
        n3["note"]["content"]["rows"][1][0]["pid"] = n3["note"]["content"]["rows"][0][0]["pid"]
        self.assertTrue(any("重複" in e for e in tp.check_note(n3)[0]))
        n4 = copy.deepcopy(note)
        n4["note"]["content"]["rows"][0][0]["pid"] = "Bad Pid!"
        self.assertTrue(tp.check_note(n4)[0])
        n5 = copy.deepcopy(note)
        n5["note"]["content"]["rows"][0][0]["extra"] = 1
        self.assertTrue(any("落ちるキー" in e for e in tp.check_note(n5)[0]))

    def test_page_id_mismatch_is_caught(self):
        note, _, _ = self.build(SAMPLE)
        note["note"]["content"]["page"]["pages"].append({"id": "p9", "boxes": [], "rules": []})
        self.assertTrue(any("そろっていない" in e for e in tp.check_note(note)[0]))

    def test_deep_page2_that_gnoto_would_drop(self):
        note, _, _ = self.build(SAMPLE)
        note["note"]["content"]["page2"]["lite"]["pages"][1]["body"] = [["r_x"]]
        self.assertTrue(tp.check_note(note)[0])

    def test_figs_survive_round_trip_json(self):
        note, _, _ = self.build(SAMPLE)
        self.assertEqual(json.loads(json.dumps(note, ensure_ascii=False)), note)

    def test_all_formats_consistent(self):
        fm = tp.list_formats()
        self.assertEqual(sorted(f["id"] for f in fm), ["fam-f1", "fam-f2", "fam-f3"])
        for f in fm:
            self.assertEqual(f["unit"], "w1000")
            self.assertGreater(f["base"]["lines"], 20)
            self.assertEqual(f["masters"]["body"]["slots"]["body"]["grid"]["linesPerPage"], f["base"]["lines"])
            self.assertTrue(f["variants"])
            s = json.dumps(f, ensure_ascii=False)
            self.assertNotIn("data:image", s)
            self.assertLess(len(s), 6000)   # 数値と構造だけ。本文や長い文章は入っていない
        self.assertEqual(tp.body_capacity(tp.load_format("fam-f1"), tp.load_format("fam-f1")["variants"]["b1"]), 28 * 30)

    def test_every_format_builds_a_sample(self):
        for fid, v in (("fam-f1", "b1"), ("fam-f1", "b2"), ("fam-f2", "b5"), ("fam-f3", "b4")):
            inp = copy.deepcopy(SAMPLE)
            inp["format"], inp["variant"] = fid, v
            note, errs, _ = self.build(inp)
            self.assertEqual(errs, [], (fid, v))
            self.assertEqual(note["note"]["content"]["page2"]["fmt"]["id"], fid)

    def test_cli_build_check_preview(self):
        with tempfile.TemporaryDirectory() as d:
            inf, out, html = [os.path.join(d, x) for x in ("in.json", "o.gnoto", "p.html")]
            json.dump(SAMPLE, open(inf, "w", encoding="utf-8"), ensure_ascii=False)
            self.assertEqual(tp.main(["build", "--in", inf, "--out", out]), 0)
            self.assertEqual(tp.main(["check", out]), 0)
            self.assertEqual(tp.main(["preview", out, html]), 0)
            self.assertIn("スロットの一覧", open(html, encoding="utf-8").read())
            self.assertEqual(tp.main(["formats"]), 0)
            self.assertEqual(tp.main(["slots", "--format", "fam-f3", "--variant", "b4"]), 0)


class Figures(unittest.TestCase):
    def test_every_kind_example_is_valid(self):
        self.assertEqual(sorted(FIGS), ["chart", "compare", "concept", "flow", "matrix", "relation", "scale", "table", "timeline", "tree"])
        for k, f in FIGS.items():
            e, w = fc.check_fig(k, f)
            self.assertEqual(e, [], k)

    def test_banned_style_key_is_rejected(self):
        f = copy.deepcopy(FIGS["flow"])
        f["edges"][0]["style"] = "dashed"   # GNOTO は style キーを落とす。線種は line
        self.assertTrue(fc.check_fig("flow", f)[0])

    def test_coordinates_colors_rejected(self):
        for key in ("x", "color", "fill"):
            f = copy.deepcopy(FIGS["flow"])
            f["nodes"][0][key] = 1
            self.assertTrue(fc.check_fig("flow", f)[0], key)

    def test_edge_end_missing_and_orphan(self):
        f = copy.deepcopy(FIGS["flow"])
        f["edges"][0]["to"] = "zz"
        self.assertTrue(any("nodes に無い" in e for e in fc.check_fig("flow", f)[0]))
        f = copy.deepcopy(FIGS["flow"])
        f["nodes"].append({"id": "orph", "label": "孤立"})
        self.assertTrue(any("孤立" in e for e in fc.check_fig("flow", f)[0]))

    def test_too_many_nodes(self):
        f = copy.deepcopy(FIGS["flow"])
        f["nodes"] = [{"id": "n%d" % i, "label": "語"} for i in range(15)]
        self.assertTrue(fc.check_fig("flow", f)[0])

    def test_size_and_length_warnings(self):
        f = copy.deepcopy(FIGS["flow"])
        f["nodes"][0]["label"] = "とても長いノードのラベルでとても長い"
        self.assertTrue(any("字" in w for w in fc.check_fig("flow", f)[1]))
        f = copy.deepcopy(FIGS["flow"])
        f["nodes"][2]["tone"] = f["nodes"][3]["tone"] = "key"
        self.assertTrue(any("tone key" in w for w in fc.check_fig("flow", f)[1]))

    def test_tree_rules(self):
        f = copy.deepcopy(FIGS["tree"])
        f["nodes"].append({"id": "r2", "label": "別の根"})
        self.assertTrue(any("根" in e for e in fc.check_fig("tree", f)[0]))
        f = copy.deepcopy(FIGS["tree"])
        f["nodes"][0]["parent"] = "a1"   # 循環
        self.assertTrue(fc.check_fig("tree", f)[0])
        f = copy.deepcopy(FIGS["tree"])
        f["nodes"] += [{"id": "d1", "label": "深い", "parent": "a1"}, {"id": "d2", "label": "もっと", "parent": "d1"}]
        self.assertTrue(any("階層" in w for w in fc.check_fig("tree", f)[1]))

    def test_table_row_width(self):
        f = copy.deepcopy(FIGS["table"])
        f["rows"][0].append("余り")
        self.assertTrue(fc.check_fig("table", f)[0])
        f = copy.deepcopy(FIGS["matrix"])
        f["rows"][0] = f["rows"][0][:-1]
        self.assertTrue(fc.check_fig("matrix", f)[0])

    def test_gnoto_drops_these_shapes(self):
        # 数字で始まる図の id・文字列中の < > ・深さ 6 以上 は GNOTO の読み込みで落ちる
        self.assertTrue(fc.check_fig("1a", FIGS["flow"])[0])
        f = copy.deepcopy(FIGS["flow"])
        f["nodes"][0]["label"] = "a<b"
        self.assertTrue(fc.check_fig("flow", f)[0])
        errs = []
        fc.any_walk({"a": {"b": {"c": {"d": {"e": [1]}}}}}, "x", 1, errs)
        self.assertTrue(errs)

    def test_text_cross_check(self):
        f = FIGS["flow"]
        e, w = fc.check_fig("flow", f, text="出発点から条件を満たす場合は結論 甲、満たさなければ結論 乙。")
        self.assertEqual(e, [])
        self.assertFalse([x for x in w if "本文に出てこない" in x])
        e, w = fc.check_fig("flow", f, text="関係のない本文。")
        self.assertTrue([x for x in w if "本文に出てこない" in x])


class Svg(unittest.TestCase):
    def test_every_kind_renders_and_passes_svg_check(self):
        with tempfile.TemporaryDirectory() as d:
            for k, f in FIGS.items():
                p = os.path.join(d, k + ".svg")
                open(p, "w", encoding="utf-8").write(fs.render(f, "図表"))
                e, w = fc.svg_check(p)
                self.assertEqual(e, [], k)

    def test_svg_check_catches_color_gradient_and_outside_text(self):
        with tempfile.TemporaryDirectory() as d:
            def chk(body, vb="0 0 100 100"):
                p = os.path.join(d, "t.svg")
                open(p, "w", encoding="utf-8").write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s">%s</svg>' % (vb, body))
                return fc.svg_check(p)[0]
            self.assertTrue(chk('<rect fill="#ff0000" width="5" height="5"/><text x="1" y="1">あ</text>'))
            self.assertTrue(chk('<linearGradient id="g"/><text x="1" y="1">あ</text>'))
            self.assertTrue(chk('<text x="500" y="1">あ</text>'))
            self.assertTrue(chk('<text x="1" y="1">あ</text>', vb=""))
            self.assertEqual(chk('<rect fill="#787878" stroke="#222222" width="5" height="5"/><text x="20" y="40">あ</text>'), [])
            # 幾何（L3）：文字の外接がはみ出す・文字どうしの重なり・文字に掛かる線
            self.assertTrue(any("外へ" in e for e in chk('<text x="1" y="5">あいう</text>')))
            self.assertTrue(any("重なる" in e for e in chk('<text x="20" y="40">あいう</text><text x="30" y="42">えお</text>')))
            self.assertTrue(any("掛かる" in e for e in chk('<line x1="0" y1="36" x2="100" y2="36" stroke="#222222"/><text x="20" y="40">あい</text>')))
            # 白地の札（data-bg）は細い線だけ許す。太い線は許さない
            self.assertEqual(chk('<line x1="0" y1="36" x2="100" y2="36" stroke="#222222"/><text x="20" y="40" data-bg="1">あい</text>'), [])
            self.assertTrue(chk('<line x1="0" y1="36" x2="100" y2="36" stroke="#c0c0c0" stroke-width="8"/><text x="20" y="40" data-bg="1">あい</text>'))

    def test_cli_writes_files(self):
        with tempfile.TemporaryDirectory() as d:
            inf = os.path.join(TB, "samples", "figs-examples.json")
            self.assertEqual(fs.main([inf, d]), 0)
            self.assertEqual(sorted(os.listdir(d)), sorted(k + ".svg" for k in FIGS))


class NewKinds(unittest.TestCase):
    """L3（G96）：compare・chart・scale の記述の検査と、既存 7 型の描き方の直し。"""

    def test_compare_rules(self):
        f = copy.deepcopy(FIGS["compare"])
        f["panels"][1]["nodes"] = f["panels"][1]["nodes"][:-1]
        f["panels"][1]["edges"] = [e for e in f["panels"][1]["edges"] if "c" not in (e["from"], e["to"])]
        self.assertTrue(any("当事者の集合" in e for e in fc.check_fig("compare", f)[0]))
        f = copy.deepcopy(FIGS["compare"])
        del f["slots"]["c"]
        self.assertTrue(any("slots に位置の無い" in e for e in fc.check_fig("compare", f)[0]))
        f = copy.deepcopy(FIGS["compare"])
        f["slots"]["c"] = [0, 0]
        self.assertTrue(any("同じ位置" in e for e in fc.check_fig("compare", f)[0]))
        f = copy.deepcopy(FIGS["compare"])
        f["panels"][1] = dict(copy.deepcopy(f["panels"][0]), title="変更後")
        self.assertTrue(any("変わらない" in e for e in fc.check_fig("compare", f)[0]))
        f = copy.deepcopy(FIGS["compare"])
        f["slots"]["1x"] = [3, 3]     # 数字で始まる id はキーとして GNOTO が落とす
        self.assertTrue(fc.check_fig("compare", f)[0])

    def test_chart_rules(self):
        f = copy.deepcopy(FIGS["chart"])
        f["series"][0]["values"] = f["series"][0]["values"][:-1]
        self.assertTrue(any("カテゴリ" in e for e in fc.check_fig("chart", f)[0]))
        f = copy.deepcopy(FIGS["chart"])
        f["series"][0]["values"][0] = -1
        self.assertTrue(any("負の値" in e for e in fc.check_fig("chart", f)[0]))
        f = copy.deepcopy(FIGS["chart"])
        f["series"][0]["axis"] = "right"
        self.assertTrue(any("右の軸" in e for e in fc.check_fig("chart", f)[0]))
        f = copy.deepcopy(FIGS["chart"])
        del f["note"]
        self.assertTrue(any("出典" in w for w in fc.check_fig("chart", f)[1]))
        # 本文の数と突き合わせる（数を作らない）
        text = "第1期から第5期まで、件数は 32、41、38、47、52 万件、割合は 12・15・14・19・22% と推移した。"
        self.assertFalse([w for w in fc.check_fig("chart", FIGS["chart"], text)[1] if "本文に無い" in w])
        self.assertTrue([w for w in fc.check_fig("chart", FIGS["chart"], text.replace("52", "53"))[1] if "本文に無い" in w])

    def test_table_cells_checked_against_text(self):
        f = FIGS["table"]
        e, w = fc.check_fig("table", f, text="項目ごとに甲説と乙説を比べる。結論は可と不可、理由は理由 1 と理由 2。")
        self.assertFalse([x for x in w if "本文に出てこない" in x])
        e, w = fc.check_fig("table", f, text="甲説と乙説。")
        self.assertTrue([x for x in w if "「結論」" in x])

    def test_scale_rules(self):
        f = copy.deepcopy(FIGS["scale"])
        f["items"][1]["at"] = f["items"][0]["at"]
        self.assertTrue(any("同じ at" in e for e in fc.check_fig("scale", f)[0]))
        f = copy.deepcopy(FIGS["scale"])
        f["items"][0]["label"] = "一行目\n二行目"     # 改行は GNOTO が消す。2 行目は sub
        self.assertTrue(fc.check_fig("scale", f)[0])
        f = copy.deepcopy(FIGS["scale"])
        f["items"] = f["items"][:1]
        self.assertTrue(fc.check_fig("scale", f)[0])

    def test_gnoto_fig_depth_follows_pgSanFig(self):
        # 図の記述は pgSanFig（深さ 8 未満を残す）。compare の面の中の当事者（深さ 4）は残る
        errs = []
        fc.fig_walk(FIGS["compare"], "f", 0, errs)
        self.assertEqual(errs, [])
        errs = []
        fc.fig_walk({"a": [[[[[[[[1]]]]]]]]}, "f", 0, errs)
        self.assertTrue(errs)

    def _svg(self, f, d, name):
        p = os.path.join(d, name + ".svg")
        open(p, "w", encoding="utf-8").write(fs.render(f, "図表"))
        return p, fc.svg_check(p)

    def test_tree_styles_respected(self):
        with tempfile.TemporaryDirectory() as d:
            for st in ("bracket", "brace", "nested", "region"):
                f = dict(copy.deepcopy(FIGS["tree"]), treeStyle=st)
                p, (e, w) = self._svg(f, d, st)
                self.assertEqual(e, [], st)
                body = open(p, encoding="utf-8").read()
                rects = body.count("<rect") - 2    # 題の帯と白地を除く
                if st in ("bracket", "brace"):
                    self.assertEqual(rects, 0, st + " は箱を描かない")
                if st == "brace":
                    self.assertIn("<path", body)

    def test_relation_no_bottom_gap_and_label_off_thick_line(self):
        with tempfile.TemporaryDirectory() as d:
            p, (e, w) = self._svg(FIGS["relation"], d, "relation")
            self.assertEqual(e, [])
            self.assertFalse([x for x in w if "余白" in x or "縦横比" in x], w)

    def test_table_uses_wide_width(self):
        with tempfile.TemporaryDirectory() as d:
            p, (e, w) = self._svg(FIGS["table"], d, "table")
            self.assertIn('viewBox="0 0 790', open(p, encoding="utf-8").read())
            f = dict(copy.deepcopy(FIGS["table"]), width="text")
            p, _ = self._svg(f, d, "table2")
            self.assertIn('viewBox="0 0 600', open(p, encoding="utf-8").read())

    def test_new_kinds_render_clean(self):
        with tempfile.TemporaryDirectory() as d:
            for k in ("compare", "chart", "scale"):
                p, (e, w) = self._svg(FIGS[k], d, k)
                self.assertEqual(e, [], k)
                self.assertFalse([x for x in w if "縦横比" in x], (k, w))

    def test_geometry_catches_overlapping_long_labels(self):
        f = copy.deepcopy(FIGS["scale"])
        f["items"] = [{"at": 0.0, "label": "ながいながい語"}, {"at": 0.02, "label": "となりの語句"}, {"at": 0.04, "label": "さらに隣の語"}]
        with tempfile.TemporaryDirectory() as d:
            p, (e, w) = self._svg(f, d, "s")
            self.assertTrue(e)    # 3 つ目は下にも上にも入らない


class NoMaterial(unittest.TestCase):
    def test_no_images_or_long_text_in_skill(self):
        for root, _, files in os.walk(TB):
            if "__pycache__" in root:
                continue
            for fn in files:
                self.assertFalse(fn.lower().endswith((".png", ".jpg", ".jpeg", ".gif", ".pdf", ".webp")), fn)


import page_v2 as pv  # noqa: E402


def chapter_md():
    with open(os.path.join(TB, "samples", "chapter-sample.md"), encoding="utf-8") as f:
        return f.read()


class V2(unittest.TestCase):
    """紙面の指示 v:2（読む順の塊）：page_v2.build_v2 と check_v2（G100・段 L4）。"""

    def build(self, md=None, figs=None, **kw):
        md = md if md is not None else chapter_md()
        figs = {"f1": FIGS["flow"]} if figs is None else figs
        note, plan, errs, warns = pv.build_v2(md, figs, kw.pop("fmt", "fam-f1"), kw.pop("variant", "b1"), kw.pop("title", "第1章　見本"), **kw)
        return note, plan, errs, warns

    def test_sample_builds_and_check_passes(self):
        note, plan, errs, warns = self.build()
        self.assertEqual(errs, [])
        e2, w2 = tp.check_note(note)
        self.assertEqual(e2, [])
        p2 = note["note"]["content"]["page2"]
        self.assertEqual(p2["lite"]["v"], 2)
        self.assertEqual(p2["lite"]["pages"][0]["kind"], "chapter")
        self.assertIn("f1", p2["figs"])
        self.assertNotIn("html", json.dumps(p2))
        ts = {b["t"] for pg in p2["lite"]["pages"] for b in pg["blocks"]}
        self.assertTrue({"h1", "h2", "h3", "p", "box", "note", "fig"} <= ts, ts)

    def test_every_pid_placed_once_and_pages_within_lines(self):
        note, plan, errs, _ = self.build()
        c = note["note"]["content"]
        pids = [r[0]["pid"] for r in c["rows"]]
        placed = [x for pg in c["page2"]["lite"]["pages"] for b in pg["blocks"] for x in b["rows"]]
        self.assertEqual(sorted(pids), sorted(placed))
        self.assertTrue(all(p["rows"] <= plan["lines"] for p in plan["pages"]), plan)
        _, _, st = pv.check_v2(note)
        self.assertEqual(st["over_pages"], 0)

    def test_long_paragraph_is_split_at_sentence(self):
        md = "# 長い節\n\n" + "長い段落の文である。" * 120
        note, plan, errs, warns = self.build(md, {})
        self.assertEqual(errs, [])
        self.assertGreaterEqual(len(plan["pages"]), 3)
        self.assertTrue(any("分けた" in w for w in warns))
        texts = [tp.plain_len(r[0]["html"]) for r in note["note"]["content"]["rows"]]
        self.assertEqual(sum(texts), len("長い節") + 2 + len("長い段落の文である。") * 120 + len("第1章　見本"))

    def test_section_number_added_for_outline_heading(self):
        note, _, _, _ = self.build()
        hs = [r[0]["html"] for r in note["note"]["content"]["rows"] if r[0].get("htype") == "2"]
        self.assertTrue(hs[0].startswith("1　") and hs[1].startswith("2　"), hs)

    def test_ledger_marks_removed(self):
        note, _, _, warns = self.build("# 節\n\n主張の文である[R01]。次の文である[R02, R03]。", {})
        self.assertNotIn("[R0", json.dumps(note, ensure_ascii=False))
        self.assertTrue(any("台帳の印" in w for w in warns))

    def test_unknown_fig_is_error(self):
        _, _, errs, _ = self.build("# 節\n\n文である。\n\n:::fig id=f9 kind=flow\n図\n:::", {})
        self.assertTrue(any("f9" in e for e in errs))

    def test_san_copy_flags_dropped_values(self):
        note, _, _, _ = self.build()
        bad = copy.deepcopy(note)
        L = bad["note"]["content"]["page2"]["lite"]["pages"]
        L[1]["blocks"][0]["t"] = "h9"                 # 知らない塊（落ちる）
        L[1]["blocks"].append({"t": "fig", "fig": "f1", "rows": [], "cap": "<b>x</b>"})   # < > の題（落ちる）
        errs, _, _ = pv.check_v2(bad)
        self.assertTrue(any("落ちる" in e or "数が変わる" in e for e in errs), errs)
        self.assertTrue(any("cap" in e for e in errs), errs)

    def test_san_copy_matches_known_rules(self):
        src = {"v": 2, "pages": [{"id": "p1", "kind": "nope", "run": "<x>", "blocks": [
            {"t": "p", "rows": ["r_ok", "BAD ID"], "lines": 999, "w": 0, "at": "left", "box": "zzz", "no": "1"}]}]}
        out = pv.san_lite_v2(src)
        b = out["pages"][0]["blocks"][0]
        self.assertEqual(out["pages"][0], {"id": "p1", "master": "body", "blocks": [b]})
        self.assertEqual(b, {"t": "p", "rows": ["r_ok"], "no": "1", "lines": 400, "w": 1})

    def test_unplaced_and_over_detected(self):
        note, _, _, _ = self.build()
        bad = copy.deepcopy(note)
        c = bad["note"]["content"]
        c["rows"].append([{"html": "置かれない段落", "pid": "r_zzzzzz"}])
        pg = c["page2"]["lite"]["pages"][1]
        pg["blocks"] += [{"t": "p", "rows": [c["rows"][3][0]["pid"]]}] * 0
        long_pid = "r_long01"
        c["rows"].append([{"html": "あ" * 2000, "pid": long_pid}])
        pg["blocks"].append({"t": "p", "rows": [long_pid]})
        errs, _, _ = pv.check_v2(bad)
        self.assertTrue(any("r_zzzzzz" in e and "未配置" in e for e in errs), errs)
        self.assertTrue(any("あふれる" in e for e in errs), errs)

    def test_cli_build2_and_preview(self):
        with tempfile.TemporaryDirectory() as d:
            mdp, fp, out, pl, pv_html = (os.path.join(d, x) for x in ("c.md", "f.json", "c.gnoto", "plan.json", "p.html"))
            with open(mdp, "w", encoding="utf-8") as f:
                f.write(chapter_md())
            with open(fp, "w", encoding="utf-8") as f:
                json.dump({"f1": FIGS["flow"]}, f, ensure_ascii=False)
            self.assertEqual(tp.main(["build2", "--md", mdp, "--figs", fp, "--chapter-title", "第1章　見本", "--out", out, "--plan", pl]), 0)
            self.assertEqual(tp.main(["check", out]), 0)
            self.assertEqual(tp.main(["preview", out, pv_html]), 0)
            with open(pv_html, encoding="utf-8") as f:
                self.assertIn("塊の一覧", f.read())

    def test_other_variant_without_side_column_uses_foot(self):
        note, plan, errs, _ = self.build(fmt="fam-f1", variant="b2")
        self.assertEqual(errs, [])
        ts = [b["t"] for pg in note["note"]["content"]["page2"]["lite"]["pages"] for b in pg["blocks"]]
        self.assertIn("foot", ts)
        self.assertNotIn("note", ts)

    def test_fig_size_from_svg(self):
        note, _, _, _ = self.build()
        fb = [b for pg in note["note"]["content"]["page2"]["lite"]["pages"] for b in pg["blocks"] if b["t"] == "fig"][0]
        svg = fs.render(FIGS["flow"], "CHART")
        import re as _re
        w, h = map(float, _re.search(r'viewBox="0 0 ([0-9.]+) ([0-9.]+)"', svg).groups())
        self.assertEqual(fb["w"], round(w, 1))
        self.assertEqual(fb["h"], round(h - pv.SVG_TAG_H, 1))
        self.assertTrue(fb["cap"].startswith("CHART 1"))


class ArrowHead(unittest.TestCase):
    """head:"both" の始点の矢じり（G100）：始点の marker は終点と同じ形・refX 9（auto-start-reverse が外向きに回す）。"""

    def test_start_marker_points_outward(self):
        f = {"kind": "flow", "caption": {"title": "双方向"}, "nodes": [{"id": "a", "label": "甲"}, {"id": "b", "label": "乙"}],
             "edges": [{"from": "a", "to": "b", "head": "both"}]}
        svg = fs.render(f)
        import re as _re
        at = _re.search(r'<marker id="at"[^>]*>(.*?)</marker>', svg).group(0)
        ah = _re.search(r'<marker id="ah"[^>]*>(.*?)</marker>', svg).group(0)
        self.assertIn('refX="9"', at)
        self.assertIn('auto-start-reverse', at)
        self.assertEqual(_re.search(r'<path d="([^"]+)"', at).group(1), _re.search(r'<path d="([^"]+)"', ah).group(1))
        self.assertIn('marker-start="url(#at)"', svg)


if __name__ == "__main__":
    unittest.main()
