import { randomUUID } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { closeDatabase, database } from '../src/database/client';
import { GET, POST, PATCH, DELETE } from '../app/api/v1/[...path]/route';
import { type ApiResponse, type SessionTokens, sessionTokensSchema } from '@finora/contracts';

let replica: MongoMemoryReplSet;
export async function setupDatabase() {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replica.getUri();
  process.env.MONGODB_DB = `finora_test_${randomUUID().replaceAll('-', '')}`;
  process.env.APP_URL = 'http://localhost:3000';
  process.env.EMAIL_TRANSPORT = 'local';
  process.env.TRUST_PROXY = 'false';
  process.env.RATE_LIMIT_SECRET = 'test-only-32-byte-rate-limit-secret-value';
  await database();
}
export async function clearDatabase() {
  const { db } = await database();
  for (const collection of await db.collections()) await collection.deleteMany({});
}
export async function teardownDatabase() {
  await closeDatabase();
  await replica?.stop();
}

export async function call<T = unknown>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  token?: string,
  extraHeaders?: Record<string, string>,
) {
  const headers = new Headers({ 'Content-Type': 'application/json', ...extraHeaders });
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const request = new Request(`http://localhost:3000/api/v1/${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const response = await { GET, POST, PATCH, DELETE }[method](request);
  const json = (await response.json()) as ApiResponse<T>;
  return { status: response.status, json, headers: response.headers };
}
export const password = 'correct horse battery staple';
export async function createUser(email = 'one@example.com'): Promise<SessionTokens> {
  const response = await call('POST', 'auth/register', { email, password, name: 'Test User' });
  if (!response.json.success) throw new Error(`Registration failed: ${response.json.error.code}`);
  return sessionTokensSchema.parse(response.json.data);
}
