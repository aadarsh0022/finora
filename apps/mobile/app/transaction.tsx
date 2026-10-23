import {
  transactionInputSchema,
  transactionSchema,
  transactionUpdateSchema,
  type AccountWithBalance,
  type Category,
  type Transaction,
} from '@finora/contracts';
import { calendarDate, parseMoney } from '@finora/finance-core';
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
import {
  accountsSchema,
  categoriesSchema,
  dateInstant,
  decimalAmount,
  useRead,
} from '../src/features/finance/shared';
import { useFinanceMutation, useUnsavedChanges } from '../src/hooks/finance';
import { useApp } from '../src/providers/app-provider';

export default function TransactionScreen() {
  const params = useLocalSearchParams<{ id?: string; duplicate?: string }>();
  const id = typeof params.id === 'string' ? params.id : undefined;
  const source = useRead(`transactions/${id ?? ''}`, transactionSchema, !!id);
  const accounts = useRead('accounts?includeArchived=true', accountsSchema);
  const categories = useRead('categories?includeArchived=true', categoriesSchema);
  const error = accounts.error ?? categories.error ?? (id ? source.error : null);
  if (error)
    return (
      <Screen title="Transaction">
        <Feedback
          error={error}
          retry={() => {
            void accounts.refetch();
            void categories.refetch();
            if (id) void source.refetch();
          }}
        />
      </Screen>
    );
  if (accounts.isPending || categories.isPending || (id && source.isPending))
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  return (
    <TransactionForm
      key={`${id ?? 'new'}-${params.duplicate ?? ''}`}
      source={source.data}
      duplicate={params.duplicate === 'true'}
      accounts={accounts.data ?? []}
      categories={categories.data ?? []}
    />
  );
}
function TransactionForm({
  source,
  duplicate,
  accounts,
  categories,
}: {
  source?: Transaction;
  duplicate: boolean;
  accounts: AccountWithBalance[];
  categories: Category[];
}) {
  const { user } = useApp();
  const timezone = user?.preferences.timezone ?? 'Asia/Kolkata';
  const currency = user?.preferences.baseCurrency ?? 'INR';
  const original = duplicate ? undefined : source;
  const initial = {
    type: source?.type ?? 'EXPENSE',
    amount: source ? decimalAmount(source.amountMinor, currency) : '',
    accountId: source?.accountId ?? accounts.find((item) => !item.archived)?.id ?? '',
    destinationAccountId: source?.destinationAccountId ?? '',
    categoryId: source?.categoryId ?? '',
    date: calendarDate(source && !duplicate ? new Date(source.date) : new Date(), timezone),
    merchant: source?.merchant ?? '',
    note: source?.note ?? '',
    tags: source?.tags.join(', ') ?? '',
  };
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  const dirty = JSON.stringify(initial) !== JSON.stringify(form);
  const allowLeave = useUnsavedChanges(dirty);
  const save = useFinanceMutation(
    original ? `transactions/${original.id}` : 'transactions',
    transactionSchema,
    original ? 'PATCH' : 'POST',
    !original,
  );
  const remove = useFinanceMutation(
    `transactions/${original?.id ?? ''}`,
    z.object({ id: z.uuid(), deleted: z.literal(true) }),
    'DELETE',
  );
  const eligibleAccounts = accounts.filter(
    (item) =>
      !item.archived ||
      item.id === original?.accountId ||
      item.id === original?.destinationAccountId,
  );
  const eligibleCategories = categories.filter(
    (item) => item.type === form.type && (!item.archived || item.id === original?.categoryId),
  );
  async function submit() {
    setError('');
    try {
      const body = {
        type: form.type,
        accountId: form.accountId,
        ...(form.type === 'TRANSFER'
          ? { destinationAccountId: form.destinationAccountId }
          : { categoryId: form.categoryId }),
        amountMinor: parseMoney(form.amount, currency),
        date:
          original && initial.date === form.date ? original.date : dateInstant(form.date, timezone),
        merchant: form.merchant,
        note: form.note,
        tags: form.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      };
      await save.mutateAsync(
        original
          ? transactionUpdateSchema.parse({ ...body, version: original.version })
          : transactionInputSchema.parse(body),
      );
      allowLeave();
      router.back();
    } catch (failure) {
      setError(
        failure instanceof z.ZodError
          ? failure.issues.map((issue) => issue.message).join('\n')
          : failure instanceof Error
            ? failure.message
            : 'Could not save this transaction.',
      );
    }
  }
  const hasAccounts = accounts.some((item) => !item.archived);
  return (
    <Screen
      title={
        duplicate ? 'Duplicate transaction' : original ? 'Edit transaction' : 'Add transaction'
      }
      subtitle={`Amounts in ${currency} · Dates in ${timezone}`}
    >
      {!hasAccounts && !original && (
        <Card>
          <AppText>Add an active account before recording a transaction.</AppText>
          <AppButton title="Create account" onPress={() => router.push('/account')} />
        </Card>
      )}
      <Choice
        label="Transaction type"
        value={form.type}
        onChange={(type) => {
          setForm((current) => ({ ...current, type, categoryId: '', destinationAccountId: '' }));
        }}
        options={[
          { value: 'EXPENSE', label: 'Expense' },
          { value: 'INCOME', label: 'Income' },
          { value: 'TRANSFER', label: 'Transfer' },
        ]}
      />
      <Field
        label={`Amount (${currency})`}
        value={form.amount}
        onChangeText={(value) => set('amount', value)}
        keyboardType="decimal-pad"
        maxLength={35}
      />
      <Choice
        label={form.type === 'TRANSFER' ? 'From account' : 'Account'}
        value={form.accountId}
        onChange={(value) => set('accountId', value)}
        options={eligibleAccounts.map((item) => ({
          value: item.id,
          label: `${item.name}${item.archived ? ' (archived)' : ''}`,
        }))}
      />
      {form.type === 'TRANSFER' ? (
        <Choice
          label="To account"
          value={form.destinationAccountId}
          onChange={(value) => set('destinationAccountId', value)}
          options={eligibleAccounts
            .filter((item) => item.id !== form.accountId)
            .map((item) => ({ value: item.id, label: item.name }))}
        />
      ) : (
        <>
          <Choice
            label="Category"
            value={form.categoryId}
            onChange={(value) => set('categoryId', value)}
            options={eligibleCategories.map((item) => ({
              value: item.id,
              label: `${item.name}${item.archived ? ' (archived)' : ''}`,
            }))}
          />
          {!eligibleCategories.length && (
            <AppButton
              title="Create a category"
              variant="secondary"
              onPress={() => router.push('/categories')}
            />
          )}
        </>
      )}
      <Field
        label="Date (YYYY-MM-DD)"
        value={form.date}
        onChangeText={(value) => set('date', value)}
        placeholder="2026-10-20"
        maxLength={10}
        autoCapitalize="none"
      />
      <Field
        label="Merchant (optional)"
        value={form.merchant}
        onChangeText={(value) => set('merchant', value)}
        maxLength={120}
      />
      <Field
        label="Note (optional)"
        value={form.note}
        onChangeText={(value) => set('note', value)}
        maxLength={1000}
        multiline
      />
      <Field
        label="Tags (comma separated, optional)"
        value={form.tags}
        onChangeText={(value) => set('tags', value)}
        maxLength={310}
      />
      {(error || save.error || remove.error) && (
        <Feedback error={error ? new Error(error) : (save.error ?? remove.error)} />
      )}
      <AppButton
        title={original ? 'Save transaction' : 'Add transaction'}
        loading={save.isPending}
        disabled={remove.isPending || (!hasAccounts && !original)}
        onPress={() => {
          void submit();
        }}
      />
      {original && (
        <>
          <AppButton
            title="Duplicate transaction"
            variant="secondary"
            disabled={dirty || save.isPending || remove.isPending}
            onPress={() =>
              router.push({
                pathname: '/transaction',
                params: { id: original.id, duplicate: 'true' },
              })
            }
          />
          <AppButton
            title="Delete transaction"
            variant="danger"
            loading={remove.isPending}
            disabled={dirty || save.isPending}
            onPress={() =>
              Alert.alert(
                'Delete transaction?',
                'This permanently removes the transaction and updates the affected balances.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => {
                      void remove
                        .mutateAsync({ version: original.version, confirmation: 'DELETE' })
                        .then(() => {
                          allowLeave();
                          router.back();
                        })
                        .catch(() => undefined);
                    },
                  },
                ],
              )
            }
          />
        </>
      )}
    </Screen>
  );
}
