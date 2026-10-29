# Verification evidence

Executed locally on Windows / Node 24.21.0, 20 October 2026:

- Initial foundation check: strict typechecking, zero-warning ESLint, 22 tests
  in 3 files and Prettier check passed. Current totals are recorded below.
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

Latest integrated run (21 October 2026): **97 Vitest tests in 21 files and 37 native component tests
in 10 files passed**, with strict types, zero-warning ESLint and formatting. Next.js
production build, Expo SDK compatibility check and Android Hermes export with
source maps passed. The component runner uses Jest/Expo/RN Testing Library with
mocked transport and operating-system boundaries; it is not a real-device test.

Explicitly disabled email is covered against disposable MongoDB in production mode:
health, login and authenticated reads remain available; recovery returns the same
unavailable response for existing/missing emails and issues no reset token. Separate
configuration tests preserve HTTPS/proxy guards and require complete Resend inputs
when that transport is selected.
Resend HTTP/network failures are simulated against disposable MongoDB: existing
and missing emails receive the same successful public response, failed delivery
leaves no reset token and logs contain only safe request metadata.

Website deletion tests exercise the browser request flow against actual Route
Handlers and disposable MongoDB. They verify exact confirmation before login,
owned-data deletion, preservation of a second user's data and revocation of the
temporary website session when deletion fails. No production deletion test ran.

`scripts/smoke-api.ts` passed against the running local Next.js server connected to
Atlas finora_development: real HTTP registration, accounts, income, expense,
transfer conservation, budget spending, expense edits/deletion and overview/range
report recalculation, savings contributions, recurring generation/confirmation,
reopened occurrences after ledger deletion and persistence after logout/relogin.
The script removed only its freshly generated disposable user and owned data. It
requires an explicit localhost origin and ALLOW_DEV_SMOKE=1, and logs no secrets.

Mobile client tests cover concurrent single-flight refresh, no mutation transport
retries, expiry clearing, stale-refresh protection after logout, validation mapping
and HTTPS enforcement. Form invariants cover exact large amounts, timezone offsets,
DST and invalid/skipped dates. Native component tests additionally exercise auth
forms, exact transfers, preserved idempotency on a recoverable error, saving/disabled
controls, delete confirmation, dashboard loading/empty/error/offline states,
navigation, themes and the actual app-lock controller/provider around native mocks.

An initial native debug APK build succeeded for all four ABIs. The subsequent
x86_64 debug build after adding SVG/biometric modules and branding also succeeded
(483 tasks; 6m39s). Its development APK is retained at
`.local/android-debug/finora-x86_64-debug.apk`; it requires a reachable Metro server,
is for an x86_64 emulator, and is not a standalone release or ARM phone build.
Emulator installation/boot stalled; another configured AVD's system
image was missing. A later Pixel 8 Pro boot, APK installation and native React
startup succeeded; subsequent restarts serve the app from Metro. Full native
workflow, visual and accessibility verification remains incomplete.

Expo prebuild applied the release-signing plugin. Real Gradle missing-input and
HTTP release attempts failed at the intended guard during initial setup.
Private local upload-key generation succeeded with restricted Windows ACLs.
Three guard unit tests cover unsafe URLs, signing inputs and plugin transformation.

Deterministic launcher/splash generation checks passed. Source/bundle comparison
found no configured server secrets. The generated Android source map contains no
node-forge, braces, sprintf-js or xcode module paths; npm audit still retains three
upstream tooling advisories, documented in dependency-review.md.

Hosted smoke checks (21 October 2026): the Vercel /api/health endpoint returned
HTTP 200 with an Atlas ping; unauthenticated account reads returned 401. Metro
loaded the hosted origin and reopened/bundled the app on Pixel 8 Pro without
observed runtime errors. No production user or financial data was created by these
checks; full cloud authentication/finance workflows remain unverified.

The signed release build subsequently passed from clean revision `d9fe5bd` with
the hosted API. AAB JAR verification, Google bundletool validation and matching
standalone APK signature checks passed. Actual manifest inspection confirmed the
Finora-only package, target API 36 and the restricted permission inventory.
Comparison against local server secrets/upload-key passwords found no matches
across 2,639 uncompressed AAB/APK entries; cloud-only values were not retrieved.
See release-status.md for artifact hashes and provenance.

The signed standalone APK installed and cold-launched on Pixel_8_Pro (API 37)
without Metro. The process remained alive, with zero captured AndroidRuntime fatal
or ReactNativeJS error lines for its process during the startup check. No native
UI interaction or authenticated workflow is claimed by this developer-CLI smoke test.

The administrative profile-copy addition has five disposable MongoDB integration
tests covering preview, large exact balances/transfer conservation, preserved login,
owner isolation, excluded sessions/reset tokens, conflict refusal, invalid references
and rollback after a later insert fails. Current total: 134 tests.

Authorized hosted email checks: a dedicated test account's recovery reached the
branded support inbox. A read-only lookup identified an existing owner profile in
development but absent from production. The approved profile copy passed graph and
exact-record verification; a new recovery email then showed Delivered in Resend.
No reset link, password, merchant or transaction note is included in this evidence.

