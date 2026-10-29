import { SelectField } from '../src/components/flow';
import { Disclosure, ImpactNotice, ReviewSheet } from '../src/components/design';
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
import { AppButton, AppText, Card, Feedback, Field, Loading, Screen } from '../src/components/ui';
import { decimalAmount, useRead, useMoney } from '../src/features/finance/shared';
import { useFinanceMutation, useUnsavedChanges } from '../src/hooks/finance';
import { useApp } from '../src/providers/app-provider';

export default function AccountScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : undefined;
  const query = useRead(`accounts/${id ?? ''}`, accountWithBalanceSchema, !!id);
  if (id && query.isPending)
    return (
      <Screen>
        <Loading variant="form" />
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
function AccountForm({ account: currentAccount }: { account?: AccountWithBalance }) {
  const [account] = useState(currentAccount);
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
  const [nameError, setNameError] = useState('');
  const [reviewed, setReviewed] = useState<
    z.infer<typeof accountInputSchema> | z.infer<typeof accountUpdateSchema>
  >();
  const money = useMoney();
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
    setNameError('');
    if (!name.trim()) {
      setNameError('Enter an account name');
      return;
    }
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
      setReviewed(validated);
    } catch (failure) {
      setError(
        failure instanceof z.ZodError
          ? 'Check the account details and try again.'
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
      includeTopInset={false}
      bottomAction={
        <AppButton
          title="Review account"
          loading={save.isPending}
          disabled={archive.isPending}
          onPress={() => {
            void submit(!!account?.archived);
          }}
        />
      }
    >
      <Field
        label="Account name"
        value={name}
        onChangeText={(value) => {
          setName(value);
          setNameError('');
        }}
        error={nameError}
        maxLength={80}
        autoCapitalize="words"
      />
      <SelectField
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
      <ImpactNotice title="Your balance before recorded transactions">
        {account
          ? 'Changing the opening balance also changes the current balance. Review the effect before saving.'
          : 'This is your starting balance. It is not counted as income.'}
      </ImpactNotice>
      {account?.archived && (
        <Card>
          <AppText>This account is archived. Restore it to use it in new transactions.</AppText>
        </Card>
      )}
      {(error || save.error || archive.error) && (
        <Feedback error={error ? new Error(error) : (save.error ?? archive.error)} />
      )}
      {account && !account.archived && (
        <Disclosure title="Manage account">
          <AppButton
            title="Archive account"
            variant="danger"
            loading={archive.isPending}
            disabled={save.isPending || dirty}
            onPress={confirmArchive}
          />
        </Disclosure>
      )}
      <ReviewSheet
        title="Review account"
        visible={!!reviewed}
        rows={
          reviewed
            ? [
                { label: 'Name', value: reviewed.name },
                { label: 'Opening balance', value: money(reviewed.openingBalanceMinor) },
                ...(account
                  ? [
                      {
                        label: 'Resulting balance',
                        value: money(
                          (
                            BigInt(account.balanceMinor) -
                            BigInt(account.openingBalanceMinor) +
                            BigInt(reviewed.openingBalanceMinor)
                          ).toString(),
                        ),
                      },
                    ]
                  : []),
              ]
            : []
        }
        impact="Opening balances affect account totals, but do not count as income. Existing transactions stay unchanged."
        confirmLabel={
          account?.archived
            ? 'Save and restore account'
            : account
              ? 'Save changes'
              : 'Create account'
        }
        busy={save.isPending}
        error={save.error?.message}
        onClose={() => setReviewed(undefined)}
        onConfirm={() => {
          if (!reviewed) return;
          void save
            .mutateAsync(reviewed)
            .then(() => {
              allowLeave();
              router.back();
            })
            .catch(() => undefined);
        }}
      />
    </Screen>
  );
}
