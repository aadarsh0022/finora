import { ApiClient } from '../../src/api/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { userSchema } from '@finora/contracts';
import { useNetworkState } from 'expo-network';
import SyncStatus from '../../app/sync';
import { useApp } from '../../src/providers/app-provider';
import { queuedTransactionSchema } from '../../src/storage/outbox';
import { testVault } from '../vault-fixture';

jest.mock('../../src/providers/app-provider', () => ({ useApp: jest.fn() }));
jest.mock('expo-network', () => ({ useNetworkState: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const stamp = '2026-01-01T00:00:00.000Z';
const user = userSchema.parse({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Demo',
  email: 'demo@example.com',
  preferences: {},
  createdAt: stamp,
  updatedAt: stamp,
});
const entry = queuedTransactionSchema.parse({
  id: '22222222-2222-4222-8222-222222222222',
  ownerId: user.id,
  state: 'ATTENTION',
  code: 'CONFLICT',
  createdAt: stamp,
  body: {
    type: 'EXPENSE',
    amountMinor: '1250',
    accountId: '33333333-3333-4333-8333-333333333333',
    categoryId: '44444444-4444-4444-8444-444444444444',
    date: stamp,
  },
});

async function mount(offline = false, unreadable = false) {
  const { vault } = testVault(user.id);
  await vault.write(`pending:${entry.id}`, entry);
  if (unreadable)
    jest.spyOn(vault, 'list').mockRejectedValue(new Error('Could not read pending entries.'));
  const syncPending = jest.fn(async () => undefined);
  jest
    .mocked(useNetworkState)
    .mockReturnValue({ isConnected: !offline, isInternetReachable: !offline });
  jest.mocked(useApp).mockReturnValue({
    user,
    vault,
    syncPending,
    syncing: false,
    api: new ApiClient(
      'https://native.test',
      { get: async () => null, set: async () => undefined, clear: async () => undefined },
      () => undefined,
    ),
    phase: 'ready',
    error: '',
    storageError: '',
    acceptSession: async () => undefined,
    restore: async () => undefined,
    clearSession: async () => undefined,
    saveOnboarding: async () => undefined,
    refreshUser: async () => undefined,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={client}>
      <SyncStatus />
    </QueryClientProvider>,
  );
  return { vault, syncPending };
}

test('offline sync is disabled and a conflict is shown as needing review, not posted money', async () => {
  const { syncPending } = await mount(true);
  await screen.findByText(
    'Check that the account and category are still available, then try again.',
  );
  expect(screen.queryByRole('button', { name: 'Sync now' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Retry this entry' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'View pending sync' })).toBeNull();
  expect(syncPending).not.toHaveBeenCalled();
});

test('retry preserves the original amount, body and operation key', async () => {
  const { vault, syncPending } = await mount();
  await fireEvent.press(await screen.findByRole('button', { name: 'Retry this entry' }));
  await waitFor(() => expect(syncPending).toHaveBeenCalledTimes(1));
  const saved = await vault.read(`pending:${entry.id}`, queuedTransactionSchema);
  expect(saved?.value).toEqual({ ...entry, state: 'PENDING', code: '' });
});

test('an unreadable pending list is never presented as an empty, synced queue', async () => {
  await mount(false, true);
  await screen.findByText('Could not read pending entries.');
  expect(screen.queryByText('No pending transactions')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Sync now' })).toBeNull();
});
