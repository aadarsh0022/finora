import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

const source = process.argv[2];
if (!source) throw new Error('Pass the path to the Atlas-downloaded credentials .env file.');
const values = parseEnv(await readFile(source, 'utf8'));
let uri = values.MONGODB_URI;
if (!uri) throw new Error('The downloaded file does not contain MONGODB_URI.');
if (values.MONGODB_USERNAME)
  uri = uri
    .replace('<username>', encodeURIComponent(values.MONGODB_USERNAME))
    .replace('${MONGODB_USERNAME}', encodeURIComponent(values.MONGODB_USERNAME));
if (values.MONGODB_PASSWORD)
  uri = uri
    .replace('<password>', encodeURIComponent(values.MONGODB_PASSWORD))
    .replace('<db_password>', encodeURIComponent(values.MONGODB_PASSWORD))
    .replace('${MONGODB_PASSWORD}', encodeURIComponent(values.MONGODB_PASSWORD));
const parsed = new URL(uri);
if (
  !parsed.hostname.endsWith('.mongodb.net') ||
  !parsed.username ||
  !parsed.password ||
  uri.includes('<')
)
  throw new Error('A complete Atlas connection URI is required.');
const content = `MONGODB_URI=${uri}\nMONGODB_DB=finora_development\nAPP_URL=http://localhost:3000\nEMAIL_TRANSPORT=local\nTRUST_PROXY=false\nRATE_LIMIT_SECRET=${randomBytes(32).toString('hex')}\n`;
// Exclusive write protects existing local configuration from silent replacement.
await writeFile('apps/api/.env.local', content, { mode: 0o600, flag: 'wx' });
console.info(
  'Atlas settings saved to ignored server-only apps/api/.env.local. No secrets printed.',
);
