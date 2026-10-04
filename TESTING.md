# TESTING

```
COMPILE PASS ≠ RUNTIME PASS
SUBMITTED ≠ ACCEPTED ≠ FINALIZED ≠ EXECUTION SUCCESS ≠ POSTCONDITION PASS
```

## Run automatically (offline, also in CI)

| Gate | Command | Result |
|---|---|---|
| kill-set + rubric overlap | `python3 TERMCERTAIN_KILLSET_CHECK.py contracts/TermCertain.py` | NO LEAK + PASS, rc 0 |
| genvm-linter (AST, offline) | `python3 -m genvm_linter.cli lint contracts/TermCertain.py` | passed (3 checks), rc 0 |
| genvm-linter schema / typecheck | `python3 -m genvm_linter.cli schema` / `typecheck` | 9 methods (4 write, 5 view); no type errors (run once, not in CI) |
| contract tests, Direct Mode | `python3 -m pytest tests/contract -q` | 56 passed |
| frontend logic tests | `npm test` | 50 passed |
| build | `npm run build` (`tsc -b && vite build`) | rc 0 |
| source hash | `npm run verify:source` | PASS |
| calldata table | `node tools/calldata-bytes.mjs` | every hard-block row ≤ 255 bytes |

`lint` is used, not `check`: `check` calls the network and exits 1 in CI.

Sixteen deliberate faults were injected into the contract one at a time (threshold fixed to 1, threshold inverted, self
counter-sign allowed, self reject allowed, round count reset on reject, a pinned sum left PROPOSED, an open sum made
FINAL at once, the other side recording on a pinned term, an open term limited to the author, no round cap, the
fail-safe flipped, a stranger counter-signing, `countersigned_by` not stored, `FIXED` removed from the fence, signatures
miscounted, the rejection note lost); each was caught by a contract test.

The app screens were also rendered against a local mock of the RPC with the two test wallets: fresh terms (0 of 1,
0 of 2), both after `4000`, the other side's view, and the end state, at desktop and phone width.

### Calldata size (offline, encoded exactly as genlayer-js 1.1.8 `writeContract`)

| Row | Bytes |
|---|---|
| open_term X1 / X2 / X3 / X4 / X5 | 115 / 144 / 139 / 157 / 145 |
| open_term Y1 / Y2 / Y3 / Y4 / Y5 | 141 / 141 / 152 / 149 / 150 |
| record_amount (id + 10^18) | 108 |
| countersign (id) | 97 |
| reject_amount (id + 60-char note) | 161 |
| open_term at the caps (label 80 + text 600) — measure only | 759, over the limit |

Longest ASCII text that fits with label `the other side`: **163 characters**. The app shows a live meter and blocks
sending above 255 bytes.

### Calldata on the real RPC

`node tools/probe-calldata.mjs <address>` sends each row as a `gen_call` write simulation (no wallet, no transaction,
no model call): `open_term` is sent from the other wallet and stops at *The other side cannot be the author*; the id
methods use an unknown id and stop at *Unknown term id*. StudioNet's `gen_call` answers with a generic "execution
failed" rather than the sentence, so a row counts as decoded when the node reports execution (or returns the sentence)
and fails only on a network error or no answer. CI runs it for the addresses in `deployments.json` (job `probe`). The
`gen_call` path does not reproduce the 255-byte cliff of the transaction path; that limit is enforced by the offline
table and the app's meter.

## Run by hand on StudioNet

Only what needs a real wallet, a real signature or a human eye. Results and hashes: `RUNTIME_EVIDENCE.md`.

- Intelligent Contract: deploy, then a 12-row table with 13 transactions and two wallets (plus one extra transaction).
  Labels X4, Y4, X3, Y3 as expected; the same 4000 gave FINAL and PROPOSED; both teeth, the proposer block, the loop
  and the two-wallet counter-signature all passed.
- Project: the same frozen source deployed again at its own address, then 7 transactions through the app and
  3 screenshots.

A call the app already knows will revert is **not** sent — the button is disabled with the contract's sentence — so
its proof in the Project run is a screenshot, not a hash.

## Agreement

Every open was accepted in its first round except X3, which needed two leader rotations before the validators accepted
`FIXED`. The rubric was not changed after the run.

## Consensus behaviour

The model is called once, in `open_term`. Validators re-run the classification and must agree on the exact label; a
disagreement rotates the leader or reverts the transaction (fail-closed): no term is stored with a label the validators
did not agree on. The three other writes are integer comparisons.

## What this run does NOT prove

- The Direct Mode tests use **mocked** model answers. They prove the deterministic code paths, not what the model
  returns. Only RUNTIME_EVIDENCE proves labels.
- Four of the ten cases were sent, once each; label stability across repeated runs or validator sets is not measured.
  The validators were split on X3.
- The round cap and amounts near 10^18 were tested offline only.
- Texts longer than about 163 characters (the contract allows 600) are not proven on StudioNet.
- Prompt-injection resistance rests on the fence and the reserved-token check; no adversarial model run was done.
- Nothing proves that the two wallets are two people.
