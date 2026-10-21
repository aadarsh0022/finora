# Local Android release build and signing

This workflow produces a local signed AAB. It never uploads, publishes to Play,
activates billing or invents a backend URL. A working deployed production HTTPS API,
release signing identity, native dependencies and device QA are required before a
release can be considered ready. JavaScript export is not a signed native build.

## Inputs and installation

Use the repository's pinned pnpm version and run `pnpm install --frozen-lockfile`.
Install Android SDK/NDK components required by the generated Expo SDK 58 project
and set `ANDROID_HOME` or Android's ignored `local.properties`. Set `JAVA_HOME` to
a supported JDK 17 or newer; the system Java 11 is insufficient. Android Studio's
bundled JDK can be used when compatible with the pinned Gradle/Android plugin.
The Gradle wrapper and lockfile determine build dependencies. Network access to
their official distribution repositories is required.

Set `EXPO_PUBLIC_API_URL` in this process to the **actual deployed API origin**.
The release workflow rejects missing URLs, HTTP, literal IP/emulator addresses,
localhost/private host suffixes, placeholder domains, credentials, paths, query
parameters and fragments. It requires a successful TLS-verified, non-redirecting
`GET /api/health` response with Finora's healthy response shape. No example or
temporary emulator URL is substituted. `EXPO_PUBLIC_` values are public bundle
configuration; never place signing passwords or API credentials in such variables.

## Upload key generation

From a PowerShell terminal at the repository root:

```powershell
./scripts/build-android.ps1 -Mode generate-key
```

This generates a new RSA 4096-bit PKCS12 upload key with SHA256 signatures and
cryptographically random passwords. It writes the key and credentials only to
`.local/android-signing/upload.p12` and `.local/android-signing/credentials.json`.
The existing `.local/` ignore rule excludes both. Existing signing identities are
never overwritten. Windows directory inheritance is restricted to the current
user and SYSTEM before the files are created; Unix uses owner-only modes. The
private key's passwords are passed through temporary child-process environment
variables and keytool's `:env` options, never command-line values or console output.

Back up both private files securely outside the checkout. They are not committed
or included in any AAB. Keep the same identity for subsequent updates; generation
is not a way to replace an existing Play upload key. This command generates only a
local identity and does not register it with Play or prove merchant eligibility.

## Existing signing inputs

The default generated credentials file is used automatically. Alternatively, supply
all four process environment variables from your secret manager:

- `FINORA_ANDROID_KEYSTORE`: an existing absolute keystore file path.
- `FINORA_ANDROID_KEY_ALIAS`: the release upload alias.
- `FINORA_ANDROID_STORE_PASSWORD`: at least 12 characters.
- `FINORA_ANDROID_KEY_PASSWORD`: at least 12 characters.

An explicit private JSON file with these four keys can be selected with
`-CredentialsFile <absolute-path>`. Choose environment inputs or a file; they are
not mixed. Restrict an external credentials file's filesystem permissions yourself
(Unix files must be owner-readable only). Never commit such a file or paste its
contents into a terminal transcript/chat. Android debug aliases and certificates,
expired certificates, weak RSA keys and incorrect passwords are rejected. The
private-key password is exercised by signing a temporary in-memory certificate
request; no private key is exported.

## Validate and build

After providing the actual API origin and signing inputs:

```powershell
./scripts/build-android.ps1 -Mode validate
./scripts/build-android.ps1 -Mode build
```

Build runs Expo prebuild with `--platform android --no-install`, then the generated
wrapper's `bundleRelease`. It sets production mode and disables dotenv loading so
an unnoticed local `.env` cannot replace the verified API origin. It does not use
`prebuild --clean`; the installed Expo version can still regenerate the ignored
Android directory during normal prebuild. Keep native customizations in tracked
config plugins and back up any manual native edits before running it. The app config includes
`./plugins/with-release-signing.cjs`, which removes Expo's generated release/debug
signing fallback and reapplies the tracked
`apps/mobile/plugins/android-release-signing.gradle` on every prebuild. A changed
unrecognized Expo signing template fails closed and requires plugin review.

The Gradle guard independently checks HTTPS/API input, absolute keystore path,
passwords, certificate validity, private key access, debug key rejection and the
release signing configuration for every release task. Debug development builds
continue to use the generated development key; it is never selected for release.
No secret values are written to Gradle properties or generated source files.

After building, the workflow verifies the AAB JAR signature and confirms the signer
certificate matches the supplied upload key. It copies the result to
`.local/android-release/finora-release.aab` and writes `manifest.json` containing
artifact/certificate hashes, Git revision, whether tracked changes were present,
lockfile hash, Node/JDK versions, API origin and build time. These outputs are
ignored and stay local. Review a dirty-tree manifest before sharing an artifact.
The workflow reproduces declared inputs and records provenance; it does not claim
byte-identical AABs across timestamps, toolchain installations or platforms.

Signing tool output is captured and withheld on failure so a native tool cannot
accidentally print secret material. Diagnose missing inputs, supported JDK/SDK,
network access, private file permissions and API health first. Do not turn on
Gradle debug logging with signing secrets present.

## Verification and remaining gates

`packages/config/tests/android-release.test.ts` checks URL and signing-input rejection,
keeps development signing separate and verifies plugin transformation/idempotency
and template-change failure. Native prebuild/Gradle guard checks should also run
against the installed generated project. A signed release AAB can only be claimed
after the actual command succeeds with a real API and upload key. Signed-device
QA, native privacy/biometric behavior, support/legal configuration, closed testing,
Play signing enrollment and store review remain separate gates.

Verified locally: Expo prebuild reapplied the tracked release configuration; a
missing-input Gradle validation task and an HTTP-input `bundleRelease` both failed
at the Finora guard. Private upload-key generation succeeded with restricted
Windows ACLs and ignored files. On 21 October 2026 the signed release command
succeeded from clean revision `d9fe5bd`, using the hosted HTTPS API and the private
non-debug upload key. Google bundletool validated the AAB; a standalone APK was
generated and its signer verified. Actual manifest and secret-comparison evidence,
artifact hashes and remaining gates are recorded in [release status](release-status.md).
The owner subsequently uploaded the AAB to Play. Version 1 (0.1.0) was accepted and
saved as an internal draft, with a no-testers warning. No release was published.

References: [Expo config plugin mods](https://docs.expo.dev/config-plugins/mods/),
[Expo local plugins](https://docs.expo.dev/config-plugins/plugins/),
[Android app signing](https://developer.android.com/studio/publish/app-signing).
