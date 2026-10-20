# Release checklist

This is a release gate list, not evidence that the app is ready to publish.
Repository pushes do not authorize deployment, Play publication or billing.

## Engineering verification

- [ ] Run `pnpm check` on the final commit; retain the resulting test evidence.
- [ ] Build the API in production mode and smoke-test the running HTTP server.
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
- [ ] Configure and verify the production email sender and recovery delivery.
- [ ] Establish an operator name, monitored support contact, retention policy,
      incident handling, database recovery objectives and deletion procedures.
- [ ] Review privacy, terms, support and deletion pages for accuracy and publish
      their final public URLs. Development drafts are insufficient.
- [ ] Verify password changes, session revocation, password-reset replay and
      confirmed account deletion against the deployed configuration.
- [ ] Confirm logs and monitoring exclude credentials, session tokens, merchant
      names, transaction notes and request bodies.

## Android and Play preparation

- [ ] Set final application identity and release version, signing ownership and
      secure signing-key backup. Generate and inspect a signed AAB.
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

No Play upload/publication, signed release, closed test, native device QA or live
billing activation is performed merely by maintaining this checklist.
