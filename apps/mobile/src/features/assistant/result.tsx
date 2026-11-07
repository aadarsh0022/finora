import type { AssistantToolResult } from '@finora/contracts';
import { formatMoney } from '@finora/finance-core';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import type { ReactNode } from 'react';
import { AppText, Card } from '../../components/ui';
import { useApp } from '../../providers/app-provider';

function Row({
  label,
  value,
  tone = 'text',
}: {
  label: string;
  value: string;
  tone?: 'text' | 'accent' | 'danger' | 'success';
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

function Link({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={{ minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' }}
    >
      <AppText tone="accent" style={{ fontSize: 13, fontFamily: 'DMSansBold' }}>
        {title} ›
      </AppText>
    </Pressable>
  );
}

export function AssistantResult({
  result,
  actions,
}: {
  result: AssistantToolResult;
  actions?: ReactNode;
}) {
  const { user } = useApp();
  const money = (value: string) =>
    formatMoney(value, result.currency, user?.preferences.locale ?? 'en-IN');
  let content;
  switch (result.name) {
    case 'read_records':
    case 'plan_finances':
      content = (
        <>
          {result.data.facts.map((fact, index) => (
            <AppText key={index}>{fact}</AppText>
          ))}
          {result.data.items.map((item, index) => (
            <View key={item.id ?? index} style={{ gap: 3, paddingVertical: 5 }}>
              <AppText style={{ fontFamily: 'DMSansBold' }}>
                {item.title}
                {item.amountMinor ? ` · ${money(item.amountMinor)}` : ''}
              </AppText>
              <AppText tone="muted" style={{ fontSize: 13 }}>
                {item.detail}
              </AppText>
            </View>
          ))}
        </>
      );
      break;
    case 'get_balance':
      content = (
        <>
          {result.data.accounts.length > 1 &&
            result.data.accounts
              .slice(0, 3)
              .map((a) => (
                <Row
                  key={a.id}
                  label={`${a.name}${a.archived ? ' · archived' : ''}`}
                  value={money(a.balanceMinor)}
                />
              ))}
          <Link title="Accounts" onPress={() => router.push('/accounts')} />
        </>
      );
      break;
    case 'get_cashflow':
      content = (
        <>
          <AppText tone="muted">
            {result.data.from} to {result.data.to}
          </AppText>
          <Row label="Income" value={money(result.data.incomeMinor)} tone="success" />
          <Row label="Expenses" value={money(result.data.expensesMinor)} tone="danger" />
          <Row
            label="Net cash flow"
            value={money(result.data.netMinor)}
            tone={BigInt(result.data.netMinor) < 0n ? 'danger' : 'success'}
          />
          <Link title="Open Insights" onPress={() => router.push('/(tabs)/reports')} />
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
          {result.data.categories.slice(0, 5).map((c) => (
            <Row key={c.categoryId} label={c.name} value={money(c.amountMinor)} />
          ))}
          {!result.data.categories.length && (
            <AppText tone="muted">No expenses recorded for these dates.</AppText>
          )}
          <Link title="Open Insights" onPress={() => router.push('/(tabs)/reports')} />
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
          <Link
            title="View budgets"
            onPress={() => router.push({ pathname: '/planning', params: { section: 'budgets' } })}
          />
        </>
      );
      break;
    case 'get_debt_summary':
      content = (
        <>
          {(
            [
              ['You owe', result.data.owedByYouMinor, 'danger'],
              ['Loans owed to you', result.data.personalLoansOwedToYouMinor, 'text'],
              ['Expected receipts', result.data.expectedReceiptsMinor, 'text'],
              ['Overdue · you owe', result.data.overdueOwedByYouMinor, 'danger'],
              ['Overdue · owed to you', result.data.overduePersonalLoansOwedToYouMinor, 'text'],
              ['Overdue · receipts', result.data.overdueExpectedReceiptsMinor, 'text'],
            ] as const
          )
            .filter(([, value]) => BigInt(value) !== 0n)
            .map(([label, value, tone]) => (
              <Row key={label} label={label} value={money(value)} tone={tone} />
            ))}
          <Link title="Debts" onPress={() => router.push('/debts')} />
        </>
      );
      break;
  }
  // Nothing to show beyond the sentence above, so no empty card.
  const empty =
    ((result.name === 'read_records' || result.name === 'plan_finances') &&
      !result.data.facts.length &&
      !result.data.items.length) ||
    (result.name === 'get_debt_summary' && result.data.openRecordCount === 0) ||
    (result.name === 'get_category_spending' && !result.data.categories.length);
  if (empty && !actions) return null;
  return (
    <View style={{ gap: 6 }}>
      {!empty && <Card style={{ gap: 6, padding: 12, borderRadius: 14 }}>{content}</Card>}
      {actions}
    </View>
  );
}

// Build exact text locally so financial tool results never need another model request.
export function answerText(result: AssistantToolResult, locale = 'en-IN'): string {
  const money = (value: string) => formatMoney(value, result.currency, locale);
  const date = (value: string) => new Date(`${value}T12:00:00Z`);
  const period = (from: string, to: string) => {
    const formatter = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
    return `${formatter.format(date(from))} to ${formatter.format(date(to))}`;
  };
  const month =
    result.name === 'get_budget_status'
      ? new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
          date(`${result.data.month}-01`),
        )
      : '';

  switch (result.name) {
    case 'read_records':
    case 'plan_finances':
      return result.data.summary;
    case 'get_balance':
      return `Your recorded balance is ${money(result.data.totalBalanceMinor)} across ${result.data.accounts.length} ${result.data.accounts.length === 1 ? 'account' : 'accounts'}.`;
    case 'get_cashflow':
      return `From ${period(result.data.from, result.data.to)}, you received ${money(result.data.incomeMinor)} and spent ${money(result.data.expensesMinor)}. Your net cash flow is ${money(result.data.netMinor)}.`;
    case 'get_category_spending': {
      const top = [...result.data.categories].sort((a, b) =>
        BigInt(a.amountMinor) === BigInt(b.amountMinor)
          ? 0
          : BigInt(a.amountMinor) > BigInt(b.amountMinor)
            ? -1
            : 1,
      )[0];
      return `You spent ${money(result.data.totalExpensesMinor)} from ${period(result.data.from, result.data.to)}.${top ? ` Your largest category was ${top.name} at ${money(top.amountMinor)}.` : ''}`;
    }
    case 'get_budget_status':
      return result.data.total.remainingMinor === null
        ? `You spent ${money(result.data.total.spentMinor)} in ${month}. You haven't set an overall monthly budget.`
        : `You spent ${money(result.data.total.spentMinor)} in ${month}. ${BigInt(result.data.total.remainingMinor) < 0n ? `You're ${money((-BigInt(result.data.total.remainingMinor)).toString())} over your monthly budget.` : `You have ${money(result.data.total.remainingMinor)} left in your monthly budget.`}`;
    case 'get_debt_summary':
      return `You owe ${money(result.data.owedByYouMinor)}. Personal loans owed to you total ${money(result.data.personalLoansOwedToYouMinor)}, with ${money(result.data.expectedReceiptsMinor)} in expected receipts.`;
  }
}
