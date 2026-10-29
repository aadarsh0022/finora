# Known limitations and release gates

Finora 0.1.2/code 3 is a testing update candidate for the existing closed test.
Version 0.1.1/code 2 became available to selected testers; the update requires
Google review. Its automated checks passed and Publishing overview confirmed
Changes in review for version 0.1.2/code 3 on 23 October. Approval remains pending.
No public production release or full production readiness is claimed. Current
artifacts and evidence: [release status](release-status.md).

- Pixel 8 Pro emulator checks verified hosted demo login, finance-screen reads and
  sign-out returning to the signed-out screen without restarting. Version 3 also
  verified signup-first cold launch and switching to sign-in. The navigation-loop regression
  is fixed. Physical-device, accessibility, biometric, offline/retry and complete
  export/restore workflows still require device QA.
- Hosted health/authentication checks pass. Recovery delivery is verified to the
  branded support inbox and accepted as Delivered for the owner after an expressly
  approved development-profile copy. Password-reset completion, ongoing support
  monitoring, restricted Atlas roles, provider retention and restore procedures
  remain operational gates. Destructive tests use disposable MongoDB only.
- All eleven Play app/listing tasks are saved. The closed test targets 178 regions
  with an English listing and a supplied tester email list. Google requires
  twelve opted-in testers continuously for fourteen days before production access.
  List membership does not count as opt-in. Each update's review status is separate.
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

## 29 October changeset boundaries

- Local-first projection currently covers transaction creates, account balances/lists,
  categories and the Home overview. Other writes retain their existing online/versioned
  flows. This is not a claim that every feature supports offline CRUD.
- The ledger snapshot endpoint is bounded to 200 accounts, 1,000 categories and 10,000
  transactions. Large hosted response-size behavior still requires operational testing.
  Device persistence commits bounded pages before exposing a new snapshot generation.
- Chat history is server-owned in v4. Only four prior exchanges and the new question
  are supplied as conversational context, below the ten-message maximum. Executable
  proposals are not restored from history; ask again to prepare a new confirmation.
- Visible word-by-word reply rendering is a presentation animation after a complete
  answer. Real tool progress uses the streaming transport; model token streaming is
  not implemented.
- Play Console privacy/Data safety declarations must be reviewed before uploading this
  new build because account chat retention changed. No store submission is performed.
