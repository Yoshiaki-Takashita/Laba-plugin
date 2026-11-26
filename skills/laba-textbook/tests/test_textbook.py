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
        self.assertEqual(sorted(FIGS), ["concept", "flow", "matrix", "relation", "table", "timeline", "tree"])
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
            self.assertEqual(chk('<rect fill="#787878" stroke="#222222" width="5" height="5"/><text x="1" y="1">あ</text>'), [])

    def test_cli_writes_files(self):
        with tempfile.TemporaryDirectory() as d:
            inf = os.path.join(TB, "samples", "figs-examples.json")
            self.assertEqual(fs.main([inf, d]), 0)
            self.assertEqual(sorted(os.listdir(d)), sorted(k + ".svg" for k in FIGS))


class NoMaterial(unittest.TestCase):
    def test_no_images_or_long_text_in_skill(self):
        for root, _, files in os.walk(TB):
            if "__pycache__" in root:
                continue
            for fn in files:
                self.assertFalse(fn.lower().endswith((".png", ".jpg", ".jpeg", ".gif", ".pdf", ".webp")), fn)


if __name__ == "__main__":
    unittest.main()
