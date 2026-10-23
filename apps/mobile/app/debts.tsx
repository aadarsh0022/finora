import { debtListSchema, type DebtStatus } from '@finora/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  AppButton,
  AppText,
  Card,
  Choice,
  Feedback,
  Field,
  Loading,
  Screen,
} from '../src/components/ui';
import { useMoney, useRead } from '../src/features/finance/shared';
import { useTheme } from '../src/theme';

export default function Debts() {
  const query = useRead('debts', debtListSchema);
  const money = useMoney();
  const theme = useTheme();
  const [direction, setDirection] = useState<'BORROWED' | 'LENT'>('BORROWED');
  const [filter, setFilter] = useState('ACTIVE');
  const [search, setSearch] = useState('');
  const items = query.data ?? [];
  const total = (kind: DebtStatus['direction']) =>
    items
      .filter((d) => d.direction === kind)
      .reduce((sum, d) => sum + BigInt(d.remainingMinor), 0n)
      .toString();
  const visible = items.filter(
    (d) =>
      d.direction === direction &&
      d.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) &&
      (filter === 'ARCHIVED'
        ? d.archived
        : !d.archived &&
          (filter === 'ALL' ||
            (filter === 'ACTIVE' && d.status !== 'SETTLED') ||
            d.status === filter)),
  );
  return (
    <Screen
      title="Borrowed & lent"
      includeTopInset={false}
      subtitle="Know what you owe, and what comes back."
      onRefresh={() => query.refetch()}
      floatingAction={<AppButton title="+ Add debt" onPress={() => router.push('/debt')} />}
    >
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {(['BORROWED', 'LENT'] as const).map((kind) => (
          <Card key={kind} style={{ flex: 1 }}>
            <AppText tone="muted" style={{ fontSize: 13 }}>
              {kind === 'BORROWED' ? 'I owe' : 'Owed to me'}
            </AppText>
            <AppText
              tone={kind === 'BORROWED' ? 'danger' : 'accent'}
              style={{ fontSize: 22, fontFamily: 'DMSansBold' }}
            >
              {money(total(kind))}
            </AppText>
          </Card>
        ))}
      </View>
      <Choice
        label="Show"
        value={direction}
        onChange={setDirection}
        options={[
          { value: 'BORROWED', label: 'I owe' },
          { value: 'LENT', label: 'Owed to me' },
        ]}
      />
      <Field
        label="Search debts"
        placeholder="Person or lender"
        value={search}
        onChangeText={setSearch}
        maxLength={80}
      />
      <Choice
        label="Status"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'ACTIVE', label: 'Outstanding' },
          { value: 'OVERDUE', label: 'Overdue' },
          { value: 'SETTLED', label: 'Settled' },
          { value: 'ARCHIVED', label: 'Archived' },
          { value: 'ALL', label: 'All' },
        ]}
      />
      {query.isPending && <Loading />}
      {query.error && (
        <Feedback
          error={query.error}
          retry={() => {
            void query.refetch();
          }}
        />
      )}
      {query.data && !visible.length && (
        <Card>
          <AppText style={{ fontFamily: 'DMSansBold' }}>
            {items.length ? 'No matching debts' : 'A clear view of your debts'}
          </AppText>
          <AppText tone="muted">
            {items.length
              ? 'Try another status or name.'
              : 'Add money borrowed or lent, then track repayments here. No money is transferred by Finora.'}
          </AppText>
        </Card>
      )}
      {visible.map((debt) => (
        <Pressable
          key={debt.id}
          accessibilityRole="button"
          accessibilityLabel={`Open debt with ${debt.name}`}
          onPress={() => router.push({ pathname: '/debt', params: { id: debt.id } })}
        >
          <Card>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <AppText style={{ flex: 1, fontFamily: 'DMSansBold', fontSize: 18 }}>
                {debt.name}
              </AppText>
              <AppText tone={debt.status === 'OVERDUE' ? 'danger' : 'muted'}>
                {debt.cancelledAt
                  ? 'Cancelled'
                  : debt.status === 'SETTLED'
                    ? 'Settled'
                    : debt.status === 'OVERDUE'
                      ? 'Overdue'
                      : 'Active'}
              </AppText>
            </View>
            <AppText style={{ fontSize: 25, lineHeight: 32, fontFamily: 'DMSansBold' }}>
              {money(debt.remainingMinor)}
            </AppText>
            <View
              style={{
                height: 5,
                backgroundColor: theme.border,
                borderRadius: 5,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  height: 5,
                  backgroundColor: theme.accent,
                  width: `${Number((BigInt(debt.repaidMinor) * 10000n) / BigInt(debt.amountMinor)) / 100}%`,
                }}
              />
            </View>
            <AppText tone="muted" style={{ fontSize: 13 }}>
              {money(debt.repaidMinor)} repaid of {money(debt.amountMinor)}
              {debt.dueDate ? ` · Due ${debt.dueDate}` : ''}
            </AppText>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
