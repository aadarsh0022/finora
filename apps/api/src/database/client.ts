import { createHash } from 'node:crypto';
import { MongoClient, type Db, type IndexDescription } from 'mongodb';
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
  const indexes: Record<string, IndexDescription[]> = {
    users: [
      { key: { id: 1 }, unique: true },
      { key: { email: 1 }, unique: true },
      { key: { resetHash: 1 }, unique: true, sparse: true },
    ],
    sessions: [
      { key: { userId: 1, id: 1 }, unique: true },
      { key: { accessHash: 1 }, unique: true },
      { key: { refreshHash: 1 }, unique: true },
      { key: { usedRefreshHashes: 1 } },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
    ],
    rate_limits: [
      { key: { key: 1 }, unique: true },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
    ],
    assistant_usage: [
      { key: { userId: 1, day: 1 }, unique: true },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
    ],
    assistant_feedback: [
      { key: { userId: 1, answerId: 1 }, unique: true },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
    ],
    assistant_threads: [{ key: { id: 1 }, unique: true }, { key: { userId: 1, updatedAt: -1 } }],
    assistant_messages: [
      { key: { userId: 1, chatId: 1, id: 1 }, unique: true },
      { key: { userId: 1, chatId: 1, sequence: -1 } },
    ],
    assistant_proposals: [
      { key: { userId: 1, id: 1 }, unique: true },
      { key: { userId: 1, chatId: 1, status: 1 } },
    ],
  };
  const ownedCollections = [
    'accounts',
    'categories',
    'transactions',
    'debts',
    'debt_events',
    'emi_loans',
    'emi_payments',
    'emi_extra_payments',
    'emi_income_periods',
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
  for (const name of ownedCollections)
    indexes[name] = [{ key: { userId: 1, id: 1 }, unique: true }];
  indexes.transactions!.push(
    { key: { userId: 1, date: -1, id: 1 } },
    { key: { userId: 1, accountId: 1, date: -1 } },
    { key: { userId: 1, destinationAccountId: 1, date: -1 } },
    { key: { userId: 1, categoryId: 1, date: -1 } },
    { key: { userId: 1, amountSort: 1, id: 1 } },
  );
  indexes.categories!.push({
    key: { userId: 1, defaultKey: 1 },
    unique: true,
    partialFilterExpression: { defaultKey: { $type: 'string' } },
  });
  indexes.import_previews!.push({ key: { expiresAt: 1 }, expireAfterSeconds: 0 });
  indexes.debt_events!.push({ key: { userId: 1, debtId: 1, date: -1 } });
  // One payment per loan and month; payment history is read per loan.
  indexes.emi_payments!.push({ key: { userId: 1, loanId: 1, monthKey: 1 }, unique: true });
  indexes.emi_extra_payments!.push({ key: { userId: 1, loanId: 1 } });
  indexes.monthly_budget_limits!.push({ key: { userId: 1, month: 1 }, unique: true });
  // One command per collection. Independent collections initialize concurrently;
  // the shared connection pool bounds network concurrency. Every caller still waits
  // for all required uniqueness/TTL indexes before serving authenticated requests.
  // The definitions are fingerprinted and the fingerprint is stored once they are applied. A new
  // server instance reads that single marker instead of re-issuing ~20 createIndexes commands,
  // which made every cold start slow. Changing any definition changes the fingerprint, so the
  // indexes are applied again on the next start. Callers still wait before serving requests.
  const fingerprint = createHash('sha256').update(JSON.stringify(indexes)).digest('hex');
  const meta = db.collection<{ _id: string; fingerprint: string }>('schema_meta');
  const applied = await meta.findOne({ _id: 'indexes' });
  if (applied?.fingerprint === fingerprint) return;
  await Promise.all(
    Object.entries(indexes).map(([name, definitions]) =>
      db.collection(name).createIndexes(definitions),
    ),
  );
  await meta.updateOne({ _id: 'indexes' }, { $set: { fingerprint } }, { upsert: true });
}

export async function closeDatabase() {
  await state.finoraConnection?.client.close();
  delete state.finoraConnection;
}
