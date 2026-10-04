"""
Golden id vectors shared with the frontend (tests/js/ids.test.ts reads the same
file). Ids are computed by the contract code itself on the real SDK Keccak256.

Regenerate:  WRITE_VECTORS=1 python3 -m pytest tests/contract/test_id_vectors.py
"""
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VECTORS = ROOT / "tests" / "js" / "id-vectors.json"
CONTRACT = str(ROOT / "contracts" / "TermCertain.py")

AUTHOR = "0x3065e31b1d993d7c0d59e6786844cba56780b2d3"
TEXTS = [
    "The amount is whatever the published list says on the day of order.",
    "The amount is whatever the parties arrive at in good faith.",
    "Each additional seat costs the same as the first.",
    "Each additional seat costs whatever we later think reasonable.",
    "  The fee is\t4,000\na month.  ",
    "\u001cThe total is the unit price times the quantity ordered.\u001f",
    "The rate\u0085is\u001dto be\u001ediscussed.",
    "\ufeffThe fee is fixed.",
    "Le prix — fixé\u3000d'avance. \U0001F4B6",
]


def build(contract):
    rows = []
    for t in TEXTS:
        norm = contract._normalize_text(t.strip())
        rows.append({"text": t, "normalized": norm, "py_len": len(norm),
                     "term_id": contract._term_id_for(AUTHOR, norm)})
    return {"author": AUTHOR, "terms": rows}


def test_vectors_match_contract(direct_deploy):
    data = build(direct_deploy(CONTRACT))
    if os.environ.get("WRITE_VECTORS") == "1":
        VECTORS.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    assert json.loads(VECTORS.read_text(encoding="utf-8")) == data
