# Runtime evidence — Pinned 2.0.0

**Core v2 live regressions verified on StudioNet, 2026-10-18. Extended semantic/fault coverage remains incomplete.**

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

## Verified calls and readback

Wallet A (author): `0x923a09d0D6e5C242e36C3c1D2071835917cC0bDF`.
Wallet B (other side): `0x10AaA763DB250e4856210Dfb91B57780F60e9879`.
No real-world identity or independence of their owners is asserted.

### Fixed amount

Text: `The amount is 4000.`
Term: `921773119987ae3fbc0f306d6089e10a9f805043ee9817a283150466c45b9f74`.
The stored reviewed result is FIXED / PINNED, fixed_amount `4000`.

- Wrong amount 3999: https://explorer-studio.genlayer.com/tx/0xb3b61577da6e8082c1be2be43ea020b20c41309c56b38034c7505892b408441e
  FINALIZED, MAJORITY_AGREE, execution ERROR, tagged UserError:
  `The amount does not match the validator-derived sum`.
  Finalized reads before and after showed AWAITING, amount 0, round_count 0,
  no rounds and no signatures. This was an actual signed Studio transaction.
- Correct amount 4000: https://explorer-studio.genlayer.com/tx/0xcce447aad3bcca268b56f9acbebdb45157b484a3ad4c3617bdced7d068b9741b
  FINALIZED, MAJORITY_AGREE, SUCCESS. Finalized get_term shows FINAL, immutable
  fixed_amount 4000, amount 4000, one signature, binding true; one recorded round.

Snapshots: `docs/evidence/v2/wrong-amount-3999.json` and
`docs/evidence/v2/correct-amount-4000.json`.

### Missing external record, two signatures

Text: `The amount is whatever the published list says on the day of order.`
Term: `a7732854c638c966b2f2d8683279ad0efea720a710209d2f8d36ce49e91e5b80`.
No list was supplied or fetched. The stored result is TO_BE_AGREED / OPEN_TERM,
fixed_amount 0 and two signatures required.

- Opening: https://explorer-studio.genlayer.com/tx/0x1ce78596c6c872518c167acfdd8a7503fc4b307abb104b442abe355c70ea9042
- A proposes 4000: https://explorer-studio.genlayer.com/tx/0x738a774fb9d42bf44c48354163e617e2675d7d6dbb360382d9de3bd6c5fcda61
- B counter-signs: https://explorer-studio.genlayer.com/tx/0xaf1d4ab61912866a8a56f5d4fff66b27f6d5126667907524c1896c498603eadf

All three receipts are FINALIZED / MAJORITY_AGREE / SUCCESS. The intermediate
PROPOSED / 1-of-2 / non-binding state was captured by the user screenshot; the
finalized read after counter-signing independently shows FINAL, amount 4000,
proposed_by A, countersigned_by B, two signatures and binding true.

Snapshots: `docs/evidence/v2/missing-records-open.json`,
`docs/evidence/v2/open-term-final.json`, and
`docs/evidence/v2/opening-and-countersign-receipts.json`.
These contain whitelisted receipt fields, not validator node configuration.

## Remaining checks

The live cases establish this literal fixed amount and one absent price-list case,
not general semantic accuracy. Arithmetic, conflicting terms, prompt injection,
provider failures and validator disagreement need separate live evidence. Consensus
may still derive an incorrect amount. The deployment receipt remains uninspected.
