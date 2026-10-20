import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

// Disposable development data. No connection to Atlas or production databases.
const replica = await MongoMemoryReplSet.create({ replSet: { count: 1, name: 'finora-local' } });
await mkdir('.local', { recursive: true });
await writeFile(
  '.local/development.env',
  `MONGODB_URI=${replica.getUri()}\nMONGODB_DB=finora_development\nAPP_URL=http://localhost:3000\nEMAIL_TRANSPORT=local\nTRUST_PROXY=false\nRATE_LIMIT_SECRET=${randomBytes(32).toString('hex')}\n`,
  { mode: 0o600 },
);
console.info('Disposable MongoDB is running. Local connection settings: .local/development.env');
console.info('Copy that file to apps/api/.env.local. All development data disappears on shutdown.');
async function stop() {
  await replica.stop();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
