import { settingsSchema, settingsUpdateSchema, type Preferences } from '@finora/contracts';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { openURL } from 'expo-linking';
import { useState, type ReactNode } from 'react';
import { Alert, Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
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
import { FlowSheet, SelectField } from '../../src/components/flow';
import { messageSchema, useRead } from '../../src/features/finance/shared';
import { useFinanceMutation, useUnsavedChanges } from '../../src/hooks/finance';
import { useApp } from '../../src/providers/app-provider';
import { useTheme } from '../../src/theme';
import { confirmDiscard } from '../../src/features/planning/common';
import { publicPageUrl } from '../../src/public-site';

export default function Settings() {
  const { api, user, clearSession } = useApp();
  const theme = useTheme();
  const settings = useRead('settings', settingsSchema);
  const legal = useMutation({
    mutationFn: async (path: 'privacy' | 'terms' | 'support') => {
      await openURL(publicPageUrl(path));
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
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: theme.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AppText tone="accent" style={{ fontFamily: 'DMSansBold', fontSize: 22 }}>
            {user?.name.trim().slice(0, 1).toUpperCase() ?? 'F'}
          </AppText>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText style={{ fontFamily: 'DMSansBold', fontSize: 18 }}>{user?.name}</AppText>
          <AppText tone="muted" style={{ fontSize: 13 }}>
            {user?.email}
          </AppText>
        </View>
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
      {settings.data && (
        <SettingsGroup title="Personalize">
          <PreferencesForm initial={settings.data} />
        </SettingsGroup>
      )}
      <SettingsGroup title="Your money">
        <SettingsRow
          title="Money Ahead"
          subtitle="Commitments, scenarios and purchase previews"
          icon="goal"
          onPress={() => router.push('/money-ahead')}
        />
        <SettingsRow
          title="Weekly check-in"
          subtitle="Review entries and follow-ups"
          icon="document"
          onPress={() => router.push('/weekly-review')}
        />
        <SettingsRow
          title="Reminders"
          subtitle="Private prompts, on this device"
          icon="preferences"
          onPress={() => router.push('/reminders')}
        />
        <SettingsRow
          title="Quick entry"
          subtitle="Favourite transaction drafts"
          icon="document"
          onPress={() => router.push('/favourites')}
        />
        <SettingsRow
          title="Debts"
          subtitle="Borrowed, lent and repayments"
          icon="repeat"
          onPress={() => router.push('/debts')}
        />
        <SettingsRow title="Accounts" icon="wallet" onPress={() => router.push('/accounts')} />
        <SettingsRow title="Categories" icon="grid" onPress={() => router.push('/categories')} />
        <SettingsRow
          title="Savings goals"
          icon="goal"
          onPress={() => router.push({ pathname: '/planning', params: { mode: 'goals' } })}
        />
        <SettingsRow
          title="Recurring transactions"
          icon="repeat"
          last
          onPress={() => router.push({ pathname: '/planning', params: { mode: 'recurring' } })}
        />
      </SettingsGroup>
      <SettingsGroup title="Data and security">
        <SettingsRow
          title="Sync status"
          subtitle="Pending offline transactions"
          icon="repeat"
          onPress={() => router.push('/sync')}
        />
        <SettingsRow
          title="Backup and restore"
          subtitle="Export or import your data"
          icon="backup"
          onPress={() => router.push('/backup')}
        />
        <SettingsRow
          title="Password and security"
          subtitle="Password, sessions and app lock"
          icon="shield"
          last
          onPress={() => router.push('/security')}
        />
      </SettingsGroup>
      <SettingsGroup title="Help and legal">
        <SettingsRow
          title="Privacy policy"
          icon="shield"
          disabled={legal.isPending}
          onPress={() => legal.mutate('privacy')}
        />
        <SettingsRow
          title="Terms"
          icon="document"
          disabled={legal.isPending}
          onPress={() => legal.mutate('terms')}
        />
        <SettingsRow
          title="Support and account deletion"
          icon="help"
          last
          disabled={legal.isPending}
          onPress={() => legal.mutate('support')}
        />
      </SettingsGroup>
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
        variant="danger"
        loading={logout.isPending}
        onPress={() =>
          Alert.alert(
            'Sign out?',
            'Local cached data and any unsynced entries will be removed from this device. Sync pending entries first. You can sign in again with your email and password.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign out', onPress: () => logout.mutate() },
            ],
          )
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
  const [open, setOpen] = useState(false);
  const dirty = JSON.stringify(saved.preferences) !== JSON.stringify(form);
  useUnsavedChanges(dirty);
  const save = useFinanceMutation('settings', settingsSchema, 'PATCH');
  function close() {
    if (save.isPending) return;
    confirmDiscard(dirty, () => {
      setForm(saved.preferences);
      setError('');
      setOpen(false);
    });
  }
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
    <>
      <SettingsRow
        title="Preferences"
        subtitle="Appearance, currency and regional formats"
        icon="preferences"
        last
        value={saved.preferences.baseCurrency}
        onPress={() => setOpen(true)}
      />
      <FlowSheet
        title="Preferences"
        visible={open}
        onClose={close}
        footer={
          <>
            <AppButton
              title="Save preferences"
              loading={save.isPending}
              disabled={!dirty || profilePending}
              onPress={() => {
                void submit();
              }}
            />
            <AppButton
              title="Cancel"
              variant="secondary"
              disabled={save.isPending}
              onPress={close}
            />
          </>
        }
      >
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
        <SelectField
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
        <SelectField
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
      </FlowSheet>
    </>
  );
}

const settingsIcons = {
  wallet: 'M3 6h17v14H3V6Zm0 0V4h14v2M16 11h4v5h-4z',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  goal: 'M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 12l9-9m-5 0h5v5',
  repeat: 'M4 8h16m-4-4 4 4-4 4M20 16H4m4-4-4 4 4 4',
  backup: 'M12 16V3m-4 4 4-4 4 4M4 14v6h16v-6',
  shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6',
  document: 'M5 3h10l4 4v14H5V3Zm9 0v5h5M8 12h8M8 16h6',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-3 6a3 3 0 1 1 4 3v2m-1 3h.01',
  preferences: 'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6',
};
function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <AppText
        accessibilityRole="header"
        tone="muted"
        style={{ fontSize: 13, fontFamily: 'DMSansBold', paddingHorizontal: 4 }}
      >
        {title}
      </AppText>
      <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>{children}</Card>
    </View>
  );
}
function SettingsRow({
  title,
  subtitle,
  value,
  icon,
  last = false,
  disabled = false,
  onPress,
}: {
  title: string;
  subtitle?: string;
  value?: string;
  icon: keyof typeof settingsIcons;
  last?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 66,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: theme.border,
        opacity: disabled ? 0.5 : pressed ? 0.65 : 1,
      })}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          backgroundColor: theme.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Svg width={19} height={19} viewBox="0 0 24 24" accessible={false}>
          <Path
            d={settingsIcons[icon]}
            stroke={theme.accent}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText style={{ fontSize: 15, fontFamily: 'DMSansBold' }}>{title}</AppText>
        {subtitle && (
          <AppText tone="muted" style={{ fontSize: 12, lineHeight: 18 }}>
            {subtitle}
          </AppText>
        )}
      </View>
      {value && (
        <AppText tone="muted" style={{ fontSize: 12 }}>
          {value}
        </AppText>
      )}
      <AppText tone="muted" style={{ fontSize: 22 }}>
        ›
      </AppText>
    </Pressable>
  );
}
