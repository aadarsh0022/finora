import { randomBytes, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import {
  accountSchema,
  categorySchema,
  overviewSchema,
  sessionTokensSchema,
  transactionSchema,
} from '../packages/contracts/src/index';

const origin = process.env.API_SMOKE_URL;
if (
  !origin ||
  !['localhost', '127.0.0.1'].includes(new URL(origin).hostname) ||
  process.env.ALLOW_DEV_SMOKE !== '1'
)
  throw new Error('Explicit local development smoke URL and ALLOW_DEV_SMOKE=1 are required.');
const password = randomBytes(32).toString('base64url');
const email = `smoke-${randomUUID()}@example.invalid`;
let accessToken: string | undefined;
async function call(method: string, route: string, body?: unknown, operation = false) {
  const response = await fetch(`${origin}/api/v1/${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(operation ? { 'Idempotency-Key': randomUUID() } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
  });
  const json = (await response.json()) as {
    success: boolean;
    data?: unknown;
    error?: { code: string };
  };
  if (!response.ok || !json.success)
    throw new Error(
      `HTTP smoke failed at ${method} ${route.split('?')[0]}: ${response.status} ${json.error?.code ?? 'INVALID_RESPONSE'}`,
    );
  return json.data;
}
try {
  const registration = sessionTokensSchema.parse(
    await call('POST', 'auth/register', {
      email,
      password,
      name: 'Disposable development smoke test',
    }),
  );
  accessToken = registration.accessToken;
  const cash = accountSchema.parse(
    await call('POST', 'accounts', { name: 'Smoke cash', type: 'CASH' }, true),
  );
  const savings = accountSchema.parse(
    await call('POST', 'accounts', { name: 'Smoke savings', type: 'SAVINGS' }, true),
  );
  const income = categorySchema.parse(
    await call('POST', 'categories', { name: 'Smoke income', type: 'INCOME' }, true),
  );
  const expense = categorySchema.parse(
    await call('POST', 'categories', { name: 'Smoke expense', type: 'EXPENSE' }, true),
  );
  const date = new Date().toISOString();
  transactionSchema.parse(
    await call(
      'POST',
      'transactions',
      { type: 'INCOME', accountId: cash.id, categoryId: income.id, amountMinor: '10000', date },
      true,
    ),
  );
  transactionSchema.parse(
    await call(
      'POST',
      'transactions',
      { type: 'EXPENSE', accountId: cash.id, categoryId: expense.id, amountMinor: '2500', date },
      true,
    ),
  );
  transactionSchema.parse(
    await call(
      'POST',
      'transactions',
      {
        type: 'TRANSFER',
        accountId: cash.id,
        destinationAccountId: savings.id,
        amountMinor: '3000',
        date,
      },
      true,
    ),
  );
  const report = overviewSchema.parse(await call('GET', 'reports/overview'));
  assert.equal(report.totalBalanceMinor, '7500');
  assert.equal(report.incomeMinor, '10000');
  assert.equal(report.expensesMinor, '2500');
  assert.equal(report.accounts.find((account) => account.id === savings.id)?.balanceMinor, '3000');
  await call('POST', 'auth/logout');
  accessToken = undefined;
  const login = sessionTokensSchema.parse(await call('POST', 'auth/login', { email, password }));
  accessToken = login.accessToken;
  assert.equal(
    overviewSchema.parse(await call('GET', 'reports/overview')).totalBalanceMinor,
    '7500',
  );
  console.info(
    'Live HTTP smoke passed: registration, accounts, income, expense, transfer conservation, reports and persistence after relogin.',
  );
} catch {
  console.error('Live HTTP smoke failed. No credentials or financial content were logged.');
  process.exitCode = 1;
} finally {
  if (accessToken) {
    try {
      await call('DELETE', 'auth/account', { password, confirmation: 'DELETE' });
      console.info('Only the smoke-created account and its disposable records were removed.');
    } catch {
      console.error('Smoke cleanup failed; the disposable test account may remain.');
      process.exitCode = 1;
    }
  }
}
