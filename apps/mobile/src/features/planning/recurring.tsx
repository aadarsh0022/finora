import {
  occurrenceConfirmSchema,
  recurringOccurrenceSchema,
  recurringRuleInputSchema,
  recurringRuleSchema,
  recurringRuleUpdateSchema,
  transactionSchema,
  type AccountWithBalance,
  type Category,
  type RecurringOccurrence,
  type RecurringRule,
} from '@finora/contracts';
import { calendarDate, parseMoney } from '@finora/finance-core';
import { useState } from 'react';
import { z } from 'zod';
import { AppButton, AppText, Card, Choice, Feedback, Field, Loading } from '../../components/ui';
import { useFinanceMutation, useUnsavedChanges } from '../../hooks/finance';
import { useApp } from '../../providers/app-provider';
import {
  accountsSchema,
  categoriesSchema,
  dateInstant,
  decimalAmount,
  useMoney,
  useRead,
} from '../finance/shared';
import { confirmDelete, confirmDiscard, deletedSchema, failureMessage } from './common';

export function Recurring({ onEditing }: { onEditing: (editing: boolean) => void }) {
  const money = useMoney();
  const rules = useRead('recurring', z.array(recurringRuleSchema));
  const [status, setStatus] = useState('PENDING');
  const occurrences = useRead(
    `recurring-occurrences?status=${status}`,
    z.array(recurringOccurrenceSchema),
  );
  const accounts = useRead('accounts?includeArchived=true', accountsSchema);
  const categories = useRead('categories?includeArchived=true', categoriesSchema);
  const generate = useFinanceMutation(
    'recurring/generate',
    z.object({ occurrences: z.array(recurringOccurrenceSchema), moreDue: z.boolean() }),
  );
  const [editing, setEditing] = useState<RecurringRule | 'new' | null>(null);
  const [confirming, setConfirming] = useState<RecurringOccurrence | null>(null);
  function edit(rule: RecurringRule | 'new' | null) {
    setEditing(rule);
    onEditing(rule !== null);
  }
  function confirm(occurrence: RecurringOccurrence | null) {
    setConfirming(occurrence);
    onEditing(occurrence !== null);
  }
  if (editing)
    return (
      <RuleForm
        rule={editing === 'new' ? undefined : editing}
        accounts={accounts.data ?? []}
        categories={categories.data ?? []}
        done={() => edit(null)}
      />
    );
  if (confirming)
    return (
      <ConfirmOccurrence
        occurrence={confirming}
        name={
          rules.data?.find((rule) => rule.id === confirming.ruleId)?.name ?? 'Recurring transaction'
        }
        accountName={accounts.data?.find((account) => account.id === confirming.accountId)?.name}
        categoryName={
          categories.data?.find((category) => category.id === confirming.categoryId)?.name
        }
        done={() => confirm(null)}
      />
    );
  return (
    <>
      <AppText tone="muted">
        Every due item needs your confirmation. Checking due items creates reminders; confirming an
        item records a real transaction and updates your balances.
      </AppText>
      <AppButton
        title="Create recurring item"
        disabled={!accounts.data || !categories.data}
        onPress={() => edit('new')}
      />
      <AppButton
        title="Check for due items"
        variant="secondary"
        loading={generate.isPending}
        onPress={() => generate.mutate({})}
      />
      {generate.error && <Feedback error={generate.error} />}
      {generate.data && (
        <AppText tone="accent" accessibilityRole="alert">
          {generate.data.occurrences.length} due items added.
          {generate.data.moreDue ? ' More items are due. Check again to load the next batch.' : ''}
        </AppText>
      )}
      {(rules.error || accounts.error || categories.error) && (
        <Feedback
          error={rules.error ?? accounts.error ?? categories.error}
          retry={() => {
            void rules.refetch();
            void accounts.refetch();
            void categories.refetch();
          }}
        />
      )}
      <AppText accessibilityRole="header" style={{ fontFamily: 'DMSansBold', fontSize: 22 }}>
        Your recurring items
      </AppText>
      {rules.isPending && <Loading />}
      {rules.data?.length === 0 && (
        <AppText tone="muted">
          Add regular income, rent, bills, or other repeating transactions.
        </AppText>
      )}
      {rules.data?.map((rule) => (
        <RuleCard key={rule.id} rule={rule} edit={() => edit(rule)} />
      ))}
      <Choice
        label="Due item history"
        value={status}
        onChange={setStatus}
        options={[
          { value: 'PENDING', label: 'Awaiting confirmation' },
          { value: 'POSTED', label: 'Posted' },
        ]}
      />
      {occurrences.isPending && <Loading />}
      {occurrences.isError && (
        <Feedback
          error={occurrences.error}
          retry={() => {
            void occurrences.refetch();
          }}
        />
      )}
      {occurrences.data?.length === 0 && (
        <AppText tone="muted">
          {status === 'PENDING'
            ? 'No pending items. Check for due items to refresh your reminders.'
            : 'No recurring transactions posted yet.'}
        </AppText>
      )}
      {occurrences.data?.map((item) => (
        <Card key={item.id}>
          <AppText style={{ fontFamily: 'DMSansBold' }}>
            {rules.data?.find((rule) => rule.id === item.ruleId)?.name ?? 'Recurring transaction'}
          </AppText>
          <AppText tone="muted">
            Due {item.dueDate} · {item.type.toLowerCase()} · {item.timezone}
          </AppText>
          <AppText>
            {item.amountMinor ? `${money(item.amountMinor)} · ` : ''}
            {item.status === 'POSTED'
              ? 'Recorded in Activity'
              : item.amountMode === 'VARIABLE'
                ? 'Enter the actual amount to confirm'
                : 'Fixed amount · Ready to confirm'}
          </AppText>
          {item.status === 'PENDING' && (
            <AppButton
              title="Review and confirm"
              variant="secondary"
              onPress={() => confirm(item)}
            />
          )}
        </Card>
      ))}
      <AppText tone="muted">
        Shows the latest 100 items for the selected status. Schedules use their original timezone.
        Pausing stops new reminders; existing reminders remain available.
      </AppText>
    </>
  );
}
function RuleCard({ rule, edit }: { rule: RecurringRule; edit: () => void }) {
  const money = useMoney();
  const pause = useFinanceMutation(
    `recurring/${rule.id}/${rule.paused ? 'resume' : 'pause'}`,
    recurringRuleSchema,
  );
  const remove = useFinanceMutation(`recurring/${rule.id}`, deletedSchema, 'DELETE');
  return (
    <Card>
      <AppText style={{ fontFamily: 'DMSansBold', fontSize: 22 }}>{rule.name}</AppText>
      <AppText>
        {rule.amountMinor ? money(rule.amountMinor) : 'Variable amount'} ·{' '}
        {rule.frequency.toLowerCase()}
      </AppText>
      <AppText tone="muted">
        {rule.paused ? 'Paused' : 'Active'} · From {rule.startDate}
        {rule.endDate ? ` until ${rule.endDate}` : ''}
      </AppText>
      <AppButton
        title="Edit recurring item"
        variant="secondary"
        disabled={pause.isPending || remove.isPending}
        onPress={edit}
      />
      <AppButton
        title={rule.paused ? 'Resume' : 'Pause'}
        variant="secondary"
        loading={pause.isPending}
        disabled={remove.isPending}
        onPress={() => pause.mutate({ version: rule.version })}
      />
      {(pause.error || remove.error) && <Feedback error={pause.error ?? remove.error} />}
      <AppButton
        title="Delete recurring item"
        variant="danger"
        loading={remove.isPending}
        disabled={pause.isPending}
        onPress={() =>
          confirmDelete('recurring item', () =>
            remove.mutate({ version: rule.version, confirmation: 'DELETE' }),
          )
        }
      />
      <AppText tone="muted">
        Items with generated history must be paused instead of deleted.
      </AppText>
    </Card>
  );
}
function RuleForm({
  rule,
  accounts,
  categories,
  done,
}: {
  rule?: RecurringRule;
  accounts: AccountWithBalance[];
  categories: Category[];
  done: () => void;
}) {
  const { user } = useApp();
  const currency = user?.preferences.baseCurrency ?? 'INR';
  const initial = {
    name: rule?.name ?? '',
    type: rule?.type ?? 'EXPENSE',
    accountId: rule?.accountId ?? '',
    categoryId: rule?.categoryId ?? '',
    amountMode: rule?.amountMode ?? 'FIXED',
    amount: rule?.amountMinor ? decimalAmount(rule.amountMinor, currency) : '',
    startDate:
      rule?.startDate ?? calendarDate(new Date(), user?.preferences.timezone ?? 'Asia/Kolkata'),
    endDate: rule?.endDate ?? '',
    frequency: rule?.frequency ?? 'MONTHLY',
  };
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const dirty = JSON.stringify(initial) !== JSON.stringify(form);
  useUnsavedChanges(dirty);
  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  const save = useFinanceMutation(
    rule ? `recurring/${rule.id}` : 'recurring',
    recurringRuleSchema,
    rule ? 'PATCH' : 'POST',
  );
  async function submit() {
    setError('');
    try {
      const body = {
        name: form.name,
        type: form.type,
        accountId: form.accountId,
        categoryId: form.categoryId,
        amountMode: form.amountMode,
        ...(form.amountMode === 'FIXED' ? { amountMinor: parseMoney(form.amount, currency) } : {}),
        postingPolicy: 'CONFIRM_EACH',
      };
      await save.mutateAsync(
        rule
          ? recurringRuleUpdateSchema.parse({ ...body, paused: rule.paused, version: rule.version })
          : recurringRuleInputSchema.parse({
              ...body,
              startDate: form.startDate,
              ...(form.endDate ? { endDate: form.endDate } : {}),
              frequency: form.frequency,
            }),
      );
      done();
    } catch (failure) {
      setError(failureMessage(failure));
    }
  }
  return (
    <Card>
      <AppText style={{ fontFamily: 'DMSansBold', fontSize: 22 }}>
        {rule ? 'Edit recurring item' : 'New recurring item'}
      </AppText>
      <Field
        label="Name"
        value={form.name}
        onChangeText={(value) => set('name', value)}
        maxLength={80}
      />
      <Choice
        label="Type"
        value={form.type}
        onChange={(type) => setForm((current) => ({ ...current, type, categoryId: '' }))}
        options={[
          { value: 'EXPENSE', label: 'Expense' },
          { value: 'INCOME', label: 'Income' },
        ]}
      />
      <Choice
        label="Account"
        value={form.accountId}
        onChange={(value) => set('accountId', value)}
        options={accounts
          .filter((item) => !item.archived)
          .map((item) => ({ value: item.id, label: item.name }))}
      />
      <Choice
        label="Category"
        value={form.categoryId}
        onChange={(value) => set('categoryId', value)}
        options={categories
          .filter((item) => !item.archived && item.type === form.type)
          .map((item) => ({ value: item.id, label: item.name }))}
      />
      {!accounts.some((item) => !item.archived) ||
      !categories.some((item) => !item.archived && item.type === form.type) ? (
        <AppText tone="muted">
          Create an active account and a matching category before saving.
        </AppText>
      ) : null}
      <Choice
        label="Amount"
        value={form.amountMode}
        onChange={(value) => set('amountMode', value)}
        options={[
          { value: 'FIXED', label: 'Fixed' },
          { value: 'VARIABLE', label: 'Variable' },
        ]}
      />
      {form.amountMode === 'FIXED' && (
        <Field
          label={`Fixed amount (${currency})`}
          value={form.amount}
          onChangeText={(value) => set('amount', value)}
          keyboardType="decimal-pad"
          maxLength={35}
        />
      )}
      {rule ? (
        <AppText tone="muted">
          {rule.frequency.toLowerCase()} from {rule.startDate}
          {rule.endDate ? ` until ${rule.endDate}` : ''} · {rule.timezone}. To change the schedule,
          pause this item and create a new one. Changes apply to future reminders.
        </AppText>
      ) : (
        <>
          <Field
            label="First due date (YYYY-MM-DD)"
            value={form.startDate}
            onChangeText={(value) => set('startDate', value)}
            maxLength={10}
          />
          <Field
            label="Last due date (optional, YYYY-MM-DD)"
            value={form.endDate}
            onChangeText={(value) => set('endDate', value)}
            maxLength={10}
          />
          <Choice
            label="Repeats"
            value={form.frequency}
            onChange={(value) => set('frequency', value)}
            options={[
              { value: 'DAILY', label: 'Daily' },
              { value: 'WEEKLY', label: 'Weekly' },
              { value: 'MONTHLY', label: 'Monthly' },
              { value: 'YEARLY', label: 'Yearly' },
            ]}
          />
        </>
      )}
      <AppText tone="muted">
        Each item requires confirmation before it affects your balance.
      </AppText>
      {error ? <Feedback error={new Error(error)} /> : null}
      <AppButton
        title="Save recurring item"
        loading={save.isPending}
        onPress={() => {
          void submit();
        }}
      />
      <AppButton
        title="Cancel"
        variant="secondary"
        disabled={save.isPending}
        onPress={() => confirmDiscard(dirty, done)}
      />
    </Card>
  );
}
function ConfirmOccurrence({
  occurrence,
  name,
  accountName,
  categoryName,
  done,
}: {
  occurrence: RecurringOccurrence;
  name: string;
  accountName?: string;
  categoryName?: string;
  done: () => void;
}) {
  const currency = occurrence.currency;
  const initialAmount = occurrence.amountMinor
    ? decimalAmount(occurrence.amountMinor, currency)
    : '';
  const [amount, setAmount] = useState(initialAmount);
  const [error, setError] = useState('');
  const dirty = amount !== initialAmount;
  useUnsavedChanges(dirty);
  const confirm = useFinanceMutation(
    `recurring-occurrences/${occurrence.id}/confirm`,
    z.object({ occurrence: recurringOccurrenceSchema, transaction: transactionSchema }),
  );
  async function submit() {
    setError('');
    try {
      await confirm.mutateAsync(
        occurrenceConfirmSchema.parse({
          version: occurrence.version,
          amountMinor: parseMoney(amount, currency),
          date: dateInstant(occurrence.dueDate, occurrence.timezone),
        }),
      );
      done();
    } catch (failure) {
      setError(failureMessage(failure));
    }
  }
  return (
    <Card>
      <AppText style={{ fontSize: 24, fontFamily: 'DMSansBold' }}>{name}</AppText>
      <AppText>
        Due {occurrence.dueDate} · {occurrence.type.toLowerCase()} · {occurrence.timezone}
      </AppText>
      <AppText tone="muted">
        {accountName ?? 'Account'} · {categoryName ?? 'Category'}
      </AppText>
      <Field
        label={`Amount to record (${currency})`}
        value={amount}
        onChangeText={setAmount}
        editable={occurrence.amountMode === 'VARIABLE'}
        keyboardType="decimal-pad"
        maxLength={35}
      />
      <AppText tone="muted">
        Confirming creates one transaction on the due date and updates your account balance. It will
        appear in Activity.
      </AppText>
      {error ? <Feedback error={new Error(error)} /> : null}
      <AppButton
        title="Confirm and record transaction"
        loading={confirm.isPending}
        onPress={() => {
          void submit();
        }}
      />
      <AppButton
        title="Cancel"
        variant="secondary"
        disabled={confirm.isPending}
        onPress={() => confirmDiscard(dirty, done)}
      />
    </Card>
  );
}
