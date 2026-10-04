"""
Deterministic tests for contracts/TermCertain.py, run in GenLayer Direct Mode
(genlayer-test: the real py-genlayer SDK with storage, TreeMap, u256, Keccak256
and gl.vm.UserError; the model is mocked).

The mocked labels are ASSUMED labels that drive the deterministic code paths.
They say nothing about what the real model returns; RUNTIME_EVIDENCE.md does.

Run:  python3 -m pytest tests/contract -q
"""

import ast
import json
import re
from pathlib import Path

import pytest
from gltest.direct.loader import create_address

ROOT = Path(__file__).resolve().parents[2]
CONTRACT = str(ROOT / "contracts" / "TermCertain.py")
LABEL = "the other side"

X1 = "The fee is 4,000 a month."
X2 = "The rate is set out in the schedule and does not move."
X3 = "Each additional seat costs the same as the first."
X4 = "The amount is whatever the published list says on the day of order."
X5 = "The total is the unit price times the quantity ordered."
Y1 = "The fee will be settled between us nearer the time."
Y2 = "The rate is to be discussed once volumes are clear."
Y3 = "Each additional seat costs whatever we later think reasonable."
Y4 = "The amount is whatever the parties arrive at in good faith."
Y5 = "The total will be worked out together after the first month."

ASSUMED_FIXED = (X1, X2, X3, X4, X5)

M_NO_COUNTERSIGN = "This sum is fixed by the text; no counter-signature is needed"
M_NOTHING_TO_REJECT = "There is nothing to reject; the text fixes this sum"
M_SELF_SIGN = "The side that proposed the sum cannot counter-sign it"
M_SELF_REJECT = "The side that proposed the sum cannot reject it"
M_ON_TABLE = "An amount is already on the table"
M_FINAL = "This sum is already final"
M_NO_ROOM = "No room for a further round"
M_NO_PROPOSAL_SIGN = "There is no proposed sum to counter-sign"
M_NO_PROPOSAL_REJECT = "There is no proposed sum to reject"


def hx(addr):
    return addr.as_hex if hasattr(addr, "as_hex") else str(addr)


def lo(addr):
    return hx(addr).lower()


def J(raw):
    return json.loads(raw)


@pytest.fixture
def env(direct_vm, direct_deploy):
    contract = direct_deploy(CONTRACT)
    author = create_address("author")
    other = create_address("other")
    stranger = create_address("stranger")
    for text in ASSUMED_FIXED:
        direct_vm.mock_llm(re.escape(text), '{"outcome":"FIXED"}')
    direct_vm.mock_llm(r"(?s).*", '{"outcome":"TO_BE_AGREED"}')
    direct_vm.sender = author
    return direct_vm, contract, author, other, stranger


def as_(vm, who):
    vm.sender = who


def tid_for(contract, author, text):
    return contract._term_id_for(lo(author), " ".join(text.split()))


def open_(vm, contract, author, other, text, label=LABEL):
    as_(vm, author)
    contract.open_term(hx(other), label, text)
    return tid_for(contract, author, text)


def get(contract, tid):
    return J(contract.get_term(tid))


# ---------------------------------------------------------------------
# _signatures_required: the whole threshold. The most important set.
# ---------------------------------------------------------------------

def test_signatures_required_for_both_certainties(env):
    vm, contract, author, other, _ = env
    assert contract._signatures_required("PINNED") == 1
    assert contract._signatures_required("OPEN_TERM") == 2
    assert contract._signatures_required("anything else") == 2   # unknown -> the stricter side
    p = open_(vm, contract, author, other, X4)
    o = open_(vm, contract, author, other, Y4)
    for tid, cert, need in ((p, "PINNED", 1), (o, "OPEN_TERM", 2)):
        g = get(contract, tid)
        assert (g["certainty"], g["signatures_required"]) == (cert, need)
        assert g["signatures_required"] == contract._signatures_required(contract.terms[tid].certainty)
        assert (g["signatures_held"], g["binding"], g["state"], g["amount"]) == (0, False, "AWAITING", 0)


