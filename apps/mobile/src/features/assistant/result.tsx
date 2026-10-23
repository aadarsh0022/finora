import type { AssistantToolResult } from '@finora/contracts';
import { formatMoney } from '@finora/finance-core';
import { router } from 'expo-router';
import { View } from 'react-native';
import { AppButton, AppText, Card } from '../../components/ui';
import { useApp } from '../../providers/app-provider';

function Row({
  label,
  value,
  tone = 'text',
}: {
  label: string;
  value: string;
  tone?: 'text' | 'accent' | 'danger';
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12 }}>
      <AppText tone="muted" style={{ flex: 1, fontSize: 14 }}>
        {label}
      </AppText>
      <AppText
        tone={tone}
        style={{ flexShrink: 1, fontFamily: 'DMSansBold', fontVariant: ['tabular-nums'] }}
      >
        {value}
      </AppText>
    </View>
  );
}

export function AssistantResult({ result }: { result: AssistantToolResult }) {
  const { user } = useApp();
  const money = (value: string) =>
    formatMoney(value, result.currency, user?.preferences.locale ?? 'en-IN');
  let content;
  switch (result.name) {
    case 'get_balance':
      content = (
        <>
          <AppText tone="muted">Recorded balance · {result.currency}</AppText>
          <AppText style={{ fontFamily: 'DMSansBold', fontSize: 30, lineHeight: 40 }}>
            {money(result.data.totalBalanceMinor)}
          </AppText>
          {result.data.accounts.slice(0, 5).map((a) => (
            <Row
              key={a.id}
              label={`${a.name}${a.archived ? ' · archived' : ''}`}
              value={money(a.balanceMinor)}
            />
          ))}
          <AppText tone="muted" style={{ fontSize: 12 }}>
            Includes archived accounts. This is recorded money, not a live bank balance or spending
            forecast.
          </AppText>
          <AppButton
            title="View accounts"
            variant="secondary"
            onPress={() => router.push('/accounts')}
          />
        </>
      );
      break;
    case 'get_cashflow':
      content = (
        <>
          <AppText tone="muted">
            {result.data.from} to {result.data.to}
          </AppText>
          <Row label="Income" value={money(result.data.incomeMinor)} tone="accent" />
          <Row label="Expenses" value={money(result.data.expensesMinor)} tone="danger" />
          <Row
            label="Net cash flow"
            value={money(result.data.netMinor)}
            tone={BigInt(result.data.netMinor) < 0n ? 'danger' : 'accent'}
          />
          <AppText tone="muted" style={{ fontSize: 12 }}>
            Transfers and debt principal movements are excluded.
          </AppText>
          <AppButton
            title="Open Insights"
            variant="secondary"
            onPress={() => router.push('/(tabs)/reports')}
          />
        </>
      );
      break;
    case 'get_category_spending':
      content = (
        <>
          <AppText tone="muted">
            {result.data.from} to {result.data.to}
          </AppText>
          <Row label="Total spending" value={money(result.data.totalExpensesMinor)} tone="danger" />
          {result.data.categories.slice(0, 10).map((c) => (
            <Row key={c.categoryId} label={c.name} value={money(c.amountMinor)} />
          ))}
          {!result.data.categories.length && (
            <AppText tone="muted">No expenses recorded for these dates.</AppText>
          )}
          {result.data.categories.length > 10 && (
            <AppText tone="muted">
              Showing the first 10 categories. View the full breakdown in Insights.
            </AppText>
          )}
          <AppButton
            title="Open Insights"
            variant="secondary"
            onPress={() => router.push('/(tabs)/reports')}
          />
        </>
      );
      break;
    case 'get_budget_status':
      content = (
        <>
          <AppText tone="muted">Budget month · {result.data.month}</AppText>
          <Row
            label="Monthly limit"
            value={
              result.data.total.limitMinor === null
                ? 'Not set'
                : money(result.data.total.limitMinor)
            }
          />
          <Row label="Spent" value={money(result.data.total.spentMinor)} tone="danger" />
          {result.data.total.remainingMinor !== null && (
            <Row
              label="Remaining"
              value={money(result.data.total.remainingMinor)}
              tone={BigInt(result.data.total.remainingMinor) < 0n ? 'danger' : 'accent'}
            />
          )}
          {result.data.categories.slice(0, 10).map((c) => (
            <View key={c.categoryId} style={{ gap: 4 }}>
              <Row
                label={c.name}
                value={`${money(c.remainingMinor)} left`}
                tone={BigInt(c.remainingMinor) < 0n ? 'danger' : 'text'}
              />
              <AppText tone="muted" style={{ fontSize: 12 }}>
                {money(c.spentMinor)} spent of {money(c.effectiveLimitMinor)} including rollover
              </AppText>
            </View>
          ))}
          <AppText tone="muted" style={{ fontSize: 12 }}>
            Monthly and category limits are independent. Do not add them together.
          </AppText>
          <AppButton
            title="View budgets"
            variant="secondary"
            onPress={() => router.push({ pathname: '/planning', params: { section: 'budgets' } })}
          />
        </>
      );
      break;
    case 'get_debt_summary':
      content = (
        <>
          <Row label="You owe" value={money(result.data.owedByYouMinor)} tone="danger" />
          <Row
            label="Personal loans owed to you"
            value={money(result.data.personalLoansOwedToYouMinor)}
          />
          <Row label="Expected receipts" value={money(result.data.expectedReceiptsMinor)} />
          <Row
            label="Overdue · you owe"
            value={money(result.data.overdueOwedByYouMinor)}
            tone="danger"
          />
          <Row
            label="Overdue · personal loans owed to you"
            value={money(result.data.overduePersonalLoansOwedToYouMinor)}
          />
          <Row
            label="Overdue · expected receipts"
            value={money(result.data.overdueExpectedReceiptsMinor)}
          />
          <AppText tone="muted" style={{ fontSize: 12 }}>
            Excludes archived, cancelled and settled records. Money owed to you is not available
            cash.
          </AppText>
          <AppButton title="View debts" variant="secondary" onPress={() => router.push('/debts')} />
        </>
      );
      break;
  }
  return (
    <Card style={{ gap: 12 }}>
      {content}
      <AppText tone="muted" style={{ fontSize: 11 }}>
        Recorded online ·{' '}
        {new Date(result.retrievedAt).toLocaleString(user?.preferences.locale, {
          timeZone: result.timezone,
        })}
        . Local unsynced entries are excluded.
      </AppText>
    </Card>
  );
}
