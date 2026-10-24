import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import {
  accountWithBalanceSchema,
  categorySchema,
  overviewSchema,
  transactionSchema,
  userSchema,
  type Overview,
} from '@finora/contracts';
import { router } from 'expo-router';
import { useNetworkState } from 'expo-network';
import Home from '../../app/(tabs)/index';
import { ApiClient, type HttpTransport } from '../../src/api/client';
import { useApp } from '../../src/providers/app-provider';
import { useUi } from '../../src/stores/ui';
import { testVault } from '../vault-fixture';
import { calendarDate } from '@finora/finance-core';

jest.mock('../../src/features/planning/outlook-summary', () => ({ OutlookSummary: () => null }));
jest.mock('../../src/providers/app-provider', () => ({ useApp: jest.fn() }));
jest.mock('expo-network', () => ({ useNetworkState: jest.fn(() => ({ isConnected: true })) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '99999999-9999-4999-8999-999999999999' }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));

const owner = '11111111-1111-4111-8111-111111111111';
const now = '2026-01-01T00:00:00.000Z';
const user = userSchema.parse({
  id: owner,
  email: 'native@example.com',
  name: 'Casey Tester',
  onboardingCompletedAt: now,
  preferences: { locale: 'en-US' },
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
  balanceMinor: '900719925474099301',
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
const transaction = transactionSchema.parse({
  id: '55555555-5555-4555-8555-555555555555',
  userId: owner,
  type: 'EXPENSE',
  accountId: account.id,
  categoryId: category.id,
  amountMinor: '1250',
  date: now,
  currency: 'INR',
  merchant: 'Groceries',
  version: 2,
  createdAt: now,
  updatedAt: now,
});
const populated = overviewSchema.parse({
  month: '2026-01',
  timezone: 'Asia/Kolkata',
  currency: 'INR',
  totalBalanceMinor: '900719925474099301',
  incomeMinor: '100000',
  expensesMinor: '1250',
  netMinor: '98750',
  savingsRateBasisPoints: 9875,
  accounts: [account],
  categorySpending: { [category.id]: '1250' },
  recentTransactions: [transaction],
});
const empty = overviewSchema.parse({
  ...populated,
  totalBalanceMinor: '0',
  incomeMinor: '0',
  expensesMinor: '0',
  netMinor: '0',
  savingsRateBasisPoints: null,
  accounts: [],
  categorySpending: {},
  recentTransactions: [],
});
let paths: string[];
let failOverviewOnce: boolean;
let failCategoriesOnce: boolean;
let holdOverview: Promise<void> | undefined;

beforeEach(() => {
  paths = [];
  failOverviewOnce = false;
  failCategoriesOnce = false;
  holdOverview = undefined;
  useUi.getState().reset();
  jest.mocked(useNetworkState).mockReturnValue({ isConnected: true, isInternetReachable: true });
});

async function mount(data: Overview, hold?: Promise<void>) {
  const local = useNetworkState().isConnected === false ? testVault(owner) : undefined;
  if (local) {
    const month = calendarDate(new Date(), user.preferences.timezone).slice(0, 7);
    await local.vault.write(`read:reports/overview?month=${month}`, { ...data, month });
    await local.vault.write('read:categories?includeArchived=true', [category]);
    for (const path of [
      `budgets?month=${month}`,
      'goals',
      'recurring',
      'recurring-occurrences?status=PENDING',
    ])
      await local.vault.write(`read:${path}`, []);
  }
  const transport: HttpTransport = async (url) => {
    const parsed = new URL(url);
    const path = parsed.pathname.replace('/api/v1/', '');
    paths.push(`${path}${parsed.search}`);
    if (['budgets', 'goals', 'recurring', 'recurring-occurrences'].includes(path))
      return Response.json({ success: true, data: [] });
    if (path === 'debts') return Response.json({ success: true, data: [] });
    if (path === 'reports/overview') {
      if (hold) await hold;
      if (holdOverview) await holdOverview;
      if (failOverviewOnce) {
        failOverviewOnce = false;
        return Response.json(
          {
            success: false,
            error: { code: 'SERVICE_UNAVAILABLE', message: 'Report unavailable. Please retry.' },
          },
          { status: 503 },
        );
      }
      return Response.json({
        success: true,
        data: { ...data, month: parsed.searchParams.get('month') },
      });
    }
    if (failCategoriesOnce) {
      failCategoriesOnce = false;
      return Response.json(
        {
          success: false,
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Categories unavailable. Please retry.' },
        },
        { status: 503 },
      );
    }
    return Response.json({ success: true, data: [category] });
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
    vault: local?.vault,
    phase: 'ready',
    error: '',
    acceptSession: async () => undefined,
    restore: async () => undefined,
    clearSession: async () => undefined,
    saveOnboarding: async () => undefined,
    refreshUser: async () => undefined,
    storageError: '',
    syncing: false,
    syncPending: async () => undefined,
  });
  const query = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  await render(
    <QueryClientProvider client={query}>
      <Home />
    </QueryClientProvider>,
  );
  return query;
}

test('shows loading before data, then actionable empty states and account creation navigation', async () => {
  let complete: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    complete = resolve;
  });
  await mount(empty, held);
  expect(screen.getByRole('progressbar', { name: 'Loading your records' })).toBeOnTheScreen();
  expect(screen.queryByText('Start with your first account')).not.toBeOnTheScreen();
  complete();
  expect(await screen.findByText('Start with your first account')).toBeOnTheScreen();
  expect(screen.getByText('Your transactions will appear here.')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
  expect(router.push).toHaveBeenCalledWith('/account');
});

