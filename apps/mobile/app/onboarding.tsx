import { useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import type { z } from 'zod';
import {
  accountInputSchema,
  currencySchema,
  onboardingSyncSchema,
  type Preferences,
} from '@finora/contracts';
import { formatMoney, parseMoney } from '@finora/finance-core';
import { AppButton, AppText, Card, Choice, Feedback, Field, Screen } from '../src/components/ui';
import { SelectField } from '../src/components/flow';
import { ActionRow, Icon, ReviewSheet } from '../src/components/design';
import { accountsSchema } from '../src/features/finance/shared';
import { useUnsavedChanges } from '../src/hooks/finance';
import { useApp } from '../src/providers/app-provider';
import { useUi } from '../src/stores/ui';
import { useTheme } from '../src/theme';

export default function Onboarding() {
  const { user, vault, saveOnboarding, syncPending } = useApp();
  const theme = useTheme();
  const [step, setStep] = useState(0);
  const accounts = useQuery({
    queryKey: [user?.id, 'local', 'setup-accounts'],
    queryFn: async () =>
      (await vault?.read('read:accounts?includeArchived=true', accountsSchema))?.value ?? null,
  });
  const [currency, setCurrency] = useState(user?.preferences.baseCurrency ?? 'INR');
  const [timezone, setTimezone] = useState(user?.preferences.timezone ?? 'Asia/Kolkata');
  const [appearance, setAppearance] = useState<Preferences['preferredTheme']>(
    user?.preferences.preferredTheme ?? 'light',
  );
  const [name, setName] = useState('Everyday');
  const [type, setType] = useState<'CHECKING' | 'CASH' | 'WALLET'>('CHECKING');
  const [amount, setAmount] = useState('0');
  const [error, setError] = useState<unknown>();
  const [working, setWorking] = useState(false);
  const [reviewed, setReviewed] = useState<z.infer<typeof accountInputSchema>>();
  const lock = useRef(false);
  const busy = working || accounts.isPending;
  // An absent baseline is not proof that this existing user has no financial records.
  const hasAccount = accounts.data == null || !!accounts.data.length;
  const dirty = !hasAccount && (name !== 'Everyday' || amount !== '0' || type !== 'CHECKING');
  const allowLeave = useUnsavedChanges(dirty);
  function leave() {
    if (user) useUi.getState().dismissOnboarding(user.id);
    allowLeave();
    router.replace('/(tabs)');
  }
  async function finish(account?: z.infer<typeof accountInputSchema>) {
    if (lock.current) return;
    lock.current = true;
    setWorking(true);
    setError(undefined);
    try {
      if (!user) throw new Error('Please sign in again.');
      await saveOnboarding(
        onboardingSyncSchema.parse({
          baseline: user.preferences,
          preferences: {
            ...user.preferences,
            baseCurrency: hasAccount ? user.preferences.baseCurrency : currency,
            timezone,
            preferredTheme: appearance,
          },
          account: account ? { ...account, id: Crypto.randomUUID() } : undefined,
        }),
      );
      leave();
      void syncPending().catch(() => undefined);
    } catch (failure) {
      setError(failure);
    } finally {
      lock.current = false;
      setWorking(false);
    }
  }
  async function next() {
    if (busy) return;
    setError(undefined);
    if (step === 0) {
      setStep(1);
      return;
    }
    if (step === 1) {
      try {
        if (!user) return;
        onboardingSyncSchema.parse({
          baseline: user.preferences,
          preferences: {
            ...user.preferences,
            baseCurrency: hasAccount ? user.preferences.baseCurrency : currency,
            timezone,
            preferredTheme: appearance,
          },
        });
        setStep(2);
      } catch (failure) {
        setError(failure);
      }
      return;
    }
    if (hasAccount) {
      await finish();
      return;
    }
    try {
      setReviewed(
        accountInputSchema.parse({
          name,
          type,
          openingBalanceMinor: parseMoney(
            amount,
            hasAccount ? (user?.preferences.baseCurrency ?? currency) : currency,
          ),
        }),
      );
    } catch (failure) {
      setError(failure);
    }
  }
  const timezoneOptions = [
    ...new Set([
      timezone,
      'Asia/Kolkata',
      'Asia/Dubai',
      'Europe/London',
      'America/New_York',
      'America/Chicago',
      'America/Los_Angeles',
      'Australia/Sydney',
      'Asia/Singapore',
      'UTC',
    ]),
  ];
  return (
    <Screen
      title={step === 0 ? 'Walleto' : step === 1 ? 'Make it yours' : 'Start with one account'}
      subtitle={
        step === 0
          ? 'A clearer picture of your money, one step at a time.'
          : step === 1
            ? 'Choose how your money and dates appear.'
            : 'Add the balance you have already recorded.'
      }
      bottomAction={
        <View style={{ gap: 8 }}>
          <AppButton
            title={
              step === 0
                ? 'Get started'
                : step === 1
                  ? 'Continue'
                  : hasAccount
                    ? 'Finish setup'
                    : 'Review first account'
            }
            loading={busy}
            disabled={busy}
            onPress={() => {
              void next();
            }}
          />
          <AppButton
            title="Set up later"
            variant="secondary"
            disabled={busy}
            onPress={() => {
              void finish();
            }}
          />
        </View>
      }
    >
      <View
        style={{ flexDirection: 'row', gap: 6 }}
        accessibilityLabel={`Setup step ${step + 1} of 3`}
      >
        {[0, 1, 2].map((index) => (
          <View
            key={index}
            style={{
              height: 4,
              flex: 1,
              borderRadius: 2,
              backgroundColor: index <= step ? theme.accent : theme.border,
            }}
          />
        ))}
      </View>
      {step > 0 && (
        <AppButton
          title="Back"
          variant="secondary"
          disabled={busy}
          onPress={() => setStep((current) => current - 1)}
        />
      )}
      {step === 0 && (
        <>
          <Card>
            <View style={{ gap: 12 }}>
              <Icon name="wallet" size={36} color={theme.accent} />
              <AppText style={{ fontFamily: 'DMSansBold', fontSize: 25, lineHeight: 34 }}>
                Your money. A little more clarity.
              </AppText>
              <AppText tone="muted">
                Track what happened, plan what is coming and review each change before saving.
              </AppText>
            </View>
          </Card>
          <ActionRow
            title="Know where you stand"
            subtitle="Accounts and activity show your recorded money."
            icon="wallet"
            onPress={() => setStep(1)}
          />
          <ActionRow
            title="Plan at your pace"
            subtitle="Budgets, goals and debts are ready when you need them."
            icon="plan"
            onPress={() => setStep(1)}
          />
          <ActionRow
            title="Ask Walleto AI"
            subtitle="Get answers or prepare a transaction draft. AI is optional and asks for separate consent."
            icon="info"
            last
            onPress={() => setStep(1)}
          />
          <AppText tone="muted" style={{ fontSize: 13 }}>
            No bank connection or payment access is required.
          </AppText>
        </>
      )}
      {step === 1 && (
        <>
          {hasAccount ? (
            <Card>
              <AppText>Base currency: {user?.preferences.baseCurrency}</AppText>
              <AppText tone="muted">
                Your currency is fixed because financial records already exist.
              </AppText>
            </Card>
          ) : (
            <SelectField
              label="Base currency"
              value={currency}
              onChange={setCurrency}
              disabled={busy}
              options={currencySchema.options.map((value) => ({ value, label: value }))}
            />
          )}
          <SelectField
            label="Timezone"
            value={timezone}
            onChange={setTimezone}
            disabled={busy}
            options={timezoneOptions.map((value) => ({ value, label: value.replaceAll('_', ' ') }))}
          />
          <Choice
            label="Appearance"
            value={appearance}
            onChange={setAppearance}
            disabled={busy}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'system', label: 'System' },
            ]}
          />
          <AppText tone="muted">
            Currency is fixed after financial records are added. Timezone controls reporting days
            and month boundaries.
          </AppText>
        </>
      )}
      {step === 2 &&
        (hasAccount ? (
          <Card>
            <AppText style={{ fontFamily: 'DMSansBold', fontSize: 22 }}>
              Continue to your money
            </AppText>
            <AppText tone="muted">
              You can add or manage accounts in Settings. Finishing this guide keeps your existing
              records.
            </AppText>
          </Card>
        ) : (
          <>
            <Field
              label="Account name"
              value={name}
              onChangeText={setName}
              maxLength={80}
              editable={!busy}
            />
            <Choice
              label="Account type"
              value={type}
              onChange={setType}
              disabled={busy}
              options={[
                { value: 'CHECKING', label: 'Bank' },
                { value: 'CASH', label: 'Cash' },
                { value: 'WALLET', label: 'Wallet' },
              ]}
            />
            <Field
              label={`Starting balance (${currency})`}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numbers-and-punctuation"
              maxLength={35}
              editable={!busy}
            />
            <AppText tone="muted">
              Use your balance before any transactions you plan to add. This starting balance is not
              counted as income. You can start at zero.
            </AppText>
          </>
        ))}
      {!!error && (
        <>
          <Feedback error={error} />
        </>
      )}
      <ReviewSheet
        title="Review first account"
        visible={!!reviewed}
        rows={
          reviewed
            ? [
                { label: 'Name', value: reviewed.name },
                {
                  label: 'Starting balance',
                  value: formatMoney(
                    reviewed.openingBalanceMinor,
                    currency,
                    user?.preferences.locale ?? 'en-IN',
                  ),
                },
              ]
            : []
        }
        impact="Creates this account with a starting balance. It does not record income or connect to a bank."
        confirmLabel="Create account"
        busy={busy}
        error={error instanceof Error ? error.message : undefined}
        onClose={() => setReviewed(undefined)}
        onConfirm={() => {
          if (!reviewed || busy || hasAccount) return;
          void finish(reviewed);
        }}
      />
    </Screen>
  );
}
