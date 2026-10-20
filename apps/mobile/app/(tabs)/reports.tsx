import { reportRangeSchema, reportSummarySchema, type ReportRange } from '@finora/contracts';
import { calendarDate } from '@finora/finance-core';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Crypto from 'expo-crypto';
import {
  AppButton,
  AppText,
  Card,
  Choice,
  Feedback,
  Field,
  Loading,
  Screen,
} from '../../src/components/ui';
import { useMoney, useRead } from '../../src/features/finance/shared';
import { AccountDistribution, ExpenseDonut, MonthlyChart } from '../../src/features/reports/charts';
import { percentageFromBasisPoints, reportCsv } from '../../src/features/reports/values';
import { useApp } from '../../src/providers/app-provider';

export default function Reports() {
  const { user } = useApp();
  const today = calendarDate(new Date(), user?.preferences.timezone ?? 'Asia/Kolkata');
  const money = useMoney();
  const [range, setRange] = useState<ReportRange['range']>('current-month');
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [queryString, setQueryString] = useState('range=current-month');
  const [error, setError] = useState('');
  const [exportNotice, setExportNotice] = useState('');
  const query = useRead(`reports/summary?${queryString}`, reportSummarySchema);
  const data = query.data;
  function apply(value = range) {
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
    <Screen title="Reports" subtitle="Understand where your money goes.">
      <Card>
        <Choice
          label="Period"
          value={range}
          onChange={(value) => {
            setRange(value);
            if (value !== 'custom') apply(value);
          }}
          options={[
            { value: 'current-month', label: 'Current month' },
            { value: 'previous-month', label: 'Previous month' },
            { value: 'last-3-months', label: 'Last 3 months' },
            { value: 'last-6-months', label: 'Last 6 months' },
            { value: 'custom', label: 'Custom' },
          ]}
        />
        {range === 'custom' && (
          <>
            <Field label="From (YYYY-MM-DD)" value={from} onChangeText={setFrom} maxLength={10} />
            <Field
              label="Through (YYYY-MM-DD, inclusive)"
              value={to}
              onChangeText={setTo}
              maxLength={10}
            />
            <AppButton title="Apply dates" variant="secondary" onPress={() => apply()} />
          </>
        )}
        {error ? (
          <AppText tone="danger" accessibilityRole="alert">
            {error}
          </AppText>
        ) : null}
      </Card>
      {query.isPending && <Loading />}
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
          <AppText tone="muted">
            {data.period.from} through {data.period.to} · {data.period.timezone} ·{' '}
            {data.period.currency}
          </AppText>
          <Card>
            <AppText accessibilityRole="header" style={{ fontFamily: 'DMSansBold', fontSize: 22 }}>
              Income and expenses
            </AppText>
            <AppText>Income</AppText>
            <AppText tone="accent" style={{ fontSize: 28, lineHeight: 36 }}>
              {money(data.cashflow.incomeMinor)}
            </AppText>
            <AppText>Expenses</AppText>
            <AppText style={{ fontSize: 28, lineHeight: 36 }}>
              {money(data.cashflow.expensesMinor)}
            </AppText>
            <AppText style={{ fontFamily: 'DMSansBold' }}>
              Net {money(data.cashflow.netMinor)}
            </AppText>
            <AppText tone="muted">
              {data.cashflow.savingsRateBasisPoints === null
                ? 'Savings rate is unavailable because no income was recorded.'
                : `Savings rate ${percentageFromBasisPoints(data.cashflow.savingsRateBasisPoints)} · (income − expenses) ÷ income`}
            </AppText>
            <AppText tone="muted">
              Transfers between your accounts are excluded from income, expenses, and savings rate.
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
            <AppText accessibilityRole="header" style={{ fontFamily: 'DMSansBold', fontSize: 22 }}>
              Spending by category
            </AppText>
            <ExpenseDonut categories={data.categories} />
          </Card>
          <Card>
            <AppText accessibilityRole="header" style={{ fontFamily: 'DMSansBold', fontSize: 22 }}>
              Income versus expenses over time
            </AppText>
            <MonthlyChart trends={data.trends} />
          </Card>
          <Card>
            <AppText accessibilityRole="header" style={{ fontFamily: 'DMSansBold', fontSize: 22 }}>
              Income categories
            </AppText>
            {data.categories
              .filter((category) => category.type === 'INCOME')
              .map((category) => (
                <AppText key={category.categoryId}>
                  {category.name} · {money(category.amountMinor)} ·{' '}
                  {(category.shareBasisPoints / 100).toFixed(2)}%
                </AppText>
              ))}
            {!data.categories.some((category) => category.type === 'INCOME') && (
              <AppText tone="muted">No categorized income for this period.</AppText>
            )}
          </Card>
          <Card>
            <AppText accessibilityRole="header" style={{ fontFamily: 'DMSansBold', fontSize: 22 }}>
              Account breakdown
            </AppText>
            <AccountDistribution accounts={data.accounts} />
          </Card>
          {exportReport.error && <Feedback error={exportReport.error} />}
          {exportNotice ? (
            <AppText tone="accent" accessibilityRole="alert">
              {exportNotice}
            </AppText>
          ) : null}
          <AppButton
            title="Export this report to CSV"
            loading={exportReport.isPending}
            disabled={query.isFetching}
            onPress={() => exportReport.mutate()}
          />
          <AppButton
            title="Refresh report"
            variant="secondary"
            loading={query.isFetching}
            onPress={() => {
              void query.refetch();
            }}
          />
        </>
      )}
    </Screen>
  );
}
