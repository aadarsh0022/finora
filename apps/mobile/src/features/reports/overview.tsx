import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { z } from 'zod';
import {
  budgetStatusSchema,
  goalProgressSchema,
  recurringOccurrenceSchema,
  recurringRuleSchema,
  reportSummarySchema,
  transactionPageSchema,
  type ReportSummary,
} from '@finora/contracts';
import { calendarDate, nextOccurrence } from '@finora/finance-core';
import { AppText, Card, Feedback, Loading } from '../../components/ui';
import { Icon, type IconName } from '../../components/design';
import { useTheme } from '../../theme';
import { useApp } from '../../providers/app-provider';
import { categoriesSchema, useMoney, useRead } from '../finance/shared';
import { activityQuery, emptyActivityFilters } from '../finance/filters';
import { chartRatio } from './values';
import { SpendingPulse } from '../finance/spending-pulse';
import { comparisonPeriod, percentChange } from './comparison';

const colors = ['#00845D', '#28A77C', '#63C39D', '#A0DCBD', '#A7ABB5'];
function Heading({
  title,
  subtitle,
  icon,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: IconName;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          backgroundColor: theme.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} color={theme.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText style={{ fontFamily: 'DMSansBold', fontSize: 16 }}>{title}</AppText>
        <AppText tone="muted" style={{ fontSize: 12, lineHeight: 18 }}>
          {subtitle}
        </AppText>
      </View>
      <Icon name="chevron" size={18} />
    </Pressable>
  );
}
/** Percentage change against the previous period; hidden until that period has loaded. */
function ChangeNote({
  current,
  previous,
  label,
  higherIsBetter,
}: {
  current: string;
  previous: string | undefined;
  label: string;
  higherIsBetter: boolean;
}) {
  const theme = useTheme();
  if (previous === undefined) return null;
  const change = percentChange(current, previous);
  if (change.kind === 'none') return null;
  if (change.kind === 'new' || change.kind === 'flat')
    return (
      <AppText tone="muted" style={{ fontSize: 11, lineHeight: 16 }}>
        {change.kind === 'new' ? `Nothing recorded ${label}` : `No change vs ${label}`}
      </AppText>
    );
  const color = (change.kind === 'up') === higherIsBetter ? theme.success : theme.danger;
  return (
    <View
      accessible
      accessibilityLabel={`${change.kind === 'up' ? 'Up' : 'Down'} ${change.text} compared with ${label}`}
      style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}
    >
      <Icon name={change.kind === 'up' ? 'trendUp' : 'trendDown'} size={14} color={color} />
      <AppText style={{ color, fontSize: 12, lineHeight: 16, fontFamily: 'DMSansBold' }}>
        {change.text}
      </AppText>
      <AppText tone="muted" style={{ fontSize: 11, lineHeight: 16 }}>
        vs {label}
      </AppText>
    </View>
  );
}
function Progress({ amount, target }: { amount: string; target: string }) {
  const theme = useTheme();
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.border, overflow: 'hidden' }}>
      <View
        style={{
          width: `${Math.min(100, Math.max(0, chartRatio(amount, target) * 100))}%`,
          height: 6,
          borderRadius: 3,
          backgroundColor: theme.accent,
        }}
      />
    </View>
  );
}
export function InsightsOverview({
  data,
  onDetails,
}: {
  data: ReportSummary;
  onDetails: () => void;
}) {
  const theme = useTheme();
  const { user } = useApp();
  const money = useMoney();
  const month = data.period.from.slice(0, 7);
  const singleMonth = month === data.period.to.slice(0, 7);
  const categories = useRead('categories?includeArchived=true', categoriesSchema);
  const budgets = useRead(`budgets?month=${month}`, z.array(budgetStatusSchema), singleMonth);
  const goals = useRead('goals', z.array(goalProgressSchema));
  const rules = useRead('recurring', z.array(recurringRuleSchema));
  const occurrences = useRead(
    'recurring-occurrences?status=PENDING',
    z.array(recurringOccurrenceSchema),
  );
  const comparison = comparisonPeriod(data.period, calendarDate(new Date(), data.period.timezone));
  const previous = useRead(
    comparison
      ? `reports/summary?range=custom&from=${comparison.from}&to=${comparison.to}`
      : 'reports/summary?range=current-month',
    reportSummarySchema,
    !!comparison,
  );
  const earlier = comparison ? previous.data?.cashflow : undefined;
  const countPath = (type: 'INCOME' | 'EXPENSE') =>
    `transactions?${activityQuery({ ...emptyActivityFilters, type, from: data.period.from, to: data.period.to }, data.period.currency, data.period.timezone)}&page=1&pageSize=1`;
  const incomeCount = useRead(countPath('INCOME'), transactionPageSchema);
  const expenseCount = useRead(countPath('EXPENSE'), transactionPageSchema);
  const expenses = data.categories
    .filter((item) => item.type === 'EXPENSE' && BigInt(item.amountMinor) > 0n)
    .sort((a, b) =>
      BigInt(a.amountMinor) === BigInt(b.amountMinor)
        ? 0
        : BigInt(a.amountMinor) > BigInt(b.amountMinor)
          ? -1
          : 1,
    );
  const total = expenses.reduce((sum, item) => sum + BigInt(item.amountMinor), 0n).toString();
  const displayed =
    expenses.length <= 5
      ? expenses
      : [
          ...expenses.slice(0, 4),
          {
            categoryId: 'others',
            name: 'Others',
            type: 'EXPENSE' as const,
            amountMinor: expenses
              .slice(4)
              .reduce((sum, item) => sum + BigInt(item.amountMinor), 0n)
              .toString(),
            shareBasisPoints: expenses
              .slice(4)
              .reduce((sum, item) => sum + item.shareBasisPoints, 0),
          },
        ];
  let offset = 0;
  const dateLabel = (value: string) =>
    new Intl.DateTimeFormat(user?.preferences.locale ?? 'en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${value}T12:00:00Z`));
  const today = calendarDate(new Date(), data.period.timezone);
  const due = new Map<string, { name: string; date: string; amount?: string }>();
  for (const item of occurrences.data ?? [])
    if (item.type === 'EXPENSE')
      due.set(`${item.ruleId}:${item.dueDate}`, {
        name: rules.data?.find((rule) => rule.id === item.ruleId)?.name ?? 'Scheduled payment',
        date: item.dueDate,
        amount: item.amountMinor,
      });
  for (const rule of rules.data ?? []) {
    if (rule.type !== 'EXPENSE' || rule.paused) continue;
    const date = nextOccurrence(rule.startDate, rule.frequency, rule.nextIndex);
    if (!rule.endDate || date <= rule.endDate)
      due.set(`${rule.id}:${date}`, { name: rule.name, date, amount: rule.amountMinor });
  }
  return (
    <>
      <Card style={{ padding: 18, gap: 20 }}>
        <Heading
          title={singleMonth ? 'Monthly summary' : 'Period summary'}
          subtitle={`${dateLabel(data.period.from)} to ${dateLabel(data.period.to)}`}
          icon="chart"
          onPress={onDetails}
        />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {(
            [
              ['Income', data.cashflow.incomeMinor, incomeCount.data?.total, false],
              ['Expenses', data.cashflow.expensesMinor, expenseCount.data?.total, true],
            ] as const
          ).map(([title, value, count, expense]) => (
            <View
              key={title}
              style={{
                flex: 1,
                gap: 10,
                padding: 14,
                borderRadius: 18,
                backgroundColor: expense ? theme.dangerSoft : theme.successSoft,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: theme.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon
                    name={expense ? 'expense' : 'income'}
                    color={expense ? theme.danger : theme.success}
                    size={16}
                  />
                </View>
                <AppText tone="muted" style={{ fontSize: 12 }}>
                  {title}
                </AppText>
              </View>
              <AppText
                tone={expense ? 'danger' : 'success'}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                style={{
                  fontSize: 22,
                  lineHeight: 28,
                  fontFamily: 'DMSansBold',
                  fontVariant: ['tabular-nums'],
                }}
              >
                {money(value)}
              </AppText>
              {count !== undefined && (
                <AppText tone="muted" style={{ fontSize: 11, lineHeight: 16 }}>
                  {count} {count === 1 ? 'transaction' : 'transactions'}
                </AppText>
              )}
              {comparison && (
                <ChangeNote
                  current={value}
                  previous={expense ? earlier?.expensesMinor : earlier?.incomeMinor}
                  label={comparison.label}
                  higherIsBetter={!expense}
                />
              )}
            </View>
          ))}
        </View>
        {BigInt(data.cashflow.incomeMinor) > 0n && (
          <View style={{ gap: 8 }}>
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
                  width: `${Math.min(100, chartRatio(data.cashflow.expensesMinor, data.cashflow.incomeMinor) * 100)}%`,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: theme.danger,
                }}
              />
            </View>
            <AppText tone="muted" style={{ fontSize: 12 }}>
              {BigInt(data.cashflow.expensesMinor) > BigInt(data.cashflow.incomeMinor)
                ? 'Spending is above your income this period'
                : `Spent ${Math.round(chartRatio(data.cashflow.expensesMinor, data.cashflow.incomeMinor) * 100)}% of your income`}
            </AppText>
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View net cash flow"
          onPress={onDetails}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            backgroundColor: theme.background,
            borderRadius: 16,
            paddingVertical: 14,
            paddingHorizontal: 16,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <AppText style={{ fontSize: 14 }}>Net cash flow</AppText>
            {comparison && (
              <ChangeNote
                current={data.cashflow.netMinor}
                previous={earlier?.netMinor}
                label={comparison.label}
                higherIsBetter
              />
            )}
          </View>
          <AppText
            tone={BigInt(data.cashflow.netMinor) < 0n ? 'danger' : 'success'}
            style={{ fontFamily: 'DMSansBold', fontSize: 18, fontVariant: ['tabular-nums'] }}
          >
            {money(data.cashflow.netMinor)}
          </AppText>
          <Icon name="chevron" size={16} />
        </Pressable>
      </Card>
      <SpendingPulse />
      <Card style={{ padding: 18, gap: 16 }}>
        <Heading
          title="Spending overview"
          subtitle="Where your money went"
          icon="plan"
          onPress={onDetails}
        />
        {displayed.length ? (
          <View style={{ gap: 16 }}>
            <View
              style={{ alignItems: 'center' }}
              accessible
              accessibilityRole="image"
              accessibilityLabel={`Total spent ${money(total)}`}
            >
              <Svg width={180} height={180} viewBox="0 0 160 160" accessible={false}>
                <Circle cx={80} cy={80} r={62} fill="none" stroke={theme.border} strokeWidth={23} />
                {displayed.map((item, index) => {
                  const length = chartRatio(item.amountMinor, total) * 2 * Math.PI * 62;
                  const start = offset;
                  offset += length;
                  return (
                    <Circle
                      key={item.categoryId}
                      cx={80}
                      cy={80}
                      r={62}
                      fill="none"
                      stroke={colors[index]}
                      strokeWidth={23}
                      strokeDasharray={[
                        Math.max(0, length - 1),
                        2 * Math.PI * 62 - Math.max(0, length - 1),
                      ]}
                      strokeDashoffset={-start}
                      rotation={-90}
                      origin="80, 80"
                    />
                  );
                })}
                <SvgText
                  x={80}
                  y={78}
                  textAnchor="middle"
                  fontSize={14}
                  fontWeight="bold"
                  fill={theme.text}
                >
                  {money(total).replace(/\.00$/, '')}
                </SvgText>
                <SvgText x={80} y={97} textAnchor="middle" fontSize={10} fill={theme.muted}>
                  Total spent
                </SvgText>
              </Svg>
            </View>
            <View style={{ flex: 1, gap: 12 }}>
              {displayed.map((item, index) => (
                <View
                  key={item.categoryId}
                  style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}
                >
                  <View
                    style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors[index] }}
                  />
                  <AppText numberOfLines={1} style={{ fontSize: 13, lineHeight: 20, flex: 1 }}>
                    {item.name}
                  </AppText>
                  <AppText style={{ fontSize: 13, lineHeight: 20, fontFamily: 'DMSansBold' }}>
                    {money(item.amountMinor)}
                  </AppText>
                  <AppText tone="muted" style={{ fontSize: 13, lineHeight: 20 }}>
                    {Math.round(item.shareBasisPoints / 100)}%
                  </AppText>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <AppText tone="muted" style={{ fontSize: 13 }}>
            Your spending will appear after you record an expense.
          </AppText>
        )}
      </Card>
      {singleMonth && (
        <Card style={{ padding: 14 }}>
          <Heading
            title="Budget vs spending"
            subtitle="Track your budget progress"
            icon="goal"
            onPress={() => router.push({ pathname: '/planning', params: { section: 'budgets' } })}
          />
          {budgets.isPending && <Loading variant="bars" />}
          {budgets.error && (
            <Feedback
              error={budgets.error}
              retry={() => {
                void budgets.refetch();
              }}
            />
          )}
          {budgets.data?.slice(0, 4).map((budget) => (
            <View key={budget.id} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <AppText style={{ fontSize: 12, flex: 1 }}>
                  {categories.data?.find((category) => category.id === budget.categoryId)?.name ??
                    'Expense category'}
                </AppText>
                <AppText style={{ fontSize: 12 }}>
                  {money(budget.spentMinor)}{' '}
                  <AppText tone="muted" style={{ fontSize: 11 }}>
                    / {money(budget.effectiveLimitMinor ?? budget.amountMinor)}
                  </AppText>
                </AppText>
              </View>
              <Progress
                amount={budget.spentMinor}
                target={budget.effectiveLimitMinor ?? budget.amountMinor}
              />
            </View>
          ))}
          {budgets.data?.length === 0 && (
            <AppText tone="muted" style={{ fontSize: 13 }}>
              Create a monthly budget to track your progress.
            </AppText>
          )}
        </Card>
      )}
      <Card style={{ padding: 14 }}>
        <Heading
          title="Upcoming payments"
          subtitle="Never miss a payment"
          icon="calendar"
          onPress={() => router.push({ pathname: '/planning', params: { section: 'recurring' } })}
        />
        {(rules.error || occurrences.error) && (
          <Feedback
            error={rules.error ?? occurrences.error}
            retry={() => {
              void rules.refetch();
              void occurrences.refetch();
            }}
          />
        )}
        {[...due.values()]
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(0, 3)
          .map((item, index) => {
            const days = Math.round(
              (Date.parse(`${item.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000,
            );
            return (
              <View
                key={`${item.name}:${item.date}:${index}`}
                style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}
              >
                <Icon name="wallet" size={19} />
                <View style={{ flex: 1 }}>
                  <AppText style={{ fontSize: 13, fontFamily: 'DMSansBold' }}>{item.name}</AppText>
                  <AppText tone="muted" style={{ fontSize: 11 }}>
                    {dateLabel(item.date)}
                  </AppText>
                </View>
                <AppText style={{ fontSize: 12, fontFamily: 'DMSansBold' }}>
                  {item.amount ? money(item.amount) : 'Variable'}
                </AppText>
                <AppText
                  tone="danger"
                  style={{
                    fontSize: 10,
                    padding: 5,
                    borderRadius: 8,
                    backgroundColor: theme.dangerSoft,
                  }}
                >
                  {days < 0 ? 'Overdue' : days === 0 ? 'Today' : `In ${days} days`}
                </AppText>
              </View>
            );
          })}
        {!due.size &&
          !rules.isPending &&
          !occurrences.isPending &&
          !rules.error &&
          !occurrences.error && (
            <AppText tone="muted" style={{ fontSize: 13 }}>
              Add a recurring payment to see what’s next.
            </AppText>
          )}
      </Card>
      <Card style={{ padding: 14 }}>
        <Heading
          title="Savings goal"
          subtitle="Track your progress"
          icon="goal"
          onPress={() => router.push({ pathname: '/planning', params: { section: 'goals' } })}
        />
        {goals.error && (
          <Feedback
            error={goals.error}
            retry={() => {
              void goals.refetch();
            }}
          />
        )}
        {goals.data
          ?.filter((goal) => !goal.archived)
          .slice(0, 3)
          .map((goal) => (
            <View key={goal.id} style={{ gap: 5 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <View>
                  <AppText style={{ fontSize: 13, fontFamily: 'DMSansBold' }}>{goal.name}</AppText>
                  <AppText tone="muted" style={{ fontSize: 10 }}>
                    {money(goal.savedMinor)} / {money(goal.targetMinor)}
                  </AppText>
                </View>
                <AppText style={{ fontSize: 12, fontFamily: 'DMSansBold' }}>
                  {Math.floor(
                    Math.min(1, Math.max(0, chartRatio(goal.savedMinor, goal.targetMinor))) * 100,
                  )}
                  %
                </AppText>
              </View>
              <Progress amount={goal.savedMinor} target={goal.targetMinor} />
            </View>
          ))}
        {goals.data?.filter((goal) => !goal.archived).length === 0 && (
          <AppText tone="muted" style={{ fontSize: 13 }}>
            Create your first savings goal.
          </AppText>
        )}
      </Card>
    </>
  );
}
