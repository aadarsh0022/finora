import { changePasswordSchema, deleteAccountSchema } from '@finora/contracts';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from 'react-native';
import { AppButton, AppText, Card, Feedback, Field, Screen } from '../src/components/ui';
import { messageSchema } from '../src/features/finance/shared';
import { useUnsavedChanges } from '../src/hooks/finance';
import { useApp } from '../src/providers/app-provider';
import { AppLockSettings } from '../src/providers/app-lock-provider';

export default function Security() {
  const { api, clearSession } = useApp();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirmPassword, setConfirm] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [notice, setNotice] = useState('');
  const allowLeave = useUnsavedChanges(
    !!(currentPassword || newPassword || confirmPassword || deletePassword || confirmation),
  );
  const password = useMutation({
    mutationFn: async () => {
      if (newPassword !== confirmPassword) throw new Error('New passwords do not match.');
      const input = changePasswordSchema.safeParse({ currentPassword, newPassword });
      if (!input.success)
        throw new Error(input.error.issues.map((issue) => issue.message).join('\n'));
      await api.request('auth/change-password', messageSchema, {
        method: 'POST',
        body: input.data,
      });
      allowLeave();
      await clearSession();
    },
  });
  const logoutOthers = useMutation({
    mutationFn: async () => {
      const result = await api.request('auth/logout-other-sessions', messageSchema, {
        method: 'POST',
        body: {},
      });
      setNotice(result.message);
    },
  });
  const deletion = useMutation({
    mutationFn: async () => {
      const input = deleteAccountSchema.safeParse({ password: deletePassword, confirmation });
      if (!input.success) throw new Error('Enter your password and type DELETE to confirm.');
      await api.request('auth/account', messageSchema, { method: 'DELETE', body: input.data });
      allowLeave();
      await clearSession({ purgeLocal: true });
    },
  });
  const busy = password.isPending || logoutOthers.isPending || deletion.isPending;
  return (
    <Screen title="Security" subtitle="Control access to your financial data.">
      <AppLockSettings />
      <Card>
        <AppText accessibilityRole="header" style={{ fontFamily: 'DMSansBold', fontSize: 22 }}>
          Change password
        </AppText>
        <AppText tone="muted">
          Use at least 12 characters. Changing your password signs out every device, including this
          one.
        </AppText>
        <Field
          label="Current password"
          value={currentPassword}
          onChangeText={setCurrent}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          maxLength={128}
        />
        <Field
          label="New password"
          value={newPassword}
          onChangeText={setNew}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          maxLength={128}
        />
        <Field
          label="Confirm new password"
          value={confirmPassword}
          onChangeText={setConfirm}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          maxLength={128}
        />
        {password.error && <Feedback error={password.error} />}
        <AppButton
          title="Change password"
          loading={password.isPending}
          disabled={busy && !password.isPending}
          onPress={() => password.mutate()}
        />
      </Card>
      <Card>
        <AppText accessibilityRole="header" style={{ fontFamily: 'DMSansBold', fontSize: 22 }}>
          Other devices
        </AppText>
        <AppText tone="muted">
          Sign out every other session while keeping this device connected.
        </AppText>
        {notice ? (
          <AppText tone="accent" accessibilityRole="alert">
            {notice}
          </AppText>
        ) : null}
        {logoutOthers.error && <Feedback error={logoutOthers.error} />}
        <AppButton
          title="Sign out other devices"
          variant="secondary"
          loading={logoutOthers.isPending}
          disabled={busy && !logoutOthers.isPending}
          onPress={() =>
            Alert.alert(
              'Sign out other devices?',
              'Other devices will need your password to sign in again.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign out others', onPress: () => logoutOthers.mutate() },
              ],
            )
          }
        />
      </Card>
      <Card>
        <AppText
          accessibilityRole="header"
          tone="danger"
          style={{ fontFamily: 'DMSansBold', fontSize: 22 }}
        >
          Delete Walleto account
        </AppText>
        <AppText>
          Deletion permanently removes your account and associated application data. Export anything
          you need before continuing.
        </AppText>
        <Field
          label="Password to delete account"
          value={deletePassword}
          onChangeText={setDeletePassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={128}
        />
        <Field
          label="Type DELETE to confirm"
          value={confirmation}
          onChangeText={setConfirmation}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
        />
        {deletion.error && <Feedback error={deletion.error} />}
        <AppButton
          title="Permanently delete account"
          variant="danger"
          loading={deletion.isPending}
          disabled={(busy && !deletion.isPending) || confirmation !== 'DELETE' || !deletePassword}
          onPress={() =>
            Alert.alert(
              'Permanently delete your account?',
              'Your account, transactions, and other application records will be deleted. This cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete account', style: 'destructive', onPress: () => deletion.mutate() },
              ],
            )
          }
        />
      </Card>
    </Screen>
  );
}
