# Changelog

## 2.0.0 — core live regressions verified

- Replace label-only FIXED output with a canonical label and derived amount.
- Require validator agreement on both fields; missing inputs require two signatures.
- Store fixed_amount immutably and reject any different one-signature record_amount.
- Display derived amounts, preserve decimal precision and check postconditions.
- Gate readiness and signing on the same v2 compatibility rule.
- Strengthen receipt status checks and RPC probe evidence classification.
- Retain v1 evidence separately; remove obsolete locked spec and overlap gate.
- Verify signed 3999 rejection with unchanged state, exact 4000 finality, and the missing-list two-wallet finality flow on the new Project deployment.
- Keep untested live arithmetic, ambiguity, injection and provider/disagreement cases explicit.
