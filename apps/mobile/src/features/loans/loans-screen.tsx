import { useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { z } from 'zod';
import { emiLoanSchema, type EmiLoanDto } from '@finora/contracts';
import { calendarDate, formatMoney, getRemainingPayable } from '@finora/finance-core';
import { AppButton, AppText, Card, Feedback, Screen } from '../../components/ui';
import { Loading } from '../../components/skeleton';
import { EmptyState, Icon, SectionHeading } from '../../components/design';
import { useApp } from '../../providers/app-provider';
import { useTheme } from '../../theme';
import { useEmiWrite, useLoans } from './model';
import { monthLabel, monthOverview } from './summary';
import { ComingMonths, LeftToPayOff, PayoffStrategy, Statistics, ThisMonth } from './loan-sections';
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
      headerAction={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a loan"
          onPress={() => setForm({ open: true, loan: null })}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: theme.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="plus" size={20} color={theme.onAccent} />
        </Pressable>
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
              {monthLabel(month, locale)} EMIs
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
                left to pay of {money(overview.totalDue)}
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
                label="Paid so far"
                value={money(overview.totalPaid)}
                note={`${overview.doneCount} of ${overview.itemCount} EMIs done`}
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
          <Statistics />
          <LeftToPayOff />
          <ComingMonths />
          <PayoffStrategy />

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
                    {value === 'all' ? 'ALL DEBTS' : value.toUpperCase()}
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
                      gap: 10,
                      opacity: loan.isActive ? 1 : 0.55,
                      borderTopWidth: index ? 1 : 0,
                      borderTopColor: theme.border,
                    }}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${loan.name} history`}
                      onPress={() => setHistory(loan.id)}
                      style={{ gap: 3 }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <AppText style={{ fontFamily: 'DMSansBold', fontSize: 17 }}>
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
                            style={{ fontSize: 10, fontFamily: 'DMSansBold', color: theme.accent }}
                          >
                            {loan.loanTag.toUpperCase()}
                          </AppText>
                        </View>
                        {!loan.isActive && (
                          <AppText tone="muted" style={{ fontSize: 11 }}>
                            Archived
                          </AppText>
                        )}
                      </View>
                      <AppText tone="muted" style={{ fontSize: 13 }}>
                        {money(loan.monthlyAmountMinor)}/mo · {range}
                      </AppText>
                      {loan.principalRemainingMinor !== null && (
                        <AppText tone="muted" style={{ fontSize: 13 }}>
                          Principal{' '}
                          <AppText style={{ fontSize: 13, fontFamily: 'DMSansBold' }}>
                            {money(loan.principalRemainingMinor)}
                          </AppText>
                          {loan.principalAsOf
                            ? ` · as of ${new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${loan.principalAsOf}T12:00:00Z`))}`
                            : ''}
                        </AppText>
                      )}
                    </Pressable>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'flex-end',
                        justifyContent: 'space-between',
                      }}
                    >
                      <View>
                        <AppText tone="muted" style={{ fontSize: 11, letterSpacing: 0.6 }}>
                          REMAINING
                        </AppText>
                        <AppText
                          style={{
                            fontSize: 22,
                            lineHeight: 30,
                            fontFamily: 'DMSansBold',
                            fontVariant: ['tabular-nums'],
                          }}
                        >
                          {remaining === null ? 'Ongoing' : money(remaining)}
                        </AppText>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {(
                          [
                            ['History', 'activity', () => setHistory(loan.id)],
                            ['Edit', 'chart', () => setForm({ open: true, loan })],
                            [
                              loan.isActive ? 'Archive' : 'Restore',
                              'repeat',
                              () => void toggleActive(loan),
                            ],
                            ['Delete', 'expense', () => confirmDelete(loan)],
                          ] as const
                        ).map(([label, icon, press]) => (
                          <Pressable
                            key={label}
                            accessibilityRole="button"
                            accessibilityLabel={`${label} ${loan.name}`}
                            onPress={press}
                            style={{
                              width: 38,
                              height: 38,
                              borderRadius: 11,
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: `${theme.text}0A`,
                            }}
                          >
                            <Icon
                              name={icon}
                              size={16}
                              color={label === 'Delete' ? theme.danger : theme.muted}
                            />
                          </Pressable>
                        ))}
                      </View>
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
            <AppButton
              title="Add a loan"
              variant="secondary"
              onPress={() => setForm({ open: true, loan: null })}
            />
          </View>
        </>
      )}
      <LoanHistorySheet loanId={history} onClose={() => setHistory(null)} />
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
