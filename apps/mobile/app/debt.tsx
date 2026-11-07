import { Disclosure, ImpactNotice, ReviewSheet } from '../src/components/design';
import {
  debtSchema,
  debtDetailSchema,
  debtEventSchema,
  debtInputSchema,
  debtUpdateSchema,
  repaymentInputSchema,
  type DebtStatus,
  type Debt,
} from '@finora/contracts';
import { calendarDate, parseMoney } from '@finora/finance-core';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
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
import { debtKinds } from '../src/features/planning/debt-kinds';

export default function DebtScreen() {
  const params = useLocalSearchParams<{ id?: string; receivable?: string }>();
  const id = typeof params.id === 'string' ? params.id : undefined;
  const query = useRead(`debts/${id ?? ''}`, debtDetailSchema, !!id);
  if (!id) return <NewDebt receivable={params.receivable === 'true'} />;
  return (
    <Screen
      title={query.data?.name ?? 'Debt details'}
      subtitle="Every receipt and repayment, clearly recorded."
      includeTopInset={false}
      onRefresh={() => query.refetch()}
    >
      {query.isPending && <Loading variant="detail" />}
      {query.error && (
        <Feedback
          error={query.error}
          retry={() => {
            void query.refetch();
          }}
        />
      )}
      {query.data && <DebtDetail key={id} debt={query.data} />}
    </Screen>
  );
}
function NewDebt({ receivable }: { receivable: boolean }) {
  const { user } = useApp();
  const currency = user?.preferences.baseCurrency ?? 'INR';
  const today = calendarDate(new Date(), user?.preferences.timezone ?? 'Asia/Kolkata');
  const accounts = useRead('accounts', accountsSchema);
  const [form, setForm] = useState({
    direction: (receivable ? 'LENT' : 'BORROWED') as 'BORROWED' | 'LENT',
    kind: (receivable ? 'REFUND' : 'PERSONAL_LOAN') as Debt['kind'],
    name: '',
    amount: '',
    date: today,
    dueDate: '',
    note: '',
    accountId: '',
    movement: 'EXISTING',
  });
  const [error, setError] = useState('');
  const [reviewed, setReviewed] = useState<z.infer<typeof debtInputSchema>>();
  const initial = useRef(form).current;
  const allowLeave = useUnsavedChanges(JSON.stringify(initial) !== JSON.stringify(form));
  const save = useFinanceMutation('debts', debtSchema);
  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function review() {
    setError('');
    try {
      const body = debtInputSchema.parse({
        direction: form.direction,
        kind: form.kind,
        name: form.name,
        amountMinor: parseMoney(form.amount, currency),
        date: form.date,
        ...(form.dueDate ? { dueDate: form.dueDate } : {}),
        note: form.note,
        ...(form.movement === 'ACCOUNT' ? { accountId: form.accountId } : {}),
      });
      setReviewed(body);
    } catch (e) {
      setError(failureMessage(e));
    }
  }
  return (
    <Screen
      title={receivable ? 'Track money coming back' : 'Add debt'}
      subtitle={
        receivable
          ? 'Expected money stays separate from cash received.'
          : 'Start with what is outstanding today.'
      }
      includeTopInset={false}
      bottomAction={
        <AppButton
          title={receivable ? 'Review receivable' : 'Review debt'}
          loading={save.isPending}
          onPress={review}
        />
      }
    >
      {receivable ? (
        <SelectField
          label="Receipt type"
          value={form.kind}
          onChange={(kind) => setForm((f) => ({ ...f, kind, movement: 'EXISTING', accountId: '' }))}
          options={Object.entries(debtKinds).map(([value, label]) => ({
            value: value as Debt['kind'],
            label,
          }))}
        />
      ) : (
        <Choice
          label="Direction"
          value={form.direction}
          onChange={(v) => set('direction', v)}
          options={[
            { value: 'BORROWED', label: 'I borrowed' },
            { value: 'LENT', label: 'I lent' },
          ]}
        />
      )}
      {form.kind === 'PERSONAL_LOAN' && (
        <Choice
          label="What would you like to do?"
          presentation="list"
          value={form.movement}
          onChange={(v) => set('movement', v)}
          options={[
            {
              value: 'EXISTING',
              label: 'Existing debt',
              description: 'Track an outstanding amount without changing accounts.',
            },
            {
              value: 'ACCOUNT',
              label: 'Record money movement',
              description: 'Use only when this movement has not been recorded.',
            },
          ]}
        />
      )}
      <Field
        label={receivable ? 'Who should pay you?' : 'Person or lender'}
        placeholder="Who is this with?"
        value={form.name}
        onChangeText={(v) => set('name', v)}
        maxLength={80}
      />
      <Field
        label={`${receivable ? 'Expected amount' : 'Outstanding amount'} (${currency})`}
        value={form.amount}
        onChangeText={(v) => set('amount', v)}
        keyboardType="decimal-pad"
        maxLength={35}
      />
      <ImpactNotice
        title={
          form.movement === 'ACCOUNT'
            ? 'Review the account change before saving'
            : 'Account balances will not change'
        }
      >
        {form.kind !== 'PERSONAL_LOAN'
          ? 'Tracks an expectation. Income and original spending stay unchanged.'
          : form.movement === 'EXISTING'
            ? 'This records an amount you already owe or are owed.'
            : 'Income and spending stay unchanged.'}
      </ImpactNotice>
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
      <DateField
        label={receivable ? 'Claim date' : 'Start date'}
        value={form.date}
        onChange={(v) => set('date', v)}
      />
      <DateField
        label={receivable ? 'Expected by (optional)' : 'Due date (optional)'}
        value={form.dueDate}
        onChange={(v) => set('dueDate', v)}
        allowClear
      />
      <Disclosure title="Add a note">
        <Field
          label="Note (optional)"
          value={form.note}
          onChangeText={(v) => set('note', v)}
          multiline
          maxLength={1000}
        />
      </Disclosure>
      {(error || save.error) && <Feedback error={error ? new Error(error) : save.error} />}
      <ReviewSheet
        title={receivable ? 'Review expected receipt' : 'Review debt'}
        visible={!!reviewed}
        rows={
          reviewed
            ? [
                { label: receivable ? 'From' : 'Who', value: reviewed.name },
                { label: 'Amount', value: `${form.amount} ${currency}` },
                { label: 'Started', value: reviewed.date },
                ...(reviewed.dueDate ? [{ label: 'Due', value: reviewed.dueDate }] : []),
              ]
            : []
        }
        impact={
          reviewed?.accountId
            ? `${reviewed.direction === 'BORROWED' ? 'Adds to' : 'Subtracts from'} ${accounts.data?.find((a) => a.id === reviewed.accountId)?.name ?? 'the selected account'}. Income and spending stay unchanged.`
            : 'Tracks the outstanding amount only. Account balances, income and spending stay unchanged.'
        }
        onClose={() => setReviewed(undefined)}
        confirmLabel={receivable ? 'Track receivable' : 'Record debt'}
        busy={save.isPending}
        error={save.error?.message}
        onConfirm={() => {
          if (!reviewed) return;
          void save
            .mutateAsync(reviewed)
            .then(() => {
              allowLeave();
              router.back();
            })
            .catch(() => undefined);
        }}
      />
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
          {money(debt.repaidMinor)} {debt.direction === 'LENT' ? 'received' : 'repaid'} of{' '}
          {money(debt.amountMinor)}
        </AppText>
        <AppText tone={debt.status === 'OVERDUE' ? 'danger' : 'muted'}>
          {debt.cancelledAt
            ? 'Cancelled record'
            : debt.status === 'SETTLED'
              ? 'Fully settled'
              : debt.dueDate
                ? `Due ${debt.dueDate}`
                : 'No due date'}
          {debt.archived ? ' · Archived' : ''}
        </AppText>
        {debt.note ? <AppText>{debt.note}</AppText> : null}
        {debt.kind !== 'PERSONAL_LOAN' && (
          <AppText tone="muted">
            {debtKinds[debt.kind]} · Receipts change the selected account balance, with no automatic
            income or original-expense adjustment.
          </AppText>
        )}
      </Card>
      {!debt.archived && debt.status !== 'SETTLED' && (
        <AppButton
          title={debt.direction === 'BORROWED' ? 'Record repayment' : 'Record money received'}
          onPress={() => setRepaying(true)}
        />
      )}
      <Disclosure title="Manage record">
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
                title={
                  debt.kind !== 'PERSONAL_LOAN'
                    ? debt.archived
                      ? 'Restore receivable'
                      : 'Archive receivable'
                    : debt.archived
                      ? 'Restore debt'
                      : 'Archive debt'
                }
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
            title={
              debt.kind !== 'PERSONAL_LOAN'
                ? 'Cancel incorrect receivable'
                : 'Cancel incorrect debt'
            }
            variant="danger"
            loading={cancel.isPending}
            onPress={() =>
              Alert.alert(
                debt.kind !== 'PERSONAL_LOAN' ? 'Cancel this receivable?' : 'Cancel this debt?',
                'This reverses every associated account movement and receipt or repayment. History is preserved. Use this only to correct an incorrectly recorded obligation.',
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
      </Disclosure>
      {cancel.error && <Feedback error={cancel.error} />}
      {update.error && <Feedback error={update.error} />}
      <AppText accessibilityRole="header" style={{ fontSize: 21, fontFamily: 'DMSansBold' }}>
        History
      </AppText>
      {debt.events.map((e) => (
        <Card key={e.id}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <AppText style={{ flex: 1, fontFamily: 'DMSansBold' }}>
              {e.kind === 'PRINCIPAL'
                ? debt.kind !== 'PERSONAL_LOAN'
                  ? 'Expected amount recorded'
                  : 'Starting principal'
                : debt.direction === 'LENT'
                  ? 'Money received'
                  : 'Repayment'}
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
              title={debt.direction === 'LENT' ? 'Correct this receipt' : 'Correct this repayment'}
              variant="secondary"
              onPress={() => setReverseId(e.id)}
            />
          )}
        </Card>
      ))}
      <FlowSheet
        title={debt.direction === 'LENT' ? 'Reverse receipt' : 'Reverse repayment'}
        visible={!!reverseId}
        busy={reverse.isPending}
        onClose={() => {
          if (!reverse.isPending) setReverseId('');
        }}
        footer={
          <AppButton
            title={debt.direction === 'LENT' ? 'Reverse receipt' : 'Reverse repayment'}
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
function Repayment({ debt: currentDebt, close }: { debt: DebtStatus; close: () => void }) {
  const [debt] = useState(currentDebt);
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
  const [reviewed, setReviewed] = useState<z.infer<typeof repaymentInputSchema>>();
  const save = useFinanceMutation(`debts/${debt.id}/repayments`, debtEventSchema);
  const initialDate = useRef(date).current;
  const dirty = !!amount || !!note || !!accountId || movement !== 'NONE' || date !== initialDate;
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
        throw new Error(
          debt.direction === 'LENT'
            ? 'Receipt exceeds the remaining amount.'
            : 'Repayment exceeds the remaining balance.',
        );
      setReviewed(body);
    } catch (e) {
      setError(failureMessage(e));
    }
  }
  return (
    <FlowSheet
      title={debt.direction === 'LENT' ? 'Record money received' : 'Record repayment'}
      visible
      busy={save.isPending}
      onClose={() => {
        if (!save.isPending) confirmDiscard(dirty, close);
      }}
      footer={
        <AppButton
          title={
            reviewed
              ? debt.direction === 'LENT'
                ? 'Confirm receipt'
                : 'Confirm repayment'
              : debt.direction === 'LENT'
                ? 'Review receipt'
                : 'Review repayment'
          }
          loading={save.isPending}
          onPress={() => {
            if (reviewed)
              void save
                .mutateAsync(reviewed)
                .then(close)
                .catch(() => undefined);
            else submit();
          }}
        />
      }
    >
      {reviewed ? (
        <>
          <AppText style={{ fontSize: 32, lineHeight: 42, fontFamily: 'DMSansBold' }}>
            {money(reviewed.amountMinor)}
          </AppText>
          <AppText>
            {debt.name} · {reviewed.date}
          </AppText>
          <ImpactNotice title="What will change">
            {reviewed.accountId
              ? `${debt.direction === 'LENT' ? 'Adds to' : 'Subtracts from'} ${accounts.data?.find((a) => a.id === reviewed.accountId)?.name ?? 'the selected account'}. Income and original spending stay unchanged.`
              : 'Only the outstanding amount changes. Account balances stay unchanged.'}
          </ImpactNotice>
          <AppButton
            title="Edit details"
            variant="secondary"
            onPress={() => setReviewed(undefined)}
          />
        </>
      ) : (
        <>
          <AppText tone="muted">Remaining: {money(debt.remainingMinor)}</AppText>
          <Field
            label={`${debt.direction === 'LENT' ? 'Received amount' : 'Repayment'} (${debt.currency})`}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            maxLength={35}
          />
          <DateField
            label={debt.direction === 'LENT' ? 'Received on' : 'Repaid on'}
            value={date}
            onChange={setDate}
          />
          <Choice
            label="How should this be recorded?"
            presentation="list"
            value={movement}
            onChange={setMovement}
            options={[
              {
                value: 'NONE',
                label: 'Already recorded elsewhere',
                description: 'Only update the outstanding amount.',
              },
              {
                value: 'ACCOUNT',
                label: 'Record in an account',
                description: 'Update a selected account without changing income or spending.',
              },
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
              : 'Only the outstanding amount changes. Account balances stay unchanged.'}
          </AppText>
          <Field label="Note (optional)" value={note} onChangeText={setNote} maxLength={1000} />
        </>
      )}
      {(error || save.error || (movement === 'ACCOUNT' && accounts.error)) && (
        <Feedback error={error ? new Error(error) : (save.error ?? accounts.error)} />
      )}
    </FlowSheet>
  );
}
function EditDebt({ debt: currentDebt, close }: { debt: DebtStatus; close: () => void }) {
  const [debt] = useState(currentDebt);
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
      busy={save.isPending}
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