Not executed yet: full native workflow/visual/accessibility tests, completion of a
production password reset or Play testing/review. Route integration and artifact
verification are not complete device end-to-end tests.

## Native sign-out regression — 22 October 2026

The signed version 1 build showed a persistent blank screen after successful
sign-out on Pixel 8 Pro. The root index and tabs index both resolve to `/`; the
router's default protected-route fallback repeatedly redirected through that
ambiguous path. Explicit group-qualified destinations now send expired/signed-out
sessions to `/(auth)/login` and signed-in auth screens to `/(tabs)`.

Two tests run the actual Expo Router with Finora's root layout: sign-out/login
without a process restart, and an unauthenticated private deep link. Removing the
fix reproduced an unbounded navigation update loop; with the fix both tests pass.
The release config is bumped to 0.1.1 / version code 2. The previously uploaded
version 1 is superseded and must not be rolled out. A replacement signed build and
native validation are required before tester distribution.

On 22 October, version 2 installed on Pixel 8 Pro and authenticated against the
hosted API using only the synthetic review account. Home, transaction types,
budgets, reports and goal balances were visually inspected during release QA.
The fixed build returned from confirmed sign-out to the login form without an
app restart. No full physical-device or accessibility certification is claimed.

## Signup and loading update — 22 October 2026

Version 0.1.2/code 3 opens signup for signed-out entry and protected deep links,
with an explicit route to sign in. Actual Router tests cover first launch,
switching to sign-in, sign-out and subsequent authentication. Dashboard tests
hold a request pending to verify the skeleton on initial load, then verify that
background invalidation keeps content visible without a skeleton or refresh
spinner. An explicit pull gesture displays its refresh indicator until completion.

After aligning the recommended Expo SDK 58 patches, `pnpm check` passed all 97
Vitest and 41 native tests, with typecheck, lint and format checks. Expo dependency
validation and the full GitHub CI passed for `be8e326`. The repeated dependency
audit still reports the same three tooling advisories in dependency-review.md.
The signed AAB/APK passed bundletool, signer, manifest and known-local-secret
comparisons. On Pixel 8 Pro, signup remained the first screen after a signed-out
cold launch; the sign-in link, hosted demo login, sign-out and finance reads worked.
These are scoped emulator checks, not complete physical-device QA or offline sync.
The current Finora process remained alive with no captured AndroidRuntime fatal
exception or ReactNativeJS error lines during the final emulator check.

On 23 October, another `pnpm check` attempt could not start because Windows Device
Guard blocked the installed pnpm executable. No security policy was changed or
bypassed. The earlier 138-test result and green CI apply to the built source
revision; pending release-document updates remain uncommitted until the required
check can run through an authorized runtime.

## Assistant and onboarding push verification, 23 October 2026

The current `pnpm check` passed TypeScript and ESLint. Vitest ran 55 tests
successfully, but 22 API suites could not load because Windows Application Control
blocked the installed argon2 native module. These suites did not execute; this is
not a passing financial/authentication integration result. The Next.js production
build was blocked by the same native module. No security policy was bypassed.

After fixing the Android-platform notification mock, all 20 native suites and
90 tests passed. Jest reported an open-handle warning after completion. The
Android JavaScript export succeeded. Formatting was corrected before the push.
The current development Android APK was rebuilt and installed with the native
notification module; this is not a signed testing release artifact.

The hosted health endpoint returns 200, and login validates requests, but the
hosted deployment does not yet contain these new assistant/onboarding endpoints.
Linux CI and a verified compatible API deployment remain release gates. There
has been no new Play upload or publication from these changes.

GitHub Actions run 39998745702 subsequently completed successfully on Linux for
19404f7: all 146 Vitest tests and 90 native tests passed, followed by formatting,
Next.js production build, Expo dependency validation and Android export. This
resolves the code-verification gate for that revision without changing Windows
security policy. The native Jest process exited after its cache timers elapsed.

## 24 October refinement verification

The latest full check passed 147 core/API tests against disposable MongoDB and
101 native tests, plus strict typechecking, lint and formatting. API production
build and Android JavaScript export passed. Added cases cover inline transaction
clarifications/retry, cached hydration, missing native date-range formatting,
reduced-motion startup, lower Home navigation and account-isolated privacy consent.
These component/export results do not certify a signed build or full offline-first
behavior. Native clipboard/launcher/splash assets require an updated binary.

### 29 October app and API refinement

- Full `pnpm check`: 167 API/core/unit tests and 99 native workflow tests passed,
  together with strict TypeScript, ESLint and formatting. This includes profile
  ownership/validation, server-owned chat context/replay/isolation, real streamed
  tool activity, lost-response transaction reconciliation and exact local ledger
  projection. Device and hosted smoke checks remain separate from this test result.
- Android release configuration: 0.3.0, version code 7. Bundle preparation does not
  upload or submit anything to Google Play. Play privacy declarations require review
  for the new account-based chat history before a later upload.
