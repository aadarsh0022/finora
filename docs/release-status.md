# Release status — 22 October 2026

Finora is a testing release candidate, not a public production release. Billing
remains disabled. Public production access is locked by Google’s testing criteria.

## Validated replacement build

- Source revision: `49b697bd75ffe612cbb078ba508edb9d022df9c6`; tracked tree clean at build time: `true`.
- Android identity: `app.finora.money`, version `0.1.1`, version code `2`.
- Signed AAB: `.local/android-release/finora-release.aab`.
  SHA-256: `b891ba63530432359b3fca0fd6a83cfda59217e4ac8db44f433ed4f75dc57d85`.
- Signed standalone APK: `.local/android-release/finora-release.apk`.
  SHA-256: `30c959838a93c6f80da9efd80983e21b6f288fb60fa0aa660f909dfd2bfe6eb1`.
- JAR signature, Google bundletool validation and APK signer verification passed.
  The signer matches the private non-debug upload key. The manifest disables
  automatic backup and enabled debug/cleartext flags; minimum API 24, target API 36.
- Version 1 is superseded: emulator QA found a sign-out navigation loop. Version 2
  uses explicit guarded-route destinations. Actual Expo Router tests reproduce
  the old loop and verify sign-out/login and unauthorized deep-link routing.
- `pnpm check` passed 97 Vitest tests plus 39 native tests (136 total), strict
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

The owner supplied four tester addresses. A private “Finora initial testers” list
is configured for internal and closed testing, with branded support feedback.
No invitation email was sent by the agent. Worldwide closed-test targeting is
saved: 178 countries/regions, with English (United States) as the listing language.
Tester-list membership is not an opt-in and does not start the fourteen-day clock.

## Remaining gates

- See the current Play Console for submission/review status. A saved draft or
  submission is not approval or tester availability. The closed-test release must
  be approved and testers must explicitly opt in.
- Google requires at least 12 testers opted in continuously for 14 days before
  applying for production access. Four addresses are configured; zero closed-test
  opt-ins were observed before submission. At least eight more testers are needed.
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
Managed publishing is off. Google review remains pending; tester availability is
not yet confirmed. The public production track has not been released.
