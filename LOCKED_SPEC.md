# LOCKED_SPEC — TermCertain

Frozen source: `contracts/TermCertain.py`, SHA-256 `f97f02ce20d5395791eccdaabeabed3ba434155a2695e7bd0b9f8f7ccaf357a5`.
Header: exactly the four lines `# v0.2.16`, the py-genlayer `Depends` line, a blank line, `from genlayer import *`.

## 1 · The question, and what the answer controls

**Has the text already pinned the sum down, or does it still leave it to be agreed?** This is certainty of terms: "The
total is the unit price times the quantity ordered" can be computed by anyone holding the price list; "The total will
be worked out together after the first month" cannot be computed by anybody alone — it needs two people.

The verdict sets **one number: how many signatures a later write needs before it binds anybody.**

| | `FIXED` → `PINNED` | `TO_BE_AGREED` → `OPEN_TERM` |
|---|---|---|
| `record_amount` by the author | **FINAL at once**, 1 of 1 | **PROPOSED**, 1 of 2 |
| Does the value bind yet | yes, at once | no — PROPOSED binds nobody |
| `countersign` | **reverts** — nobody else needs to sign | the **only** road to FINAL |
| `reject_amount` | **reverts** — nothing to reject | the other side may use it → back to AWAITING |
| Can the other side block it | no | yes, as often as it likes, up to the cap |

Novelty, stated plainly: the semantic verdict decides **the signature threshold of a later write**. The same method,
the same number, the same wallet creates a binding value on one term and a non-binding proposal on another. A second
consequence follows: on `OPEN_TERM` the loop record → reject → record repeats; on `PINNED` there is no loop at all.

### The teeth — two methods that exist on one branch only

```text
PINNED      countersign     -> REVERT "This sum is fixed by the text; no counter-signature is needed"
PINNED      reject_amount   -> REVERT "There is nothing to reject; the text fixes this sum"
OPEN_TERM   countersign     -> OK
OPEN_TERM   reject_amount   -> OK
```

What proves the project is the pair underneath:

```text
record_amount(4000) on a PINNED term     -> state = FINAL      (1 of 1)
record_amount(4000) on an OPEN_TERM term -> state = PROPOSED   (1 of 2)
```

Both revert sentences say what the right action is, so a reader sees it on the screen.

## 2 · Enums and state

- Outcome (model): `FIXED` | `TO_BE_AGREED`.
- Certainty (stored once at open, immutable): `PINNED` | `OPEN_TERM`.
- State: PINNED `AWAITING` → `FINAL`; OPEN_TERM `AWAITING` → `PROPOSED` → `FINAL`, and `PROPOSED` → `AWAITING` on a
  rejection.
- Storage: `terms: TreeMap[str, TermRecord]` (`author, other_wallet, other_label, text, certainty, state, amount,
  proposed_by, countersigned_by, round_count`) and the ledger `round_amount`, `round_by`, `reject_note`, each keyed
  `term_id + ":" + round`. The ledger is never rewritten or reused.

**The threshold lives in exactly one function:** `_signatures_required(certainty)` returns 1 for PINNED and 2
otherwise. `record_amount`, `countersign`, `reject_amount` and `get_term` compare with its result; no other code states
a threshold. `countersigned_by` stores the wallet that actually signed; on PINNED it is always empty.

## 3 · Limits and ids

| Constant | Value | Why |
|---|---|---|
| `MAX_TEXT_LENGTH` | 600 | contract cap; only about 163 characters fit the 255-byte calldata limit |
| `MAX_LABEL_LENGTH` | 80 | |
| `MAX_NOTE_LENGTH` | 60 | **calldata ceiling**: id + 60 chars = 161 bytes |
| `MAX_AMOUNT` | 10^18 | upper bound of a recorded sum |
| `MAX_ROUNDS` | 10 | OPEN_TERM only: total proposals ever made on a term |

Term id = `keccak256("TERM_CERTAIN:TERM:V1|" + author_lower + "|" + len(normalized_text) + "|" + normalized_text)`,
where `normalized_text = " ".join(text.split())`. The text is part of the id, so the same author cannot reopen the
same sentence to ask for another label.

