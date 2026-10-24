import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  type AssistantTransactionDraft,
  transactionInputSchema,
  transactionSchema,
} from '@finora/contracts';
import { formatMoney, parseMoney } from '@finora/finance-core';
import { AppButton, AppText, Card, Feedback, Field } from '../../components/ui';
import { useApp } from '../../providers/app-provider';
import { useTransactionDrafts } from '../../stores/transaction-drafts';
import { useFinanceMutation } from '../../hooks/finance';
import { accountsSchema, categoriesSchema, useRead } from '../finance/shared';
import { dateInstant, decimalAmount } from '../finance/values';
import { useTheme } from '../../theme';

function InlineSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const theme = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={() => setOpen(!open)}
        style={{
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: 10,
          minHeight: 46,
          padding: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <AppText tone="muted" style={{ fontSize: 12 }}>
          {label}
        </AppText>
        <AppText style={{ flex: 1, textAlign: 'right', fontSize: 13 }}>
          {options.find((option) => option.value === value)?.label ?? 'Choose'} ⌄
        </AppText>
      </Pressable>
      {open && (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={`${label} options`}
          style={{
            borderWidth: 1,
            borderColor: theme.border,
            borderRadius: 10,
            overflow: 'hidden',
          }}
        >
          {options.map((option) => (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ selected: option.value === value, disabled }}
              disabled={disabled}
              onPress={() => {
                onChange(option.value);
                setOpen(false);
              }}
              style={{
                padding: 12,
                minHeight: 44,
                backgroundColor: option.value === value ? theme.accentSoft : theme.surface,
              }}
            >
              <AppText style={{ fontSize: 13 }}>{option.label}</AppText>
            </Pressable>
          ))}
          {!options.length && (
            <AppText tone="muted" style={{ padding: 12, fontSize: 13 }}>
              Create an account or category in settings first.
            </AppText>
          )}
        </View>
      )}
    </View>
  );
}

