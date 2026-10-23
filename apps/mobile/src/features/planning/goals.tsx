import { Disclosure } from '../../components/design';
import {
  contributionInputSchema,
  contributionSchema,
  goalInputSchema,
  goalProgressSchema,
  goalSchema,
  goalUpdateSchema,
  type Contribution,
  type Goal,
} from '@finora/contracts';
import { calendarDate, parseMoney } from '@finora/finance-core';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { z } from 'zod';
import { AppButton, AppText, Card, Feedback, Field, Loading } from '../../components/ui';
import { DateField, FlowSheet } from '../../components/flow';
import { PlanningProgress } from './progress';
import { chartRatio } from '../reports/values';
import { useFinanceMutation, useUnsavedChanges } from '../../hooks/finance';
import { useApp } from '../../providers/app-provider';
import { decimalAmount, useMoney, useRead } from '../finance/shared';
import { confirmDelete, confirmDiscard, deletedSchema, failureMessage } from './common';

const goalDetailSchema = goalProgressSchema.extend({ contributions: z.array(contributionSchema) });
export function Goals({ onEditing }: { onEditing: (editing: boolean) => void }) {
  const query = useRead('goals', z.array(goalProgressSchema));
  const [selected, setSelected] = useState<string | null>(null);
  function select(id: string | null) {
    setSelected(id);
    onEditing(id !== null);
  }
  if (selected === 'new') return <GoalForm done={() => select(null)} />;
  if (selected) return <GoalDetail id={selected} done={() => select(null)} />;
  return (
    <>
      <AppText tone="muted" style={{ fontSize: 14 }}>
        Track savings toward your next milestone.
      </AppText>
      <AppButton title="Create savings goal" onPress={() => select('new')} />
      {query.isPending && <Loading />}
      {query.isError && (
        <Feedback
          error={query.error}
          retry={() => {
            void query.refetch();
          }}
        />
      )}
      {query.data?.length === 0 && (
        <AppText tone="muted">Give your next milestone a name and a target.</AppText>
      )}
      {query.data?.map((goal) => (
        <Pressable
          key={goal.id}
          accessibilityRole="button"
          accessibilityLabel={`Open ${goal.name} goal`}
          accessibilityHint="View progress and record saved money"
          onPress={() => select(goal.id)}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Card>
            <GoalOverview goal={goal} showChevron />
          </Card>
        </Pressable>
      ))}
    </>
  );
}
function GoalForm({ goal, done }: { goal?: Goal; done: () => void }) {
  const { user } = useApp();
  const currency = user?.preferences.baseCurrency ?? 'INR';
  const initial = {
    name: goal?.name ?? '',
    amount: goal ? decimalAmount(goal.targetMinor, currency) : '',
    date: goal?.targetDate ?? '',
  };
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  useUnsavedChanges(dirty);
  const save = useFinanceMutation(
    goal ? `goals/${goal.id}` : 'goals',
    goalSchema,
    goal ? 'PATCH' : 'POST',
  );
  async function submit() {
    setError('');
    try {
      const body = {
        name: form.name,
        targetMinor: parseMoney(form.amount, currency),
        ...(form.date ? { targetDate: form.date } : {}),
      };
      await save.mutateAsync(
        goal
          ? goalUpdateSchema.parse({ ...body, archived: goal.archived, version: goal.version })
          : goalInputSchema.parse(body),
      );
      done();
    } catch (failure) {
      setError(failureMessage(failure));
    }
  }
  return (
    <FlowSheet
      title={goal ? 'Edit savings goal' : 'New savings goal'}
      visible
      onClose={() => {
        if (!save.isPending && !false) confirmDiscard(dirty, done);
      }}
      footer={
        <AppButton
          title="Save goal"
          loading={save.isPending}
          disabled={false}
          onPress={() => {
            void submit();
          }}
        />
      }
    >
      <Field
        label="Goal name"
        value={form.name}
        onChangeText={(name) => setForm((current) => ({ ...current, name }))}
        maxLength={80}
      />
      <Field
        label={`Target amount (${currency})`}
        value={form.amount}
        onChangeText={(amount) => setForm((current) => ({ ...current, amount }))}
        keyboardType="decimal-pad"
        maxLength={35}
      />
      <DateField
        label="Target date (optional)"
        value={form.date}
        onChange={(date) => setForm((current) => ({ ...current, date }))}
        allowClear
      />
      {error ? <Feedback error={new Error(error)} /> : null}
    </FlowSheet>
  );
}
function GoalDetail({ id, done }: { id: string; done: () => void }) {
  const query = useRead(`goals/${id}`, goalDetailSchema);
  const [editing, setEditing] = useState(false);
  const [contributing, setContributing] = useState(false);
  const [contributionDirty, setContributionDirty] = useState(false);
  const update = useFinanceMutation(`goals/${id}`, goalSchema, 'PATCH');
  const remove = useFinanceMutation(`goals/${id}`, deletedSchema, 'DELETE');
  if (query.isPending) return <Loading />;
  if (query.isError)
    return (
      <>
        <Feedback
          error={query.error}
          retry={() => {
            void query.refetch();
          }}
        />
        <AppButton title="Back to goals" variant="secondary" onPress={done} />
      </>
    );
  const goal = query.data;
  if (editing) return <GoalForm key={goal.version} goal={goal} done={() => setEditing(false)} />;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to goals"
        onPress={() => confirmDiscard(contributionDirty, done)}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <AppText tone="accent" style={{ fontSize: 14 }}>
          ‹ All goals
        </AppText>
      </Pressable>
      <Card>
        <GoalOverview goal={goal} />
        <Disclosure title="Manage goal">
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <View style={{ flex: 1 }}>
              <AppButton
                title="Edit goal"
                variant="secondary"
                disabled={update.isPending || remove.isPending}
                onPress={() => confirmDiscard(contributionDirty, () => setEditing(true))}
              />
            </View>
            <View style={{ flex: 1 }}>
              <AppButton
                title={goal.archived ? 'Restore goal' : 'Archive goal'}
                variant="secondary"
                loading={update.isPending}
                disabled={remove.isPending}
                onPress={() =>
                  confirmDiscard(contributionDirty, () =>
                    update.mutate({
                      name: goal.name,
                      targetMinor: goal.targetMinor,
                      ...(goal.targetDate ? { targetDate: goal.targetDate } : {}),
                      archived: !goal.archived,
                      version: goal.version,
                    }),
                  )
                }
              />
            </View>
          </View>
        </Disclosure>
        {(update.error || remove.error) && <Feedback error={update.error ?? remove.error} />}
      </Card>
      {!goal.archived && (
        <AppButton title="Record saved money" onPress={() => setContributing(true)} />
      )}
      {contributing && (
        <ContributionForm
          key={id}
          goal={goal}
          onDirty={setContributionDirty}
          close={() => setContributing(false)}
        />
      )}
      <AppText accessibilityRole="header" style={{ fontSize: 20, fontFamily: 'DMSansBold' }}>
        Recorded contributions
      </AppText>
      {!goal.contributions.length && <AppText tone="muted">No contributions yet.</AppText>}
      {goal.contributions.map((contribution) => (
        <ContributionRow key={contribution.id} contribution={contribution} version={goal.version} />
      ))}
      <AppButton
        title="Delete goal and contributions"
        variant="danger"
        loading={remove.isPending}
        disabled={update.isPending || contributionDirty}
        onPress={() =>
          confirmDelete('goal and all contributions', () => {
            void remove
              .mutateAsync({ version: goal.version, confirmation: 'DELETE' })
              .then(done)
              .catch(() => undefined);
          })
        }
      />
    </>
  );
}
function ContributionForm({
  goal,
  onDirty,
  close,
}: {
  close: () => void;
  goal: z.infer<typeof goalDetailSchema>;
  onDirty: (dirty: boolean) => void;
}) {
  const { user } = useApp();
  const currency = user?.preferences.baseCurrency ?? 'INR';
  const today = calendarDate(new Date(), user?.preferences.timezone ?? 'Asia/Kolkata');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dirty = !!amount || date !== today;
  useUnsavedChanges(dirty);
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  const add = useFinanceMutation(
    `goals/${goal.id}/contributions`,
    z.object({ contribution: contributionSchema, goalVersion: z.number().int().positive() }),
  );
  async function submit() {
    setError('');
    setNotice('');
    try {
      await add.mutateAsync(
        contributionInputSchema.parse({
          amountMinor: parseMoney(amount, currency),
          date,
          version: goal.version,
        }),
      );
      setAmount('');
      setDate(today);
      setNotice('Contribution recorded. Account balances are unchanged.');
    } catch (failure) {
      setError(failureMessage(failure));
    }
  }
  return (
    <FlowSheet
      title="Record saved money"
      visible
      onClose={() => {
        if (!add.isPending) confirmDiscard(dirty, close);
      }}
      footer={
        <AppButton
          title="Record contribution"
          loading={add.isPending}
          disabled={!amount.trim()}
          onPress={() => {
            void submit();
          }}
        />
      }
    >
      <AppText tone="muted" style={{ fontSize: 13, lineHeight: 20 }}>
        Tracks goal progress only. Your account balances stay unchanged.
      </AppText>
      <Field
        label={`Contribution (${currency})`}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        maxLength={35}
        placeholder="0.00"
      />
      <DateField label="Saved on" value={date} onChange={setDate} />
      {error ? <Feedback error={new Error(error)} /> : null}
      {notice ? (
        <AppText tone="accent" accessibilityRole="alert">
          {notice}
        </AppText>
      ) : null}
    </FlowSheet>
  );
}
function ContributionRow({
  contribution,
  version,
}: {
  contribution: Contribution;
  version: number;
}) {
  const money = useMoney();
  const dateLabel = useGoalDate();
  const remove = useFinanceMutation(
    `goals/${contribution.goalId}/contributions/${contribution.id}`,
    deletedSchema.extend({ goalVersion: z.number().int().positive() }),
    'DELETE',
  );
  return (
    <Card>
      <View
        style={{ flexDirection: 'row', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}
      >
        <AppText tone="accent" style={{ fontSize: 20, fontFamily: 'DMSansBold' }}>
          {money(contribution.amountMinor)}
        </AppText>
        <AppText tone="muted" style={{ fontSize: 13 }}>
          {dateLabel(contribution.date)}
        </AppText>
      </View>
      {remove.error && <Feedback error={remove.error} />}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Reverse contribution"
        accessibilityState={{ disabled: remove.isPending, busy: remove.isPending }}
        disabled={remove.isPending}
        style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}
        onPress={() =>
          confirmDelete('contribution', () => remove.mutate({ version, confirmation: 'DELETE' }))
        }
      >
        <AppText tone="danger" style={{ fontSize: 13 }}>
          {remove.isPending ? 'Reversing…' : 'Reverse contribution'}
        </AppText>
      </Pressable>
    </Card>
  );
}

