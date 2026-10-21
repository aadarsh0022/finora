# Setup and deployment

Node 24, pnpm 12.4.1; pnpm install --frozen-lockfile. Native build approvals are in
pnpm-workspace.yaml. MongoDB test download occurs on demand, not postinstall.
Expo SDK 58 supports the isolated linker. TypeScript 6.0.3 is the compatible choice
for typescript-eslint 8.72 (<6.1); newest TypeScript 7 is outside that peer range.
Native package versions were selected with expo install and pinned in the lockfile.

API: copy server variables from .env.example to apps/api/.env.local. This workstation
already has the user's verified Atlas settings there. To import a downloaded Atlas
env file: pnpm exec tsx scripts/configure-atlas.ts <path>. It refuses to overwrite
existing configuration. Use distinct databases/credentials per environment.

Run pnpm dev:api (port 3000). Production build: pnpm build:api; serve with
pnpm --filter @finora/api start and appropriate runtime environment.

Disposable alternative: pnpm db:local in another terminal; copy ignored
.local/development.env to apps/api/.env.local deliberately. Its data disappears
when stopped. Do not accidentally replace working Atlas settings.

Production requires Atlas replica set, restricted DB credential, HTTPS APP_URL,
random 32+ character RATE_LIMIT_SECRET, and TRUST_PROXY=true behind a proxy verified
to replace forwarded client-IP headers. Email uses EMAIL_TRANSPORT=resend with a
RESEND_API_KEY and EMAIL_FROM on a verified domain. For hosted testing while email
setup is deferred, explicitly set EMAIL_TRANSPORT=disabled: authentication and
finance remain usable, but recovery uniformly returns RECOVERY_UNAVAILABLE without
creating a reset token. Local outbox delivery remains prohibited in production.

The user-selected deployment is https://finora-api-olive.vercel.app (Vercel project
finora-api, repository root apps/api). Its public mobile origin is recorded in
.env.example. On 21 October 2026 its /api/health returned HTTP 200 after an Atlas
ping; unauthenticated account reads returned 401. Repeat health verification after
each configuration/redeployment; a static homepage does not prove connectivity.
Use MONGODB_DB=finora_production for isolated hosted data. Changing the database does
not migrate local users or financial records. On 21 October 2026 the user authorized
Resend sending from finora.aadarshx.in; its three DNS records were added in Hostinger
and Resend reports the domain verified. EMAIL_FROM is
`Finora <no-reply@finora.aadarshx.in>`; EMAIL_TRANSPORT=resend is configured in
production. The subsequent deployment passed its health check; email delivery and
complete recovery still need an end-to-end test.
Resend requires TLS delivery for this subdomain; open/click tracking is not enabled.

Public app links are pinned to the hosted Vercel origin even during local API
development. The website supplies /privacy, /terms, /support, /recover-account,
/reset-password and /delete-account. Website deletion uses validated credentials,
explicit DELETE confirmation and a temporary bearer session kept only in memory;
it shares the existing user-scoped deletion API and attempts session revocation
on failure. The public support address is support@finora.aadarshx.in; its Resend
inbox was created with owner authorization and receiving DNS was added separately.
The owner must monitor it and verify delivery before public release.

Mobile: put public EXPO_PUBLIC_API_URL in apps/mobile/.env.local. Emulator uses
http://10.0.2.2:3000; devices use a reachable LAN address or deployed HTTPS endpoint.
Run pnpm dev:mobile. SDK 58 initially needs a development build while Expo Go rolls
out. pnpm --filter @finora/mobile android generates/runs a local debug build.
Android SDK, adb and a supported JDK are required. The default Java is 11, but the
installed Android Studio JBR provides Java 25. Use its JDK for SDK 58's Gradle 9.4.1
build. Native prebuild and an initial four-ABI debug APK build passed. The first wrapper download timed out; the official
Gradle archive was downloaded and checked against its published SHA-256 to retry.
A later Pixel 8 Pro boot, APK installation and native React startup succeeded.
On 21 October 2026 Metro restarted with the hosted HTTPS origin, reopened the app
on Pixel 8 Pro and completed its Android bundle without observed runtime errors.
Full authenticated native workflows and physical-device QA remain unverified.

Native commands from apps/mobile: `pnpm exec expo prebuild --platform android`,
then from android/ run `gradlew.bat app:assembleDebug` with JAVA_HOME set to the
supported JDK and ANDROID_HOME to the SDK path. Release AAB requires real HTTPS API
configuration and separately managed signing; never ship the emulator HTTP URL.
The release client rejects HTTP origins. Files are selected through Android's system
picker; broad storage/overlay/vibration permissions are blocked. Android automatic
application backup is disabled; private manual JSON export remains available.

Adaptive/monochrome icons and light/dark splash assets are configured. Verify their
deterministic output with `node scripts/generate-brand.mjs --check`.
Use [the release workflow](android-build.md) to generate/validate a private upload
key and build a signed AAB once the actual HTTPS API is deployed. A local private
key has been generated under ignored `.local/android-signing`; back up both private
files securely. The release guard rejects missing inputs, HTTP and debug keys.
AAB generation, native QA, package ownership and Play Console/closed testing remain
gates. Never commit signing credentials.
