import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { reportSummarySchema, userSchema } from '@finora/contracts';
import * as Sharing from 'expo-sharing';
import Reports from '../../app/(tabs)/reports';
import { ApiClient, type HttpTransport } from '../../src/api/client';
import { useApp } from '../../src/providers/app-provider';

jest.mock('../../src/providers/app-provider', () => ({ useApp: jest.fn() }));
jest.mock('expo-network', () => ({ useNetworkState: () => ({ isConnected: true }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'test-report' }));
const mockWrite = jest.fn();
const mockDelete = jest.fn();
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'cache' },
  File: jest.fn().mockImplementation(() => ({
    uri: 'file:///cache/test-report.csv',
    exists: true,
    create: jest.fn(),
    write: mockWrite,
    delete: mockDelete,
  })),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));
const user = userSchema.parse({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Casey',
  email: 'native@example.com',
  preferences: { locale: 'en-IN', timezone: 'Asia/Kolkata' },
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
});
const report = reportSummarySchema.parse({
  period: {
    range: 'current-month',
    from: '2026-10-01',
    to: '2026-10-31',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
  },
  cashflow: {
    incomeMinor: '80000',
    expensesMinor: '557000',
    netMinor: '-477000',
    savingsRateBasisPoints: '-59625',
  },
  categories: [
    {
      categoryId: '22222222-2222-4222-8222-222222222222',
      name: 'Food',
      type: 'EXPENSE',
      amountMinor: '557000',
      shareBasisPoints: 10000,
    },
  ],
  accounts: [
    {
      accountId: '33333333-3333-4333-8333-333333333333',
      name: 'Main',
      archived: false,
      openingBalanceMinor: '0',
      closingBalanceMinor: '-477000',
      incomeMinor: '80000',
      expensesMinor: '557000',
      transferInMinor: '0',
      transferOutMinor: '0',
      netMinor: '-477000',
    },
  ],
  trends: [
    { month: '2026-10', incomeMinor: '80000', expensesMinor: '557000', netMinor: '-477000' },
  ],
});
let paths: string[];
beforeEach(() => {
  paths = [];
});
async function mount() {
  const transport: HttpTransport = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/reports/insights')) {
      const month = parsed.searchParams.get('month') ?? '2026-10';
      return Response.json({
        success: true,
        data: {
          month,
          through: `${month}-23`,
          previousFrom: '2026-09-01',
          previousThrough: '2026-09-23',
          days: 23,
          previousDays: 23,
          partial: true,
          spentMinor: '0',
          previousSpentMinor: '0',
          dailyAverageMinor: '0',
          changeMinor: '0',
          changeBasisPoints: null,
          currency: 'INR',
          timezone: 'Asia/Kolkata',
          categoryChanges: [],
        },
      });
    }
    if (!parsed.pathname.endsWith('/reports/summary'))
      return Response.json({
        success: true,
        data: parsed.pathname.endsWith('/transactions')
          ? { items: [], total: 0, page: 1, pageSize: 1 }
          : [],
      });
    paths.push(parsed.search);
    const range = parsed.searchParams.get('range');
    return Response.json({
      success: true,
      data: {
        ...report,
        period: {
          ...report.period,
          range,
          from:
            parsed.searchParams.get('from') ??
            (range === 'previous-month' ? '2026-09-01' : '2026-10-01'),
          to:
            parsed.searchParams.get('to') ??
            (range === 'previous-month' ? '2026-09-30' : '2026-10-31'),
        },
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
      <Reports />
    </QueryClientProvider>,
  );
  await screen.findByText('Net cash flow');
  await screen.findByText('Spending overview');
}
async function choosePeriod(name: string) {
  await fireEvent.press(screen.getByRole('button', { name: 'Period' }));
  await fireEvent.press(screen.getByRole('radio', { name }));
}
beforeAll(() => {
  jest.useFakeTimers({
    now: new Date('2026-10-15T08:00:00Z'),
    doNotFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'setImmediate',
      'clearImmediate',
      'nextTick',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'performance',
    ],
  });
});
afterAll(() => {
  jest.useRealTimers();
});

async function chooseDate(label: string, date: string) {
  await fireEvent.press(screen.getByRole('button', { name: label }));
  await fireEvent.press(screen.getByRole('button', { name: `Select ${date}` }));
}

test('shows totals with account details and calculation explanations collapsed', async () => {
  await mount();
  expect(screen.queryByText('Opening balance')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Monthly summary' }));
  expect(await screen.findByText('Spending insights')).toBeOnTheScreen();
  expect(screen.getAllByText('-₹4,770.00').length).toBeGreaterThan(0);
  expect(screen.getByText('Expenses exceeded income in this period')).toBeOnTheScreen();
  expect(screen.queryByText('Opening balance')).toBeNull();
  expect(screen.queryByText('Cash flow over time')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Account details: Main' }));
  expect(screen.getByText('Opening balance')).toBeOnTheScreen();
  expect(screen.getByText('Transfers out')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'About this report' }));
  expect(screen.getByText('Savings rate: −596.25%')).toBeOnTheScreen();
  expect(screen.getByText(/full start and end days in Asia\/Kolkata/)).toBeOnTheScreen();
});
test('cancel preserves the selected period and invalid custom dates never request a report', async () => {
  await mount();
  await choosePeriod('Custom dates');
  await chooseDate('From date', '2026-10-20');
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('button', { name: 'Period' })).toHaveAccessibilityValue({
    text: 'This month',
  });
  expect(paths.filter((path) => path.includes('2026-10-20'))).toHaveLength(0);
  await choosePeriod('Custom dates');
  await chooseDate('From date', '2026-10-20');
  await chooseDate('Through date', '2026-10-10');
  await fireEvent.press(screen.getByRole('button', { name: 'Apply dates' }));
  expect(screen.getByRole('alert')).toHaveTextContent('End must follow start');
  expect(paths.filter((path) => path.includes('2026-10-20'))).toHaveLength(0);
  await chooseDate('Through date', '2026-10-31');
  await fireEvent.press(screen.getByRole('button', { name: 'Apply dates' }));
  await waitFor(() => expect(paths).toContain('?range=custom&from=2026-10-20&to=2026-10-31'));
  expect(await screen.findByRole('button', { name: 'Period' })).toHaveAccessibilityValue({
    text: 'Custom dates',
  });
  expect(screen.queryByRole('button', { name: 'Apply dates' })).toBeNull();
});
test('preset selection updates export data and temporary files are removed after success or failure', async () => {
  await mount();
  await choosePeriod('Last month');
  await waitFor(() => expect(paths).toContain('?range=previous-month'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Export CSV' })).toBeEnabled());
  jest.mocked(Sharing.shareAsync).mockRejectedValueOnce(new Error('Sharing cancelled'));
  await fireEvent.press(screen.getByRole('button', { name: 'Export CSV' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Sharing cancelled');
  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(mockWrite.mock.calls[0]?.[0]).toContain('"2026-09-01","2026-09-30"');
  await fireEvent.press(screen.getByRole('button', { name: 'Export CSV' }));
  await waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(2));
  expect(Sharing.shareAsync).toHaveBeenCalledWith(
    'file:///cache/test-report.csv',
    expect.objectContaining({ mimeType: 'text/csv' }),
  );
});
