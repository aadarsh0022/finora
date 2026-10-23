import { outlookSchema } from '@finora/contracts';
import { useState } from 'react';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { AppButton, AppText, Card, Feedback, Loading, Screen } from '../src/components/ui';
import { SavedDataNotice, TransactionCard, useRead } from '../src/features/finance/shared';
import { useLocalRecords, usePendingTransactions } from '../src/storage/hooks';
import { useApp } from '../src/providers/app-provider';

const reviewSchema = z.object({
  completedAt: z.iso.datetime().optional(),
  entries: z
    .array(
      z.object({ id: z.uuid(), version: z.number().int().positive(), updatedAt: z.iso.datetime() }),
    )
    .max(500),
});
const key = 'outlook:weekly-review';
export default function WeeklyReview() {
  const { user, vault } = useApp();
  const client = useQueryClient();
  const query = useRead('planning/outlook', outlookSchema);
  const saved = useLocalRecords(key, reviewSchema);
  const pending = usePendingTransactions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [notice, setNotice] = useState('');
  const review = saved.data?.[0]?.value ?? { entries: [] };
  const data = query.data;
  const unreviewed = (data?.recentTransactions ?? []).filter(
    (t) =>
      !review.entries.some(
        (r) => r.id === t.id && r.version === t.version && r.updatedAt === t.updatedAt,
      ),
  );
  async function save(finish: boolean) {
    if (!vault || !data) return;
    setBusy(true);
    setError(undefined);
    try {
      const merged = new Map(review.entries.map((entry) => [entry.id, entry]));
      if (!finish)
        for (const entry of unreviewed)
          merged.set(entry.id, {
            id: entry.id,
            version: entry.version,
            updatedAt: entry.updatedAt,
          });
      const next = reviewSchema.parse({
        ...review,
        ...(finish ? { completedAt: new Date().toISOString() } : {}),
        entries: [...merged.values()]
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, 500),
      });
      await vault.write(key, next);
      await client.invalidateQueries({ queryKey: [user?.id, 'local', key] });
      setNotice(
        finish
          ? 'Check-in saved. Open follow-ups still need your attention.'
          : 'Visible entries marked reviewed. Financial records were not changed.',
      );
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen
      title="Your weekly check-in"
      subtitle="A few useful checks. One clearer week ahead."
      includeTopInset={false}
      onRefresh={() => query.refetch()}
    >
      <SavedDataNotice at={query.cachedAt} />
      {(query.isPending || (!!vault && saved.isPending)) && <Loading />}
      {query.error || saved.error || pending.error || error ? (
        <Feedback error={query.error ?? saved.error ?? pending.error ?? error} />
      ) : null}
      {data && (
        <>
          <Card>
            <AppText style={{ fontFamily: 'DMSansBold', fontSize: 19 }}>
              1. Bring your entries up to date
            </AppText>
            <AppText tone="muted">
              {pending.data?.length
                ? `${pending.data.length} entries are waiting for sync or need attention.`
                : 'No pending device entries in this snapshot.'}
            </AppText>
            <AppButton
              title="Check sync status"
              variant="secondary"
              onPress={() => router.push('/sync')}
            />
          </Card>
          <AppText accessibilityRole="header" style={{ fontFamily: 'DMSansBold', fontSize: 20 }}>
            2. Review recent entries
          </AppText>
          <AppText tone="muted">
            Latest 50 entries from the last seven calendar days. Review the amounts and accounts;
            tap an entry to correct it.
          </AppText>
          {unreviewed.map((entry) => (
            <TransactionCard
              key={entry.id}
              item={entry}
              accountName={data.accounts.find((a) => a.id === entry.accountId)?.name}
            />
          ))}
          {!unreviewed.length && (
            <AppText tone="muted">
              The visible entries are reviewed, or no entries were recorded in this period.
            </AppText>
          )}
          {data.moreRecentCount > 0 && (
            <>
              <AppText tone="muted">
                {data.moreRecentCount} additional entries are available in transaction history.
              </AppText>
              <AppButton
                title="Open transaction history"
                variant="secondary"
                onPress={() => router.push('/(tabs)/transactions')}
              />
            </>
          )}
          <AppButton
            title="Mark visible entries reviewed"
            disabled={!vault || busy || !unreviewed.length || saved.isPending}
            onPress={() => {
              void save(false);
            }}
          />
          <Card>
            <AppText style={{ fontFamily: 'DMSansBold', fontSize: 19 }}>
              3. Follow up on what is outstanding
            </AppText>
            <AppText>
              {data.pendingRecurringCount} recurring confirmations · {data.overdueDebtCount} overdue
              debts or receivables
            </AppText>
            <AppButton
              title="Review recurring items"
              variant="secondary"
              onPress={() => router.push({ pathname: '/planning', params: { mode: 'recurring' } })}
            />
            <AppButton
              title="Review borrowed and lent money"
              variant="secondary"
              onPress={() => router.push('/debts')}
            />
            <AppButton
              title="Review money coming back"
              variant="secondary"
              onPress={() => router.push('/receivables')}
            />
          </Card>
          <Card>
            <AppText style={{ fontFamily: 'DMSansBold', fontSize: 19 }}>
              4. Look at the week ahead
            </AppText>
            <AppText tone="muted">
              Review upcoming commitments, expected payments and the balances you last checked.
            </AppText>
            <AppButton title="Open Money Ahead" onPress={() => router.push('/money-ahead')} />
          </Card>
          {!vault && (
            <AppText tone="muted">
              Encrypted device storage is needed to remember review acknowledgements.
            </AppText>
          )}
          <AppButton
            title="Finish check-in"
            disabled={!vault || busy || saved.isPending}
            onPress={() => {
              void save(true);
            }}
          />
          {review.completedAt && (
            <AppText tone="muted" style={{ fontSize: 13 }}>
              Last check-in:{' '}
              {new Date(review.completedAt).toLocaleString(user?.preferences.locale, {
                timeZone: user?.preferences.timezone,
              })}
            </AppText>
          )}
          <AppText tone="muted" style={{ fontSize: 13 }}>
            Check-ins stay on this device. They never confirm recurring payments, settle debts or
            change your transactions.
          </AppText>
        </>
      )}
      {notice ? (
        <AppText accessibilityRole="alert" tone="accent">
          {notice}
        </AppText>
      ) : null}
    </Screen>
  );
}
