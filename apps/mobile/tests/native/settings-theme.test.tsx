import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import { settingsUpdateSchema, userSchema, type Preferences } from '@finora/contracts';
import { useColorScheme } from 'react-native';
import { router } from 'expo-router';
import Settings from '../../app/(tabs)/settings';
import { ApiClient, type HttpTransport } from '../../src/api/client';
import { useApp } from '../../src/providers/app-provider';
import { useTheme } from '../../src/theme';

jest.mock('../../src/providers/app-provider', () => ({ useApp: jest.fn() }));
jest.mock('expo-network', () => ({ useNetworkState: jest.fn(() => ({ isConnected: true })) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '99999999-9999-4999-8999-999999999999' }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  usePreventRemove: jest.fn(() => jest.fn()),
}));
jest.mock('expo-linking', () => ({ openURL: jest.fn() }));

const initialUser = userSchema.parse({
  id: '11111111-1111-4111-8111-111111111111',
  email: 'native@example.com',
  name: 'Casey Tester',
  preferences: { preferredTheme: 'light' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});
let savedPreferences: Preferences;
let currentUser: typeof initialUser;
let writes: unknown[];
const refreshUser = jest.fn(async () => {
  currentUser = { ...currentUser, preferences: savedPreferences };
});

beforeEach(() => {
  currentUser = structuredClone(initialUser);
  savedPreferences = structuredClone(initialUser.preferences);
  writes = [];
  jest.mocked(useColorScheme).mockReturnValue('light');
});

async function mount() {
  const transport: HttpTransport = async (_url, options) => {
    if (options?.method === 'PATCH') {
      const input = settingsUpdateSchema.parse(JSON.parse(String(options.body)));
      writes.push(input);
      savedPreferences = input.preferences;
      return Response.json({ success: true, data: { preferences: savedPreferences, version: 2 } });
    }
    return Response.json({
      success: true,
      data: { preferences: savedPreferences, version: writes.length ? 2 : 1 },
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
  jest.mocked(useApp).mockImplementation(() => ({
    api,
    user: currentUser,
    phase: 'ready',
    error: '',
    acceptSession: async () => undefined,
    restore: async () => undefined,
    clearSession: async () => undefined,
    refreshUser,
  }));
  const query = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  await render(
    <QueryClientProvider client={query}>
      <Settings />
    </QueryClientProvider>,
  );
  await screen.findByRole('radio', { name: 'Dark' });
}

test('saves the selected theme through the real versioned mutation before refreshing the profile', async () => {
  await mount();
  expect(screen.getByRole('button', { name: 'Save preferences' })).toBeDisabled();
  expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
  await fireEvent.press(screen.getByRole('radio', { name: 'Dark' }));
  expect(screen.getByRole('button', { name: 'Save preferences' })).toBeEnabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Save preferences' }));
  expect(await screen.findByText('Preferences saved.')).toBeOnTheScreen();
  expect(writes).toEqual([
    { preferences: { ...initialUser.preferences, preferredTheme: 'dark' }, version: 1 },
  ]);
  expect(refreshUser).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
  expect(screen.getByText('Appearance')).toHaveStyle({ color: '#EDF5EF' });
});

test('uses the system scheme when selected and explicit theme preferences override it', async () => {
  await mount();
  const theme = await renderHook(() => useTheme());
  expect(theme.result.current.text).toBe('#16231E');
  currentUser = {
    ...currentUser,
    preferences: { ...currentUser.preferences, preferredTheme: 'system' },
  };
  jest.mocked(useColorScheme).mockReturnValue('dark');
  await theme.rerender(undefined);
  expect(theme.result.current.text).toBe('#EDF5EF');
  currentUser = {
    ...currentUser,
    preferences: { ...currentUser.preferences, preferredTheme: 'light' },
  };
  await theme.rerender(undefined);
  expect(theme.result.current.text).toBe('#16231E');
});

test('settings navigation opens connected management, planning, backup and security destinations', async () => {
  await mount();
  for (const [title, destination] of [
    ['Manage accounts', '/accounts'],
    ['Manage categories', '/categories'],
    ['Export or import your data', '/backup'],
    ['Password and security', '/security'],
  ] as const) {
    await fireEvent.press(screen.getByRole('button', { name: title }));
    expect(router.push).toHaveBeenCalledWith(destination);
  }
  await fireEvent.press(screen.getByRole('button', { name: 'Savings goals' }));
  await waitFor(() =>
    expect(router.push).toHaveBeenCalledWith({ pathname: '/planning', params: { mode: 'goals' } }),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Recurring transactions' }));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/planning',
    params: { mode: 'recurring' },
  });
});
