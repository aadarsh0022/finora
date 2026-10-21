# Known limitations and release gates

The identity and finance APIs, connected Expo screens and automated checks are
implemented. This is an engineering build, not a verified closed-test release.

- Real-device installation, visual/gesture/accessibility checks and full native
  workflows have not been executed. Bundling does not prove the Android app launches.
- Hosted API verification, verified recovery email, least-privilege Atlas credentials,
  operator/support identity and infrastructure retention remain gates. Atlas is
  connected locally; destructive tests exclusively use disposable MongoDB.
- Email setup is deferred by the user. EMAIL_TRANSPORT=disabled permits hosted
  testing with password recovery explicitly unavailable. A verified sender and
  delivery tests remain necessary before enabling recovery for a public release.
- Privacy/terms/support pages are development drafts requiring review before release.
- No signed release AAB, final store screenshots, Play submission
  or closed test completed. Original adaptive/themed launcher and splash assets
  and original feature-graphic assets are prepared. Signing tooling and a private upload key exist locally; a real
  deployed HTTPS API is still required. No billing, ads, bank integrations or AI enabled.
- One currency per profile, locked once financial records exist. Refunds count as
  income and do not reduce category expense/budget totals.
- Recurrence requires confirmation. Generation is bounded to 100 per request and
  history lists latest 100. Schedules are immutable; edit metadata or pause and create
  another schedule. Posted history prevents deleting its rule.
- Initial caps: 200 accounts, 300 categories, 10,000 transactions, 1,200 budgets,
  200 goals, 10,000 contributions (1,000/goal), 200 rules and 10,000 occurrences.
  These are engineering limits, not paid entitlements. Reporting uses bounded reads.
- Backups are unencrypted, versioned, at most 2 MiB and merge-only. Conflicts never
  overwrite records. Export refuses a backup that cannot fit a valid restore request.
- The client uses in-memory cached reads and preserves recoverable form state.
  There is no durable offline editing queue or persisted sensitive finance cache.
- Range reports, charts, report CSV and optional biometric lock are implemented.
  Their native visual/accessibility, modal coverage and biometric behavior remain
  device QA gates. Live purchases remain deferred; the trusted entitlement adapter
  returns FREE and does not offer a purchase flow.
- Dependency audit retains three upstream tooling advisories (two high, one
  moderate) without published patched versions. See dependency-review.md for
  observed paths, exposure limits and release follow-up. No clean audit is claimed.
- Focused independent review and regression tests are complete; no external security
  certification, penetration test or comprehensive native UI QA is claimed.
