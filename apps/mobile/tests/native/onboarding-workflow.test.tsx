import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { accountWithBalanceSchema, userSchema } from '@finora/contracts';
import { router } from 'expo-router';
import Onboarding from '../../app/onboarding';
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
import { testVault } from '../vault-fixture';
import { saveSetup, readSetup } from '../../src/storage/setup';
import { randomUUID } from 'expo-crypto';
let local: ReturnType<typeof testVault>;
const request = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  useUi.getState().reset();
});
async function mount(options: { existing?: boolean; failSave?: boolean; unknown?: boolean } = {}) {
  local = testVault(user.id);
  if (!options.unknown)
    await local.vault.write(
      'read:accounts?includeArchived=true',
      options.existing
        ? [
            accountWithBalanceSchema.parse({
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
            }),
          ]
        : [],
    );
  jest.mocked(useApp).mockReturnValue({
    api: { request },
    user,
    vault: local.vault,
    syncPending: jest.fn(async () => undefined),
    saveOnboarding: async (body: Parameters<ReturnType<typeof useApp>['saveOnboarding']>[0]) => {
      if (options.failSave) throw new Error('Cannot save securely.');
      await saveSetup(local.vault, user, randomUUID(), body);
    },
  } as unknown as ReturnType<typeof useApp>);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={client}>
      <Onboarding />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByRole('button', { name: 'Get started' })).toBeEnabled());
}
async function firstAccountStep() {
  await fireEvent.press(screen.getByRole('button', { name: 'Get started' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled());
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByLabelText('Account name');
}
test('setup can be postponed with a durable local completion and no HTTP requests', async () => {
  await mount();
  await fireEvent.press(screen.getByRole('button', { name: 'Set up later' }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(tabs)'));
  const saved = await readSetup(local.vault);
  expect(saved?.user.onboardingCompletedAt).toBeDefined();
  expect(saved?.account).toBeUndefined();
  expect(request).not.toHaveBeenCalled();
});
test('first-account review saves exact minor units locally only after confirmation', async () => {
  await mount();
  await firstAccountStep();
  await fireEvent.changeText(screen.getByLabelText('Starting balance (INR)'), '125.50');
  await fireEvent.press(screen.getByRole('button', { name: 'Review first account' }));
  expect(await readSetup(local.vault)).toBeUndefined();
  await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(tabs)'));
  expect((await readSetup(local.vault))?.account?.openingBalanceMinor).toBe('12550');
  expect(request).not.toHaveBeenCalled();
});
test('a failed local save does not dismiss setup', async () => {
  await mount({ failSave: true });
  await fireEvent.press(screen.getByRole('button', { name: 'Set up later' }));
  await screen.findByText('Cannot save securely.');
  expect(router.replace).not.toHaveBeenCalled();
  expect(await readSetup(local.vault)).toBeUndefined();
});
test.each([{ existing: true }, { unknown: true }])(
  'never assumes absent local records mean a new account is needed: %s',
  async (options) => {
    await mount(options);
    await fireEvent.press(screen.getByRole('button', { name: 'Get started' }));
    await screen.findByText('Base currency: INR');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.queryByLabelText('Account name')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Finish setup' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect((await readSetup(local.vault))?.account).toBeUndefined();
    expect(request).not.toHaveBeenCalled();
  },
);
