# Release status — 23 October 2026

Finora is a testing release candidate, not a public production release. Billing
remains disabled. Public production access is locked by Google’s testing criteria.

## Validated replacement build

- Source revision: `be8e326819643b67075c30fc1322c1548c146860`; tracked tree clean at build time: `true`.
- Android identity: `app.finora.money`, version `0.1.2`, version code `3`.
- Signed AAB: `.local/android-release/finora-release.aab`.
  SHA-256: `ec7860fcc11139fd97a51e16242818ff3cd960b49bebff2766c0805ae0f4f71c`.
- Signed standalone APK: `.local/android-release/finora-release.apk`.
  SHA-256: `79bbfe5f4838c125c31d5c095b539a071b6c98bde8bcb39ceb8c2d253d8437d1`.
- JAR signature, Google bundletool validation and APK signer verification passed.
  The signer matches the private non-debug upload key. The manifest disables
  automatic backup and enabled debug/cleartext flags; minimum API 24, target API 36.
- Version 1 is superseded: emulator QA found a sign-out navigation loop. Version 2
  uses explicit guarded-route destinations. Actual Expo Router tests reproduce
  the old loop and verify sign-out/login and unauthorized deep-link routing.
- Version 3 opens registration first for signed-out users, uses accessible static
  skeleton page loaders and preserves cached content during background refresh.
  Native Pixel 8 Pro checks verified cold signed-out entry, switching to sign-in,
  hosted demo authentication, sign-out and Home/Transactions/Reports reads.
  The reviewer instructions explain the new entry screen. SQLite persistence and
  an offline mutation queue remain unimplemented; financial reads cache in memory.
- `pnpm check` passed 97 Vitest tests plus 41 native tests (138 total), strict
  TypeScript, lint and formatting. GitHub CI passed for this source revision.
- Build provenance, signature checks and private native QA evidence remain in
  ignored local directories. No credentials or actual user financial records are
  part of store assets or release documentation.

## Hosted services and email

The production API at https://finora-api-olive.vercel.app passes its Atlas health
check. Privacy, terms, support, account deletion and recovery pages are hosted
there. Mobile public links use this origin. Application data uses
`finora_production`; local development uses `finora_development`.

Resend sending and branded support receiving are verified. An authorized recovery
test reached the support inbox. A failed owner recovery was traced to the profile
existing only in development. The explicitly approved insert-only profile copy
preserved the password and records, excluded sessions/reset tokens and verified
exact values before commit. The subsequent owner recovery showed Delivered in
Resend. This confirms delivery acceptance, not Gmail inbox placement or completion
of a password reset. See profile-copy.md and deployment.md.

## Play preparation

App ID: `4975403263611892390`. All eleven app-information/listing setup tasks are
saved: privacy, reviewer access, no ads, IARC rating, adult audience, Data safety,
non-government, financial features, no health features, Finance category/contact
and English listing. The owner accepted the creation and IARC agreements and
approved sharing the dedicated, non-admin reviewer credentials with Google.

The listing contains the original Finora icon/feature graphic and six real Android
screenshots captured with a synthetic review account. Screenshots are 1080×1920,
9:16; the emulator display override is used for an actual app render, not a mockup.
The unchanged screen designs were captured from version 1 before the navigation
fix. Only the AI-assisted icon and feature graphic carry the artwork declaration.
See play-declarations.md for data-handling rationale.

The owner supplied tester addresses. A private “Finora initial testers” list
is configured for internal and closed testing, with branded support feedback.
No invitation email was sent by the agent. Worldwide closed-test targeting is
saved: 178 countries/regions, with English (United States) as the listing language.
Tester-list membership is not an opt-in and does not start the fourteen-day clock.

## Remaining gates

- See the current Play Console for submission/review status. A saved draft or
  submission is not approval or tester availability. The closed-test release must
  be approved and testers must explicitly opt in.
