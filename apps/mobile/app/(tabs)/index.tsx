import { overviewSchema } from '@finora/contracts';
import { calendarDate } from '@finora/finance-core';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { AppButton, AppText, Card, Feedback, Loading, Screen } from '../../src/components/ui';
import { AddTransactionAction, ProfileAction, SectionHeading } from '../../src/components/design';
import { OutlookSummary } from '../../src/features/planning/outlook-summary';
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

export default function Home() {
  const { user } = useApp();
  const theme = useTheme();
  const money = useMoney();
  const month = calendarDate(new Date(), user?.preferences.timezone ?? 'Asia/Kolkata').slice(0, 7);
  const overview = useRead(`reports/overview?month=${month}`, overviewSchema);
  const categories = useRead('categories?includeArchived=true', categoriesSchema);
  const seed = useFinanceMutation('onboarding/categories', messageSchema);
  const hidden = useUi((s) => s.balancesHidden);
  const toggleBalances = useUi((s) => s.toggleBalances);
  useEffect(() => {
    if (categories.data?.length === 0 && seed.status === 'idle') seed.mutate({});
  }, [categories.data, seed.status]);
  const data = overview.data;
  const amount = (value: string) => (hidden ? '••••••' : money(value));
  return (
    <Screen
      title="Your money"
      subtitle="Make room for what matters."
      headerAction={<ProfileAction />}
      floatingAction={<AddTransactionAction />}
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
          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <AppText tone="muted" style={{ flex: 1, fontSize: 14 }}>
                Recorded balance · {data.currency}
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={hidden ? 'Show total balance' : 'Hide total balance'}
                onPress={toggleBalances}
                style={{
                  minWidth: 48,
                  minHeight: 48,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginVertical: -8,
                }}
              >
                <AppText tone="accent" style={{ fontSize: 13 }}>
                  {hidden ? 'Show' : 'Hide'}
                </AppText>
              </Pressable>
            </View>
            <AppText
              style={{
                fontSize: 36,
                lineHeight: 46,
                fontFamily: 'DMSansBold',
                fontVariant: ['tabular-nums'],
              }}
            >
              {amount(data.totalBalanceMinor)}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Accounts"
              onPress={() => router.push('/accounts')}
              style={{ minHeight: 48, justifyContent: 'center' }}
            >
              <AppText tone="muted" style={{ fontSize: 13 }}>
                Across {data.accounts.length} {data.accounts.length === 1 ? 'account' : 'accounts'}{' '}
                · Manage →
              </AppText>
            </Pressable>
            <View
              style={{
                borderTopColor: theme.border,
                borderTopWidth: 1,
                paddingTop: 14,
                flexDirection: 'row',
                gap: 16,
              }}
            >
              {(
                [
                  ['Income', data.incomeMinor, 'accent'],
                  ['Spent', data.expensesMinor, 'danger'],
                ] as const
              ).map(([label, value, tone]) => (
                <View key={label} style={{ flex: 1, gap: 4 }}>
                  <AppText tone="muted" style={{ fontSize: 13 }}>
                    {label} · This month
                  </AppText>
                  <AppText
                    tone={tone}
                    style={{
                      fontSize: 21,
                      lineHeight: 28,
                      fontFamily: 'DMSansBold',
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {amount(value)}
                  </AppText>
                </View>
              ))}
            </View>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 6,
              }}
            >
              <AppText tone="muted" style={{ fontSize: 13 }}>
                Net cash flow
              </AppText>
              <AppText
                tone={BigInt(data.netMinor) < 0n ? 'danger' : 'accent'}
                style={{ fontSize: 14, fontFamily: 'DMSansBold' }}
              >
                {amount(data.netMinor)}
              </AppText>
            </View>
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
          <OutlookSummary />
          <View>
            <SectionHeading
              title="Recent activity"
              action="View all transactions"
              onPress={() => router.push('/(tabs)/transactions')}
            />
            {data.recentTransactions.length ? (
              data.recentTransactions
                .slice(0, 3)
                .map((item) => (
                  <TransactionCard
                    key={item.id}
                    item={item}
                    accountName={data.accounts.find((a) => a.id === item.accountId)?.name}
                    destinationAccountName={
                      data.accounts.find((a) => a.id === item.destinationAccountId)?.name
                    }
                    categoryName={categories.data?.find((c) => c.id === item.categoryId)?.name}
                  />
                ))
            ) : (
              <AppText tone="muted">Your transactions will appear here.</AppText>
            )}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View spending reports"
            onPress={() => router.push('/(tabs)/reports')}
            style={{ minHeight: 48, justifyContent: 'center' }}
          >
            <AppText tone="accent" style={{ fontSize: 14 }}>
              Explore your spending in Insights →
            </AppText>
          </Pressable>
        </>
      )}
    </Screen>
  );
}