def test_same_amount_same_wallet_two_opposite_states(env):
    # Runtime rows #2 vs #7: the central evidence.
    vm, contract, author, other, _ = env
    p = open_(vm, contract, author, other, X4)
    o = open_(vm, contract, author, other, Y4)
    contract.record_amount(p, 4000)
    contract.record_amount(o, 4000)
    gp, go = get(contract, p), get(contract, o)
    assert (gp["state"], gp["signatures_held"], gp["signatures_required"], gp["binding"]) == ("FINAL", 1, 1, True)
    assert (go["state"], go["signatures_held"], go["signatures_required"], go["binding"]) == ("PROPOSED", 1, 2, False)
    assert gp["amount"] == go["amount"] == 4000
    assert gp["proposed_by"] == go["proposed_by"] == lo(author)
    assert gp["countersigned_by"] == "" and go["countersigned_by"] == ""


def test_two_teeth_exist_only_on_one_branch(env):
    vm, contract, author, other, _ = env
    p = open_(vm, contract, author, other, X4)
    o = open_(vm, contract, author, other, Y4)
    contract.record_amount(p, 4000)
    contract.record_amount(o, 4000)
    as_(vm, other)
    with vm.expect_revert(M_NO_COUNTERSIGN):
        contract.countersign(p)
    with vm.expect_revert(M_NOTHING_TO_REJECT):
        contract.reject_amount(p, "Not agreed")
    contract.countersign(o)
    assert get(contract, o)["state"] == "FINAL"


def test_runtime_table_in_order(env):
    # The Intelligent Contract table (12 rows, 13 transactions), replayed.
    vm, contract, author, other, _ = env
    p = open_(vm, contract, author, other, X4)                                  # 1
    assert get(contract, p)["signatures_required"] == 1
    contract.record_amount(p, 4000)                                             # 2
    assert get(contract, p)["state"] == "FINAL"
    as_(vm, other)
    with vm.expect_revert(M_NO_COUNTERSIGN):                                    # 3
        contract.countersign(p)
    with vm.expect_revert(M_NOTHING_TO_REJECT):                                 # 4
        contract.reject_amount(p, "Not agreed")
    as_(vm, author)
    with vm.expect_revert(M_FINAL):                                             # 5
        contract.record_amount(p, 5000)
    o = open_(vm, contract, author, other, Y4)                                  # 6
    assert get(contract, o)["signatures_required"] == 2
    contract.record_amount(o, 4000)                                             # 7
    assert (get(contract, o)["state"], get(contract, o)["round_count"]) == ("PROPOSED", 1)
    with vm.expect_revert(M_SELF_SIGN):                                         # 8
        contract.countersign(o)
    as_(vm, other)
    contract.reject_amount(o, "Too high for the first month")                   # 9
    g = get(contract, o)
    assert (g["state"], g["amount"], g["round_count"], g["proposed_by"]) == ("AWAITING", 0, 1, "")
    contract.record_amount(o, 3500)                                             # 10
    g = get(contract, o)
    assert (g["state"], g["round_count"], g["proposed_by"]) == ("PROPOSED", 2, lo(other))
    as_(vm, author)
    contract.countersign(o)                                                     # 11
    g = get(contract, o)
    assert (g["state"], g["amount"], g["countersigned_by"], g["signatures_held"], g["binding"]) == \
        ("FINAL", 3500, lo(author), 2, True)
    x3 = open_(vm, contract, author, other, X3)                                 # 12a
    y3 = open_(vm, contract, author, other, Y3)                                 # 12b
    assert (get(contract, x3)["certainty"], get(contract, y3)["certainty"]) == ("PINNED", "OPEN_TERM")
    rounds = J(contract.get_rounds(o, 0, 10))["rounds"]
    assert [(r["round"], r["amount"], r["proposed_by"], r["reject_note"]) for r in rounds] == [
        (1, 4000, lo(author), "Too high for the first month"), (2, 3500, lo(other), "")]


