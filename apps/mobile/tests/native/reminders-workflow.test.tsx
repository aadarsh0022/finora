import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { userSchema } from '@finora/contracts';
import Reminders from '../../app/reminders';
import { useApp } from '../../src/providers/app-provider';
import { testVault } from '../vault-fixture';
import {
  cancelLocalReminders,
  refreshLocalReminders,
  reminderPreferencesKey,
} from '../../src/notifications/reminders';
import type { ApiClient } from '../../src/api/client';
import { requireOptionalNativeModule } from 'expo';
import { saveReminderPreferences } from '../../src/notifications/reminders';
import { Platform } from 'react-native';

jest.mock('../../src/providers/app-provider', () => ({ useApp: jest.fn() }));
jest.mock('expo-network', () => ({ useNetworkState: () => ({ isConnected: true }) }));
jest.mock('expo', () => ({ requireOptionalNativeModule: jest.fn(() => ({})) }));
jest.mock('expo-crypto', () => ({
  randomUUID: () => jest.requireActual<{ randomUUID: () => string }>('node:crypto').randomUUID(),
}));
jest.mock('expo-router', () => ({ usePreventRemove: jest.fn(() => jest.fn()) }));
jest.mock('expo-notifications', () => ({
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  cancelScheduledNotificationAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ granted: false })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  AndroidImportance: { DEFAULT: 3 },
  AndroidNotificationVisibility: { PRIVATE: 0 },
  SchedulableTriggerInputTypes: { DAILY: 'daily', DATE: 'date' },
}));
import * as Notifications from 'expo-notifications';
const user = userSchema.parse({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Demo',
  email: 'demo@example.com',
  preferences: {},
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(requireOptionalNativeModule)
    .mockReturnValue({} as ReturnType<typeof requireOptionalNativeModule>);
  jest
    .mocked(Notifications.getPermissionsAsync)
    .mockResolvedValue({ granted: false } as Notifications.NotificationPermissionsStatus);
  jest.mocked(Notifications.requestPermissionsAsync).mockImplementation(async () => {
    jest
      .mocked(Notifications.getPermissionsAsync)
      .mockResolvedValue({ granted: true } as Notifications.NotificationPermissionsStatus);
    return { granted: true } as Notifications.NotificationPermissionsStatus;
  });
});
async function mount() {
  const local = testVault(user.id);
  const api = { request: jest.fn() };
  jest
    .mocked(useApp)
    .mockReturnValue({ user, vault: local.vault, api } as unknown as ReturnType<typeof useApp>);
  await render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      <Reminders />
    </QueryClientProvider>,
  );
  await screen.findByRole('switch', { name: 'Daily check-in' });
  return { ...local, api };
}

test('an older native build can start and sign out without importing unavailable notifications', async () => {
  const platform = jest.replaceProperty(Platform, 'OS', 'android');
  try {
    jest.mocked(requireOptionalNativeModule).mockReturnValue(null);
    await expect(cancelLocalReminders()).resolves.toBeUndefined();
    expect(Notifications.getAllScheduledNotificationsAsync).not.toHaveBeenCalled();
    const { vault, rows } = testVault(user.id);
    await expect(
      saveReminderPreferences(vault, { daily: true, dueDates: false, budgets: false, hour: 20 }),
    ).rejects.toThrow('updated app build');
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(rows.has(reminderPreferencesKey)).toBe(false);
  } finally {
    platform.restore();
  }
});
test('asks permission only after an explicit save and schedules generic daily content without API writes', async () => {
  const { api, rows } = await mount();
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  await fireEvent(screen.getByRole('switch', { name: 'Daily check-in' }), 'valueChange', true);
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Save and refresh reminders' }));
  await screen.findByText('Reminder preferences saved on this device.');
  expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
    expect.objectContaining({
      content: {
        title: 'Finora AI',
        body: 'Take a moment to record today’s activity.',
        sound: false,
      },
      trigger: expect.objectContaining({ type: 'daily', hour: 20, minute: 0 }),
    }),
  );
  expect(rows.has(reminderPreferencesKey)).toBe(true);
  expect(api.request).not.toHaveBeenCalled();
});
test('explains denied permission without scheduling', async () => {
  jest
    .mocked(Notifications.requestPermissionsAsync)
    .mockResolvedValue({ granted: false } as Notifications.NotificationPermissionsStatus);
  await mount();
  await fireEvent(screen.getByRole('switch', { name: 'Daily check-in' }), 'valueChange', true);
  await fireEvent.press(screen.getByRole('button', { name: 'Save and refresh reminders' }));
  await waitFor(() => expect(screen.getByText(/Notifications are blocked/)).toBeTruthy());
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});

test('a late API response cannot schedule reminders after sign-out cancellation', async () => {
  const { vault } = testVault(user.id);
  await vault.write(reminderPreferencesKey, {
    daily: true,
    dueDates: true,
    budgets: false,
    hour: 20,
  });
  jest
    .mocked(Notifications.getPermissionsAsync)
    .mockResolvedValue({ granted: true } as Notifications.NotificationPermissionsStatus);
  let release!: (value: never[]) => void;
  const pending = new Promise<never[]>((resolve) => {
    release = resolve;
  });
  const request = jest.fn(() => pending);
  const refresh = refreshLocalReminders(vault, { request } as unknown as ApiClient, user);
  await waitFor(() => expect(request).toHaveBeenCalledTimes(3));
  await cancelLocalReminders();
  release([]);
  await refresh;
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});
