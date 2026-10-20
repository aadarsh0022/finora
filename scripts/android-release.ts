import { spawnSync } from 'node:child_process';
import { randomBytes, createHash, X509Certificate } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { releaseApiOrigin, requireSigningInputs } from './android-release-guards';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mobile = join(root, 'apps', 'mobile');
const privateDirectory = join(root, '.local', 'android-signing');
const defaultCredentials = join(privateDirectory, 'credentials.json');
type Signing = ReturnType<typeof requireSigningInputs>;
class ReleaseStepError extends Error {}
function execute(command: string, args: string[], label: string, env = process.env, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0 || result.error)
    throw new ReleaseStepError(
      `${label} failed. Tool output is withheld to avoid disclosing signing data.`,
    );
  return result.stdout;
}
function packageCommand(args: string[], label: string, env = process.env, cwd = root) {
  return process.platform === 'win32'
    ? execute('cmd.exe', ['/d', '/s', '/c', 'pnpm', ...args], label, env, cwd)
    : execute('pnpm', args, label, env, cwd);
}
function javaTool(name: string) {
  if (!process.env.JAVA_HOME)
    throw new ReleaseStepError(
      'Set JAVA_HOME to a JDK 17 or newer before generating or building release keys.',
    );
  const binary = join(
    process.env.JAVA_HOME,
    'bin',
    `${name}${process.platform === 'win32' ? '.exe' : ''}`,
  );
  if (!existsSync(binary))
    throw new ReleaseStepError('JAVA_HOME does not contain the required JDK tools.');
  return binary;
}
function verifyJava() {
  // java -version writes to stderr, while this property command writes to stdout.
  const result = spawnSync(javaTool('java'), ['-version'], { encoding: 'utf8', windowsHide: true });
  const version = /version "(\d+)/.exec(result.stderr)?.[1];
  if (result.status !== 0 || !version || Number(version) < 17)
    throw new ReleaseStepError('Release tooling requires JDK 17 or newer.');
  return Number(version);
}
function restrictDirectory(path: string) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  if (process.platform === 'win32') {
    const aclEnvironment = { ...process.env };
    // A parent PowerShell 7 module path cannot load Windows PowerShell 5 ACL modules.
    for (const name of Object.keys(aclEnvironment))
      if (name.toLowerCase() === 'psmodulepath') delete aclEnvironment[name];
    execute(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-File',
        join(root, 'scripts', 'android-private-directory.ps1'),
        '-Path',
        path,
      ],
      'Private directory ACL',
      aclEnvironment,
    );
  } else chmodSync(path, 0o700);
}
function signingEnvironment(signing: Signing): NodeJS.ProcessEnv {
  return {
    ...process.env,
    FINORA_ANDROID_KEYSTORE: signing.keystore,
    FINORA_ANDROID_KEY_ALIAS: signing.alias,
    FINORA_ANDROID_STORE_PASSWORD: signing.storePassword,
    FINORA_ANDROID_KEY_PASSWORD: signing.keyPassword,
  };
}
function loadSigning(credentialsPath?: string): Signing {
  const names = [
    'FINORA_ANDROID_KEYSTORE',
    'FINORA_ANDROID_KEY_ALIAS',
    'FINORA_ANDROID_STORE_PASSWORD',
    'FINORA_ANDROID_KEY_PASSWORD',
  ];
  const hasEnvironment = names.some((name) => process.env[name] !== undefined);
  if (hasEnvironment && credentialsPath)
    throw new ReleaseStepError(
      'Choose signing environment variables or a credentials file, not both.',
    );
  if (hasEnvironment) return requireSigningInputs(process.env);
  const path = credentialsPath ? resolve(credentialsPath) : defaultCredentials;
  if (!existsSync(path))
    throw new ReleaseStepError(
      'Signing inputs are missing. Generate a local upload key or supply the four signing environment variables.',
    );
  if (process.platform !== 'win32' && (statSync(path).mode & 0o077) !== 0)
    throw new ReleaseStepError(
      'Signing credentials file must be readable only by its owner (chmod 600).',
    );
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new ReleaseStepError('Cannot read signing credentials.');
  }
  if (typeof raw !== 'object' || raw === null)
    throw new ReleaseStepError('Signing credentials are invalid.');
  const values = raw as Record<string, string | undefined>;
  return requireSigningInputs(values);
}
function certificateFromKey(signing: Signing) {
  const output = execute(
    javaTool('keytool'),
    [
      '-exportcert',
      '-rfc',
      '-keystore',
      signing.keystore,
      '-alias',
      signing.alias,
      '-storepass:env',
      'FINORA_ANDROID_STORE_PASSWORD',
    ],
    'Upload certificate validation',
    signingEnvironment(signing),
  );
  let certificate: X509Certificate;
  try {
    certificate = new X509Certificate(output);
  } catch {
    throw new ReleaseStepError('The upload certificate cannot be read.');
  }
  if (
    /android debug/i.test(certificate.subject) ||
    Date.parse(certificate.validTo) <= Date.now() ||
    Date.parse(certificate.validFrom) > Date.now()
  )
    throw new ReleaseStepError(
      'An expired, future-dated or Android debug certificate cannot sign a release.',
    );
  const key = certificate.publicKey;
  if (!['rsa', 'ec'].includes(key.asymmetricKeyType ?? ''))
    throw new ReleaseStepError('Upload signing keys must use RSA or elliptic curves.');
  if (key.asymmetricKeyType === 'rsa' && (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048)
    throw new ReleaseStepError('RSA upload keys must contain at least 2048 bits.');
  execute(
    javaTool('keytool'),
    [
      '-certreq',
      '-keystore',
      signing.keystore,
      '-alias',
      signing.alias,
      '-storepass:env',
      'FINORA_ANDROID_STORE_PASSWORD',
      '-keypass:env',
      'FINORA_ANDROID_KEY_PASSWORD',
      '-sigalg',
      key.asymmetricKeyType === 'ec' ? 'SHA256withECDSA' : 'SHA256withRSA',
    ],
    'Upload private-key password validation',
    signingEnvironment(signing),
  );
  return certificate;
}
async function checkEndpoint(origin: string) {
  let response: Response;
  try {
    response = await fetch(`${origin}/api/health`, {
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ReleaseStepError(
      'The configured HTTPS API health check is unreachable. Deploy the real backend before building a release.',
    );
  }
  const declared = Number(response.headers.get('content-length'));
  if (!response.ok || (Number.isFinite(declared) && declared > 8192))
    throw new ReleaseStepError('The configured API is not healthy.');
  const reader = response.body?.getReader();
  if (!reader) throw new ReleaseStepError('The API health response is missing.');
  let content = '';
  let size = 0;
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 8192) {
      await reader.cancel();
      throw new ReleaseStepError('The API health response is too large.');
    }
    content += decoder.decode(value, { stream: true });
  }
  let body: unknown;
  try {
    body = JSON.parse(content + decoder.decode());
  } catch {
    throw new ReleaseStepError('The configured origin is not a Finora API.');
  }
  const health = body as { success?: unknown; data?: { status?: unknown } } | null;
  if (health?.success !== true || health.data?.status !== 'ok')
    throw new ReleaseStepError('The configured Finora API is not healthy.');
}
function generateKey() {
  verifyJava();
  if (existsSync(defaultCredentials) || existsSync(join(privateDirectory, 'upload.p12')))
    throw new ReleaseStepError(
      'A local upload key or credentials file already exists. Existing signing identities are never overwritten.',
    );
  restrictDirectory(privateDirectory);
  const password = randomBytes(48).toString('base64url');
  const signing: Signing = {
    keystore: join(privateDirectory, 'upload.p12'),
    alias: 'finora-upload',
    storePassword: password,
    keyPassword: password,
  };
  execute(
    javaTool('keytool'),
    [
      '-genkeypair',
      '-v',
      '-keystore',
      signing.keystore,
      '-storetype',
      'PKCS12',
      '-alias',
      signing.alias,
      '-keyalg',
      'RSA',
      '-keysize',
      '4096',
      '-sigalg',
      'SHA256withRSA',
      '-validity',
      '10000',
      '-dname',
      'CN=Finora Upload',
      '-storepass:env',
      'FINORA_ANDROID_STORE_PASSWORD',
      '-keypass:env',
      'FINORA_ANDROID_KEY_PASSWORD',
      '-noprompt',
    ],
    'Upload key generation',
    signingEnvironment(signing),
  );
  writeFileSync(
    defaultCredentials,
    JSON.stringify({
      FINORA_ANDROID_KEYSTORE: signing.keystore,
      FINORA_ANDROID_KEY_ALIAS: signing.alias,
      FINORA_ANDROID_STORE_PASSWORD: password,
      FINORA_ANDROID_KEY_PASSWORD: password,
    }),
    { flag: 'wx', mode: 0o600 },
  );
  if (process.platform !== 'win32') chmodSync(signing.keystore, 0o600);
  certificateFromKey(signing);
  console.log(
    'Created a private local upload key and credentials under .local/android-signing. Back up both securely; no release was built or published.',
  );
}
async function main() {
  const [mode = 'validate', flag, credentials] = process.argv.slice(2);
  if (
    !['generate-key', 'validate', 'build'].includes(mode) ||
    (flag && flag !== '--credentials') ||
    (flag && !credentials) ||
    process.argv.length > 5
  )
    throw new ReleaseStepError(
      'Use generate-key, validate or build, optionally followed by --credentials <private JSON file>.',
    );
  if (mode === 'generate-key') {
    if (flag)
      throw new ReleaseStepError(
        'Key generation writes only to the ignored local signing directory.',
      );
    generateKey();
    return;
  }
  let origin: string;
  try {
    origin = releaseApiOrigin(process.env.EXPO_PUBLIC_API_URL);
  } catch {
    throw new ReleaseStepError(
      'EXPO_PUBLIC_API_URL is missing or unsafe. Supply the actual deployed HTTPS API origin.',
    );
  }
  const signing = loadSigning(credentials);
  if (!isAbsolute(signing.keystore) || !existsSync(signing.keystore))
    throw new ReleaseStepError('FINORA_ANDROID_KEYSTORE must name an existing absolute file.');
  const javaMajor = verifyJava();
  const expected = certificateFromKey(signing);
  await checkEndpoint(origin);
  console.log('HTTPS API and non-debug upload certificate verified.');
  if (mode === 'validate') return;
  const config = readFileSync(join(mobile, 'app.config.ts'), 'utf8');
  if (!config.includes('./plugins/with-release-signing.cjs'))
    throw new ReleaseStepError('Add the Finora release-signing config plugin before building.');
  const env = {
    ...signingEnvironment(signing),
    EXPO_PUBLIC_API_URL: origin,
    EXPO_NO_DOTENV: '1',
    EXPO_NO_TELEMETRY: '1',
    CI: '1',
    NODE_ENV: 'production',
  };
  console.log('Applying the tracked Expo config plugins.');
  packageCommand(
    ['exec', 'expo', 'prebuild', '--platform', 'android', '--no-install'],
    'Expo Android prebuild',
    env,
    mobile,
  );
  const generated = readFileSync(join(mobile, 'android', 'app', 'build.gradle'), 'utf8');
  if (
    !generated.includes('// Finora release signing: managed by with-release-signing') ||
    /\brelease\s*\{[\s\S]*?signingConfig\s+signingConfigs\.debug\b/.test(generated)
  )
    throw new ReleaseStepError(
      'Generated release signing guard is missing or a debug fallback remains.',
    );
  console.log('Building the signed release AAB; no publishing task will run.');
  const android = join(mobile, 'android');
  const args = ['bundleRelease', '--no-daemon', '--console=plain', '--quiet'];
  if (process.platform === 'win32')
    execute(
      'cmd.exe',
      ['/d', '/s', '/c', 'gradlew.bat', ...args],
      'Gradle signed release build',
      env,
      android,
    );
  else execute(join(android, 'gradlew'), args, 'Gradle signed release build', env, android);
  const output = join(android, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
  if (!existsSync(output))
    throw new ReleaseStepError('Gradle did not produce the expected release AAB.');
  const verification = execute(
    javaTool('jarsigner'),
    ['-J-Duser.language=en', '-J-Duser.country=US', '-verify', output],
    'AAB signature verification',
  );
  if (!verification.includes('jar verified.'))
    throw new ReleaseStepError('The release AAB has no verified JAR signature.');
  const pem = execute(
    javaTool('keytool'),
    ['-printcert', '-jarfile', output, '-rfc'],
    'AAB signer certificate',
  );
  const first = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/)?.[0];
  if (!first || new X509Certificate(first).fingerprint256 !== expected.fingerprint256)
    throw new ReleaseStepError('AAB signer does not match the supplied upload key.');
  const outputDirectory = join(root, '.local', 'android-release');
  restrictDirectory(outputDirectory);
  const aab = readFileSync(output);
  writeFileSync(join(outputDirectory, 'finora-release.aab'), aab, { mode: 0o600 });
  const sha256 = (content: string | Buffer) => createHash('sha256').update(content).digest('hex');
  writeFileSync(
    join(outputDirectory, 'manifest.json'),
    JSON.stringify(
      {
        artifact: 'finora-release.aab',
        sha256: sha256(aab),
        certificateSha256: expected.fingerprint256,
        gitRevision: execute('git', ['rev-parse', 'HEAD'], 'Git revision').trim(),
        trackedChangesPresent:
          execute('git', ['status', '--porcelain', '--untracked-files=no'], 'Git status').trim()
            .length > 0,
        lockfileSha256: sha256(readFileSync(join(root, 'pnpm-lock.yaml'))),
        node: process.version,
        javaMajor,
        apiOrigin: origin,
        builtAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(
    'Verified signed AAB and provenance manifest saved to .local/android-release. No app was published.',
  );
}
main().catch((failure: unknown) => {
  // Never serialize errors from child processes, credentials JSON or signing tools.
  if (failure instanceof ReleaseStepError) console.error(failure.message);
  console.error(
    'Android release workflow stopped: required inputs, endpoint, tools or signing verification failed. Check docs/android-build.md. No publishing was performed.',
  );
  process.exitCode = 1;
});
