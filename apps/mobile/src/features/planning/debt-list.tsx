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
} from '../../components/ui';
import { SelectField } from '../../components/flow';
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
        <AppButton
          title={receivables ? '+ Track money coming back' : '+ Add debt'}
          onPress={() =>
            router.push({ pathname: '/debt', params: receivables ? { receivable: 'true' } : {} })
          }
        />
      }
    >
      {receivables ? (
        <Card>
          <AppText tone="muted">Still expected</AppText>
          <AppText style={{ fontFamily: 'DMSansBold', fontSize: 30, lineHeight: 38 }}>
            {money(total('LENT'))}
          </AppText>
          <AppText tone="muted">Track what is still owed to you, including archived items.</AppText>
        </Card>
      ) : (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {(['BORROWED', 'LENT'] as const).map((kind) => (
            <Card key={kind} style={{ flex: 1 }}>
              <AppText tone="muted" style={{ fontSize: 13 }}>
                {kind === 'BORROWED' ? 'I owe' : 'Owed to me'}
              </AppText>
              <AppText
                tone={kind === 'BORROWED' ? 'danger' : 'accent'}
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{ fontSize: 26, lineHeight: 34, fontFamily: 'DMSansBold' }}
              >
                {money(total(kind))}
              </AppText>
            </Card>
          ))}
        </View>
      )}
      {!receivables && (
        <Choice
          label="Show"
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'BORROWED', label: 'I owe' },
            { value: 'LENT', label: 'Owed to me' },
          ]}
        />
      )}
      <Field
        label={receivables ? 'Search expected receipts' : 'Search debts'}
        placeholder="Person or lender"
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
      <SelectField
        label="Status"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'ACTIVE', label: receivables ? 'Awaiting receipt' : 'Outstanding' },
          ...(receivables ? [{ value: 'PARTIAL', label: 'Partly received' }] : []),
          { value: 'OVERDUE', label: 'Overdue' },
          { value: 'SETTLED', label: receivables ? 'Fully received' : 'Settled' },
          { value: 'ARCHIVED', label: 'Archived' },
          { value: 'ALL', label: 'All current' },
        ]}
      />
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
        <Card>
          <AppText style={{ fontFamily: 'DMSansBold' }}>
            {items.length
              ? 'No matching records'
              : receivables
                ? 'Keep track of what should come back'
                : 'A clear view of your debts'}
          </AppText>
          <AppText tone="muted">
            {items.length
              ? 'Try another status or name.'
              : receivables
                ? 'Track an expected receipt, then record each amount as it arrives. No money is transferred by Finora.'
                : 'Add money borrowed or lent, then track repayments here. No money is transferred by Finora.'}
          </AppText>
        </Card>
      )}
      {visible.map((debt) => (
        <Pressable
          key={debt.id}
          accessibilityRole="button"
          accessibilityLabel={`Open ${receivables ? 'receivable' : 'debt'} with ${debt.name}`}
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
                    ? receivables
                      ? 'Fully received'
                      : 'Settled'
                    : debt.status === 'OVERDUE'
                      ? 'Overdue'
                      : receivables && BigInt(debt.repaidMinor) > 0n
                        ? 'Partly received'
                        : receivables
                          ? 'Expected'
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
              {receivables ? `${debtKinds[debt.kind]} · ` : ''}
              {money(debt.repaidMinor)} {receivables ? 'received' : 'repaid'} of{' '}
              {money(debt.amountMinor)}
              {debt.dueDate ? ` · Due ${debt.dueDate}` : ''}
            </AppText>
          </Card>
        </Pressable>
      ))}
      {!receivables && (
        <AppButton
          title="View refunds and other receipts"
          variant="secondary"
          onPress={() => router.push('/receivables')}
        />
      )}
    </Screen>
  );
}
