# Verification evidence

Executed locally on Windows / Node 24.21.0, 20 October 2026:

- pnpm check: strict typechecking (including tools), zero-warning ESLint, 22 tests
  in 3 files and Prettier check all passed.
- pnpm build:api: Next.js 16.4.2 production build passed, including API handlers and
  privacy/terms/support/password-reset pages.
- Atlas database check: ping and explicit index initialization passed.

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
