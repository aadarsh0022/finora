import { useEffect, useState } from 'react';
import { Linking, Switch, View } from 'react-native';
import { AppButton, AppText, Card, Feedback, Loading, Screen } from '../src/components/ui';
import { SelectField } from '../src/components/flow';
import { useApp } from '../src/providers/app-provider';
import { useTheme } from '../src/theme';
import { useUnsavedChanges } from '../src/hooks/finance';
import { defaultReminders, type ReminderPreferences } from '../src/notifications/planning';
import {
  refreshLocalReminders,
  reminderPreferences,
  saveReminderPreferences,
} from '../src/notifications/reminders';

export default function Reminders() {
  const { vault, api, user } = useApp();
  const theme = useTheme();
  const [form, setForm] = useState<ReminderPreferences>(defaultReminders);
  const [saved, setSaved] = useState<ReminderPreferences>(defaultReminders);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [notice, setNotice] = useState('');
  useUnsavedChanges(JSON.stringify(form) !== JSON.stringify(saved));
  useEffect(() => {
    let active = true;
    if (!vault) {
      setLoading(false);
      return;
    }
    void reminderPreferences(vault)
      .then((value) => {
        if (active) {
          setSaved(value);
          setForm(value);
        }
      })
      .catch((failure: unknown) => {
        if (active) setError(failure);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [vault]);
  async function save() {
    if (!vault || !user) return;
    setBusy(true);
    setError(undefined);
    setNotice('');
    try {
      await saveReminderPreferences(vault, form);
      setSaved(form);
      await refreshLocalReminders(vault, api, user);
      setNotice('Reminder preferences saved on this device.');
    } catch (failure) {
      setError(
        new Error(
          typeof failure === 'object' &&
            failure &&
            'message' in failure &&
            typeof failure.message === 'string'
            ? failure.message
            : 'Could not update reminders. Please retry.',
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  function toggle(key: 'daily' | 'dueDates' | 'budgets', value: boolean) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setNotice('');
  }
  return (
    <Screen
      title="A little nudge"
      subtitle="Useful reminders. Your financial details stay inside Finora."
      includeTopInset={false}
    >
      {loading ? <Loading /> : null}
      {!vault ? (
        <AppText tone="muted">Encrypted device storage is needed for reminders.</AppText>
      ) : !loading ? (
        <>
          <Card>
            {(
              [
                ['daily', 'Daily check-in', 'A quiet prompt to record your activity.'],
                ['dueDates', 'Due dates', 'Upcoming debts and recurring items.'],
                [
                  'budgets',
                  'Budget heads-up',
                  'Once per monthly budget when its warning level is reached.',
                ],
              ] as const
            ).map(([key, title, detail]) => (
              <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <AppText style={{ fontFamily: 'DMSansBold' }}>{title}</AppText>
                  <AppText tone="muted" style={{ fontSize: 13, lineHeight: 19 }}>
                    {detail}
                  </AppText>
                </View>
                <Switch
                  accessibilityLabel={title}
                  value={form[key]}
                  disabled={busy}
                  trackColor={{ true: theme.accent, false: theme.border }}
                  onValueChange={(value) => toggle(key, value)}
                />
              </View>
            ))}
          </Card>
          {form.daily && (
            <SelectField
              label="Daily check-in time"
              value={String(form.hour)}
              onChange={(value) => setForm((previous) => ({ ...previous, hour: Number(value) }))}
              options={Array.from({ length: 24 }, (_, hour) => ({
                value: String(hour),
                label: `${String(hour).padStart(2, '0')}:00`,
              }))}
            />
          )}
          <AppText tone="muted" style={{ fontSize: 13 }}>
            Daily check-ins use your device’s local time. Due dates use the item’s timezone at noon.
            Finora refreshes the next 30 days when you open the app or save changes online. Device
            settings may delay delivery. Reminders never record or move money.
          </AppText>
          {error ? <Feedback error={error} /> : null}
          {notice ? (
            <AppText accessibilityRole="alert" tone="accent">
              {notice}
            </AppText>
          ) : null}
          <AppButton
            title="Save and refresh reminders"
            loading={busy}
            onPress={() => {
              void save();
            }}
          />
          <AppButton
            title="Device notification settings"
            variant="secondary"
            onPress={() => {
              void Linking.openSettings().catch(setError);
            }}
          />
          <AppText tone="muted" style={{ fontSize: 13 }}>
            Notifications show generic text only. Preferences are device-specific; signing out
            removes reminders. No push token or email is used.
          </AppText>
        </>
      ) : null}
    </Screen>
  );
}