def test_proposer_can_never_countersign(env):
    vm, contract, author, other, _ = env
    p = open_(vm, contract, author, other, X4)
    contract.record_amount(p, 4000)
    with vm.expect_revert(M_NO_COUNTERSIGN):          # PINNED: tooth 1 comes first
        contract.countersign(p)
    o = open_(vm, contract, author, other, Y4)
    with vm.expect_revert(M_NO_PROPOSAL_SIGN):        # AWAITING: nothing proposed yet
        contract.countersign(o)
    contract.record_amount(o, 4000)
    with vm.expect_revert(M_SELF_SIGN):               # author proposed, author signs
        contract.countersign(o)
    as_(vm, other)
    contract.reject_amount(o, "No")
    contract.record_amount(o, 3000)
    with vm.expect_revert(M_SELF_SIGN):               # other proposed, other signs
        contract.countersign(o)
    assert get(contract, o)["state"] == "PROPOSED"


def test_proposer_can_never_reject(env):
    vm, contract, author, other, _ = env
    o = open_(vm, contract, author, other, Y4)
    contract.record_amount(o, 4000)
    with vm.expect_revert(M_SELF_REJECT):
        contract.reject_amount(o, "changed my mind")
    as_(vm, other)
    contract.reject_amount(o, "No")
    contract.record_amount(o, 3000)
    with vm.expect_revert(M_SELF_REJECT):
        contract.reject_amount(o, "changed my mind")


def test_third_wallet_is_refused_everywhere(env):
    vm, contract, author, other, stranger = env
    p = open_(vm, contract, author, other, X4)
    o = open_(vm, contract, author, other, Y4)
    as_(vm, stranger)
    with vm.expect_revert("Only the author may record the sum on a fixed term"):
        contract.record_amount(p, 4000)
    with vm.expect_revert("Only the two named sides may propose a sum"):
        contract.record_amount(o, 4000)
    as_(vm, author)
    contract.record_amount(o, 4000)
    as_(vm, stranger)
    with vm.expect_revert("Only the two named sides may counter-sign"):
        contract.countersign(o)
    with vm.expect_revert("Only the two named sides may reject a sum"):
        contract.reject_amount(o, "No")


def test_other_side_records_only_on_open_term(env):
    vm, contract, author, other, _ = env
    p = open_(vm, contract, author, other, X4)
    o = open_(vm, contract, author, other, Y4)
    as_(vm, other)
    with vm.expect_revert("Only the author may record the sum on a fixed term"):
        contract.record_amount(p, 4000)
    contract.record_amount(o, 4000)
    g = get(contract, o)
    assert (g["state"], g["proposed_by"]) == ("PROPOSED", lo(other))
    as_(vm, author)
    contract.countersign(o)
    assert get(contract, o)["countersigned_by"] == lo(author)


def test_full_loop_counts_rounds(env):
    vm, contract, author, other, _ = env
    o = open_(vm, contract, author, other, Y5)
    contract.record_amount(o, 100)
    as_(vm, other)
    contract.reject_amount(o, "low")
    as_(vm, author)
    contract.record_amount(o, 120)
    as_(vm, other)
    contract.countersign(o)
    g = get(contract, o)
    assert (g["state"], g["round_count"], g["amount"]) == ("FINAL", 2, 120)
    assert J(contract.get_round(o, 1)) == {"round": 1, "amount": 100, "proposed_by": lo(author), "reject_note": "low"}
    assert J(contract.get_round(o, 2)) == {"round": 2, "amount": 120, "proposed_by": lo(author), "reject_note": ""}


def test_round_cap_leaves_the_term_awaiting(env):
    vm, contract, author, other, _ = env
    o = open_(vm, contract, author, other, Y1)
    for i in range(10):
        as_(vm, author)
        contract.record_amount(o, 1000 + i)
        as_(vm, other)
        contract.reject_amount(o, f"no {i + 1}")
    g = get(contract, o)
    assert (g["state"], g["round_count"], g["amount"]) == ("AWAITING", 10, 0)
    for who in (author, other):
        as_(vm, who)
        with vm.expect_revert(M_NO_ROOM):
            contract.record_amount(o, 5)
    assert get(contract, o)["state"] == "AWAITING"
    page = J(contract.get_rounds(o, 8, 50))
    assert page["round_count"] == 10 and [r["round"] for r in page["rounds"]] == [9, 10]
    assert J(contract.get_round(o, 10))["reject_note"] == "no 10"