export function TransactionDraftCard({
  draft,
  answerId,
}: {
  draft: AssistantTransactionDraft;
  answerId: string;
}) {
  const { user } = useApp();
  const submitted = useTransactionDrafts((state) =>
    state.submitted.includes(`${user?.id}:${answerId}`),
  );
  const accounts = useRead('accounts?includeArchived=true', accountsSchema, !submitted);
  const categories = useRead(
    'categories?includeArchived=true',
    categoriesSchema,
    !submitted && draft.type !== 'TRANSFER',
  );
  const [editing, setEditing] = useState(draft.missingFields.length > 0);
  const [amount, setAmount] = useState(
    draft.amountMinor ? decimalAmount(draft.amountMinor, draft.currency) : '',
  );
  const [accountId, setAccountId] = useState(draft.accountId ?? '');
  const [destinationId, setDestinationId] = useState(draft.destinationAccountId ?? '');
  const [categoryId, setCategoryId] = useState(draft.categoryId ?? '');
  const [date, setDate] = useState(draft.date);
  const [error, setError] = useState<unknown>();
  const lock = useRef(false);
  const save = useFinanceMutation('transactions', transactionSchema, 'POST', true);
  const activeAccounts = (accounts.data ?? []).filter((account) => !account.archived);
  const availableCategories = (categories.data ?? []).filter(
    (category) => !category.archived && category.type === draft.type,
  );
  let displayAmount = amount || 'Amount needed';
  try {
    if (amount)
      displayAmount = formatMoney(
        parseMoney(amount, draft.currency),
        draft.currency,
        user?.preferences.locale ?? 'en-IN',
      );
  } catch {
    /* Keep the incomplete input visible while editing. */
  }
  async function confirm() {
    if (lock.current || submitted || !user) return;
    lock.current = true;
    setError(undefined);
    try {
      if (
        draft.currency !== user.preferences.baseCurrency ||
        draft.timezone !== user.preferences.timezone
      )
        throw new Error('Your preferences changed. Ask for a new transaction draft.');
      if (!activeAccounts.some((account) => account.id === accountId))
        throw new Error('Choose an active account.');
      if (
        draft.type === 'TRANSFER'
          ? !activeAccounts.some(
              (account) => account.id === destinationId && account.id !== accountId,
            )
          : !availableCategories.some((category) => category.id === categoryId)
      )
        throw new Error(
          draft.type === 'TRANSFER'
            ? 'Choose a different destination account.'
            : 'Choose a category.',
        );
      const input = transactionInputSchema.parse({
        type: draft.type,
        amountMinor: parseMoney(amount, draft.currency),
        accountId,
        ...(draft.type === 'TRANSFER' ? { destinationAccountId: destinationId } : { categoryId }),
        date: dateInstant(date, draft.timezone),
        merchant: draft.merchant,
        note: draft.note,
        tags: [],
      });
      await save.mutateAsync(input);
      useTransactionDrafts.getState().complete(user.id, answerId);
      setEditing(false);
    } catch (failure) {
      setError(
        failure instanceof Error && failure.name === 'ZodError'
          ? new Error('Check the amount and date before saving.')
          : failure,
      );
      setEditing(true);
    } finally {
      lock.current = false;
    }
  }
  return (
    <Card style={{ gap: 10, borderRadius: 22 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText tone="muted" style={{ fontSize: 12 }}>
          {draft.type === 'EXPENSE' ? 'Expense' : draft.type === 'INCOME' ? 'Income' : 'Transfer'}
        </AppText>
        {!submitted && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit transaction details"
            disabled={save.isPending}
            onPress={() => setEditing(!editing)}
            style={{ minHeight: 36, justifyContent: 'center' }}
          >
            <AppText tone="accent" style={{ fontSize: 12 }}>
              {editing ? 'Done editing' : 'Edit details'}
            </AppText>
          </Pressable>
        )}
      </View>
      <AppText style={{ fontFamily: 'DMSansBold', fontSize: 30, lineHeight: 38 }}>
        {displayAmount}
      </AppText>
      {!!draft.merchant && <AppText style={{ fontFamily: 'DMSansBold' }}>{draft.merchant}</AppText>}
      {editing && !submitted ? (
        <View style={{ gap: 10 }}>
          <Field
            label={`Amount (${draft.currency})`}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            editable={!save.isPending}
          />
          <InlineSelect
            label="Account"
            value={accountId}
            options={activeAccounts.map((account) => ({ value: account.id, label: account.name }))}
            disabled={save.isPending}
            onChange={setAccountId}
          />
          {draft.type === 'TRANSFER' ? (
            <InlineSelect
              label="To account"
              value={destinationId}
              options={activeAccounts
                .filter((account) => account.id !== accountId)
                .map((account) => ({ value: account.id, label: account.name }))}
              disabled={save.isPending}
              onChange={setDestinationId}
            />
          ) : (
            <InlineSelect
              label="Category"
              value={categoryId}
              options={availableCategories.map((category) => ({
                value: category.id,
                label: category.name,
              }))}
              disabled={save.isPending}
              onChange={setCategoryId}
            />
          )}
          <Field
            label="Date"
            hint="YYYY-MM-DD"
            value={date}
            onChangeText={setDate}
            editable={!save.isPending}
          />
        </View>
      ) : (
        <>
          <AppText tone="muted" style={{ fontSize: 13 }}>
            {activeAccounts.find((account) => account.id === accountId)?.name ??
              draft.accountName ??
              'Account needed'}{' '}
            ·{' '}
            {draft.type === 'TRANSFER'
              ? (activeAccounts.find((account) => account.id === destinationId)?.name ??
                draft.destinationAccountName ??
                'Destination needed')
              : (availableCategories.find((category) => category.id === categoryId)?.name ??
                draft.categoryName ??
                'Category needed')}
          </AppText>
          <AppText tone="muted" style={{ fontSize: 12 }}>
            {date}
          </AppText>
        </>
      )}
      {!!draft.note && (
        <AppText tone="muted" style={{ fontSize: 13 }}>
          {draft.note}
        </AppText>
      )}
      {!!error && <Feedback error={error} />}
      {(accounts.error || categories.error) && !submitted && (
        <Feedback
          error={accounts.error ?? categories.error}
          retry={() => {
            void accounts.refetch();
            if (draft.type !== 'TRANSFER') void categories.refetch();
          }}
        />
      )}
      <AppButton
        title={submitted ? 'Saved' : 'Confirm and save'}
        disabled={
          submitted ||
          !user ||
          accounts.isPending ||
          (draft.type !== 'TRANSFER' && categories.isPending)
        }
        loading={save.isPending}
        onPress={() => {
          void confirm();
        }}
      />
      {!submitted && (
        <AppText tone="muted" style={{ fontSize: 11 }}>
          Nothing is saved until you confirm.
        </AppText>
      )}
    </Card>
  );
}
