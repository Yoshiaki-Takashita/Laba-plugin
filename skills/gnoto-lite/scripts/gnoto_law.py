#!/usr/bin/env python3
"""条文・判例・引用を、コネクタが返した JSON から普通のブロックにする整形器。

重要：このファイルは法律の知識を持たない。
  ・条文のデータ、法令名の略称表、判例の表、引用の解析（表記→法令・条）は、ここにも他のファイルにも無い。
  ・それらはサーバー側のコネクタ（laba-jp-connector）が持つ。Claude が SKILL.md の手順でツールを呼び、
    返った JSON をファイルに保存して、この整形器に渡す。
  ・ここがすることは、(1) 返った JSON が「使ってよい状態」かの確認と、使えないときの拒否、
    (2) 返った文言をそのまま見出し・本文・出典の行（普通のブロック）にすること、だけ。
コネクタの入出力の形は laba-jp-connector の schemas/tools.v1.json に従う（status・provenance・revision など）。
"""
import re

import gnoto_note as gn

CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳"


class Refused(Exception):
    """コネクタの結果が、ノートに書いてよい状態でない。message を利用者に見せる。candidates があれば添える。"""

    def __init__(self, message, candidates=None, status=None):
        super().__init__(message)
        self.candidates = candidates or []
        self.status = status


def _need_ok(d, tool, allow=("found",)):
    if not isinstance(d, dict):
        raise Refused("%s の結果が JSON のオブジェクトでない" % tool)
    st = d.get("status")
    if st not in allow:
        msg = {
            "multiple": "候補が複数ある。利用者に選んでもらうか、条件を絞って呼び直す（勝手に選ばない）",
            "no_match": "該当が無い（存在しないという意味ではない）。【未確認】と書く",
            "not_covered": "このコネクタの収録範囲の外（実在しないという意味ではない）。【未確認】と書く",
            "upstream_error": "上流の失敗・混雑。時間をおいて呼び直す",
            "invalid_input": "入力の形式の誤り。呼び出しの引数を直す",
        }.get(st, "status=%r は使えない" % (st,))
        err = d.get("error") or {}
        if err.get("message"):
            msg += "（%s）" % err["message"]
        raise Refused("%s：%s" % (tool, msg), status=st)
    prov = d.get("provenance")
    if not isinstance(prov, dict) or not prov.get("retrieved_at") or not prov.get("source"):
        raise Refused("%s：provenance（出典・取得日時）が無いので、ノートに書かない" % tool)
    return prov


def _attr(prov):
    """provenance.attribution の先頭の「出典：」は、出典の行がもう持っているので外す。"""
    a = str(prov.get("attribution") or "").strip()
    return a[3:].lstrip() if a.startswith("出典：") else a


def _date(iso):
    return str(iso or "")[:10]


def _paren(caption):
    c = str(caption or "").strip()
    if not c:
        return ""
    if c[0] in "（(" and c[-1] in "）)":
        return c.replace("(", "（").replace(")", "）")
    return "（%s）" % c


def _num_label(n):
    return CIRCLED[n - 1] if 1 <= n <= len(CIRCLED) else "（%d）" % n


