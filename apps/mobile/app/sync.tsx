import { useState } from 'react';
import { Alert } from 'react-native';
import { useNetworkState } from 'expo-network';
import { router } from 'expo-router';
import { Disclosure, ImpactNotice, ActionRow } from '../src/components/design';
import { useQueryClient } from '@tanstack/react-query';
import { AppButton, AppText, Card, Feedback, Loading, Screen } from '../src/components/ui';
import { useApp } from '../src/providers/app-provider';
import { useMoney } from '../src/features/finance/shared';
import { usePendingTransactions } from '../src/storage/hooks';
import { type QueuedTransaction } from '../src/storage/outbox';

export default function SyncStatus() {
  const { vault, user, syncPending, syncing } = useApp();
  const query = usePendingTransactions();
  const money = useMoney();
  const client = useQueryClient();
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState(false);
  const network = useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const busy = syncing || retrying;
  const pendingCount = query.data?.filter((item) => item.value.state === 'PENDING').length ?? 0;
  const attentionCount = query.data?.filter((item) => item.value.state === 'ATTENTION').length ?? 0;
  async function retry(item: QueuedTransaction) {
    if (!vault || offline || busy) return;
    setError('');
    setRetrying(true);
    try {
      await vault.write(`pending:${item.id}`, { ...item, state: 'PENDING', code: '' });
      await syncPending();
      await client.invalidateQueries({ queryKey: [user?.id, 'local'] });
    } catch {
      setError('Could not retry. Your entry remains on this device.');
    } finally {
      setRetrying(false);
    }
  }
  return (
    <Screen
      title="Sync status"
      includeTopInset={false}
      showPendingStatus={false}
      subtitle="Pending entries are separate from posted balances."
      onRefresh={offline ? undefined : syncPending}
      bottomAction={
        <>
          <AppButton
            title="Sync now"
            loading={busy}
            disabled={offline || !vault || query.isPending || !pendingCount}
            onPress={() => {
              setError('');
              void syncPending().catch(() =>
                setError('Cannot sync right now. Reconnect and try again.'),
              );
            }}
          />
          {offline && (
            <AppText tone="muted" style={{ fontSize: 13, textAlign: 'center' }}>
              Reconnect to sync
            </AppText>
          )}
        </>
      }
    >
      {query.isPending && vault && <Loading />}
      {query.data && (
        <ImpactNotice title={`${pendingCount} pending · ${attentionCount} need review`}>
          Queued amounts appear separately from posted balances. Resolve items needing review before
          retrying.
        </ImpactNotice>
      )}
      {!vault && (
        <Feedback
          error={
            new Error(
              'Device storage is unavailable. Reopen Finora before checking pending entries.',
            )
          }
        />
      )}
      {(error || query.error) && <Feedback error={error ? new Error(error) : query.error} />}
      {query.data?.length === 0 && !query.error && (
        <Card>
          <AppText>No pending transactions</AppText>
          <AppText tone="muted">Saved online transactions appear in your regular history.</AppText>
        </Card>
      )}
      {query.data?.map(({ key, value }) => (
        <Card key={key}>
          <AppText style={{ fontFamily: 'DMSansBold' }}>
            {value.body.merchant || value.body.type.toLowerCase()}
          </AppText>
          <AppText
            tone={
              value.body.type === 'EXPENSE'
                ? 'danger'
                : value.body.type === 'INCOME'
                  ? 'accent'
                  : 'text'
            }
            style={{ fontSize: 24, lineHeight: 32, fontFamily: 'DMSansBold' }}
          >
            {value.body.type === 'EXPENSE' ? '−' : value.body.type === 'INCOME' ? '+' : ''}
            {money(value.body.amountMinor)}
          </AppText>
          <AppText tone={value.state === 'ATTENTION' ? 'danger' : 'muted'}>
            {value.state === 'ATTENTION'
              ? `Needs attention (${value.code}). Restore the referenced account/category or contact support.`
              : 'Pending sync'}
          </AppText>
          <AppText tone="muted" style={{ fontSize: 13 }}>
            Recorded {value.body.date.slice(0, 10)}. Amounts are not added to posted totals until
            confirmed by the server.
          </AppText>
          {value.state === 'ATTENTION' && (
            <>
              <ActionRow
                title="Check accounts"
                icon="wallet"
                onPress={() => router.push('/accounts')}
              />
              <ActionRow
                title="Check categories"
                icon="plan"
                last
                onPress={() => router.push('/categories')}
              />
              <AppButton
                title="Retry this entry"
                variant="secondary"
                disabled={busy || offline}
                onPress={() => {
                  void retry(value);
                }}
              />
            </>
          )}
          <Disclosure title="Entry actions">
            <AppButton
              title="Discard local entry"
              variant="danger"
              disabled={busy}
              onPress={() =>
                Alert.alert(
                  'Discard local entry?',
                  'If a connection dropped after the server saved it, this entry may already exist online. Discarding removes only this local retry; check your transaction history.',
                  [
                    { text: 'Keep', style: 'cancel' },
                    {
                      text: 'Discard',
                      style: 'destructive',
                      onPress: () => {
                        void vault
                          ?.remove(key)
                          .then(() => client.invalidateQueries({ queryKey: [user?.id, 'local'] }))
                          .catch(() => setError('Could not discard the local entry.'));
                      },
                    },
                  ],
                )
              }
            />
          </Disclosure>
        </Card>
      ))}
      <Disclosure title="How sync works">
        <AppText tone="muted" style={{ fontSize: 14 }}>
          Retrying keeps the original operation key to prevent duplicate saves. Restore a referenced
          account or category before retrying a conflict. Debt changes and edits need a connection.
        </AppText>
      </Disclosure>
    </Screen>
  );
}
