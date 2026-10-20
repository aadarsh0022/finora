import { useState } from 'react';
import { Link } from 'expo-router';
import { forgotPasswordSchema } from '@finora/contracts';
import { z } from 'zod';
import { AppButton, AppText, Card, Feedback, Field, Screen } from '../../src/components/ui';
import { useApp } from '../../src/providers/app-provider';

export default function ForgotPassword() {
  const { api } = useApp();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [sent, setSent] = useState(false);
  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const body = forgotPasswordSchema.parse({ email });
      await api.request('auth/forgot-password', z.object({ message: z.string() }), {
        method: 'POST',
        authenticated: false,
        body,
      });
      setSent(true);
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title="A fresh start" subtitle="Enter your email to request a password recovery link.">
      <Card>
        {sent ? (
          <AppText>If an account exists, a recovery email has been sent. Check your inbox.</AppText>
        ) : (
          <>
            <Field
              label="Email address"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <AppButton
              title="Send recovery link"
              loading={busy}
              onPress={() => {
                void submit();
              }}
            />
          </>
        )}
      </Card>
      {!!error && <Feedback error={error} />}
      <Link href="/(auth)/login" asChild>
        <AppText tone="accent">Back to sign in</AppText>
      </Link>
    </Screen>
  );
}
