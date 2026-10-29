import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react-native';
import { userSchema } from '@finora/contracts';
import { z } from 'zod';
import { ApiClient, ClientError, type HttpTransport } from '../../src/api/client';
import { SavedDataNotice, useRead } from '../../src/features/finance/shared';
import { AppText } from '../../src/components/ui';
import { useApp } from '../../src/providers/app-provider';
import { testVault } from '../vault-fixture';

jest.mock('../../src/providers/app-provider', () => ({ useApp: jest.fn() }));
jest.mock('expo-network', () => ({ useNetworkState: () => ({ isConnected: true }) }));
const user = userSchema.parse({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Demo',
  email: 'demo@example.com',
  preferences: {},
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});
const schema = z.object({ label: z.string() });
function Page() {
  const read = useRead('fixture', schema);
  return (
    <>
      <SavedDataNotice at={read.cachedAt} />
      <AppText>{read.data?.label ?? (read.isError ? 'Unavailable' : 'Loading')}</AppText>
    </>
  );
}
async function mount(owner = user.id, transport?: HttpTransport) {
  const local = testVault(owner);
  await local.vault.write('read:fixture', { label: 'Synthetic saved record' });
  const api = new ApiClient(
    'https://native.test',
    {
      get: async () => ({ accessToken: 'a'.repeat(43), refreshToken: 'b'.repeat(43) }),
      set: async () => undefined,
      clear: async () => undefined,
    },
    () => undefined,
    transport ??
      (async () => {
        throw new ClientError('NETWORK', 'Offline');
      }),
  );
  jest
    .mocked(useApp)
    .mockReturnValue({ user, api, vault: local.vault } as ReturnType<typeof useApp>);
  await render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      <Page />
    </QueryClientProvider>,
  );
}
test('hydrates persisted records in a new query client and labels the saved timestamp', async () => {
  await mount();
  await screen.findByText('Synthetic saved record');
  expect(screen.queryByText(/Saved on this device/)).toBeNull();
});

test('shows persisted data while a slow connection is still unresolved, then updates quietly', async () => {
  let finish!: (value: Response) => void;
  await mount(
    user.id,
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  await screen.findByText('Synthetic saved record');
  expect(screen.queryByText('Loading')).toBeNull();
  await act(async () => {
    finish(Response.json({ success: true, data: { label: 'Fresh server record' } }));
  });
  await screen.findByText('Fresh server record');
  expect(screen.queryByText('Loading')).toBeNull();
});

test('keeps local data available during a server outage', async () => {
  await mount(user.id, async () =>
    Response.json(
      {
        success: false,
        error: { code: 'SERVICE_UNAVAILABLE', message: 'Please retry.' },
      },
      { status: 503 },
    ),
  );
  await screen.findByText('Synthetic saved record');
  expect(screen.queryByText('Unavailable')).toBeNull();
});
test('does not read another user’s device vault when offline', async () => {
  await mount('22222222-2222-4222-8222-222222222222');
  await screen.findByText('Unavailable');
  expect(screen.queryByText('Synthetic saved record')).toBeNull();
  expect(screen.queryByText(/Saved on this device ·/)).toBeNull();
});
