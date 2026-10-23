import { View, Pressable } from 'react-native';
import { ActionRow, ImpactNotice } from '../src/components/design';
import { useTheme } from '../src/theme';
import { outlookSchema } from '@finora/contracts';
import { useState } from 'react';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { AppButton, AppText, Feedback, Loading, Screen } from '../src/components/ui';
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
  const theme = useTheme();
  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(0);
  function advance(next: number) {
    setStep(next);
    setFurthest((previous) => Math.max(previous, next));
  }
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
    if (!vault || !data || saved.isPending || saved.error || busy) return;
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
      if (!finish) advance(2);
      else router.replace('/(tabs)/plan');
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
      bottomAction={
        data ? (
          <AppButton
            title={
              step === 0
                ? 'Continue to review'
                : step === 1
                  ? 'Mark visible entries reviewed'
                  : step === 2
                    ? 'Continue to outlook'
                    : 'Finish check-in'
            }
            loading={busy}
            disabled={
              query.isPending ||
              (!!vault && (saved.isPending || !!saved.error)) ||
              ((step === 1 || step === 3) && !vault)
            }
            onPress={() => {
              if (step === 0) advance(1);
              else if (step === 1) {
                void save(false);
              } else if (step === 2) advance(3);
              else {
                void save(true);
              }
            }}
          />
        ) : undefined
      }
    >
      <SavedDataNotice at={query.cachedAt} />
      {(query.isPending || (!!vault && saved.isPending)) && <Loading />}
      {query.error || saved.error || pending.error || error ? (
        <Feedback error={query.error ?? saved.error ?? pending.error ?? error} />
      ) : null}
      {data && (
        <>
          <View
            accessibilityLabel={`Step ${step + 1} of 4`}
            style={{ flexDirection: 'row', gap: 8 }}
          >
            {['Sync', 'Review', 'Follow up', 'Look ahead'].map((label, index) => (
              <Pressable
                key={label}
                accessibilityRole="button"
                accessibilityLabel={`Step ${index + 1}: ${label}`}
                accessibilityState={{ selected: step === index, disabled: index > furthest }}
                disabled={index > furthest}
                onPress={() => setStep(index)}
                style={{ flex: 1, minHeight: 56, justifyContent: 'center', gap: 8 }}
              >
                <View
                  style={{
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: index <= step ? theme.accent : theme.border,
                  }}
                />
                <AppText
                  tone={step === index ? 'accent' : 'muted'}
                  style={{
                    fontSize: 12,
                    fontFamily: step === index ? 'DMSansBold' : 'DMSans',
                    textAlign: 'center',
                  }}
                >
                  {label}
                </AppText>
              </Pressable>
            ))}
          </View>
          {step === 0 && (
            <>
              <AppText
                accessibilityRole="header"
                style={{ fontFamily: 'DMSansBold', fontSize: 23 }}
              >
                Bring your entries up to date
              </AppText>
              <ImpactNotice
                title={
                  pending.data?.length
                    ? `${pending.data.length} entries need sync or review`
                    : 'No pending device entries'
                }
              >
                Queued entries are separate from posted totals. Resolve any sync issues before
                relying on your balances.
              </ImpactNotice>
              <ActionRow
                title="Check sync status"
                subtitle="Review pending entries"
                icon="repeat"
                onPress={() => router.push('/sync')}
                last
              />
            </>
          )}
          {step === 1 && (
            <>
              <AppText
                accessibilityRole="header"
                style={{ fontFamily: 'DMSansBold', fontSize: 23 }}
              >
                Review recent entries
              </AppText>
              <AppText tone="muted" style={{ fontSize: 14 }}>
                Latest 50 entries from the last seven days. Tap an entry to correct it.
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
                <ActionRow
                  title="Open transaction history"
                  subtitle={`${data.moreRecentCount} additional entries`}
                  icon="activity"
                  onPress={() => router.push('/(tabs)/transactions')}
                  last
                />
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Review later"
                onPress={() => advance(2)}
                style={{ minHeight: 48, justifyContent: 'center' }}
              >
                <AppText tone="accent">Review later</AppText>
              </Pressable>
            </>
          )}
          {step === 2 && (
            <>
              <AppText
                accessibilityRole="header"
                style={{ fontFamily: 'DMSansBold', fontSize: 23 }}
              >
                Follow up on what is outstanding
              </AppText>
              <AppText tone="muted" style={{ fontSize: 14 }}>
                {data.pendingRecurringCount} recurring confirmations · {data.overdueDebtCount}{' '}
                overdue debts or receivables
              </AppText>
              <View>
                <ActionRow
                  title="Review recurring items"
                  icon="calendar"
                  onPress={() =>
                    router.push({ pathname: '/planning', params: { mode: 'recurring' } })
                  }
                />
                <ActionRow
                  title="Review borrowed and lent money"
                  icon="plan"
                  onPress={() => router.push('/debts')}
                />
                <ActionRow
                  title="Review money coming back"
                  icon="repeat"
                  onPress={() => router.push('/receivables')}
                  last
                />
              </View>
            </>
          )}
          {step === 3 && (
            <>
              <AppText
                accessibilityRole="header"
                style={{ fontFamily: 'DMSansBold', fontSize: 23 }}
              >
                Look at the week ahead
              </AppText>
              <AppText tone="muted">
                Review commitments and the balances you last checked. Expected money stays separate
                from recorded cash.
              </AppText>
              <ActionRow
                title="Open Money Ahead"
                icon="goal"
                onPress={() => router.push('/money-ahead')}
                last
              />
              {unreviewed.length > 0 && (
                <ImpactNotice title={`${unreviewed.length} entries still need review`}>
                  Finishing saves this check-in, but leaves these entries unreviewed.
                </ImpactNotice>
              )}
            </>
          )}
          {!vault && (
            <AppText tone="muted">
              Encrypted device storage is needed to remember review acknowledgements.
            </AppText>
          )}
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
