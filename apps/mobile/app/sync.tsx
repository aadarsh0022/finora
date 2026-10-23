import { useState } from 'react';
import { Alert } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { AppButton, AppText, Card, Feedback, Screen } from '../src/components/ui';
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
  async function retry(item: QueuedTransaction) {
    try {
      await vault?.write(`pending:${item.id}`, { ...item, state: 'PENDING', code: '' });
      await syncPending();
      await client.invalidateQueries({ queryKey: [user?.id, 'local'] });
    } catch {
      setError('Could not retry. Your entry remains on this device.');
    }
  }
  return (
    <Screen
      title="Sync status"
      includeTopInset={false}
      subtitle="Pending entries are separate from posted balances."
      onRefresh={syncPending}
    >
      <AppText tone="muted">
        Entries are encrypted on this device and sent using the same operation key on every retry.
        Validation or account conflicts need your attention. Debt changes and edits to posted
        transactions require a connection.
      </AppText>
      <AppButton
        title="Sync now"
        loading={syncing}
        onPress={() => {
          void syncPending().catch(() =>
            setError('Cannot sync right now. Reconnect and try again.'),
          );
        }}
      />
      {(error || query.error) && <Feedback error={error ? new Error(error) : query.error} />}
      {!query.data?.length && (
        <Card>
          <AppText>No pending transactions</AppText>
          <AppText tone="muted">Saved online transactions appear in your regular history.</AppText>
        </Card>
      )}
      {query.data?.map(({ key, value }) => (
        <Card key={key}>
          <AppText style={{ fontFamily: 'DMSansBold' }}>
            {value.body.merchant || value.body.type.toLowerCase()} · {money(value.body.amountMinor)}
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
            <AppButton
              title="Retry this entry"
              variant="secondary"
              disabled={syncing}
              onPress={() => {
                void retry(value);
              }}
            />
          )}
          <AppButton
            title="Discard local entry"
            variant="danger"
            disabled={syncing}
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
        </Card>
      ))}
    </Screen>
  );
}
