import { overviewSchema } from '@finora/contracts';
import { calendarDate } from '@finora/finance-core';
import { Redirect, router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { AppButton, AppText, Card, Feedback, Loading, Screen } from '../../src/components/ui';
import { Backdrop } from '../../src/components/backdrop';
import { AddTransactionAction, ProfileAction, SectionHeading } from '../../src/components/design';
import {
  useRead,
  useMoney,
  TransactionCard,
  categoriesSchema,
  messageSchema,
} from '../../src/features/finance/shared';
import { useApp } from '../../src/providers/app-provider';
import { HomeDetails } from '../../src/features/finance/home-details';
import { HomeSummary } from '../../src/features/finance/home-summary';
import { elevation, glass, useTheme } from '../../src/theme';
import { FinoraWordmark } from '../../src/components/brand';
import { useFinanceMutation } from '../../src/hooks/finance';
import { useUi } from '../../src/stores/ui';

export default function Home() {
  const { user } = useApp();
  const theme = useTheme();
  const firstName = user?.name.trim().split(/\s+/)[0];
  const money = useMoney();
  const month = calendarDate(new Date(), user?.preferences.timezone ?? 'Asia/Kolkata').slice(0, 7);
  const overview = useRead(`reports/overview?month=${month}`, overviewSchema);
  const categories = useRead('categories?includeArchived=true', categoriesSchema);
  const seed = useFinanceMutation('onboarding/categories', messageSchema);
  const hidden = useUi((s) => s.balancesHidden);
  const toggleBalances = useUi((s) => s.toggleBalances);
  const onboardingDismissed = useUi((s) => s.onboardingDismissedOwner === user?.id);
  useEffect(() => {
    if (categories.data?.length === 0 && seed.status === 'idle') seed.mutate({});
  }, [categories.data, seed.status]);
  const data = overview.data;
  const amount = (value: string) => (hidden ? '••••••' : money(value));
  if (data && !data.accounts.length && user && !user.onboardingCompletedAt && !onboardingDismissed)
    return <Redirect href="/onboarding" />;
  return (
    <Screen
      title={firstName ? `Hi, ${firstName}` : 'Your money'}
      subtitle="Your money at a glance."
      showPendingStatus={false}
      backdrop={<Backdrop />}
      floatingAction={<AddTransactionAction />}
      topContent={
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <FinoraWordmark />
          <ProfileAction />
        </View>
      }
      onRefresh={() => Promise.all([overview.refetch(), categories.refetch()])}
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
          <HomeSummary data={data} hidden={hidden} toggle={toggleBalances} amount={amount} />
          {!data.accounts.length && (
            <Card>
              <AppText style={{ fontFamily: 'DMSansBold' }}>Start with your first account</AppText>
              <AppText tone="muted">
                Add cash, a bank account, or a wallet to begin tracking.
              </AppText>
              <AppButton title="Create account" onPress={() => router.push('/account')} />
            </Card>
          )}
          <View>
            <SectionHeading
              title="Recent activity"
              action="View all →"
              actionLabel="View all transactions"
              onPress={() => router.push('/(tabs)/transactions')}
            />
            <View
              style={{
                backgroundColor: glass(theme),
                borderRadius: 22,
                overflow: 'hidden',
                ...elevation(theme),
              }}
            >
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
                <AppText tone="muted" style={{ padding: 18 }}>
                  Your transactions will appear here.
                </AppText>
              )}
            </View>
          </View>
          <HomeDetails
            data={data}
            categories={categories.data ?? []}
            amount={amount}
            hidden={hidden}
          />
        </>
      )}
    </Screen>
  );
}
