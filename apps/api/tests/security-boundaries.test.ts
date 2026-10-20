import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import { accountInputSchema, accountSchema, categorySchema, goalSchema } from '@finora/contracts';
import { GET } from '../app/api/v1/[...path]/route';
import { database } from '../src/database/client';
import { authenticate } from '../src/modules/auth/service';
import { createAccount } from '../src/modules/finance/entities';
import {
  call,
  clearDatabase,
  createUser,
  password,
  setupDatabase,
  teardownDatabase,
} from './setup';

beforeAll(setupDatabase);
beforeEach(clearDatabase);
afterAll(teardownDatabase);
const key = () => ({ 'Idempotency-Key': randomUUID() });

async function category(token: string, name = 'Food') {
  const response = await call('POST', 'categories', { name, type: 'EXPENSE' }, token, key());
  expect(response.status).toBe(201);
  return categorySchema.parse(response.json.success ? response.json.data : null);
}
async function goal(token: string) {
  const response = await call(
    'POST',
    'goals',
    { name: 'Buffer', targetMinor: '1000' },
    token,
    key(),
  );
  expect(response.status).toBe(201);
  return goalSchema.parse(response.json.success ? response.json.data : null);
}
async function populateCategories(userId: string, count: number) {
  const { db } = await database();
  const now = new Date().toISOString();
  await db.collection('categories').insertMany(
    Array.from({ length: count }, (_, index) =>
      categorySchema.parse({
        id: randomUUID(),
        userId,
        name: `Custom ${index}`,
        type: 'EXPENSE',
        version: 1,
        archived: false,
        createdAt: now,
        updatedAt: now,
      }),
    ),
  );
}

it('rejects a financial write whose captured identity has stale settings and accepts fresh context', async () => {
  const user = await createUser();
  const request = () =>
    new Request('http://localhost:3000/api/v1/accounts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${user.accessToken}`, ...key() },
    });
  const stale = await authenticate(request());
  expect(
    (
      await call(
        'PATCH',
        'settings',
        { preferences: { ...user.user.preferences, baseCurrency: 'USD' }, version: 1 },
        user.accessToken,
        key(),
      )
    ).status,
  ).toBe(200);
  const input = accountInputSchema.parse({ name: 'Cash', type: 'CASH' });
  await expect(createAccount(stale, request(), input)).rejects.toMatchObject({
    status: 409,
    code: 'SETTINGS_CONFLICT',
  });
  const { db } = await database();
  expect(await db.collection('accounts').countDocuments({ userId: user.user.id })).toBe(0);
  const current = await authenticate(request());
  const created = await createAccount(current, request(), input);
  expect(created.currency).toBe('USD');
});

it('keeps category seeding atomic when missing defaults would exceed the total limit', async () => {
  const user = await createUser();
  await populateCategories(user.user.id, 285);
  const result = await call('POST', 'onboarding/categories', {}, user.accessToken, key());
  expect(result.status).toBe(409);
  expect(!result.json.success && result.json.error.code).toBe('RECORD_LIMIT');
  const { db } = await database();
  expect(await db.collection('categories').countDocuments({ userId: user.user.id })).toBe(285);
  expect(
    await db
      .collection('categories')
      .countDocuments({ userId: user.user.id, defaultKey: { $exists: true } }),
  ).toBe(0);
});

it('does not count already present defaults against category capacity twice', async () => {
  const user = await createUser();
  expect((await call('POST', 'onboarding/categories', {}, user.accessToken, key())).status).toBe(
    200,
  );
  await populateCategories(user.user.id, 283);
  expect((await call('POST', 'onboarding/categories', {}, user.accessToken, key())).status).toBe(
    200,
  );
  const { db } = await database();
  expect(await db.collection('categories').countDocuments({ userId: user.user.id })).toBe(300);
  expect(
    (
      await call(
        'POST',
        'categories',
        { name: 'Over capacity', type: 'EXPENSE' },
        user.accessToken,
        key(),
      )
    ).status,
  ).toBe(409);
});

