import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'expo-router';
import {
  currencySchema,
  emailSchema,
  loginSchema,
  passwordSchema,
  preferencesSchema,
  registerSchema,
  sessionTokensSchema,
} from '@finora/contracts';
import type { Currency } from '@finora/contracts';
import { AppButton, AppText, Card, Choice, Feedback, Field, Screen } from '../../components/ui';
import { useApp } from '../../providers/app-provider';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const registration = mode === 'register';
  const { api, acceptSession } = useApp();
  const [currency, setCurrency] = useState<Currency>('INR');
  const [error, setError] = useState<unknown>(null);
  const schema = z.object({
    email: emailSchema,
    password: registration ? passwordSchema : z.string().min(1).max(128),
    name: registration ? z.string().trim().min(1).max(80) : z.string(),
  });
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', name: '' },
  });
  async function submit(values: z.infer<typeof schema>) {
    setError(null);
    try {
      const body = registration
        ? registerSchema.parse({
            ...values,
            preferences: preferencesSchema.parse({ baseCurrency: currency }),
            deviceName: 'Finora Android',
          })
        : loginSchema.parse({
            email: values.email,
            password: values.password,
            deviceName: 'Finora Android',
          });
      const tokens = await api.request(`auth/${mode}`, sessionTokensSchema, {
        method: 'POST',
        body,
        authenticated: false,
      });
      await acceptSession(tokens);
    } catch (failure) {
      setError(failure);
    }
  }
  return (
    <Screen>
      <AppText style={{ fontFamily: 'DMSansBold', fontSize: 32, letterSpacing: -1 }}>
        finora
      </AppText>
      <AppText tone="accent" style={{ letterSpacing: 2, fontSize: 12 }}>
        A CLEARER EVERYDAY
      </AppText>
      <AppText
        accessibilityRole="header"
        style={{ fontFamily: 'DMSansBold', fontSize: 36, lineHeight: 44 }}
      >
        {registration ? 'Your next chapter\nstarts here.' : 'Welcome back.\nMake room for clarity.'}
      </AppText>
      <AppText tone="muted">
        {registration
          ? 'A calm space for the money you track. Choose your base currency before your first account.'
          : 'Sign in to pick up where you left off.'}
      </AppText>
      <Card>
        {registration && (
          <Controller
            control={control}
            name="name"
            render={({ field }) => (
              <Field
                label="Your name"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={errors.name?.message}
                autoComplete="name"
              />
            )}
          />
        )}
        <Controller
          control={control}
          name="email"
          render={({ field }) => (
            <Field
              label="Email address"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.email?.message}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field }) => (
            <Field
              label={registration ? 'Password · at least 12 characters' : 'Password'}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.password?.message}
              secureTextEntry
              autoComplete={registration ? 'new-password' : 'current-password'}
            />
          )}
        />
        {registration && (
          <Choice
            label="Base currency"
            value={currency}
            options={currencySchema.options.map((value) => ({ value, label: value }))}
            onChange={setCurrency}
          />
        )}
        <AppButton
          title={registration ? 'Create account' : 'Sign in'}
          loading={isSubmitting}
          onPress={() => {
            void handleSubmit(submit)();
          }}
        />
      </Card>
      {!!error && <Feedback error={error} />}
      {!registration && (
        <Link href="/(auth)/forgot-password" asChild>
          <AppText tone="accent" style={{ textAlign: 'center', padding: 10 }}>
            Forgot your password?
          </AppText>
        </Link>
      )}
      <Link href={registration ? '/(auth)/login' : '/(auth)/register'} asChild>
        <AppText tone="accent" style={{ textAlign: 'center', padding: 12 }}>
          {registration ? 'Already tracking with us? Sign in' : 'New here? Create your account'}
        </AppText>
      </Link>
      <AppText tone="muted" style={{ fontSize: 13, textAlign: 'center' }}>
        Manual tracking. No bank credentials required.
      </AppText>
    </Screen>
  );
}
