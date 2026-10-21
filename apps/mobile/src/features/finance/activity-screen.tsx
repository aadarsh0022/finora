import { transactionPageSchema } from '@finora/contracts';
import { calendarDate } from '@finora/finance-core';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { z } from 'zod';
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
import { DateField, FlowSheet, SelectField } from '../../components/flow';
import { accountsSchema, categoriesSchema, TransactionCard, useRead } from './shared';
import { activityQuery, emptyActivityFilters, type ActivityFilters } from './filters';
import { useApp } from '../../providers/app-provider';
import { useTheme } from '../../theme';

export default function Transactions() {
  const { user } = useApp();
  const theme = useTheme();
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
  function apply(next: ActivityFilters) {
    try {
      setQueryString(activityQuery(next, currency, timezone));
      setApplied(next);
      setSearch(next.q);
      setPage(1);
      setError('');
      setOpen(false);
    } catch (failure) {
      setError(
        failure instanceof z.ZodError
          ? failure.issues.map((issue) => issue.message).join('\n')
          : failure instanceof Error
            ? failure.message
            : 'Check your filters.',
      );
    }
  }
  function set<K extends keyof ActivityFilters>(key: K, value: ActivityFilters[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  const active = (Object.keys(applied) as (keyof ActivityFilters)[]).filter(
    (key) => applied[key] !== emptyActivityFilters[key],
  );
  const count = active.filter((key) => key !== 'q' && key !== 'type').length;
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
      title="Transactions"
      subtitle="Your money, one entry at a time."
      refreshing={query.isFetching && !query.isPending}
      onRefresh={() => {
        void query.refetch();
      }}
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
            placeholder="Merchant or note"
            value={search}
            onChangeText={setSearch}
            maxLength={80}
            returnKeyType="search"
            onSubmitEditing={() => apply({ ...applied, q: search })}
          />
        </View>
        <AppButton
          title={count ? `Filters (${count})` : 'Filters'}
          variant="secondary"
          onPress={() => {
            setDraft({ ...applied, q: search });
            setError('');
            setOpen(true);
          }}
        />
      </View>
      {search !== applied.q && (
        <AppButton
          title="Search"
          variant="secondary"
          onPress={() => apply({ ...applied, q: search })}
        />
      )}
      <Choice
        label="Type"
        value={applied.type}
        onChange={(type) => apply({ ...applied, type, categoryId: 'all' })}
        options={[
          { value: 'all', label: 'All' },
          { value: 'EXPENSE', label: 'Expense' },
          { value: 'INCOME', label: 'Income' },
          { value: 'TRANSFER', label: 'Transfer' },
        ]}
      />
      {!!active.length && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {active.map((key) => (
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
      {query.isPending && <Loading />}
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
          <AppText tone="muted" style={{ fontSize: 13 }}>
            {query.data.total} {query.data.total === 1 ? 'transaction' : 'transactions'}
            {page > 1 ? ` · Page ${page}` : ''}
          </AppText>
          {!items.length && (
            <Card>
              <AppText style={{ fontFamily: 'DMSansBold', fontSize: 20 }}>
                {active.length ? 'No matching transactions' : 'Your story starts here'}
              </AppText>
              <AppText tone="muted">
                {active.length
                  ? 'Try a different search or clear your filters.'
                  : 'Add an income, expense or transfer to see it here.'}
              </AppText>
              {active.length ? (
                <AppButton
                  title="Clear filters"
                  variant="secondary"
                  onPress={() => apply({ ...emptyActivityFilters })}
                />
              ) : (
                <AppButton
                  title="Add your first transaction"
                  onPress={() => router.push('/transaction')}
                />
              )}
            </Card>
          )}
          {[...groups].map(([day, records]) => (
            <View key={day} style={{ gap: 8 }}>
              <AppText
                tone="muted"
                style={{ fontSize: 13, fontFamily: 'DMSansBold', marginTop: 4 }}
              >
                {day === 'By amount'
                  ? day
                  : new Intl.DateTimeFormat(user?.preferences.locale ?? 'en-IN', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      timeZone: 'UTC',
                    }).format(new Date(`${day}T12:00:00Z`))}
              </AppText>
              {records.map((item) => (
                <TransactionCard
                  key={item.id}
                  item={item}
                  accountName={
                    accounts.data?.find((account) => account.id === item.accountId)?.name
                  }
                  destinationAccountName={
                    accounts.data?.find((account) => account.id === item.destinationAccountId)?.name
                  }
                  categoryName={
                    categories.data?.find((category) => category.id === item.categoryId)?.name
                  }
                  showDate={day === 'By amount'}
                />
              ))}
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
