import { Disclosure } from '../../components/design';
import { PlanningProgress } from './progress';
import {
  budgetInputSchema,
  budgetSchema,
  budgetStatusSchema,
  budgetUpdateSchema,
  monthlyLimitSchema,
  monthlyLimitStatusSchema,
  type Budget,
  type Category,
} from '@finora/contracts';
import { calendarDate, parseMoney, previousMonth } from '@finora/finance-core';
import { useState } from 'react';
import { Alert } from 'react-native';
import { z } from 'zod';
import { AppButton, AppText, Card, Choice, Feedback, Field, Loading } from '../../components/ui';
import { MonthPicker, SelectField, FlowSheet } from '../../components/flow';
import { useFinanceMutation, useUnsavedChanges } from '../../hooks/finance';
import { useApp } from '../../providers/app-provider';
import { categoriesSchema, decimalAmount, useMoney, useRead } from '../finance/shared';
import { confirmDelete, confirmDiscard, deletedSchema, failureMessage } from './common';

export function Budgets({ onEditing }: { onEditing: (editing: boolean) => void }) {
  const { user } = useApp();
  const money = useMoney();
  const today = calendarDate(new Date(), user?.preferences.timezone ?? 'Asia/Kolkata').slice(0, 7);
  const [activeMonth, setActiveMonth] = useState(today);
  const [editing, setEditing] = useState<Budget | 'new' | null>(null);
  const query = useRead(
    `budgets?month=${encodeURIComponent(activeMonth)}`,
    z.array(budgetStatusSchema),
  );
  const categories = useRead('categories?includeArchived=true', categoriesSchema);
  const copy = useFinanceMutation(
    'budgets/copy',
    z.object({ created: z.number().int(), skipped: z.number().int(), totalCopied: z.boolean() }),
  );
  const [copyNotice, setCopyNotice] = useState('');
  function edit(budget: Budget | 'new' | null) {
    setEditing(budget);
    onEditing(budget !== null);
  }
  if (editing)
    return (
      <BudgetForm
        budget={editing === 'new' ? undefined : editing}
        month={activeMonth}
        categories={categories.data ?? []}
        done={() => edit(null)}
      />
    );
  return (
    <>
      <MonthPicker value={activeMonth} onChange={setActiveMonth} label="budget month" />
      <TotalBudget month={activeMonth} key={activeMonth} />
      <Disclosure title="More budget options">
        <AppButton
          title="Copy previous month"
          variant="secondary"
          loading={copy.isPending}
          onPress={() =>
            Alert.alert(
              'Copy previous month?',
              `Copy limits from ${previousMonth(activeMonth)} to ${activeMonth}. Existing budgets will be kept. Rollover starts disabled on copied categories.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Copy budgets',
                  onPress: () => {
                    void copy
                      .mutateAsync({
                        fromMonth: previousMonth(activeMonth),
                        toMonth: activeMonth,
                        copyRollover: false,
                      })
                      .then((r) =>
                        setCopyNotice(
                          `${r.created} category budgets copied to ${activeMonth}; ${r.skipped} skipped.${r.totalCopied ? ' Monthly limit copied.' : ''}`,
                        ),
                      )
                      .catch(() => undefined);
                  },
                },
              ],
            )
          }
        />
        {copyNotice ? <AppText tone="accent">{copyNotice}</AppText> : null}
        {copy.error && <Feedback error={copy.error} />}
      </Disclosure>
      <AppButton
        title="Add monthly budget"
        disabled={!categories.data}
        onPress={() => edit('new')}
      />
      {query.isPending && <Loading variant="budgets" />}
      {query.isError && (
        <Feedback
          error={query.error}
          retry={() => {
            void query.refetch();
          }}
        />
      )}
      {categories.isError && (
        <Feedback
          error={categories.error}
          retry={() => {
            void categories.refetch();
          }}
        />
      )}
      {query.data?.length === 0 && (
        <AppText tone="muted">
          No budgets for {activeMonth}. Set a spending limit for an expense category.
        </AppText>
      )}
      {query.data?.map((budget) => (
        <Card key={budget.id}>
          <AppText style={{ fontSize: 22, fontFamily: 'DMSansBold' }}>
            {categories.data?.find((item) => item.id === budget.categoryId)?.name ??
              'Expense category'}
          </AppText>
          <AppText>
            {money(budget.spentMinor)} spent of{' '}
            {money(budget.effectiveLimitMinor ?? budget.amountMinor)}
          </AppText>
          <PlanningProgress
            amount={budget.spentMinor}
            target={budget.effectiveLimitMinor ?? budget.amountMinor}
            label="Category budget used"
          />
          <AppText
            tone={budget.overBudget ? 'danger' : budget.warningReached ? 'danger' : 'accent'}
          >
            {budget.overBudget
              ? `${money((-BigInt(budget.remainingMinor)).toString())} over budget`
              : `${money(budget.remainingMinor)} remaining`}
            {budget.warningReached && !budget.overBudget ? ' · Approaching your limit' : ''}
          </AppText>
          <AppText tone="muted">
            {budget.month} · Alerts at {budget.warningThresholdBasisPoints / 100}% ·{' '}
            {budget.rollover
              ? `${money(budget.carriedMinor ?? '0')} carried forward`
              : 'No rollover'}
          </AppText>
          <AppButton title="Edit budget" variant="secondary" onPress={() => edit(budget)} />
        </Card>
      ))}
    </>
  );
}
function BudgetForm({
  budget,
  month,
  categories,
  done,
}: {
  budget?: Budget;
  month: string;
  categories: Category[];
  done: () => void;
}) {
  const { user } = useApp();
  const currency = user?.preferences.baseCurrency ?? 'INR';
  const initial = {
    categoryId: budget?.categoryId ?? '',
    month: budget?.month ?? month,
    amount: budget ? decimalAmount(budget.amountMinor, currency) : '',
    warning: String((budget?.warningThresholdBasisPoints ?? 8000) / 100),
    rollover: budget?.rollover ?? false,
  };
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  useUnsavedChanges(dirty);
  const save = useFinanceMutation(
    budget ? `budgets/${budget.id}` : 'budgets',
    budgetSchema,
    budget ? 'PATCH' : 'POST',
  );
  const remove = useFinanceMutation(`budgets/${budget?.id ?? ''}`, deletedSchema, 'DELETE');
  async function submit() {
    setError('');
    try {
      if (!/^\d{1,3}(\.\d{1,2})?$/.test(form.warning))
        throw new Error('Choose an alert threshold from 0.01 to 100 percent.');
      const body = {
        categoryId: form.categoryId,
        month: form.month,
        amountMinor: parseMoney(form.amount, currency),
        warningThresholdBasisPoints: Math.round(Number(form.warning) * 100),
        rollover: form.rollover,
      };
      await save.mutateAsync(
        budget
          ? budgetUpdateSchema.parse({ ...body, version: budget.version })
          : budgetInputSchema.parse(body),
      );
      done();
    } catch (failure) {
      setError(failureMessage(failure));
    }
  }
  return (
    <FlowSheet
      title={budget ? 'Edit budget' : 'New budget'}
      visible
      busy={save.isPending || remove.isPending}
      onClose={() => {
        if (!save.isPending && !remove.isPending) confirmDiscard(dirty, done);
      }}
      footer={
        <AppButton
          title="Save budget"
          loading={save.isPending}
          disabled={remove.isPending}
          onPress={() => {
            void submit();
          }}
        />
      }
    >
      <SelectField
        label="Expense category"
        value={form.categoryId}
        onChange={(categoryId) => setForm((current) => ({ ...current, categoryId }))}
        options={categories
          .filter(
            (item) => item.type === 'EXPENSE' && (!item.archived || budget?.categoryId === item.id),
          )
          .map((item) => ({ value: item.id, label: item.name }))}
      />
      {!categories.some((item) => item.type === 'EXPENSE' && !item.archived) && (
        <AppText tone="muted">
          Create an expense category in Settings before adding a budget.
        </AppText>
      )}
      <MonthPicker
        label="budget month"
        value={form.month}
        onChange={(value) => setForm((current) => ({ ...current, month: value }))}
      />
      <Field
        label={`Spending limit (${currency})`}
        value={form.amount}
        onChangeText={(amount) => setForm((current) => ({ ...current, amount }))}
        keyboardType="decimal-pad"
        maxLength={35}
      />
      <Field
        label="Alert threshold (%)"
        value={form.warning}
        onChangeText={(warning) => setForm((current) => ({ ...current, warning }))}
        keyboardType="decimal-pad"
        maxLength={6}
      />
      <Choice
        label="Unused budget"
        value={form.rollover ? 'carry' : 'reset'}
        onChange={(v) => setForm((f) => ({ ...f, rollover: v === 'carry' }))}
        options={[
          { value: 'reset', label: 'Reset each month' },
          { value: 'carry', label: 'Carry from previous month' },
        ]}
      />
      <AppText tone="muted">
        Carry adds only unused money from the immediately previous category budget. Overspending is
        not carried forward. It recalculates if historical spending changes.
      </AppText>
      {(error || remove.error) && <Feedback error={error ? new Error(error) : remove.error} />}

      {budget && (
        <AppButton
          title="Delete budget"
          variant="danger"
          loading={remove.isPending}
          disabled={dirty || save.isPending}
          onPress={() =>
            confirmDelete('budget', () => {
              void remove
                .mutateAsync({ version: budget.version, confirmation: 'DELETE' })
                .then(done)
                .catch(() => undefined);
            })
          }
        />
      )}
    </FlowSheet>
  );
}

function TotalBudget({ month }: { month: string }) {
  const { user } = useApp();
  const currency = user?.preferences.baseCurrency ?? 'INR';
  const money = useMoney();
  const query = useRead(`budgets/total?month=${month}`, monthlyLimitStatusSchema);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [draftPlan, setDraftPlan] = useState<z.infer<typeof monthlyLimitSchema> | null>(null);
  const [error, setError] = useState('');
  const save = useFinanceMutation('budgets/total', monthlyLimitSchema);
  const remove = useFinanceMutation('budgets/total', deletedSchema, 'DELETE');
  async function submit() {
    setError('');
    try {
      const value = parseMoney(amount, currency);
      if (BigInt(value) <= 0n) throw new Error('Enter a positive monthly limit.');
      await save.mutateAsync({
        month,
        amountMinor: value,
        ...(draftPlan ? { version: draftPlan.version } : {}),
      });
      setOpen(false);
    } catch (e) {
      setError(failureMessage(e));
    }
  }
  const data = query.data;
  return (
    <Card>
      <AppText style={{ fontFamily: 'DMSansBold', fontSize: 19 }}>Monthly spending limit</AppText>
      {data && (
        <>
          <AppText>
            {money(data.spentMinor)} spent{data.plan ? ` of ${money(data.plan.amountMinor)}` : ''}
          </AppText>
          {data.remainingMinor !== null && (
            <AppText tone={BigInt(data.remainingMinor) < 0n ? 'danger' : 'accent'}>
              {BigInt(data.remainingMinor) < 0n
                ? `${money((-BigInt(data.remainingMinor)).toString())} over limit`
                : `${money(data.remainingMinor)} remaining`}
            </AppText>
          )}
        </>
      )}
      {query.error && (
        <Feedback
          error={query.error}
          retry={() => {
            void query.refetch();
          }}
        />
      )}
      <AppButton
        title={data?.plan ? 'Edit monthly limit' : 'Set monthly limit'}
        variant="secondary"
        disabled={query.isPending || query.isError}
        onPress={() => {
          setAmount(data?.plan ? decimalAmount(data.plan.amountMinor, currency) : '');
          setDraftPlan(data?.plan ?? null);
          setError('');
          setOpen(true);
        }}
      />
      <AppText tone="muted" style={{ fontSize: 12 }}>
        Covers all expenses, including categories without a budget. Borrowing, lending and transfers
        are excluded.
      </AppText>
      <FlowSheet
        title="Monthly spending limit"
        visible={open}
        busy={save.isPending || remove.isPending}
        onClose={() => {
          if (!save.isPending && !remove.isPending)
            confirmDiscard(
              amount !== (draftPlan ? decimalAmount(draftPlan.amountMinor, currency) : ''),
              () => setOpen(false),
            );
        }}
        footer={
          <AppButton
            title="Save monthly limit"
            loading={save.isPending}
            onPress={() => {
              void submit();
            }}
          />
        }
      >
        <Field
          label={`Monthly limit (${currency})`}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          maxLength={35}
        />
        <AppText tone="muted">
          The overall limit is independent of category limits and resets each month.
        </AppText>
        {draftPlan && (
          <AppButton
            title="Remove monthly limit"
            variant="danger"
            loading={remove.isPending}
            onPress={() => {
              void remove
                .mutateAsync({ month, version: draftPlan.version, confirmation: 'DELETE' })
                .then(() => setOpen(false))
                .catch(() => undefined);
            }}
          />
        )}
        {(error || remove.error) && <Feedback error={error ? new Error(error) : remove.error} />}
      </FlowSheet>
    </Card>
  );
}
