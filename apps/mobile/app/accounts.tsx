import { router } from 'expo-router';
import { useState } from 'react';
import { AppButton, AppText, Card, Choice, Feedback, Loading, Screen } from '../src/components/ui';
import { accountsSchema, useMoney, useRead } from '../src/features/finance/shared';

export default function Accounts() {
  const [visibility, setVisibility] = useState('active');
  const money = useMoney();
  const query = useRead('accounts?includeArchived=true', accountsSchema);
  const accounts = query.data?.filter(
    (account) => account.archived === (visibility === 'archived'),
  );
  return (
    <Screen title="Your accounts" subtitle="One clear view of your everyday money.">
      <AppButton title="Add account" onPress={() => router.push('/account')} />
      <Choice
        label="Show"
        value={visibility}
        onChange={setVisibility}
        options={[
          { value: 'active', label: 'Active' },
          { value: 'archived', label: 'Archived' },
        ]}
      />
      {query.isPending && <Loading />}
      {query.isError && (
        <Feedback
          error={query.error}
          retry={() => {
            void query.refetch();
          }}
        />
      )}
      {accounts?.length === 0 && (
        <Card>
          <AppText>
            {visibility === 'active'
              ? 'No active accounts yet. Add one to track your money.'
              : 'No archived accounts.'}
          </AppText>
        </Card>
      )}
      {accounts?.map((account) => (
        <Card key={account.id}>
          <AppText style={{ fontFamily: 'DMSansBold', fontSize: 22 }}>{account.name}</AppText>
          <AppText tone="muted">
            {account.type.toLowerCase()} · {account.currency}
            {account.archived ? ' · archived' : ''}
          </AppText>
          <AppText style={{ fontSize: 28, lineHeight: 36 }}>{money(account.balanceMinor)}</AppText>
          <AppButton
            title={account.archived ? 'View or restore' : 'Manage account'}
            variant="secondary"
            onPress={() => router.push({ pathname: '/account', params: { id: account.id } })}
          />
        </Card>
      ))}
    </Screen>
  );
}
