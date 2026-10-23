import {
  budgetStatusSchema,
  debtListSchema,
  monthlyLimitStatusSchema,
  recurringOccurrenceSchema,
  recurringRuleSchema,
  type User,
} from '@finora/contracts';
import { calendarDate } from '@finora/finance-core';
import { z } from 'zod';
import type * as NotificationApi from 'expo-notifications';
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import type { ApiClient } from '../api/client';
import type { DeviceVault } from '../storage/vault-core';
import {
  defaultReminders,
  planReminders,
  reminderContent,
  reminderPreferencesSchema,
  reminderPrefix,
  type ReminderPreferences,
} from './planning';
import { reconcileReminders, type ReminderDriver } from './reconcile';

export const reminderPreferencesKey = 'preferences:reminders';
let generation = 0;
let nativeTail: Promise<unknown> = Promise.resolve();
function hasNativeNotifications() {
  return Platform.OS !== 'android' || !!requireOptionalNativeModule('ExpoTopicSubscriptionModule');
}
function notificationModule(): typeof NotificationApi {
  if (!hasNativeNotifications())
    throw new Error(
      'Reminders need an updated app build. Install the refreshed development app and try again.',
    );
  // Native SDK initialization stays out of ordinary form/query imports. Metro
  // resolves this literal; synchronous loading also works with the native test VM.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-notifications') as typeof NotificationApi;
}
function serialized<T>(action: () => Promise<T>) {
  const next = nativeTail.catch(() => undefined).then(action);
  nativeTail = next;
  return next;
}
async function nativeDriver(): Promise<ReminderDriver> {
  const notifications = notificationModule();
  return {
    list: async () =>
      (await notifications.getAllScheduledNotificationsAsync()).map((r) => r.identifier),
    cancel: (id) => notifications.cancelScheduledNotificationAsync(id),
    schedule: async (plan) => {
      await notifications.scheduleNotificationAsync({
        identifier: plan.id,
        content: { ...reminderContent(plan.kind), sound: false },
        trigger:
          plan.kind === 'daily'
            ? {
                type: notifications.SchedulableTriggerInputTypes.DAILY,
                hour: plan.hour!,
                minute: 0,
                channelId: 'finora-reminders',
              }
            : {
                type: notifications.SchedulableTriggerInputTypes.DATE,
                date: new Date(plan.at!),
                channelId: 'finora-reminders',
              },
      });
    },
  };
}

export async function reminderPreferences(vault: DeviceVault) {
  return (
    (await vault.read(reminderPreferencesKey, reminderPreferencesSchema, Infinity))?.value ??
    defaultReminders
  );
}

// Invalidates in-flight network plans immediately, then cancels any native work
// already being scheduled. A late response cannot schedule after sign-out.
export function cancelLocalReminders() {
  generation++;
  return serialized(async () => {
    if (!hasNativeNotifications()) return;
    const driver = await nativeDriver();
    for (const id of await driver.list())
      if (id.startsWith(reminderPrefix)) await driver.cancel(id);
  });
}

export async function saveReminderPreferences(vault: DeviceVault, input: ReminderPreferences) {
  const preferences = reminderPreferencesSchema.parse(input);
  await cancelLocalReminders();
  if (preferences.daily || preferences.dueDates || preferences.budgets) {
    const notifications = notificationModule();
    await notifications.setNotificationChannelAsync('finora-reminders', {
      name: 'Finora AI reminders',
      importance: notifications.AndroidImportance.DEFAULT,
      lockscreenVisibility: notifications.AndroidNotificationVisibility.PRIVATE,
      sound: null,
      enableVibrate: false,
    });
    // Only this explicit user action requests system notification permission.
    let permission = await notifications.getPermissionsAsync();
    if (!permission.granted) permission = await notifications.requestPermissionsAsync();
    if (!permission.granted)
      throw new Error(
        'Notifications are blocked. Allow notifications for Finora AI in device settings, then refresh reminders.',
      );
  }
  await vault.write(reminderPreferencesKey, preferences);
}

export async function refreshLocalReminders(vault: DeviceVault, api: ApiClient, user: User) {
  if (vault.ownerId !== user.id) return;
  const ticket = ++generation;
  const preferences = await reminderPreferences(vault);
  if (!preferences.daily && !preferences.dueDates && !preferences.budgets) return;
  const notifications = notificationModule();
  if (!(await notifications.getPermissionsAsync()).granted) return;
  const now = new Date();
  const month = calendarDate(now, user.preferences.timezone).slice(0, 7);
  // Validated, authenticated reads only. No generation/posting of financial items.
  const [rules, pending, debts, budgets, total] = await Promise.all([
    preferences.dueDates ? api.request('recurring', z.array(recurringRuleSchema)) : [],
    preferences.dueDates
      ? api.request('recurring-occurrences?status=PENDING', z.array(recurringOccurrenceSchema))
      : [],
    preferences.dueDates ? api.request('debts', debtListSchema) : [],
    preferences.budgets ? api.request(`budgets?month=${month}`, z.array(budgetStatusSchema)) : [],
    preferences.budgets
      ? api.request(`budgets/total?month=${month}`, monthlyLimitStatusSchema)
      : null,
  ]);
  if (ticket !== generation) return;
  const plans = planReminders(
    preferences,
    {
      rules,
      pending,
      debts,
      budgets: [
        ...budgets,
        ...(total?.plan ? [{ id: 'overall', month, warningReached: total.warningReached }] : []),
      ],
    },
    user.preferences.timezone,
    now,
  );
  return serialized(async () => {
    if (ticket !== generation) return;
    await reconcileReminders(await nativeDriver(), vault, plans, () => ticket === generation);
  });
}
