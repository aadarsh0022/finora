import { debtListSchema } from '@finora/contracts';
import { router } from 'expo-router';
import { View } from 'react-native';
import { AppButton, AppText, Card, Feedback } from '../../components/ui';
import { useMoney, useRead } from '../finance/shared';
import { useUi } from '../../stores/ui';

export function DebtSummary() {
  const query = useRead('debts', debtListSchema);
  const money = useMoney();
  const hidden = useUi((s) => s.balancesHidden);
  const totals = { BORROWED: 0n, LENT: 0n };
  for (const debt of query.data ?? []) totals[debt.direction] += BigInt(debt.remainingMinor);
  if (query.data && !query.error && totals.BORROWED === 0n && totals.LENT === 0n) return null;
  return (
    <Card>
      <AppText style={{ fontFamily: 'DMSansBold', fontSize: 19 }}>Borrowed & lent</AppText>
      {query.data && (
        <View style={{ flexDirection: 'row', gap: 16 }}>
          {(['BORROWED', 'LENT'] as const).map((kind) => (
            <View key={kind} style={{ flex: 1, gap: 4 }}>
              <AppText tone="muted" style={{ fontSize: 13 }}>
                {kind === 'BORROWED' ? 'I owe' : 'Owed to me'}
              </AppText>
              <AppText style={{ fontFamily: 'DMSansBold', fontSize: 20 }}>
                {hidden ? '••••' : money(totals[kind].toString())}
              </AppText>
            </View>
          ))}
        </View>
      )}
      {query.error && (
        <Feedback
          error={query.error}
          retry={() => {
            void query.refetch();
          }}
        />
      )}
      <AppButton title="View debts" variant="secondary" onPress={() => router.push('/debts')} />
    </Card>
  );
}
