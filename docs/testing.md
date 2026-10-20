# Verification evidence

Executed locally on Windows / Node 24.21.0, 20 October 2026:

- pnpm check: strict typechecking (including tools), zero-warning ESLint, 22 tests
  in 3 files and Prettier check all passed.
- pnpm build:api: Next.js 16.4.2 production build passed, including API handlers and
  privacy/terms/support/password-reset pages.
- Atlas database check: ping and explicit index initialization passed.

Account/category additions: 4 integration tests for CRUD, owner isolation, stale
version conflicts, concurrent idempotent creates, payload/key conflict, archive/restore
and repeatable default-category seeding. Total after this slice: 26 tests in 4 files.

Ledger additions verify actual persisted income/expense/transfer balances, conservation
of tracked money, reports after editing/deletion, logout/relogin persistence, cross-user
references and access, category type validation, invalid amounts, same-account transfers,
duplicate writes, literal search, exact large-value sorting, destination account filtering,
timezone month boundaries, archived reference checks and conflict-safe preferences.

Tests invoke real Route Handlers with Argon2 and a disposable real MongoDB replica
set. They cover validation, persistence, normalized identity duplicates, credential
hashing, generic login errors, token expiry/revocation, refresh/replay/concurrency,
device/user isolation, actual local recovery email, reset expiry/single-use,
password change, atomic deletion preserving another user, throttling/body limits,
health, currency precision/large money, transfer conservation, cashflow, progress,
timezone grouping and month-end recurrence.

Rerun pnpm install --frozen-lockfile, pnpm check and pnpm build:api.
First integration run downloads MongoDB from its official download service; Docker
is unnecessary. Tests never read server .env.local or target Atlas.

Not executed yet: mobile UI/device tests, signed AAB, public deployment, production
email or Play testing/review. Route integration is not a complete device end-to-end test.