## 4 · Methods and check order

| Method | Order of checks (first failing check wins) |
|---|---|
| `open_term(other_wallet, other_label, text)` | wallet → label → text → reserved token → other ≠ author → duplicate id → model call |
| `record_amount(term_id_hex, value)` | unknown id → PROPOSED → FINAL → caller (PINNED: author; OPEN_TERM: a named side) → 0 < value ≤ 10^18 → OPEN_TERM: round_count < 10 |
| `countersign(term_id_hex)` | unknown id → threshold is 2 → PROPOSED → caller ≠ proposer → a named side |
| `reject_amount(term_id_hex, note)` | unknown id → threshold is 2 → PROPOSED → caller ≠ proposer → a named side → note |

A rejection writes the note into the ledger, sets the amount to 0 and `proposed_by` to "", and returns to AWAITING;
`round_count` does **not** go down, so the cap counts every proposal ever made. The app mirrors every order exactly.

The 25 revert sentences are listed in `src/lib/rules.ts` and must equal the contract's set (test in
`tests/js/rules.test.ts`).

Views: `get_term` (all fields plus `outcome`, `signatures_required`, `signatures_held`, `binding`; unknown id →
`"{}"`), `get_round(term_id_hex, round_index)`, `get_rounds(term_id_hex, offset, limit)`, `get_rubric`, `get_limits`.
There is **no** `preview_*`, `classify_*` or `dry_run_*` view: a try-before view would turn the mechanism into free
off-chain fishing.

## 5 · Fail-safe direction: `TO_BE_AGREED`

Broken, unparseable or unknown model output becomes `TO_BE_AGREED` — two signatures. Which wrong guess harms the side
that did **not** write the text?

- a wrong `FIXED` lets the author alone pin a number the text never pinned, binding at once and blockable by nobody. The
  other side loses its consent over a sum of money — there is a victim, and the victim loses money;
- a wrong `TO_BE_AGREED` makes a sum the text did pin wait for the other side's signature. The other side may stall and
  the author — who wrote the unclear sentence — waits. But nobody is bound to a number they did not accept, and both
  sides can still sign — no victim, only delay.

So the safe direction is two signatures: when it is unclear who agreed to what about money, assume nobody has.

## 6 · "Why not polish the wording until it gets the branch the author wants?"

The author wants `FIXED` — the power to record alone. The price is real and paid in advance:

1. **To get `FIXED`, the text must hold enough for a stranger to compute the sum.** Then the author is pinned to that
   same formula and has no room to name another number later. `FIXED` gives the right to record alone at the cost of
   all room to manoeuvre.
2. **`TO_BE_AGREED` is not a punishment.** It is the branch where the author can still negotiate — propose, be
   rejected, propose again, up to the cap. An author who wants room really wants this branch.
3. **The fail-safe runs against the author's wish** (§5), and **the text is part of the id** (§3), so the same sentence
   cannot be reopened for another label.

The branches are not balanced in power, but they are balanced in price: `FIXED` = record alone, lose room;
`TO_BE_AGREED` = keep room, ask for a signature.

## 7 · Rubric

Used verbatim from the contract (`get_rubric`). It asks "whether a stranger holding this text and the relevant records
could reach the sum alone", tells the model not to judge fairness or supply what the text leaves unsaid, and ends the
semantic rules with "Where the text does not resolve this, return TO_BE_AGREED." It shares no content word with the
test cases (`TERMCERTAIN_KILLSET_CHECK.py`) and avoids *settle, pinned, agree, agreed, whatever, total, rate, fee*; it
does not say what a "whatever X says" construction means.

## 8 · Prompt fence

Label and text go in `<UNTRUSTED_OTHER_SIDE_LABEL>` and `<UNTRUSTED_TERM_TEXT>`. Those four tags and both answer tokens
are reserved: text or label containing one (compared after upper-casing) is rejected, and the prompt copy is stripped to
a fixed point. The model never sees a wallet, the state, or what the contract does with the answer. Only `open_term`
calls the model; counting signatures afterwards is an integer comparison.