it('preserves an expense category type used by a budget before any transaction exists', async () => {
  const user = await createUser();
  const expense = await category(user.accessToken);
  expect(
    (
      await call(
        'POST',
        'budgets',
        { categoryId: expense.id, month: '2026-01', amountMinor: '500' },
        user.accessToken,
        key(),
      )
    ).status,
  ).toBe(201);
  const result = await call(
    'PATCH',
    `categories/${expense.id}`,
    { name: expense.name, type: 'INCOME', archived: false, version: 1 },
    user.accessToken,
    key(),
  );
  expect(result.status).toBe(409);
  const { db } = await database();
  expect(await db.collection('transactions').countDocuments({ userId: user.user.id })).toBe(0);
  expect(
    (await db.collection('categories').findOne({ userId: user.user.id, id: expense.id }))?.type,
  ).toBe('EXPENSE');
});

it('preserves a category type used by a recurring rule before any transaction exists', async () => {
  const user = await createUser();
  const expense = await category(user.accessToken);
  const response = await call(
    'POST',
    'accounts',
    { name: 'Cash', type: 'CASH' },
    user.accessToken,
    key(),
  );
  const account = accountSchema.parse(response.json.success ? response.json.data : null);
  expect(
    (
      await call(
        'POST',
        'recurring',
        {
          name: 'Rent',
          type: 'EXPENSE',
          accountId: account.id,
          categoryId: expense.id,
          amountMode: 'FIXED',
          amountMinor: '100',
          postingPolicy: 'CONFIRM_EACH',
          startDate: '2026-01-01',
          frequency: 'MONTHLY',
        },
        user.accessToken,
        key(),
      )
    ).status,
  ).toBe(201);
  expect(
    (
      await call(
        'PATCH',
        `categories/${expense.id}`,
        { name: expense.name, type: 'INCOME', archived: false, version: 1 },
        user.accessToken,
        key(),
      )
    ).status,
  ).toBe(409);
  const { db } = await database();
  expect(await db.collection('transactions').countDocuments({ userId: user.user.id })).toBe(0);
});

it('locks base currency when goals or budgets exist before an account is created', async () => {
  const goalUser = await createUser();
  const budgetUser = await createUser('budget@example.com');
  await goal(goalUser.accessToken);
  const expense = await category(budgetUser.accessToken);
  expect(
    (
      await call(
        'POST',
        'budgets',
        { categoryId: expense.id, month: '2026-01', amountMinor: '500' },
        budgetUser.accessToken,
        key(),
      )
    ).status,
  ).toBe(201);
  const { db } = await database();
  for (const user of [goalUser, budgetUser]) {
    expect(await db.collection('accounts').countDocuments({ userId: user.user.id })).toBe(0);
    const response = await call(
      'PATCH',
      'settings',
      { preferences: { ...user.user.preferences, baseCurrency: 'USD' }, version: 1 },
      user.accessToken,
      key(),
    );
    expect(response.status).toBe(409);
    expect(!response.json.success && response.json.error.code).toBe('CURRENCY_LOCKED');
  }
});

it('deletes savings contributions and import previews only for the confirmed account owner', async () => {
  const first = await createUser();
  const other = await createUser('other@example.com');
  for (const user of [first, other]) {
    const savedGoal = await goal(user.accessToken);
    expect(
      (
        await call(
          'POST',
          `goals/${savedGoal.id}/contributions`,
          { amountMinor: '50', date: '2026-01-01', version: 1 },
          user.accessToken,
          key(),
        )
      ).status,
    ).toBe(201);
    const exported = await GET(
      new Request('http://localhost:3000/api/v1/export/backup', {
        headers: { Authorization: `Bearer ${user.accessToken}` },
      }),
    );
    expect(exported.status).toBe(200);
    expect(
      (
        await call(
          'POST',
          'import/preview',
          { backup: await exported.json() },
          user.accessToken,
          key(),
        )
      ).status,
    ).toBe(200);
  }
  const { db } = await database();
  for (const collection of ['savings_contributions', 'import_previews'])
    expect(await db.collection(collection).countDocuments({ userId: first.user.id })).toBe(1);
  expect(
    (await call('DELETE', 'auth/account', { password, confirmation: 'DELETE' }, first.accessToken))
      .status,
  ).toBe(200);
  for (const collection of ['savings_contributions', 'import_previews', 'savings_goals']) {
    expect(await db.collection(collection).countDocuments({ userId: first.user.id })).toBe(0);
    expect(await db.collection(collection).countDocuments({ userId: other.user.id })).toBe(1);
  }
});
