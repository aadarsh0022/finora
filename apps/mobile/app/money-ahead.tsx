import {
  outlookPreferencesSchema,
  outlookSchema,
  expectedPaymentSchema,
  type Outlook,
  type OutlookPreferences,
} from '@finora/contracts';
import { calendarDate, nextOccurrence, parseMoney } from '@finora/finance-core';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
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
import { DateField, FlowSheet } from '../src/components/flow';
import { SavedDataNotice, decimalAmount, useMoney, useRead } from '../src/features/finance/shared';
import { useLocalRecords, usePendingTransactions } from '../src/storage/hooks';
import { useApp } from '../src/providers/app-provider';
import { outlookValues } from '../src/features/planning/outlook-values';
import { failureMessage, confirmDiscard } from '../src/features/planning/common';
import { useTheme } from '../src/theme';

const preferencesKey = 'outlook:preferences';
export default function MoneyAhead() {
  const { vault, user } = useApp();
  const query = useRead('planning/outlook', outlookSchema);
  const preferences = useLocalRecords(preferencesKey, outlookPreferencesSchema);
  return (
    <Screen
      title="Money Ahead"
      subtitle="See what is committed before you decide what comes next."
      includeTopInset={false}
      onRefresh={() => query.refetch()}
    >
      <SavedDataNotice at={query.cachedAt} />
      {(query.isPending || (!!vault && preferences.isPending)) && <Loading variant="dashboard" />}
      {query.error || preferences.error ? (
        <Feedback
          error={query.error ?? preferences.error}
          retry={() => {
            void query.refetch();
            void preferences.refetch();
          }}
        />
      ) : null}
      {query.data && (!vault || preferences.data) && (
        <AheadPlan key={user?.id} data={query.data} saved={preferences.data?.[0]?.value} />
      )}
    </Screen>
  );
}
function AheadPlan({ data, saved }: { data: Outlook; saved?: OutlookPreferences }) {
  const { vault, user } = useApp();
  const money = useMoney();
  const theme = useTheme();
  const client = useQueryClient();
  const pending = usePendingTransactions();
  const [preferences, setPreferences] = useState<OutlookPreferences>(() => ({
    ...(saved ?? { reserveMinor: '0', expectedPayments: [] }),
    through:
      saved && saved.through >= data.today && saved.through <= data.through
        ? saved.through
        : nextOccurrence(data.today, 'DAILY', 30),
  }));
  const [scenario, setScenario] = useState<'conservative' | 'expected'>('conservative');
  const [open, setOpen] = useState<'plan' | 'income' | 'purchase' | ''>('');
  const [draft, setDraft] = useState({
    through: preferences.through,
    reserve: decimalAmount(preferences.reserveMinor, data.currency),
    ids: preferences.accountIds ?? data.accounts.map((a) => a.id),
  });
  const [income, setIncome] = useState({ label: '', amount: '', day: preferences.through });
  const [purchaseDraft, setPurchaseDraft] = useState({ day: data.today, amount: '' });
  const [purchase, setPurchase] = useState<{ day: string; amountMinor: string }>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [shown, setShown] = useState(12);
  // A fresh API snapshot may move beyond a previously selected horizon while this
  // screen remains mounted. Keep the calculation within the snapshot's date range.
  const current = {
    ...preferences,
    through:
      preferences.through < data.today
        ? nextOccurrence(data.today, 'DAILY', 30)
        : preferences.through,
  };
  const result = outlookValues(data, current, scenario === 'expected');
  const preview =
    purchase && purchase.day >= data.today && purchase.day <= current.through
      ? outlookValues(data, current, scenario === 'expected', purchase)
      : undefined;
  const hasPending = !!vault && (pending.isPending || !!pending.error || !!pending.data?.length);
  const staleDay = data.today !== calendarDate(new Date(), data.timezone);
  const blocked = result.incomplete || hasPending || staleDay;
  const checked = preferences.confirmedSignature === result.signature && preferences.confirmedAt;
  async function save(next: OutlookPreferences) {
    const parsed = outlookPreferencesSchema.parse(next);
    if (vault) {
      await vault.write(preferencesKey, parsed);
      await client.invalidateQueries({ queryKey: [user?.id, 'local', preferencesKey] });
    }
    setPreferences(parsed);
    setNotice(
      vault
        ? 'Plan saved on this device.'
        : 'Plan updated for this visit. Encrypted storage is needed to remember it.',
    );
  }
  function launch(mode: typeof open) {
    setError('');
    setNotice('');
    setOpen(mode);
  }
  async function apply() {
    setError('');
    setBusy(true);
    try {
      if (open === 'plan') {
        if (draft.through < data.today || draft.through > data.through)
          throw new Error('Choose a date within the next 90 days.');
        if (!draft.ids.length) throw new Error('Choose at least one account.');
        await save({
          ...preferences,
          through: draft.through,
          reserveMinor: parseMoney(draft.reserve, data.currency),
          accountIds: draft.ids,
        });
        setPurchase(undefined);
      } else if (open === 'income') {
        if (income.day < data.today || income.day > current.through)
          throw new Error('Choose an expected date within this plan.');
        const payment = expectedPaymentSchema.parse({
          id: Crypto.randomUUID(),
          label: income.label,
          day: income.day,
          amountMinor: parseMoney(income.amount, data.currency),
        });
        await save({ ...current, expectedPayments: [...current.expectedPayments, payment] });
        setIncome({ label: '', amount: '', day: current.through });
      } else {
        const entry = {
          day: purchaseDraft.day,
          amountMinor: parseMoney(purchaseDraft.amount, data.currency),
        };
        outlookValues(data, current, scenario === 'expected', entry);
        setPurchase(entry);
      }
      setOpen('');
    } catch (failure) {
      setError(failureMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  function close() {
    const dirty =
      open === 'plan'
        ? JSON.stringify(draft) !==
          JSON.stringify({
            through: current.through,
            reserve: decimalAmount(current.reserveMinor, data.currency),
            ids: result.accounts.map((a) => a.id),
          })
        : open === 'income'
          ? !!(income.label || income.amount)
          : !!purchaseDraft.amount;
    if (!busy)
      confirmDiscard(dirty, () => {
        setOpen('');
        setError('');
      });
  }
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <AppText tone="muted" style={{ flex: 1 }}>
          Through {current.through}
        </AppText>
        <AppButton
          title="Plan settings"
          variant="secondary"
          onPress={() => {
            setDraft({
              through: current.through,
              reserve: decimalAmount(current.reserveMinor, data.currency),
              ids: result.accounts.map((a) => a.id),
            });
            launch('plan');
          }}
        />
      </View>
      <Choice
        label="Scenario"
        value={scenario}
        onChange={setScenario}
        options={[
          { value: 'conservative', label: 'Recorded money only' },
          { value: 'expected', label: 'With expected income' },
        ]}
      />
      <Card>
        <AppText tone="muted">
          {blocked
            ? 'Your estimate needs a few checks'
            : scenario === 'expected'
              ? 'Estimated room with expected income'
              : 'Estimated room before your next commitments'}
        </AppText>
        {staleDay && (
          <AppText tone="danger">
            This snapshot is from {data.today}. Reconnect and refresh before using an estimate for
            today.
          </AppText>
        )}
        {!blocked && (
          <AppText
            accessibilityLabel="Estimated available money"
            tone={BigInt(result.availableMinor!) < 0n ? 'danger' : 'text'}
            style={{ fontSize: 32, lineHeight: 42, fontFamily: 'DMSansBold' }}
          >
            {money(result.availableMinor!)}
          </AppText>
        )}
        {hasPending && (
          <>
            <AppText tone="danger">
              Sync pending entries first so the same save is not counted twice.
            </AppText>
            <AppButton
              title="Open sync status"
              variant="secondary"
              onPress={() => router.push('/sync')}
            />
          </>
        )}
        {!result.accounts.length && (
          <AppText tone="danger">Choose accounts in Plan settings.</AppText>
        )}
        {data.undatedDebts > 0 && (
          <AppText tone="danger">
            {data.undatedDebts} outstanding borrowed{' '}
            {data.undatedDebts === 1 ? 'debt has' : 'debts have'} no due date. Add dates before
            relying on this estimate.
          </AppText>
        )}
        {result.unknownOutflows > 0 && (
          <AppText tone="danger">
            {result.unknownOutflows} bill or schedule{' '}
            {result.unknownOutflows === 1 ? 'needs' : 'need'} an amount or review.
          </AppText>
        )}
        <AppText tone="muted">
          Lowest projected amount on {result.lowestDay}, after your reserve. A negative amount means
          a projected shortfall.
        </AppText>
        {scenario === 'expected' && (
          <AppText tone="danger">
            Expected income and repayments may arrive late or never arrive. This is a scenario, not
            money received.
          </AppText>
        )}
      </Card>
      <Card>
        <AppText style={{ fontFamily: 'DMSansBold', fontSize: 19 }}>
          Every deduction, explained
        </AppText>
        <Line
          label={`Selected recorded balances as of ${data.today}`}
          value={money(result.balanceMinor)}
        />
        <Line
          label="Keep aside, including any savings reserves"
          value={money(current.reserveMinor)}
        />
        <Line label="Known commitments through your date" value={money(result.knownOutflowMinor)} />
        {scenario === 'expected' && (
          <Line
            label="Expected incoming money in this scenario"
            value={money(result.expectedInflowMinor)}
          />
        )}
        <AppText tone="muted" style={{ fontSize: 13 }}>
          The headline is the lowest amount across the period, not just the closing balance. Goals
          are not deducted again. Remaining borrowed principal is assumed due in full on its due
          date.
        </AppText>
        <AppText tone="muted" style={{ fontSize: 13 }}>
          {checked
            ? `Balances last checked ${new Date(preferences.confirmedAt!).toLocaleString(user?.preferences.locale, { timeZone: data.timezone })}.`
            : 'These are your recorded balances. Check them against your accounts; Finora has no bank connection.'}
        </AppText>
        <AppButton
          title="I checked these balances"
          variant="secondary"
          disabled={busy || !result.accounts.length}
          onPress={() => {
            setBusy(true);
            void save({
              ...current,
              confirmedSignature: result.signature,
              confirmedAt: new Date().toISOString(),
            })
              .catch((f: unknown) => setError(failureMessage(f)))
              .finally(() => setBusy(false));
          }}
        />
      </Card>
      <AppButton
        title="Preview a purchase"
        disabled={blocked}
        onPress={() => {
          setPurchaseDraft({ day: data.today, amount: '' });
          launch('purchase');
        }}
      />
      {preview && (
        <Card>
          <AppText style={{ fontFamily: 'DMSansBold' }}>
            Purchase preview · {money(purchase!.amountMinor)} on {purchase!.day}
          </AppText>
          <AppText tone={BigInt(preview.lowestMinor) < 0n ? 'danger' : 'accent'}>
            Lowest projected amount: {money(preview.lowestMinor)} on {preview.lowestDay}
          </AppText>
          <AppText tone="muted">Nothing has been saved to your transactions.</AppText>
          <AppButton
            title="Remove preview"
            variant="secondary"
            onPress={() => setPurchase(undefined)}
          />
        </Card>
      )}
      <Card>
        <AppText style={{ fontFamily: 'DMSansBold', fontSize: 19 }}>Income that varies</AppText>
        <AppText tone="muted">
          Add freelance or other expected payments. They appear only in the expected-income
          scenario; scheduled income and dated money owed to you are already included there.
        </AppText>
        {current.expectedPayments.map((payment) => (
          <View key={payment.id} style={{ gap: 6 }}>
            <AppText>
              {payment.label} · {money(payment.amountMinor)} · {payment.day}
            </AppText>
            {(payment.day < data.today || payment.day > current.through) && (
              <AppText tone="muted">Outside this plan; excluded.</AppText>
            )}
            <AppButton
              title={`Remove ${payment.label}`}
              variant="secondary"
              disabled={busy}
              onPress={() => {
                setBusy(true);
                void save({
                  ...current,
                  expectedPayments: current.expectedPayments.filter((p) => p.id !== payment.id),
                })
                  .catch((f: unknown) => setError(failureMessage(f)))
                  .finally(() => setBusy(false));
              }}
            />
          </View>
        ))}
        <AppButton
          title="Add expected payment"
          variant="secondary"
          disabled={current.expectedPayments.length >= 10}
          onPress={() => {
            setIncome({ label: '', amount: '', day: current.through });
            launch('income');
          }}
        />
      </Card>
      <AppText accessibilityRole="header" style={{ fontFamily: 'DMSansBold', fontSize: 20 }}>
        Upcoming and overdue
      </AppText>
      {!result.flows.length && (
        <AppText tone="muted">
          No scheduled items in this snapshot. Unrecorded bills and everyday spending are not
          predicted.
        </AppText>
      )}
      {result.flows.slice(0, shown).map((flow) => (
        <Card key={flow.id}>
          <Line
            label={flow.label}
            value={flow.amountMinor ? money(flow.amountMinor) : 'Amount needed'}
          />
          <AppText tone={flow.overdue ? 'danger' : 'muted'} style={{ fontSize: 13 }}>
            {flow.day} · {flow.overdue ? 'Overdue, treated as due now · ' : ''}
            {flow.direction === 'OUT' ? 'Commitment' : 'Expected receipt'}
          </AppText>
        </Card>
      ))}
      {shown < result.flows.length && (
        <AppButton
          title={`Show more (${result.flows.length - shown} remaining)`}
          variant="secondary"
          onPress={() => setShown(shown + 20)}
        />
      )}
      <AppButton
        title="Start weekly review"
        variant="secondary"
        onPress={() => router.push('/weekly-review')}
      />
      <AppText tone="muted" style={{ fontSize: 13 }}>
        This estimate uses manually recorded data and known schedules. Everyday spending, missing
        entries and changing bills can reduce what is available. Update balances and review
        assumptions regularly.
      </AppText>
      {notice ? (
        <AppText accessibilityRole="alert" tone="accent">
          {notice}
        </AppText>
      ) : null}
      {error && !open ? <Feedback error={new Error(error)} /> : null}
      <FlowSheet
        title={
          open === 'plan'
            ? 'Plan settings'
            : open === 'income'
              ? 'Expected payment'
              : 'Purchase preview'
        }
        visible={!!open}
        onClose={close}
        footer={
          <AppButton
            title={
              open === 'purchase'
                ? 'Calculate preview'
                : open === 'income'
                  ? 'Add to scenario'
                  : 'Update plan'
            }
            loading={busy}
            onPress={() => {
              void apply();
            }}
          />
        }
      >
        {open === 'plan' ? (
          <>
            <DateField
              label="Plan through"
              value={draft.through}
              onChange={(through) => setDraft({ ...draft, through })}
            />
            <Field
              label={`Keep aside (${data.currency})`}
              value={draft.reserve}
              keyboardType="decimal-pad"
              onChangeText={(reserve) => setDraft({ ...draft, reserve })}
              maxLength={35}
            />
            <AppText tone="muted">
              Enter one total for money you want protected, including goals and emergency savings.
              It is deducted once.
            </AppText>
            <AppText style={{ fontFamily: 'DMSansBold' }}>Accounts included</AppText>
            {data.accounts.map((account) => (
              <Pressable
                key={account.id}
                accessibilityRole="checkbox"
                accessibilityLabel={account.name}
                accessibilityState={{ checked: draft.ids.includes(account.id) }}
                onPress={() =>
                  setDraft({
                    ...draft,
                    ids: draft.ids.includes(account.id)
                      ? draft.ids.filter((id) => id !== account.id)
                      : [...draft.ids, account.id],
                  })
                }
                style={{
                  minHeight: 52,
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: draft.ids.includes(account.id)
                    ? theme.accentSoft
                    : theme.background,
                }}
              >
                <Line
                  label={`${draft.ids.includes(account.id) ? '✓ ' : ''}${account.name}`}
                  value={money(account.balanceMinor)}
                />
              </Pressable>
            ))}
          </>
        ) : open === 'income' ? (
          <>
            <Field
              label="Payment label"
              value={income.label}
              onChangeText={(label) => setIncome({ ...income, label })}
              maxLength={80}
            />
            <Field
              label={`Expected amount (${data.currency})`}
              value={income.amount}
              onChangeText={(amount) => setIncome({ ...income, amount })}
              keyboardType="decimal-pad"
              maxLength={35}
            />
            <DateField
              label="Expected on"
              value={income.day}
              onChange={(day) => setIncome({ ...income, day })}
            />
            <AppText tone="muted">
              Add only payments not already represented by a recurring item or debt receivable.
            </AppText>
          </>
        ) : (
          <>
            <Field
              label={`Purchase amount (${data.currency})`}
              value={purchaseDraft.amount}
              onChangeText={(amount) => setPurchaseDraft({ ...purchaseDraft, amount })}
              keyboardType="decimal-pad"
              maxLength={35}
            />
            <DateField
              label="Purchase on"
              value={purchaseDraft.day}
              onChange={(day) => setPurchaseDraft({ ...purchaseDraft, day })}
            />
            <AppText tone="muted">
              This is a temporary calculation. It does not record a purchase.
            </AppText>
          </>
        )}
        {error ? <Feedback error={new Error(error)} /> : null}
      </FlowSheet>
    </>
  );
}
function Line({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' }}
    >
      <AppText style={{ flex: 1 }}>{label}</AppText>
      <AppText style={{ fontFamily: 'DMSansBold' }}>{value}</AppText>
    </View>
  );
}
