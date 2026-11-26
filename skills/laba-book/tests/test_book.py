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

    def test_fig_want(self):
        o = self.good()
        o["sections"][0]["fig"] = {"kind": "table", "want": "chart"}
        errs, warns = bs.check_outline(o)
        self.assertEqual(errs, [])
        self.assertTrue(any("chart" in w for w in warns))
        o["sections"][1]["fig"] = {"want": "pie"}
        errs, _ = bs.check_outline(o)
        self.assertTrue(any("pie" in e for e in errs))
        o["sections"][1]["fig"] = {"why": "x"}
        errs, _ = bs.check_outline(o)
        self.assertTrue(any("kind も want も無い" in e for e in errs))

    def test_example_in_reference_is_valid(self):
        with open(os.path.join(BOOK, "references", "outline.md"), encoding="utf-8") as f:
            md = f.read()
        m = re.search(r"```json\n(.*?)\n```", md, re.S)
        errs, _ = bs.check_outline(json.loads(m.group(1)))
        self.assertEqual(errs, [])


class Figs(unittest.TestCase):
    """P5 図（L3・G96）：構成の候補 → figs.json → 本文の :::fig id= → 描いた SVG の突き合わせ。"""

    def make(self, tmp):
        sys.path.insert(0, bs.TEXTBOOK_SCRIPTS)
        import figure_svg as fsv  # noqa: E402
        ex = json.load(open(os.path.join(bs.TEXTBOOK_SCRIPTS, "..", "samples", "figs-examples.json"), encoding="utf-8"))
        o = {"chapter": {"no": 1, "title": "変更"}, "sections": [
            {"id": "s1", "title": "変更の前後", "items": [{"title": "前"}, {"title": "後"}], "terms": ["合併"], "fig": {"kind": "compare", "id": "f1"}},
            {"id": "s2", "title": "件数", "items": [{"title": "推移"}, {"title": "割合"}], "terms": ["件数"], "fig": {"kind": "chart", "dropped": "本文に数が 2 点しかない"}}]}
        write(tmp, "outline.json", json.dumps(o, ensure_ascii=False))
        md = ("# 変更の前後\n\n変更前には甲が A 社を、乙が B 社を持ち、債権者は B 社に債権を持っていた。変更後には B 社の権利義務は A 社へ移り、"
              "甲と乙はともに A 社を持ち、債権者は A 社に債権を持つ。\n\n:::fig id=f1 kind=compare\n変更前と変更後の当事者の関係\n:::\n")
        write(tmp, "s1.md", md)
        write(tmp, "s2.md", "# 件数\n\n本文。\n")
        write(tmp, "figs.json", json.dumps({"f1": ex["compare"]}, ensure_ascii=False))
        os.makedirs(os.path.join(tmp, "figs"))
        with open(os.path.join(tmp, "figs", "f1.svg"), "w", encoding="utf-8") as f:
            f.write(fsv.render(ex["compare"]))
        return o

    def test_made_and_dropped_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.make(tmp)
            errs, warns, st = bs.check_figs(tmp)
            self.assertEqual(errs, [])
            self.assertEqual((st["candidates"], st["made"], st["dropped"], st["pending"]), (2, 1, 1, 0))
            self.assertEqual(bs.main(["figs", tmp]), 0)

    def test_missing_svg_text_ref_and_reason(self):
        with tempfile.TemporaryDirectory() as tmp:
            o = self.make(tmp)
            os.remove(os.path.join(tmp, "figs", "f1.svg"))
            self.assertTrue(any("SVG が無い" in e for e in bs.check_figs(tmp)[0]))
        with tempfile.TemporaryDirectory() as tmp:
            o = self.make(tmp)
            write(tmp, "s1.md", "# 変更の前後\n\n本文。\n")
            self.assertTrue(any(":::fig id=f1 が 0 回" in e for e in bs.check_figs(tmp)[0]))
        with tempfile.TemporaryDirectory() as tmp:
            o = self.make(tmp)
            del o["sections"][1]["fig"]["dropped"]
            write(tmp, "outline.json", json.dumps(o, ensure_ascii=False))
            self.assertTrue(any("やめた理由" in e for e in bs.check_figs(tmp)[0]))

    def test_fig_words_checked_against_text_without_fig_block(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.make(tmp)
            write(tmp, "s1.md", "# 変更の前後\n\n関係の無い本文。\n\n:::fig id=f1 kind=compare\n甲 乙 A 社 B 社 債権者 変更前 変更後\n:::\n")
            errs, warns, st = bs.check_figs(tmp)
            self.assertTrue([w for w in warns if "本文に出てこない" in w])

    def test_outline_accepts_new_kinds_and_variant_hint(self):
        o = Outline().good()
        o["sections"][0]["fig"] = {"kind": "scale"}
        o["sections"][1]["fig"] = {"kind": "tree", "want": "brace"}
        errs, warns = bs.check_outline(o)
        self.assertEqual(errs, [])
        self.assertTrue(any("treeStyle" in w for w in warns))


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


LEDGER = """ID | 完全な書誌 | 確認に使った URL | V0〜V3 | 使い方の印
R01 | 甲大学「温室学」シラバス | https://example.org/a | V3 | 【構成】【ウェブ】
R02 | 乙学会『用語集』「換気温度」の項 | https://example.org/b | V3 | 【一次】【ウェブ】
R03 | 丙社の書籍ページ（目次だけ） | https://example.org/c | V2 | 【構成】【ウェブ】
# 未確認（本文で使わない）
U01 | 丁規則 第3条 | 探した先：コネクタ（つながっていない） | 未確認 | 次の手：コネクタのある環境で確かめる
"""


def good_map():
    return {"seed": "温室", "kind": "word", "level": "ug", "field": "施設園芸",
            "standard": {"check": ["R01", "R03"], "note": "シラバスと目次"},
            "chapters": [{"no": 1, "title": "温室の環境", "concepts": ["c1", "c2", "c3", "c4", "c5"], "check": ["R01"]}],
            "concepts": [{"id": "c1", "name": "室温", "pre": [], "check": ["R02"]},
                         {"id": "c2", "name": "換気温度", "pre": ["c1"], "check": ["R02"]},
                         {"id": "c3", "name": "開度", "pre": ["c2"], "check": ["R02"]},
                         {"id": "c4", "name": "被覆", "pre": [], "check": ["R02"]},
                         {"id": "c5", "name": "保温", "pre": ["c4"], "todo": ["乙学会の用語集"]}],
            "excluded": [{"name": "植物工場", "why": "隣の分野"}], "write": {"chapter": 1}}


class Map(unittest.TestCase):
    def test_good(self):
        errs, warns = bs.check_map(good_map(), bs.parse_ledger(LEDGER))
        self.assertEqual(errs, [])
        self.assertTrue(any("todo" in w for w in warns))

    def test_cycle_missing_and_unconfirmed(self):
        m = good_map()
        m["concepts"][0]["pre"] = ["c3"]          # c1 → c3 → c2 → c1
        m["concepts"][1]["check"] = ["U01"]      # 未確認の行を確認先に
        m["concepts"][3]["check"] = ["R99"]      # 台帳に無い
        del m["concepts"][4]["todo"]             # 確認先なし
        m["standard"] = {}
        errs, _ = bs.check_map(m, bs.parse_ledger(LEDGER))
        j = "\n".join(errs)
        for k in ("循環", "U01", "R99", "c5", "standard.check"):
            self.assertIn(k, j, k)

    def test_later_chapter_prereq_and_count(self):
        m = good_map()
        m["kind"] = "field"
        m["chapters"].append({"no": 2, "title": "保温", "concepts": ["c5"], "check": ["R01"]})
        m["chapters"][0]["concepts"] = ["c1", "c2", "c3", "c4"]
        m["concepts"][0]["pre"] = ["c5"]
        errs, warns = bs.check_map(m, bs.parse_ledger(LEDGER))
        j = "\n".join(errs)
        self.assertIn("後ろの章", j)
        self.assertIn("概念が 4 個", j)
        self.assertTrue(any("5〜15 章" in w for w in warns))

    def test_example_in_reference_is_valid(self):
        with open(os.path.join(BOOK, "references", "scope.md"), encoding="utf-8") as f:
            md = f.read()
        m = json.loads(re.search(r"```json\n(.*?)\n```", md, re.S).group(1))
        errs, _ = bs.check_map(m)
        self.assertEqual(errs, [])


class Ledger(unittest.TestCase):
    def test_parse_and_ok(self):
        L = bs.parse_ledger(LEDGER)
        self.assertEqual([r["id"] for r in L["rows"]], ["R01", "R02", "R03"])
        self.assertEqual([u["id"] for u in L["unconfirmed"]], ["U01"])
        errs, warns, st = bs.check_ledger(L)
        self.assertEqual(errs, [])
        self.assertEqual(st["byV"], [0, 0, 1, 2])

    def test_v0_dup_url_absent(self):
        bad = LEDGER + "R04 | 記憶の本 |  | V0 | 【一次】\nR02 | 重複 | https://x | V3 | 【ウェブ】\nR05 | 戊法 第9条 |  | V3 | 【一次】\nU02 | 何か | 探した先：検索 | 未確認 | 存在しない\n"
        errs, warns, _ = bs.check_ledger(bs.parse_ledger(bad))
        j = "\n".join(errs + warns)
        for k in ("V0", "重複", "URL が空：R05", "存在しない", "条文・判例の行"):
            self.assertIn(k, j, k)

    def test_reference_example_parses(self):
        with open(os.path.join(BOOK, "references", "sources.md"), encoding="utf-8") as f:
            md = f.read()
        block = re.search(r"```\n(ID \|.*?)\n```", md, re.S).group(1)
        L = bs.parse_ledger(block)
        self.assertEqual(len(L["rows"]), 5)
        self.assertEqual(len(L["unconfirmed"]), 1)
        errs, _, _ = bs.check_ledger(L)
        self.assertEqual(errs, [])


class Claims(unittest.TestCase):
    def test_marks_and_candidates(self):
        md = ("# 換気の基準\n\n:::box\nAの温室では、昼に室温が30度まで上がった。\n:::\n"
              "室温が上がりすぎると作物が弱るので、決めた温度を超えたら天窓を開ける[R02]。"
              "この決めた温度を、**換気温度**と呼ぶ。"
              "換気温度は作物ごとに違い、トマトでは25度前後とされる。"
              "なぜ窓を段階的に開けるのだろうか。"
              "急に開けると室温が下がりすぎるからである[R01,R02]。\n\n"
              ":::aside\n冬は保温のために窓を閉じる[U01]。\n:::\n"
              ":::point\n- 換気温度は30度\n:::\n")
        r = bs.claims(md, bs.parse_ledger(LEDGER))
        self.assertFalse(r["pass"])
        self.assertEqual(r["marked"], 3)
        self.assertEqual(r["unmarked_claims"], 2)      # 定義の文・数の文（box と point は数えない）
        self.assertEqual(r["cited_unconfirmed"], ["U01"])
        sig = [u["signals"] for u in r["unmarked"]]
        self.assertIn(["定義"], sig)

    def test_v2_and_unknown(self):
        md = "# 節\n\n目次では換気が先に来る[R03]。別の本もある[R09]。\n"
        r = bs.claims(md, bs.parse_ledger(LEDGER))
        self.assertEqual(r["cited_v2"], ["R03"])
        self.assertEqual(r["unknown_ids"], ["R09"])

    def test_clean_passes_and_strip(self):
        md = "# 節\n\n**換気温度**と呼ぶ[R02]。窓は2つある。\n"
        r = bs.claims(md, bs.parse_ledger(LEDGER))
        self.assertTrue(r["pass"], r)
        self.assertEqual(bs.strip_marks(md), "# 節\n\n**換気温度**と呼ぶ。窓は2つある。\n")

    @unittest.skipUnless(HAS_NODE, "node が無い")
    def test_gate_ignores_marks(self):
        tmp = tempfile.mkdtemp()
        para = LONG + SHORT.replace("**", "") + MID + "このため、真夏でも室温の上がりすぎを防げる。"
        plain = "# 換気の基準\n\n" + "\n\n".join([para] * 4) + "\n"
        marked = plain.replace("仕組みになっている。", "仕組みになっている[R01,R02]。")
        g1 = bs.gate(write(tmp, "a.md", plain))
        g2 = bs.gate(write(tmp, "b.md", marked))
        self.assertEqual(g1["measure"], g2["measure"])


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


    @unittest.skipUnless(HAS_NODE, "node が無い")
    def test_article_number_is_not_connective(self):
        """「第2条は」「第三者が」で始まる段落を接続語（順序）と数えない。「第一に」は数える（G100）。"""
        tmp = tempfile.mkdtemp()
        md = "\n\n".join(["第2条は、" + LONG, "第15条の規定は、" + MID, "第三者が現れると、" + LONG, "第一に、" + MID])
        p = write(tmp, "s.md", md)
        r = subprocess.run(["node", bs.CHECKER, "--json", p], capture_output=True, text=True)
        j = json.loads(r.stdout)
        self.assertEqual(j["測定"]["段落数"], 4)
        self.assertAlmostEqual(j["測定"]["段落の頭の接続語の割合"], 0.25)


class Page(unittest.TestCase):
    """P6 紙面：book_state.py page（G100）。"""

    def test_page_from_chapter_dir(self):
        tmp = tempfile.mkdtemp()
        write(tmp, "outline.json", json.dumps({"chapter": {"no": 2, "title": "換気"}, "sections": [{"id": "s1", "title": "換気", "fig": None}, {"id": "s2", "title": "開度", "fig": None}]}, ensure_ascii=False))
        write(tmp, "s1.md", "# 換気\n\n" + (LONG + MID) * 3 + "[R01]\n\n:::aside\n補足の文である。\n:::\n")
        write(tmp, "s2.md", "# 開度\n\n" + (MID + LONG) * 4 + "\n\n:::point\n- 要点\n:::\n")
        out = os.path.join(tmp, "c.gnoto")
        errs, warns, plan = bs.make_page(tmp, out, plan_path=os.path.join(tmp, "plan.json"))
        self.assertEqual(errs, [])
        note = json.load(open(out, encoding="utf-8"))
        lite = note["note"]["content"]["page2"]["lite"]
        self.assertEqual(lite["v"], 2)
        self.assertEqual(lite["pages"][0]["kind"], "chapter")
        first = note["note"]["content"]["rows"][0][0]["html"]
        self.assertEqual(first, "第2章　換気")
        self.assertNotIn("[R01]", json.dumps(note, ensure_ascii=False))
        self.assertTrue(all(p["rows"] <= plan["lines"] for p in plan["pages"]))
        self.assertEqual(bs.main(["page", tmp, "--out", out]), 0)

    def test_page_without_text_is_error(self):
        tmp = tempfile.mkdtemp()
        write(tmp, "outline.json", json.dumps({"chapter": {"no": 1, "title": "x"}, "sections": [{"id": "s1", "title": "x", "fig": None}]}))
        errs, _, _ = bs.make_page(tmp, os.path.join(tmp, "c.gnoto"))
        self.assertTrue(errs)


if __name__ == "__main__":
    unittest.main()


# ---------- G102：深さ（事実の表）・事典のまとめ・読点でつなぐ文・本文の断り ----------
LEDGER2 = """ID | 完全な書誌 | 確認に使った URL | V0〜V3 | 使い方の印
R01 | 甲省「温室の手引」 | https://example.go.jp/a | V3 | 【一次】【公的】【ウェブ】
R02 | 乙大学「園芸学」講義資料 | https://example.ac.jp/b | V3 | 【二次】【講義】【ウェブ】
R03 | 丙学会「用語集」 | https://example.or.jp/c | V1 | 【二次】【学会】【ウェブ】
R04 | ウィキペディア「温室」 | https://ja.wikipedia.org/wiki/x | V1 | 【二次】【ウェブ】
R05 | ウィキペディア「換気」 | https://ja.wikipedia.org/wiki/y | V1 | 【手がかり】【ウェブ】
"""


class DepthG102(unittest.TestCase):
    def test_hint_rows(self):
        L = bs.parse_ledger(LEDGER2)
        errs, warns, st = bs.check_ledger(L)
        self.assertTrue(any("R04" in e and "手がかり" in e for e in errs))
        self.assertFalse(any("R05" in e for e in errs))
        self.assertEqual(st["hints"], 2)
        self.assertEqual(st["kinds"], ["【公的】", "【学会】", "【講義】"])
        r = bs.claims("# 題\n\n**換気温度**は作物ごとに違うと呼ぶ[R05]。室温は上がる[R01]。\n", L)
        self.assertIn("R05", r["cited_hint"])
        self.assertFalse(r["pass"])

    def test_kind_from_url(self):
        self.assertEqual(bs.source_kind({"use": "", "url": "https://laws.e-gov.go.jp/x"}), "【法令】")
        self.assertEqual(bs.source_kind({"use": "", "url": "https://www.example.ac.jp/x.pdf"}), "【講義】")
        self.assertEqual(bs.source_kind({"use": "【査読】", "url": "https://example.com"}), "【査読】")

    def test_facts_depth_and_quote(self):
        tmp = tempfile.mkdtemp()
        os.makedirs(os.path.join(tmp, "sources"))
        write(tmp, "sources/R01.txt", "温室の 換気温度は、作物の種類によって異なり、\nトマトでは高めにする。")
        L = bs.parse_ledger(LEDGER2)
        rows, bad = bs.parse_facts("ID | 節 | 台帳 | 事実 | 抜き書き\n"
                                   "F01 | s1 | R01 | 換気温度は作物で違う | 換気温度は作物の種類によって異なり\n"
                                   "F02 | s1 | R01 | 作り話 | 換気温度は一年中同じである\n"
                                   "F03 | s1 | R04 | まとめ | なにか\n"
                                   "F04 | s1 | U09 | 未確認 | なにか\n")
        self.assertEqual(bad, [])
        errs, warns, st = bs.check_facts(rows, L, os.path.join(tmp, "sources"))
        j = "\n".join(errs)
        self.assertNotIn("F01", j)
        self.assertIn("F02", j)   # 抜き書きが原文に無い
        self.assertIn("F03", j)   # 事典のまとめ
        self.assertIn("F04", j)   # 台帳に無い
        self.assertTrue(st["s1"]["short"])  # 事実 4・出典 1 → 深さ不足
        rows = [{"id": f"F{i:02d}", "sec": "s1", "rids": [["R01", "R02", "R03"][i % 3]], "fact": "x", "quote": ""} for i in range(12)]
        errs, warns, st = bs.check_facts(rows, L)
        self.assertEqual(errs, [])
        self.assertEqual(st["s1"]["short"], [])

    @unittest.skipUnless(HAS_NODE, "node が無い")
    def test_comma_chain_and_note(self):
        chain = "上の場面のように、温かい物を冷たい物に近づけると、温かい方は冷え、冷たい方は温まるが、どんな近づけ方でも同じとは限らず、間に熱を通さない板があれば、二つの物がじかにふれていても温冷の変化はほとんど起きないことが多いと考えられている。"
        self.assertEqual(len(bs.chain_sentences([chain])), 1)
        self.assertEqual(len(bs.chain_sentences([LONG + MID])), 0)
        tmp = tempfile.mkdtemp()
        body = "# 換気の基準\n\n" + "\n\n".join([LONG + MID + SHORT, chain + LONG, chain + MID, "開く幅の上限は資料には示されておらず不明である。" + LONG + MID]) + "\n"
        g = bs.gate(write(tmp, "s.md", body))
        ids = {c["id"]: c for c in g["checks"]}
        self.assertFalse(ids["commaChain"]["ok"])
        self.assertFalse(ids["noteInBody"]["ok"])
        self.assertIn("commaChain", g["ng"])

    def test_source_text_html(self):
        tmp = tempfile.mkdtemp()
        p = write(tmp, "a.html", "<html><head><style>x{}</style><script>var a=1;</script></head><body><nav>メニュー</nav><p>換気温度は作物の種類によって異なる。</p><p>二つ目の段落。</p></body></html>")
        sys.path.insert(0, os.path.join(BOOK, "scripts"))
        import source_text
        t = source_text.extract(p)
        self.assertIn("換気温度は作物の種類によって異なる。", t)
        self.assertNotIn("var a", t)
        self.assertNotIn("メニュー", t)

    def test_facts_tab_and_empty(self):
        L = bs.parse_ledger(LEDGER2)
        rows, bad = bs.parse_facts("ID\t節\t台帳\t事実\t抜き書き\nF01\ts1\tR01\t換気温度は作物で違う\t換気温度は作物の種類によって異なり\n")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["rids"], ["R01"])
        tmp = tempfile.mkdtemp()
        lp = write(tmp, "ledger.tsv", LEDGER2)
        fp = write(tmp, "facts.tsv", "F01,s1,R01,形の違う行\n")
        self.assertEqual(bs.main(["facts", fp, "--ledger", lp]), 1)  # 1 行も読めなければ通さない

    def test_fig_note_ledger_id(self):
        tmp = tempfile.mkdtemp()
        write(tmp, "outline.json", json.dumps({"chapter": {"no": 1, "title": "x"}, "sections": [{"id": "s1", "title": "題", "fig": None}]}))
        write(tmp, "figs.json", json.dumps({"f1": {"kind": "table", "note": "甲の資料（R08）の表による"}}, ensure_ascii=False))
        errs, warns, st = bs.check_figs(tmp)
        self.assertTrue(any("台帳の ID" in e for e in errs))
