import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { accountWithBalanceSchema, userSchema } from '@finora/contracts';
import { formatMoney } from '@finora/finance-core';
import { router, useLocalSearchParams } from 'expo-router';
import AccountScreen from '../../app/account';
import { ApiClient } from '../../src/api/client';
import { useApp } from '../../src/providers/app-provider';

jest.mock('../../src/providers/app-provider', () => ({ useApp: jest.fn() }));
jest.mock('expo-network', () => ({ useNetworkState: () => ({ isConnected: true }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '99999999-9999-4999-8999-999999999999' }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: jest.fn(),
  usePreventRemove: jest.fn(() => jest.fn()),
}));

const timestamp = '2026-01-01T00:00:00.000Z';
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
  name: 'Everyday',
  type: 'CHECKING',
  currency: 'INR',
  openingBalanceMinor: '10000',
  balanceMinor: '900719925474099301',
  archived: false,
  version: 2,
  createdAt: timestamp,
  updatedAt: timestamp,
});

async function mount(existing = false) {
  const writes: unknown[] = [];
  jest.mocked(useLocalSearchParams).mockReturnValue(existing ? { id: account.id } : {});
  const api = new ApiClient(
    'https://native.test',
    {
      get: async () => ({ accessToken: 'a'.repeat(43), refreshToken: 'b'.repeat(43) }),
      set: async () => undefined,
      clear: async () => undefined,
    },
    () => undefined,
    async (_url, options) => {
      if (options?.method !== 'GET') writes.push(JSON.parse(String(options?.body)) as unknown);
      return Response.json({ success: true, data: account });
    },
  );
  jest.mocked(useApp).mockReturnValue({ api, user } as ReturnType<typeof useApp>);
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  await render(
    <QueryClientProvider client={client}>
      <AccountScreen />
    </QueryClientProvider>,
  );
  await screen.findByLabelText('Account name');
  return writes;
}

test('reviews a new opening balance before posting and closing review preserves the form', async () => {
  const writes = await mount();
  await fireEvent.changeText(screen.getByLabelText('Account name'), 'Wallet');
  await fireEvent.changeText(screen.getByLabelText('Opening balance (INR)'), '12.34');
  await fireEvent.press(screen.getByRole('button', { name: 'Review account' }));
  expect(writes).toHaveLength(0);
  await fireEvent.press(screen.getByRole('button', { name: 'Close Review account' }));
  expect(screen.getByLabelText('Opening balance (INR)')).toHaveDisplayValue('12.34');
  await fireEvent.press(screen.getByRole('button', { name: 'Review account' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
  await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ name: 'Wallet', openingBalanceMinor: '1234' });
  expect(writes[0]).not.toHaveProperty('userId');
});

test('previews an opening-balance adjustment with exact arithmetic before the versioned update', async () => {
  const writes = await mount(true);
  await fireEvent.changeText(screen.getByLabelText('Opening balance (INR)'), '150');
  await fireEvent.press(screen.getByRole('button', { name: 'Review account' }));
  expect(writes).toHaveLength(0);
  expect(screen.getByText(formatMoney('900719925474104301', 'INR', 'en-IN'))).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toMatchObject({ openingBalanceMinor: '15000', version: 2 });
});