def test_tenth_proposal_can_still_be_countersigned(env):
    vm, contract, author, other, _ = env
    o = open_(vm, contract, author, other, Y2)
    for i in range(9):
        as_(vm, author)
        contract.record_amount(o, 10 + i)
        as_(vm, other)
        contract.reject_amount(o, "no")
    as_(vm, author)
    contract.record_amount(o, 99)
    as_(vm, other)
    contract.countersign(o)
    assert (get(contract, o)["state"], get(contract, o)["round_count"]) == ("FINAL", 10)


def test_pinned_has_no_loop_and_no_round_cap(env):
    vm, contract, author, other, _ = env
    p = open_(vm, contract, author, other, X1)
    contract.record_amount(p, 4000)
    g = get(contract, p)
    assert (g["state"], g["round_count"], g["countersigned_by"]) == ("FINAL", 1, "")
    for who in (author, other):
        as_(vm, who)
        with vm.expect_revert(M_FINAL):
            contract.record_amount(p, 1)


def test_ledger_is_never_rewritten(env):
    vm, contract, author, other, _ = env
    o = open_(vm, contract, author, other, Y4)
    contract.record_amount(o, 4000)
    as_(vm, other)
    contract.reject_amount(o, "first")
    contract.record_amount(o, 3500)
    as_(vm, author)
    contract.reject_amount(o, "second")
    first = J(contract.get_round(o, 1))
    assert first == {"round": 1, "amount": 4000, "proposed_by": lo(author), "reject_note": "first"}
    assert J(contract.get_round(o, 2))["reject_note"] == "second"
    assert contract.get_round(o, 3) == "{}" and contract.get_round(o, 0) == "{}"


def test_rounds_are_scoped_per_term(env):
    vm, contract, author, other, _ = env
    a = open_(vm, contract, author, other, Y4)
    b = open_(vm, contract, author, other, Y5)
    contract.record_amount(a, 1)
    contract.record_amount(b, 2)
    assert (get(contract, a)["round_count"], get(contract, b)["round_count"]) == (1, 1)
    assert J(contract.get_round(b, 1))["amount"] == 2


def test_amount_bounds(env):
    vm, contract, author, other, _ = env
    a = open_(vm, contract, author, other, Y4)
    contract.record_amount(a, 10 ** 18)
    assert get(contract, a)["amount"] == 10 ** 18


def test_whitespace_variants_share_one_id(env):
    vm, contract, author, other, _ = env
    open_(vm, contract, author, other, X4)
    for variant in ("  The amount is whatever the published list says\ton the day of order.  ",
                    "The amount  is whatever the published\nlist says on the day of order.",
                    "\u001cThe amount is whatever the published list says on the day of order.\u001f"):
        with vm.expect_revert("This term already exists"):
            contract.open_term(hx(other), LABEL, variant)


def test_same_text_other_author_is_a_new_term(env):
    vm, contract, author, other, _ = env
    a = open_(vm, contract, author, other, Y4)
    b = open_(vm, contract, other, author, Y4)
    assert a != b and get(contract, b)["author"] == lo(other)


def test_local_id_formula_matches_contract(env):
    from hashlib import sha3_256  # noqa: F401  (NIST SHA3 is NOT the formula; guard below)
    vm, contract, author, other, _ = env
    tid = open_(vm, contract, author, other, X4)
    norm = " ".join(X4.split())
    payload = "TERM_CERTAIN:TERM:V1|" + lo(author) + "|" + str(len(norm)) + "|" + norm
    assert tid == contract._term_id_for(lo(author), norm)
    assert tid != sha3_256(payload.encode()).hexdigest()
    assert get(contract, tid)["term_id"] == tid


