import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import {
  accountWithBalanceSchema,
  categorySchema,
  transactionSchema,
  userSchema,
} from '@finora/contracts';
import { router } from 'expo-router';
import Transactions from '../../app/(tabs)/transactions';
import { ApiClient, type HttpTransport } from '../../src/api/client';
import { useApp } from '../../src/providers/app-provider';
jest.mock('../../src/providers/app-provider', () => ({ useApp: jest.fn() }));
jest.mock('expo-network', () => ({ useNetworkState: () => ({ isConnected: true }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
const owner = '11111111-1111-4111-8111-111111111111';
const now = '2026-10-21T12:00:00.000Z';
const user = userSchema.parse({
  id: owner,
  name: 'Casey',
  email: 'test@example.com',
  preferences: { locale: 'en-IN', timezone: 'Asia/Kolkata' },
  createdAt: now,
  updatedAt: now,
});
const account = accountWithBalanceSchema.parse({
  id: '22222222-2222-4222-8222-222222222222',
  userId: owner,
  name: 'Main',
  archived: false,
  type: 'CASH',
  currency: 'INR',
  balanceMinor: '10000',
  version: 1,
  createdAt: now,
  updatedAt: now,
});
const category = categorySchema.parse({
  id: '33333333-3333-4333-8333-333333333333',
  userId: owner,
  name: 'Food',
  archived: false,
  type: 'EXPENSE',
  version: 1,
  createdAt: now,
  updatedAt: now,
});
const transaction = transactionSchema.parse({
  id: '44444444-4444-4444-8444-444444444444',
  userId: owner,
  accountId: account.id,
  categoryId: category.id,
  type: 'EXPENSE',
  amountMinor: '1250',
  merchant: 'Lunch place',
  currency: 'INR',
  date: now,
  version: 1,
  createdAt: now,
  updatedAt: now,
});
let paths: string[];
beforeEach(() => {
  paths = [];
});
async function mount() {
  const transport: HttpTransport = async (url) => {
    const parsed = new URL(url);
    paths.push(parsed.pathname + parsed.search);
    const data = parsed.pathname.endsWith('accounts')
      ? [account]
      : parsed.pathname.endsWith('categories')
        ? [category]
        : { items: [transaction], total: 1, page: 1, pageSize: 20 };
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
  jest.mocked(useApp).mockReturnValue({ user, api } as ReturnType<typeof useApp>);
  const query = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={query}>
      <Transactions />
    </QueryClientProvider>,
  );
  await screen.findByText('Lunch place');
}
test('shows transaction information with filters closed on arrival and opens row details', async () => {
  await mount();
  expect(screen.getByText('−₹12.50')).toBeOnTheScreen();
  expect(screen.getByText('1 transaction')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Account' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Apply filters' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Add transaction' }));
  expect(router.push).toHaveBeenCalledWith('/transaction');
  await fireEvent.press(screen.getByRole('button', { name: 'View or edit Lunch place' }));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/transaction',
    params: { id: transaction.id },
  });
  await fireEvent.press(screen.getByRole('radio', { name: 'Expense' }));
  await waitFor(() => expect(paths.some((path) => path.includes('type=EXPENSE'))).toBe(true));
  expect(screen.getByRole('radio', { name: 'Expense', checked: true })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Remove filter expense' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Clear all filters' })).toBeNull();
});
test('cancel discards draft filters and apply changes the real server query', async () => {
  await mount();
  await fireEvent.press(screen.getByRole('button', { name: 'Filters' }));
  await fireEvent.changeText(screen.getByLabelText('Minimum (INR)'), '12.50');
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(paths.some((path) => path.includes('minAmount'))).toBe(false);
  await fireEvent.press(screen.getByRole('button', { name: 'Filters' }));
  expect(screen.getByLabelText('Minimum (INR)')).toHaveDisplayValue('');
  await fireEvent.changeText(screen.getByLabelText('Minimum (INR)'), '12.50');
  await fireEvent.press(screen.getByRole('button', { name: 'Apply filters' }));
  await waitFor(() => expect(paths.some((path) => path.includes('minAmount=1250'))).toBe(true));
  expect(screen.getByRole('button', { name: 'Filters (1)' })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Apply filters' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Clear all filters' }));
  expect(screen.getByRole('button', { name: 'Filters' })).toBeOnTheScreen();
});
test('invalid filter ranges preserve the draft and do not request invalid data', async () => {
  await mount();
  await fireEvent.press(screen.getByRole('button', { name: 'Filters' }));
  await fireEvent.changeText(screen.getByLabelText('Minimum (INR)'), '20');
  await fireEvent.changeText(screen.getByLabelText('Maximum (INR)'), '10');
  await fireEvent.press(screen.getByRole('button', { name: 'Apply filters' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Minimum must not exceed maximum');
  expect(paths.some((path) => path.includes('minAmount'))).toBe(false);
  expect(screen.getByLabelText('Minimum (INR)')).toHaveDisplayValue('20');
});
