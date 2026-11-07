# Product and implementation decisions

- 24 October: send a personalized transactional welcome email after the first
  successful signup, using a first-name HTML greeting and hosted support/privacy
  links. Delivery runs through Next.js after-response work, is deduplicated at the
  provider by user ID, and never turns a completed signup into an email error.
  Failed welcome delivery is logged without personal data; automatic retry is not
  provided by this best-effort notification.

- 24 October: the private administration page uses an explicitly light monochrome
  theme, summary cards, a searchable current-page table and responsive overflow.
  Session counts remain labelled as valid sessions rather than live presence.
  Android 0.2.2 (6) is prepared locally for closed testing; no Play publishing.

- 24 October: password recovery emails include a branded HTML reset button with
  no visible raw reset URL. A plain-text alternative remains for email clients
  that need it. Token handling, expiration and single-use behavior are unchanged.

- Modular monolith; REST /api/v1, shared Zod contracts, framework-free finance-core.
- Financial data belongs to a verified session's userId. Public entity IDs are UUIDs.
- Money is a canonical base-10 integer string on JSON/storage boundaries; arithmetic
  uses bigint, avoiding MongoDB double precision and JSON bigint serialization issues.
- Accounts share one base currency in the MVP. Currency changes are prohibited once
  financial records exist. No FX conversion or banking integrations. Optional LLM
  intent routing was authorized on 23 October; it is read-only, disabled by default
  and keeps financial tool results inside Finora. See assistant-plan.md. This scope
  replaces the original no-LLM decision. Live access is an explicit per-environment
  opt-in; local provider routing and the emulator read flow were later verified.
- Transfers are one transaction document containing both account references.
- Authentication uses random opaque access and refresh tokens, only SHA-256 token
  digests persist. This permits immediate logout/password-change revocation without
  trusting client token claims. Access expires after 15 minutes; families after 30 days.
- Refresh tokens rotate with a conditional update. Previously used token digests
  identify replay and revoke that entire device family. Concurrent mobile refresh is
  single-flight; replay is deliberately fail-closed, including concurrent replay.
- Password reset uses Resend HTTPS API in production, restricted local disk outbox
  only outside production. On 21 October 2026 the user deferred email setup: an
  explicit EMAIL_TRANSPORT=disabled permits hosted testing while recovery returns
  the same unavailable response for every email, before issuing a reset token.
  Production Resend still requires its credentials. Verified email remains a public
  release-readiness gate; no emails are sent in disabled mode.
- Later on 21 October 2026 the user authorized the Finora sending subdomain and
  production release preparation. Resend verified finora.aadarshx.in after the
  scoped Hostinger DNS additions. A signed build, honest Play declarations,
  device QA and delivery checks remain separate release gates. Billing remains
  disabled. Store agreements and account-owner declarations require owner review.
- Free manual tracking remains available; no billing UI until backend verification
  and merchant onboarding are complete. No advertising or analytics SDKs initially.
- No deployment, Play publication or live billing is authorized by repository pushes.
- Public help pages use Finora branding and the hosted Vercel origin, including
  during local API development. At the user's request, the first release package
  uses `app.finora.money` instead of a personal-name development identifier. Google
  developer-profile disclosure rules are separate from app branding; do not submit
  publicly while the user's identity-privacy requirement remains unresolved.

## Verified official sources