- Google requires at least 12 testers opted in continuously for 14 days before
  applying for production access. Use the live dashboard for the current opt-in
  count; email-list membership and app registrations are separate measurements.
- Resolve the owner’s personal-identity privacy requirement before public release.
  App/package branding does not override Google developer-profile disclosures.
- Complete physical-device, accessibility, offline/retry, biometric and full
  export/restore QA; automated tests do not establish those outcomes.
- Establish ongoing support monitoring, least-privilege Atlas application/migration
  roles, verified provider retention, database restore procedures and secure
  off-machine signing-key recovery. Three upstream tooling advisories remain in
  dependency-review.md. No security certification or complete production readiness
  is claimed.

The owner explicitly authorized a testing release after the earlier draft-only
restriction. Public production publication and billing remain outside this release.

## Closed-testing submission

On 22 October 2026, Play Console's Publishing overview visibly confirmed
“Changes in review” for Closed testing – Alpha, release 2 (0.1.1), with worldwide
country targeting, the four-person tester list, store listing and declarations.
Managed publishing was off and review was pending at that initial submission.
The public production track has not been released.

Later on 22 October, version 2 was visibly available to selected testers in the
active Alpha track. At the owner's request, version 3 (0.1.2) was rebuilt and
verified from the clean source revision above and uploaded to the same closed
test. Google accepted the bundle and its automated pre-review checks completed.
The saved reviewer instructions were verified to describe the signup-first flow.

Version 3 initially remained unsubmitted. Confirming Send changes for
review repeatedly closed the dialog but left the release under Changes not yet
submitted for review, including after reload and keyboard activation. The owner
confirmed the same result from a manual click. Submission activity still showed
only the original published submission; no new review record was created. No
error or blocking policy issue was displayed. Private historical evidence:
`.local/deployment/play-version-3-ready-not-submitted.png`.

An initial 23 October check still showed version 3 as Not yet sent for
review and version 2 as Available to selected testers. The owner-requested tester
list addition was verified, bringing the allowed email list to nine addresses;
the opt-in/download instructions were sent to the requested address. This does
not establish a new opted-in tester count or successful version 3 publication.

A subsequent refreshed Publishing overview on 23 October visibly confirmed
**Changes in review** for Closed testing - Alpha, release 3 (0.1.2), including the
updated sign-in instructions. Submission is now verified and managed publishing
is off. Approval and availability of version 3 remain pending; version 2 is the
previous available testing release. Private evidence:
`.local/deployment/play-version-3-in-review.png`.

## Current assistant and onboarding release preparation

The owner authorized pushing the pending Finora AI, transaction-draft, onboarding,
branding and native-notification changes on 23 October. The signed Play version
is still 0.1.2/code 3; no version increment, new signed AAB, upload or testing
publication has been completed for this feature set. The local Android export
and 90 native tests pass; local API tests/build are blocked by Windows Application
Control denying the argon2 native module. The hosted API must be updated and
verified with the new endpoints and current privacy disclosure before a matching
mobile testing release can be considered ready. See testing.md for scoped checks.

## Closed-testing update preparation, version 0.2.0

The owner explicitly requested a testing release and authorized pushing the new
features. Version 0.2.0/code 4 preserves package app.finora.money and the existing
upload key. GitHub Actions run 39998745702 passed the full check (146 core/API
and 90 native tests), API production build, Expo dependency check and Android
export for 19404f7. The Windows argon2 restriction is local to this workstation.

The owner reports deploying the updated hosted API and configuring its AI key.
The hosted health endpoint returns 200 and the privacy page contains the OpenAI
disclosure. Play Console currently serves 0.1.2/code 3 to the existing Alpha track
and shows nine opted-in testers. Public production access is still unavailable.
The signed version 4 AAB is being built; no new upload or review submission has
been verified. Browser control currently lists the Play release draft but fails
to attach. Confirm the final artifact and Play status before claiming submission.
