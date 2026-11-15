#!/usr/bin/env python3
"""gogi_tally.py の試験。材料は架空（実在の条文・判例ではない）。
走らせ方: python3 evals/gogi/test_gogi.py"""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

TOOL = Path(__file__).resolve().parents[2] / "scripts" / "gogi_tally.py"
NAMES = ["bunri", "shushi", "hanrei", "tetsuzuki", "seido"]
ISSUE = {"id": "g01", "question": "架空の問い：XはYに架空法3条の請求ができるか",
         "options": {"A": "肯定", "B": "否定"}, "facts": ["架空の事実"],
         "fixed": [{"ref": "架空法3条", "text": "架空の条文"},
                   {"ref": "架空判決1", "holding": "棄却", "reasons": "架空の理由", "decisive_facts": "架空の事実"},
                   {"ref": "架空判決2", "status": "未確認"}],
         "open": ["架空法3条の「正当な理由」に当たるか"], "field": "minpo"}


def opinion(name, vote, rnd=1, **kw):
    op = {"justice": name, "issue": "g01", "round": rnd, "vote": vote, "conclusion": "結論",
          "rule": "規範", "reasons": ["理由1", "理由2", "理由3"], "application": "当てはめ",
          "relies_on": ["架空法3条"], "precedent": "判例なし", "crux": "前提", "weakest": "弱い所",
          "confidence": "中"}
    if rnd == 2:
        op.update({"changed": False, "reply": "応答", "type": "多数意見に同調"})
    op.update(kw)
    return op


def setup(tmp, ops, rnd=1):
    d = Path(tmp) / "g01"
    (d / f"r{rnd}").mkdir(parents=True, exist_ok=True)
    (d / "issue.json").write_text(json.dumps(ISSUE, ensure_ascii=False), encoding="utf-8")
    for op in ops:
        (d / f"r{rnd}" / f"{op['justice']}.json").write_text(json.dumps(op, ensure_ascii=False), encoding="utf-8")
    return d


def run(d, *args):
    r = subprocess.run([sys.executable, str(TOOL), str(d), *args], capture_output=True, text=True)
    return r.returncode, r.stdout


class GogiTally(unittest.TestCase):
    def test_split_3_2(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = setup(tmp, [opinion(n, "A" if i < 3 else "B") for i, n in enumerate(NAMES)])
            code, out = run(d, "--round", "1")
            self.assertEqual(code, 0, out)
            self.assertIn("3対2", out)
            self.assertIn("第2回を開く", out)

    def test_unanimous(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = setup(tmp, [opinion(n, "A") for n in NAMES])
            code, out = run(d, "--round", "1")
            self.assertEqual(code, 0, out)
            self.assertIn("全員一致", out)
            self.assertIn("第2回は開かない", out)

    def test_outside_fixed_is_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            ops = [opinion(n, "A") for n in NAMES]
            ops[0]["relies_on"] = ["記憶にある判例"]
            ops[1]["relies_on"] = ["架空判決2"]
            code, out = run(setup(tmp, ops), "--round", "1")
            self.assertEqual(code, 1, out)
            self.assertIn("fixed に無い", out)
            self.assertIn("未確認", out)

    def test_bad_vote_and_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            ops = [opinion(n, "A") for n in NAMES[:4]]
            ops[0]["vote"] = "Z"
            code, out = run(setup(tmp, ops), "--round", "1")
            self.assertEqual(code, 1, out)
            self.assertIn("選択肢", out)
            self.assertIn("意見書が無い", out)

    def test_round2_emit_and_types(self):
        with tempfile.TemporaryDirectory() as tmp:
            ops = [opinion("bunri", "B", 2, type="反対意見"), opinion("shushi", "A", 2),
                   opinion("hanrei", "A", 2, type="補足意見"), opinion("tetsuzuki", "A", 2, type="意見"),
                   opinion("seido", "B", 2, type="反対意見")]
            d = setup(tmp, ops, rnd=2)
            code, out = run(d, "--round", "2", "--emit")
            self.assertEqual(code, 0, out)
            result = json.loads((d / "result.json").read_text(encoding="utf-8"))
            self.assertEqual(result["majority"], "A")
            self.assertEqual(result["votes"], {"A": 3, "B": 2})
            text = (d / "blocks.json").read_text(encoding="utf-8")
            for word in ("裁判所・学者の見解ではない", "判例の立場", "評決", "補足意見", "反対意見", "分かれ目", "答案での使い方"):
                self.assertIn(word, text)
            self.assertNotIn("架空判決2", text)  # 未確認の判例は「判例の立場」に出さない

    def test_change_needs_reason(self):
        with tempfile.TemporaryDirectory() as tmp:
            ops = [opinion(n, "A", 2) for n in NAMES]
            ops[0].update({"changed": True})
            ops[1].update({"changed": True, "change_reason": "多数がそうだから"})
            code, out = run(setup(tmp, ops, rnd=2), "--round", "2")
            self.assertEqual(code, 1, out)
            self.assertIn("change_reason が無い", out)
            self.assertIn("人数", out)

    def test_no_majority(self):
        with tempfile.TemporaryDirectory() as tmp:
            issue3 = dict(ISSUE, options={"A": "肯定", "B": "否定", "C": "場合分け"})
            ops = [opinion("bunri", "A", 2), opinion("shushi", "A", 2), opinion("hanrei", "B", 2),
                   opinion("tetsuzuki", "B", 2), opinion("seido", "C", 2)]
            d = setup(tmp, ops, rnd=2)
            (d / "issue.json").write_text(json.dumps(issue3, ensure_ascii=False), encoding="utf-8")
            code, out = run(d, "--round", "2", "--emit")
            self.assertEqual(code, 0, out)
            self.assertIn("多数意見は形成されなかった", out)

    def test_fenced_reply_is_readable(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = setup(tmp, [opinion(n, "A") for n in NAMES])
            p = d / "r1" / "bunri.json"
            p.write_text("```json\n" + p.read_text(encoding="utf-8") + "\n```", encoding="utf-8")
            code, out = run(d, "--round", "1")
            self.assertEqual(code, 0, out)


if __name__ == "__main__":
    unittest.main()
