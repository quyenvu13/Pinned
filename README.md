# Pinned 2.0

<img src="public/logo.png" alt="Pinned" width="96">

Pinned records amounts and signatures on GenLayer. It holds and moves no funds.
The contract is `contracts/TermCertain.py`, version 2.0.0.

**Status: core v2 live regressions verified on StudioNet on 2026-10-18.**

The validator-derived 4000 rejected a signed Studio write of 3999 without mutation,
then finalized only 4000. A missing price-list term required two different wallets
and became FINAL only after counter-signing. See RUNTIME_EVIDENCE.md for receipts
and remaining semantic/fault-test limits.

Project contract: [0xdB91Fdd1F0E623F62a32871f2F60AB57C77c67B8](https://explorer-studio.genlayer.com/address/0xdB91Fdd1F0E623F62a32871f2F60AB57C77c67B8).
A finalized-state get_limits read returned TermCertain 2.0.0 with fixed_amount_required=true.
Deployed source matches the supplied contract after CRLF-to-LF normalization; raw
byte hashes differ only because of line endings. The deploy transaction hash has
not been supplied. The v1 address is historical and cannot demonstrate this fix.

## Fix requested by the steward

V1 used the FIXED classification only to lower the signature threshold. An author
could then finalize any in-range number, even when it did not match the term.
V2 makes validators derive an exact amount at opening. The agreed result includes
both `outcome` and `fixed_amount`. For a PINNED term, the contract stores that
amount immutably and rejects every different value before any state or round write.

For example, if validators derive 4000, `record_amount(id, 3999)` reverts and
leaves the term AWAITING. `record_amount(id, 4000)` can become FINAL. This is an
amount check enforced in the contract; bypassing the frontend does not bypass it.

## Two paths

| Reviewed result | Stored data | Later amount |
|---|---|---|
| FIXED with a valid derived integer | PINNED, immutable fixed_amount, one signature required | Only the author and only that exact amount can finalize |
| TO_BE_AGREED or unusable assessment | OPEN_TERM, fixed_amount zero sentinel, two signatures required | Either side proposes; the other signs or rejects |

A reference to a price list, invoice, earlier amount or quantity is insufficient
when its necessary data is absent. No external records or web access are supplied.
All calculation inputs must appear in the term text. The other-side label is not
a source of calculation inputs. Units are positive whole-number units from the
text, with no silent currency or major/minor-unit conversion.

The model returns exactly two fields. FIXED requires a canonical decimal string
between 1 and 10^18. Missing amounts, numeric/boolean values, fractional or exponent
notation, leading zeros, extra fields and out-of-range values cannot open the
one-signature route. Validators independently evaluate and compare the complete
label-and-amount result, including the amount. Malformed outputs use the stricter
two-signature path; an uncaught execution or consensus failure rolls back.

## Run

```sh
npm ci
npm test
npm run build
npm run verify:source
npm run calldata
python3 -m pip install -r requirements-test.txt
python3 -m pytest tests/contract -q -p no:cacheprovider
```

Local tests use the actual pinned v0.2.16 SDK with mocked model responses. They do
not demonstrate that live validators derive the correct number. `TESTING.md`
records the current checks; `RUNTIME_EVIDENCE.md` separates old evidence and v2 gaps.

## Deploy and configure

Deploy the supplied contract as a NEW instance, with no constructor arguments.
Do not upgrade v1 storage: the record layout changed. Keep this Project address
separate from the Intelligent Contract submission address. Update `deployments.json`
and `src/lib/config.ts` after deployment, and align any Vercel VITE_CONTRACT_ADDRESS
override. `.env.example` is a public template. No private key is needed in the app.
Writes stay disabled until a fresh get_limits read identifies TermCertain 2.0.0
with fixed_amount_required=true. The same shared check protects UI and signing.

## Important live checks

Use two consenting test wallets A and B. Open `The amount is 4000.` as A naming B.
Confirm FIXED and fixed_amount 4000. Send an actual wrong in-range amount, 3999,
from Studio: it must revert with no mutation. The dApp blocks that known mismatch
before signing. Then record 4000: only that value may become FINAL.

On a fresh term use `The amount is whatever the published list says on the day of order.`
The list is absent, so the expected result is TO_BE_AGREED, not an invented amount.
A proposal must remain non-binding until the other wallet counter-signs. Record
unexpected classifications rather than changing inputs to manufacture a pass.

The app displays the validator-derived amount before recording. Decimal strings
preserve large amounts exactly. It reads signature requirements from the contract
and measures full calldata before signing. Some permitted 600-character texts will
not fit the 255-byte transaction transport; the app blocks those calls.

## Limits

FINAL describes this ledger, not legal enforceability or performance of an off-chain
agreement. Model consensus can still derive an incorrect amount. User-authored
records are not verified business facts. This patch does not prove semantic
accuracy, eliminate prompt injection, prevent collusion or identify real people.
One person may control both wallets. No funds are in custody. OPEN_TERM retains a
ten-proposal cap; rejecting the tenth leaves it awaiting with no further proposal.

Historical v1 receipts/screenshots under docs/history and docs/evidence are not v2
passes. The original reviewed defect remains documented. License: MIT.
