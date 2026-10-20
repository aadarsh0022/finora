import { settingsSchema, settingsUpdateSchema, type Preferences } from '@finora/contracts';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { openURL } from 'expo-linking';
import { useState } from 'react';
import { Alert } from 'react-native';
import { z } from 'zod';
import {
  AppButton,
  AppText,
  Card,
  Choice,
  Feedback,
  Field,
  Loading,
  Screen,
} from '../../src/components/ui';
import { messageSchema, useRead } from '../../src/features/finance/shared';
import { useFinanceMutation, useUnsavedChanges } from '../../src/hooks/finance';
import { useApp } from '../../src/providers/app-provider';

export default function Settings() {
  const { api, user, clearSession } = useApp();
  const settings = useRead('settings', settingsSchema);
  const legal = useMutation({
    mutationFn: async (path: 'privacy' | 'terms' | 'support') => {
      const base = process.env.EXPO_PUBLIC_API_URL;
      if (!base) throw new Error('The service URL is not configured.');
      await openURL(new URL(`/${path}`, base).toString());
    },
  });
  const logout = useMutation({
    mutationFn: async () => {
      await api.request('auth/logout', messageSchema, { method: 'POST', body: {} });
      await clearSession();
    },
  });
  return (
    <Screen title="Settings" subtitle="Make Finora feel like yours.">
      <Card>
        <AppText style={{ fontFamily: 'DMSansBold' }}>{user?.name}</AppText>
        <AppText tone="muted">{user?.email}</AppText>
      </Card>
      {settings.isPending && <Loading />}
      {settings.isError && (
        <Feedback
          error={settings.error}
          retry={() => {
            void settings.refetch();
          }}
        />
      )}
      {settings.data && <PreferencesForm initial={settings.data} />}
      <AppButton
        title="Manage categories"
        variant="secondary"
        onPress={() => router.push('/categories')}
      />
      <AppButton
        title="Budgets, goals and recurring items"
        variant="secondary"
        onPress={() => router.push('/planning')}
      />
      <AppButton
        title="Password and security"
        variant="secondary"
        onPress={() => router.push('/security')}
      />
      <AppButton
        title="Privacy policy"
        variant="secondary"
        disabled={legal.isPending}
        onPress={() => legal.mutate('privacy')}
      />
      <AppButton
        title="Terms"
        variant="secondary"
        disabled={legal.isPending}
        onPress={() => legal.mutate('terms')}
      />
      <AppButton
        title="Support and account deletion"
        variant="secondary"
        disabled={legal.isPending}
        onPress={() => legal.mutate('support')}
      />
      {legal.error && <Feedback error={legal.error} />}
      {logout.error && (
        <>
          <Feedback error={logout.error} />
          <AppButton
            title="Sign out on this device only"
            variant="danger"
            onPress={() => {
              void clearSession();
            }}
          />
          <AppText tone="muted">
            Local sign-out removes saved credentials. The server session will expire automatically.
          </AppText>
        </>
      )}
      <AppButton
        title="Sign out"
        variant="secondary"
        loading={logout.isPending}
        onPress={() =>
          Alert.alert('Sign out?', 'You can sign in again with your email and password.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign out', onPress: () => logout.mutate() },
          ])
        }
      />
    </Screen>
  );
}
function PreferencesForm({ initial }: { initial: z.infer<typeof settingsSchema> }) {
  const { refreshUser } = useApp();
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState<Preferences>(initial.preferences);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [profilePending, setProfilePending] = useState(false);
  const dirty = JSON.stringify(saved.preferences) !== JSON.stringify(form);
  useUnsavedChanges(dirty);
  const save = useFinanceMutation('settings', settingsSchema, 'PATCH');
  function set<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setNotice('');
    setForm((current) => ({ ...current, [key]: value }));
  }
  async function submit() {
    setError('');
    setNotice('');
    try {
      const next = await save.mutateAsync(
        settingsUpdateSchema.parse({ preferences: form, version: saved.version }),
      );
      setSaved(next);
      setForm(next.preferences);
      setProfilePending(true);
      await refreshUser();
      setProfilePending(false);
      setNotice('Preferences saved.');
    } catch (failure) {
      setError(
        failure instanceof z.ZodError
          ? failure.issues.map((issue) => issue.message).join('\n')
          : failure instanceof Error
            ? failure.message
            : 'Could not save your preferences.',
      );
    }
  }
  return (
    <Card>
      <Choice
        label="Appearance"
        value={form.preferredTheme}
        onChange={(value) => set('preferredTheme', value)}
        options={[
          { value: 'system', label: 'System' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />
      <Choice
        label="Base currency"
        value={form.baseCurrency}
        onChange={(value) => set('baseCurrency', value)}
        options={(['INR', 'USD', 'CAD', 'GBP', 'AUD', 'JPY', 'KWD'] as const).map((value) => ({
          value,
          label: value,
        }))}
      />
      <AppText tone="muted">Currency is fixed after your first account is created.</AppText>
      <Field
        label="Locale"
        value={form.locale}
        onChangeText={(value) => set('locale', value)}
        placeholder="en-IN"
        autoCapitalize="none"
        maxLength={40}
      />
      <Field
        label="Timezone"
        value={form.timezone}
        onChangeText={(value) => set('timezone', value)}
        placeholder="Asia/Kolkata"
        autoCapitalize="none"
        maxLength={100}
      />
      <Choice
        label="Date format"
        value={form.preferredDateFormat}
        onChange={(value) => set('preferredDateFormat', value)}
        options={(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] as const).map((value) => ({
          value,
          label: value,
        }))}
      />
      <Choice
        label="First day of week"
        value={String(form.firstDayOfWeek)}
        onChange={(value) => set('firstDayOfWeek', value === '0' ? 0 : 1)}
        options={[
          { value: '1', label: 'Monday' },
          { value: '0', label: 'Sunday' },
        ]}
      />
      {error && <Feedback error={new Error(error)} />}
      {profilePending && (
        <AppButton
          title="Reload saved preferences"
          variant="secondary"
          onPress={() => {
            void refreshUser()
              .then(() => {
                setProfilePending(false);
                setError('');
                setNotice('Preferences saved.');
              })
              .catch((failure: unknown) =>
                setError(
                  failure instanceof Error ? failure.message : 'Could not reload your profile.',
                ),
              );
          }}
        />
      )}
      {notice ? (
        <AppText tone="accent" accessibilityRole="alert">
          {notice}
        </AppText>
      ) : null}
      <AppButton
        title="Save preferences"
        loading={save.isPending}
        disabled={!dirty}
        onPress={() => {
          void submit();
        }}
      />
    </Card>
  );
}
