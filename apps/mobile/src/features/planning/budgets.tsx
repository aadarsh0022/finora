import {
  budgetInputSchema,
  budgetSchema,
  budgetStatusSchema,
  budgetUpdateSchema,
  monthSchema,
  type Budget,
  type Category,
} from '@finora/contracts';
import { calendarDate, parseMoney } from '@finora/finance-core';
import { useState } from 'react';
import { z } from 'zod';
import { AppButton, AppText, Card, Choice, Feedback, Field, Loading } from '../../components/ui';
import { useFinanceMutation, useUnsavedChanges } from '../../hooks/finance';
import { useApp } from '../../providers/app-provider';
import { categoriesSchema, decimalAmount, useMoney, useRead } from '../finance/shared';
import { confirmDelete, confirmDiscard, deletedSchema, failureMessage } from './common';

export function Budgets({ onEditing }: { onEditing: (editing: boolean) => void }) {
  const { user } = useApp();
  const money = useMoney();
  const today = calendarDate(new Date(), user?.preferences.timezone ?? 'Asia/Kolkata').slice(0, 7);
  const [month, setMonth] = useState(today);
  const [activeMonth, setActiveMonth] = useState(today);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Budget | 'new' | null>(null);
  const query = useRead(
    `budgets?month=${encodeURIComponent(activeMonth)}`,
    z.array(budgetStatusSchema),
  );
  const categories = useRead('categories?includeArchived=true', categoriesSchema);
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
      <Card>
        <Field label="Budget month (YYYY-MM)" value={month} onChangeText={setMonth} maxLength={7} />
        <AppButton
          title="View month"
          variant="secondary"
          onPress={() => {
            const parsed = monthSchema.safeParse(month);
            if (parsed.success) {
              setActiveMonth(parsed.data);
              setError('');
            } else setError('Choose a month as YYYY-MM.');
          }}
        />
        {error ? <AppText tone="danger">{error}</AppText> : null}
      </Card>
      <AppButton
        title="Add monthly budget"
        disabled={!categories.data}
        onPress={() => edit('new')}
      />
      {query.isPending && <Loading />}
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
            {money(budget.spentMinor)} spent of {money(budget.amountMinor)}
          </AppText>
          <AppText
            tone={budget.overBudget ? 'danger' : budget.warningReached ? 'danger' : 'accent'}
          >
            {budget.overBudget
              ? `${money((-BigInt(budget.remainingMinor)).toString())} over budget`
              : `${money(budget.remainingMinor)} remaining`}
            {budget.warningReached && !budget.overBudget ? ' · Approaching your limit' : ''}
          </AppText>
          <AppText tone="muted">
            {budget.month} · Alerts at {budget.warningThresholdBasisPoints / 100}% · No rollover
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
        rollover: false,
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
  const busy = save.isPending || remove.isPending;
  return (
    <Card>
      <AppText style={{ fontSize: 22, fontFamily: 'DMSansBold' }}>
        {budget ? 'Edit budget' : 'New budget'}
      </AppText>
      <Choice
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
      <Field
        label="Month (YYYY-MM)"
        value={form.month}
        onChangeText={(value) => setForm((current) => ({ ...current, month: value }))}
        maxLength={7}
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
      {(error || remove.error) && <Feedback error={error ? new Error(error) : remove.error} />}
      <AppButton
        title="Save budget"
        loading={save.isPending}
        disabled={remove.isPending}
        onPress={() => {
          void submit();
        }}
      />
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
      <AppButton
        title="Cancel"
        variant="secondary"
        disabled={busy}
        onPress={() => confirmDiscard(dirty, done)}
      />
    </Card>
  );
}