function useGoalDate() {
  const { user } = useApp();
  return (day: string) =>
    new Intl.DateTimeFormat(user?.preferences.locale ?? 'en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${day}T12:00:00Z`));
}
function GoalOverview({
  goal,
  showChevron = false,
}: {
  goal: z.infer<typeof goalProgressSchema>;
  showChevron?: boolean;
}) {
  const money = useMoney();
  const dateLabel = useGoalDate();
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <AppText style={{ flex: 1, fontFamily: 'DMSansBold', fontSize: 21 }}>{goal.name}</AppText>
        {showChevron && (
          <AppText tone="muted" style={{ fontSize: 24 }}>
            ›
          </AppText>
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
        <AppText tone="accent" style={{ fontFamily: 'DMSansBold', fontSize: 26, lineHeight: 34 }}>
          {money(goal.savedMinor)}
        </AppText>
        <AppText tone="muted" style={{ fontSize: 13 }}>
          of {money(goal.targetMinor)}
        </AppText>
      </View>
      <PlanningProgress
        amount={goal.savedMinor}
        target={goal.targetMinor}
        label={`${goal.name} savings progress`}
      />
      <View
        style={{ flexDirection: 'row', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}
      >
        <AppText tone={goal.complete ? 'accent' : 'muted'} style={{ fontSize: 13 }}>
          {goal.archived ? 'Archived · ' : ''}
          {goal.complete ? 'Target reached' : `${money(goal.remainingMinor)} to go`}
        </AppText>
        <AppText tone="muted" style={{ fontSize: 13 }}>
          {Math.floor(chartRatio(goal.savedMinor, goal.targetMinor) * 100)}%
        </AppText>
      </View>
      {goal.targetDate && (
        <AppText tone="muted" style={{ fontSize: 12 }}>
          Target {dateLabel(goal.targetDate)}
        </AppText>
      )}
    </View>
  );
}
