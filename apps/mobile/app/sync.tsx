import { useState } from 'react';
import { Alert } from 'react-native';
import { useNetworkState } from 'expo-network';
import { Disclosure } from '../src/components/design';
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
      title="Review entries"
      includeTopInset={false}
      showPendingStatus={false}
      subtitle="A quick check keeps your records accurate."
      onRefresh={offline ? undefined : syncPending}
    >
      {query.isPending && vault && <Loading />}
      {!vault && (
        <Feedback
          error={
            new Error(
              'Device storage is unavailable. Reopen Walleto before checking pending entries.',
            )
          }
        />
      )}
      {(error || query.error) && <Feedback error={error ? new Error(error) : query.error} />}
      {query.data && attentionCount === 0 && !query.error && (
        <Card>
          <AppText>All entries look good</AppText>
          <AppText tone="muted">Your records are available in Activity.</AppText>
        </Card>
      )}
      {query.data
        ?.filter((item) => item.value.state === 'ATTENTION')
        .map(({ key, value }) => (
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
            <AppText tone="muted">
              Check that the account and category are still available, then try again.
            </AppText>
            <AppButton
              title="Retry this entry"
              variant="secondary"
              disabled={busy || offline}
              onPress={() => {
                void retry(value);
              }}
            />
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
    </Screen>
  );
}
