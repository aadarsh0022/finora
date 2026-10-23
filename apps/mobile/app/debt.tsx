import {
  debtSchema,
  debtDetailSchema,
  debtEventSchema,
  debtInputSchema,
  debtUpdateSchema,
  repaymentInputSchema,
  type DebtStatus,
} from '@finora/contracts';
import { calendarDate, parseMoney } from '@finora/finance-core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';
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
import { DateField, FlowSheet, SelectField } from '../src/components/flow';
import { accountsSchema, useRead, useMoney } from '../src/features/finance/shared';
import { useFinanceMutation, useUnsavedChanges } from '../src/hooks/finance';
import { useApp } from '../src/providers/app-provider';
import { failureMessage, confirmDiscard } from '../src/features/planning/common';

export default function DebtScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : undefined;
  const query = useRead(`debts/${id ?? ''}`, debtDetailSchema, !!id);
  if (!id) return <NewDebt />;
  return (
    <Screen
      title={query.data?.name ?? 'Debt details'}
      subtitle="Every repayment, clearly recorded."
      includeTopInset={false}
      onRefresh={() => query.refetch()}
    >
      {query.isPending && <Loading />}
      {query.error && (
        <Feedback
          error={query.error}
          retry={() => {
            void query.refetch();
          }}
        />
      )}
      {query.data && <DebtDetail debt={query.data} />}
    </Screen>
  );
}
function NewDebt() {
  const { user } = useApp();
  const currency = user?.preferences.baseCurrency ?? 'INR';
  const today = calendarDate(new Date(), user?.preferences.timezone ?? 'Asia/Kolkata');
  const accounts = useRead('accounts', accountsSchema);
  const [form, setForm] = useState({
    direction: 'BORROWED' as 'BORROWED' | 'LENT',
    name: '',
    amount: '',
    date: today,
    dueDate: '',
    note: '',
    accountId: '',
    movement: 'EXISTING',
  });
  const [error, setError] = useState('');
  const allowLeave = useUnsavedChanges(!!form.name || !!form.amount || !!form.note);
  const save = useFinanceMutation('debts', debtSchema);
  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function review() {
    setError('');
    try {
      const body = debtInputSchema.parse({
        direction: form.direction,
        name: form.name,
        amountMinor: parseMoney(form.amount, currency),
        date: form.date,
        ...(form.dueDate ? { dueDate: form.dueDate } : {}),
        note: form.note,
        ...(form.movement === 'ACCOUNT' ? { accountId: form.accountId } : {}),
      });
      Alert.alert(
        'Record this debt?',
        form.movement === 'ACCOUNT'
          ? `${form.direction === 'BORROWED' ? 'Add' : 'Subtract'} ${form.amount} ${currency} ${form.direction === 'BORROWED' ? 'to' : 'from'} the selected account. Income and spending totals stay unchanged.`
          : 'Track this existing outstanding amount without changing any account balance.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Record debt',
            onPress: () => {
              void save
                .mutateAsync(body)
                .then(() => {
                  allowLeave();
                  router.back();
                })
                .catch(() => undefined);
            },
          },
        ],
      );
    } catch (e) {
      setError(failureMessage(e));
    }
  }
  return (
    <Screen
      title="Add debt"
      subtitle="Start with what is outstanding today."
      includeTopInset={false}
      bottomAction={<AppButton title="Review debt" loading={save.isPending} onPress={review} />}
    >
      <Choice
        label="Direction"
        value={form.direction}
        onChange={(v) => set('direction', v)}
        options={[
          { value: 'BORROWED', label: 'I borrowed' },
          { value: 'LENT', label: 'I lent' },
        ]}
      />
      <Field
        label="Person or lender"
        placeholder="Who is this with?"
        value={form.name}
        onChangeText={(v) => set('name', v)}
        maxLength={80}
      />
      <Field
        label={`Outstanding amount (${currency})`}
        value={form.amount}
        onChangeText={(v) => set('amount', v)}
        keyboardType="decimal-pad"
        maxLength={35}
      />
      <Choice
        label="Account handling"
        value={form.movement}
        onChange={(v) => set('movement', v)}
        options={[
          { value: 'EXISTING', label: 'Existing debt' },
          { value: 'ACCOUNT', label: 'Record money movement' },
        ]}
      />
      <AppText tone="muted">
        {form.movement === 'EXISTING'
          ? 'Your accounts already reflect this money. Their balances will not change.'
          : 'Use this only if the money movement has not been recorded in Finora.'}
      </AppText>
      {form.movement === 'ACCOUNT' && (
        <SelectField
          label="Account"
          value={form.accountId}
          onChange={(v) => set('accountId', v)}
          options={(accounts.data ?? []).map((a) => ({ value: a.id, label: a.name }))}
        />
      )}
      {accounts.error && form.movement === 'ACCOUNT' && (
        <Feedback
          error={accounts.error}
          retry={() => {
            void accounts.refetch();
          }}
        />
      )}
      <DateField label="Start date" value={form.date} onChange={(v) => set('date', v)} />
      <DateField
        label="Due date (optional)"
        value={form.dueDate}
        onChange={(v) => set('dueDate', v)}
        allowClear
      />
      <Field
        label="Note (optional)"
        value={form.note}
        onChangeText={(v) => set('note', v)}
        multiline
        maxLength={1000}
      />
      {(error || save.error) && <Feedback error={error ? new Error(error) : save.error} />}
    </Screen>
  );
}
function DebtDetail({ debt }: { debt: z.infer<typeof debtDetailSchema> }) {
  const money = useMoney();
  const [repaying, setRepaying] = useState(false);
  const [editing, setEditing] = useState(false);
  const update = useFinanceMutation(`debts/${debt.id}`, debtSchema, 'PATCH');
  const cancel = useFinanceMutation(
    `debts/${debt.id}/cancel`,
    z.object({ id: z.uuid(), cancelled: z.literal(true) }),
  );
  const busy = update.isPending;
  const [reverseId, setReverseId] = useState('');
  const reverse = useFinanceMutation(
    `debts/${debt.id}/repayments/${reverseId}`,
    z.object({ id: z.uuid(), reversed: z.literal(true) }),
    'DELETE',
  );
  const reverseEvent = debt.events.find((e) => e.id === reverseId);
  return (
    <>
      <Card>
        <AppText tone="muted">{debt.direction === 'BORROWED' ? 'You owe' : 'Owed to you'}</AppText>
        <AppText style={{ fontSize: 36, lineHeight: 44, fontFamily: 'DMSansBold' }}>
          {money(debt.remainingMinor)}
        </AppText>
        <AppText tone="muted">
          {money(debt.repaidMinor)} repaid of {money(debt.amountMinor)}
        </AppText>
        <AppText tone={debt.status === 'OVERDUE' ? 'danger' : 'muted'}>
          {debt.status === 'SETTLED'
            ? 'Fully settled'
            : debt.dueDate
              ? `Due ${debt.dueDate}`
              : 'No due date'}
          {debt.archived ? ' · Archived' : ''}
        </AppText>
        {debt.note ? <AppText>{debt.note}</AppText> : null}
      </Card>
      {!debt.archived && debt.status !== 'SETTLED' && (
        <AppButton
          title={debt.direction === 'BORROWED' ? 'Record repayment' : 'Record money received'}
          onPress={() => setRepaying(true)}
        />
      )}
      {debt.cancelledAt ? (
        <AppText tone="muted">
          Cancelled. Original records and reversals are preserved below.
        </AppText>
      ) : (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <AppButton
              title="Edit details"
              variant="secondary"
              disabled={busy}
              onPress={() => setEditing(true)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <AppButton
              title={debt.archived ? 'Restore debt' : 'Archive debt'}
              variant="secondary"
              loading={busy}
              onPress={() => {
                void update
                  .mutateAsync(
                    debtUpdateSchema.parse({
                      name: debt.name,
                      note: debt.note,
                      dueDate: debt.dueDate,
                      archived: !debt.archived,
                      version: debt.version,
                    }),
                  )
                  .catch(() => undefined);
              }}
            />
          </View>
        </View>
      )}
      {!debt.cancelledAt && (
        <AppButton
          title="Cancel incorrect debt"
          variant="danger"
          loading={cancel.isPending}
          onPress={() =>
            Alert.alert(
              'Cancel this debt?',
              'This reverses every associated account movement and repayment. History is preserved. Use this only to correct an incorrectly recorded debt.',
              [
                { text: 'Keep debt', style: 'cancel' },
                {
                  text: 'Cancel debt',
                  style: 'destructive',
                  onPress: () => {
                    void cancel
                      .mutateAsync({ version: debt.version, confirmation: 'CANCEL' })
                      .catch(() => undefined);
                  },
                },
              ],
            )
          }
        />
      )}
      {cancel.error && <Feedback error={cancel.error} />}
      {update.error && <Feedback error={update.error} />}
      <AppText accessibilityRole="header" style={{ fontSize: 21, fontFamily: 'DMSansBold' }}>
        History
      </AppText>
      {debt.events.map((e) => (
        <Card key={e.id}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <AppText style={{ flex: 1, fontFamily: 'DMSansBold' }}>
              {e.kind === 'PRINCIPAL' ? 'Starting principal' : 'Repayment'}
              {e.reversedAt ? ' · Reversed' : ''}
            </AppText>
            <AppText>{money(e.amountMinor)}</AppText>
          </View>
          <AppText tone="muted" style={{ fontSize: 13 }}>
            {e.date} · {e.accountId ? 'Account movement recorded' : 'No account movement'}
          </AppText>
          {e.note ? <AppText tone="muted">{e.note}</AppText> : null}
          {e.kind === 'REPAYMENT' && !e.reversedAt && (
            <AppButton
              title="Correct this repayment"
              variant="secondary"
              onPress={() => setReverseId(e.id)}
            />
          )}
        </Card>
      ))}
      <FlowSheet
        title="Reverse repayment"
        visible={!!reverseId}
        onClose={() => {
          if (!reverse.isPending) setReverseId('');
        }}
        footer={
          <AppButton
            title="Reverse repayment"
            variant="danger"
            loading={reverse.isPending}
            onPress={() => {
              void reverse
                .mutateAsync({ version: debt.version, confirmation: 'DELETE' })
                .then(() => setReverseId(''))
                .catch(() => undefined);
            }}
          />
        }
      >
        <AppText>
          This keeps the original repayment in history, restores the outstanding amount and reverses
          its account effect.
        </AppText>
        {reverseEvent && (
          <AppText>
            {money(reverseEvent.amountMinor)} · {reverseEvent.date}
          </AppText>
        )}
        {reverse.error && <Feedback error={reverse.error} />}
      </FlowSheet>
      {repaying && <Repayment debt={debt} close={() => setRepaying(false)} />}
      {editing && <EditDebt debt={debt} close={() => setEditing(false)} />}
    </>
  );
}
function Repayment({ debt, close }: { debt: DebtStatus; close: () => void }) {
  const { user } = useApp();
  const money = useMoney();
  const accounts = useRead('accounts', accountsSchema);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(
    calendarDate(new Date(), user?.preferences.timezone ?? 'Asia/Kolkata'),
  );
  const [accountId, setAccountId] = useState('');
  const [movement, setMovement] = useState('NONE');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const save = useFinanceMutation(`debts/${debt.id}/repayments`, debtEventSchema);
  const dirty = !!amount || !!note || !!accountId;
  function submit() {
    setError('');
    try {
      const body = repaymentInputSchema.parse({
        amountMinor: parseMoney(amount, debt.currency),
        date,
        version: debt.version,
        note,
        ...(movement === 'ACCOUNT' ? { accountId } : {}),
      });
      if (BigInt(body.amountMinor) > BigInt(debt.remainingMinor))
        throw new Error('Repayment exceeds the remaining balance.');
      void save
        .mutateAsync(body)
        .then(close)
        .catch(() => undefined);
    } catch (e) {
      setError(failureMessage(e));
    }
  }
  return (
    <FlowSheet
      title="Record repayment"
      visible
      onClose={() => {
        if (!save.isPending) confirmDiscard(dirty, close);
      }}
      footer={<AppButton title="Confirm repayment" loading={save.isPending} onPress={submit} />}
    >
      <AppText tone="muted">Remaining: {money(debt.remainingMinor)}</AppText>
      <Field
        label={`Repayment (${debt.currency})`}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        maxLength={35}
      />
      <DateField label="Repaid on" value={date} onChange={setDate} />
      <Choice
        label="Account handling"
        value={movement}
        onChange={setMovement}
        options={[
          { value: 'NONE', label: 'Already recorded elsewhere' },
          { value: 'ACCOUNT', label: 'Record in an account' },
        ]}
      />
      {movement === 'ACCOUNT' && (
        <SelectField
          label="Account"
          value={accountId}
          onChange={setAccountId}
          options={(accounts.data ?? []).map((a) => ({ value: a.id, label: a.name }))}
        />
      )}
      <AppText tone="muted">
        {movement === 'ACCOUNT'
          ? `${debt.direction === 'BORROWED' ? 'Subtracts from' : 'Adds to'} the selected account. Income and spending stay unchanged.`
          : 'Only the debt balance changes. Account balances stay unchanged.'}
      </AppText>
      <Field label="Note (optional)" value={note} onChangeText={setNote} maxLength={1000} />
      {(error || save.error || (movement === 'ACCOUNT' && accounts.error)) && (
        <Feedback error={error ? new Error(error) : (save.error ?? accounts.error)} />
      )}
    </FlowSheet>
  );
}
function EditDebt({ debt, close }: { debt: DebtStatus; close: () => void }) {
  const [name, setName] = useState(debt.name);
  const [dueDate, setDueDate] = useState(debt.dueDate ?? '');
  const [note, setNote] = useState(debt.note);
  const [error, setError] = useState('');
  const save = useFinanceMutation(`debts/${debt.id}`, debtSchema, 'PATCH');
  const dirty = name !== debt.name || dueDate !== (debt.dueDate ?? '') || note !== debt.note;
  function submit() {
    try {
      const body = debtUpdateSchema.parse({
        name,
        note,
        dueDate: dueDate || undefined,
        archived: debt.archived,
        version: debt.version,
      });
      void save
        .mutateAsync(body)
        .then(close)
        .catch(() => undefined);
    } catch (e) {
      setError(failureMessage(e));
    }
  }
  return (
    <FlowSheet
      title="Edit debt"
      visible
      onClose={() => {
        if (!save.isPending) confirmDiscard(dirty, close);
      }}
      footer={
        <AppButton
          title="Save details"
          loading={save.isPending}
          disabled={!dirty}
          onPress={submit}
        />
      }
    >
      <Field label="Person or lender" value={name} onChangeText={setName} maxLength={80} />
      <DateField label="Due date (optional)" value={dueDate} onChange={setDueDate} allowClear />
      <Field
        label="Note (optional)"
        value={note}
        onChangeText={setNote}
        multiline
        maxLength={1000}
      />
      <AppText tone="muted">
        Principal and direction are fixed to preserve history. Cancel an incorrect debt from its
        details, then record the correct debt.
      </AppText>
      {(error || save.error) && <Feedback error={error ? new Error(error) : save.error} />}
    </FlowSheet>
  );
}
