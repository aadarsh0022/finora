import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppText, Card, Choice, Feedback, Loading, Screen } from '../src/components/ui';
import { EmptyState, Icon } from '../src/components/design';
import { elevation, glass, useTheme } from '../src/theme';
import { accountsSchema, useMoney, useRead } from '../src/features/finance/shared';
const types = {
  CASH: 'Cash',
  CHECKING: 'Bank account',
  SAVINGS: 'Savings',
  WALLET: 'Wallet',
  OTHER: 'Other',
};
export default function Accounts() {
  const theme = useTheme();
  const [visibility, setVisibility] = useState('active');
  const money = useMoney();
  const query = useRead('accounts?includeArchived=true', accountsSchema);
  const active = (query.data ?? []).filter((account) => !account.archived);
  const accounts = query.data?.filter(
    (account) => account.archived === (visibility === 'archived'),
  );
  return (
    <Screen
      title="Accounts"
      subtitle="Keep your money in view."
      includeTopInset={false}
      showPendingStatus={false}
      onRefresh={() => query.refetch()}
      headerAction={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add account"
          onPress={() => router.push('/account')}
          style={{
            minHeight: 40,
            paddingHorizontal: 12,
            borderRadius: 12,
            backgroundColor: theme.accentSoft,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <Icon name="plus" color={theme.accent} size={17} />
          <AppText tone="accent" style={{ fontSize: 13, fontFamily: 'DMSansBold' }}>
            Add
          </AppText>
        </Pressable>
      }
    >
      {query.isPending && <Loading variant="accounts" />}
      {query.isError && (
        <Feedback
          error={query.error}
          retry={() => {
            void query.refetch();
          }}
        />
      )}
      {query.data && (
        <Card style={{ gap: 5, padding: 20, borderRadius: 20 }}>
          <AppText tone="muted" style={{ fontSize: 12 }}>
            Total in active accounts
          </AppText>
          <AppText
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{
              fontSize: 32,
              lineHeight: 42,
              fontFamily: 'DMSansBold',
              letterSpacing: -0.8,
              fontVariant: ['tabular-nums'],
            }}
          >
            {money(
              active.reduce((sum, account) => sum + BigInt(account.balanceMinor), 0n).toString(),
            )}
          </AppText>
          <AppText tone="muted" style={{ fontSize: 12 }}>
            {active.length} {active.length === 1 ? 'account' : 'accounts'}
          </AppText>
        </Card>
      )}
      <Choice
        label="Show"
        hideLabel
        value={visibility}
        onChange={setVisibility}
        options={[
          { value: 'active', label: 'Active' },
          { value: 'archived', label: 'Archived' },
        ]}
      />
      {accounts?.length === 0 && (
        <EmptyState
          icon="wallet"
          title={visibility === 'active' ? 'No accounts yet' : 'No archived accounts'}
          message={
            visibility === 'active'
              ? 'Add your first account to start tracking.'
              : 'Accounts you archive will appear here.'
          }
          action={
            visibility === 'active'
              ? { title: 'Add account', onPress: () => router.push('/account') }
              : undefined
          }
        />
      )}
      {!!accounts?.length && (
        <View
          style={{
            borderRadius: 20,
            backgroundColor: glass(theme),
            overflow: 'hidden',
            ...elevation(theme),
          }}
        >
          {accounts.map((account, index) => (
            <Pressable
              key={account.id}
              accessibilityRole="button"
              accessibilityLabel={`${account.name}, ${money(account.balanceMinor)}. ${account.archived ? 'View or restore' : 'Manage account'}`}
              onPress={() => router.push({ pathname: '/account', params: { id: account.id } })}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 16,
                minHeight: 88,
                borderTopWidth: index ? 1 : 0,
                borderTopColor: theme.border,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 13,
                  backgroundColor: theme.accentSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="wallet" size={22} color={theme.accent} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <AppText numberOfLines={1} style={{ fontFamily: 'DMSansBold', fontSize: 15 }}>
                  {account.name}
                </AppText>
                <AppText tone="muted" style={{ fontSize: 11, lineHeight: 16 }}>
                  {types[account.type]} · {account.currency}
                </AppText>
              </View>
              <AppText
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{
                  fontSize: 16,
                  fontFamily: 'DMSansBold',
                  maxWidth: '43%',
                  fontVariant: ['tabular-nums'],
                }}
              >
                {money(account.balanceMinor)}
              </AppText>
              <Icon name="chevron" size={16} />
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}
