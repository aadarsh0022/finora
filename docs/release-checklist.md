# Release checklist

This is a release gate list, not evidence that the app is ready to publish.
Repository pushes do not authorize deployment, Play publication or billing.

## Engineering verification

- [x] Run `pnpm check` on the release source; retain the resulting test evidence.
- [x] Build the API in production mode and smoke-test hosted health/public access.
- [x] Verify Expo dependencies and produce a successful Android JavaScript bundle.
- [x] Build an initial native Android debug APK (four ABIs).
- [x] Test local signing-key creation and fail-closed release guards; keep the
      private upload key/passwords outside Git and back them up securely.
- [ ] Test native Android installation, login, token refresh, logout and recovery
      against the intended environment on a real device.
- [ ] Exercise accounts, categories, transfers, exact balances, transaction edits,
      filters, monthly reports, budgets, savings contributions, recurrence
      confirmation, settings, export and previewed restore on device.
- [ ] Verify slow network, offline errors, retries, concurrent devices and
      duplicate taps. Confirm account switching clears cached financial data.
- [ ] Check screen reader labels, focus order, touch targets, keyboard handling,
      contrast, large text and both supported themes on representative devices.
- [ ] Review dependencies and backend security; verify TLS, production secrets,
      least-privilege Atlas access and backup/restore procedures.
      Current unresolved tooling advisories are recorded in dependency-review.md.

## Production operations and privacy

- [ ] Configure a production Atlas environment with separate application and
      migration permissions; keep credentials outside Git and mobile bundles.
- [x] Configure the verified production email sender and branded support inbox.
- [ ] Verify actual recovery delivery and support monitoring.
- [ ] Establish an operator name, monitored support contact, retention policy,
      incident handling, database recovery objectives and deletion procedures.
- [x] Publish branded privacy, terms, support, recovery and web-deletion pages.
- [ ] Complete operator/legal review against infrastructure retention and operations.
- [ ] Verify password changes, session revocation, password-reset replay and
      confirmed account deletion against the deployed configuration.
- [ ] Confirm logs and monitoring exclude credentials, session tokens, merchant
      names, transaction notes and request bodies.

## Android and Play preparation

- [x] Set final application identity/version and generate/inspect a signed AAB/APK.
- [ ] Confirm signing ownership, secure off-workstation key backup and Play enrollment.
- [x] Configure original adaptive/themed launcher icons and light/dark splash assets.
- [x] Prepare an original 1024×500 feature graphic alongside the store icon.
- [ ] Supply device screenshots and truthful final
      listing copy. Draft wording lives in `docs/store-listing.md`.
- [ ] Complete the Play Console declarations and data-safety questionnaire from
      actual production behavior; verify current Console requirements there.
- [ ] Complete required closed testing, pre-launch reports and crash checks.
      See [closed testing](closed-testing.md) and [disclosure worksheet](data-safety.md).
- [ ] Validate the public privacy and account-deletion URLs from Play Console.
- [ ] Obtain explicit authorization before any store publication or billing work.

The signed artifacts and free Play draft are recorded in release-status.md.
No Play upload/publication, closed test, native device QA or live billing activation
is performed merely by maintaining this checklist.
