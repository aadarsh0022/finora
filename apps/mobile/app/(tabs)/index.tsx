import { overviewSchema } from '@finora/contracts';
import { calendarDate } from '@finora/finance-core';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { AppButton, AppText, Card, Feedback, Loading, Screen } from '../../src/components/ui';
import { MonthPicker } from '../../src/components/flow';
import {
  useRead,
  useMoney,
  TransactionCard,
  categoriesSchema,
  messageSchema,
  SavedDataNotice,
} from '../../src/features/finance/shared';
import { useApp } from '../../src/providers/app-provider';
import { useTheme } from '../../src/theme';
import { useFinanceMutation } from '../../src/hooks/finance';
import { useUi } from '../../src/stores/ui';
import { DebtSummary } from '../../src/features/planning/debt-summary';

export default function Home() {
  const { user } = useApp();
  const theme = useTheme();
  const money = useMoney();
  const currentMonth = calendarDate(new Date(), user?.preferences.timezone ?? 'Asia/Kolkata').slice(
    0,
    7,
  );
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const overview = useRead(`reports/overview?month=${selectedMonth}`, overviewSchema);
  const categories = useRead('categories?includeArchived=true', categoriesSchema);
  const seed = useFinanceMutation('onboarding/categories', messageSchema);
  const hidden = useUi((state) => state.balancesHidden);
  const toggleBalances = useUi((state) => state.toggleBalances);
  useEffect(() => {
    if (categories.data?.length === 0 && seed.status === 'idle') seed.mutate({});
  }, [categories.data, seed.status]);
  const data = overview.data;
  const spending = Object.entries(data?.categorySpending ?? {}).sort(([, left], [, right]) =>
    BigInt(left) === BigInt(right) ? 0 : BigInt(left) > BigInt(right) ? -1 : 1,
  );
  const totalSpending = spending.reduce((sum, [, amount]) => sum + BigInt(amount), 0n);
  return (
    <Screen
      title={`Hello, ${user?.name.split(' ')[0] ?? 'there'}`}
      subtitle="Make room for what matters."
      onRefresh={() => Promise.all([overview.refetch(), categories.refetch()])}
    >
      <SavedDataNotice at={overview.cachedAt} />
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
      {overview.isPending && <Loading variant="dashboard" />}
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <AppText style={{ color: theme.onHero, flex: 1, fontSize: 14 }}>
                Total balance · {data.currency}
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={hidden ? 'Show total balance' : 'Hide total balance'}
                onPress={toggleBalances}
                style={({ pressed }) => ({
                  width: 48,
                  height: 48,
                  marginVertical: -10,
                  marginRight: -8,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Svg width={22} height={22} viewBox="0 0 24 24" accessible={false}>
                  <Path
                    d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6"
                    stroke={theme.onHero}
                    strokeWidth={1.7}
                    fill="none"
                  />
                  {hidden && <Path d="m3 3 18 18" stroke={theme.onHero} strokeWidth={1.7} />}
                </Svg>
              </Pressable>
            </View>
            <AppText
              style={{
                color: theme.onHero,
                fontSize: 36,
                lineHeight: 44,
                fontFamily: 'DMSansBold',
                fontVariant: ['tabular-nums'],
              }}
            >
              {hidden ? '••••••' : money(data.totalBalanceMinor)}
            </AppText>
            <AppText style={{ color: theme.onHero, fontSize: 13 }}>
              Across {data.accounts.length} {data.accounts.length === 1 ? 'account' : 'accounts'}
            </AppText>
          </Card>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1.5 }}>
              <AppButton title="Add a transaction" onPress={() => router.push('/transaction')} />
            </View>
            <View style={{ flex: 1 }}>
              <AppButton
                title="Accounts"
                variant="secondary"
                onPress={() => router.push('/accounts')}
              />
            </View>
          </View>
          <View style={{ gap: 12 }}>
            <AppText accessibilityRole="header" style={{ fontFamily: 'DMSansBold', fontSize: 20 }}>
              Monthly overview
            </AppText>
            <MonthPicker value={selectedMonth} onChange={setSelectedMonth} label="report month" />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Card style={{ flex: 1, padding: 14, gap: 6 }}>
                <AppText tone="muted" style={{ fontSize: 13 }}>
                  ↙ Income
                </AppText>
                <AppText
                  tone="accent"
                  style={{
                    fontSize: 22,
                    lineHeight: 28,
                    fontFamily: 'DMSansBold',
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {money(data.incomeMinor)}
                </AppText>
              </Card>
              <Card style={{ flex: 1, padding: 14, gap: 6 }}>
                <AppText tone="muted" style={{ fontSize: 13 }}>
                  ↗ Expenses
                </AppText>
                <AppText
                  tone="danger"
                  style={{
                    fontSize: 22,
                    lineHeight: 28,
                    fontFamily: 'DMSansBold',
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {money(data.expensesMinor)}
                </AppText>
              </Card>
            </View>
            <View style={{ gap: 4, paddingHorizontal: 2 }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <AppText tone="muted" style={{ fontSize: 14 }}>
                  Net cash flow
                </AppText>
                <AppText
                  tone={BigInt(data.netMinor) < 0n ? 'danger' : 'accent'}
                  style={{ fontFamily: 'DMSansBold' }}
                >
                  {money(data.netMinor)}
                </AppText>
              </View>
              <AppText tone="muted" style={{ fontSize: 12, lineHeight: 18 }}>
                {data.savingsRateBasisPoints === null
                  ? 'Add income to see your savings rate'
                  : data.savingsRateBasisPoints < 0
                    ? 'Expenses exceeded income this month'
                    : `${(data.savingsRateBasisPoints / 100).toFixed(1)}% of income saved`}
              </AppText>
            </View>
          </View>
          {!data.accounts.length && (
            <Card>
              <AppText style={{ fontFamily: 'DMSansBold' }}>Start with your first account</AppText>
              <AppText tone="muted">
                Add cash, a bank account, or a wallet to begin tracking.
              </AppText>
              <AppButton title="Create account" onPress={() => router.push('/account')} />
            </Card>
          )}
          <Card>
            <AppText style={{ fontFamily: 'DMSansBold', fontSize: 19 }}>
              Make room for what comes next
            </AppText>
            <AppText tone="muted">
              Review commitments and explore a purchase before recording it.
            </AppText>
            <AppButton
              title="Open Money Ahead"
              variant="secondary"
              onPress={() => router.push('/money-ahead')}
            />
          </Card>
          <DebtSummary />
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <AppText
                accessibilityRole="header"
                style={{ flex: 1, fontFamily: 'DMSansBold', fontSize: 20 }}
              >
                Spending by category
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="View spending reports"
                onPress={() => router.push('/(tabs)/reports')}
                style={{ minHeight: 48, justifyContent: 'center' }}
              >
                <AppText tone="accent" style={{ fontSize: 13, fontFamily: 'DMSansBold' }}>
                  Reports ›
                </AppText>
              </Pressable>
            </View>
            {spending.length ? (
              <Card style={{ gap: 18 }}>
                {spending.slice(0, 5).map(([id, amount]) => {
                  const share =
                    totalSpending > 0n
                      ? Number((BigInt(amount) * 10000n) / totalSpending) / 100
                      : 0;
                  return (
                    <View key={id} style={{ gap: 8 }}>
                      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
                        <AppText style={{ flex: 1, fontSize: 14 }}>
                          {categories.data?.find((item) => item.id === id)?.name ?? 'Category'}
                        </AppText>
                        <AppText style={{ fontSize: 14, fontFamily: 'DMSansBold' }}>
                          {money(amount)}
                        </AppText>
                      </View>
                      <View
                        accessibilityRole="progressbar"
                        accessibilityLabel={`${categories.data?.find((item) => item.id === id)?.name ?? 'Category'} share of spending`}
                        accessibilityValue={{ min: 0, max: 100, now: share }}
                        style={{
                          height: 5,
                          borderRadius: 3,
                          backgroundColor: theme.accentSoft,
                          overflow: 'hidden',
                        }}
                      >
                        <View
                          style={{
                            height: '100%',
                            width: `${share}%`,
                            backgroundColor: theme.accent,
                            borderRadius: 3,
                          }}
                        />
                      </View>
                    </View>
                  );
                })}
                {spending.length > 5 && (
                  <AppText tone="muted" style={{ fontSize: 12 }}>
                    Top 5 categories · See Reports for the full breakdown
                  </AppText>
                )}
              </Card>
            ) : (
              <AppText tone="muted">No expenses in this month.</AppText>
            )}
          </View>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <AppText
                accessibilityRole="header"
                style={{ flex: 1, fontFamily: 'DMSansBold', fontSize: 20 }}
              >
                Recent activity
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="View all transactions"
                onPress={() => router.push('/(tabs)/transactions')}
                style={{ minHeight: 48, justifyContent: 'center' }}
              >
                <AppText tone="accent" style={{ fontSize: 13, fontFamily: 'DMSansBold' }}>
                  View all ›
                </AppText>
              </Pressable>
            </View>
            {data.recentTransactions.length ? (
              data.recentTransactions
                .slice(0, 5)
                .map((item) => (
                  <TransactionCard
                    key={item.id}
                    item={item}
                    accountName={
                      data.accounts.find((account) => account.id === item.accountId)?.name
                    }
                    destinationAccountName={
                      data.accounts.find((account) => account.id === item.destinationAccountId)
                        ?.name
                    }
                    categoryName={
                      categories.data?.find((category) => category.id === item.categoryId)?.name
                    }
                  />
                ))
            ) : (
              <AppText tone="muted">Your transactions will appear here.</AppText>
            )}
          </View>
        </>
      )}
    </Screen>
  );
}
