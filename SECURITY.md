# Security and trust boundaries

No funds are held, transferred or escrowed. FINAL is a record in this application,
not a finding about legal rights or off-chain performance.

V1's label-only one-signature route allowed an arbitrary in-range amount. V2 binds
that route to one immutable validator-derived integer. Author-supplied record_amount
cannot replace it. Agreement covers both classification and exact amount.

The source is the supplied term text only. Referenced external schedules are not
retrieved or independently verified. User-authored data may be false; the contract
does not certify a real invoice, currency, identity, agreement or market fact.

Models can misread, miscalculate or follow malicious content. Consensus is not proof
of correctness. Unusable canonical output uses two-party agreement; low-level
execution or consensus failure can still roll back. No forced-verdict backdoor,
admin override or external data source is provided.

The two sides may belong to one person. OPEN_TERM counter-signing checks wallets,
not real identity. Rejected rounds are retained; ten rejected proposals exhaust the
existing round limit. Public inputs should not contain secrets.

A new deployment is required because storage changed. The dApp refuses old versions
at both readiness and fresh signing checks, but version metadata alone is not an
independent attestation of deployed source. Verify source before using a deployment.
