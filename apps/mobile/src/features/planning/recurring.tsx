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
import { Pressable, View } from 'react-native';
import { z } from 'zod';
import { AppButton, AppText, Card, Choice, Feedback, Field, Loading } from '../../components/ui';
import { DateField, FlowSheet, SelectField } from '../../components/flow';
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
  const dateLabel = useScheduleDate();
  const rules = useRead('recurring', z.array(recurringRuleSchema));
  const [status, setStatus] = useState('PENDING');
  const [helpOpen, setHelpOpen] = useState(false);
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
      <AppText tone="muted" style={{ fontSize: 14 }}>
        Review each due item before it affects your balance.
      </AppText>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <AppButton
            title="New recurring item"
            disabled={!accounts.data || !categories.data}
            onPress={() => edit('new')}
          />
        </View>
        <View style={{ flex: 1 }}>
          <AppButton
            title="Check due items"
            variant="secondary"
            loading={generate.isPending}
            onPress={() => generate.mutate({})}
          />
        </View>
      </View>
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
      <Choice
        label="Due items"
        value={status}
        onChange={setStatus}
        options={[
          { value: 'PENDING', label: 'Upcoming' },
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
        <Card>
          <AppText style={{ fontFamily: 'DMSansBold' }}>
            {status === 'PENDING' ? 'No upcoming items' : 'No posted items'}
          </AppText>
          <AppText tone="muted" style={{ fontSize: 13, lineHeight: 20 }}>
            {status === 'PENDING'
              ? 'Check due items to load your scheduled reminders.'
              : 'Confirmed recurring transactions will appear here.'}
          </AppText>
        </Card>
      )}
      {occurrences.data?.map((item) => (
        <Card key={item.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            <AppText style={{ fontFamily: 'DMSansBold', flex: 1 }}>
              {rules.data?.find((rule) => rule.id === item.ruleId)?.name ?? 'Recurring transaction'}
            </AppText>
            {item.amountMinor && (
              <AppText
                tone={item.type === 'EXPENSE' ? 'danger' : 'accent'}
                style={{ fontFamily: 'DMSansBold', fontSize: 18, flexShrink: 1 }}
              >
                {money(item.amountMinor)}
              </AppText>
            )}
          </View>
          <AppText tone="muted" style={{ fontSize: 13 }}>
            Due {dateLabel(item.dueDate)} · {item.type === 'INCOME' ? 'Income' : 'Expense'}
          </AppText>
          <AppText tone="muted" style={{ fontSize: 13 }}>
            {item.status === 'POSTED'
              ? 'Recorded in Transactions'
              : item.amountMode === 'VARIABLE'
                ? 'Enter the actual amount to confirm'
                : 'Ready for your confirmation'}
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
      <AppText accessibilityRole="header" style={{ fontFamily: 'DMSansBold', fontSize: 20 }}>
        Your schedules
      </AppText>
      {rules.isPending && <Loading />}
      {rules.data?.length === 0 && (
        <Card>
          <AppText style={{ fontFamily: 'DMSansBold' }}>
            Make regular payments easier to track
          </AppText>
          <AppText tone="muted" style={{ fontSize: 13, lineHeight: 20 }}>
            Add income, rent or bills with New recurring item.
          </AppText>
        </Card>
      )}
      {rules.data?.map((rule) => (
        <RuleCard key={rule.id} rule={rule} edit={() => edit(rule)} />
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="How recurring works"
        onPress={() => setHelpOpen(true)}
        style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
      >
        <AppText tone="accent" style={{ fontSize: 14 }}>
          How recurring works ⓘ
        </AppText>
      </Pressable>
      <FlowSheet title="How recurring works" visible={helpOpen} onClose={() => setHelpOpen(false)}>
        <AppText>
          Checking due items creates reminders. Only confirming an item creates a real transaction
          and updates your balances.
        </AppText>
        <AppText tone="muted">
          Each list shows the latest 100 items for its selected status. Schedules use their original
          timezone.
        </AppText>
        <AppText tone="muted">
          Pausing stops new reminders; existing reminders remain available. Items with generated
          history must be paused instead of deleted.
        </AppText>
      </FlowSheet>
    </>
  );
}
function RuleCard({ rule, edit }: { rule: RecurringRule; edit: () => void }) {
  const money = useMoney();
  const dateLabel = useScheduleDate();
  const pause = useFinanceMutation(
    `recurring/${rule.id}/${rule.paused ? 'resume' : 'pause'}`,
    recurringRuleSchema,
  );
  const remove = useFinanceMutation(`recurring/${rule.id}`, deletedSchema, 'DELETE');
  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <AppText style={{ fontFamily: 'DMSansBold', fontSize: 20, flex: 1 }}>{rule.name}</AppText>
        <AppText tone={rule.paused ? 'muted' : 'accent'} style={{ fontSize: 12 }}>
          {rule.paused ? 'Paused' : 'Active'}
        </AppText>
      </View>
      <AppText
        tone={rule.type === 'EXPENSE' ? 'danger' : 'accent'}
        style={{ fontFamily: 'DMSansBold', fontSize: 20 }}
      >
        {rule.amountMinor ? money(rule.amountMinor) : 'Variable amount'} ·{' '}
        {rule.frequency.toLowerCase()}
      </AppText>
      <AppText tone="muted" style={{ fontSize: 13 }}>
        From {dateLabel(rule.startDate)}
        {rule.endDate ? ` until ${dateLabel(rule.endDate)}` : ''}
      </AppText>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <AppButton
            title="Edit item"
            variant="secondary"
            disabled={pause.isPending || remove.isPending}
            onPress={edit}
          />
        </View>
        <View style={{ flex: 1 }}>
          <AppButton
            title={rule.paused ? 'Resume' : 'Pause'}
            variant="secondary"
            loading={pause.isPending}
            disabled={remove.isPending}
            onPress={() => pause.mutate({ version: rule.version })}
          />
        </View>
      </View>
      {(pause.error || remove.error) && <Feedback error={pause.error ?? remove.error} />}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Delete recurring item"
        accessibilityState={{
          disabled: pause.isPending || remove.isPending,
          busy: remove.isPending,
        }}
        disabled={pause.isPending || remove.isPending}
        style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}
        onPress={() =>
          confirmDelete('recurring item', () =>
            remove.mutate({ version: rule.version, confirmation: 'DELETE' }),
          )
        }
      >
        <AppText tone="danger" style={{ fontSize: 13 }}>
          {remove.isPending ? 'Deleting…' : 'Delete item'}
        </AppText>
      </Pressable>
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
    <FlowSheet
      title={rule ? 'Edit recurring item' : 'New recurring item'}
      visible
      onClose={() => {
        if (!save.isPending && !false) confirmDiscard(dirty, done);
      }}
      footer={
        <AppButton
          title="Save recurring item"
          loading={save.isPending}
          disabled={false}
          onPress={() => {
            void submit();
          }}
        />
      }
    >
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
      <SelectField
        label="Account"
        value={form.accountId}
        onChange={(value) => set('accountId', value)}
        options={accounts
          .filter((item) => !item.archived)
          .map((item) => ({ value: item.id, label: item.name }))}
      />
      <SelectField
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
          <DateField
            label="First due date"
            value={form.startDate}
            onChange={(value) => set('startDate', value)}
          />
          <DateField
            label="Last due date (optional)"
            value={form.endDate}
            onChange={(value) => set('endDate', value)}
            allowClear
          />
          <SelectField
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
      <AppText tone="muted" style={{ fontSize: 13, lineHeight: 20 }}>
        Each item requires confirmation before it affects your balance.
      </AppText>
      {error ? <Feedback error={new Error(error)} /> : null}
    </FlowSheet>
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
    <FlowSheet
      title={'Review recurring payment'}
      visible
      onClose={() => {
        if (!confirm.isPending && !false) confirmDiscard(dirty, done);
      }}
      footer={
        <AppButton
          title="Confirm and record transaction"
          loading={confirm.isPending}
          disabled={false}
          onPress={() => {
            void submit();
          }}
        />
      }
    >
      <AppText style={{ fontSize: 22, fontFamily: 'DMSansBold' }}>{name}</AppText>
      <AppText>
        Due {occurrence.dueDate} · {occurrence.type.toLowerCase()}
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
        appear in Transactions.
      </AppText>
      {error ? <Feedback error={new Error(error)} /> : null}
    </FlowSheet>
  );
}

function useScheduleDate() {
  const { user } = useApp();
  return (day: string) =>
    new Intl.DateTimeFormat(user?.preferences.locale ?? 'en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${day}T12:00:00Z`));
}
