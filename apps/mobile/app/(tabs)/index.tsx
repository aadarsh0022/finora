import { monthSchema, overviewSchema } from '@finora/contracts';
import { calendarDate } from '@finora/finance-core';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  AppButton,
  AppText,
  Card,
  Feedback,
  Field,
  Loading,
  Screen,
} from '../../src/components/ui';
import {
  useRead,
  useMoney,
  TransactionCard,
  categoriesSchema,
  messageSchema,
} from '../../src/features/finance/shared';
import { useApp } from '../../src/providers/app-provider';
import { useTheme } from '../../src/theme';
import { useFinanceMutation } from '../../src/hooks/finance';
import { useUi } from '../../src/stores/ui';

export default function Home() {
  const { user } = useApp();
  const theme = useTheme();
  const money = useMoney();
  const currentMonth = calendarDate(new Date(), user?.preferences.timezone ?? 'Asia/Kolkata').slice(
    0,
    7,
  );
  const [month, setMonth] = useState(currentMonth);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [monthError, setMonthError] = useState('');
  const overview = useRead(`reports/overview?month=${selectedMonth}`, overviewSchema);
  const categories = useRead('categories?includeArchived=true', categoriesSchema);
  const seed = useFinanceMutation('onboarding/categories', messageSchema);
  const hidden = useUi((state) => state.balancesHidden);
  const toggleBalances = useUi((state) => state.toggleBalances);
  useEffect(() => {
    if (categories.data?.length === 0 && seed.status === 'idle') seed.mutate({});
  }, [categories.data, seed.status]);
  const data = overview.data;
  return (
    <Screen
      title={`Hello, ${user?.name.split(' ')[0] ?? 'there'}`}
      subtitle="Make room for what matters."
    >
      {seed.isPending && <AppText tone="muted">Preparing your suggested categories…</AppText>}
      {seed.error && <Feedback error={seed.error} retry={() => seed.mutate({})} />}
      {categories.isError && (
        <Feedback
          error={categories.error}
          retry={() => {
            void categories.refetch();
          }}
        />
      )}
      {overview.isPending && <Loading />}
      {overview.isError && (
        <Feedback
          error={overview.error}
          retry={() => {
            void overview.refetch();
          }}
        />
      )}
      {data && (
        <>
          <Card style={{ backgroundColor: theme.hero, borderColor: theme.hero }}>
            <AppText style={{ color: theme.onHero }}>Total balance · {data.currency}</AppText>
            <AppText
              style={{
                color: theme.onHero,
                fontSize: 36,
                lineHeight: 44,
                fontFamily: 'DMSansBold',
              }}
            >
              {hidden ? '••••••' : money(data.totalBalanceMinor)}
            </AppText>
            <AppText style={{ color: theme.onHero }}>
              Across {data.accounts.length} accounts
            </AppText>
          </Card>
          <AppButton
            title={hidden ? 'Show total balance' : 'Hide total balance'}
            variant="secondary"
            onPress={toggleBalances}
          />
          <AppButton title="Add a transaction" onPress={() => router.push('/transaction')} />
          <AppButton
            title="Manage accounts"
            variant="secondary"
            onPress={() => router.push('/accounts')}
          />
          <Card>
            <Field
              label="Report month (YYYY-MM)"
              value={month}
              onChangeText={setMonth}
              maxLength={7}
              error={monthError}
            />
            <AppButton
              title="View monthly report"
              variant="secondary"
              onPress={() => {
                const parsed = monthSchema.safeParse(month);
                if (parsed.success) {
                  setSelectedMonth(parsed.data);
                  setMonthError('');
                } else setMonthError('Choose a month as YYYY-MM.');
              }}
            />
          </Card>
          <AppText accessibilityRole="header" style={{ fontFamily: 'DMSansBold', fontSize: 22 }}>
            Monthly summary · {data.month}
          </AppText>
          <Card>
            <AppText>Income</AppText>
            <AppText tone="accent" style={{ fontSize: 26 }}>
              {money(data.incomeMinor)}
            </AppText>
            <AppText>Expenses</AppText>
            <AppText style={{ fontSize: 26 }}>{money(data.expensesMinor)}</AppText>
            <AppText tone="muted">
              Net {money(data.netMinor)} ·{' '}
              {data.savingsRateBasisPoints === null
                ? 'Add income to see your savings rate'
                : `${(data.savingsRateBasisPoints / 100).toFixed(1)}% savings rate`}
            </AppText>
          </Card>
          {!data.accounts.length && (
            <Card>
              <AppText style={{ fontFamily: 'DMSansBold' }}>Start with your first account</AppText>
              <AppText tone="muted">
                Add cash, a bank account, or a wallet to begin tracking.
              </AppText>
              <AppButton title="Create account" onPress={() => router.push('/account')} />
            </Card>
          )}
          <AppText accessibilityRole="header" style={{ fontFamily: 'DMSansBold', fontSize: 22 }}>
            Spending by category
          </AppText>
          {Object.entries(data.categorySpending).length ? (
            Object.entries(data.categorySpending).map(([id, amount]) => (
              <Card key={id}>
                <AppText>
                  {categories.data?.find((item) => item.id === id)?.name ?? 'Category'}
                </AppText>
                <AppText style={{ fontSize: 22 }}>{money(amount)}</AppText>
              </Card>
            ))
          ) : (
            <AppText tone="muted">No expenses in this month.</AppText>
          )}
          <AppText accessibilityRole="header" style={{ fontFamily: 'DMSansBold', fontSize: 22 }}>
            Recent activity
          </AppText>
          {data.recentTransactions.length ? (
            data.recentTransactions.map((item) => (
              <TransactionCard
                key={item.id}
                item={item}
                accountName={data.accounts.find((account) => account.id === item.accountId)?.name}
                categoryName={
                  categories.data?.find((category) => category.id === item.categoryId)?.name
                }
              />
            ))
          ) : (
            <AppText tone="muted">Your transactions will appear here.</AppText>
          )}
          <AppButton
            title="Refresh dashboard"
            variant="secondary"
            loading={overview.isFetching}
            onPress={() => {
              void overview.refetch();
            }}
          />
        </>
      )}
    </Screen>
  );
}