def test_other_wallet_case_normalized(env):
    vm, contract, author, other, _ = env
    as_(vm, author)
    contract.open_term("  " + hx(other).upper().replace("0X", "0x") + " ", LABEL, X4)
    assert get(contract, tid_for(contract, author, X4))["other_wallet"] == lo(other)


def test_fail_safe_on_unparseable_output(direct_vm, direct_deploy):
    contract = direct_deploy(CONTRACT)
    author, other = create_address("author"), create_address("other")
    direct_vm.mock_llm(r"(?s).*", "not json at all")
    direct_vm.sender = author
    contract.open_term(hx(other), LABEL, X1)
    g = J(contract.get_term(tid_for(contract, author, X1)))
    assert (g["outcome"], g["certainty"], g["signatures_required"]) == ("TO_BE_AGREED", "OPEN_TERM", 2)


def test_fail_safe_on_unknown_label(direct_vm, direct_deploy):
    contract = direct_deploy(CONTRACT)
    author, other = create_address("author"), create_address("other")
    direct_vm.mock_llm(r"(?s).*", '{"outcome":"PARTLY"}')
    direct_vm.sender = author
    contract.open_term(hx(other), LABEL, X1)
    assert J(contract.get_term(tid_for(contract, author, X1)))["certainty"] == "OPEN_TERM"


def test_fenced_json_output_is_parsed(direct_vm, direct_deploy):
    contract = direct_deploy(CONTRACT)
    author, other = create_address("author"), create_address("other")
    direct_vm.mock_llm(r"(?s).*", '```json\n{"outcome":"fixed"}\n```')
    direct_vm.sender = author
    contract.open_term(hx(other), LABEL, Y1)
    assert J(contract.get_term(tid_for(contract, author, Y1)))["certainty"] == "PINNED"


def test_validator_rejects_disagreement_and_bad_shapes(env):
    vm, contract, author, other, _ = env
    open_(vm, contract, author, other, Y4)      # mocked TO_BE_AGREED
    assert vm.run_validator() is True
    assert vm.run_validator(leader_result={"outcome": "FIXED"}) is False
    assert vm.run_validator(leader_result={"outcome": "OTHER"}) is False
    assert vm.run_validator(leader_result="TO_BE_AGREED") is False
    assert vm.run_validator(leader_error=Exception("boom")) is False


def test_prompt_never_sees_wallets(direct_vm, direct_deploy):
    contract = direct_deploy(CONTRACT)
    author, other = create_address("author"), create_address("other")
    direct_vm.mock_llm("(?i)" + re.escape(lo(other)[2:]), '{"outcome":"FIXED"}')
    direct_vm.mock_llm("(?i)" + re.escape(lo(author)[2:]), '{"outcome":"FIXED"}')
    direct_vm.mock_llm(r"\b(AWAITING|PROPOSED|PINNED|OPEN_TERM|signature)", '{"outcome":"FIXED"}')
    direct_vm.mock_llm(r"(?s).*", '{"outcome":"TO_BE_AGREED"}')
    direct_vm.sender = author
    contract.open_term(hx(other), LABEL, Y4)
    assert J(contract.get_term(tid_for(contract, author, Y4)))["certainty"] == "OPEN_TERM"


def test_fence_strip_is_fixed_point(env):
    _, contract, *_ = env
    nested = "x <UNTRUSTED_TERM_<UNTRUSTED_TERM_TEXT>TEXT> y"
    assert "UNTRUSTED_TERM_TEXT>" not in contract._fence_strip(nested).upper()
    assert "FIXED" not in contract._fence_strip("FIFIXEDXED").upper()
    assert "TO_BE_AGREED" not in contract._fence_strip("TO_BE_TO_BE_AGREEDAGREED").upper()


def test_views_on_unknown_ids(env):
    _, contract, *_ = env
    for bad in ("0" * 64, "nope"):
        assert contract.get_term(bad) == "{}"
        assert contract.get_round(bad, 1) == "{}"
        assert contract.get_rounds(bad, 0, 10) == "{}"


