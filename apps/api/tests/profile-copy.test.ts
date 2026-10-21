import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Decimal128, MongoClient } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { accountSchema, categorySchema, transactionSchema } from '@finora/contracts';
import { accountBalance } from '@finora/finance-core';
import { database } from '../src/database/client';
import { copyProfile } from '../src/operations/copy-profile';
import {
  call,
  clearDatabase,
  createUser,
  password,
  setupDatabase,
  teardownDatabase,
} from './setup';

let client: MongoClient;
let sourceName: string;
let targetName: string;
beforeAll(async () => {
  await setupDatabase();
  sourceName = process.env.MONGODB_DB!;
  targetName = `${sourceName}_copy`;
  client = await new MongoClient(process.env.MONGODB_URI!).connect();
});
beforeEach(async () => {
  process.env.MONGODB_DB = sourceName;
  await clearDatabase();
  await client.db(targetName).dropDatabase();
  await client.db(targetName).collection('users').createIndex({ email: 1 }, { unique: true });
  await client.db(targetName).collection('users').createIndex({ id: 1 }, { unique: true });
});
afterAll(async () => {
  await client?.close();
  await teardownDatabase();
});

async function fixture() {
  const owner = await createUser('copy@example.com');
  const other = await createUser('other@example.com');
  const source = client.db(sourceName);
  const metadata = {
    userId: owner.user.id,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const accounts = [
    accountSchema.parse({
      ...metadata,
      id: randomUUID(),
      name: 'Cash',
      type: 'CASH',
      currency: 'INR',
      archived: false,
      openingBalanceMinor: '9007199254740993',
    }),
    accountSchema.parse({
      ...metadata,
      id: randomUUID(),
      name: 'Savings',
      type: 'SAVINGS',
      currency: 'INR',
      archived: false,
    }),
  ];
  const categories = ['INCOME', 'EXPENSE'].map((type) =>
    categorySchema.parse({ ...metadata, id: randomUUID(), name: type, type, archived: false }),
  );
  const transactions = [
    { type: 'INCOME', categoryId: categories[0]!.id, amountMinor: '10000' },
    { type: 'EXPENSE', categoryId: categories[1]!.id, amountMinor: '2500' },
    { type: 'TRANSFER', destinationAccountId: accounts[1]!.id, amountMinor: '3000' },
  ].map((entry) =>
    transactionSchema.parse({
      ...metadata,
      id: randomUUID(),
      accountId: accounts[0]!.id,
      currency: 'INR',
      date: new Date().toISOString(),
      ...entry,
    }),
  );
  await source.collection('accounts').insertMany(accounts.map((row) => ({ ...row })));
  await source
    .collection('accounts')
    .insertOne({ ...accounts[1], id: randomUUID(), userId: other.user.id });
  await source
    .collection('categories')
    .insertMany(categories.map((row) => ({ ...row, defaultKey: row.type.toLowerCase() })));
  await source
    .collection('transactions')
    .insertMany(
      transactions.map((row) => ({ ...row, amountSort: Decimal128.fromString(row.amountMinor) })),
    );
  await source
    .collection('users')
    .updateOne(
      { id: owner.user.id },
      { $set: { resetHash: 'a'.repeat(64), resetExpiresAt: new Date(Date.now() + 1800000) } },
    );
  return { owner, other, accounts, transactions };
}

describe('insert-only profile copy against disposable MongoDB', () => {
  it('previews owned records without writing or copying another user', async () => {
    const { owner } = await fixture();
    const result = await copyProfile(client, sourceName, targetName, owner.user.email);
    expect(result).toMatchObject({
      copied: false,
      verified: true,
      counts: { accounts: 2, categories: 2, transactions: 3 },
    });
    expect(await client.db(targetName).collection('users').countDocuments()).toBe(0);
    expect(await client.db(targetName).collection('accounts').countDocuments()).toBe(0);
    expect(await client.db(sourceName).collection('accounts').countDocuments()).toBe(3);
  });

  it('preserves exact balances and login while excluding reset tokens and sessions', async () => {
    const { owner, other, accounts, transactions } = await fixture();
    const source = client.db(sourceName);
    const target = client.db(targetName);
    const sourceUser = await source.collection('users').findOne({ id: owner.user.id });
    const result = await copyProfile(client, sourceName, targetName, owner.user.email, true);
    expect(result.copied && result.verified).toBe(true);
    const copiedUser = await target.collection('users').findOne({ id: owner.user.id });
    expect(copiedUser?.passwordHash === sourceUser?.passwordHash).toBe(true);
    expect(copiedUser?.resetHash).toBeUndefined();
    expect(copiedUser?.resetExpiresAt).toBeUndefined();
    expect(await target.collection('sessions').countDocuments()).toBe(0);
    expect(await target.collection('users').countDocuments({ id: other.user.id })).toBe(0);
    for (const collection of ['accounts', 'categories', 'transactions']) {
      const original = await source
        .collection(collection)
        .find({ userId: owner.user.id }, { projection: { _id: 0 } })
        .sort({ id: 1 })
        .toArray();
      const copied = await target
        .collection(collection)
        .find({ userId: owner.user.id }, { projection: { _id: 0 } })
        .sort({ id: 1 })
        .toArray();
      expect(isDeepStrictEqual(original, copied)).toBe(true);
    }
    const copiedTransactions = (
      await target.collection('transactions').find({ userId: owner.user.id }).toArray()
    ).map((row) => transactionSchema.parse(row));
    const balances = accounts.map((account) =>
      accountBalance(account.openingBalanceMinor, account.id, account.currency, copiedTransactions),
    );
    expect(balances).toEqual(
      accounts.map((account) =>
        accountBalance(account.openingBalanceMinor, account.id, account.currency, transactions),
      ),
    );
    expect(balances.reduce((sum, value) => sum + BigInt(value), 0n)).toBe(9007199254748493n);
    expect(await source.collection('sessions').countDocuments({ userId: owner.user.id })).toBe(1);
    expect(
      (await source.collection('users').findOne({ id: owner.user.id }))?.resetHash,
    ).toBeDefined();
    process.env.MONGODB_DB = targetName;
    const login = await call('POST', 'auth/login', { email: owner.user.email, password });
    expect(login.status).toBe(200);
    expect((await database()).db.databaseName).toBe(targetName);
  });

  it('refuses an existing destination identity without changing either database', async () => {
    const { owner } = await fixture();
    await client
      .db(targetName)
      .collection('users')
      .insertOne({ email: owner.user.email, id: randomUUID() });
    await expect(
      copyProfile(client, sourceName, targetName, owner.user.email, true),
    ).rejects.toThrow('already exists');
    expect(await client.db(targetName).collection('accounts').countDocuments()).toBe(0);
    expect(await client.db(sourceName).collection('transactions').countDocuments()).toBe(3);
  });

  it('rejects broken references before copying the profile', async () => {
    const { owner } = await fixture();
    await client
      .db(sourceName)
      .collection('transactions')
      .updateOne({ userId: owner.user.id }, { $set: { accountId: randomUUID() } });
    await expect(
      copyProfile(client, sourceName, targetName, owner.user.email, true),
    ).rejects.toThrow();
    expect(await client.db(targetName).collection('users').countDocuments()).toBe(0);
  });

  it('rolls back profile and earlier collections when a later insert fails', async () => {
    const { owner } = await fixture();
    await client
      .db(targetName)
      .collection('transactions')
      .createIndex({ accountId: 1 }, { unique: true });
    await expect(
      copyProfile(client, sourceName, targetName, owner.user.email, true),
    ).rejects.toThrow();
    expect(await client.db(targetName).collection('users').countDocuments()).toBe(0);
    expect(await client.db(targetName).collection('accounts').countDocuments()).toBe(0);
    expect(await client.db(targetName).collection('categories').countDocuments()).toBe(0);
    expect(await client.db(sourceName).collection('transactions').countDocuments()).toBe(3);
  });
});
