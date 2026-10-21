import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { budgetInputSchema, categorySchema, userSchema } from '@finora/contracts';
import { Budgets } from '../../src/features/planning/budgets';
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
async function mount(transport: HttpTransport) {
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
      <Budgets onEditing={jest.fn()} />
    </QueryClientProvider>,
  );
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
});