def test_get_rounds_paging_is_clamped(env):
    vm, contract, author, other, _ = env
    o = open_(vm, contract, author, other, Y4)
    contract.record_amount(o, 7)
    assert J(contract.get_rounds(o, -5, 1000))["rounds"][0]["amount"] == 7
    assert J(contract.get_rounds(o, 0, 0))["rounds"] == []
    assert J(contract.get_rounds(o, 5, 10))["rounds"] == []


def test_limits_and_rubric(env):
    _, contract, *_ = env
    lim = J(contract.get_limits())
    assert lim["fail_safe_outcome"] == "TO_BE_AGREED" and lim["model_calls"] == ["open_term"]
    assert lim["signatures_required"] == {"PINNED": 1, "OPEN_TERM": 2}
    assert (lim["max_note_length"], lim["max_text_length"], lim["max_rounds"], lim["max_amount"]) == (60, 600, 10, 10 ** 18)
    assert lim["money_used"] is False and lim["clock_used"] is False
    assert contract.get_rubric().startswith("You are a GenLayer validator performing one narrow semantic classification")


def test_no_forbidden_constructs_in_source():
    src = Path(CONTRACT).read_text(encoding="utf-8")
    for name in re.findall(r"def\s+(\w+)", src):
        assert not re.match(r"(preview_|classify_|dry_run_|reclassify|set_certainty)", name), name
    for api in ("emit_transfer", "gl.evm", "web.render", "time.time", "datetime", "payable"):
        assert api not in src, api
    assert src.count("exec_prompt") == 1
    assert src.splitlines()[0] == "# v0.2.16"
    # the threshold is defined in exactly one place
    assert src.count("CERTAINTY_PINNED else 2") == 1
    assert len(re.findall(r"==\s*CERTAINTY_OPEN|!=\s*CERTAINTY_PINNED|need\s*=", src)) == 0
    write_bodies = src.split("def record_amount")[1].split("# VIEWS")[0]
    assert "CERTAINTY_PINNED" not in write_bodies and "CERTAINTY_OPEN" not in write_bodies
    assert len(re.findall(r"\.certainty\s*=(?!=)", src)) == 0
    assert "round_count = u256(round_index)" in src and "round_count -" not in src
    assert "    FIXED,\n    TO_BE_AGREED,\n)" in src
    rubric = src.split('RUBRIC = """')[1].split('"""')[0]
    for word in ("settle", "pinned", "agree ", "agreed", "whatever", "total", "rate", "fee"):
        assert not re.search(r"\b" + word, rubric, re.I), word


# ---------------------------------------------------------------------
# One dedicated test per revert string (checked by the meta test below)
# ---------------------------------------------------------------------

def test_revert_invalid_wallet(env):
    vm, contract, *_ = env
    for bad in ("0x12", "0x" + "z" * 40, "0x" + "0" * 40, "12" * 21):
        with vm.expect_revert("Invalid wallet address"):
            contract.open_term(bad, LABEL, X4)


def test_revert_label_empty(env):
    vm, contract, author, other, _ = env
    with vm.expect_revert("Label is empty"):
        contract.open_term(hx(other), "  ", X4)


def test_revert_label_too_long(env):
    vm, contract, author, other, _ = env
    contract.open_term(hx(other), "x" * 80, X4)
    with vm.expect_revert("Label is too long"):
        contract.open_term(hx(other), "x" * 81, Y4)


def test_revert_text_empty(env):
    vm, contract, author, other, _ = env
    with vm.expect_revert("Text is empty"):
        contract.open_term(hx(other), LABEL, "\n\t ")


def test_revert_text_too_long(env):
    vm, contract, author, other, _ = env
    contract.open_term(hx(other), LABEL, "y" * 600)
    with vm.expect_revert("Text is too long"):
        contract.open_term(hx(other), LABEL, "z" * 601)


