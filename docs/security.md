# Security controls and remaining gates

Implemented and tested: strict DTOs/body cap, server-derived identity, Argon2id
(64 MiB, 3 iterations, parallelism 1), 256-bit random tokens, SHA-256 token digests,
short access lifetime, atomic refresh rotation/replay revocation, current-password
checks, single-use expiring reset links, transactional identity lifecycle and account
deletion, generic login/recovery responses, distributed throttling, allowlisted logs,
no-store responses and basic HTTP security headers.

Credentials, outbox and signing files are ignored. No secrets in EXPO_PUBLIC values.
Resend uses a fixed HTTPS endpoint with a timeout. Delivery failure removes the
reset token and returns an error. Production rejects local email, missing sender/key,
non-HTTPS APP_URL and absent trusted-proxy configuration.

Release gates: least-privilege Atlas user, verified HTTPS hosting/proxy behavior,
verified sender, monitored support/deletion channel, backup retention, privacy and
security review, actual mobile device tests and signed Android release verification.
Never add arbitrary errors, requests, tokens or financial text to logs/crash reports.

Concurrent refresh of one token deliberately revokes that family; clients must
serialize refresh. A lost refresh response can require sign-in. Families are capped
at 10,000 rotations to bound replay history. No claim of regulatory certification.