# ---------------------------------------------------------------------------
# 条文
# ---------------------------------------------------------------------------
def statute_rows(res, asof=None, numbers="auto", paragraph=None, item=None):
    """law_get_article の出力 → (行のリスト, 出典の記録)。

    numbers: auto＝項が 2 つ以上、または 1 つで項番号が 1 でないとき丸数字／always／never。
    paragraph・item：law_get_article を項・号を指定して呼んだときの、その値（呼ぶ側が渡す）。
    渡すと見出しに「第N項」「第M号」を付け、条の一部だけであることを見せる（第1項だけを条の全体と誤読させない）。
    """
    prov = _need_ok(res, "law_get_article")
    law = res.get("law") or {}
    rev = res.get("revision") or {}
    label = res.get("article_label")
    paras = res.get("paragraphs") or []
    if not law.get("title") or not label:
        raise Refused("law_get_article：法令名か条の表記が無い")
    if not paras and not res.get("text"):
        raise Refused("law_get_article：本文が空")
    rows = []
    part = ""
    if paragraph:
        part += "第%s項" % paragraph
    if item:
        part += "第%s号" % item
    rows.append([gn.text_block("%s %s%s%s" % (law["title"], label, part, _paren(res.get("caption"))), htype="3")])
    if paras:
        use_num = numbers == "always" or (numbers == "auto" and not paragraph
                                          and (len(paras) > 1 or paras[0].get("num", 1) != 1))
        for p in paras:
            head = (_num_label(p["num"]) + "　") if use_num else ""
            rows.append([gn.text_block(head + p["text"])])
            for it in p.get("items") or []:
                rows.append([gn.text_block("%s　%s" % (it["label"], it["text"]), indent="1")])
    else:
        rows.append([gn.text_block(res["text"])])
    parts = ["出典：%s" % prov["source"]]
    if law.get("law_id"):
        parts.append("法令ID %s" % law["law_id"])
    if rev.get("law_revision_id"):
        parts.append("版 %s" % rev["law_revision_id"])
    if rev.get("enforcement_date"):
        parts.append("施行日 %s" % rev["enforcement_date"])
    if asof:
        parts.append("時点指定 %s" % asof)
    parts.append("取得 %s（law_get_article）" % _date(prov["retrieved_at"]))
    line = "／".join(parts)
    if _attr(prov):
        line += "。表記：" + _attr(prov)
    if rev.get("is_current") is False:
        line += "。この版は取得時点で現行ではない"
    if rev.get("scheduled_enforcement_date"):
        line += "。施行予定 %s" % rev["scheduled_enforcement_date"]
    rows.append([gn.source_line(line)])
    record = {
        "kind": "statute", "tool": "law_get_article", "law_title": law["title"], "law_id": law.get("law_id"),
        "article_label": label, "paragraph": paragraph, "item": item, "law_revision_id": rev.get("law_revision_id"),
        "enforcement_date": rev.get("enforcement_date"), "asof": asof,
        "source_urls": prov.get("source_urls") or [], "retrieved_at": prov["retrieved_at"],
    }
    return rows, record


# ---------------------------------------------------------------------------
# 判例
# ---------------------------------------------------------------------------
def _reporter_text(rep):
    if not rep:
        return ""
    return str(rep.get("raw") or "")


def _case_heading(brief, rep):
    wd = (brief.get("date") or {}).get("wareki") or (brief.get("date") or {}).get("iso") or ""
    head = "%s%s %s" % (brief.get("bench") or "", brief.get("type") or "", wd)
    head = re.sub(r"\s+", " ", head).strip()
    if brief.get("case_name"):
        head += "（%s）" % brief["case_name"]
    r = _reporter_text(rep)
    if r:
        head += "　%s" % r
    return head


