# Testing — Pinned 2.0.0

## Local checks

The contract suite runs the actual py-genlayer v0.2.16 SDK in Direct Mode with
mocked LLM output. Storage and consensus-validator control flow are tested;
live semantic extraction and network consensus are not established by these tests.

| Check | Result |
|---|---|
| Contract tests, pinned SDK, mocked model | 77 passed |
| Frontend tests | 62 passed |
| Production build | Passed; large-bundle advisory only |
| GenVM AST lint | Passed, 3 checks |
| Source hash and offline calldata | Passed; all hard-block calls fit |

Run commands are in README.md. Dependencies are pinned in requirements-test.txt and
package-lock.json. Two targeted mutation checks also passed: removing the exact-amount guard is caught by the mismatch rollback regression, and comparing only the label is caught by the validator amount-disagreement regression. No v1 mutation score or rubric-overlap score is claimed for v2.

## Regression coverage

- A FIXED 4000 term rejects 1, 3999, 4001 and 10^18 before storing a round or final amount.
- The immutable reviewed amount survives recording; the exact amount can finalize.
- Values 1, 4000, 999999999999999999 and 10^18 remain exact and are not recomputed at recording.
- Validator comparison rejects a different amount even when both verdicts say FIXED.
- Missing, invalid, fractional, exponent, signed, Unicode-digit, noncanonical and
  out-of-range amount fields cannot authorize one-signature finality.
- Missing-source input follows the mocked TO_BE_AGREED path and requires the other side.
- Existing authorization, proposals, rejection ledger, round cap, ID and views remain covered.
- Frontend mismatch blocking and postconditions require the unchanged derived amount.
- The actual sendWrite path is exercised with stubbed SDK/wallet dependencies: v2
  can reach the signing boundary; v1 is rejected before wallet interaction.
- A generic RPC execution failure is not treated as proof of calldata decoding.

## Verified v2 live results — 2026-10-18

The new Project deployment was checked through read-only Studio RPC. Signed writes
were performed by the two test wallets, with actual network consensus.

| Case | Observed result |
|---|---|
| `The amount is 4000.` | FIXED / PINNED, immutable fixed_amount 4000 |
| Author records 3999 through Studio | FINALIZED / MAJORITY_AGREE; expected mismatch UserError; no mutation |
| Author records 4000 | FINALIZED / SUCCESS; FINAL, amount 4000, one signature |
| Absent published price list | TO_BE_AGREED / OPEN_TERM; fixed_amount 0; two signatures required |
| Author proposes 4000 on OPEN_TERM | FINALIZED / SUCCESS; screenshot shows PROPOSED, 1 of 2, not binding |
| Other wallet counter-signs | FINALIZED / SUCCESS; finalized state FINAL, amount 4000, 2 of 2, binding |

Before and after the wrong-amount write, finalized reads showed AWAITING, amount 0,
round_count 0 and empty rounds. The success and counter-sign receipts are separately
verified; screenshots alone are not the rollback evidence. Links and whitelisted
receipt/state snapshots are in RUNTIME_EVIDENCE.md and docs/evidence/v2/.

## Remaining limits

Self-contained arithmetic, conflicting/ambiguous amounts, injection, provider
faults and live validator disagreement have not been demonstrated on this deployment.
Their local/mock coverage is not a live semantic or consensus accuracy claim.
The deploy receipt has not been independently inspected, although finalized source
and limits reads match v2. Historical v1 results are not v2 passes.
