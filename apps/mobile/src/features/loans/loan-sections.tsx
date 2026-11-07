import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { z } from 'zod';
import { emiPaymentSchema } from '@finora/contracts';
import {
  addMonthsToKey,
  compareMonthKeys,
  formatMoney,
  getAvalancheOrder,
  getPaymentStatus,
  getPrincipalTotals,
  getRemainingPayableTotals,
  getSnowballOrder,
  parseMoney,
  summarizeMonth,
  summarizeRange,
  type MonthLineItem,
} from '@finora/finance-core';
import { AppText, Card, Feedback, Field } from '../../components/ui';
import { Icon, SectionHeading } from '../../components/design';
import { useApp } from '../../providers/app-provider';
import { useTheme } from '../../theme';
import { accountsSchema, categoriesSchema, useRead } from '../finance/shared';
import { decimalAmount } from '../finance/values';
import { useEmiWrite, useLoans } from './model';
import { monthLabel } from './summary';

function useMoney() {
  const { user } = useApp();
  const currency = user?.preferences.baseCurrency ?? 'INR';
  const locale = user?.preferences.locale ?? 'en-IN';
  return {
    currency,
    locale,
    money: (minor: bigint | string) => formatMoney(String(minor), currency, locale),
  };
}

/** A small segmented switch shared by the cards below. */
function Segments<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        padding: 3,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.border,
      }}
    >
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="button"
          accessibilityState={{ selected: value === option.value }}
          onPress={() => onChange(option.value)}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 9,
            backgroundColor: value === option.value ? theme.accent : 'transparent',
          }}
        >
          <AppText
            style={{
              fontSize: 12,
              fontFamily: 'DMSansBold',
              color: value === option.value ? theme.onAccent : theme.muted,
            }}
          >
            {option.label}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

function CardTitle({
  title,
  note,
  right,
}: {
  title: string;
  note?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ flexShrink: 1 }}>
        <AppText style={{ fontFamily: 'DMSansBold', fontSize: 16 }}>{title}</AppText>
        {note ? (
          <AppText tone="muted" style={{ fontSize: 12 }}>
            {note}
          </AppText>
        ) : null}
      </View>
      {right}
    </View>
  );
}

