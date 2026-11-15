#!/usr/bin/env python3
"""合議（意見分離アルゴリズム）の集計。references/gogi.md の 6・8。

使い方:
  gogi_tally.py work/gogi/g01 --round 1          票の分布と、意見書の形の検査
  gogi_tally.py work/gogi/g01 --round 2 --emit   評決を result.json に、ノート用の下書きを blocks.json に書く

この道具は数えるだけで、意見の中身の当否は見ない。事実（条文・判例）は多数決で決めない。
"""
import argparse
import json
import sys
from collections import Counter, OrderedDict
from pathlib import Path

JUSTICES = OrderedDict([
    ("bunri", "文理・体系の立場"),
    ("shushi", "趣旨・利益衡量の立場"),
    ("hanrei", "判例・射程の立場"),
    ("tetsuzuki", "手続・要件事実の立場"),
    ("seido", "制度・帰結の立場"),
])
REQUIRED = ["justice", "issue", "round", "vote", "conclusion", "rule", "reasons",
            "application", "relies_on", "precedent", "crux", "weakest", "confidence"]
REQUIRED_R2 = ["changed", "reply", "type"]
TYPES = ["多数意見に同調", "補足意見", "意見", "反対意見"]
LABEL = "（LABA の5つの立場による検討。裁判所・学者の見解ではない）"


def load_json(path):
    text = Path(path).read_text(encoding="utf-8").strip()
    # 返事が ``` で囲まれていても読めるようにする
    if text.startswith("```"):
        text = text.strip("`")
        text = text[text.index("{"):]
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < 0:
        raise ValueError("JSON が見つからない")
    return json.loads(text[start:end + 1])


def check_opinion(op, issue, rnd, name):
    """意見書の形の検査。所見（文字列）の列を返す。"""
    out = []
    for key in REQUIRED + (REQUIRED_R2 if rnd == 2 else []):
        if key not in op or op[key] in ("", None, []):
            out.append(f"ERROR {name}: 項目 {key} が無い・空")
    if op.get("justice") != name:
        out.append(f"ERROR {name}: justice が {op.get('justice')!r}（ファイル名と違う）")
    if op.get("issue") != issue.get("id"):
        out.append(f"WARN  {name}: issue が {op.get('issue')!r}（争点票は {issue.get('id')!r}）")
    options = issue.get("options", {})
    if op.get("vote") not in options and op.get("vote") != "撤回":
        out.append(f"ERROR {name}: vote {op.get('vote')!r} は選択肢 {list(options)} に無い")
    fixed = {f.get("ref") for f in issue.get("fixed", [])}
    unverified = {f.get("ref") for f in issue.get("fixed", []) if f.get("status") == "未確認"}
    for ref in op.get("relies_on") or []:
        if ref not in fixed:
            out.append(f"ERROR {name}: relies_on の {ref!r} は争点票の fixed に無い（確定領域の外を根拠にしている）")
        elif ref in unverified:
            out.append(f"ERROR {name}: relies_on の {ref!r} は未確認（根拠にできない）")
    reasons = op.get("reasons") or []
    if not 2 <= len(reasons) <= 6:
        out.append(f"WARN  {name}: reasons が {len(reasons)} 個（3〜5 個）")
    if op.get("confidence") not in ("高", "中", "低"):
        out.append(f"WARN  {name}: confidence は 高・中・低 のどれか")
    if rnd == 2:
        if op.get("type") not in TYPES:
            out.append(f"ERROR {name}: type は {TYPES} のどれか")
        if op.get("changed") and not op.get("change_reason"):
            out.append(f"ERROR {name}: 票を変えたのに change_reason が無い")
        reason = str(op.get("change_reason") or "")
        if op.get("changed") and any(w in reason for w in ("多数", "人数", "3人", "4人", "大勢")):
            out.append(f"WARN  {name}: change_reason が人数に触れている（人数は票を変える理由にならない）")
    return out


def tally(dirpath, rnd):
    d = Path(dirpath)
    issue = load_json(d / "issue.json")
    findings, opinions = [], OrderedDict()
    for key in ("id", "question", "options", "fixed", "open"):
        if key not in issue:
            findings.append(f"ERROR issue.json: 項目 {key} が無い")
    for name in JUSTICES:
        p = d / f"r{rnd}" / f"{name}.json"
        if not p.exists():
            findings.append(f"ERROR {name}: 第{rnd}回の意見書が無い（{p.name}）")
            continue
        try:
            op = load_json(p)
        except (ValueError, json.JSONDecodeError) as e:
            findings.append(f"ERROR {name}: 意見書を読めない（{e}）")
            continue
        findings += check_opinion(op, issue, rnd, name)
        opinions[name] = op
    votes = Counter(op["vote"] for op in opinions.values() if op.get("vote") and op.get("vote") != "撤回")
    counted = sum(votes.values())
    majority = None
    if votes:
        top, n = votes.most_common(1)[0]
        if n * 2 > counted:
            majority = top
    result = {
        "id": issue.get("id"), "round": rnd, "question": issue.get("question"),
        "votes": dict(votes), "counted": counted,
        "by_justice": {k: v.get("vote") for k, v in opinions.items()},
        "majority": majority, "unanimous": bool(votes) and len(votes) == 1 and counted == len(JUSTICES),
        "changed": [k for k, v in opinions.items() if v.get("changed")],
        "types": {k: v.get("type") for k, v in opinions.items()} if rnd == 2 else None,
        "errors": sum(1 for f in findings if f.startswith("ERROR")),
    }
    return issue, opinions, result, findings


