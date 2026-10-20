import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import { accountSchema, accountUpdateSchema, categorySchema } from '@finora/contracts';
import { call, clearDatabase, createUser, setupDatabase, teardownDatabase } from './setup';

beforeAll(setupDatabase);
beforeEach(clearDatabase);
afterAll(teardownDatabase);
const headers = () => ({ 'Idempotency-Key': randomUUID() });

it('persists accounts, enforces owner identity and rejects stale updates', async () => {
  const first = await createUser();
  const other = await createUser('other@example.com');
  const input = { name: 'Cash', type: 'CASH', openingBalanceMinor: '900719925474099301' };
  const created = await call('POST', 'accounts', input, first.accessToken, headers());
  expect(created.status).toBe(201);
  const account = accountSchema.parse(created.json.success ? created.json.data : null);
  expect(account.currency).toBe('INR');
  expect((await call('GET', `accounts/${account.id}`, undefined, other.accessToken)).status).toBe(
    404,
  );
  expect((await call('GET', 'accounts')).status).toBe(401);
  const edit = accountUpdateSchema.parse({
    name: account.name,
    type: account.type,
    openingBalanceMinor: account.openingBalanceMinor,
    icon: account.icon,
    color: account.color,
    version: account.version,
    archived: account.archived,
  });
  expect(
    (
      await call(
        'PATCH',
        `accounts/${account.id}`,
        { ...edit, name: 'Pocket' },
        first.accessToken,
        headers(),
      )
    ).status,
  ).toBe(200);
  expect(
    (await call('PATCH', `accounts/${account.id}`, edit, first.accessToken, headers())).status,
  ).toBe(409);
  expect(
    (
      await call(
        'POST',
        'accounts',
        { ...input, userId: other.user.id },
        first.accessToken,
        headers(),
      )
    ).status,
  ).toBe(400);
});

it('deduplicates concurrent creates; key reuse with another payload conflicts', async () => {
  const user = await createUser();
  const operationHeaders = headers();
  const input = { name: 'Cash', type: 'CASH' };
  const results = await Promise.all([
    call('POST', 'accounts', input, user.accessToken, operationHeaders),
    call('POST', 'accounts', input, user.accessToken, operationHeaders),
  ]);
  expect(results.map((value) => value.status)).toEqual([201, 201]);
  expect(results[0]?.json.success && results[0].json.data).toEqual(
    results[1]?.json.success && results[1].json.data,
  );
  const list = await call('GET', 'accounts', undefined, user.accessToken);
  expect(list.json.success && list.json.data).toHaveLength(1);
  expect(
    (
      await call(
        'POST',
        'accounts',
        { name: 'Other', type: 'CASH' },
        user.accessToken,
        operationHeaders,
      )
    ).status,
  ).toBe(409);
  expect((await call('POST', 'accounts', input, user.accessToken)).status).toBe(400);
});

it('archives/restores accounts without deletion and supports idempotent archive retries', async () => {
  const user = await createUser();
  const created = await call(
    'POST',
    'accounts',
    { name: 'Cash', type: 'CASH' },
    user.accessToken,
    headers(),
  );
  const account = accountSchema.parse(created.json.success ? created.json.data : null);
  const key = headers();
  expect(
    (await call('DELETE', `accounts/${account.id}`, { version: 1 }, user.accessToken, key)).status,
  ).toBe(200);
  expect(
    (await call('DELETE', `accounts/${account.id}`, { version: 1 }, user.accessToken, key)).status,
  ).toBe(200);
  const list = await call('GET', 'accounts', undefined, user.accessToken);
  expect(list.json.success && list.json.data).toEqual([]);
  const archived = await call('GET', 'accounts?includeArchived=true', undefined, user.accessToken);
  expect(archived.json.success && archived.json.data).toHaveLength(1);
  expect(
    (
      await call(
        'PATCH',
        `accounts/${account.id}`,
        { name: 'Restored', type: 'CASH', openingBalanceMinor: '0', version: 2, archived: false },
        user.accessToken,
        headers(),
      )
    ).status,
  ).toBe(200);
});

it('seeds defaults once, supports custom categories, and isolates category edits', async () => {
  const user = await createUser();
  const other = await createUser('other@example.com');
  for (let i = 0; i < 2; i++)
    expect(
      (await call('POST', 'onboarding/categories', {}, user.accessToken, headers())).status,
    ).toBe(200);
  const defaults = await call('GET', 'categories', undefined, user.accessToken);
  expect(defaults.json.success && defaults.json.data).toHaveLength(17);
  const created = await call(
    'POST',
    'categories',
    { name: 'Pets', type: 'EXPENSE' },
    user.accessToken,
    headers(),
  );
  const category = categorySchema.parse(created.json.success ? created.json.data : null);
  expect(
    (
      await call(
        'PATCH',
        `categories/${category.id}`,
        { name: 'Pet care', type: 'EXPENSE', archived: false, version: 1 },
        other.accessToken,
        headers(),
      )
    ).status,
  ).toBe(404);
  expect(
    (await call('DELETE', `categories/${category.id}`, { version: 1 }, user.accessToken, headers()))
      .status,
  ).toBe(200);
  const otherList = await call('GET', 'categories', undefined, other.accessToken);
  expect(otherList.json.success && otherList.json.data).toEqual([]);
});
