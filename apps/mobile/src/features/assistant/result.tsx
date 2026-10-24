import type { AssistantToolResult } from '@finora/contracts';
import { formatMoney } from '@finora/finance-core';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useState, type ReactNode } from 'react';
import { AppButton, AppText, Card } from '../../components/ui';
import { useApp } from '../../providers/app-provider';
import { useTheme } from '../../theme';
import { Icon } from '../../components/design';

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

export function AssistantResult({
  result,
  actions,
}: {
  result: AssistantToolResult;
  actions?: ReactNode;
}) {
  const { user } = useApp();
  const [expanded, setExpanded] = useState(false);
  const theme = useTheme();
  const money = (value: string) =>
    formatMoney(value, result.currency, user?.preferences.locale ?? 'en-IN');
  let content;
  switch (result.name) {
    case 'get_balance':
      content = (
        <>
          <Row
            label={`Balance � ${result.currency}`}
            value={money(result.data.totalBalanceMinor)}
          />
          {result.data.accounts.slice(0, 5).map((a) => (
            <Pressable
              key={a.id}
              accessibilityRole="button"
              accessibilityLabel={`View ${a.name} account`}
              onPress={() => router.push({ pathname: '/account', params: { id: a.id } })}
              style={{
                padding: 14,
                borderRadius: 17,
                backgroundColor: theme.surface,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <Icon name="wallet" color={theme.text} />
              <View style={{ flex: 1 }}>
                <Row
                  key={a.id}
                  label={`${a.name}${a.archived ? ' · archived' : ''}`}
                  value={money(a.balanceMinor)}
                />
              </View>
              <Icon name="chevron" size={16} />
            </Pressable>
          ))}
          <AppButton
            title="View accounts"
            trailingIcon={<Icon name="chevron" color={theme.onAccent} />}
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
    <View style={{ gap: 4 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 4,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Hide answer details' : 'Show answer details'}
          accessibilityState={{ expanded }}
          onPress={() => setExpanded(!expanded)}
          style={{
            minHeight: 44,
            justifyContent: 'center',
            alignSelf: 'flex-start',
            paddingHorizontal: 8,
          }}
        >
          <AppText tone="accent" style={{ fontSize: 13 }}>
            {expanded ? 'Hide details' : 'View details'}
          </AppText>
        </Pressable>
        {actions}
      </View>
      {expanded && (
        <Card style={{ gap: 10, padding: 14, borderRadius: 16 }}>
          {content}
          <AppText tone="muted" style={{ fontSize: 11 }}>
            As of{' '}
            {new Date(result.retrievedAt).toLocaleString(user?.preferences.locale, {
              timeZone: result.timezone,
            })}
            {result.name === 'get_balance'
              ? '. Includes archived accounts. Recorded money, not a live bank balance.'
              : ''}
          </AppText>
        </Card>
      )}
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
