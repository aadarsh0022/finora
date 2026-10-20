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
EMAIL_TRANSPORT=resend, RESEND_API_KEY from Resend, EMAIL_FROM on a verified domain,
random 32+ character RATE_LIMIT_SECRET, and TRUST_PROXY=true behind a proxy verified
to replace forwarded client-IP headers. No paid services or deployment are activated.

Mobile: put public EXPO_PUBLIC_API_URL in apps/mobile/.env.local. Emulator uses
http://10.0.2.2:3000; devices use a reachable LAN address or deployed HTTPS endpoint.
Run pnpm dev:mobile. SDK 58 initially needs a development build while Expo Go rolls
out. pnpm --filter @finora/mobile android generates/runs a local debug build.
Android SDK, adb and a supported JDK are required. This machine has Java 11; native
build verification is pending a supported JDK. Bundling alone is not native QA.

Release signing, launcher assets, AAB generation, package-name ownership and Play
Console/closed testing remain release gates. Never commit signing credentials.
