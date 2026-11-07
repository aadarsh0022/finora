import { ProfileAction, Icon, EmptyState } from '../../components/design';
import { transactionPageSchema } from '@finora/contracts';
import { calendarDate } from '@finora/finance-core';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { z } from 'zod';
import { AppButton, AppText, Choice, Feedback, Field, Loading, Screen } from '../../components/ui';
import { DateField, FlowSheet, SelectField } from '../../components/flow';
import { accountsSchema, categoriesSchema, useMoney, TransactionCard, useRead } from './shared';
import { activityQuery, emptyActivityFilters, type ActivityFilters } from './filters';
import { useApp } from '../../providers/app-provider';
import { useTheme } from '../../theme';

export default function Transactions() {
  const { user } = useApp();
  const theme = useTheme();
  const money = useMoney();
  const currency = user?.preferences.baseCurrency ?? 'INR';
  const timezone = user?.preferences.timezone ?? 'Asia/Kolkata';
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState<ActivityFilters>(emptyActivityFilters);
  const [draft, setDraft] = useState<ActivityFilters>(emptyActivityFilters);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [queryString, setQueryString] = useState('sort=newest');
  const [error, setError] = useState('');
  const accounts = useRead('accounts?includeArchived=true', accountsSchema);
  const categories = useRead('categories?includeArchived=true', categoriesSchema);
  const query = useRead(
    `transactions?page=${page}&pageSize=20&${queryString}`,
    transactionPageSchema,
  );
  const apply = useCallback(
    (next: ActivityFilters, closeSheet = true) => {
      try {
        const term = next.q.trim();
        const normalized = { ...next, q: term.length >= 3 ? term : '' };
        setQueryString(activityQuery(normalized, currency, timezone));
        setApplied(normalized);
        setSearch(next.q);
        setPage(1);
        setError('');
        if (closeSheet) setOpen(false);
      } catch (failure) {
        setError(
          failure instanceof z.ZodError
            ? failure.issues.map((issue) => issue.message).join('\n')
            : failure instanceof Error
              ? failure.message
              : 'Check your filters.',
        );
      }
    },
    [currency, timezone],
  );
  useEffect(() => {
    const term = search.trim();
    const eligible = term.length >= 3 ? term : '';
    if (eligible === applied.q) return;
    const timeout = setTimeout(() => apply({ ...applied, q: search }, false), eligible ? 350 : 0);
    return () => clearTimeout(timeout);
  }, [search, applied, apply]);
  function set<K extends keyof ActivityFilters>(key: K, value: ActivityFilters[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  const active = (Object.keys(applied) as (keyof ActivityFilters)[]).filter(
    (key) => applied[key] !== emptyActivityFilters[key],
  );
  const count = active.filter((key) => key !== 'q' && key !== 'type').length;
  const chips = active.filter((key) => key !== 'type' && key !== 'q');
  function chip(key: keyof ActivityFilters) {
    if (key === 'accountId')
      return accounts.data?.find((account) => account.id === applied[key])?.name ?? 'Account';
    if (key === 'categoryId')
      return categories.data?.find((category) => category.id === applied[key])?.name ?? 'Category';
    if (key === 'q') return `Search: ${applied.q}`;
    if (key === 'from') return `From ${applied.from}`;
    if (key === 'to') return `Through ${applied.to}`;
    if (key === 'min') return `Min ${currency} ${applied.min}`;
    if (key === 'max') return `Max ${currency} ${applied.max}`;
    return applied[key].toLowerCase().replaceAll('_', ' ');
  }
  const items = query.data?.items ?? [];
  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const day = ['newest', 'oldest'].includes(applied.sort)
      ? calendarDate(new Date(item.date), timezone)
      : 'By amount';
    const records = groups.get(day) ?? [];
    records.push(item);
    groups.set(day, records);
  }
  return (
    <Screen
      title="Activity"
      titleSize={30}
      showPendingStatus={false}
      headerAction={<ProfileAction />}
      subtitle="Your money, one entry at a time."
      onRefresh={() => query.refetch()}
      floatingAction={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add transaction"
          accessibilityHint="Opens a new transaction form"
          onPress={() => router.push('/transaction')}
          style={({ pressed }) => ({
            width: 60,
            height: 60,
            borderRadius: 30,
            backgroundColor: theme.accent,
            alignItems: 'center',
            justifyContent: 'center',
            elevation: 6,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.25,
            shadowRadius: 6,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <AppText style={{ color: theme.onAccent, fontSize: 36, lineHeight: 42 }}>+</AppText>
        </Pressable>
      }
    >
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Field
            label="Search transactions"
            hideLabel
            leadingAction={<Icon name="search" size={19} />}
            style={{ minHeight: 48, fontSize: 14 }}
            placeholder="Search transactions"
            value={search}
            onChangeText={setSearch}
            maxLength={80}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="done"
            trailingAction={
              search.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  onPress={() => setSearch('')}
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <AppText tone="muted" style={{ fontSize: 25 }}>
                    ×
                  </AppText>
                </Pressable>
              ) : undefined
            }
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={count ? `Filters (${count})` : 'Filters'}
          onPress={() => {
            setDraft({ ...applied, q: search });
            setError('');
            setOpen(true);
          }}
          style={{
            width: 48,
            height: 48,
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.surface,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="filters" color={theme.accent} size={22} />
          {count > 0 && (
            <View
              style={{
                position: 'absolute',
                top: 5,
                right: 5,
                width: 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: theme.accent,
              }}
            />
          )}
        </Pressable>
      </View>
      {search.trim().length > 0 && search.trim().length < 3 && (
        <AppText tone="muted" style={{ fontSize: 12, lineHeight: 18, marginTop: -14 }}>
          Enter at least 3 characters
        </AppText>
      )}
      <Choice
        label="Type"
        hideLabel
        value={applied.type}
        onChange={(type) => apply({ ...applied, type, categoryId: 'all', q: search })}
        options={[
          { value: 'all', label: 'All' },
          { value: 'EXPENSE', label: 'Expense' },
          { value: 'INCOME', label: 'Income' },
          { value: 'TRANSFER', label: 'Transfer' },
        ]}
      />
      {!!chips.length && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {chips.map((key) => (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={`Remove filter ${chip(key)}`}
              onPress={() => apply({ ...applied, [key]: emptyActivityFilters[key] })}
              style={{
                minHeight: 40,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: theme.accentSoft,
              }}
            >
              <AppText style={{ fontSize: 13 }}>{chip(key)} ×</AppText>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear all filters"
            onPress={() => apply({ ...emptyActivityFilters })}
            style={{ padding: 10, minHeight: 40 }}
          >
            <AppText tone="accent" style={{ fontSize: 13 }}>
              Clear all
            </AppText>
          </Pressable>
        </View>
      )}
      {!open && error ? <Feedback error={new Error(error)} /> : null}
      {query.isPending && <Loading variant="activity" />}
      {query.isError && (
        <Feedback
          error={query.error}
          retry={() => {
            void query.refetch();
          }}
        />
      )}
      {(accounts.error || categories.error) && (
        <Feedback
          error={accounts.error ?? categories.error}
          retry={() => {
            void accounts.refetch();
            void categories.refetch();
          }}
        />
      )}
      {query.data && (
        <>
          {page > 1 && (
            <AppText tone="muted" style={{ fontSize: 13 }}>
              {query.data.total} {query.data.total === 1 ? 'transaction' : 'transactions'}
              {` · Page ${page}`}
            </AppText>
          )}
          {!items.length && (
            <EmptyState
              icon={active.length ? 'search' : 'repeat'}
              title={active.length ? 'No matching transactions' : 'Your story starts here'}
              message={
                active.length
                  ? 'Try a different search or clear your filters.'
                  : 'Add an income, expense or transfer to see it here.'
              }
              action={
                active.length
                  ? { title: 'Clear filters', onPress: () => apply({ ...emptyActivityFilters }) }
                  : {
                      title: 'Add your first transaction',
                      onPress: () => router.push('/transaction'),
                    }
              }
            />
          )}
          {[...groups].map(([day, records]) => (
            <View key={day} style={{ gap: 8 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  paddingTop: 8,
                  paddingHorizontal: 2,
                }}
              >
                <AppText style={{ fontSize: 15, fontFamily: 'DMSansBold' }}>
                  {day === 'By amount'
                    ? day
                    : day === calendarDate(new Date(), timezone)
                      ? 'Today'
                      : day ===
                          new Date(
                            new Date(`${calendarDate(new Date(), timezone)}T12:00:00Z`).getTime() -
                              86400000,
                          )
                            .toISOString()
                            .slice(0, 10)
                        ? 'Yesterday'
                        : new Intl.DateTimeFormat(user?.preferences.locale ?? 'en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            timeZone: 'UTC',
                          }).format(new Date(`${day}T12:00:00Z`))}
                </AppText>
                <AppText tone="muted" style={{ fontSize: 12 }}>
                  {applied.type === 'TRANSFER'
                    ? `${records.length} ${records.length === 1 ? 'transfer' : 'transfers'}`
                    : query.data.total <= query.data.pageSize && day !== 'By amount'
                      ? `${money(records.reduce((total, record) => total + (record.type === 'EXPENSE' ? BigInt(record.amountMinor) : 0n), 0n).toString())} spent`
                      : `${records.length} shown`}
                </AppText>
              </View>
              <View
                style={{ backgroundColor: theme.surface, borderRadius: 16, overflow: 'hidden' }}
              >
                {records.map((item) => (
                  <TransactionCard
                    key={item.id}
                    item={item}
                    accountName={
                      accounts.data?.find((account) => account.id === item.accountId)?.name
                    }
                    destinationAccountName={
                      accounts.data?.find((account) => account.id === item.destinationAccountId)
                        ?.name
                    }
                    categoryName={
                      categories.data?.find((category) => category.id === item.categoryId)?.name
                    }
                    showDate={day === 'By amount'}
                  />
                ))}
              </View>
            </View>
          ))}
          {query.data.total > query.data.pageSize && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <AppButton
                title="Previous page"
                variant="secondary"
                disabled={page <= 1 || query.isFetching}
                onPress={() => setPage(page - 1)}
              />
              <AppText tone="muted" style={{ alignSelf: 'center', fontSize: 13 }}>
                {page} / {Math.ceil(query.data.total / query.data.pageSize)}
              </AppText>
              <AppButton
                title="Next page"
                variant="secondary"
                disabled={page * query.data.pageSize >= query.data.total || query.isFetching}
                onPress={() => setPage(page + 1)}
              />
            </View>
          )}
        </>
      )}
      <FlowSheet
        title="Filter transactions"
        visible={open}
        onClose={() => {
          setOpen(false);
          setError('');
        }}
        footer={
          <>
            <AppButton title="Apply filters" onPress={() => apply(draft)} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <AppButton
                  title="Reset"
                  variant="secondary"
                  onPress={() => {
                    setDraft({ ...emptyActivityFilters });
                    setError('');
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <AppButton
                  title="Cancel"
                  variant="secondary"
                  onPress={() => {
                    setOpen(false);
                    setError('');
                  }}
                />
              </View>
            </View>
          </>
        }
      >
        <AppText tone="muted">Changes take effect when you apply them.</AppText>
        <SelectField
          label="Account"
          value={draft.accountId}
          onChange={(value) => set('accountId', value)}
          options={[
            { value: 'all', label: 'All accounts' },
            ...(accounts.data ?? []).map((account) => ({
              value: account.id,
              label: `${account.name}${account.archived ? ' · Archived' : ''}`,
            })),
          ]}
        />
        <SelectField
          label="Category"
          value={draft.categoryId}
          onChange={(value) => set('categoryId', value)}
          options={[
            { value: 'all', label: 'All categories' },
            ...(categories.data ?? [])
              .filter((category) => draft.type === 'all' || category.type === draft.type)
              .map((category) => ({
                value: category.id,
                label: category.name,
                description: category.type === 'INCOME' ? 'Income' : 'Expense',
              })),
          ]}
          disabled={draft.type === 'TRANSFER'}
        />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <DateField
              label="From date"
              value={draft.from}
              onChange={(value) => set('from', value)}
              allowClear
            />
          </View>
          <View style={{ flex: 1 }}>
            <DateField
              label="Through date"
              value={draft.to}
              onChange={(value) => set('to', value)}
              allowClear
            />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Field
              label={`Minimum (${currency})`}
              value={draft.min}
              onChangeText={(value) => set('min', value)}
              keyboardType="decimal-pad"
              placeholder="Any"
              maxLength={35}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label={`Maximum (${currency})`}
              value={draft.max}
              onChangeText={(value) => set('max', value)}
              keyboardType="decimal-pad"
              placeholder="Any"
              maxLength={35}
            />
          </View>
        </View>
        <SelectField
          label="Sort by"
          value={draft.sort}
          onChange={(value) => set('sort', value)}
          options={[
            { value: 'newest', label: 'Newest first' },
            { value: 'oldest', label: 'Oldest first' },
            { value: 'highest', label: 'Highest amount' },
            { value: 'lowest', label: 'Lowest amount' },
          ]}
        />
        {error ? (
          <AppText tone="danger" accessibilityRole="alert">
            {error}
          </AppText>
        ) : null}
      </FlowSheet>
    </Screen>
  );
}
