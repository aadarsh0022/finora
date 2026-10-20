import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const secrets = new Set<string>();
const localEnv = join(root, 'apps/api/.env.local');
if (!existsSync(localEnv))
  throw new Error('Local server configuration is required for this check.');
for (const line of readFileSync(localEnv, 'utf8').split(/\r?\n/)) {
  const match = /^([A-Z_]+)=(.*)$/.exec(line);
  if (!match || !/SECRET|PASSWORD|API_KEY|MONGODB_URI/.test(match[1]!)) continue;
  const value = match[2]!.trim().replace(/^(['"])(.*)\1$/, '$2');
  if (value.length >= 12) secrets.add(value);
  if (match[1] === 'MONGODB_URI') {
    const password = decodeURIComponent(new URL(value).password);
    if (password.length >= 12) secrets.add(password);
  }
}
if (!secrets.size) throw new Error('No configured secrets were available to compare.');
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  {
    cwd: root,
    encoding: 'utf8',
  },
)
  .split('\0')
  .filter(Boolean)
  .map((file) => join(root, file));
function appendFiles(directory: string) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) appendFiles(path);
    else if (entry.isFile()) files.push(path);
  }
}
appendFiles(join(root, 'apps/mobile/dist'));
const matches: string[] = [];
for (const file of new Set(files)) {
  if (!existsSync(file)) continue;
  const bytes = readFileSync(file);
  if ([...secrets].some((secret) => bytes.includes(Buffer.from(secret))))
    matches.push(relative(root, file));
}
if (matches.length) {
  console.error('Configured server secrets were found in:', matches.join(', '));
  process.exitCode = 1;
} else
  console.info(`No configured server secrets found in ${new Set(files).size} source/bundle files.`);
