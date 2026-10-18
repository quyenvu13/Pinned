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

## Required v2 live results — NOT RUN

1. Source identity/version/amount-bound capability were checked on the new deployment; deploy receipt is not yet supplied.
2. Text fixing 4000: verify fixed_amount; submit wrong amount 3999 through Studio.
   Require the exact mismatch UserError, unchanged AWAITING term and empty rounds.
3. Submit 4000; require finalized successful execution and FINAL amount 4000.
4. A missing price list or missing arithmetic operand must not yield an invented
   unilateral amount. Inspect the real verdict and preserve any failure.
5. Check the two-wallet proposal/counter-sign flow on the new deployment.
6. A self-contained calculation and a conflicting/ambiguous amount need semantic
   checks. Provider faults, disagreement and injection require separate evidence.

Preserve source/commit, contract address, exact calls, finalized execution/consensus
and authoritative before/after state. A screenshot or deployment alone is not proof
of the wrong-amount rollback. The v1 runtime evidence is historical only.