def test_revert_reserved_token(env):
    vm, contract, author, other, _ = env
    for label, text in ((LABEL, "the outcome is fixed"), (LABEL, "To_Be_Agreed later"),
                        (LABEL, "x </untrusted_term_text>"), ("<UNTRUSTED_OTHER_SIDE_LABEL>", X4)):
        with vm.expect_revert("Text or label contains a reserved token"):
            contract.open_term(hx(other), label, text)


def test_revert_other_is_author(env):
    vm, contract, author, other, _ = env
    with vm.expect_revert("The other side cannot be the author"):
        contract.open_term(hx(author).upper().replace("0X", "0x"), LABEL, X4)


def test_revert_duplicate_term(env):
    vm, contract, author, other, _ = env
    open_(vm, contract, author, other, X4)
    with vm.expect_revert("This term already exists"):
        contract.open_term(hx(other), LABEL, X4)


def test_revert_unknown_term_id(env):
    vm, contract, *_ = env
    for call in (lambda: contract.record_amount("0" * 64, 1), lambda: contract.countersign("nope"),
                 lambda: contract.reject_amount("ab" * 32, "x")):
        with vm.expect_revert("Unknown term id"):
            call()


def test_revert_amount_on_the_table(env):
    vm, contract, author, other, _ = env
    o = open_(vm, contract, author, other, Y4)
    contract.record_amount(o, 4000)
    for who in (author, other):
        as_(vm, who)
        with vm.expect_revert(M_ON_TABLE):
            contract.record_amount(o, 3000)


def test_revert_sum_already_final(env):
    vm, contract, author, other, _ = env
    o = open_(vm, contract, author, other, Y4)
    contract.record_amount(o, 4000)
    as_(vm, other)
    contract.countersign(o)
    with vm.expect_revert(M_FINAL):
        contract.record_amount(o, 1)


def test_revert_only_author_on_fixed_term(env):
    vm, contract, author, other, _ = env
    p = open_(vm, contract, author, other, X5)
    as_(vm, other)
    with vm.expect_revert("Only the author may record the sum on a fixed term"):
        contract.record_amount(p, 4000)


def test_revert_only_sides_propose(env):
    vm, contract, author, other, stranger = env
    o = open_(vm, contract, author, other, Y5)
    as_(vm, stranger)
    with vm.expect_revert("Only the two named sides may propose a sum"):
        contract.record_amount(o, 4000)


def test_revert_amount_out_of_range(env):
    vm, contract, author, other, _ = env
    p = open_(vm, contract, author, other, X4)
    o = open_(vm, contract, author, other, Y4)
    for tid in (p, o):
        for bad in (0, -1, 10 ** 18 + 1):
            with vm.expect_revert("The amount is out of range"):
                contract.record_amount(tid, bad)


def test_revert_no_room_for_round(env):
    vm, contract, author, other, _ = env
    o = open_(vm, contract, author, other, Y3)
    for _ in range(10):
        as_(vm, author)
        contract.record_amount(o, 5)
        as_(vm, other)
        contract.reject_amount(o, "no")
    with vm.expect_revert(M_NO_ROOM):
        contract.record_amount(o, 6)


def test_revert_no_countersign_on_fixed(env):
    vm, contract, author, other, _ = env
    p = open_(vm, contract, author, other, X4)
    as_(vm, other)
    with vm.expect_revert(M_NO_COUNTERSIGN):     # even before any amount
        contract.countersign(p)


def test_revert_no_proposal_to_countersign(env):
    vm, contract, author, other, _ = env
    o = open_(vm, contract, author, other, Y4)
    as_(vm, other)
    with vm.expect_revert(M_NO_PROPOSAL_SIGN):
        contract.countersign(o)
    as_(vm, author)
    contract.record_amount(o, 4000)
    as_(vm, other)
    contract.countersign(o)
    with vm.expect_revert(M_NO_PROPOSAL_SIGN):   # twice
        contract.countersign(o)


def test_revert_self_countersign(env):
    vm, contract, author, other, _ = env
    o = open_(vm, contract, author, other, Y4)
    contract.record_amount(o, 4000)
    with vm.expect_revert(M_SELF_SIGN):
        contract.countersign(o)


