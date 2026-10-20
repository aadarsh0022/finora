# Implementation plan

Source: the user's Finora product brief, 20 October 2026.

1. **Workspace and correctness foundation.** Empty repository inspection; verify stable
   packages against official documentation and registry; pnpm monorepo, Next.js App
   Router API, Expo SDK 58, shared contracts, framework-free finance-core, strict
   TypeScript, lint/format/test/build scripts and CI. Commit and push independently.
2. **Backend identity foundation.** Validated environment, reusable MongoClient,
   explicit indexes, predictable responses/request IDs, bounded requests, Argon2id,
   opaque short-lived access tokens, rotating refresh-token families, independent
   sessions, distributed auth rate limiting, password recovery/email adapter,
   password change, session revocation and confirmed account deletion. Exercise actual
   Route Handlers and MongoDB in isolated integration tests. Commit and push.
3. **Financial services.** Owned accounts/categories, exact integer calculations,
   atomic single-record transfers, idempotent mutations, conflict-safe updates,
   budgets, goals, recurrence, reports, validated export/import. Add tested modules
   incrementally; do not label backend-only features end-to-end complete.
4. **Connected mobile application.** SecureStore, single-flight refresh, query cache
   isolation, reusable accessible controls, auth/onboarding and real finance forms.
   No interactive unimplemented destinations. Verify SDK compatibility and bundle.
5. **Release quality.** Device testing, signed Android build, accessibility/security
   review, accurate privacy/support/deletion pages, closed-test/store materials.

## Verification strategy

- Unit tests for money, transfer conservation, calendar boundaries and schemas.
- Actual MongoDB (mongodb-memory-server disposable replica set) for auth, isolation,
  concurrent refresh/replay, session invalidation, deletion and financial persistence.
- Typecheck, ESLint, formatting and tests after every coherent feature.
- Next.js production build and live HTTP smoke checks; Expo dependency validation
  and Android bundle once a connected mobile slice exists.
- Never run destructive tests against an environment-provided database.

## Environment observations

- Workspace initially empty; no inherited AGENTS.md; GitHub CLI authenticated.
- Node 24.21.0, npm 11.19.0, pnpm 12.4.1; Git and gh available.
- Docker installed but engine unavailable. Android SDK/adb present; Java is 11.
- No MongoDB/email credentials in this process. Atlas deployment, verified email
  sender, signing credentials and real-device/store checks remain release gates.
- Private GitHub repository chosen to avoid inadvertently publishing business work.

## Progress

Implementation in progress. See docs/testing.md for commands actually executed and
docs/known-limitations.md for outstanding requirements. No release readiness claimed.
