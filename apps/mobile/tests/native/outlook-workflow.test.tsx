import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import {
  outlookSchema,
  outlookPreferencesSchema,
  userSchema,
  transactionSchema,
} from '@finora/contracts';
import { calendarDate, formatMoney, nextOccurrence } from '@finora/finance-core';
import MoneyAhead from '../../app/money-ahead';
import WeeklyReview from '../../app/weekly-review';
import { ApiClient } from '../../src/api/client';
import { useApp } from '../../src/providers/app-provider';
import { testVault } from '../vault-fixture';
import { enqueue } from '../../src/storage/outbox';

jest.mock('../../src/providers/app-provider', () => ({ useApp: jest.fn() }));
jest.mock('expo-network', () => ({ useNetworkState: () => ({ isConnected: true }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-crypto', () => ({
  randomUUID: () => jest.requireActual<{ randomUUID: () => string }>('node:crypto').randomUUID(),
}));
const id = '11111111-1111-4111-8111-111111111111';
const accountId = '22222222-2222-4222-8222-222222222222';
const categoryId = '33333333-3333-4333-8333-333333333333';
const transactionId = '44444444-4444-4444-8444-444444444444';
const timestamp = new Date().toISOString();
const today = calendarDate(new Date(), 'Asia/Kolkata');
const user = userSchema.parse({
  id,
  name: 'Demo',
  email: 'demo@example.com',
  preferences: { locale: 'en-IN' },
  createdAt: timestamp,
  updatedAt: timestamp,
});
function fixture() {
  return outlookSchema.parse({
    today,
    through: nextOccurrence(today, 'DAILY', 90),
    generatedAt: timestamp,
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    accounts: [{ id: accountId, name: 'Everyday', balanceMinor: '2000000' }],
    flows: [
      {
        id: 'rent',
        label: 'Rent',
        day: nextOccurrence(today, 'DAILY', 7),
        direction: 'OUT',
        amountMinor: '1000000',
        accountId,
        source: 'RECURRING',
        overdue: false,
      },
    ],
    undatedDebts: 0,
    pendingRecurringCount: 0,
    overdueDebtCount: 0,
    recentTransactions: [],
    moreRecentCount: 0,
  });
}
async function mount(options: { pending?: boolean; unknown?: boolean; weekly?: boolean } = {}) {
  let payload = fixture();
  const { vault } = testVault(id);
  const preferences = outlookPreferencesSchema.parse({
    through: nextOccurrence(today, 'DAILY', 30),
    reserveMinor: '300000',
    expectedPayments: [
      {
        id: transactionId,
        label: 'Contract',
        day: nextOccurrence(today, 'DAILY', 2),
        amountMinor: '200000',
      },
    ],
  });
  await vault.write('outlook:preferences', preferences);
  if (options.unknown) payload.flows[0]!.amountMinor = null;
  if (options.pending)
    await enqueue(vault, transactionId, {
      type: 'EXPENSE',
      accountId,
      categoryId,
      amountMinor: '100',
      date: timestamp,
      merchant: '',
      note: '',
      tags: [],
    });
  if (options.weekly)
    payload.recentTransactions = [
      transactionSchema.parse({
        id: transactionId,
        userId: id,
        version: 1,
        type: 'EXPENSE',
        amountMinor: '100',
        accountId,
        categoryId,
        date: timestamp,
        merchant: 'Demo entry',
        currency: 'INR',
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    ];
  const methods: string[] = [];
  const api = new ApiClient(
    'https://native.test',
    {
      get: async () => ({ accessToken: 'a'.repeat(43), refreshToken: 'b'.repeat(43) }),
      set: async () => undefined,
      clear: async () => undefined,
    },
    () => undefined,
    async (_url, request) => {
      methods.push(request?.method ?? 'GET');
      return Response.json({ success: true, data: payload });
    },
  );
  jest.mocked(useApp).mockReturnValue({ user, api, vault } as ReturnType<typeof useApp>);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={client}>
      {options.weekly ? <WeeklyReview /> : <MoneyAhead />}
    </QueryClientProvider>,
  );
  await screen.findByText(
    options.weekly ? '2. Review recent entries' : 'Every deduction, explained',
  );
  return {
    vault,
    methods,
    preferences,
    client,
    change: (next: typeof payload) => {
      payload = next;
    },
    payload,
  };
}
test('separates expected income and calculates a purchase preview without posting financial records', async () => {
  const { methods, vault, preferences } = await mount();
  await waitFor(() =>
    expect(screen.getByLabelText('Estimated available money')).toHaveTextContent(
      formatMoney('700000', 'INR', 'en-IN'),
    ),
  );
  await fireEvent.press(screen.getByRole('radio', { name: 'With expected income' }));
  expect(screen.getByLabelText('Estimated available money')).toHaveTextContent(
    formatMoney('900000', 'INR', 'en-IN'),
  );
  await fireEvent.press(screen.getByRole('radio', { name: 'Recorded money only' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Preview a purchase' }));
  await fireEvent.changeText(screen.getByLabelText('Purchase amount (INR)'), '8000');
  await fireEvent.press(screen.getByRole('button', { name: 'Calculate preview' }));
  await screen.findByText(/Lowest projected amount:.*1,000.00/);
  expect(methods.every((method) => method === 'GET')).toBe(true);
  expect((await vault.read('outlook:preferences', outlookPreferencesSchema))?.value).toEqual(
    preferences,
  );
});
test.each([{ pending: true }, { unknown: true }])(
  'hides the available-money headline when inputs need review: %s',
  async (options) => {
    await mount(options);
    expect(screen.queryByLabelText('Estimated available money')).toBeNull();
    expect(screen.getByRole('button', { name: 'Preview a purchase' })).toBeDisabled();
  },
);
test('adds irregular income to encrypted scenario preferences without recording income', async () => {
  const { vault, methods } = await mount();
  await fireEvent.press(screen.getByRole('button', { name: 'Add expected payment' }));
  await fireEvent.changeText(screen.getByLabelText('Payment label'), 'Side project');
  await fireEvent.changeText(screen.getByLabelText('Expected amount (INR)'), '1234.56');
  await fireEvent.press(screen.getByRole('button', { name: 'Add to scenario' }));
  await screen.findByText(/Side project ·/);
  expect(
    (await vault.read('outlook:preferences', outlookPreferencesSchema))?.value.expectedPayments[1],
  ).toMatchObject({ label: 'Side project', amountMinor: '123456' });
  expect(methods.every((method) => method === 'GET')).toBe(true);
});
test('review acknowledgements leave transactions unchanged and edited entries reappear', async () => {
  const { methods, client, payload, change } = await mount({ weekly: true });
  await screen.findByRole('button', { name: 'View or edit Demo entry' });
  await fireEvent.press(screen.getByRole('button', { name: 'Mark visible entries reviewed' }));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'View or edit Demo entry' })).toBeNull(),
  );
  change({
    ...payload,
    recentTransactions: payload.recentTransactions.map((entry) => ({ ...entry, version: 2 })),
  });
  await act(() => client.invalidateQueries({ queryKey: [id, 'planning/outlook'] }));
  await screen.findByRole('button', { name: 'View or edit Demo entry' });
  expect(methods.every((method) => method === 'GET')).toBe(true);
});

test('pauses an existing purchase estimate if a new pending save could overlap the snapshot', async () => {
  const { vault, client } = await mount();
  await waitFor(() => expect(screen.getByLabelText('Estimated available money')).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: 'Preview a purchase' }));
  await fireEvent.changeText(screen.getByLabelText('Purchase amount (INR)'), '1000');
  await fireEvent.press(screen.getByRole('button', { name: 'Calculate preview' }));
  await screen.findByText(/Lowest projected amount:/);
  await enqueue(vault, transactionId, {
    type: 'EXPENSE',
    accountId,
    categoryId,
    amountMinor: '100',
    date: timestamp,
    merchant: '',
    note: '',
    tags: [],
  });
  await act(() => client.invalidateQueries({ queryKey: [id, 'local', 'pending:'] }));
  await waitFor(() => expect(screen.queryByLabelText('Estimated available money')).toBeNull());
  expect(screen.queryByText(/Lowest projected amount:/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Preview a purchase' })).toBeDisabled();
});
