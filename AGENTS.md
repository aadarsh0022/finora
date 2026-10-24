# Finora engineering rules

Read docs/implementation-plan.md and docs/product-decisions.md before changing scope.
Use strict TypeScript, validated DTOs, server-derived identity, and integer minor units.
Never log or commit credentials, auth tokens, transaction notes, or merchants.
Keep finance-core independent of frameworks and persistence. Scope all user-owned queries
by userId. Test financial invariants and authentication against disposable MongoDB.
Run pnpm check before committing. Keep changes small and coherent; update documentation
and honestly report external release gates. Never publish to Play or activate billing.

## Play upload timing preference

When the user explicitly authorizes a Play testing release, wait at least 20 full
minutes after the bundle upload completes before submitting changes for review.
Record the upload-completion time, check Play's verification results after the
waiting period, and submit only if no blocking issues remain. Do not treat a
successful upload or a saved release draft as a submitted or published release.
