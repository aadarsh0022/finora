import {
  accountInputSchema,
  accountSchema,
  accountUpdateSchema,
  accountWithBalanceSchema,
  type AccountWithBalance,
} from '@finora/contracts';
import { parseMoney } from '@finora/finance-core';
import { router, useLocalSearchParams } from 'expo-router';
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
} from '../src/components/ui';
import { decimalAmount, useRead } from '../src/features/finance/shared';
import { useFinanceMutation, useUnsavedChanges } from '../src/hooks/finance';
import { useApp } from '../src/providers/app-provider';

export default function AccountScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : undefined;
  const query = useRead(`accounts/${id ?? ''}`, accountWithBalanceSchema, !!id);
  if (id && query.isPending)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  if (id && query.isError)
    return (
      <Screen title="Account">
        <Feedback
          error={query.error}
          retry={() => {
            void query.refetch();
          }}
        />
      </Screen>
    );
  return <AccountForm key={id ?? 'new'} account={query.data} />;
}
function AccountForm({ account }: { account?: AccountWithBalance }) {
  const { user } = useApp();
  const currency = user?.preferences.baseCurrency ?? 'INR';
  const initial = {
    name: account?.name ?? '',
    type: account?.type ?? 'CHECKING',
    amount: decimalAmount(account?.openingBalanceMinor ?? '0', currency),
  };
  const [name, setName] = useState(initial.name);
  const [type, setType] = useState(initial.type);
  const [amount, setAmount] = useState(initial.amount);
  const [error, setError] = useState('');
  const dirty = name !== initial.name || type !== initial.type || amount !== initial.amount;
  const allowLeave = useUnsavedChanges(dirty);
  const save = useFinanceMutation(
    account ? `accounts/${account.id}` : 'accounts',
    accountSchema,
    account ? 'PATCH' : 'POST',
  );
  const archive = useFinanceMutation(`accounts/${account?.id ?? ''}`, accountSchema, 'DELETE');
  async function submit(restore = false) {
    setError('');
    try {
      const body = {
        name,
        type,
        openingBalanceMinor: parseMoney(amount, currency),
        icon: account?.icon ?? 'wallet',
        color: account?.color ?? '#187A5A',
      };
      const validated = account
        ? accountUpdateSchema.parse({
            ...body,
            version: account.version,
            archived: restore ? false : account.archived,
          })
        : accountInputSchema.parse(body);
      await save.mutateAsync(validated);
      allowLeave();
      router.back();
    } catch (failure) {
      setError(
        failure instanceof z.ZodError
          ? failure.issues.map((issue) => issue.message).join('\n')
          : failure instanceof Error
            ? failure.message
            : 'Could not save this account.',
      );
    }
  }
  function confirmArchive() {
    if (!account) return;
    Alert.alert(
      'Archive account?',
      'Existing transactions remain in your history. You can restore this account later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          onPress: () => {
            void archive
              .mutateAsync({ version: account.version })
              .then(() => {
                allowLeave();
                router.back();
              })
              .catch(() => undefined);
          },
        },
      ],
    );
  }
  return (
    <Screen
      title={account ? account.name : 'New account'}
      subtitle={`Track your money in ${currency}.`}
    >
      <Field
        label="Account name"
        value={name}
        onChangeText={setName}
        maxLength={80}
        autoCapitalize="words"
      />
      <Choice
        label="Account type"
        value={type}
        onChange={setType}
        options={[
          { value: 'CHECKING', label: 'Bank' },
          { value: 'SAVINGS', label: 'Savings' },
          { value: 'CASH', label: 'Cash' },
          { value: 'WALLET', label: 'Wallet' },
          { value: 'OTHER', label: 'Other' },
        ]}
      />
      <Field
        label={`Opening balance (${currency})`}
        value={amount}
        onChangeText={setAmount}
        keyboardType="numbers-and-punctuation"
        maxLength={35}
      />
      <AppText tone="muted">
        The opening balance is the amount before your tracked transactions. Changing it adjusts your
        current balance.
      </AppText>
      {account?.archived && (
        <Card>
          <AppText>This account is archived. Restore it to use it in new transactions.</AppText>
        </Card>
      )}
      {(error || save.error || archive.error) && (
        <Feedback error={error ? new Error(error) : (save.error ?? archive.error)} />
      )}
      <AppButton
        title={
          account?.archived
            ? 'Save and restore account'
            : account
              ? 'Save changes'
              : 'Create account'
        }
        loading={save.isPending}
        disabled={archive.isPending}
        onPress={() => {
          void submit(!!account?.archived);
        }}
      />
      {account && !account.archived && (
        <AppButton
          title="Archive account"
          variant="danger"
          loading={archive.isPending}
          disabled={save.isPending || dirty}
          onPress={confirmArchive}
        />
      )}
    </Screen>
  );
}
