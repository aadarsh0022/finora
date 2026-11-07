import { debtListSchema, type DebtStatus } from '@finora/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { AppText, Card, Feedback, Field, Loading, Screen } from '../../components/ui';
import { SelectField } from '../../components/flow';
import { CreateAction, EmptyState } from '../../components/design';
import { useMoney, useRead } from '../finance/shared';
import { useTheme } from '../../theme';
import { debtKinds } from './debt-kinds';

export function DebtList({ receivables = false }: { receivables?: boolean }) {
  const query = useRead('debts', debtListSchema);
  const money = useMoney();
  const theme = useTheme();
  const [direction, setDirection] = useState<'BORROWED' | 'LENT'>(
    receivables ? 'LENT' : 'BORROWED',
  );
  const [filter, setFilter] = useState('ACTIVE');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('ALL');
  const items = (query.data ?? []).filter((d) =>
    receivables ? d.direction === 'LENT' : d.kind === 'PERSONAL_LOAN',
  );
  const total = (kind: DebtStatus['direction']) =>
    items
      .filter((d) => d.direction === kind)
      .reduce((sum, d) => sum + BigInt(d.remainingMinor), 0n)
      .toString();
  const visible = items.filter(
    (d) =>
      d.direction === direction &&
      (kind === 'ALL' || d.kind === kind) &&
      d.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) &&
      (filter === 'ARCHIVED'
        ? d.archived
        : !d.archived &&
          (filter === 'ALL' ||
            (filter === 'PARTIAL' && BigInt(d.repaidMinor) > 0n && BigInt(d.remainingMinor) > 0n) ||
            (filter === 'ACTIVE' && d.status !== 'SETTLED') ||
            d.status === filter)),
  );
  const statuses = receivables
    ? [
        ['ACTIVE', 'Awaiting'],
        ['PARTIAL', 'Partly received'],
        ['OVERDUE', 'Overdue'],
        ['SETTLED', 'Received'],
        ['ARCHIVED', 'Archived'],
      ]
    : [
        ['ACTIVE', 'Outstanding'],
        ['OVERDUE', 'Overdue'],
        ['SETTLED', 'Settled'],
        ['ARCHIVED', 'Archived'],
      ];
  const statusText = (debt: (typeof items)[number]) =>
    debt.cancelledAt
      ? 'Cancelled'
      : debt.status === 'SETTLED'
        ? receivables
          ? 'Received'
          : 'Settled'
        : debt.status === 'OVERDUE'
          ? 'Overdue'
          : receivables && BigInt(debt.repaidMinor) > 0n
            ? 'Partly received'
            : receivables
              ? 'Expected'
              : 'Active';
  return (
    <Screen
      title={receivables ? 'Money coming back' : 'Borrowed & lent'}
      includeTopInset={false}
      subtitle={
        receivables
          ? 'Refunds, deposits, reimbursements and money lent.'
          : 'Know what you owe, and what comes back.'
      }
      onRefresh={() => query.refetch()}
      floatingAction={
        <CreateAction
          label={receivables ? 'Track money coming back' : 'Add debt'}
          onPress={() =>
            router.push({ pathname: '/debt', params: receivables ? { receivable: 'true' } : {} })
          }
        />
      }
    >
      {receivables ? (
        <Card style={{ gap: 2, padding: 16 }}>
          <AppText tone="muted" style={{ fontSize: 13 }}>
            Still expected
          </AppText>
          <AppText
            style={{ fontFamily: 'DMSansBold', fontSize: 28, lineHeight: 36 }}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {money(total('LENT'))}
          </AppText>
        </Card>
      ) : (
        <Card style={{ flexDirection: 'row', padding: 6, gap: 6 }}>
          {(['BORROWED', 'LENT'] as const).map((side) => {
            const selected = direction === side;
            return (
              <Pressable
                key={side}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={
                  side === 'BORROWED' ? 'Show what I owe' : 'Show what is owed to me'
                }
                onPress={() => setDirection(side)}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 16,
                  backgroundColor: selected ? theme.accentSoft : 'transparent',
                  gap: 2,
                }}
              >
                <AppText tone="muted" style={{ fontSize: 13 }}>
                  {side === 'BORROWED' ? 'I owe' : 'Owed to me'}
                </AppText>
                <AppText
                  tone={side === 'BORROWED' ? 'danger' : 'accent'}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={{ fontSize: 22, lineHeight: 30, fontFamily: 'DMSansBold' }}
                >
                  {money(total(side))}
                </AppText>
              </Pressable>
            );
          })}
        </Card>
      )}
      <Field
        label={receivables ? 'Search expected receipts' : 'Search debts'}
        hideLabel
        placeholder="Search person or lender"
        value={search}
        onChangeText={setSearch}
        maxLength={80}
      />
      {receivables && (
        <SelectField
          label="Receipt type"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'ALL', label: 'All types' },
            ...Object.entries(debtKinds).map(([value, label]) => ({ value, label })),
          ]}
        />
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {statuses.map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === value }}
            accessibilityLabel={`Show ${(label ?? '').toLowerCase()}`}
            onPress={() => setFilter(value!)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 18,
              backgroundColor: filter === value ? theme.text : `${theme.text}0F`,
            }}
          >
            <AppText
              style={{
                fontSize: 13,
                fontFamily: 'DMSansBold',
                color: filter === value ? theme.surface : theme.muted,
              }}
            >
              {label}
            </AppText>
          </Pressable>
        ))}
      </ScrollView>
      {query.isPending && <Loading variant="debts" />}
      {query.error && (
        <Feedback
          error={query.error}
          retry={() => {
            void query.refetch();
          }}
        />
      )}
      {query.data && !visible.length && (
        <EmptyState
          icon={receivables ? 'repeat' : 'plan'}
          title={
            items.length
              ? 'No matching records'
              : receivables
                ? 'Keep track of what should come back'
                : 'A clear view of your debts'
          }
          message={
            items.length
              ? 'Try another status or name.'
              : receivables
                ? 'Track an expected receipt, then record each amount as it arrives. No money is transferred by Walleto.'
                : 'Add money borrowed or lent, then track repayments here. No money is transferred by Walleto.'
          }
        />
      )}
      {visible.map((debt) => {
        const overdue = debt.status === 'OVERDUE';
        return (
          <Pressable
            key={debt.id}
            accessibilityRole="button"
            accessibilityLabel={`Open ${receivables ? 'receivable' : 'debt'} with ${debt.name}`}
            onPress={() => router.push({ pathname: '/debt', params: { id: debt.id } })}
          >
            <Card style={{ gap: 8, padding: 14, borderRadius: 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <AppText
                  style={{ flex: 1, fontFamily: 'DMSansBold', fontSize: 16 }}
                  numberOfLines={1}
                >
                  {debt.name}
                </AppText>
                <View
                  style={{
                    paddingHorizontal: 9,
                    paddingVertical: 3,
                    borderRadius: 10,
                    backgroundColor: overdue ? theme.dangerSoft : theme.accentSoft,
                  }}
                >
                  <AppText
                    style={{
                      fontSize: 11,
                      fontFamily: 'DMSansBold',
                      color: overdue ? theme.danger : theme.accent,
                    }}
                  >
                    {statusText(debt)}
                  </AppText>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <AppText style={{ fontSize: 22, lineHeight: 28, fontFamily: 'DMSansBold' }}>
                  {money(debt.remainingMinor)}
                </AppText>
                <AppText tone="muted" style={{ fontSize: 12 }}>
                  left of {money(debt.amountMinor)}
                </AppText>
              </View>
              <View
                style={{
                  height: 5,
                  backgroundColor: `${theme.text}0D`,
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
              <AppText tone="muted" style={{ fontSize: 12 }}>
                {receivables ? `${debtKinds[debt.kind]} · ` : ''}
                {money(debt.repaidMinor)} {receivables ? 'received' : 'repaid'}
                {debt.dueDate ? ` · Due ${debt.dueDate}` : ''}
              </AppText>
            </Card>
          </Pressable>
        );
      })}
      {!receivables && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View refunds and other receipts"
          onPress={() => router.push('/receivables')}
          style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}
        >
          <AppText tone="accent" style={{ fontFamily: 'DMSansBold', fontSize: 14 }}>
            View refunds and other receipts ›
          </AppText>
        </Pressable>
      )}
    </Screen>
  );
}
