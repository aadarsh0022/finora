# Approved development-to-production profile copy

Use this administrative CLI only after the owner has explicitly approved copying
the named profile and its records. It exposes no HTTP endpoint and grants no new
database permissions. Private Atlas configuration remains in the ignored server
environment file. Apply requires a separate approval flag; preview is the default.

```powershell
pnpm exec tsx scripts/copy-development-profile.ts person@example.com
$env:FINORA_APPROVED_PROFILE_COPY = '1'
try {
  pnpm exec tsx scripts/copy-development-profile.ts person@example.com --apply
} finally {
  Remove-Item Env:FINORA_APPROVED_PROFILE_COPY
}
```

The CLI fixes the source to `finora_development` and destination to
`finora_production`. It refuses existing destination identities or owned records
and never overwrites or deletes source data. It validates a bounded, user-scoped
snapshot with the shared restore graph schema. One MongoDB transaction inserts the
profile and eight finance collections, then compares the persisted profile and
every copied record before commit. Existing password hashes, preferences, integer
amounts, dates, identifiers, default-category keys and amount-sort values remain
unchanged. Sessions, reset tokens, rate limits, import previews, idempotency keys,
audit events and entitlements are not copied. No credentials, emails or financial
record contents are printed; output contains counts and verification flags only.

Disposable MongoDB tests cover a write-free preview, exact balances above JavaScript's
safe integer range, transfer conservation, existing-password login, owner isolation,
session/reset exclusion, destination conflict refusal, invalid references and full
rollback when a later collection insert fails. Never test rollback against Atlas.

On 21 October 2026 the owner approved one profile copy after reviewing its counts.
The verified copy contained 1 account, 17 categories, 5 transactions, 1 budget and
1 savings goal. Source data remained unchanged. A subsequent production recovery
request was accepted and Resend reported delivery to the owner's requested address.
The address, password hash and reset link are intentionally absent from this record.
