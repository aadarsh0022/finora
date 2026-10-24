import { View, Pressable, useWindowDimensions } from 'react-native';
import { openURL } from 'expo-linking';
import { publicPageUrl } from '../../public-site';
import { SelectField } from '../../components/flow';
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
import { AppButton, AppText, Feedback, Field, Screen } from '../../components/ui';
import { useApp } from '../../providers/app-provider';
import { FinoraWordmark } from '../../components/brand';
import { Icon } from '../../components/design';
import { useTheme } from '../../theme';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const { height } = useWindowDimensions();
  const theme = useTheme();
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
      await acceptSession(tokens, { registration });
    } catch (failure) {
      setError(failure);
    }
  }
  return (
    <Screen showPendingStatus={false} contentStyle={{ padding: 24, paddingBottom: 12, gap: 0 }}>
      <View style={{ minHeight: Math.max(620, height - 94), gap: 24 }}>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            right: -50,
            top: -100,
            width: 210,
            height: 210,
            borderRadius: 105,
            backgroundColor: theme.accentSoft,
            opacity: 0.7,
          }}
        />
        <View style={{ marginTop: 34 }}>
          <FinoraWordmark large />
        </View>
        <View style={{ gap: 10, marginTop: 14 }}>
          <AppText
            accessibilityRole="header"
            style={{ fontFamily: 'DMSansBold', fontSize: 36, lineHeight: 44, letterSpacing: -1 }}
          >
            {registration ? 'Create your account' : 'Welcome back'}
          </AppText>
          <AppText tone="muted" style={{ fontSize: 16 }}>
            {registration
              ? 'A clearer view of your money.'
              : 'Sign in to pick up where you left off.'}
          </AppText>
        </View>
        <View style={{ gap: 22, marginTop: 14 }}>
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
                leadingAction={<Icon name="mail" size={20} />}
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
                leadingAction={<Icon name="lock" size={20} />}
                secureTextEntry
                autoComplete={registration ? 'new-password' : 'current-password'}
              />
            )}
          />
          {!registration && (
            <Link href="/(auth)/forgot-password" asChild>
              <AppText
                tone="accent"
                style={{ textAlign: 'right', paddingVertical: 6, marginTop: -12, fontSize: 13 }}
              >
                Forgot your password?
              </AppText>
            </Link>
          )}
          {registration && (
            <SelectField
              label="Base currency"
              value={currency}
              options={currencySchema.options.map((value) => ({ value, label: value }))}
              onChange={setCurrency}
            />
          )}
          {registration && (
            <AppText tone="muted" style={{ fontSize: 12 }}>
              Currency is fixed after your first account.
            </AppText>
          )}
          <AppButton
            title={registration ? 'Create account' : 'Sign in'}
            loading={isSubmitting}
            trailingIcon={<Icon name="arrowRight" color={theme.onAccent} />}
            onPress={() => {
              void handleSubmit(submit)();
            }}
          />
        </View>
        {!!error && <Feedback error={error} />}
        <Link href={registration ? '/(auth)/login' : '/(auth)/register'} asChild>
          <AppText tone="muted" style={{ textAlign: 'center', paddingVertical: 20, fontSize: 14 }}>
            {registration ? 'Already have an account? ' : 'New here? '}
            <AppText tone="accent" style={{ fontSize: 14 }}>
              {registration ? 'Sign in' : 'Create your account'}
            </AppText>
          </AppText>
        </Link>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 30,
            marginTop: 'auto',
            paddingTop: 20,
          }}
        >
          {(['privacy', 'terms'] as const).map((page) => (
            <Pressable
              key={page}
              accessibilityRole="link"
              accessibilityLabel={page === 'privacy' ? 'Privacy policy' : 'Terms'}
              onPress={() => {
                void openURL(publicPageUrl(page)).catch(setError);
              }}
              style={{ minHeight: 48, justifyContent: 'center' }}
            >
              <AppText tone="muted" style={{ fontSize: 12 }}>
                {page === 'privacy' ? 'Privacy' : 'Terms'}
              </AppText>
            </Pressable>
          ))}
        </View>
      </View>
    </Screen>
  );
}