def case_rows(res, verify=None):
    """case_get（または case_verify_citation）の出力 → (行のリスト, 出典の記録)。

    case_get：書誌＋判示事項＋裁判要旨＋参照法条（要旨は裁判所の編集と明記）。
    case_verify_citation：書誌だけ。match.fields の全項目が match のときだけ「書誌は照合済み」と書き、
    mismatch・unknown があれば、その項目名を書く（確認済みとは書かない）。
    verify を渡すと、case_get の結果に、照合の結果の行を足す。
    """
    if isinstance(res, dict) and "match" in res and "case" not in res:
        prov = _need_ok(res, "case_verify_citation")
        m = res.get("match")
        if not m:
            raise Refused("case_verify_citation：照合の結果（match）が無い")
        actual = m.get("actual") or {}
        brief, rep = actual.get("brief"), actual.get("reporter")
        if not brief:
            raise Refused("case_verify_citation：実際の書誌（actual.brief）が無い")
        fields = m.get("fields") or {}
        tool = "case_verify_citation"
        body = []
    else:
        prov = _need_ok(res, "case_get")
        c = res.get("case")
        if not c or not c.get("brief"):
            raise Refused("case_get：判例の情報（case.brief）が無い")
        brief, rep = c["brief"], c.get("reporter")
        fields = None
        tool = "case_get"
        body = []
        if c.get("holdings"):
            body.append("判示事項：" + c["holdings"])
        if c.get("summary"):
            body.append("裁判要旨：" + c["summary"])
        if c.get("statutes"):
            body.append("参照法条：" + c["statutes"])
        if not body:
            body.append("（このコネクタが返した要旨・判示事項は空だった）")
    rows = [[gn.text_block(_case_heading(brief, rep), htype="3")]]
    for t in body:
        rows.append([gn.text_block(t)])
    if brief.get("case_number"):
        rows.append([gn.source_line("事件番号：%s" % brief["case_number"])])
    verdict = None
    if verify is not None:
        vm = _verify_match(verify)
        if str(vm.get("case_id") or "") != str(brief.get("case_id") or ""):
            raise Refused("case_verify_citation の case_id（%s）が、この判例の case_id（%s）と違う。別の判例の照合結果は付けない"
                          % (vm.get("case_id"), brief.get("case_id")))
        fields = vm.get("fields") or {}
    if fields is not None:
        bad = [k for k, v in fields.items() if v != "match"]
        if fields and not bad:
            verdict = "書誌は照合済み（case_verify_citation：全項目一致）"
        elif bad:
            verdict = "書誌に不一致・不明の項目がある：%s。確認済みとは書かない" % "、".join(bad)
        else:
            verdict = "書誌の照合の項目が空。確認済みとは書かない"
        rows.append([gn.source_line(verdict)])
    note = "出典：%s／case_id %s／取得 %s（%s）" % (prov["source"], brief.get("case_id", ""),
                                                  _date(prov["retrieved_at"]), tool)
    if tool == "case_get":
        note += "。判示事項・裁判要旨は裁判所の編集で、判決の文ではない"
    if _attr(prov):
        note += "。表記：" + _attr(prov)
    rows.append([gn.source_line(note)])
    record = {"kind": "case", "tool": tool, "case_id": brief.get("case_id"), "case_number": brief.get("case_number"),
              "date": (brief.get("date") or {}).get("iso"), "bibliography_verified": (verdict or "").startswith("書誌は照合済み"),
              "detail_url": brief.get("detail_url"), "source_urls": prov.get("source_urls") or [],
              "retrieved_at": prov["retrieved_at"]}
    return rows, record


def _verify_match(v):
    if isinstance(v, dict) and v.get("status") == "found" and isinstance(v.get("match"), dict):
        return v["match"]
    raise Refused("case_verify_citation：status が found でないか、match が無い")


# ---------------------------------------------------------------------------
# 「」の引用
# ---------------------------------------------------------------------------
PART_LABEL = {
    "fulltext": "判決全文",
    "summary": "裁判要旨（裁判所の編集した文で、判決の文ではない）",
    "holdings": "判示事項（裁判所の編集した文で、判決の文ではない）",
}


