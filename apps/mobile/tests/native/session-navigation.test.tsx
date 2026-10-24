import { useSyncExternalStore, type ReactNode } from 'react';
import { Text, Pressable } from 'react-native';
import { Link, Stack } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { userSchema, type User } from '@finora/contracts';
import Root from '../../app/_layout';
import Index from '../../app/index';
import AuthLayout from '../../app/(auth)/_layout';
import { useApp } from '../../src/providers/app-provider';
import { ApiClient } from '../../src/api/client';

jest.mock('../../src/providers/app-provider', () => ({
  AppProvider: ({ children }: { children: ReactNode }) => children,
  useApp: jest.fn(),
}));
jest.mock('../../src/providers/app-lock-provider', () => ({
  AppLockProvider: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('expo-font', () => ({ useFonts: () => [true, null], isLoaded: () => true }));

const demo = userSchema.parse({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Demo',
  email: 'demo@example.com',
  preferences: {},
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});
let session: User | null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
function selectSession(user: User | null) {
  session = user;
  listeners.forEach((listener) => listener());
}
function DemoHome() {
  const { clearSession } = useApp();
  return (
    <>
      <Text>Private dashboard</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        onPress={() => {
          void clearSession();
        }}
      >
        <Text>Sign out</Text>
      </Pressable>
    </>
  );
}
const Login = () => <Text>Sign in to Finora</Text>;
const Register = () => (
  <>
    <Text>Create a Finora account</Text>
    <Link href="/(auth)/login">Already have an account? Sign in</Link>
  </>
);
const PrivatePage = () => <Text>Private financial record</Text>;

async function mount(initialUser: User | null, initialUrl: string) {
  session = initialUser;
  const api = new ApiClient(
    'https://example.com',
    { get: async () => null, set: async () => undefined, clear: async () => undefined },
    () => undefined,
  );
  jest.mocked(useApp).mockImplementation(function useTestApp() {
    return {
      user: useSyncExternalStore(subscribe, () => session),
      api,
      phase: 'ready',
      error: '',
      clearSession: async () => selectSession(null),
      acceptSession: async (tokens) => selectSession(tokens.user),
      restore: async () => undefined,
      saveOnboarding: async () => undefined,
      refreshUser: async () => undefined,
      storageError: '',
      syncing: false,
      syncPending: async () => undefined,
    };
  });
  await renderRouter(
    {
      _layout: Root,
      index: Index,
      '(auth)/_layout': AuthLayout,
      '(auth)/login': Login,
      '(auth)/register': Register,
      '(tabs)/_layout': () => <Stack screenOptions={{ headerShown: false }} />,
      '(tabs)/index': DemoHome,
      account: PrivatePage,
      accounts: PrivatePage,
      transaction: PrivatePage,
      categories: PrivatePage,
      security: PrivatePage,
      planning: PrivatePage,
      backup: PrivatePage,
    },
    { initialUrl },
  );
}

test('sign-out reaches signup without restarting and authentication restores the dashboard', async () => {
  await mount(demo, '/(tabs)');
  expect(await screen.findByText('Private dashboard')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  expect(await screen.findByText('Create a Finora account')).toBeVisible();
  expect(screen.queryByText('Private dashboard')).not.toBeVisible();
  await act(() => selectSession(demo));
  await waitFor(() => expect(screen.getByText('Private dashboard')).toBeVisible());
});

test('an unauthenticated private deep link resolves to signup', async () => {
  await mount(null, '/transaction');
  expect(await screen.findByText('Create a Finora account')).toBeVisible();
  expect(screen.queryByText('Private financial record')).not.toBeVisible();
});

test('first launch opens signup and an existing user can choose sign in', async () => {
  await mount(null, '/');
  expect(await screen.findByText('Create a Finora account')).toBeVisible();
  await fireEvent.press(screen.getByText('Already have an account? Sign in'));
  expect(await screen.findByText('Sign in to Finora')).toBeVisible();
});
