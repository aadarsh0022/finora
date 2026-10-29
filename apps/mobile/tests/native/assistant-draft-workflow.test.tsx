import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import {
  accountWithBalanceSchema,
  assistantTransactionDraftSchema,
  categorySchema,
  userSchema,
} from '@finora/contracts';
import {
  TransactionConversation,
  type DraftReply,
} from '../../src/features/assistant/transaction-conversation';
import { ApiClient } from '../../src/api/client';
import { useApp } from '../../src/providers/app-provider';
import { useTransactionDrafts } from '../../src/stores/transaction-drafts';
import { router } from 'expo-router';

jest.mock('../../src/providers/app-provider', () => ({ useApp: jest.fn() }));
jest.mock('expo-network', () => ({ useNetworkState: () => ({ isConnected: true }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '99999999-9999-4999-8999-999999999999' }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, usePreventRemove: jest.fn() }));
const timestamp = '2026-10-24T10:00:00.000Z';
const user = userSchema.parse({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Demo',
  email: 'demo@example.com',
  preferences: {},
  createdAt: timestamp,
  updatedAt: timestamp,
});
const account = accountWithBalanceSchema.parse({
  id: '22222222-2222-4222-8222-222222222222',
  userId: user.id,
  name: 'Main',
  type: 'CHECKING',
  currency: 'INR',
  openingBalanceMinor: '0',
  balanceMinor: '0',
  archived: false,
  version: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
});
const category = categorySchema.parse({
  id: '33333333-3333-4333-8333-333333333333',
  userId: user.id,
  name: 'Food',
  type: 'EXPENSE',
  archived: false,
  version: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
});
const draft = assistantTransactionDraftSchema.parse({
  type: 'EXPENSE',
  amountMinor: '10000',
  currency: 'INR',
  timezone: user.preferences.timezone,
  date: '2026-10-24',
  accountId: account.id,
  destinationAccountId: null,
  categoryId: null,
  accountName: 'Main',
  destinationAccountName: null,
  categoryName: null,
  merchant: '',
  note: '',
  missingFields: ['category'],
  requiresConfirmation: true,
});
let writes: { body: Record<string, unknown>; key: string | null }[];
let reply: DraftReply;
beforeEach(() => {
  writes = [];
  reply = () => undefined;
  useTransactionDrafts.getState().reset();
});
async function mount(
  options: { missingAmount?: boolean; failOnce?: boolean; missingAccount?: boolean } = {},
) {
  let failed = false;
  const api = new ApiClient(
    'https://native.test',
    {
      get: async () => ({ accessToken: 'a'.repeat(43), refreshToken: 'b'.repeat(43) }),
      set: async () => undefined,
      clear: async () => undefined,
    },
    () => undefined,
    async (url, init) => {
      const path = new URL(url).pathname;
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        writes.push({ body, key: new Headers(init.headers).get('Idempotency-Key') });
        if (options.failOnce && !failed) {
          failed = true;
          return Response.json(
            {
              success: false,
              error: { code: 'SERVICE_UNAVAILABLE', message: 'Please retry saving.' },
            },
            { status: 503 },
          );
        }
        return Response.json({
          success: true,
          data: {
            ...body,
            id: '44444444-4444-4444-8444-444444444444',
            userId: user.id,
            currency: 'INR',
            version: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        });
      }
      return Response.json({
        success: true,
        data: path.endsWith('/accounts') ? [account] : [category],
      });
    },
  );
  jest.mocked(useApp).mockReturnValue({ user, api } as ReturnType<typeof useApp>);
  const value = {
    ...draft,
    ...(options.missingAmount
      ? { amountMinor: null, missingFields: ['amount', 'category'] as ('amount' | 'category')[] }
      : {}),
    ...(options.missingAccount ? { accountId: null, accountName: null } : {}),
  };
  await render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false, gcTime: 0 },
          },
        })
      }
    >
      <TransactionConversation
        draft={value}
        answerId="55555555-5555-4555-8555-555555555555"
        register={(handler) => {
          reply = handler;
          return () => {
            reply = () => undefined;
          };
        }}
      />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.queryByRole('progressbar')).toBeNull());
}

test('asks for the missing category before showing confirmation, then saves inline exactly once', async () => {
  await mount();
  expect(screen.getByText(/Which category was/)).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Confirm and save' })).toBeNull();
  expect(writes).toHaveLength(0);
  await fireEvent.press(await screen.findByRole('button', { name: 'Use Food' }));
  const save = await screen.findByRole('button', { name: 'Confirm and save' });
  expect(writes).toHaveLength(0);
  await fireEvent.press(save);
  await screen.findByText(/^Saved ·/);
  expect(screen.queryByRole('button', { name: 'Confirm and save' })).toBeNull();
  expect(writes).toHaveLength(1);
  expect(writes[0]?.body).toMatchObject({
    amountMinor: '10000',
    categoryId: category.id,
    accountId: account.id,
  });
  expect(router.push).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('accepts typed details and asks one missing question at a time without guessing', async () => {
  await mount({ missingAccount: true });
  await screen.findByRole('button', { name: 'Use Food' });
  await act(async () => reply('Food'));
  await screen.findByText('Which account should I use?');
  expect(screen.queryByRole('button', { name: 'Confirm and save' })).toBeNull();
  await fireEvent.press(await screen.findByRole('button', { name: 'Use Main' }));
  await screen.findByRole('button', { name: 'Confirm and save' });
  expect(writes).toHaveLength(0);
});

test('rejects an invalid amount, supports cancellation and never creates a transaction', async () => {
  await mount({ missingAmount: true });
  await act(async () => reply('0'));
  await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: 'Confirm and save' })).toBeNull();
  await act(async () => reply('100'));
  await screen.findByText(/Which category was/);
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel transaction draft' }));
  await screen.findByText('Transaction cancelled. Nothing was saved.');
  expect(writes).toHaveLength(0);
});

test('retrying a failed confirmed save reuses its operation key', async () => {
  await mount({ failOnce: true });
  await fireEvent.press(await screen.findByRole('button', { name: 'Use Food' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Confirm and save' }));
  await screen.findByText('Please retry saving.');
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm and save' }));
  await screen.findByText(/^Saved ·/);
  expect(screen.queryByRole('button', { name: 'Confirm and save' })).toBeNull();
  expect(writes).toHaveLength(2);
  expect(writes[0]?.key).toBe(writes[1]?.key);
  expect(writes[0]?.body).toEqual(writes[1]?.body);
});