const DAY = 86_400_000;
function daysUntil(dueDateIso: string, today: string) {
  return Math.round(
    (Date.parse(`${dueDateIso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY,
  );
}
function dueLabel(days: number) {
  if (days < 0) return `Overdue by ${-days} ${days === -1 ? 'day' : 'days'}`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

/** This month's EMIs: what is left to pay (with one-tap paid and a partial amount), then the paid ones. */
export function ThisMonth({ today }: { today: string }) {
  const theme = useTheme();
  const { user } = useApp();
  const { money, currency, locale } = useMoney();
  const { debts, payments, rawPayments, month } = useLoans();
  const write = useEmiWrite();
  const separate = user?.preferences.keepDebtSeparate ?? false;
  const accounts = useRead('accounts', accountsSchema, !separate);
  const categories = useRead('categories', categoriesSchema, !separate);
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  useEffect(() => {
    const account = (accounts.data ?? []).find((a) => !a.archived);
    if (account && !accountId) setAccountId(account.id);
    const list = (categories.data ?? []).filter((c) => !c.archived && c.type === 'EXPENSE');
    if (list.length && !categoryId)
      setCategoryId((list.find((c) => /emi|loan|debt|bill/i.test(c.name)) ?? list[0]!).id);
  }, [accounts.data, categories.data, accountId, categoryId]);
  const [editing, setEditing] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [showPaid, setShowPaid] = useState(false);
  const [error, setError] = useState<unknown>();
  const summary = useMemo(() => summarizeMonth(debts, payments, month), [debts, payments, month]);

  async function mark(item: MonthLineItem, minor: string | null) {
    setBusy(item.debt.id);
    setError(undefined);
    try {
      await write('POST', `emi/loans/${item.debt.id}/payments/${month}`, emiPaymentSchema, {
        amountMinor: minor,
        ...(separate
          ? {}
          : { accountId: accountId || undefined, categoryId: categoryId || undefined }),
      });
      setEditing(null);
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(null);
    }
  }
  async function undo(item: MonthLineItem) {
    const raw = rawPayments.find((p) => p.loanId === item.debt.id && p.monthKey === month);
    if (!raw) return;
    setBusy(item.debt.id);
    setError(undefined);
    try {
      await write('DELETE', `emi/loans/${item.debt.id}/payments/${month}`, z.unknown(), {
        version: raw.version,
      });
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(null);
    }
  }
  function saveAmount(item: MonthLineItem) {
    try {
      void mark(item, parseMoney(amount.trim(), currency));
    } catch {
      setError(new Error('Enter an amount greater than zero.'));
    }
  }

  const isPaid = (i: MonthLineItem) => getPaymentStatus(i.amountDue, i.amountPaid) === 'paid';
  const byDue = (a: MonthLineItem, b: MonthLineItem) =>
    a.dueDateIso.localeCompare(b.dueDateIso) || a.debt.name.localeCompare(b.debt.name);
  const toPay = summary.items.filter((i) => !isPaid(i)).sort(byDue);
  const paid = summary.items.filter(isPaid).sort(byDue);
  const left = toPay.reduce(
    (s, i) => s + (i.amountDue > i.amountPaid ? i.amountDue - i.amountPaid : 0n),
    0n,
  );
  const paidTotal = paid.reduce((s, i) => s + i.amountPaid, 0n);

  if (!summary.items.length)
    return (
      <View style={{ gap: 10 }}>
        <SectionHeading title="This month" />
        <Card>
          <AppText tone="muted">No debts are active this month.</AppText>
        </Card>
      </View>
    );

  function row(item: MonthLineItem, done: boolean) {
    const working = busy === item.debt.id;
    const days = daysUntil(item.dueDateIso, today);
    const partial = item.amountPaid > 0n && !done;
    const chipColor =
      days < 0 && !done ? theme.danger : days <= 3 && !done ? theme.accent : theme.muted;
    return (
      <View key={item.debt.id} style={{ paddingVertical: 12, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText style={{ fontFamily: 'DMSansBold', fontSize: 15 }} numberOfLines={1}>
              {item.debt.name}
            </AppText>
            <AppText tone="muted" style={{ fontSize: 12 }} numberOfLines={1}>
              {done
                ? `Paid ${money(item.amountPaid)}`
                : partial
                  ? `${money(item.amountPaid)} of ${money(item.amountDue)} paid`
                  : money(item.amountDue)}
              {done ? '' : ' · '}
              {done ? null : (
                <AppText style={{ fontSize: 12, color: chipColor }}>{dueLabel(days)}</AppText>
              )}
            </AppText>
          </View>
          {done ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Mark ${item.debt.name} unpaid`}
              disabled={working}
              onPress={() => void undo(item)}
              hitSlop={8}
            >
              <AppText tone="accent" style={{ fontSize: 13, fontFamily: 'DMSansBold' }}>
                {working ? 'Saving…' : 'Undo'}
              </AppText>
            </Pressable>
          ) : (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit ${item.debt.name} amount`}
                onPress={() => {
                  setEditing(editing === item.debt.id ? null : item.debt.id);
                  setAmount(
                    decimalAmount(
                      (item.amountPaid > 0n ? item.amountPaid : item.amountDue).toString(),
                      currency,
                    ),
                  );
                }}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 11,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: `${theme.text}0A`,
                }}
              >
                <Icon name="activity" size={15} color={theme.muted} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Mark ${item.debt.name} paid`}
                disabled={working}
                onPress={() => void mark(item, null)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  borderRadius: 12,
                  backgroundColor: theme.accent,
                  opacity: working ? 0.5 : 1,
                }}
              >
                <AppText style={{ fontSize: 13, fontFamily: 'DMSansBold', color: theme.onAccent }}>
                  {working ? 'Saving…' : 'Mark Paid'}
                </AppText>
              </Pressable>
            </>
          )}
        </View>
        {editing === item.debt.id && !done && (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <Field
                label="Amount paid"
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Save ${item.debt.name} amount`}
              onPress={() => saveAmount(item)}
              style={{
                paddingHorizontal: 16,
                height: 48,
                borderRadius: 12,
                backgroundColor: theme.accent,
                justifyContent: 'center',
              }}
            >
              <AppText style={{ fontFamily: 'DMSansBold', color: theme.onAccent }}>Save</AppText>
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      <SectionHeading title="This month" />
      {!!error && <Feedback error={error} />}
      <Card style={{ paddingVertical: 4, gap: 0 }}>
        {toPay.length ? (
          <>
            <AppText tone="muted" style={{ fontSize: 12, paddingTop: 8 }}>
              TO PAY · {toPay.length} · {money(left)} left
            </AppText>
            {toPay.map((item) => row(item, false))}
          </>
        ) : (
          <AppText tone="muted" style={{ paddingVertical: 14, fontSize: 13 }}>
            All EMIs for {monthLabel(month, locale)} are paid.
          </AppText>
        )}
        {paid.length > 0 && (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showPaid ? 'Hide paid EMIs' : 'Show paid EMIs'}
              onPress={() => setShowPaid(!showPaid)}
              style={{
                paddingVertical: 12,
                borderTopWidth: toPay.length ? 1 : 0,
                borderTopColor: theme.border,
              }}
            >
              <AppText tone="muted" style={{ fontSize: 12 }}>
                PAID · {paid.length} · {money(paidTotal)} {showPaid ? '▴' : '▾'}
              </AppText>
            </Pressable>
            {showPaid && paid.map((item) => row(item, true))}
          </>
        )}
      </Card>
    </View>
  );
}

type Range = '1' | '6' | '12' | 'lifetime';

/** Due versus paid per month over a chosen range. */
export function Statistics() {
  const theme = useTheme();
  const { money, locale } = useMoney();
  const { debts, payments, month } = useLoans();
  const [range, setRange] = useState<Range>('6');
  const months = useMemo(() => {
    const from =
      range === 'lifetime'
        ? debts.length
          ? debts
              .map((d) => d.startMonth)
              .reduce((min, key) => (compareMonthKeys(key, min) < 0 ? key : min))
          : month
        : addMonthsToKey(month, -(Number(range) - 1));
    return summarizeRange(debts, payments, from, month).reverse();
  }, [debts, payments, month, range]);
  const totalDue = months.reduce((s, m) => s + m.totalDue, 0n);
  const totalPaid = months.reduce((s, m) => s + m.totalPaid, 0n);
  const pct = totalDue > 0n ? Number((totalPaid * 100n) / totalDue) : 0;
  const max = months.reduce((m, x) => (x.totalDue > m ? x.totalDue : m), 1n);
  return (
    <Card style={{ gap: 12 }}>
      <CardTitle
        title="Statistics"
        right={
          <Segments
            value={range}
            onChange={setRange}
            options={[
              { value: '1', label: '1M' },
              { value: '6', label: '6M' },
              { value: '12', label: '12M' },
              { value: 'lifetime', label: 'All' },
            ]}
          />
        }
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(
          [
            ['Total due', money(totalDue)],
            ['Total paid', money(totalPaid)],
            ['Paid', `${pct}%`],
          ] as const
        ).map(([label, value]) => (
          <View key={label} style={{ flex: 1 }}>
            <AppText tone="muted" style={{ fontSize: 11 }}>
              {label.toUpperCase()}
            </AppText>
            <AppText
              style={{ fontFamily: 'DMSansBold', fontSize: 14 }}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {value}
            </AppText>
          </View>
        ))}
      </View>
      {months.length === 0 ? (
        <AppText tone="muted" style={{ fontSize: 13 }}>
          No data for this range.
        </AppText>
      ) : (
        <View style={{ gap: 8 }}>
          {months.map((m) => {
            const track = Number((m.totalDue * 100n) / max);
            const fill = m.totalDue > 0n ? Number((m.totalPaid * 100n) / m.totalDue) : 0;
            return (
              <View
                key={m.monthKey}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
              >
                <AppText tone="muted" style={{ width: 62, fontSize: 12 }}>
                  {monthLabel(m.monthKey, locale)}
                </AppText>
                <View
                  style={{
                    flex: 1,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: `${theme.text}0D`,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      width: `${track}%`,
                      height: 10,
                      backgroundColor: theme.accentSoft,
                      borderRadius: 5,
                    }}
                  >
                    <View
                      style={{
                        width: `${fill}%`,
                        height: 10,
                        backgroundColor: theme.accent,
                        borderRadius: 5,
                      }}
                    />
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
}

/** Everything still owed across active fixed-term loans, split by tag, plus principal outstanding. */
export function LeftToPayOff() {
  const theme = useTheme();
  const { money, locale } = useMoney();
  const { debts, payments, extras, month } = useLoans();
  const totals = useMemo(
    () => getRemainingPayableTotals(debts, payments, extras, month),
    [debts, payments, extras, month],
  );
  const principal = useMemo(() => getPrincipalTotals(debts), [debts]);
  const note =
    principal.withPrincipal === 0
      ? "Add each loan's remaining principal from Edit."
      : [
          principal.oldestAsOf
            ? `Oldest figure from ${new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${principal.oldestAsOf}T12:00:00Z`))}`
            : null,
          principal.missingNames.length
            ? `${principal.missingNames.length} ${principal.missingNames.length === 1 ? 'loan' : 'loans'} without one`
            : null,
        ]
          .filter(Boolean)
          .join(' · ');
  const tags = [
    { key: 'small', label: 'Small loans', color: theme.accent },
    { key: 'large', label: 'Large loans', color: theme.success },
  ] as const;
  return (
    <Card style={{ gap: 10 }}>
      <CardTitle title="Left to pay off" note="All remaining EMIs, every loan" />
      <AppText
        style={{
          fontSize: 28,
          lineHeight: 36,
          fontFamily: 'DMSansBold',
          fontVariant: ['tabular-nums'],
        }}
      >
        {money(totals.combined)}
      </AppText>
      {totals.combined > 0n && (
        <View
          style={{
            flexDirection: 'row',
            height: 10,
            borderRadius: 5,
            overflow: 'hidden',
            gap: 2,
            backgroundColor: `${theme.text}0D`,
          }}
        >
          {tags.map(({ key, color }) =>
            totals.byTag[key] > 0n ? (
              <View
                key={key}
                style={{
                  width: `${Number((totals.byTag[key] * 100n) / totals.combined)}%`,
                  backgroundColor: color,
                }}
              />
            ) : null,
          )}
        </View>
      )}
      {tags.map(({ key, label, color }) => (
        <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
          <AppText tone="muted" style={{ flex: 1, fontSize: 13 }}>
            {label}
          </AppText>
          <AppText style={{ fontFamily: 'DMSansBold', fontSize: 14 }}>
            {money(totals.byTag[key])}
          </AppText>
        </View>
      ))}
      {totals.excludedOngoingCount > 0 && (
        <AppText tone="muted" style={{ fontSize: 12 }}>
          Excludes {totals.excludedOngoingCount} ongoing{' '}
          {totals.excludedOngoingCount === 1 ? 'loan' : 'loans'} with no end month.
        </AppText>
      )}
      <View style={{ borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10, gap: 2 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText tone="muted" style={{ fontSize: 13 }}>
            Principal outstanding
          </AppText>
          <AppText style={{ fontFamily: 'DMSansBold', fontSize: 14 }}>
            {principal.withPrincipal > 0 ? money(principal.total) : 'Not added'}
          </AppText>
        </View>
        {note ? (
          <AppText tone="muted" style={{ fontSize: 12 }}>
            {note}
          </AppText>
        ) : null}
      </View>
    </Card>
  );
}

/** EMIs due over the next six months, with the drop when loans end. */
export function ComingMonths() {
  const theme = useTheme();
  const { money, locale } = useMoney();
  const { debts, payments, month } = useLoans();
  const current = useMemo(
    () => summarizeMonth(debts, payments, month).totalDue,
    [debts, payments, month],
  );
  const months = useMemo(
    () => summarizeRange(debts, payments, addMonthsToKey(month, 1), addMonthsToKey(month, 6)),
    [debts, payments, month],
  );
  const max = months.reduce(
    (m, x) => (x.totalDue > m ? x.totalDue : m),
    current > 0n ? current : 1n,
  );
  return (
    <Card style={{ gap: 12 }}>
      <CardTitle title="Coming months" note="EMIs due each month" />
      {months.map((m, i) => {
        const previous = i === 0 ? current : months[i - 1]!.totalDue;
        const drop = previous - m.totalDue;
        return (
          <View key={m.monthKey} style={{ gap: 6 }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'baseline',
              }}
            >
              <AppText tone="muted" style={{ fontSize: 13 }}>
                {monthLabel(m.monthKey, locale)}
              </AppText>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'baseline' }}>
                {drop !== 0n && (
                  <AppText
                    style={{
                      fontSize: 12,
                      fontFamily: 'DMSansBold',
                      color: drop > 0n ? theme.success : theme.muted,
                    }}
                  >
                    {drop > 0n ? `−${money(drop)}` : `+${money(-drop)}`}
                  </AppText>
                )}
                <AppText style={{ fontFamily: 'DMSansBold', fontSize: 14 }}>
                  {money(m.totalDue)}
                </AppText>
              </View>
            </View>
            <View
              style={{
                height: 6,
                borderRadius: 3,
                backgroundColor: `${theme.text}0D`,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  width: `${Number((m.totalDue * 100n) / max)}%`,
                  height: 6,
                  backgroundColor: theme.accent,
                }}
              />
            </View>
          </View>
        );
      })}
    </Card>
  );
}

