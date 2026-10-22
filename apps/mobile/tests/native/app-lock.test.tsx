import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AppState, Text, type AppStateStatus } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { userSchema, type User } from '@finora/contracts';
import { ApiClient } from '../../src/api/client';
import { AppLockProvider } from '../../src/providers/app-lock-provider';
import { useApp } from '../../src/providers/app-provider';

jest.mock('../../src/providers/app-provider', () => ({ useApp: jest.fn() }));
jest.mock('expo-network', () => ({ useNetworkState: jest.fn(() => ({ isConnected: true })) }));
jest.mock('expo-local-authentication', () => ({
  SecurityLevel: { BIOMETRIC_STRONG: 3 },
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  getEnrolledLevelAsync: jest.fn(),
  authenticateAsync: jest.fn(),
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
}));

const account = userSchema.parse({
  id: '11111111-1111-4111-8111-111111111111',
  email: 'native@example.com',
  name: 'Casey Tester',
  preferences: {},
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});
const policyKey = `finora.app-lock.v1.${account.id}`;
let currentUser: User | null;
let lifecycle: (state: AppStateStatus) => void;
const clearSession = jest.fn<Promise<void>, []>();

beforeEach(() => {
  currentUser = account;
  lifecycle = () => undefined;
  AppState.currentState = 'active';
  jest.spyOn(AppState, 'addEventListener').mockImplementation((event, listener) => {
    if (event === 'change') lifecycle = listener;
    return { remove: jest.fn() };
  });
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue('enabled');
  jest.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined);
  jest.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValue(true);
  jest.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValue(true);
  jest
    .mocked(LocalAuthentication.getEnrolledLevelAsync)
    .mockResolvedValue(LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG);
  jest.mocked(LocalAuthentication.authenticateAsync).mockResolvedValue({ success: true });
  clearSession.mockImplementation(async () => {
    currentUser = null;
  });
});

async function mount() {
  const api = new ApiClient(
    'https://native.test',
    { get: async () => null, set: async () => undefined, clear: async () => undefined },
    () => undefined,
  );
  jest.mocked(useApp).mockImplementation(() => ({
    api,
    user: currentUser,
    phase: 'ready',
    error: '',
    acceptSession: async () => undefined,
    restore: async () => undefined,
    clearSession,
    refreshUser: async () => undefined,
  }));
  await render(
    <AppLockProvider>
      <Text>Private balance ₹100</Text>
    </AppLockProvider>,
  );
}

function expectHidden() {
  expect(screen.queryByText('Private balance ₹100')).not.toBeOnTheScreen();
  expect(
    screen.getByText('Private balance ₹100', { includeHiddenElements: true }),
  ).not.toBeVisible();
  const modal = screen.container.queryAll((instance) => instance.type === 'Modal');
  expect(modal).toHaveLength(1);
  expect(modal[0]?.props).toMatchObject({ visible: true, presentationStyle: 'fullScreen' });
}

test('hides financial content immediately while reading enabled policy and requires a successful strong biometric', async () => {
  let complete: (value: string) => void = () => undefined;
  jest.mocked(SecureStore.getItemAsync).mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  await mount();
  expectHidden();
  expect(screen.getByRole('progressbar', { name: 'Loading your records' })).toBeOnTheScreen();
  await act(() => complete('enabled'));
  const unlock = await screen.findByRole('button', { name: 'Unlock with biometrics' });
  expectHidden();
  await fireEvent.press(unlock);
  await waitFor(() => expect(screen.getByText('Private balance ₹100')).toBeVisible());
  expect(screen.container.queryAll((instance) => instance.type === 'Modal')).toHaveLength(0);
  expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledWith(
    expect.objectContaining({
      disableDeviceFallback: true,
      biometricsSecurityLevel: 'strong',
      requireConfirmation: true,
    }),
  );
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
});

test('relocks and hides content when backgrounded until a fresh biometric succeeds', async () => {
  await mount();
  await fireEvent.press(await screen.findByRole('button', { name: 'Unlock with biometrics' }));
  await waitFor(() => expect(screen.getByText('Private balance ₹100')).toBeVisible());
  await act(() => lifecycle('background'));
  expectHidden();
  await act(() => lifecycle('active'));
  expectHidden();
  await fireEvent.press(screen.getByRole('button', { name: 'Unlock with biometrics' }));
  await waitFor(() => expect(screen.getByText('Private balance ₹100')).toBeVisible());
  expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledTimes(2);
});

test.each(['read failure', 'unknown policy'] as const)(
  'fails closed on %s and retries the secure policy read',
  async (mode) => {
    if (mode === 'read failure')
      jest
        .mocked(SecureStore.getItemAsync)
        .mockRejectedValueOnce(new Error('SecureStore unavailable'));
    else jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce('unexpected-policy');
    await mount();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Cannot read app-lock settings. Retry or sign out on this device.',
    );
    expectHidden();
    expect(screen.queryByRole('button', { name: 'Unlock with biometrics' })).not.toBeOnTheScreen();
    expect(LocalAuthentication.authenticateAsync).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Unlock with biometrics' })).toBeOnTheScreen();
    expect(SecureStore.getItemAsync).toHaveBeenNthCalledWith(2, policyKey);
    expectHidden();
  },
);

test('keeps the lock enabled when local credential deletion fails', async () => {
  clearSession.mockRejectedValueOnce(new Error('Cannot clear credentials'));
  await mount();
  await screen.findByRole('button', { name: 'Unlock with biometrics' });
  await fireEvent.press(screen.getByRole('button', { name: 'Sign out and reset app lock' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not clear saved credentials or app-lock settings. Please retry.',
  );
  expect(clearSession).toHaveBeenCalledTimes(1);
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  expectHidden();
});

test('resets only this account policy after credential deletion finishes successfully', async () => {
  let finish: () => void = () => undefined;
  clearSession.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = () => {
          currentUser = null;
          resolve();
        };
      }),
  );
  await mount();
  await screen.findByRole('button', { name: 'Unlock with biometrics' });
  await fireEvent.press(screen.getByRole('button', { name: 'Sign out and reset app lock' }));
  expect(screen.getByRole('button', { name: 'Sign out and reset app lock' })).toBeDisabled();
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  expectHidden();
  await act(() => finish());
  await waitFor(() =>
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(policyKey, 'disabled', {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  );
  expect(clearSession.mock.invocationCallOrder[0]).toBeLessThan(
    jest.mocked(SecureStore.setItemAsync).mock.invocationCallOrder[0]!,
  );
  expect(screen.container.queryAll((instance) => instance.type === 'Modal')).toHaveLength(0);
});
