import { Disclosure } from '../src/components/design';
import { useTheme } from '../src/theme';
import {
  transactionInputSchema,
  transactionSchema,
  transactionUpdateSchema,
  type AccountWithBalance,
  type Category,
  type Transaction,
  type TransactionInput,
  type AssistantTransactionDraft,
} from '@finora/contracts';
import { calendarDate, parseMoney } from '@finora/finance-core';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { z } from 'zod';
import * as Crypto from 'expo-crypto';
import { useQueryClient } from '@tanstack/react-query';
import { DateField, FlowSheet, SelectField } from '../src/components/flow';
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
import { useTransactionDrafts } from '../src/stores/transaction-drafts';

export default function TransactionScreen() {
  const params = useLocalSearchParams<{
    id?: string;
    duplicate?: string;
    favourite?: string;
    assistantDraft?: string;
  }>();
  const { vault, user } = useApp();
  const handoff = useTransactionDrafts((s) => s.active);
  const requestedDraft =
    typeof params.assistantDraft === 'string' ? params.assistantDraft : undefined;
  const submitted = useTransactionDrafts(
    (s) => !!requestedDraft && s.submitted.includes(`${user?.id}:${requestedDraft}`),
  );
  const assistantDraft =
    handoff &&
    user &&
    handoff.ownerId === user.id &&
    handoff?.answerId === requestedDraft &&
    handoff?.value.currency === user?.preferences.baseCurrency &&
    handoff?.value.timezone === user?.preferences.timezone
      ? handoff.value
      : undefined;
  useEffect(
    () => () => {
      if (user && requestedDraft) useTransactionDrafts.getState().close(user.id, requestedDraft);
    },
    [user?.id, requestedDraft],
  );
  const favourites = useLocalRecords('favourite:', favouriteSchema);
  const lastUsed = useLocalRecords('last-used:', lastUsedSchema);
  const id = typeof params.id === 'string' ? params.id : undefined;
  const source = useRead(`transactions/${id ?? ''}`, transactionSchema, !!id);
  const accounts = useRead('accounts?includeArchived=true', accountsSchema);
  const categories = useRead('categories?includeArchived=true', categoriesSchema);
  const error = accounts.error ?? categories.error ?? (id ? source.error : null);
  if (
    requestedDraft &&
    (!assistantDraft || submitted || id || params.favourite || params.duplicate)
  )
    return (
      <Screen title="Draft unavailable" includeTopInset={false}>
        <AppText>
          This draft has expired, was already submitted or belongs to a different session. Ask
          Finora to prepare a new one.
        </AppText>
        <AppButton title="Back to chat" onPress={() => router.replace('/(tabs)/ask')} />
      </Screen>
    );
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
        <Loading variant="form" />
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
      key={`${id ?? 'new'}-${params.duplicate ?? ''}-${params.favourite ?? ''}-${requestedDraft ?? ''}`}
      source={source.data}
      duplicate={params.duplicate === 'true'}
      accounts={accounts.data ?? []}
      categories={categories.data ?? []}
      preset={favourite?.body}
      lastUsed={Object.fromEntries(
        (lastUsed.data ?? []).map((row) => [row.key.slice('last-used:'.length), row.value]),
      )}
      hasFavourites={!!favourites.data?.length}
      assistantDraft={assistantDraft}
      answerId={requestedDraft}
    />
  );
}
function TransactionForm({
  source: currentSource,
  duplicate,
  accounts,
  categories,
  preset,
  lastUsed,
  hasFavourites,
  assistantDraft,
  answerId,
}: {
  source?: Transaction;
  duplicate: boolean;
  accounts: AccountWithBalance[];
  categories: Category[];
  preset?: TransactionInput;
  lastUsed: Partial<Record<TransactionInput['type'], z.infer<typeof lastUsedSchema>>>;
  hasFavourites: boolean;
  assistantDraft?: AssistantTransactionDraft;
  answerId?: string;
}) {
  const [source] = useState(currentSource);
  const { user, vault } = useApp();
  const theme = useTheme();
  const client = useQueryClient();
  const [favouriteOpen, setFavouriteOpen] = useState(false);
  const [favouriteName, setFavouriteName] = useState('');
  const [favouriteSaving, setFavouriteSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const timezone = user?.preferences.timezone ?? 'Asia/Kolkata';
  const currency = user?.preferences.baseCurrency ?? 'INR';
  const original = duplicate ? undefined : source;
  const seed = source ?? preset;
  const recent = lastUsed[seed?.type ?? 'EXPENSE'];
  const initial = useRef({
    type: assistantDraft?.type ?? seed?.type ?? 'EXPENSE',
    amount: assistantDraft
      ? assistantDraft.amountMinor === null
        ? ''
        : decimalAmount(assistantDraft.amountMinor, currency)
      : seed
        ? decimalAmount(seed.amountMinor, currency)
        : '',
    accountId: assistantDraft
      ? (assistantDraft.accountId ?? '')
      : (seed?.accountId ??
        accounts.find((item) => item.id === recent?.accountId && !item.archived)?.id ??
        accounts.find((item) => !item.archived)?.id ??
        ''),
    destinationAccountId: assistantDraft
      ? (assistantDraft.destinationAccountId ?? '')
      : (seed?.destinationAccountId ?? ''),
    categoryId: assistantDraft
      ? (assistantDraft.categoryId ?? '')
      : (seed?.categoryId ??
        categories.find(
          (item) =>
            item.id === recent?.categoryId &&
            !item.archived &&
            item.type === (seed?.type ?? 'EXPENSE'),
        )?.id ??
        ''),
    date:
      assistantDraft?.date ??
      calendarDate(source && !duplicate ? new Date(source.date) : new Date(), timezone),
    merchant: assistantDraft?.merchant ?? seed?.merchant ?? '',
    note: assistantDraft?.note ?? seed?.note ?? '',
    tags: seed?.tags.join(', ') ?? '',
  }).current;
  const [form, setForm] = useState(initial);
  const [detailsOpen] = useState(!!(initial.merchant || initial.note || initial.tags));
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    if (save.isPending || remove.isPending) return;
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
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
    let amountMinor: string;
    try {
      amountMinor = parseMoney(form.amount, currency);
    } catch (failure) {
      setFieldErrors({ amount: failure instanceof Error ? failure.message : 'Enter an amount.' });
      throw failure;
    }
    return {
      type: form.type,
      accountId: form.accountId,
      ...(form.type === 'TRANSFER'
        ? { destinationAccountId: form.destinationAccountId }
        : { categoryId: form.categoryId }),
      amountMinor,
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
    setFieldErrors({});
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
      if (answerId && user) useTransactionDrafts.getState().complete(user.id, answerId);
      allowLeave();
      router.back();
    } catch (failure) {
      if (failure instanceof z.ZodError)
        setFieldErrors(
          Object.fromEntries(
            failure.issues
              .filter((issue) =>
                ['amountMinor', 'accountId', 'destinationAccountId', 'categoryId', 'date'].includes(
                  String(issue.path[0]),
                ),
              )
              .map((issue) => {
                const key = String(issue.path[0] ?? 'form');
                return [
                  key === 'amountMinor' ? 'amount' : key,
                  key === 'accountId'
                    ? 'Choose an account.'
                    : key === 'categoryId'
                      ? 'Choose a category.'
                      : key === 'destinationAccountId'
                        ? 'Choose a different destination account.'
                        : issue.message,
                ];
              }),
          ),
        );
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
        duplicate
          ? 'Duplicate entry'
          : original
            ? 'Edit entry'
            : form.type === 'EXPENSE'
              ? 'Add expense'
              : form.type === 'INCOME'
                ? 'Add income'
                : 'Account transfer'
      }
      subtitle={
        form.type === 'TRANSFER'
          ? 'Between your own accounts'
          : 'Record it now. Keep your day moving.'
      }
      includeTopInset={false}
      bottomAction={
        <AppButton
          title={
            original
              ? 'Save transaction'
              : form.type === 'EXPENSE'
                ? 'Save expense'
                : form.type === 'INCOME'
                  ? 'Save income'
                  : 'Save transfer'
          }
          loading={save.isPending}
          disabled={remove.isPending || (!hasAccounts && !original)}
          onPress={() => {
            void submit();
          }}
        />
      }
    >
      {!original && hasFavourites && (
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
        disabled={save.isPending || remove.isPending}
        onChange={(type) => {
          setFieldErrors({});
          setError('');
          const defaults = lastUsed[type];
          setForm((current) => ({
            ...current,
            type,
            accountId:
              accounts.find((a) => a.id === defaults?.accountId && !a.archived)?.id ??
              current.accountId,
            categoryId:
              categories.find(
                (c) => c.id === defaults?.categoryId && c.type === type && !c.archived,
              )?.id ?? '',
            destinationAccountId:
              accounts.find((a) => a.id === defaults?.destinationAccountId && !a.archived)?.id ??
              '',
          }));
        }}
        options={[
          { value: 'EXPENSE', label: 'Expense' },
          { value: 'INCOME', label: 'Income' },
          { value: 'TRANSFER', label: 'Transfer' },
        ]}
      />
      <Field
        editable={!save.isPending && !remove.isPending}
        label={`Amount (${currency})`}
        error={fieldErrors.amount}
        value={form.amount}
        onChangeText={(value) => set('amount', value)}
        keyboardType="decimal-pad"
        maxLength={35}
        placeholder="0.00"
        style={{
          fontSize: 36,
          lineHeight: 46,
          fontFamily: 'DMSansBold',
          minHeight: 88,
          color:
            form.type === 'EXPENSE'
              ? theme.danger
              : form.type === 'INCOME'
                ? theme.accent
                : theme.text,
          fontVariant: ['tabular-nums'],
        }}
      />
      <SelectField
        disabled={save.isPending || remove.isPending}
        label={form.type === 'INCOME' ? 'Received in' : 'Paid from'}
        error={fieldErrors.accountId}
        value={form.accountId}
        onChange={(value) => set('accountId', value)}
        options={eligibleAccounts.map((item) => ({
          value: item.id,
          label: `${item.name}${item.archived ? ' (archived)' : ''}`,
        }))}
      />
      {form.type === 'TRANSFER' ? (
        <SelectField
          disabled={save.isPending || remove.isPending}
          label="To account"
          error={fieldErrors.destinationAccountId}
          value={form.destinationAccountId}
          onChange={(value) => set('destinationAccountId', value)}
          options={eligibleAccounts
            .filter((item) => item.id !== form.accountId)
            .map((item) => ({ value: item.id, label: item.name }))}
        />
      ) : (
        <>
          <SelectField
            disabled={save.isPending || remove.isPending}
            label="Category"
            error={fieldErrors.categoryId}
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
      <DateField
        disabled={save.isPending || remove.isPending}
        label="Date"
        error={fieldErrors.date}
        value={form.date}
        onChange={(value) => set('date', value)}
      />
      <Field
        editable={!save.isPending && !remove.isPending}
        label="Description (optional)"
        placeholder="e.g. Lunch, groceries or salary"
        value={form.merchant}
        onChangeText={(value) => set('merchant', value)}
        maxLength={120}
      />
      <Disclosure title="Add a note or tags" initiallyOpen={detailsOpen}>
        <Field
          editable={!save.isPending && !remove.isPending}
          label="Note (optional)"
          value={form.note}
          onChangeText={(value) => set('note', value)}
          maxLength={1000}
          multiline
        />
        <Field
          editable={!save.isPending && !remove.isPending}
          label="Tags (comma separated, optional)"
          value={form.tags}
          onChangeText={(value) => set('tags', value)}
          maxLength={310}
        />
      </Disclosure>

      {!Object.values(fieldErrors).some(Boolean) && (error || save.error || remove.error) && (
        <Feedback error={error ? new Error(error) : (save.error ?? remove.error)} />
      )}
      <Disclosure title="More actions">
        {vault && (
          <AppButton
            title="Save as favourite"
            variant="secondary"
            disabled={save.isPending || remove.isPending}
            onPress={() => {
              setFavouriteName(
                form.merchant ||
                  eligibleCategories.find((c) => c.id === form.categoryId)?.name ||
                  '',
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
            editable={!save.isPending && !remove.isPending}
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
      </Disclosure>
    </Screen>
  );
}