def score_line(result, options):
    parts = [f"{options.get(k, k)} {n}" for k, n in sorted(result["votes"].items(), key=lambda kv: -kv[1])]
    if result["unanimous"]:
        return f"全員一致（{parts[0]}）"
    if result["majority"] is None:
        return "多数意見は形成されなかった（" + "、".join(parts) + "）"
    nums = "対".join(str(n) for _, n in sorted(result["votes"].items(), key=lambda kv: -kv[1]))
    return f"{nums} で「{options.get(result['majority'], result['majority'])}」（" + "、".join(parts) + "）"


def emit_blocks(issue, opinions, result):
    """ノートに載せる下書き。親が文を整える（中身は変えない）。順序は gogi.md 10。"""
    options = issue.get("options", {})
    blocks = [["SS", f"合議：{issue.get('question', '')}"], ["P", LABEL]]
    precedents = [f for f in issue.get("fixed", []) if f.get("holding")]
    if precedents:
        for f in precedents:
            blocks.append(["P", f"判例の立場：{f['ref']}（{f.get('holding', '')}）。{f.get('reasons', '')}"])
    else:
        blocks.append(["P", "判例の立場：この点を直接判断した確認済みの判例は、争点票に無い。"])
    blocks.append(["P", "評決：" + score_line(result, options)])
    maj = result["majority"]
    groups = OrderedDict()
    for name, op in opinions.items():
        if op.get("vote") == "撤回":
            continue
        if maj is None:
            kind = f"「{options.get(op['vote'], op['vote'])}」とする意見"
        elif op["vote"] != maj:
            kind = "反対意見"
        else:
            kind = op.get("type") if op.get("type") in ("補足意見", "意見") else "多数意見"
        groups.setdefault(kind, []).append((name, op))
    order = ["多数意見", "補足意見", "意見", "反対意見"]
    for kind in sorted(groups, key=lambda k: order.index(k) if k in order else 99):
        for name, op in groups[kind]:
            reasons = "。".join(str(r).rstrip("。") for r in (op.get("reasons") or [])[:3])
            blocks.append(["P", f"{kind}（{JUSTICES[name]}）：{op.get('conclusion', '')} 規範：{op.get('rule', '')} 理由：{reasons}。"])
    blocks.append(["P", "分かれ目：〔crux.md から、「〜と読むなら肯定、〜と読むなら否定」の形で1〜3個を親が書く〕"])
    for name, op in opinions.items():
        blocks.append(["B", f"{JUSTICES[name]}が結論を変える前提：{op.get('crux', '')}"])
    blocks.append(["P", "答案での使い方：〔判例の立場で書くなら／反対の立場で書くなら、を親が書く〕"])
    return blocks


def main():
    ap = argparse.ArgumentParser(description="合議の集計（references/gogi.md）")
    ap.add_argument("dir", help="work/gogi/<争点の番号>")
    ap.add_argument("--round", type=int, choices=(1, 2), default=1)
    ap.add_argument("--emit", action="store_true", help="result.json と blocks.json を書く")
    args = ap.parse_args()
    try:
        issue, opinions, result, findings = tally(args.dir, args.round)
    except FileNotFoundError as e:
        print(f"ERROR 争点票が無い：{e}")
        return 2
    options = issue.get("options", {})
    print(f"争点 {result['id']}：{result['question']}")
    print(f"第{args.round}回　" + score_line(result, options))
    for name, vote in result["by_justice"].items():
        mark = "（票を変えた）" if name in result["changed"] else ""
        print(f"  {JUSTICES[name]}：{options.get(vote, vote)}{mark}")
    for f in findings:
        print(f)
    if args.round == 1 and not result["unanimous"] and result["counted"]:
        print("票が分かれた。crux.md に分かれ目を書き、第2回を開く（gogi.md 6・7）。")
    if args.round == 1 and result["unanimous"]:
        print("全員一致。第2回は開かない。理由が同じか違うかを書く（gogi.md 6）。")
    if args.emit:
        d = Path(args.dir)
        (d / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
        (d / "blocks.json").write_text(json.dumps(emit_blocks(issue, opinions, result), ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"書いた：{d / 'result.json'}、{d / 'blocks.json'}（下書き。親が文を整える）")
    return 1 if result["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