/** Snowball (smallest balance first) or avalanche (highest rate first). */
export function PayoffStrategy() {
  const theme = useTheme();
  const { money } = useMoney();
  const { debts, payments, extras, month } = useLoans();
  const [strategy, setStrategy] = useState<'snowball' | 'avalanche'>('snowball');
  const order = useMemo(
    () =>
      strategy === 'snowball'
        ? getSnowballOrder(debts, payments, extras, month)
        : getAvalancheOrder(debts, payments, extras, month),
    [strategy, debts, payments, extras, month],
  );
  return (
    <Card style={{ gap: 10 }}>
      <CardTitle
        title="Payoff strategy"
        right={
          <Segments
            value={strategy}
            onChange={setStrategy}
            options={[
              { value: 'snowball', label: 'Snowball' },
              { value: 'avalanche', label: 'Avalanche' },
            ]}
          />
        }
      />
      <AppText tone="muted" style={{ fontSize: 12 }}>
        {strategy === 'snowball'
          ? 'Smallest remaining balance first: quick wins to stay motivated.'
          : 'Highest interest rate first: minimizes total interest. Loans without a rate sort last.'}
      </AppText>
      {order.length === 0 ? (
        <AppText tone="muted" style={{ fontSize: 13 }}>
          No debts with a fixed end date to rank yet.
        </AppText>
      ) : (
        order.map((entry, index) => (
          <View
            key={entry.debt.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              padding: 10,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: index === 0 ? theme.accent : `${theme.text}0D`,
              }}
            >
              <AppText
                style={{
                  fontSize: 12,
                  fontFamily: 'DMSansBold',
                  color: index === 0 ? theme.onAccent : theme.muted,
                }}
              >
                {index + 1}
              </AppText>
            </View>
            <View style={{ flex: 1 }}>
              <AppText style={{ fontFamily: 'DMSansBold', fontSize: 14 }} numberOfLines={1}>
                {entry.debt.name}
              </AppText>
              {strategy === 'avalanche' && (
                <AppText tone="muted" style={{ fontSize: 12 }}>
                  {entry.debt.interestRatePct != null
                    ? `${entry.debt.interestRatePct}% interest`
                    : 'No rate set'}
                </AppText>
              )}
            </View>
            <AppText style={{ fontFamily: 'DMSansBold', fontSize: 14 }}>
              {money(entry.remaining)}
            </AppText>
          </View>
        ))
      )}
    </Card>
  );
}
