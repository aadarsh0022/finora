import { useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { z } from 'zod';
import { emiLoanSchema, type EmiLoanDto } from '@finora/contracts';
import {
  calendarDate,
  formatMoney,
  getPrincipalTotals,
  getRemainingPayable,
  getRemainingPayableTotals,
} from '@finora/finance-core';
import { AppText, Card, Feedback, Screen } from '../../components/ui';
import { Loading } from '../../components/skeleton';
import { CreateAction, EmptyState, Icon, SectionHeading } from '../../components/design';
import { useApp } from '../../providers/app-provider';
import { useTheme } from '../../theme';
import { useEmiWrite, useLoans } from './model';
import { monthLabel, monthOverview } from './summary';
import {
  ComingMonths,
  LeftToPayOff,
  LoanAvatar,
  PayoffStrategy,
  Statistics,
  ThisMonth,
} from './loan-sections';
import { ForecastSheet, IncomeSheet, LoanFormSheet, LoanHistorySheet } from './loan-sheets';

type Filter = 'all' | 'large' | 'small';

function Tile({
  icon,
  label,
  value,
  note,
}: {
  icon: 'check' | 'calendar' | 'goal';
  label: string;
  value: string;
  note: string;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexBasis: '47%',
        flexGrow: 1,
        gap: 4,
        padding: 12,
        borderRadius: 16,
        backgroundColor: '#FFFFFF26',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name={icon === 'goal' ? 'goal' : icon} size={14} color={theme.onAccent} />
        <AppText style={{ fontSize: 12, color: `${theme.onAccent}D0` }}>{label}</AppText>
      </View>
      <AppText
        style={{ fontSize: 18, fontFamily: 'DMSansBold', color: theme.onAccent }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </AppText>
      <AppText style={{ fontSize: 12, color: `${theme.onAccent}C0` }} numberOfLines={1}>
        {note}
      </AppText>
    </View>
  );
}

export function LoansScreen() {
  const theme = useTheme();
  const { user } = useApp();
  const locale = user?.preferences.locale ?? 'en-IN';
  const currency = user?.preferences.baseCurrency ?? 'INR';
  const { read, month, loans, debts, payments, extras, incomes, rawIncomes } = useLoans();
  const write = useEmiWrite();
  const money = (minor: bigint | string) => formatMoney(String(minor), currency, locale);
  const [filter, setFilter] = useState<Filter>('all');
  const [history, setHistory] = useState<string | null>(null);
  const [form, setForm] = useState<{ open: boolean; loan: EmiLoanDto | null }>({
    open: false,
    loan: null,
  });
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [forecastOpen, setForecastOpen] = useState(false);
  const [error, setError] = useState<unknown>();
  const overview = useMemo(
    () => monthOverview(debts, payments, incomes, month),
    [debts, payments, incomes, month],
  );
  const totals = useMemo(
    () => getRemainingPayableTotals(debts, payments, extras, month),
    [debts, payments, extras, month],
  );
  const principal = useMemo(() => getPrincipalTotals(debts), [debts]);
  const shown = loans.filter((loan) => filter === 'all' || loan.loanTag === filter);

  async function toggleActive(loan: EmiLoanDto) {
    setError(undefined);
    try {
      await write('PATCH', `emi/loans/${loan.id}`, emiLoanSchema, {
        name: loan.name,
        monthlyAmountMinor: loan.monthlyAmountMinor,
        startMonth: loan.startMonth,
        endMonth: loan.endMonth,
        dueDay: loan.dueDay,
        loanTag: loan.loanTag,
        interestRatePct: loan.interestRatePct,
        principalRemainingMinor: loan.principalRemainingMinor,
        isActive: !loan.isActive,
        version: loan.version,
      });
    } catch (failure) {
      setError(failure);
    }
  }
  function confirmDelete(loan: EmiLoanDto) {
    Alert.alert(
      `Delete ${loan.name}?`,
      'Its payment history and prepayments are removed. Expenses already recorded in your transactions stay.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            write('DELETE', `emi/loans/${loan.id}`, z.unknown(), {
              version: loan.version,
              confirmation: 'DELETE',
            }).catch(setError);
          },
        },
      ],
    );
  }

  if (read.isPending && !read.data)
    return (
      <Screen title="Loans & EMIs" includeTopInset={false} subtitle="Every EMI, month by month.">
        <Loading variant="dashboard" />
      </Screen>
    );
  if (read.error && !read.data)
    return (
      <Screen title="Loans & EMIs" includeTopInset={false}>
        <Feedback error={read.error} retry={() => void read.refetch()} />
      </Screen>
    );

  return (
    <Screen
      title="Loans & EMIs"
      includeTopInset={false}
      subtitle="Every EMI, month by month."
      onRefresh={() => read.refetch()}
      floatingAction={
        <CreateAction label="Add a loan" onPress={() => setForm({ open: true, loan: null })} />
      }
    >
      {!loans.length ? (
        <EmptyState
          icon="plan"
          title="No loans yet"
          message="Add an EMI to see what is left each month, what is next and when you will be debt-free."
          action={{ title: 'Add a loan', onPress: () => setForm({ open: true, loan: null }) }}
        />
      ) : (
        <>
          <View style={{ backgroundColor: theme.accent, borderRadius: 26, padding: 20, gap: 14 }}>
            <AppText style={{ fontSize: 13, color: `${theme.onAccent}D0` }}>
              {monthLabel(month, locale)} · to pay this month
            </AppText>
            <View style={{ gap: 2 }}>
              <AppText
                style={{
                  fontSize: 36,
                  lineHeight: 44,
                  fontFamily: 'DMSansBold',
                  color: theme.onAccent,
                  letterSpacing: -1,
                }}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {money(overview.left)}
              </AppText>
              <AppText style={{ fontSize: 13, color: `${theme.onAccent}D0` }}>
                left to pay of {money(overview.totalDue)} · {overview.doneCount} of{' '}
                {overview.itemCount} EMIs done
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View
                style={{
                  flex: 1,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: '#FFFFFF33',
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    width: `${overview.paidPercent}%`,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: theme.onAccent,
                  }}
                />
              </View>
              <AppText style={{ fontSize: 12, fontFamily: 'DMSansBold', color: theme.onAccent }}>
                {overview.paidPercent}%
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              <Tile
                icon="check"
                label="Total left to pay"
                value={money(totals.combined)}
                note={
                  totals.excludedOngoingCount
                    ? `${totals.excludedOngoingCount} ongoing not counted`
                    : 'All remaining EMIs'
                }
              />
              <Tile
                icon="goal"
                label="Principal left"
                value={principal.withPrincipal ? money(principal.total) : 'Not added'}
                note={
                  principal.withPrincipal
                    ? `${principal.withPrincipal} ${principal.withPrincipal === 1 ? 'loan' : 'loans'} with a balance`
                    : 'Add it from Edit on a loan'
                }
              />
              <Tile
                icon="calendar"
                label={
                  overview.next
                    ? `Next · ${new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(overview.next.dueDateIso))}`
                    : 'Next'
                }
                value={overview.next ? money(overview.next.remaining) : 'All paid'}
                note={overview.next ? overview.next.debt.name : 'Nothing due'}
              />
              <Tile
                icon="goal"
                label="Debt-free by"
                value={
                  overview.debtFree.monthKey
                    ? monthLabel(overview.debtFree.monthKey, locale)
                    : overview.debtFree.hasOngoing
                      ? 'Ongoing'
                      : 'Debt-free'
                }
                note={
                  overview.debtFree.monthKey
                    ? `${overview.debtFree.monthsToGo} months to go`
                    : overview.debtFree.hasOngoing
                      ? 'A loan has no end date'
                      : 'No active loans'
                }
              />
            </View>
          </View>

          <Card style={{ gap: 12 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <View>
                <AppText style={{ fontFamily: 'DMSansBold', fontSize: 16 }}>Income vs EMIs</AppText>
                <AppText tone="muted" style={{ fontSize: 12 }}>
                  This month
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Manage income"
                onPress={() => router.push('/income')}
                hitSlop={8}
              >
                <AppText tone="accent" style={{ fontFamily: 'DMSansBold', fontSize: 13 }}>
                  {rawIncomes.length ? 'Edit' : 'Add income'}
                </AppText>
              </Pressable>
            </View>
            {overview.income > 0n ? (
              <>
                <View>
                  <AppText tone="muted" style={{ fontSize: 12 }}>
                    {overview.net < 0n ? 'Short after EMIs' : 'Left after EMIs'}
                  </AppText>
                  <AppText
                    style={{
                      fontSize: 28,
                      lineHeight: 36,
                      fontFamily: 'DMSansBold',
                      color: overview.net < 0n ? theme.danger : theme.success,
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {overview.net < 0n ? `-${money(-overview.net)}` : money(overview.net)}
                  </AppText>
                </View>
                <View
                  style={{
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: theme.successSoft,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      width: `${Math.min(100, overview.emiShare ?? 0)}%`,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: overview.net < 0n ? theme.danger : theme.accent,
                    }}
                  />
                </View>
                <AppText tone="muted" style={{ fontSize: 12 }}>
                  EMIs take {overview.emiShare}% of income
                </AppText>
                <View style={{ flexDirection: 'row' }}>
                  <View style={{ flex: 1 }}>
                    <AppText tone="muted" style={{ fontSize: 12 }}>
                      Income
                    </AppText>
                    <AppText style={{ fontFamily: 'DMSansBold' }}>{money(overview.income)}</AppText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText tone="muted" style={{ fontSize: 12 }}>
                      EMIs due
                    </AppText>
                    <AppText style={{ fontFamily: 'DMSansBold' }}>
                      {money(overview.totalDue)}
                    </AppText>
                  </View>
                </View>
              </>
            ) : (
              <AppText tone="muted" style={{ fontSize: 13 }}>
                Add your salary to see how your EMIs compare with what you earn.
              </AppText>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View 12-month forecast"
              onPress={() => setForecastOpen(true)}
              style={{ minHeight: 36, justifyContent: 'center' }}
            >
              <AppText tone="accent" style={{ fontFamily: 'DMSansBold', fontSize: 13 }}>
                View 12-month forecast ›
              </AppText>
            </Pressable>
          </Card>

          <ThisMonth
            today={calendarDate(new Date(), user?.preferences.timezone ?? 'Asia/Kolkata')}
          />
          <View style={{ gap: 12 }}>
            <SectionHeading title="All debts" />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['all', 'large', 'small'] as const).map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: filter === value }}
                  accessibilityLabel={`Show ${value === 'all' ? 'all debts' : `${value} debts`}`}
                  onPress={() => setFilter(value)}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 9,
                    borderRadius: 18,
                    backgroundColor: filter === value ? theme.text : `${theme.text}0F`,
                  }}
                >
                  <AppText
                    style={{
                      fontSize: 12,
                      fontFamily: 'DMSansBold',
                      color: filter === value ? theme.surface : theme.muted,
                    }}
                  >
                    {value === 'all' ? 'All' : value === 'large' ? 'Large' : 'Small'}{' '}
                    {value === 'all'
                      ? loans.length
                      : loans.filter((l) => l.loanTag === value).length}
                  </AppText>
                </Pressable>
              ))}
            </View>
            {!!error && <Feedback error={error} />}
            <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
              {shown.map((loan, index) => {
                const debt = debts.find((d) => d.id === loan.id)!;
                const remaining = getRemainingPayable(debt, payments, extras, month);
                const range = `${monthLabel(loan.startMonth, locale)} to ${loan.endMonth ? monthLabel(loan.endMonth, locale) : 'ongoing'}`;
                return (
                  <View
                    key={loan.id}
                    style={{
                      padding: 16,
                      gap: 12,
                      opacity: loan.isActive ? 1 : 0.6,
                      borderTopWidth: index ? 1 : 0,
                      borderTopColor: theme.border,
                    }}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${loan.name} history`}
                      onPress={() => setHistory(loan.id)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
                    >
                      <LoanAvatar name={loan.name} muted={!loan.isActive} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <AppText
                            style={{ fontFamily: 'DMSansBold', fontSize: 16, flexShrink: 1 }}
                            numberOfLines={1}
                          >
                            {loan.name}
                          </AppText>
                          <View
                            style={{
                              paddingHorizontal: 8,
                              paddingVertical: 2,
                              borderRadius: 8,
                              backgroundColor: theme.accentSoft,
                            }}
                          >
                            <AppText
                              style={{
                                fontSize: 10,
                                fontFamily: 'DMSansBold',
                                color: theme.accent,
                              }}
                            >
                              {loan.isActive ? loan.loanTag.toUpperCase() : 'ARCHIVED'}
                            </AppText>
                          </View>
                        </View>
                        <AppText tone="muted" style={{ fontSize: 13 }} numberOfLines={1}>
                          {money(loan.monthlyAmountMinor)}/mo · {range}
                        </AppText>
                      </View>
                    </Pressable>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View
                        style={{
                          flex: 1,
                          gap: 2,
                          padding: 12,
                          borderRadius: 14,
                          backgroundColor: `${theme.text}08`,
                        }}
                      >
                        <AppText tone="muted" style={{ fontSize: 11 }}>
                          Remaining
                        </AppText>
                        <AppText
                          style={{
                            fontSize: 18,
                            fontFamily: 'DMSansBold',
                            fontVariant: ['tabular-nums'],
                          }}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                        >
                          {remaining === null ? 'Ongoing' : money(remaining)}
                        </AppText>
                      </View>
                      {loan.principalRemainingMinor !== null && (
                        <View
                          style={{
                            flex: 1,
                            gap: 2,
                            padding: 12,
                            borderRadius: 14,
                            backgroundColor: `${theme.text}08`,
                          }}
                        >
                          <AppText tone="muted" style={{ fontSize: 11 }}>
                            Principal
                            {loan.principalAsOf
                              ? ` · ${new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${loan.principalAsOf}T12:00:00Z`))}`
                              : ''}
                          </AppText>
                          <AppText
                            style={{
                              fontSize: 18,
                              fontFamily: 'DMSansBold',
                              fontVariant: ['tabular-nums'],
                            }}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                          >
                            {money(loan.principalRemainingMinor)}
                          </AppText>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
              {!shown.length && (
                <AppText tone="muted" style={{ padding: 16 }}>
                  No {filter} loans.
                </AppText>
              )}
            </Card>
          </View>

          <SectionHeading title="Insights" />
          <Statistics />
          <LeftToPayOff />
          <ComingMonths />
          <PayoffStrategy />
        </>
      )}
      <LoanHistorySheet
        loanId={history}
        onClose={() => setHistory(null)}
        onEdit={(loan) => {
          setHistory(null);
          setForm({ open: true, loan });
        }}
        onToggleActive={(loan) => {
          setHistory(null);
          void toggleActive(loan);
        }}
        onDelete={(loan) => {
          setHistory(null);
          confirmDelete(loan);
        }}
      />
      <LoanFormSheet
        loan={form.loan}
        visible={form.open}
        onClose={() => setForm({ open: false, loan: null })}
        month={month}
      />
      <IncomeSheet
        visible={incomeOpen}
        onClose={() => setIncomeOpen(false)}
        periods={rawIncomes}
        month={month}
      />
      <ForecastSheet visible={forecastOpen} onClose={() => setForecastOpen(false)} />
    </Screen>
  );
}
