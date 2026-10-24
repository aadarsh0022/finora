import type { ReactNode } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { z } from 'zod';
import {
  budgetStatusSchema,
  goalProgressSchema,
  recurringOccurrenceSchema,
  recurringRuleSchema,
  type Category,
  type Overview,
} from '@finora/contracts';
import { AppText, Card, Feedback } from '../../components/ui';
import { SectionHeading } from '../../components/design';
import { useTheme } from '../../theme';
import { useRead } from './shared';
import { chartRatio } from '../reports/values';

function Section({
  title,
  section,
  children,
}: {
  title: string;
  section: 'budgets' | 'goals' | 'recurring';
  children: ReactNode;
}) {
  return (
    <Card style={{ padding: 16, gap: 14 }}>
      <SectionHeading
        title={title}
        action="View all"
        actionLabel={`View ${title.toLowerCase()}`}
        onPress={() => router.push({ pathname: '/planning', params: { section } })}
      />
      {children}
    </Card>
  );
}
function Meter({ value, target, hidden }: { value: string; target: string; hidden: boolean }) {
  const theme = useTheme();
  if (hidden) return null;
  const ratio = chartRatio(BigInt(value) < 0n ? '0' : value, BigInt(target) < 0n ? '0' : target);
  return (
    <View style={{ height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: theme.border }}>
      <View
        style={{
          height: 6,
          width: `${ratio * 100}%`,
          borderRadius: 3,
          backgroundColor: BigInt(value) > BigInt(target) ? theme.danger : theme.accent,
        }}
      />
    </View>
  );
}
function Pending({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} style={{ gap: 10 }}>
      <View style={{ width: '45%', height: 12, backgroundColor: theme.border, borderRadius: 4 }} />
      <View style={{ height: 6, backgroundColor: theme.border, borderRadius: 3 }} />
    </View>
  );
}
export function HomeDetails({
  data,
  categories,
  amount,
  hidden,
}: {
  data: Overview;
  categories: Category[];
  amount: (value: string) => string;
  hidden: boolean;
}) {
  const theme = useTheme();
  const budgets = useRead(`budgets?month=${data.month}`, z.array(budgetStatusSchema));
  const goals = useRead('goals', z.array(goalProgressSchema));
  const payments = useRead(
    'recurring-occurrences?status=PENDING',
    z.array(recurringOccurrenceSchema),
  );
  const rules = useRead('recurring', z.array(recurringRuleSchema));
  const spending = Object.entries(data.categorySpending)
    .filter(([, value]) => BigInt(value) > 0n)
    .sort((a, b) => (BigInt(a[1]) === BigInt(b[1]) ? 0 : BigInt(a[1]) > BigInt(b[1]) ? -1 : 1))
    .slice(0, 3);
  const activeGoals = goals.data?.filter((goal) => !goal.archived);
  const due = payments.data
    ?.filter((item) => item.type === 'EXPENSE')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const date = (value: string) =>
    new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${value}T12:00:00Z`));
  return (
    <>
      <Card style={{ padding: 16, gap: 14 }}>
        <SectionHeading
          title="Top spending"
          action="Insights"
          actionLabel="Explore spending breakdown"
          onPress={() => router.push('/(tabs)/reports')}
        />
        {spending.map(([id, value]) => (
          <View key={id} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <AppText style={{ flex: 1, fontSize: 14 }}>
                {categories.find((item) => item.id === id)?.name ?? 'Expense category'}
              </AppText>
              <AppText style={{ fontSize: 14, fontFamily: 'DMSansBold' }}>{amount(value)}</AppText>
            </View>
            <Meter value={value} target={data.expensesMinor} hidden={hidden} />
          </View>
        ))}
        {!spending.length && (
          <AppText tone="muted" style={{ fontSize: 13 }}>
            Your top categories will appear as you record expenses.
          </AppText>
        )}
      </Card>
      <Section title="Budget progress" section="budgets">
        {budgets.isPending && <Pending label="Loading budget progress" />}
        {budgets.error && (
          <Feedback
            error={budgets.error}
            retry={() => {
              void budgets.refetch();
            }}
          />
        )}
        {budgets.data?.slice(0, 3).map((item) => (
          <View key={item.id} style={{ gap: 8 }}>
            <AppText style={{ fontSize: 14 }}>
              {categories.find((category) => category.id === item.categoryId)?.name ??
                'Expense category'}
            </AppText>
            <AppText tone={item.overBudget ? 'danger' : 'muted'} style={{ fontSize: 12 }}>
              {amount(item.spentMinor)} of {amount(item.effectiveLimitMinor ?? item.amountMinor)}
            </AppText>
            <Meter
              value={item.spentMinor}
              target={item.effectiveLimitMinor ?? item.amountMinor}
              hidden={hidden}
            />
          </View>
        ))}
        {budgets.data?.length === 0 && (
          <AppText tone="muted" style={{ fontSize: 13 }}>
            Give your spending a plan. Set a budget for this month.
          </AppText>
        )}
      </Section>
      <Section title="Payments to review" section="recurring">
        {(payments.isPending || rules.isPending) && <Pending label="Loading payments" />}
        {(payments.error || rules.error) && (
          <Feedback
            error={payments.error ?? rules.error}
            retry={() => {
              void payments.refetch();
              void rules.refetch();
            }}
          />
        )}
        {due?.slice(0, 3).map((item) => (
          <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <AppText style={{ fontSize: 14 }}>
                {rules.data?.find((rule) => rule.id === item.ruleId)?.name ?? 'Scheduled payment'}
              </AppText>
              <AppText tone="muted" style={{ fontSize: 12 }}>
                Due {date(item.dueDate)}
              </AppText>
            </View>
            <AppText style={{ fontSize: 14, fontFamily: 'DMSansBold' }}>
              {item.amountMinor ? amount(item.amountMinor) : 'Variable'}
            </AppText>
          </View>
        ))}
        {due?.length === 0 && (
          <AppText tone="muted" style={{ fontSize: 13 }}>
            No payments awaiting confirmation.
          </AppText>
        )}
      </Section>
      <Section title="Savings goals" section="goals">
        {goals.isPending && <Pending label="Loading savings goals" />}
        {goals.error && (
          <Feedback
            error={goals.error}
            retry={() => {
              void goals.refetch();
            }}
          />
        )}
        {activeGoals?.slice(0, 3).map((goal) => (
          <View key={goal.id} style={{ gap: 8 }}>
            <AppText style={{ fontSize: 14 }}>{goal.name}</AppText>
            <AppText tone="muted" style={{ fontSize: 12 }}>
              {amount(goal.savedMinor)} saved of {amount(goal.targetMinor)}
            </AppText>
            <Meter value={goal.savedMinor} target={goal.targetMinor} hidden={hidden} />
          </View>
        ))}
        {activeGoals?.length === 0 && (
          <AppText tone="muted" style={{ fontSize: 13 }}>
            Start a goal for something that matters to you.
          </AppText>
        )}
      </Section>
      <Card style={{ backgroundColor: theme.accentSoft, borderWidth: 0 }}>
        <SectionHeading
          title="Your weekly check-in"
          action="Start"
          actionLabel="Start weekly check-in"
          onPress={() => router.push('/weekly-review')}
        />
        <AppText tone="muted" style={{ fontSize: 13 }}>
          Review recent activity and look at the week ahead.
        </AppText>
      </Card>
    </>
  );
}
