import { transactionFilterSchema, transactionPageSchema } from '@finora/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
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
} from '../../src/components/ui';
import {
  accountsSchema,
  categoriesSchema,
  TransactionCard,
  useRead,
} from '../../src/features/finance/shared';

export default function Transactions() {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [accountId, setAccountId] = useState('all');
  const [categoryId, setCategoryId] = useState('all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState('');
  const [error, setError] = useState('');
  const accounts = useRead('accounts?includeArchived=true', accountsSchema);
  const categories = useRead('categories?includeArchived=true', categoriesSchema);
  const query = useRead(`transactions?page=${page}&pageSize=20${filters}`, transactionPageSchema);
  function apply() {
    try {
      const validated = transactionFilterSchema.parse({
        ...(search.trim() ? { q: search.trim() } : {}),
        ...(type !== 'all' ? { type } : {}),
        ...(accountId !== 'all' ? { accountId } : {}),
        ...(categoryId !== 'all' ? { categoryId } : {}),
        sort,
      });
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(validated))
        if (key !== 'page' && key !== 'pageSize') params.set(key, String(value));
      setError('');
      setPage(1);
      setFilters(`&${params.toString()}`);
    } catch (failure) {
      setError(
        failure instanceof z.ZodError
          ? failure.issues.map((issue) => issue.message).join('\n')
          : 'Check your filters.',
      );
    }
  }
  return (
    <Screen title="Activity" subtitle="Find the details behind your balance.">
      <AppButton title="Add transaction" onPress={() => router.push('/transaction')} />
      <Card>
        <Field
          label="Search merchant, note, or tag"
          value={search}
          onChangeText={setSearch}
          maxLength={80}
          returnKeyType="search"
          onSubmitEditing={apply}
        />
        <Choice
          label="Type"
          value={type}
          onChange={setType}
          options={[
            { value: 'all', label: 'All' },
            { value: 'EXPENSE', label: 'Expense' },
            { value: 'INCOME', label: 'Income' },
            { value: 'TRANSFER', label: 'Transfer' },
          ]}
        />
        <Choice
          label="Account"
          value={accountId}
          onChange={setAccountId}
          options={[
            { value: 'all', label: 'All accounts' },
            ...(accounts.data ?? []).map((item) => ({ value: item.id, label: item.name })),
          ]}
        />
        <Choice
          label="Category"
          value={categoryId}
          onChange={setCategoryId}
          options={[
            { value: 'all', label: 'All categories' },
            ...(categories.data ?? []).map((item) => ({ value: item.id, label: item.name })),
          ]}
        />
        <Choice
          label="Sort"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'newest', label: 'Newest' },
            { value: 'oldest', label: 'Oldest' },
            { value: 'highest', label: 'Highest amount' },
            { value: 'lowest', label: 'Lowest amount' },
          ]}
        />
        <AppButton title="Apply filters" variant="secondary" onPress={apply} />
        {error ? (
          <AppText tone="danger" accessibilityRole="alert">
            {error}
          </AppText>
        ) : null}
      </Card>
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
          <AppText tone="muted">
            {query.data.total} transactions · Page {page} of{' '}
            {Math.max(1, Math.ceil(query.data.total / query.data.pageSize))}
          </AppText>
          {!query.data.items.length && (
            <Card>
              <AppText>No transactions match these filters.</AppText>
            </Card>
          )}
          {query.data.items.map((item) => (
            <TransactionCard
              key={item.id}
              item={item}
              accountName={accounts.data?.find((account) => account.id === item.accountId)?.name}
              categoryName={
                categories.data?.find((category) => category.id === item.categoryId)?.name
              }
            />
          ))}
          <AppButton
            title="Previous page"
            variant="secondary"
            disabled={page <= 1 || query.isFetching}
            onPress={() => setPage((current) => current - 1)}
          />
          <AppButton
            title="Next page"
            variant="secondary"
            disabled={page * query.data.pageSize >= query.data.total || query.isFetching}
            onPress={() => setPage((current) => current + 1)}
          />
        </>
      )}
    </Screen>
  );
}
