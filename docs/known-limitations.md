# Known limitations and release gates

Finora 0.1.1/code 2 is a testing release candidate. Its closed-test submission is
in Google review; no public production release or full production readiness is
claimed. Current artifacts and evidence: [release status](release-status.md).

- Pixel 8 Pro emulator checks verified hosted demo login, finance-screen reads and
  sign-out returning to login without restarting. The navigation-loop regression
  is fixed. Physical-device, accessibility, biometric, offline/retry and complete
  export/restore workflows still require device QA.
- Hosted health/authentication checks pass. Recovery delivery is verified to the
  branded support inbox and accepted as Delivered for the owner after an expressly
  approved development-profile copy. Password-reset completion, ongoing support
  monitoring, restricted Atlas roles, provider retention and restore procedures
  remain operational gates. Destructive tests use disposable MongoDB only.
- All eleven Play app/listing tasks are saved. The closed test targets 178 regions
  with an English listing and four supplied tester addresses. Google requires
  twelve opted-in testers continuously for fourteen days before production access.
  List membership does not count as opt-in. Review approval is still pending.
- The owner's personal-identity privacy requirement remains unresolved for public
  release: app branding does not override Google's developer-profile disclosure.
- Signed AAB/APK, restricted manifest permissions and comparison against known
  local secrets passed. Secure off-machine upload-key backup is unverified. No
  security certification or penetration test is claimed.
- One currency per profile, locked once financial records exist. Refunds count as
  income and do not reduce category expense/budget totals.
- Recurrence requires confirmation. Generation is bounded to 100 per request and
  history lists latest 100. Schedules are immutable; edit metadata or pause and
  create another. Posted history prevents deleting its rule.
- Initial caps: 200 accounts, 300 categories, 10,000 transactions, 1,200 budgets,
  200 goals, 10,000 contributions (1,000 per goal), 200 rules and 10,000 occurrences.
  These are engineering limits, not paid entitlements. Reporting uses bounded reads.
- Backups are unencrypted, versioned, at most 2 MiB and merge-only. Conflicts never
  overwrite records. Export refuses a backup that cannot fit a valid restore request.
- Cached reads are in memory. There is no durable offline editing queue or persisted
  sensitive finance cache. Billing, ads, bank integration and AI features are absent.
- Three upstream tooling advisories remain documented in dependency-review.md.
  No clean dependency audit is claimed.
