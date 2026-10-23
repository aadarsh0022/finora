import { router } from 'expo-router';
import { Alert } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { AppButton, AppText, Card, Feedback, Screen } from '../src/components/ui';
import { useApp } from '../src/providers/app-provider';
import { useLocalRecords } from '../src/storage/hooks';
import { favouriteSchema } from '../src/storage/favourites';
import { useMoney } from '../src/features/finance/shared';

export default function Favourites() {
  const { vault, user } = useApp();
  const query = useLocalRecords('favourite:', favouriteSchema);
  const money = useMoney();
  const client = useQueryClient();
  return (
    <Screen
      title="Quick entry"
      subtitle="Favourites open a draft. You review before saving."
      includeTopInset={false}
    >
      {!vault && (
        <AppText tone="muted">
          Quick entry needs encrypted device storage. It will be available in the updated
          development build.
        </AppText>
      )}
      {query.error && <Feedback error={query.error} />}
      {!query.data?.length && (
        <Card>
          <AppText style={{ fontFamily: 'DMSansBold' }}>Make the everyday quicker</AppText>
          <AppText tone="muted">
            Open a transaction and choose Save as favourite. The date resets to today whenever you
            use it.
          </AppText>
          <AppButton title="Add transaction" onPress={() => router.push('/transaction')} />
        </Card>
      )}
      {query.data?.map(({ key, value }) => (
        <Card key={key}>
          <AppText style={{ fontSize: 19, fontFamily: 'DMSansBold' }}>{value.name}</AppText>
          <AppText tone="muted">
            {money(value.body.amountMinor)} · {value.body.type.toLowerCase()}
          </AppText>
          <AppButton
            title={`Use ${value.name}`}
            onPress={() =>
              router.push({ pathname: '/transaction', params: { favourite: value.id } })
            }
          />
          <AppButton
            title="Remove favourite"
            variant="secondary"
            onPress={() =>
              Alert.alert('Remove favourite?', 'Your recorded transactions will stay unchanged.', [
                { text: 'Keep', style: 'cancel' },
                {
                  text: 'Remove',
                  onPress: () => {
                    void vault
                      ?.remove(key)
                      .then(() => client.invalidateQueries({ queryKey: [user?.id, 'local'] }))
                      .catch(() => undefined);
                  },
                },
              ])
            }
          />
        </Card>
      ))}
    </Screen>
  );
}