def quote_rows(res, quote, cite, as_judgment=True):
    """case_quote_check の出力 → 引用のブロック。

    一致（exact／normalized）のときだけ作る。normalized は返された原文の表記（matched_text）で引く。
    as_judgment=True（判旨として引く）のときは where.part が fulltext のものだけ通す。
    cite は本文に出す判例の表記（呼ぶ側が決める）。呼ぶ側（Claude）が、確かめた判例の表記を渡す。
    """
    prov = _need_ok(res, "case_quote_check")
    result = res.get("result")
    if result not in ("exact", "normalized"):
        near = (res.get("nearest") or {}).get("text")
        raise Refused("case_quote_check：result=%s。引用は一致しなかったので書かない%s"
                      % (result, "（最も近い文は一致ではない：%s）" % near if near else ""))
    where = res.get("where") or {}
    part = where.get("part")
    if part not in PART_LABEL:
        raise Refused("case_quote_check：where.part が無い。どこに一致したか分からない引用は書かない")
    if as_judgment and part != "fulltext":
        raise Refused("case_quote_check：一致したのは %s。判旨として引くには scope=fulltext で一致が要る"
                      "（要旨として引くなら --summary-ok で「裁判要旨（判決の文ではない）」と明記して書く）" % PART_LABEL[part])
    text = res.get("matched_text")
    if not text:
        if result == "exact":
            text = quote
        else:
            raise Refused("case_quote_check：normalized なのに matched_text が無い")
    if not str(text).strip():
        raise Refused("case_quote_check：引用が空")
    where_txt = PART_LABEL[part] + ("・%s頁" % where["page"] if where.get("page") else "")
    rows = [[gn.quote_block("「%s」" % text)],
            [gn.source_line("（%s、%s）" % (cite, where_txt))],
            [gn.source_line("出典：case_quote_check／照合 %s／取得 %s" % (result, _date(prov["retrieved_at"])))]]
    record = {"kind": "quote", "tool": "case_quote_check", "cite": cite, "result": result,
              "where": {"part": part, "page": where.get("page")}, "retrieved_at": prov["retrieved_at"],
              "source_urls": prov.get("source_urls") or []}
    return rows, record


# ---------------------------------------------------------------------------
# 条文の表記の解決結果を使う（law_resolve_citation の出力を読むだけ。表記の解析はコネクタ）
# ---------------------------------------------------------------------------
def resolved_args(res, index=0):
    """law_resolve_citation の出力から、law_get_article に渡す引数を作る。

    dict・search のときだけ通す（search は「目で確かめる」注意つき）。ambiguous・unresolved は拒否し、
    candidates を Refused に載せる（利用者に選んでもらう）。表記の解釈はここでは一切しない。
    返り値：{"args": {...}, "confidence": ..., "notes": [...]}
    """
    # status が multiple でも、表記ごとの confidence で判断する（候補を失わないため）
    _need_ok(res, "law_resolve_citation", allow=("found", "multiple"))
    cits = res.get("citations") or []
    if not cits:
        raise Refused("law_resolve_citation：解決された表記が無い")
    if not 0 <= index < len(cits):
        raise Refused("law_resolve_citation：表記 %d は無い（0〜%d）" % (index, len(cits) - 1))
    c = cits[index]
    conf = c.get("confidence")
    if conf in ("ambiguous", "unresolved"):
        raise Refused("「%s」は %s。法令を決められないので、利用者に確認する" % (c.get("raw"), conf),
                      candidates=c.get("candidates") or [], status=conf)
    if not (c.get("law_id") or c.get("law_title")) or not c.get("article"):
        raise Refused("「%s」：法令か条が解決されていない" % c.get("raw"))
    args = {"law": c.get("law_id") or c.get("law_title"), "article": c["article"]}
    if c.get("paragraph"):
        args["paragraph"] = c["paragraph"]
    if c.get("item"):
        args["item"] = c["item"]
    notes = list(c.get("notes") or [])
    if conf == "search":
        notes.append("confidence=search：法令名と条番号を目で確かめてから使う")
    return {"args": args, "confidence": conf, "law_title": c.get("law_title"), "notes": notes}


def resolved_all(res):
    """すべての表記について resolved_args を試し、(通ったもの, 拒否されたもの) を返す。"""
    ok, ng = [], []
    for i in range(len(res.get("citations") or [])):
        try:
            ok.append(resolved_args(res, i))
        except Refused as e:
            ng.append({"index": i, "message": str(e), "candidates": e.candidates})
    return ok, ng
