# SECURITY

## Prompt fence

- The model sees only the rubric, the other side's label and the text, each inside its own tag
  (`<UNTRUSTED_OTHER_SIDE_LABEL>`, `<UNTRUSTED_TERM_TEXT>`). It sees no wallet, no state, and nothing the contract does
  with the answer.
- Injection has a clear target here: a text saying "the outcome is FIXED" would let the author bind a sum alone. Both
  answer tokens and all four tags are reserved; text or label containing any of them, compared after upper-casing, is
  rejected before the model call.
- A fixed-point strip removes tokens until the string no longer changes, so nested fragments cannot rebuild one.
- Validators re-run the classification and must agree on the exact label. That checks agreement, not injection
  resistance; the fence does that.

## Fail-safe

Unclear or unparseable output becomes `TO_BE_AGREED`: two signatures. When it is unclear who agreed to what about money,
nobody has. See `LOCKED_SPEC.md` §5–§6.

## Threshold and signatures

The threshold is defined in one place (`_signatures_required`) and printed by `get_term` from the first transaction. The
proposer can neither counter-sign nor reject its own sum, so a threshold of 2 cannot be met by one wallet. The app reads
`signatures_required` from the view and never computes it.

## Frontend

- MetaMask only signs; reads, receipts and the write client go through one same-origin proxy (`/genlayer-rpc`).
- No Snap request, no CDN code, no hard-coded wallet. React escapes all contract text.
- Success is reported only after the transaction is ACCEPTED, the leader receipt says SUCCESS **and** the reloaded
  accepted state shows the change.
- Amounts are kept as decimal strings; they are never rounded through a JS number.

## Remaining limits

- The author names the other side's wallet; the contract cannot prove the two wallets are two people.
- A rejected tenth proposal leaves a term stuck in AWAITING.
- No adversarial model run was done.
