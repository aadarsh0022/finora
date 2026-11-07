import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { reportSummarySchema, type EmiIncomePeriodDto } from '@finora/contracts';
import { formatMoney, getForecast, getIncomeForMonth } from '@finora/finance-core';
import { AppText, Card, Feedback, Screen } from '../../components/ui';
import { Loading } from '../../components/skeleton';
import { CreateAction, EmptyState, SectionHeading } from '../../components/design';
import { useApp } from '../../providers/app-provider';
import { useTheme } from '../../theme';
import { useRead } from '../finance/shared';
import { IncomeSheet } from '../loans/loan-sheets';
import { useLoans } from '../loans/model';
import { monthLabel } from '../loans/summary';

/**
 * Expected income, kept in one place for the whole app: add as many salary or extra income
 * streams as you like, see this month against what was actually recorded, and look 12 months
 * ahead against your EMIs.
 */
export function IncomeScreen() {
  const theme = useTheme();
  const { user } = useApp();
  const locale = user?.preferences.locale ?? 'en-IN';
  const currency = user?.preferences.baseCurrency ?? 'INR';
  const money = (minor: bigint | string) => formatMoney(String(minor), currency, locale);
  const { read, month, debts, payments, incomes, rawIncomes } = useLoans();
  const recorded = useRead('reports/summary?range=current-month', reportSummarySchema);
  const [target, setTarget] = useState<EmiIncomePeriodDto | 'new' | null>(null);
  const expected = useMemo(() => getIncomeForMonth(incomes, month), [incomes, month]);
  const forecast = useMemo(
    () => getForecast(debts, payments, incomes, month, 12),
    [debts, payments, incomes, month],
  );
  const received = BigInt(recorded.data?.cashflow.incomeMinor ?? '0');
  const share = expected.total > 0n ? Math.min(100, Number((received * 100n) / expected.total)) : 0;
  const peak = forecast.reduce((max, row) => (row.income > max ? row.income : max), 1n);

  if (read.isPending && !read.data)
    return (
      <Screen title="Income" includeTopInset={false} subtitle="What you expect to earn.">
        <Loading variant="dashboard" />
      </Screen>
    );
  if (read.error && !read.data)
    return (
      <Screen title="Income" includeTopInset={false}>
        <Feedback error={read.error} retry={() => void read.refetch()} />
      </Screen>
    );

  return (
    <Screen
      title="Income"
      includeTopInset={false}
      subtitle="What you expect to earn, and what is left after EMIs."
      onRefresh={() => read.refetch()}
      floatingAction={<CreateAction label="Add income" onPress={() => setTarget('new')} />}
    >
      {!rawIncomes.length ? (
        <EmptyState
          icon="income"
          title="Add your income"
          message="Add your salary or any other income. It is used across the app to compare against what you actually receive and what your EMIs take."
          action={{ title: 'Add income', onPress: () => setTarget('new') }}
        />
      ) : (
        <>
          <Card style={{ gap: 10 }}>
            <AppText tone="muted" style={{ fontSize: 13 }}>
              {monthLabel(month, locale, 'long')} expected income
            </AppText>
            <AppText
              style={{
                fontSize: 32,
                lineHeight: 40,
                fontFamily: 'DMSansBold',
                fontVariant: ['tabular-nums'],
              }}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {money(expected.total)}
            </AppText>
            <View
              style={{
                height: 8,
                borderRadius: 4,
                backgroundColor: `${theme.text}0D`,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  width: `${share}%`,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: theme.success,
                }}
              />
            </View>
            <AppText tone="muted" style={{ fontSize: 12 }}>
              {recorded.data
                ? `${money(received)} recorded so far (${share}% of expected)`
                : 'Checking what you have recorded…'}
            </AppText>
          </Card>

          <View style={{ gap: 10 }}>
            <SectionHeading title="Your income" />
            <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
              {rawIncomes.map((period, index) => (
                <Pressable
                  key={period.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${period.kind} income`}
                  onPress={() => setTarget(period)}
                  style={{
                    padding: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    borderTopWidth: index ? 1 : 0,
                    borderTopColor: theme.border,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <AppText style={{ fontFamily: 'DMSansBold', fontSize: 15 }}>
                      {period.note || (period.kind === 'salary' ? 'Salary' : 'Extra income')}
                    </AppText>
                    <AppText tone="muted" style={{ fontSize: 12 }}>
                      {monthLabel(period.startMonth, locale)} to{' '}
                      {period.endMonth ? monthLabel(period.endMonth, locale) : 'ongoing'}
                    </AppText>
                  </View>
                  <AppText style={{ fontFamily: 'DMSansBold', fontSize: 15 }}>
                    {money(period.amountMinor)}
                    <AppText tone="muted" style={{ fontSize: 12 }}>
                      {' '}
                      /mo
                    </AppText>
                  </AppText>
                </Pressable>
              ))}
            </Card>
          </View>

          <Card style={{ gap: 12 }}>
            <View>
              <AppText style={{ fontFamily: 'DMSansBold', fontSize: 16 }}>
                12-month forecast
              </AppText>
              <AppText tone="muted" style={{ fontSize: 12 }}>
                Income against the EMIs due each month
              </AppText>
            </View>
            {forecast.map((row) => (
              <View key={row.monthKey} style={{ gap: 6 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                  }}
                >
                  <AppText tone="muted" style={{ fontSize: 13 }}>
                    {monthLabel(row.monthKey, locale)}
                  </AppText>
                  <AppText
                    style={{
                      fontFamily: 'DMSansBold',
                      fontSize: 14,
                      color: row.net < 0n ? theme.danger : theme.success,
                    }}
                  >
                    {row.net < 0n ? `-${money(-row.net)}` : money(row.net)} left
                  </AppText>
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
                      width: `${Number((row.income * 100n) / peak)}%`,
                      height: 6,
                      backgroundColor: theme.accentSoft,
                    }}
                  >
                    <View
                      style={{
                        width: `${row.income > 0n ? Math.min(100, Number((row.emisDue * 100n) / row.income)) : 0}%`,
                        height: 6,
                        backgroundColor: row.net < 0n ? theme.danger : theme.accent,
                      }}
                    />
                  </View>
                </View>
                <AppText tone="muted" style={{ fontSize: 11 }}>
                  Income {money(row.income)} · EMIs {money(row.emisDue)}
                </AppText>
              </View>
            ))}
          </Card>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Loans and EMIs"
            onPress={() => router.push('/loans')}
            style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}
          >
            <AppText tone="accent" style={{ fontFamily: 'DMSansBold', fontSize: 14 }}>
              Loans & EMIs ›
            </AppText>
          </Pressable>
        </>
      )}
      <IncomeSheet
        visible={!!target}
        initial={target ?? undefined}
        onClose={() => setTarget(null)}
        periods={rawIncomes}
        month={month}
      />
    </Screen>
  );
}
