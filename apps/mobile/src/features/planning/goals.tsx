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
import { z } from 'zod';
import { AppButton, AppText, Card, Feedback, Field, Loading } from '../../components/ui';
import { useFinanceMutation, useUnsavedChanges } from '../../hooks/finance';
import { useApp } from '../../providers/app-provider';
import { decimalAmount, useMoney, useRead } from '../finance/shared';
import { confirmDelete, confirmDiscard, deletedSchema, failureMessage } from './common';

const goalDetailSchema = goalProgressSchema.extend({ contributions: z.array(contributionSchema) });
export function Goals({ onEditing }: { onEditing: (editing: boolean) => void }) {
  const query = useRead('goals', z.array(goalProgressSchema));
  const [selected, setSelected] = useState<string | null>(null);
  const money = useMoney();
  function select(id: string | null) {
    setSelected(id);
    onEditing(id !== null);
  }
  if (selected === 'new') return <GoalForm done={() => select(null)} />;
  if (selected) return <GoalDetail id={selected} done={() => select(null)} />;
  return (
    <>
      <AppText tone="muted">
        Goals earmark savings you have already recorded. Contributions do not move money or change
        your account balances.
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
        <Card key={goal.id}>
          <AppText style={{ fontSize: 22, fontFamily: 'DMSansBold' }}>{goal.name}</AppText>
          <AppText>
            {money(goal.savedMinor)} saved of {money(goal.targetMinor)}
          </AppText>
          <AppText tone={goal.complete ? 'accent' : 'muted'}>
            {goal.archived ? 'Archived · ' : ''}
            {goal.complete ? 'Target reached' : `${money(goal.remainingMinor)} to go`}
            {goal.targetDate ? ` · Target ${goal.targetDate}` : ''}
          </AppText>
          <AppButton title="Manage goal" variant="secondary" onPress={() => select(goal.id)} />
        </Card>
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
    <Card>
      <AppText style={{ fontSize: 22, fontFamily: 'DMSansBold' }}>
        {goal ? 'Edit savings goal' : 'New savings goal'}
      </AppText>
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
      <Field
        label="Target date (YYYY-MM-DD, optional)"
        value={form.date}
        onChangeText={(date) => setForm((current) => ({ ...current, date }))}
        maxLength={10}
      />
      {error ? <Feedback error={new Error(error)} /> : null}
      <AppButton
        title="Save goal"
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
function GoalDetail({ id, done }: { id: string; done: () => void }) {
  const query = useRead(`goals/${id}`, goalDetailSchema);
  const [editing, setEditing] = useState(false);
  const [contributionDirty, setContributionDirty] = useState(false);
  const money = useMoney();
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
      <Card>
        <AppText style={{ fontSize: 26, fontFamily: 'DMSansBold' }}>{goal.name}</AppText>
        <AppText>
          {money(goal.savedMinor)} saved of {money(goal.targetMinor)}
        </AppText>
        <AppText tone="muted">
          {goal.complete ? 'Target reached' : `${money(goal.remainingMinor)} remaining`}
          {goal.archived ? ' · Archived' : ''}
        </AppText>
        <AppButton
          title="Edit goal"
          variant="secondary"
          disabled={update.isPending || remove.isPending}
          onPress={() => confirmDiscard(contributionDirty, () => setEditing(true))}
        />
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
        {(update.error || remove.error) && <Feedback error={update.error ?? remove.error} />}
      </Card>
      {!goal.archived && <ContributionForm key={id} goal={goal} onDirty={setContributionDirty} />}
      <AppText accessibilityRole="header" style={{ fontSize: 22, fontFamily: 'DMSansBold' }}>
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
      <AppButton
        title="Back to goals"
        variant="secondary"
        onPress={() => confirmDiscard(contributionDirty, done)}
      />
    </>
  );
}
function ContributionForm({
  goal,
  onDirty,
}: {
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
    <Card>
      <AppText style={{ fontFamily: 'DMSansBold' }}>Record money already saved</AppText>
      <AppText tone="muted">
        This tracks progress only. Record any account transfer separately in Activity.
      </AppText>
      <Field
        label={`Contribution (${currency})`}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        maxLength={35}
      />
      <Field label="Saved on (YYYY-MM-DD)" value={date} onChangeText={setDate} maxLength={10} />
      {error ? <Feedback error={new Error(error)} /> : null}
      {notice ? (
        <AppText tone="accent" accessibilityRole="alert">
          {notice}
        </AppText>
      ) : null}
      <AppButton
        title="Record contribution"
        loading={add.isPending}
        onPress={() => {
          void submit();
        }}
      />
    </Card>
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
  const remove = useFinanceMutation(
    `goals/${contribution.goalId}/contributions/${contribution.id}`,
    deletedSchema.extend({ goalVersion: z.number().int().positive() }),
    'DELETE',
  );
  return (
    <Card>
      <AppText>
        {money(contribution.amountMinor)} · {contribution.date}
      </AppText>
      {remove.error && <Feedback error={remove.error} />}
      <AppButton
        title="Reverse contribution"
        variant="danger"
        loading={remove.isPending}
        onPress={() =>
          confirmDelete('contribution', () => remove.mutate({ version, confirmation: 'DELETE' }))
        }
      />
    </Card>
  );
}
