# TEST_PLAN

## Semantic cases (other side label `the other side`; the author drafts the term)

| Case | Text | Expected |
|---|---|---|
| X1 | The fee is 4,000 a month. | FIXED |
| X2 | The rate is set out in the schedule and does not move. | FIXED |
| X3 | Each additional seat costs the same as the first. | FIXED |
| X4 | The amount is whatever the published list says on the day of order. | FIXED |
| X5 | The total is the unit price times the quantity ordered. | FIXED |
| Y1 | The fee will be settled between us nearer the time. | TO_BE_AGREED |
| Y2 | The rate is to be discussed once volumes are clear. | TO_BE_AGREED |
| Y3 | Each additional seat costs whatever we later think reasonable. | TO_BE_AGREED |
| Y4 | The amount is whatever the parties arrive at in good faith. | TO_BE_AGREED |
| Y5 | The total will be worked out together after the first month. | TO_BE_AGREED |

Adversarial pairs — same surface, opposite label:

| Pair | Shared surface | Why opposite |
|---|---|---|
| **X4 / Y4** | the same formula `The amount is whatever …` | X4 points to a published list a stranger can look up; Y4 points to what the two sides will settle on |
| **X3 / Y3** | the same opening `Each additional seat costs …`; only Y3 contains "whatever" | X3 is anchored to the first seat; Y3 to the author's later opinion |
| **X5 / Y5** | both about reaching the total | X5 gives a calculation; Y5 says it will be done together |
| X2 / Y2 | the rate and where it comes from | X2 has a schedule and does not move; Y2 will be discussed |
| X1 / Y1 | the monthly fee | X1 states a number; Y1 defers it |

Classification:

- **Kill tests** (the rubric does not hint at the mechanism): X4/Y4, X3/Y3, X5/Y5, X2/Y2.
- **Definition check**: X1/Y1 — a number written out, and "will be settled … nearer the time", follow directly from
  the rubric's definition.

`python3 TERMCERTAIN_KILLSET_CHECK.py contracts/TermCertain.py` → `NO LEAK` and `PASS`. "whatever" appears in both
classes (X4, Y3, Y4), so a filter that counts that word labels X4 wrongly.

## Deterministic cases (automated, `tests/contract/test_termcertain.py`)

| Case | Test |
|---|---|
| the threshold for both certainties, and `get_term` matching it | `test_signatures_required_for_both_certainties` |
| the same 4000 from the same wallet → FINAL and PROPOSED | `test_same_amount_same_wallet_two_opposite_states` |
| the two teeth exist only on one branch | `test_two_teeth_exist_only_on_one_branch` |
| the on-chain table replayed in order | `test_runtime_table_in_order` |
| the proposer can never counter-sign (pinned, awaiting, proposed by either side) | `test_proposer_can_never_countersign` |
| the proposer can never reject | `test_proposer_can_never_reject` |
| a third wallet is refused by `record_amount`, `countersign`, `reject_amount` | `test_third_wallet_is_refused_everywhere` |
| the other side records only on an open term | `test_other_side_records_only_on_open_term` |
| record → reject → record → counter-sign, `round_count == 2` | `test_full_loop_counts_rounds` |
| ten proposals + ten rejections → stuck in AWAITING | `test_round_cap_leaves_the_term_awaiting` |
| the tenth proposal can still be signed | `test_tenth_proposal_can_still_be_countersigned` |
| a pinned term has no loop and no round cap | `test_pinned_has_no_loop_and_no_round_cap` |
| the ledger is never rewritten; rounds are scoped per term | `test_ledger_is_never_rewritten`, `test_rounds_are_scoped_per_term` |
| amount bounds | `test_amount_bounds` |
| whitespace variants share one id; another author gets a new id | `test_whitespace_variants_share_one_id`, `test_same_text_other_author_is_a_new_term` |
| id formula matches the app's | `test_local_id_formula_matches_contract`, `test_vectors_match_contract` |
| other wallet case-normalized | `test_other_wallet_case_normalized` |
| fail-safe on broken or unknown output | `test_fail_safe_on_unparseable_output`, `test_fail_safe_on_unknown_label` |
| fenced JSON parsed | `test_fenced_json_output_is_parsed` |
| validator rejects disagreement and bad shapes | `test_validator_rejects_disagreement_and_bad_shapes` |
| prompt never sees wallets; fence strip is a fixed point | `test_prompt_never_sees_wallets`, `test_fence_strip_is_fixed_point` |
| views on unknown ids, paging, limits, rubric | `test_views_on_unknown_ids`, `test_get_rounds_paging_is_clamped`, `test_limits_and_rubric` |
| no forbidden constructs; one threshold definition | `test_no_forbidden_constructs_in_source` |
| each of the 25 revert sentences, verbatim, once | `test_revert_*` (25 tests) and `test_every_revert_string_has_exactly_one_dedicated_test` |

## Frontend (automated, `tests/js`)

Revert set equal to the contract's; `_signatures_required` parity run against the contract source in Python; the
gauge text at 0, 1 and 2 signatures; every button's check order; amounts parsed as exact decimal strings up to 10^18;
postconditions; Python-exact strip/length; id vectors; receipt rule (ACCEPTED before success); calldata rows; source
hash; docs cross-check; no threshold worked out and no seed data in the app.