Consulted 20 October 2026; exact installed versions are recorded in the lockfile.

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation)
- [Expo SDK 58 release](https://expo.dev/changelog/sdk-58)
- [Expo Router installation](https://docs.expo.dev/router/installation/)
- [MongoDB transactions](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/)
- [Argon2 Node bindings](https://github.com/ranisalt/node-argon2)
- [Resend email API](https://resend.com/docs/api-reference/emails/send-email)

- Update, 22 October 2026: production Resend delivery and branded support receiving
  are verified. Recovery to an existing development-only profile initially sent
  nothing by design; the approved exact profile/records copy into production fixed
  that case, and the resulting email showed Delivered. Password-reset completion
  and ongoing support monitoring remain separate checks.
- The owner subsequently expressly authorized a testing release. Play's closed
  testing version 2 (0.1.1) is in review. Public production publication remains
  blocked by Google's testing criteria and the unresolved identity-privacy request.

- Update, 22 October 2026: signed-out entry opens registration, with an explicit
  sign-in link for existing users. Screen reads use accessible, static skeleton
  placeholders; existing cached content stays visible during background fetches.
  The pull-to-refresh indicator is reserved for an explicit refresh gesture.
  Financial caching remains in memory, isolated by user and cleared on sign-out.
  SQLite persistence, an offline mutation outbox and conflict-aware synchronization
  are not implemented; writes still require the hosted API. Version 0.1.2/code 3
  was validated and uploaded for the existing closed test, not public production.
  Google's automated checks passed. Submission initially did not persist, but on
  23 October Publishing overview confirmed Changes in review for version 3.
  Google approval remains pending; see release-status.md for the current gate.

- Scope update, 23 October: optional AI can also prepare a transaction draft for
  explicit review and saving through the existing transaction form. It cannot
  execute financial writes itself. Optional onboarding records completion and
  supports an explicitly confirmed first account. The owner later authorized
  pushing this work and requested closed-testing preparation; testing publication
  still requires passing checks and a compatible hosted API deployment.

- Update, 24 October: apply the supplied light, mint and white-card reference
  across mobile screens, preserve explicit dark-mode choice, and use the new
  overlapping green Finora mark. Insights receives the supplied overview layout.
  Email sign-in remains the only authentication provider. AI answers lead with
  exact local text and optional compact details; transaction drafts clarify
  missing fields and require explicit confirmation inside chat.

- 24 October: onboarding is a local durable operation in the existing encrypted
  SQLite vault, with automatic retry and an atomic, idempotent server setup endpoint.
  Network failure never discards accepted local setup. Unknown local baselines must
  not be interpreted as empty server data. The remaining all-feature offline ledger
  is still in progress; see offline-first-plan.md. Current authorization is fixes and
  GitHub pushes only, with no Play action.

- 24 October, expanded AI scope: owner-authorized v3 read tools and 38 confirmation-
  protected financial/preference actions, conversational household planning using
  minimized financial summaries, bounded private caches, 20 chat requests per UTC
  day, and a server-protected usage admin page. The requested owner identity has no
  daily cap but retains burst protections. New disclosure is versioned; installed
  v2 clients retain the original data flow. Authentication/account deletion, billing,
  external money movement and device-only controls retain dedicated flows. No Play
  upload or billing activation. See assistant-plan.md for limits and verification.

- 29 October: remove Money Ahead and its dedicated mobile, API, contract and calculation code.
  Home uses a neutral balance card. Insights uses readable summary figures and category rows.
  Account name validation uses an inline prompt; Settings allows display-name editing through
  an authenticated, strictly validated profile endpoint. No email or identity fields are editable.
- 29 October: v4 chat sends only the new question, chat/message IDs and optional edit reference
  from mobile. Conversation context is loaded by the server, scoped to the signed-in user.
  The current implementation uses four prior exchanges plus the new question (nine messages,
  below the maximum of ten). Old v3 clients retain their existing compatibility endpoint.
  New disclosure covers persistent account chat history. Server replies do not persist executable
  proposal tokens in history. Starting a chat is separate from deleting one.
- 29 October: transaction creates persist locally before network delivery when encrypted SQLite
  is available. The server transaction ID equals its validated idempotency key so a lost response
  cannot double-count the local overlay. Acknowledged entries remain locally until a complete
  server snapshot includes them. Other write types still use their existing online/queued paths.
  No Android build or Play upload is part of this changeset.

- 29 October follow-up: align Expo 58 patch packages and React Native 0.88.1 with
  Expo's published compatibility recommendations after the hosted CI check detected
  newer required patches. Keep strict peer validation and the online Expo CI check
  enabled; add the matching React Native Metro configuration peer explicitly.

- 7 November: the owner's intended direction is a free tier with ads plus a
  subscription-based premium tier (premium visuals/imagery and extras), and a
  widget-style presentation. Plans, pricing, ad placement and widget scope are
  undecided. No ad SDK, billing, entitlement UI or Play action is implemented or
  authorized by this note; the earlier no-ads/no-billing constraints stay in force
  until the owner decides details. Any ad/analytics SDK needs a Data safety review.
