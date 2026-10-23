import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { accountWithBalanceSchema, userSchema } from '@finora/contracts';
import { router } from 'expo-router';
import Onboarding from '../../app/onboarding';
import { ApiClient } from '../../src/api/client';
import { useApp } from '../../src/providers/app-provider';
import { useUi } from '../../src/stores/ui';

jest.mock('../../src/providers/app-provider', () => ({ useApp: jest.fn() }));
jest.mock('expo-network', () => ({ useNetworkState: () => ({ isConnected: true }) }));
jest.mock('expo-crypto', () => ({
  randomUUID: () => jest.requireActual<{ randomUUID: () => string }>('node:crypto').randomUUID(),
}));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
  usePreventRemove: jest.fn(() => jest.fn()),
}));
const timestamp = '2026-10-23T12:00:00.000Z';
const user = userSchema.parse({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Demo',
  email: 'demo@example.com',
  preferences: {},
  createdAt: timestamp,
  updatedAt: timestamp,
});
let writes: { path: string; body: Record<string, unknown> }[];
beforeEach(() => {
  writes = [];
  useUi.getState().reset();
});
async function mount(options: { existing?: boolean; failCompleteOnce?: boolean } = {}) {
  const account = accountWithBalanceSchema.parse({
    id: '22222222-2222-4222-8222-222222222222',
    userId: user.id,
    name: 'Everyday',
    type: 'CHECKING',
    openingBalanceMinor: '0',
    balanceMinor: '0',
    currency: 'INR',
    version: 1,
    archived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  let accounts = options.existing ? [account] : [];
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
      const path = new URL(url).pathname.replace('/api/v1/', '');
      if (init?.method !== 'GET') {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        writes.push({ path, body });
        if (path === 'accounts') {
          accounts = [{ ...account, ...body }];
          return Response.json({ success: true, data: accounts[0] });
        }
        if (path === 'onboarding/complete') {
          if (options.failCompleteOnce && !failed) {
            failed = true;
            return Response.json(
              {
                success: false,
                error: { code: 'SERVICE_UNAVAILABLE', message: 'Please retry setup completion.' },
              },
              { status: 503 },
            );
          }
          return Response.json({
            success: true,
            data: { ...user, onboardingCompletedAt: timestamp },
          });
        }
      }
      return Response.json({
        success: true,
        data: path.startsWith('accounts')
          ? accounts
          : { preferences: user.preferences, version: 1 },
      });
    },
  );
  jest.mocked(useApp).mockReturnValue({
    api,
    user,
    refreshUser: jest.fn(async () => undefined),
  } as unknown as ReturnType<typeof useApp>);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  await render(
    <QueryClientProvider client={client}>
      <Onboarding />
    </QueryClientProvider>,
  );
  await screen.findByText('Finora AI Money Manager');
}
async function firstAccountStep() {
  await fireEvent.press(screen.getByRole('button', { name: 'Get started' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled());
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByLabelText('Account name');
}
test('setup can be postponed without creating an account or transaction', async () => {
  await mount();
  await fireEvent.press(screen.getByRole('button', { name: 'Set up later' }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(tabs)'));
  expect(writes.map((w) => w.path)).toEqual(['onboarding/complete']);
  expect(useUi.getState().onboardingDismissedOwner).toBe(user.id);
});
test('first-account review does not write until confirmed and retrying completion never duplicates it', async () => {
  await mount({ failCompleteOnce: true });
  await firstAccountStep();
  await fireEvent.changeText(screen.getByLabelText('Starting balance (INR)'), '125.50');
  await fireEvent.press(screen.getByRole('button', { name: 'Review first account' }));
  expect(writes).toHaveLength(0);
  await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
  await screen.findByText('Please retry setup completion.');
  expect(writes.filter((w) => w.path === 'accounts')).toHaveLength(1);
  expect(writes.find((w) => w.path === 'accounts')?.body).toMatchObject({
    openingBalanceMinor: '12550',
  });
  expect(router.replace).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Finish setup' }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(tabs)'));
  expect(writes.filter((w) => w.path === 'accounts')).toHaveLength(1);
  expect(writes.some((w) => w.path === 'transactions')).toBe(false);
});
test('revisiting setup preserves an existing account and currency', async () => {
  await mount({ existing: true });
  await fireEvent.press(screen.getByRole('button', { name: 'Get started' }));
  await screen.findByText('Base currency: INR');
  expect(screen.queryByRole('button', { name: 'Base currency' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByText('Your account is ready');
  expect(screen.queryByLabelText('Account name')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Finish setup' }));
  await waitFor(() => expect(router.replace).toHaveBeenCalled());
  expect(writes.map((w) => w.path)).toEqual(['onboarding/complete']);
});