def test_revert_only_sides_countersign(env):
    vm, contract, author, other, stranger = env
    o = open_(vm, contract, author, other, Y4)
    contract.record_amount(o, 4000)
    as_(vm, stranger)
    with vm.expect_revert("Only the two named sides may counter-sign"):
        contract.countersign(o)


def test_revert_nothing_to_reject_on_fixed(env):
    vm, contract, author, other, _ = env
    p = open_(vm, contract, author, other, X4)
    contract.record_amount(p, 4000)
    as_(vm, other)
    with vm.expect_revert(M_NOTHING_TO_REJECT):
        contract.reject_amount(p, "Not agreed")


def test_revert_no_proposal_to_reject(env):
    vm, contract, author, other, _ = env
    o = open_(vm, contract, author, other, Y4)
    as_(vm, other)
    with vm.expect_revert(M_NO_PROPOSAL_REJECT):
        contract.reject_amount(o, "x")
    as_(vm, author)
    contract.record_amount(o, 4000)
    as_(vm, other)
    contract.countersign(o)
    with vm.expect_revert(M_NO_PROPOSAL_REJECT):  # after FINAL
        contract.reject_amount(o, "x")


def test_revert_self_reject(env):
    vm, contract, author, other, _ = env
    o = open_(vm, contract, author, other, Y4)
    contract.record_amount(o, 4000)
    with vm.expect_revert(M_SELF_REJECT):
        contract.reject_amount(o, "x")


def test_revert_only_sides_reject(env):
    vm, contract, author, other, stranger = env
    o = open_(vm, contract, author, other, Y4)
    contract.record_amount(o, 4000)
    as_(vm, stranger)
    with vm.expect_revert("Only the two named sides may reject a sum"):
        contract.reject_amount(o, "x")


def test_revert_note_empty(env):
    vm, contract, author, other, _ = env
    o = open_(vm, contract, author, other, Y4)
    contract.record_amount(o, 4000)
    as_(vm, other)
    with vm.expect_revert("Note is empty"):
        contract.reject_amount(o, "   ")
    assert get(contract, o)["state"] == "PROPOSED"


def test_revert_note_too_long(env):
    vm, contract, author, other, _ = env
    o = open_(vm, contract, author, other, Y4)
    contract.record_amount(o, 4000)
    as_(vm, other)
    with vm.expect_revert("Note is too long"):
        contract.reject_amount(o, "n" * 61)
    contract.reject_amount(o, "n" * 60)
    assert J(contract.get_round(o, 1))["reject_note"] == "n" * 60


# ---------------------------------------------------------------------
# Meta: every revert string in the source has exactly one dedicated test
# ---------------------------------------------------------------------

def source_revert_strings():
    src = Path(CONTRACT).read_text(encoding="utf-8")
    return set(re.findall(r'UserError\(\s*"([^"]+)"\s*\)', src))


def resolve(node):
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.Name):
        return globals().get(node.id)
    return None


def primary_revert_string_by_test():
    """The first expect_revert string inside a test_revert_* function is the string it owns."""
    tree = ast.parse(Path(__file__).read_text(encoding="utf-8"))
    owned = {}
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name.startswith("test_revert_"):
            calls = [c for c in ast.walk(node)
                     if isinstance(c, ast.Call) and getattr(c.func, "attr", "") == "expect_revert" and c.args]
            calls.sort(key=lambda c: (c.lineno, c.col_offset))
            owned[node.name] = resolve(calls[0].args[0]) if calls else None
    return owned


def test_every_revert_string_has_exactly_one_dedicated_test():
    strings = source_revert_strings()
    assert len(strings) == 25, sorted(strings)
    owned = primary_revert_string_by_test()
    assert None not in owned.values(), owned
    per_string = {}
    for test, s in owned.items():
        per_string.setdefault(s, []).append(test)
    assert sorted(set(per_string) - strings) == []
    assert sorted(strings - set(per_string)) == [], "revert strings without a dedicated test"
    for s, tests in per_string.items():
        assert len(tests) == 1, (s, tests)
