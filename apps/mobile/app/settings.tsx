import {
  profileUpdateSchema,
  userSchema,
  settingsSchema,
  settingsUpdateSchema,
  type Preferences,
} from '@finora/contracts';
import { Chevron } from '../src/components/chevron';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { openURL } from 'expo-linking';
import { useState, type ReactNode } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Icon } from '../src/components/design';
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
} from '../src/components/ui';
import { FlowSheet, SelectField } from '../src/components/flow';
import { messageSchema, useRead } from '../src/features/finance/shared';
import { useFinanceMutation, useUnsavedChanges } from '../src/hooks/finance';
import { useApp } from '../src/providers/app-provider';
import { useTheme } from '../src/theme';
import { palettes } from '../src/theme/palettes';
import { useAppearance } from '../src/stores/appearance';
import { accentColors, type AccentColor } from '@finora/contracts';
import { confirmDiscard } from '../src/features/planning/common';
import { publicPageUrl } from '../src/public-site';

export default function Settings() {
  const { api, user, clearSession, refreshUser } = useApp();
  const [editName, setEditName] = useState(false);
  const [name, setName] = useState(user?.name ?? '');
  const [nameError, setNameError] = useState('');
  const profile = useMutation({
    mutationFn: async () => {
      const parsed = profileUpdateSchema.safeParse({ name });
      if (!parsed.success) {
        setNameError(parsed.error.issues[0]?.message ?? 'Enter your name');
        return;
      }
      await api.request('auth/profile', userSchema, { method: 'PATCH', body: parsed.data });
      await refreshUser();
      setEditName(false);
    },
  });
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
    <Screen title="Settings" includeTopInset={false}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Edit your name"
        onPress={() => {
          setName(user?.name ?? '');
          setNameError('');
          setEditName(true);
        }}
      >
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
          <AppText tone="accent" style={{ fontSize: 13 }}>
            Edit
          </AppText>
        </Card>
      </Pressable>
      <FlowSheet visible={editName} title="Your profile" onClose={() => setEditName(false)}>
        <Field
          label="Your name"
          value={name}
          onChangeText={(value) => {
            setName(value);
            setNameError('');
          }}
          error={nameError}
          autoCapitalize="words"
          maxLength={80}
        />
        {profile.error && <Feedback error={profile.error} />}
        <AppButton title="Save name" loading={profile.isPending} onPress={() => profile.mutate()} />
      </FlowSheet>
      {settings.isPending && <Loading variant="form" />}
      {settings.isError && (
        <Feedback
          error={settings.error}
          retry={() => {
            void settings.refetch();
          }}
        />
      )}
      {settings.data && (
        <SettingsGroup title="Preferences">
          <PreferencesForm initial={settings.data} />
        </SettingsGroup>
      )}
      <SettingsGroup title="Your money">
        <SettingsRow title="Accounts" icon="wallet" onPress={() => router.push('/accounts')} />
        <SettingsRow
          title="Categories"
          icon="grid"
          last
          onPress={() => router.push('/categories')}
        />
      </SettingsGroup>
      <SettingsGroup title="Data and security">
        <SettingsRow
          title="Reminders"
          subtitle="Private prompts on this device"
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
          title="Getting started"
          subtitle="Revisit your setup guide"
          icon="help"
          onPress={() => router.push('/onboarding')}
        />
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
function AccentPicker({
  value,
  onChange,
}: {
  value: AccentColor;
  onChange: (value: AccentColor) => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <AppText style={{ fontSize: 14, fontFamily: 'DMSansBold' }}>Theme colour</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {accentColors.map((id) => {
          const selected = id === value;
          const swatch = palettes[id].light.accent;
          return (
            <Pressable
              key={id}
              accessibilityRole="radio"
              accessibilityLabel={`${palettes[id].label} theme`}
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(id)}
              style={({ pressed }) => ({
                width: '30%',
                flexGrow: 1,
                alignItems: 'center',
                gap: 8,
                paddingVertical: 12,
                borderRadius: 18,
                borderWidth: 2,
                borderColor: selected ? swatch : theme.border,
                backgroundColor: selected ? palettes[id].light.accentSoft : theme.surface,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: swatch,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {selected && <Icon name="check" color="#FFFFFF" size={20} />}
              </View>
              <AppText style={{ fontSize: 13, fontFamily: 'DMSansBold' }}>
                {palettes[id].label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      <AppText tone="muted" style={{ fontSize: 12 }}>
        Applies when you save, for every device.
      </AppText>
    </View>
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
        settingsUpdateSchema.parse({
          preferences: form,
          version: saved.version,
        }),
      );
      setSaved(next);
      setForm(next.preferences);
      useAppearance.getState().choose(next.preferences.accentColor);
      useAppearance.getState().markSynced(next.preferences.accentColor);
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
        <AccentPicker value={form.accentColor} onChange={(value) => set('accentColor', value)} />
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
        <Choice
          label="Loan EMIs"
          value={form.keepDebtSeparate ? 'separate' : 'ledger'}
          onChange={(value) => set('keepDebtSeparate', value === 'separate')}
          presentation="list"
          options={[
            {
              value: 'ledger',
              label: 'Pay from my balance',
              description: 'Marking an EMI paid also adds a normal expense from an account.',
            },
            {
              value: 'separate',
              label: 'Keep debt separate',
              description: 'EMI payments stay in Loans & EMIs only. Your balance is not changed.',
            },
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
          backgroundColor: theme.background,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Svg width={19} height={19} viewBox="0 0 24 24" accessible={false}>
          <Path
            d={settingsIcons[icon]}
            stroke={theme.muted}
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
      <Chevron direction="right" size={20} />
    </Pressable>
  );
}
