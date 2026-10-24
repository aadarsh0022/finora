import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import {
  accountSchema,
  assistantChatResponseSchema,
  assistantPolicyVersion,
  transactionInputSchema,
} from '@finora/contracts';
import { call, clearDatabase, createUser, setupDatabase, teardownDatabase } from './setup';
import { data, fixture, headers } from './advanced-fixtures';
import { database } from '../src/database/client';
import { authenticate } from '../src/modules/auth/service';
import { prepareTransaction } from '../src/modules/assistant/transaction-draft';

beforeAll(setupDatabase);
beforeEach(clearDatabase);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
afterAll(teardownDatabase);
const args = {
  type: 'EXPENSE' as const,
  amount: '12.50',
  currency: null,
  date: '2026-01-01',
  accountName: null,
  destinationAccountName: null,
  categoryName: 'Food',
  merchant: null,
  note: null,
};
async function context(token: string) {
  return authenticate(
    new Request('http://localhost:3000', { headers: { Authorization: `Bearer ${token}` } }),
  );
}

it('prepares an exact owned draft with no write, then the normal confirmed endpoint saves idempotently', async () => {
  const { token, account, expense } = await fixture();
  vi.stubEnv('ASSISTANT_ENABLED', 'true');
  vi.stubEnv('OPENAI_API_KEY', 'test-only-openai-key');
  const upstream = vi.fn(async () =>
    Response.json({
      status: 'completed',
      output: [
        {
          type: 'function_call',
          call_id: 'draft-call',
          name: 'prepare_transaction',
          arguments: JSON.stringify({ ...args, amount: '9007199254740993.01' }),
        },
      ],
    }),
  );
  vi.stubGlobal('fetch', upstream);
  const response = assistantChatResponseSchema.parse(
    data(
      await call(
        'POST',
        'assistant/v3/chat',
        {
          question: 'Record a food expense of 9007199254740993.01',
          previousQuestions: [],
          acceptedPolicyVersion: assistantPolicyVersion,
        },
        token,
      ),
    ),
  );
  expect(response).toMatchObject({
    kind: 'draft',
    result: null,
    draft: {
      amountMinor: '900719925474099301',
      accountId: account.id,
      categoryId: expense.id,
      requiresConfirmation: true,
      missingFields: [],
    },
  });
  const { db } = await database();
  expect(await db.collection('transactions').countDocuments()).toBe(0);
  expect(upstream).toHaveBeenCalledTimes(1);
  const draft = response.draft!;
  const body = transactionInputSchema.parse({
    type: draft.type,
    amountMinor: draft.amountMinor,
    accountId: draft.accountId,
    categoryId: draft.categoryId,
    date: '2026-01-01T06:30:00Z',
    merchant: draft.merchant,
    note: draft.note,
    tags: [],
  });
  const operation = headers();
  expect((await call('POST', 'transactions', body, token, operation)).status).toBe(201);
  expect((await call('POST', 'transactions', body, token, operation)).status).toBe(201);
  expect(await db.collection('transactions').countDocuments()).toBe(1);
  expect(
    (
      await call(
        'POST',
        'assistant/v3/tools/run',
        { name: 'prepare_transaction', arguments: args },
        token,
      )
    ).status,
  ).toBe(400);
});

it('does not choose another owner references, archived names or ambiguous accounts', async () => {
  const { token, account } = await fixture();
  const second = await createUser('second@example.com');
  await call(
    'POST',
    'accounts',
    { name: 'Someone else', type: 'CASH' },
    second.accessToken,
    headers(),
  );
  const own = await context(token);
  expect(
    await prepareTransaction(own, {
      ...args,
      accountName: 'Someone else',
      categoryName: 'Not a category',
    }),
  ).toMatchObject({ accountId: null, categoryId: null, missingFields: ['account', 'category'] });
  await call('POST', 'accounts', { name: account.name, type: 'WALLET' }, token, headers());
  expect(await prepareTransaction(own, { ...args, accountName: account.name })).toMatchObject({
    accountId: null,
    missingFields: ['account'],
  });
  const { db } = await database();
  expect(await db.collection('transactions').countDocuments()).toBe(0);
});

it('leaves missing fields explicit and rejects foreign currency, invalid amounts and identity arguments', async () => {
  const { token } = await fixture();
  const own = await context(token);
  expect(
    await prepareTransaction(own, { ...args, amount: null, categoryName: null }),
  ).toMatchObject({ amountMinor: null, categoryId: null, missingFields: ['amount', 'category'] });
  await expect(prepareTransaction(own, { ...args, currency: 'USD' })).rejects.toMatchObject({
    code: 'CURRENCY_MISMATCH',
  });
  for (const amount of ['0', '1.001'])
    await expect(prepareTransaction(own, { ...args, amount })).rejects.toMatchObject({
      code: 'INVALID_DRAFT_AMOUNT',
    });
  await expect(prepareTransaction(own, { ...args, userId: 'someone-else' })).rejects.toThrow();
});

it('prepares a transfer only between distinct owned accounts and conserves recorded money on confirmation', async () => {
  const { token, account } = await fixture();
  const destination = accountSchema.parse(
    data(await call('POST', 'accounts', { name: 'Savings', type: 'SAVINGS' }, token, headers())),
  );
  const own = await context(token);
  const draft = await prepareTransaction(own, {
    ...args,
    type: 'TRANSFER',
    accountName: account.name,
    destinationAccountName: destination.name,
    categoryName: null,
  });
  expect(draft).toMatchObject({
    accountId: account.id,
    destinationAccountId: destination.id,
    categoryId: null,
    missingFields: [],
  });
  expect(
    await prepareTransaction(own, {
      ...args,
      type: 'TRANSFER',
      accountName: account.name,
      destinationAccountName: account.name,
      categoryName: null,
    }),
  ).toMatchObject({ destinationAccountId: null, missingFields: ['destination'] });
  expect(
    (
      await call(
        'POST',
        'transactions',
        {
          type: draft.type,
          amountMinor: draft.amountMinor,
          accountId: draft.accountId,
          destinationAccountId: draft.destinationAccountId,
          date: '2026-01-01T06:30:00Z',
        },
        token,
        headers(),
      )
    ).status,
  ).toBe(201);
  const balances = data(
    await call<{ balanceMinor: string }[]>('GET', 'accounts', undefined, token),
  );
  expect(balances.reduce((sum, row) => sum + BigInt(row.balanceMinor), 0n)).toBe(0n);
});
