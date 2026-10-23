import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { debtSchema, debtEventSchema, userSchema } from '@finora/contracts';
import DebtScreen from '../../app/debt';
import { ApiClient, type HttpTransport } from '../../src/api/client';
import { useApp } from '../../src/providers/app-provider';

jest.mock('../../src/providers/app-provider', () => ({ useApp: jest.fn() }));
jest.mock('expo-network', () => ({ useNetworkState: () => ({ isConnected: true }) }));
jest.mock('expo-crypto', () => ({
  randomUUID: () => jest.requireActual<{ randomUUID: () => string }>('node:crypto').randomUUID(),
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
  usePreventRemove: jest.fn(() => jest.fn()),
}));
const now = '2026-01-01T00:00:00.000Z';
const user = userSchema.parse({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Casey',
  email: 'native@example.com',
  preferences: {},
  createdAt: now,
  updatedAt: now,
});
const debt = debtSchema.parse({
  id: '22222222-2222-4222-8222-222222222222',
  userId: user.id,
  version: 1,
  name: 'Test lender',
  direction: 'BORROWED',
  amountMinor: '5000',
  date: '2026-01-01',
  currency: 'INR',
  archived: false,
  createdAt: now,
  updatedAt: now,
});
let writes: { path: string; body: Record<string, unknown> }[];
beforeEach(() => {
  writes = [];
  jest.mocked(useLocalSearchParams).mockReturnValue({});
});
async function mount(overrides: Partial<typeof debt> = {}) {
  const transport: HttpTransport = async (url, options) => {
    const path = new URL(url).pathname.replace('/api/v1/', '');
    if (options?.method === 'POST') {
      const body = JSON.parse(String(options.body)) as Record<string, unknown>;
      writes.push({ path, body });
      return Response.json({
        success: true,
        data:
          path === 'debts'
            ? { ...debt, ...overrides, ...body }
            : debtEventSchema.parse({
                id: '33333333-3333-4333-8333-333333333333',
                userId: user.id,
                debtId: debt.id,
                kind: 'REPAYMENT',
                direction: 'BORROWED',
                currency: 'INR',
                note: '',
                createdAt: now,
                ...body,
              }),
      });
    }
    return Response.json({
      success: true,
      data:
        path === 'accounts'
          ? []
          : {
              ...debt,
              ...overrides,
              repaidMinor: '0',
              remainingMinor: '5000',
              status: 'ACTIVE',
              events: [],
            },
    });
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
  jest.mocked(useApp).mockReturnValue({ user, api } as ReturnType<typeof useApp>);
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  await render(
    <QueryClientProvider client={client}>
      <DebtScreen />
    </QueryClientProvider>,
  );
}
test('reviews an existing debt without silently moving account money', async () => {
  await mount();
  await fireEvent.changeText(screen.getByLabelText('Person or lender'), 'Test lender');
  await fireEvent.changeText(screen.getByLabelText('Outstanding amount (INR)'), '50.00');
  await fireEvent.press(screen.getByRole('button', { name: 'Review debt' }));
  expect(writes).toHaveLength(0);
  expect(
    screen.getByText(
      'Tracks the outstanding amount only. Account balances, income and spending stay unchanged.',
    ),
  ).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Record debt' }));
  await waitFor(() => expect(router.back).toHaveBeenCalled());
  expect(writes[0]).toMatchObject({
    path: 'debts',
    body: { name: 'Test lender', amountMinor: '5000', direction: 'BORROWED' },
  });
  expect(writes[0]?.body).not.toHaveProperty('accountId');
});
test('prevents overpayment in the form and submits an exact partial repayment', async () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: debt.id });
  await mount();
  await fireEvent.press(await screen.findByRole('button', { name: 'Record repayment' }));
  await fireEvent.changeText(screen.getByLabelText('Repayment (INR)'), '50.01');
  await fireEvent.press(screen.getByRole('button', { name: 'Review repayment' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Repayment exceeds the remaining balance.');
  expect(writes).toHaveLength(0);
  await fireEvent.changeText(screen.getByLabelText('Repayment (INR)'), '12.34');
  await fireEvent.press(screen.getByRole('button', { name: 'Review repayment' }));
  expect(writes).toHaveLength(0);
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm repayment' }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toMatchObject({
    path: `debts/${debt.id}/repayments`,
    body: { amountMinor: '1234', version: 1 },
  });
  expect(writes[0]?.body).not.toHaveProperty('accountId');
});

test('tracks an expected refund only after review, without an initial account movement', async () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ receivable: 'true' });
  await mount();
  expect(screen.queryByText('Account handling')).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('Who should pay you?'), 'Demo shop');
  await fireEvent.changeText(screen.getByLabelText('Expected amount (INR)'), '50');
  await fireEvent.press(screen.getByRole('button', { name: 'Review receivable' }));
  expect(writes).toHaveLength(0);
  await fireEvent.press(screen.getByRole('button', { name: 'Track receivable' }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]?.body).toMatchObject({ kind: 'REFUND', direction: 'LENT', amountMinor: '5000' });
  expect(writes[0]?.body).not.toHaveProperty('accountId');
});

test('uses receipt wording and prevents over-collection before a partial receipt', async () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: debt.id });
  await mount({ direction: 'LENT', kind: 'REIMBURSEMENT' });
  await fireEvent.press(await screen.findByRole('button', { name: 'Record money received' }));
  await fireEvent.changeText(screen.getByLabelText('Received amount (INR)'), '50.01');
  await fireEvent.press(screen.getByRole('button', { name: 'Review receipt' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Receipt exceeds the remaining amount.');
  expect(writes).toHaveLength(0);
  await fireEvent.changeText(screen.getByLabelText('Received amount (INR)'), '12.34');
  await fireEvent.press(screen.getByRole('button', { name: 'Review receipt' }));
  expect(writes).toHaveLength(0);
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm receipt' }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]?.body).toMatchObject({ amountMinor: '1234', version: 1 });
});
