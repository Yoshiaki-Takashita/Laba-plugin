"""依存なしの小さな JSON Schema 検査（標準ライブラリだけ）。使える語：type / enum / const / pattern / minimum / maximum /
minLength / maxLength / minItems / maxItems / maxProperties / required / properties / additionalProperties(真偽か schema) /
items / propertyNames(pattern) / allOf / if-then / $ref（#/$defs/… と同じフォルダの *.schema.json）。
外の jsonschema パッケージが無い環境でも動くようにするためのもの。GNOTO が読み込みで通す無害化そのものではない（textbook_page.py の check が、その規則の写しを別に持つ）。"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
_TYPES = {"object": dict, "array": list, "string": str, "boolean": bool, "null": type(None)}


def _is_type(v, t):
    if isinstance(t, list):
        return any(_is_type(v, x) for x in t)
    if t == "integer":
        return isinstance(v, int) and not isinstance(v, bool)
    if t == "number":
        return isinstance(v, (int, float)) and not isinstance(v, bool)
    return isinstance(v, _TYPES[t])


def load_schema(name):
    with open(os.path.join(HERE, "..", "schema", name), encoding="utf-8") as f:
        return json.load(f)


def validate(value, schema, root=None, path="$"):
    """誤りの文字列のリストを返す（空なら適合）。"""
    root = root if root is not None else schema
    errs = []
    if "$ref" in schema:
        ref = schema["$ref"]
        if ref.startswith("#/$defs/"):
            tgt = root["$defs"][ref[len("#/$defs/"):]]
            return validate(value, tgt, root, path)
        tgt = load_schema(ref)
        return validate(value, tgt, tgt, path)
    if "const" in schema and value != schema["const"]:
        errs.append("%s: 値は %r でなければならない" % (path, schema["const"]))
    if "enum" in schema and value not in schema["enum"]:
        errs.append("%s: %r は許可された値でない（%s）" % (path, value, "・".join(map(str, schema["enum"]))))
    if "type" in schema and not _is_type(value, schema["type"]):
        errs.append("%s: 型が違う（%s のはず）" % (path, schema["type"]))
        return errs
    if isinstance(value, str):
        if "pattern" in schema and not re.search(schema["pattern"], value):
            errs.append("%s: 形が違う（%s）" % (path, schema["pattern"]))
        if "minLength" in schema and len(value) < schema["minLength"]:
            errs.append("%s: 短すぎる" % path)
        if "maxLength" in schema and len(value) > schema["maxLength"]:
            errs.append("%s: 長すぎる（%d 字 > %d）" % (path, len(value), schema["maxLength"]))
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            errs.append("%s: %s 未満" % (path, schema["minimum"]))
        if "maximum" in schema and value > schema["maximum"]:
            errs.append("%s: %s を超える" % (path, schema["maximum"]))
    if isinstance(value, list):
        if "minItems" in schema and len(value) < schema["minItems"]:
            errs.append("%s: 要素が少なすぎる" % path)
        if "maxItems" in schema and len(value) > schema["maxItems"]:
            errs.append("%s: 要素が多すぎる（%d > %d）" % (path, len(value), schema["maxItems"]))
        if "items" in schema:
            for i, x in enumerate(value):
                errs += validate(x, schema["items"], root, "%s[%d]" % (path, i))
    if isinstance(value, dict):
        for k in schema.get("required", []):
            if k not in value:
                errs.append("%s: 必須の %s が無い" % (path, k))
        if "maxProperties" in schema and len(value) > schema["maxProperties"]:
            errs.append("%s: キーが多すぎる" % path)
        pn = schema.get("propertyNames")
        if pn and "pattern" in pn:
            for k in value:
                if not re.search(pn["pattern"], k):
                    errs.append("%s: キー名 %s の形が違う（%s）" % (path, k, pn["pattern"]))
        props = schema.get("properties", {})
        ap = schema.get("additionalProperties", True)
        for k, x in value.items():
            if k in props:
                errs += validate(x, props[k], root, "%s.%s" % (path, k))
            elif ap is False:
                errs.append("%s: 知らないキー %s" % (path, k))
            elif isinstance(ap, dict):
                errs += validate(x, ap, root, "%s.%s" % (path, k))
    for sub in schema.get("allOf", []):
        if "if" in sub:
            if not validate(value, sub["if"], root, path):
                errs += validate(value, sub.get("then", {}), root, path)
        else:
            errs += validate(value, sub, root, path)
    return errs
