import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import {
  budgetInputSchema,
  accountWithBalanceSchema,
  categorySchema,
  contributionInputSchema,
  goalProgressSchema,
  occurrenceConfirmSchema,
  recurringOccurrenceSchema,
  recurringRuleSchema,
  userSchema,
} from '@finora/contracts';
import { calendarDate } from '@finora/finance-core';
import type { ReactNode } from 'react';
import { Budgets } from '../../src/features/planning/budgets';
import { Goals } from '../../src/features/planning/goals';
import { Recurring } from '../../src/features/planning/recurring';
import { ApiClient, type HttpTransport } from '../../src/api/client';
import { useApp } from '../../src/providers/app-provider';

jest.mock('../../src/providers/app-provider', () => ({ useApp: jest.fn() }));
jest.mock('expo-network', () => ({ useNetworkState: () => ({ isConnected: true }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '99999999-9999-4999-8999-999999999999' }));
jest.mock('expo-router', () => ({ usePreventRemove: jest.fn(() => jest.fn()) }));
const now = '2026-10-21T12:00:00.000Z';
const user = userSchema.parse({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Casey',
  email: 'native@example.com',
  preferences: { locale: 'en-IN' },
  createdAt: now,
  updatedAt: now,
});
const category = categorySchema.parse({
  id: '22222222-2222-4222-8222-222222222222',
  userId: user.id,
  name: 'Food',
  type: 'EXPENSE',
  archived: false,
  version: 1,
  createdAt: now,
  updatedAt: now,
});
async function mount(
  transport: HttpTransport,
  content: ReactNode = <Budgets onEditing={jest.fn()} />,
) {
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
  await render(<QueryClientProvider client={client}>{content}</QueryClientProvider>);
}
test('chooses a budget month and year without typing and uses it in the exact create request', async () => {
  const paths: string[] = [];
  const writes: unknown[] = [];
  await mount(async (url, options) => {
    const parsed = new URL(url);
    paths.push(parsed.pathname + parsed.search);
    if (options?.method === 'POST') {
      const input = budgetInputSchema.parse(JSON.parse(String(options.body)));
      writes.push(input);
      return Response.json({
        success: true,
        data: {
          ...input,
          currency: 'INR',
          id: '33333333-3333-4333-8333-333333333333',
          userId: user.id,
          version: 1,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
    return Response.json({
      success: true,
      data: parsed.pathname.endsWith('categories') ? [category] : [],
    });
  });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Add monthly budget' })).toBeEnabled(),
  );
  const first = paths.find((path) => path.includes('budgets?'))!;
  const initialMonth = new URL(`https://native.test${first}`).searchParams.get('month')!;
  const target = `${Number(initialMonth.slice(0, 4)) + 1}-02`;
  await fireEvent.press(screen.getByRole('button', { name: 'Choose budget month' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Next year' }));
  await fireEvent.press(screen.getByRole('radio', { name: target }));
  await waitFor(() => expect(paths).toContain(`/api/v1/budgets?month=${target}`));
  await fireEvent.press(screen.getByRole('button', { name: 'Add monthly budget' }));
  expect(screen.getByRole('button', { name: 'Choose budget month' })).toHaveAccessibilityValue({
    text: `February ${Number(initialMonth.slice(0, 4)) + 1}`,
  });
  await fireEvent.press(screen.getByRole('button', { name: 'Expense category' }));
  await fireEvent.press(screen.getByRole('radio', { name: 'Food' }));
  await fireEvent.changeText(screen.getByLabelText('Spending limit (INR)'), '1000.25');
  await fireEvent.press(screen.getByRole('button', { name: 'Save budget' }));
  await waitFor(() =>
    expect(writes).toEqual([
      {
        categoryId: category.id,
        month: target,
        amountMinor: '100025',
        warningThresholdBasisPoints: 8000,
        rollover: false,
      },
    ]),
  );
  expect(await screen.findByRole('button', { name: 'Add monthly budget' })).toBeOnTheScreen();
});

test('checking recurring reminders does not post money until explicit review and confirmation', async () => {
  const account = accountWithBalanceSchema.parse({
    id: '66666666-6666-4666-8666-666666666666',
    userId: user.id,
    name: 'Main',
    type: 'CASH',
    currency: 'INR',
    archived: false,
    balanceMinor: '100000',
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  const rule = recurringRuleSchema.parse({
    id: '77777777-7777-4777-8777-777777777777',
    userId: user.id,
    name: 'Monthly lunch',
    type: 'EXPENSE',
    accountId: account.id,
    categoryId: category.id,
    amountMode: 'FIXED',
    amountMinor: '25000',
    postingPolicy: 'CONFIRM_EACH',
    frequency: 'MONTHLY',
    startDate: '2026-10-21',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    paused: false,
    nextIndex: 0,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  const occurrence = recurringOccurrenceSchema.parse({
    id: '88888888-8888-4888-8888-888888888888',
    userId: user.id,
    ruleId: rule.id,
    ruleVersion: 1,
    dueDate: '2026-10-21',
    occurrenceIndex: 0,
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    type: 'EXPENSE',
    accountId: account.id,
    categoryId: category.id,
    amountMode: 'FIXED',
    amountMinor: '25000',
    status: 'PENDING',
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  let generated = false;
  let posted = false;
  const writes: { path: string; body: unknown }[] = [];
  await mount(
    async (url, options) => {
      const parsed = new URL(url);
      const path = parsed.pathname.replace('/api/v1/', '');
      if (options?.method === 'POST') {
        const body: unknown = JSON.parse(String(options.body));
        writes.push({ path, body });
        if (path === 'recurring/generate') {
          generated = true;
          return Response.json({
            success: true,
            data: { occurrences: [occurrence], moreDue: false },
          });
        }
        const input = occurrenceConfirmSchema.parse(body);
        posted = true;
        return Response.json({
          success: true,
          data: {
            occurrence: { ...occurrence, status: 'POSTED', version: 2 },
            transaction: {
              id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              userId: user.id,
              type: 'EXPENSE',
              accountId: account.id,
              categoryId: category.id,
              currency: 'INR',
              amountMinor: input.amountMinor,
              date: input.date,
              version: 1,
              createdAt: now,
              updatedAt: now,
            },
          },
        });
      }
      const data =
        path === 'recurring'
          ? [rule]
          : path === 'accounts'
            ? [account]
            : path === 'categories'
              ? [category]
              : parsed.searchParams.get('status') === 'POSTED'
                ? posted
                  ? [{ ...occurrence, status: 'POSTED' }]
                  : []
                : generated && !posted
                  ? [occurrence]
                  : [];
      return Response.json({ success: true, data });
    },
    <Recurring onEditing={jest.fn()} />,
  );
  await screen.findByText('No upcoming items');
  expect(writes).toHaveLength(0);
  await fireEvent.press(screen.getByRole('button', { name: 'Check due items' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Review and confirm' }));
  expect(writes).toEqual([{ path: 'recurring/generate', body: {} }]);
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm and record transaction' }));
  await screen.findByText('No upcoming items');
  expect(writes[1]).toEqual({
    path: `recurring-occurrences/${occurrence.id}/confirm`,
    body: { version: 1, amountMinor: '25000', date: '2026-10-21T06:30:00.000Z' },
  });
  await fireEvent.press(screen.getByRole('radio', { name: 'Posted' }));
  expect(await screen.findByText('Recorded in Transactions')).toBeOnTheScreen();
});

test('opens goal progress and records calendar-selected saved money without ledger requests', async () => {
  const goal = goalProgressSchema.parse({
    id: '44444444-4444-4444-8444-444444444444',
    userId: user.id,
    name: 'Rainy day',
    currency: 'INR',
    targetMinor: '1000000',
    savedMinor: '0',
    remainingMinor: '1000000',
    complete: false,
    archived: false,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  const writes: unknown[] = [];
  const paths: string[] = [];
  const savedDate = `${calendarDate(new Date(), user.preferences.timezone).slice(0, 7)}-01`;
  await mount(
    async (url, options) => {
      const path = new URL(url).pathname;
      paths.push(path);
      if (options?.method === 'POST') {
        const input = contributionInputSchema.parse(JSON.parse(String(options.body)));
        writes.push(input);
        goal.savedMinor = input.amountMinor;
        goal.remainingMinor = (BigInt(goal.targetMinor) - BigInt(input.amountMinor)).toString();
        goal.version = 2;
        return Response.json({
          success: true,
          data: {
            contribution: {
              id: '55555555-5555-4555-8555-555555555555',
              userId: user.id,
              goalId: goal.id,
              amountMinor: input.amountMinor,
              date: input.date,
              createdAt: now,
            },
            goalVersion: 2,
          },
        });
      }
      return Response.json({
        success: true,
        data: path.endsWith('/goals') ? [goal] : { ...goal, contributions: [] },
      });
    },
    <Goals onEditing={jest.fn()} />,
  );
  await fireEvent.press(await screen.findByRole('button', { name: 'Open Rainy day goal' }));
  await screen.findByText('Add saved money');
  expect(screen.getByRole('button', { name: 'Record contribution' })).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Contribution (INR)'), '1250.50');
  await fireEvent.press(screen.getByRole('button', { name: 'Saved on' }));
  await fireEvent.press(screen.getByRole('button', { name: `Select ${savedDate}` }));
  await fireEvent.press(screen.getByRole('button', { name: 'Record contribution' }));
  expect(
    await screen.findByText('Contribution recorded. Account balances are unchanged.'),
  ).toBeOnTheScreen();
  expect(writes).toEqual([{ amountMinor: '125050', date: savedDate, version: 1 }]);
  expect(paths.every((path) => path.startsWith('/api/v1/goals'))).toBe(true);
  expect(screen.getByLabelText('Contribution (INR)')).toHaveDisplayValue('');
});
