import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import {
  accountWithBalanceSchema,
  categorySchema,
  transactionSchema,
  transactionInputSchema,
  userSchema,
  type Transaction,
} from '@finora/contracts';
import { Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import TransactionScreen from '../../app/transaction';
import { ApiClient, type HttpTransport } from '../../src/api/client';
import { AppButton } from '../../src/components/ui';
import { useApp } from '../../src/providers/app-provider';
import { testVault } from '../vault-fixture';
import type { DeviceVault } from '../../src/storage/vault-core';
import { calendarDate } from '@finora/finance-core';
import { useNetworkState } from 'expo-network';
import { queuedTransactionSchema } from '../../src/storage/outbox';

jest.mock('../../src/providers/app-provider', () => ({ useApp: jest.fn() }));
jest.mock('expo-network', () => ({ useNetworkState: jest.fn(() => ({ isConnected: true })) }));
jest.mock('expo-crypto', () => ({
  randomUUID: () => jest.requireActual<{ randomUUID: () => string }>('node:crypto').randomUUID(),
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
  usePreventRemove: jest.fn(() => jest.fn()),
}));

const owner = '11111111-1111-4111-8111-111111111111';
const now = '2026-01-01T00:00:00.000Z';
const user = userSchema.parse({
  id: owner,
  email: 'native@example.com',
  name: 'Native Tester',
  preferences: {},
  createdAt: now,
  updatedAt: now,
});
const account = accountWithBalanceSchema.parse({
  id: '22222222-2222-4222-8222-222222222222',
  userId: owner,
  name: 'Cash',
  type: 'CASH',
  currency: 'INR',
  version: 1,
  archived: false,
  createdAt: now,
  updatedAt: now,
  balanceMinor: '0',
});
const destination = accountWithBalanceSchema.parse({
  ...account,
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Savings',
});
const category = categorySchema.parse({
  id: '44444444-4444-4444-8444-444444444444',
  userId: owner,
  name: 'Food',
  type: 'EXPENSE',
  version: 1,
  archived: false,
  createdAt: now,
  updatedAt: now,
});
const existing = transactionSchema.parse({
  id: '55555555-5555-4555-8555-555555555555',
  userId: owner,
  type: 'EXPENSE',
  accountId: account.id,
  categoryId: category.id,
  amountMinor: '1250',
  date: now,
  currency: 'INR',
  version: 2,
  createdAt: now,
  updatedAt: now,
});
type Write = { path: string; method: string; body: unknown; key: string | null };
let writes: Write[];
let failNextWrite: boolean;

beforeEach(() => {
  writes = [];
  failNextWrite = false;
  jest.mocked(useLocalSearchParams).mockReturnValue({});
});

async function mount(source?: Transaction, vault?: DeviceVault) {
  const transport: HttpTransport = async (url, options) => {
    const path = new URL(url).pathname.replace('/api/v1/', '');
    const method = options?.method ?? 'GET';
    if (method !== 'GET') {
      const body: unknown = JSON.parse(String(options?.body));
      writes.push({
        path,
        method,
        body,
        key: new Headers(options?.headers).get('Idempotency-Key'),
      });
      if (failNextWrite) {
        failNextWrite = false;
        throw new Error('Disconnected');
      }
      if (method === 'DELETE')
        return Response.json({ success: true, data: { id: source?.id, deleted: true } });
      return Response.json({
        success: true,
        data: transactionSchema.parse({
          ...(body as object),
          id: source?.id ?? existing.id,
          userId: owner,
          currency: 'INR',
          version: source ? source.version + 1 : 1,
          createdAt: now,
          updatedAt: now,
        }),
      });
    }
    const data = path.startsWith('accounts')
      ? [account, destination]
      : path.startsWith('categories')
        ? [category]
        : source;
    return Response.json({ success: true, data });
  };
  const api = new ApiClient(
    'https://native.test',
    {
      get: async () => ({ accessToken: 'a'.repeat(43), refreshToken: 'b'.repeat(43) }),
      set: async () => undefined,
      clear: async () => undefined,
    },
    () => undefined,
    transport,
  );
  jest.mocked(useApp).mockReturnValue({
    api,
    user,
    phase: 'ready',
    error: '',
    acceptSession: async () => undefined,
    restore: async () => undefined,
    clearSession: async () => undefined,
    refreshUser: async () => undefined,
    storageError: '',
    syncing: false,
    syncPending: async () => undefined,
    vault,
  });
  const query = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  await render(
    <QueryClientProvider client={query}>
      <TransactionScreen />
    </QueryClientProvider>,
  );
  await screen.findByLabelText('Amount (INR)');
}

test('loading actions cannot submit a second write', async () => {
  const onPress = jest.fn();
  // This test renders the actual shared native Pressable used by every mutation.
  const api = new ApiClient(
    'https://native.test',
    { get: async () => null, set: async () => undefined, clear: async () => undefined },
    () => undefined,
  );
  jest.mocked(useApp).mockReturnValue({
    api,
    user,
    phase: 'ready',
    error: '',
    acceptSession: async () => undefined,
    restore: async () => undefined,
    clearSession: async () => undefined,
    refreshUser: async () => undefined,
    storageError: '',
    syncing: false,
    syncPending: async () => undefined,
  });
  await render(<AppButton title="Save transaction" loading onPress={onPress} />);
  const button = screen.getByRole('button', { name: 'Save transaction' });
  expect(button).toBeDisabled();
  await fireEvent.press(button);
  expect(onPress).not.toHaveBeenCalled();
});

test('opens a favourite as a draft dated today without automatically posting it', async () => {
  const { vault } = testVault(owner);
  const favouriteId = '88888888-8888-4888-8888-888888888888';
  await vault.write(`favourite:${favouriteId}`, {
    id: favouriteId,
    name: 'Lunch',
    body: {
      type: existing.type,
      accountId: existing.accountId,
      categoryId: existing.categoryId,
      amountMinor: existing.amountMinor,
      date: existing.date,
      merchant: 'Lunch',
      note: '',
      tags: [],
    },
  });
  jest.mocked(useLocalSearchParams).mockReturnValue({ favourite: favouriteId });
  await mount(undefined, vault);
  expect(screen.getByLabelText('Amount (INR)')).toHaveDisplayValue('12.50');
  expect(screen.getByText(/^Today ·/)).toBeOnTheScreen();
  expect(writes).toHaveLength(0);
  await fireEvent.press(screen.getByRole('button', { name: 'Add transaction' }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]?.body).toMatchObject({ amountMinor: '1250', merchant: 'Lunch' });
  expect(
    calendarDate(
      new Date(transactionInputSchema.parse(writes[0]?.body).date),
      user.preferences.timezone,
    ),
  ).toBe(calendarDate(new Date(), user.preferences.timezone));
});

test('validates the form before sending and preserves exact transfer amounts', async () => {
  await mount();
  await fireEvent.press(screen.getByRole('button', { name: 'Add transaction' }));
  expect(writes).toHaveLength(0);
  expect(await screen.findByRole('alert')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('radio', { name: 'Transfer' }));
  await fireEvent.changeText(screen.getByLabelText('Amount (INR)'), '9007199254740993.01');
  await fireEvent.press(screen.getByRole('button', { name: 'To account' }));
  await fireEvent.press(screen.getByRole('radio', { name: 'Savings' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Add transaction' }));
  await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    method: 'POST',
    path: 'transactions',
    body: {
      type: 'TRANSFER',
      accountId: account.id,
      destinationAccountId: destination.id,
      amountMinor: '900719925474099301',
    },
  });
  expect(writes[0]?.body).not.toHaveProperty('categoryId');
  expect(writes[0]?.body).not.toHaveProperty('userId');
  expect(writes[0]?.key).toMatch(/^[\da-f-]{36}$/i);
});

test('shows a network failure and retries the same operation key without abandoning the form', async () => {
  await mount();
  await fireEvent.changeText(screen.getByLabelText('Amount (INR)'), '12.50');
  await fireEvent.press(screen.getByRole('button', { name: 'Category' }));
  await fireEvent.press(screen.getByRole('radio', { name: 'Food' }));
  failNextWrite = true;
  await fireEvent.press(screen.getByRole('button', { name: 'Add transaction' }));
  expect(
    await screen.findByText('Cannot reach Finora. Check your connection and retry.'),
  ).toBeOnTheScreen();
  expect(router.back).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Add transaction' }));
  await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
  expect(writes).toHaveLength(2);
  expect(writes[0]?.key).toBe(writes[1]?.key);
  expect(writes[0]?.body).toEqual(writes[1]?.body);
});

test('keeps optional details when collapsed and saves them through the compact form', async () => {
  await mount();
  expect(screen.queryByLabelText('Note (optional)')).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('Amount (INR)'), '12.50');
  await fireEvent.press(screen.getByRole('button', { name: 'Category' }));
  await fireEvent.press(screen.getByRole('radio', { name: 'Food' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Add merchant, note or tags' }));
  await fireEvent.changeText(screen.getByLabelText('Note (optional)'), 'Synthetic form test');
  await fireEvent.press(screen.getByRole('button', { name: 'Hide extra details' }));
  expect(screen.queryByLabelText('Note (optional)')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Add transaction' }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(transactionInputSchema.parse(writes[0]?.body).note).toBe('Synthetic form test');
});

test('keeps an offline entry in the durable pending list without posting it as a server transaction', async () => {
  const { vault } = testVault(owner);
  jest
    .mocked(useNetworkState)
    .mockReturnValue({ isConnected: false } as ReturnType<typeof useNetworkState>);
  try {
    await mount(undefined, vault);
    await fireEvent.changeText(screen.getByLabelText('Amount (INR)'), '12.50');
    await fireEvent.press(screen.getByRole('button', { name: 'Category' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Food' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Add transaction' }));
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
    expect(writes).toHaveLength(0);
    const pending = await vault.list('pending:', queuedTransactionSchema);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.value).toMatchObject({
      state: 'PENDING',
      body: { amountMinor: '1250', accountId: account.id },
    });
  } finally {
    jest
      .mocked(useNetworkState)
      .mockReturnValue({ isConnected: true } as ReturnType<typeof useNetworkState>);
  }
});

test('requires destructive confirmation before sending a versioned deletion', async () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: existing.id });
  const alert = jest.spyOn(Alert, 'alert');
  await mount(existing);
  await fireEvent.press(screen.getByRole('button', { name: 'Delete transaction' }));
  expect(writes).toHaveLength(0);
  const buttons = alert.mock.calls[0]?.[2];
  expect(buttons?.find((button) => button.text === 'Cancel')?.style).toBe('cancel');
  buttons?.find((button) => button.text === 'Delete')?.onPress?.();
  await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    method: 'DELETE',
    path: `transactions/${existing.id}`,
    body: { version: 2, confirmation: 'DELETE' },
  });
});
