# Runtime evidence — Pinned 2.0.0 candidate

**Deployment source checked. V2 runtime regression tests: NOT RUN.**

The new contract stores a validator-derived fixed_amount and refuses a different
record_amount. Local SDK tests establish the deterministic guard, not live semantic
correctness. Do not submit the old Project address as evidence that this fix is live.

## Current Project deployment

- Contract: https://explorer-studio.genlayer.com/address/0xdB91Fdd1F0E623F62a32871f2F60AB57C77c67B8
- Finalized-state get_limits: TermCertain 2.0.0, fixed_amount_required=true.
- Local LF SHA-256: 7ecdfabb30eaebed6c6bb7cdd8b8465fd24fcbd34280e6d5a9d9ec1ea91b8b98
- Deployed CRLF raw SHA-256: fdbae59da58da5e35febecb5b79c9cafe43edd73d57fa3470af63b6cd0eb4eff
- Source comparison: identical after CRLF-to-LF normalization; not raw-byte equality.
- Rubric hash: c356c5f798ba0ec36226c7aac12c38b01b9e3fca9334f6b873e566fcacd91e45
- Source verification read: 2026-10-18T02:13:19.084Z
- Deployment transaction hash not supplied; its receipt has not been independently inspected.
- Detailed read-only check: `docs/evidence/v2/deployment-check.json`.

## Existing submissions, historical only

- Project v1: 0x03bd13f0E6879fd4b6b2f85c642C70E7B3e027f2
- Intelligent Contract v1: 0x2719e3e965ced1c6bb227ae717A57287AE1D430a
- Supplied GitHub archive snapshot: 57e30e12c22a218f1c624ba5df6454bbbebeade9
- Original runtime report: `docs/history/v1-RUNTIME_EVIDENCE.md`
- Original testing report: `docs/history/v1-TESTING.md`

Those transactions and images exercised the old label-only threshold. They cannot
show that a wrong amount is rejected. The steward specifically required the
validator-reviewed result to determine or verify the amount before finality.

## Evidence to record after deployment

Contract/deploy hash, raw source hash (and line-ending normalization if relevant),
get_limits, exact open_term text and get_term showing fixed_amount. Capture the
wrong-amount transaction, its finalized tagged UserError and unchanged term/rounds.
Then capture the exact-amount success and the two-party proposal/counter-sign flow.

Only source and limits reads are claimed so far. No successful v2 live classification, wrong-amount rollback or amount finalization is claimed yet.
