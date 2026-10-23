import { MongoClient, type Db } from 'mongodb';
import { getEnv } from '../config/env';
import type { RateLimitRecord, SessionRecord, UserRecord } from './models';

type Connection = {
  key: string;
  client: MongoClient;
  ready: Promise<MongoClient>;
  indexes?: Promise<void>;
};
const state = globalThis as typeof globalThis & { finoraConnection?: Connection };

export async function database() {
  const env = getEnv();
  const key = `${env.MONGODB_URI}|${env.MONGODB_DB}`;
  let connection = state.finoraConnection;
  if (!connection || connection.key !== key) {
    if (connection) await connection.client.close();
    const client = new MongoClient(env.MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
    connection = { key, client, ready: client.connect() };
    state.finoraConnection = connection;
  }
  try {
    const client = await connection.ready;
    const db = client.db(env.MONGODB_DB);
    connection.indexes ??= ensureIndexes(db);
    await connection.indexes;
    return {
      client,
      db,
      users: db.collection<UserRecord>('users'),
      sessions: db.collection<SessionRecord>('sessions'),
      rateLimits: db.collection<RateLimitRecord>('rate_limits'),
    };
  } catch (error) {
    if (state.finoraConnection === connection) delete state.finoraConnection;
    await connection.client.close();
    throw error;
  }
}

async function ensureIndexes(db: Db) {
  await db.collection('users').createIndexes([
    { key: { id: 1 }, unique: true },
    { key: { email: 1 }, unique: true },
    { key: { resetHash: 1 }, unique: true, sparse: true },
  ]);
  await db
    .collection('sessions')
    .createIndexes([
      { key: { userId: 1, id: 1 }, unique: true },
      { key: { accessHash: 1 }, unique: true },
      { key: { refreshHash: 1 }, unique: true },
      { key: { usedRefreshHashes: 1 } },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
    ]);
  await db.collection('rate_limits').createIndexes([
    { key: { key: 1 }, unique: true },
    { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
  ]);
  const ownedCollections = [
    'accounts',
    'categories',
    'transactions',
    'debts',
    'debt_events',
    'budgets',
    'monthly_budget_limits',
    'savings_goals',
    'recurring_rules',
    'recurring_occurrences',
    'preferences',
    'entitlements',
    'audit_events',
    'idempotency_records',
    'import_previews',
  ];
  for (const name of ownedCollections) {
    await db.collection(name).createIndex({ userId: 1, id: 1 }, { unique: true });
  }
  await db
    .collection('transactions')
    .createIndexes([
      { key: { userId: 1, date: -1, id: 1 } },
      { key: { userId: 1, accountId: 1, date: -1 } },
      { key: { userId: 1, destinationAccountId: 1, date: -1 } },
      { key: { userId: 1, categoryId: 1, date: -1 } },
      { key: { userId: 1, amountSort: 1, id: 1 } },
    ]);
  await db
    .collection('categories')
    .createIndex(
      { userId: 1, defaultKey: 1 },
      { unique: true, partialFilterExpression: { defaultKey: { $type: 'string' } } },
    );
  await db.collection('import_previews').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db.collection('debt_events').createIndex({ userId: 1, debtId: 1, date: -1 });
  await db
    .collection('monthly_budget_limits')
    .createIndex({ userId: 1, month: 1 }, { unique: true });
}

export async function closeDatabase() {
  await state.finoraConnection?.client.close();
  delete state.finoraConnection;
}
