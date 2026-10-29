import { useState } from 'react';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { transactionPageSchema } from '@finora/contracts';
import { ActionRow } from '../src/components/design';
import { AppButton, AppText, Feedback, Loading, Screen } from '../src/components/ui';
import { useApp } from '../src/providers/app-provider';
import { useLocalRecords } from '../src/storage/hooks';
import {
  useRead,
  TransactionCard,
  accountsSchema,
  categoriesSchema,
} from '../src/features/finance/shared';
const reviewSchema = z.object({
  completedAt: z.iso.datetime().optional(),
  entries: z
    .array(
      z.object({ id: z.uuid(), version: z.number().int().positive(), updatedAt: z.iso.datetime() }),
    )
    .max(500),
});
const key = 'weekly-review';
export default function WeeklyReview() {
  const { user, vault } = useApp();
  const client = useQueryClient();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const query = useRead('transactions?page=1&pageSize=50&sort=newest', transactionPageSchema);
  const accounts = useRead('accounts?includeArchived=true', accountsSchema);
  const categories = useRead('categories?includeArchived=true', categoriesSchema);
  const saved = useLocalRecords(key, reviewSchema);
  const review = saved.data?.[0]?.value ?? { entries: [] };
  const unreviewed = (query.data?.items ?? []).filter(
    (item) =>
      !review.entries.some(
        (entry) =>
          entry.id === item.id &&
          entry.version === item.version &&
          entry.updatedAt === item.updatedAt,
      ),
  );
  async function finish() {
    if (!vault || busy) return;
    setBusy(true);
    try {
      const entries = new Map(review.entries.map((entry) => [entry.id, entry]));
      for (const entry of unreviewed)
        entries.set(entry.id, { id: entry.id, version: entry.version, updatedAt: entry.updatedAt });
      await vault.write(key, {
        completedAt: new Date().toISOString(),
        entries: [...entries.values()]
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, 500),
      });
      await client.invalidateQueries({ queryKey: [user?.id, 'local', key] });
      router.replace('/(tabs)/plan');
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen
      title="Your weekly check-in"
      subtitle={
        step === 0 ? 'A quick look at your recent entries.' : 'A few things to follow up on.'
      }
      includeTopInset={false}
      showPendingStatus={false}
      bottomAction={
        <AppButton
          title={step === 0 ? 'Continue' : 'Finish check-in'}
          loading={busy}
          disabled={query.isPending || saved.isPending || !vault}
          onPress={() => {
            if (step === 0) setStep(1);
            else void finish();
          }}
        />
      }
    >
      {(query.isPending || saved.isPending) && <Loading />}
      {(error || query.error || saved.error) && (
        <Feedback error={error ?? query.error ?? saved.error} />
      )}
      {step === 0 ? (
        <>
          {unreviewed.map((item) => (
            <TransactionCard
              key={item.id}
              item={item}
              accountName={accounts.data?.find((account) => account.id === item.accountId)?.name}
              categoryName={
                categories.data?.find((category) => category.id === item.categoryId)?.name
              }
            />
          ))}
          {!unreviewed.length && !query.isPending && <AppText>You're all caught up.</AppText>}
          {(query.data?.total ?? 0) > 50 && (
            <AppButton
              title="View all entries"
              variant="secondary"
              onPress={() => router.push('/(tabs)/transactions')}
            />
          )}
        </>
      ) : (
        <>
          <ActionRow
            title="Recurring items"
            subtitle="Review upcoming entries"
            icon="calendar"
            onPress={() => router.push({ pathname: '/planning', params: { mode: 'recurring' } })}
          />
          <ActionRow
            title="Borrowed and lent"
            subtitle="Check your debt records"
            icon="plan"
            onPress={() => router.push('/debts')}
          />
          <ActionRow
            title="Money coming back"
            subtitle="Refunds and reimbursements"
            icon="repeat"
            last
            onPress={() => router.push('/receivables')}
          />
        </>
      )}
    </Screen>
  );
}
