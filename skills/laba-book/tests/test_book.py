"""laba-book の試験。実行：python3 -m unittest discover -s skills/laba-book/tests（リポジトリの直下で）。
材料は自作の意味の薄い文だけ（教科書の文章は使わない）。gate の試験は node が要る。"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
BOOK = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(BOOK, "scripts"))
import book_state as bs  # noqa: E402

HAS_NODE = shutil.which("node") is not None
LONG = "温室の室温が換気温度を超えると、天窓が自動で開いて外の空気を取り入れ、室温を作物に合った範囲まで下げる仕組みになっている。"
MID = "開く幅はいつも同じではなく、室温が換気温度をどれだけ上回ったかに応じて段階的に大きくなるため、急な暑さにも対応できる。"
SHORT = "この開く幅のことを、**開度**と呼ぶ。"


def write(tmp, name, text):
    p = os.path.join(tmp, name)
    with open(p, "w", encoding="utf-8") as f:
        f.write(text)
    return p


class BookState(unittest.TestCase):
    def test_init_chapter_next(self):
        b = bs.new_book("温室の管理", "ug", "field")
        self.assertEqual(bs.check_book(b), [])
        bs.set_chapter(b, 1, "換気", "done", "換気温度;開度;例外")
        self.assertEqual(b["next"]["chapter"], 2)
        info = bs.next_info(b)
        self.assertEqual(info["done"][0]["summary"], ["換気温度", "開度", "例外"])
        self.assertEqual(bs.check_book(b), [])

    def test_done_needs_summary(self):
        b = bs.new_book("x")
        bs.set_chapter(b, 1, "a", "done")
        self.assertTrue(any("要点" in e for e in bs.check_book(b)))

    def test_bad_level_and_dup(self):
        b = bs.new_book("x", level="phd")
        b["chapters"] = [{"no": 1, "status": "planned"}, {"no": 1, "status": "planned"}]
        errs = bs.check_book(b)
        self.assertTrue(any("level" in e for e in errs))
        self.assertTrue(any("重複" in e for e in errs))

    def test_cli_roundtrip(self):
        tmp = tempfile.mkdtemp()
        p = os.path.join(tmp, "book.json")
        self.assertEqual(bs.main(["init", p, "--seed", "温室"]), 0)
        self.assertEqual(bs.main(["init", p, "--seed", "温室"]), 1)
        self.assertEqual(bs.main(["chapter", p, "--no", "1", "--status", "done", "--title", "換気", "--summary", "a;b;c"]), 0)
        self.assertEqual(bs.read_json(p)["next"]["chapter"], 2)
        self.assertEqual(bs.main(["check", p]), 0)


class Outline(unittest.TestCase):
    def good(self):
        return {"chapter": {"no": 1, "title": "温室"}, "sections": [
            {"id": "s1", "title": "換気の基準", "items": [{"title": "上限温度"}, {"title": "開度"}], "terms": ["換気温度"], "fig": {"kind": "flow"}},
            {"id": "s2", "title": "保温", "items": [{"title": "被覆"}, {"title": "暖房"}], "terms": ["被覆"], "fig": None}]}

    def test_good(self):
        errs, _ = bs.check_outline(self.good())
        self.assertEqual(errs, [])

    def test_long_item_verb_dup_fig(self):
        o = self.good()
        o["sections"][0]["items"][0]["title"] = "上限の温度を決める仕組み"
        o["sections"][0]["title"] = "換気について"
        o["sections"][1]["terms"] = ["換気温度"]
        o["sections"][1]["fig"] = {"kind": "photo"}
        errs, _ = bs.check_outline(o)
        joined = "\n".join(errs)
        self.assertIn("項の題", joined)
        self.assertIn("名詞で止まっていない", joined)
        self.assertIn("換気温度", joined)
        self.assertIn("photo", joined)

    def test_example_in_reference_is_valid(self):
        with open(os.path.join(BOOK, "references", "outline.md"), encoding="utf-8") as f:
            md = f.read()
        m = re.search(r"```json\n(.*?)\n```", md, re.S)
        errs, _ = bs.check_outline(json.loads(m.group(1)))
        self.assertEqual(errs, [])


class Targets(unittest.TestCase):
    def test_brief_matches_targets(self):
        t = bs.load_targets()
        with open(os.path.join(BOOK, "references", "writer-brief.md"), encoding="utf-8") as f:
            brief = f.read()
        ug, hs, c = t["levels"]["ug"], t["levels"]["hs"], t["common"]
        need = [f"中央値 {ug['sentMedian'][0]}〜{ug['sentMedian'][1]} 字", f"hs {hs['sentMedian'][0]}〜{hs['sentMedian'][1]}",
                f"p90 {ug['sentP90Max']} 字以下", f"変動係数 {c['cvMin']} 以上", f"{c['comma'][0]}〜{c['comma'][1]}",
                f"{c['paraChars'][0]}〜{c['paraChars'][1]} 字", f"{c['asideChars'][0]}〜{c['asideChars'][1]} 字",
                f"{c['boldLenMax']} 字以下", f"{c['boldPer1000'][0]}〜{c['boldPer1000'][1]}", f"（{c['h1Max']} まで）", f"（{c['h2Max']} まで）"]
        for n in need:
            self.assertIn(n, brief, n)

    def test_example_sentence_counts(self):
        # writer-brief の自作の例に書いた字数が本当か
        self.assertEqual([bs.clen(LONG), bs.clen(MID), bs.clen(SHORT.replace("**", ""))], [61, 59, 16])


@unittest.skipUnless(HAS_NODE, "node が無い")
class Gate(unittest.TestCase):
    def test_short_sentences_fail(self):
        tmp = tempfile.mkdtemp()
        body = "\n\n".join(["窓が開く。風が入る。温度が下がる。作物が育つ。"] * 4)
        p = write(tmp, "s.md", "# 換気\n\n" + body + "\n")
        g = bs.gate(p)
        self.assertFalse(g["pass"])
        self.assertIn("sentMedian", g["ng"])
        self.assertTrue(g["join_candidates"])

    def test_long_mixed_passes_sentence_checks(self):
        tmp = tempfile.mkdtemp()
        para = LONG + SHORT.replace("**", "") + MID + "このため、真夏でも室温の上がりすぎを防げる。"
        md = "# 換気の基準\n\n:::box\nAの温室では、昼に室温が上がった。\n:::\n" + "\n\n".join([para] * 4) + "\n"
        p = write(tmp, "s.md", md)
        g = bs.gate(p)
        ids = {r["id"]: r for r in g["checks"]}
        self.assertTrue(ids["sentMedian"]["ok"], ids["sentMedian"])
        self.assertTrue(ids["paraChars"]["ok"], ids["paraChars"])
        self.assertTrue(ids["boxSentMax"]["ok"])

    def test_box_placement_and_bullets(self):
        tmp = tempfile.mkdtemp()
        md = "# 換気\n\n" + LONG + "\n\n:::box\nAが窓を開けた。\n:::\n\n- 箇条\n- 箇条\n"
        g = bs.gate(write(tmp, "s.md", md))
        self.assertIn("boxPlace", g["ng"])
        self.assertIn("bullets", g["ng"])

    def test_checker_ignores_role_blocks(self):
        tmp = tempfile.mkdtemp()
        md = "# 換気\n\n" + LONG + "\n\n:::aside\n" + "補足の文。" * 30 + "\n:::\n"
        p = write(tmp, "s.md", md)
        r = subprocess.run(["node", bs.CHECKER, "--json", p], capture_output=True, text=True)
        j = json.loads(r.stdout)
        self.assertEqual(j["測定"]["段落数"], 1)
        self.assertEqual(j["測定"]["役割の印"]["aside"]["数"], 1)


if __name__ == "__main__":
    unittest.main()
