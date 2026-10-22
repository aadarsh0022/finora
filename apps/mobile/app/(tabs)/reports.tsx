import { reportRangeSchema, reportSummarySchema, type ReportRange } from '@finora/contracts';
import { calendarDate } from '@finora/finance-core';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Crypto from 'expo-crypto';
import { AppButton, AppText, Card, Feedback, Loading, Screen } from '../../src/components/ui';
import { DateField, FlowSheet, SelectField } from '../../src/components/flow';
import { useMoney, useRead } from '../../src/features/finance/shared';
import { AccountDistribution, ExpenseDonut, MonthlyChart } from '../../src/features/reports/charts';
import { percentageFromBasisPoints, reportCsv } from '../../src/features/reports/values';
import { useApp } from '../../src/providers/app-provider';
import { useTheme } from '../../src/theme';

const periods = [
  { value: 'current-month', label: 'This month' },
  { value: 'previous-month', label: 'Last month' },
  { value: 'last-3-months', label: 'Last 3 months' },
  { value: 'last-6-months', label: 'Last 6 months' },
  { value: 'custom', label: 'Custom dates' },
] as const;

export default function Reports() {
  const { user } = useApp();
  const theme = useTheme();
  const today = calendarDate(new Date(), user?.preferences.timezone ?? 'Asia/Kolkata');
  const money = useMoney();
  const [range, setRange] = useState<ReportRange['range']>('current-month');
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [queryString, setQueryString] = useState('range=current-month');
  const [error, setError] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [exportNotice, setExportNotice] = useState('');
  const query = useRead(`reports/summary?${queryString}`, reportSummarySchema);
  const data = query.data;
  const dateLabel = (value: string, includeYear = true) =>
    new Intl.DateTimeFormat(user?.preferences.locale ?? 'en-IN', {
      day: 'numeric',
      month: 'short',
      year: includeYear ? 'numeric' : undefined,
      timeZone: 'UTC',
    }).format(new Date(`${value}T12:00:00Z`));
  function apply(value: ReportRange['range']) {
    const validated = reportRangeSchema.safeParse(
      value === 'custom' ? { range: value, from, to } : { range: value },
    );
    if (!validated.success) {
      setError(validated.error.issues.map((issue) => issue.message).join('\n'));
      return;
    }
    const params = new URLSearchParams({ range: validated.data.range });
    if (validated.data.from) params.set('from', validated.data.from);
    if (validated.data.to) params.set('to', validated.data.to);
    setQueryString(params.toString());
    setRange(validated.data.range);
    setCustomOpen(false);
    setError('');
    setExportNotice('');
  }
  const exportReport = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error('Load a report before exporting.');
      let file: File | undefined;
      try {
        if (!(await Sharing.isAvailableAsync()))
          throw new Error('File sharing is not available on this device.');
        file = new File(Paths.cache, `finora-report-${Crypto.randomUUID()}.csv`);
        file.create();
        file.write(reportCsv(data));
        await Sharing.shareAsync(file.uri, {
          mimeType: 'text/csv',
          dialogTitle: 'Save your Finora report',
        });
        setExportNotice(
          'Report created and shared with the system. Save it in a private location.',
        );
      } finally {
        if (file?.exists) file.delete();
      }
    },
  });
  return (
    <Screen
      title="Reports"
      subtitle="Understand where your money goes."
      onRefresh={() => query.refetch()}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <SelectField
            label="Period"
            value={range}
            onChange={(value) => {
              if (value !== 'custom') apply(value);
              else {
                setFrom(data?.period.from ?? from);
                setTo(data?.period.to ?? to);
                setError('');
                setCustomOpen(true);
              }
            }}
            options={periods}
          />
        </View>
        <AppButton
          title="Export CSV"
          variant="secondary"
          loading={exportReport.isPending}
          disabled={!data || query.isFetching}
          onPress={() => exportReport.mutate()}
        />
      </View>
      {range === 'custom' && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit custom dates"
          onPress={() => {
            setFrom(data?.period.from ?? from);
            setTo(data?.period.to ?? to);
            setError('');
            setCustomOpen(true);
          }}
          style={{ minHeight: 44, justifyContent: 'center', marginVertical: -12 }}
        >
          <AppText tone="accent" style={{ fontSize: 13 }}>
            Edit dates ›
          </AppText>
        </Pressable>
      )}
      {exportReport.error && <Feedback error={exportReport.error} />}
      {exportNotice ? (
        <AppText tone="accent" accessibilityRole="alert">
          {exportNotice}
        </AppText>
      ) : null}
      {query.isPending && <Loading variant="dashboard" />}
      {query.isError && (
        <Feedback
          error={query.error}
          retry={() => {
            void query.refetch();
          }}
        />
      )}
      {data && (
        <>
          <AppText tone="muted" style={{ fontSize: 13, lineHeight: 20 }}>
            {dateLabel(
              data.period.from,
              data.period.from.slice(0, 4) !== data.period.to.slice(0, 4),
            )}{' '}
            – {dateLabel(data.period.to)} · {data.period.currency}
          </AppText>
          <Card>
            <AppText tone="muted" style={{ fontSize: 14 }}>
              Net cash flow
            </AppText>
            <AppText
              tone={BigInt(data.cashflow.netMinor) < 0n ? 'danger' : 'accent'}
              style={{
                fontFamily: 'DMSansBold',
                fontSize: 32,
                lineHeight: 40,
                fontVariant: ['tabular-nums'],
              }}
            >
              {money(data.cashflow.netMinor)}
            </AppText>
            <View
              style={{
                flexDirection: 'row',
                gap: 16,
                borderTopWidth: 1,
                borderTopColor: theme.border,
                paddingTop: 14,
              }}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <AppText tone="muted" style={{ fontSize: 13 }}>
                  ↙ Income
                </AppText>
                <AppText
                  tone="accent"
                  style={{
                    fontFamily: 'DMSansBold',
                    fontSize: 20,
                    lineHeight: 28,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {money(data.cashflow.incomeMinor)}
                </AppText>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <AppText tone="muted" style={{ fontSize: 13 }}>
                  ↗ Expenses
                </AppText>
                <AppText
                  tone="danger"
                  style={{
                    fontFamily: 'DMSansBold',
                    fontSize: 20,
                    lineHeight: 28,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {money(data.cashflow.expensesMinor)}
                </AppText>
              </View>
            </View>
            <AppText tone="muted" style={{ fontSize: 13, lineHeight: 20 }}>
              {data.cashflow.savingsRateBasisPoints === null
                ? 'No income recorded in this period'
                : BigInt(data.cashflow.savingsRateBasisPoints) < 0n
                  ? 'Expenses exceeded income in this period'
                  : `${percentageFromBasisPoints(data.cashflow.savingsRateBasisPoints)} of income saved`}
            </AppText>
          </Card>
          {data.cashflow.incomeMinor === '0' && data.cashflow.expensesMinor === '0' && (
            <Card>
              <AppText style={{ fontFamily: 'DMSansBold' }}>
                Your financial overview starts here.
              </AppText>
              <AppText tone="muted">
                Add income or expenses in Transactions to see your patterns, or choose a different
                period.
              </AppText>
            </Card>
          )}
          <Card>
            <AppText accessibilityRole="header" style={{ fontFamily: 'DMSansBold', fontSize: 20 }}>
              Spending by category
            </AppText>
            <ExpenseDonut categories={data.categories} />
          </Card>
          {data.trends.length > 1 && (
            <Card>
              <AppText
                accessibilityRole="header"
                style={{ fontFamily: 'DMSansBold', fontSize: 20 }}
              >
                Cash flow over time
              </AppText>
              <MonthlyChart trends={data.trends} />
            </Card>
          )}
          <Card>
            <AppText accessibilityRole="header" style={{ fontFamily: 'DMSansBold', fontSize: 20 }}>
              Income categories
            </AppText>
            {data.categories
              .filter((category) => category.type === 'INCOME')
              .map((category) => (
                <View
                  key={category.categoryId}
                  style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText style={{ fontSize: 14 }}>{category.name}</AppText>
                    <AppText tone="muted" style={{ fontSize: 12 }}>
                      {(category.shareBasisPoints / 100).toFixed(2)}% of income
                    </AppText>
                  </View>
                  <AppText tone="accent" style={{ fontFamily: 'DMSansBold' }}>
                    {money(category.amountMinor)}
                  </AppText>
                </View>
              ))}
            {!data.categories.some((category) => category.type === 'INCOME') && (
              <AppText tone="muted">No categorized income for this period.</AppText>
            )}
          </Card>
          <Card>
            <AppText accessibilityRole="header" style={{ fontFamily: 'DMSansBold', fontSize: 20 }}>
              Account breakdown
            </AppText>
            <AccountDistribution accounts={data.accounts} />
          </Card>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="About this report"
            onPress={() => setAboutOpen(true)}
            style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
          >
            <AppText tone="accent" style={{ fontSize: 14 }}>
              About this report ⓘ
            </AppText>
          </Pressable>
        </>
      )}
      <FlowSheet
        title="Custom period"
        visible={customOpen}
        onClose={() => {
          setCustomOpen(false);
          setError('');
        }}
        footer={
          <>
            <AppButton title="Apply dates" onPress={() => apply('custom')} />
            <AppButton
              title="Cancel"
              variant="secondary"
              onPress={() => {
                setCustomOpen(false);
                setError('');
              }}
            />
          </>
        }
      >
        <AppText tone="muted">Choose a start and end date. Both dates are included.</AppText>
        <DateField label="From date" value={from} onChange={setFrom} />
        <DateField label="Through date" value={to} onChange={setTo} />
        {error ? (
          <AppText tone="danger" accessibilityRole="alert">
            {error}
          </AppText>
        ) : null}
      </FlowSheet>
      <FlowSheet title="About this report" visible={aboutOpen} onClose={() => setAboutOpen(false)}>
        <AppText>
          Transfers between your accounts are excluded from income, expenses, and savings rate.
        </AppText>
        <AppText>
          Savings rate = (income − expenses) ÷ income. It is unavailable when no income was
          recorded.
        </AppText>
        {data && (
          <>
            <AppText tone="muted">
              Savings rate:{' '}
              {percentageFromBasisPoints(data.cashflow.savingsRateBasisPoints) ?? 'Unavailable'}
            </AppText>
            <AppText tone="muted">
              Dates include the full start and end days in {data.period.timezone}.
            </AppText>
          </>
        )}
        <AppText tone="muted">
          Monthly bars use the same scale across the selected period. Account bars show each
          positive closing balance as a share of positive balances; negative balances are excluded
          from these bars.
        </AppText>
      </FlowSheet>
    </Screen>
  );
}
