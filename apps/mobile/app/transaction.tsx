import {
  transactionInputSchema,
  transactionSchema,
  transactionUpdateSchema,
  type AccountWithBalance,
  type Category,
  type Transaction,
  type TransactionInput,
} from '@finora/contracts';
import { calendarDate, parseMoney } from '@finora/finance-core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { z } from 'zod';
import * as Crypto from 'expo-crypto';
import { useQueryClient } from '@tanstack/react-query';
import { FlowSheet } from '../src/components/flow';
import { useLocalRecords, lastUsedSchema } from '../src/storage/hooks';
import { favouriteSchema } from '../src/storage/favourites';
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
  const params = useLocalSearchParams<{ id?: string; duplicate?: string; favourite?: string }>();
  const { vault } = useApp();
  const favourites = useLocalRecords('favourite:', favouriteSchema);
  const lastUsed = useLocalRecords('last-used:', lastUsedSchema);
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
  if (
    accounts.isPending ||
    categories.isPending ||
    (id && source.isPending) ||
    (!!vault && (params.favourite ? favourites.isPending : !id && lastUsed.isPending))
  )
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  const favourite = favourites.data?.find((row) => row.value.id === params.favourite)?.value;
  if (params.favourite && !favourite)
    return (
      <Screen title="Favourite unavailable">
        <AppText>This favourite is no longer available on this device.</AppText>
        <AppButton title="View favourites" onPress={() => router.replace('/favourites')} />
      </Screen>
    );
  return (
    <TransactionForm
      key={`${id ?? 'new'}-${params.duplicate ?? ''}-${params.favourite ?? ''}`}
      source={source.data}
      duplicate={params.duplicate === 'true'}
      accounts={accounts.data ?? []}
      categories={categories.data ?? []}
      preset={favourite?.body}
      lastUsed={lastUsed.data?.find((row) => row.key === 'last-used:EXPENSE')?.value}
    />
  );
}
function TransactionForm({
  source,
  duplicate,
  accounts,
  categories,
  preset,
  lastUsed,
}: {
  source?: Transaction;
  duplicate: boolean;
  accounts: AccountWithBalance[];
  categories: Category[];
  preset?: TransactionInput;
  lastUsed?: z.infer<typeof lastUsedSchema>;
}) {
  const { user, vault } = useApp();
  const client = useQueryClient();
  const [favouriteOpen, setFavouriteOpen] = useState(false);
  const [favouriteName, setFavouriteName] = useState('');
  const [favouriteSaving, setFavouriteSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const timezone = user?.preferences.timezone ?? 'Asia/Kolkata';
  const currency = user?.preferences.baseCurrency ?? 'INR';
  const original = duplicate ? undefined : source;
  const seed = source ?? preset;
  const initial = {
    type: seed?.type ?? 'EXPENSE',
    amount: seed ? decimalAmount(seed.amountMinor, currency) : '',
    accountId:
      seed?.accountId ??
      accounts.find((item) => item.id === lastUsed?.accountId && !item.archived)?.id ??
      accounts.find((item) => !item.archived)?.id ??
      '',
    destinationAccountId: seed?.destinationAccountId ?? '',
    categoryId:
      seed?.categoryId ??
      categories.find(
        (item) => item.id === lastUsed?.categoryId && !item.archived && item.type === 'EXPENSE',
      )?.id ??
      '',
    date: calendarDate(source && !duplicate ? new Date(source.date) : new Date(), timezone),
    merchant: seed?.merchant ?? '',
    note: seed?.note ?? '',
    tags: seed?.tags.join(', ') ?? '',
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
  function inputBody() {
    return {
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
  }
  async function saveFavourite() {
    if (!vault) return;
    setError('');
    setFavouriteSaving(true);
    try {
      const rows = await vault.list('favourite:', favouriteSchema);
      if (rows.length >= 50) throw new Error('You can keep up to 50 favourites on this device.');
      const favourite = favouriteSchema.parse({
        id: Crypto.randomUUID(),
        name: favouriteName,
        body: transactionInputSchema.parse(inputBody()),
      });
      await vault.write(`favourite:${favourite.id}`, favourite);
      await client.invalidateQueries({ queryKey: [user?.id, 'local'] });
      setFavouriteOpen(false);
      setNotice('Favourite saved on this device.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save favourite.');
    } finally {
      setFavouriteSaving(false);
    }
  }
  async function submit() {
    setError('');
    try {
      const body = inputBody();
      await save.mutateAsync(
        original
          ? transactionUpdateSchema.parse({ ...body, version: original.version })
          : transactionInputSchema.parse(body),
      );
      if (vault)
        await vault
          .write(
            `last-used:${body.type}`,
            lastUsedSchema.parse({
              accountId: body.accountId,
              categoryId: 'categoryId' in body ? body.categoryId : undefined,
              destinationAccountId:
                'destinationAccountId' in body ? body.destinationAccountId : undefined,
            }),
          )
          .catch(() => undefined);
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
      {!original && (
        <AppButton
          title="Choose a favourite"
          variant="secondary"
          onPress={() => router.push('/favourites')}
        />
      )}
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
      {vault && (
        <AppButton
          title="Save as favourite"
          variant="secondary"
          disabled={save.isPending || remove.isPending}
          onPress={() => {
            setFavouriteName(
              form.merchant || eligibleCategories.find((c) => c.id === form.categoryId)?.name || '',
            );
            setFavouriteOpen(true);
          }}
        />
      )}
      {notice ? <AppText tone="accent">{notice}</AppText> : null}
      <FlowSheet
        title="Save favourite"
        visible={favouriteOpen}
        onClose={() => {
          if (!favouriteSaving) setFavouriteOpen(false);
        }}
        footer={
          <AppButton
            title="Save favourite"
            loading={favouriteSaving}
            onPress={() => {
              void saveFavourite();
            }}
          />
        }
      >
        <Field
          label="Favourite name"
          value={favouriteName}
          onChangeText={setFavouriteName}
          maxLength={60}
        />
        <AppText tone="muted">
          Stores this draft securely on this device. Using it opens a new transaction dated today;
          nothing is posted automatically.
        </AppText>
        {error && <Feedback error={new Error(error)} />}
      </FlowSheet>
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
