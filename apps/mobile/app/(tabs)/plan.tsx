import { router } from 'expo-router';
import { View } from 'react-native';
import { Card, Screen } from '../../src/components/ui';
import { ActionRow, ProfileAction, SectionHeading } from '../../src/components/design';

export default function Plan() {
  return (
    <Screen title="Plan" subtitle="Make room for what comes next." headerAction={<ProfileAction />}>
      <View>
        <SectionHeading title="Your plans" />
        <Card style={{ paddingVertical: 0, paddingHorizontal: 16, gap: 0, overflow: 'hidden' }}>
          <ActionRow
            title="Budgets"
            subtitle="Monthly and category limits"
            icon="wallet"
            onPress={() => router.push({ pathname: '/planning', params: { mode: 'budgets' } })}
          />
          <ActionRow
            title="Savings goals"
            subtitle="Track money already saved"
            icon="goal"
            onPress={() => router.push({ pathname: '/planning', params: { mode: 'goals' } })}
          />
          <ActionRow
            title="Income"
            subtitle="Salary, extra income and a 12-month forecast"
            icon="income"
            onPress={() => router.push('/income')}
          />
          <ActionRow
            title="Loans & EMIs"
            subtitle="Monthly EMIs and payoff"
            icon="plan"
            onPress={() => router.push('/loans')}
          />
          <ActionRow
            title="Money owed"
            subtitle="Borrowed, lent and repayments"
            icon="plan"
            onPress={() => router.push('/debts')}
          />
          <ActionRow
            title="Coming back"
            subtitle="Refunds, deposits and reimbursements"
            icon="repeat"
            onPress={() => router.push('/receivables')}
          />
          <ActionRow
            title="Recurring"
            subtitle="Review payments before posting"
            icon="calendar"
            last
            onPress={() => router.push({ pathname: '/planning', params: { mode: 'recurring' } })}
          />
        </Card>
      </View>
      <Card style={{ paddingVertical: 0, paddingHorizontal: 16, gap: 0, overflow: 'hidden' }}>
        <ActionRow
          title="Your weekly check-in"
          subtitle="Review entries and follow-ups"
          icon="calendar"
          last
          onPress={() => router.push('/weekly-review')}
        />
      </Card>
    </Screen>
  );
}