test('background refresh preserves content without skeletons or a pull-to-refresh spinner', async () => {
  const query = await mount(populated);
  await screen.findByText('Groceries');
  let complete: () => void = () => undefined;
  holdOverview = new Promise<void>((resolve) => {
    complete = resolve;
  });
  await act(async () => {
    void query.invalidateQueries({ queryKey: [owner] });
  });
  await waitFor(() => expect(query.isFetching()).toBeGreaterThan(0));
  expect(screen.getByText('Groceries')).toBeOnTheScreen();
  expect(screen.queryByRole('progressbar', { name: 'Loading your records' })).toBeNull();
  const refreshControl = () => screen.getByTestId('screen-content').props.refreshControl;
  expect(refreshControl().props.refreshing).toBe(false);
  await act(async () => {
    complete();
  });
  await waitFor(() => expect(query.isFetching()).toBe(0));

  holdOverview = new Promise<void>((resolve) => {
    complete = resolve;
  });
  await act(async () => {
    refreshControl().props.onRefresh();
  });
  expect(refreshControl().props.refreshing).toBe(true);
  expect(screen.getByText('Groceries')).toBeOnTheScreen();
  await act(async () => {
    complete();
  });
  await waitFor(() => expect(refreshControl().props.refreshing).toBe(false));
});

test('exposes report errors and retry loads the real query result', async () => {
  failOverviewOnce = true;
  await mount(empty);
  expect(await screen.findByRole('alert')).toHaveTextContent('Report unavailable. Please retry.');
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Start with your first account')).toBeOnTheScreen();
  expect(paths.filter((path) => path.startsWith('reports/overview'))).toHaveLength(2);
});

test('renders exact balances and financial summaries, privacy toggle and transaction navigation', async () => {
  await mount(populated);
  expect(await screen.findByText('₹9,007,199,254,740,993.01')).toBeOnTheScreen();
  expect(screen.getByText('₹1,000.00')).toBeOnTheScreen();
  expect(screen.getByText('₹987.50')).toBeOnTheScreen();
  expect(screen.getByText('Groceries')).toBeOnTheScreen();
  expect(screen.getByText(/^Food ·/)).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Hide total balance' }));
  expect(screen.queryByText('₹9,007,199,254,740,993.01')).not.toBeOnTheScreen();
  expect(screen.getAllByText('••••••').length).toBeGreaterThanOrEqual(4);
  await fireEvent.press(screen.getByRole('button', { name: 'Show total balance' }));
  expect(screen.getByText('₹9,007,199,254,740,993.01')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Add a transaction' }));
  expect(router.push).toHaveBeenCalledWith('/transaction');
  await fireEvent.press(screen.getByRole('button', { name: 'Accounts' }));
  expect(router.push).toHaveBeenCalledWith('/accounts');
  await fireEvent.press(screen.getByRole('button', { name: 'View all transactions' }));
  expect(router.push).toHaveBeenCalledWith('/(tabs)/transactions');
  await fireEvent.press(screen.getByRole('button', { name: 'View spending reports' }));
  expect(router.push).toHaveBeenCalledWith('/(tabs)/reports');
  await fireEvent.press(screen.getByRole('button', { name: 'View or edit Groceries' }));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/transaction',
    params: { id: transaction.id },
  });
});

test('opens profile settings from the dashboard', async () => {
  await mount(empty);
  await screen.findByText('Start with your first account');
  await fireEvent.press(screen.getByRole('button', { name: 'Open settings' }));
  expect(router.push).toHaveBeenCalledWith('/settings');
});

test('labels the offline state while displaying available data', async () => {
  jest.mocked(useNetworkState).mockReturnValue({ isConnected: false, isInternetReachable: false });
  await mount(empty);
  expect(screen.getByText('Offline · Showing saved records')).toBeOnTheScreen();
  expect(await screen.findByText('Start with your first account')).toBeOnTheScreen();
});

test('exposes category errors and retries without discarding the loaded financial summary', async () => {
  failCategoriesOnce = true;
  await mount(populated);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Categories unavailable. Please retry.',
  );
  expect(await screen.findByText('₹9,007,199,254,740,993.01')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText(/^Food ·/)).toBeOnTheScreen();
  expect(paths.filter((path) => path.startsWith('categories'))).toHaveLength(2);
});

test('adds lower dashboard sections with working destinations', async () => {
  await mount(populated);
  await screen.findByText('Budget progress');
  expect(await screen.findByText('No payments awaiting confirmation.')).toBeOnTheScreen();
  expect(screen.getByText('Savings goals')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'View budget progress' }));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/planning',
    params: { section: 'budgets' },
  });
  await fireEvent.press(screen.getByRole('button', { name: 'Start weekly check-in' }));
  expect(router.push).toHaveBeenCalledWith('/weekly-review');
});
