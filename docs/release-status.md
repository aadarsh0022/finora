# Release status — 21 October 2026

Finora is an engineering release candidate. It is not publicly released or fully
verified for production. Billing remains disabled.

## Verified artifacts

- Clean source revision: `d9fe5bd680730a1e5abe849a455193a8882250fb`.
- Android identity: `app.finora.money`, version `0.1.0`, version code `1`.
- Signed AAB: `.local/android-release/finora-release.aab` (63.3 MiB).
  SHA-256: `2d3808f2fde8d834e534b8130bcf70ceb9cdd025119df2b98bb8710ec395d1fd`.
- Standalone signed APK: `.local/android-release/finora-release.apk` (93.6 MiB).
  SHA-256: `4da388a47f9dad0a450c3444539a841a3748d177a2f7c469d1ac101eafe06bbb`.
- AAB JAR signature, Google bundletool 1.18.3 validation and APK signature passed;
  both signers match the private non-debug upload certificate. Provenance and
  validation records stay with the ignored local artifacts.
- Actual manifest: minimum API 24, target API 36, automatic backup disabled,
  no enabled debug/cleartext flags. Permissions comprise internet/network/Wi-Fi
  state, optional biometric/fingerprint use and an app-scoped receiver permission.
  No camera, microphone, contacts, location or broad storage permission is present.
- Compared local server secrets and upload-key passwords against 2,639 uncompressed
  AAB/APK entries: no matches. Cloud-only secrets were not retrieved for this scan.
- The standalone APK installed and cold-launched on `Pixel_8_Pro` (Android API 37)
  without Metro. It remained running, with zero captured AndroidRuntime fatal or
  ReactNativeJS error lines for its process during the startup check. This is a
  launch smoke check, not authenticated, visual or physical-device verification.

`pnpm check` passed 92 Vitest tests and 37 native component tests, strict types,
lint and formatting. API production build and GitHub CI passed. These checks do
not substitute for authenticated native workflows or a security certification.

## Hosted services and Play draft

The API at https://finora-api-olive.vercel.app passes its live Atlas health check.
Hosted /privacy, /terms, /support, /delete-account and /recover-account return 200;
unauthenticated account reads return 401. Mobile public links use this hosted origin.
Production uses the separate `finora_production` database, without migrating local data.

Resend verified the sending subdomain and its TLS-enforced sender is configured.
The authorized branded support inbox and receiving MX exist. Actual recovery
delivery and support-inbox monitoring remain operational gates.

The owner authorized only creation of a free Finora Play draft and accepted its
two creation declarations. Draft app ID: `4975403263611892390`. The hosted privacy
URL was entered and Save was clicked; persistence still needs verification after
browser control reconnects. No release upload, tester invitations, rollout or
public publication occurred. Chrome lists the dashboard but browser controls
cannot currently attach to it.

## Remaining external release gates

- Finish truthful Play setup, Data safety, reviewer access, rating and listing;
  obtain actual release screenshots and enroll Play signing as required.
- Verify recovery delivery, support operations, restricted Atlas application and
  migration roles, provider retention, key backup and database restore procedures.
- Complete authenticated native workflows, physical-device, accessibility,
  offline/retry, export/restore and biometric checks against the intended environment.
- Resolve the owner's personal-identity privacy requirement before any public
  submission. App branding alone cannot change Google's developer-profile disclosures.
- Finora's Console shows zero opted-in testers and requires at least 12 continuously
  opted in for 14 days before applying for production access. Recruitment, elapsed
  testing, production eligibility and Google's review cannot be completed by a build.
- Three upstream tooling advisories remain documented in dependency-review.md.

Never publish to Play or activate billing under this repository's current rules.
