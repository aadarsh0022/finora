import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';
import { AppText, Screen } from '../src/components/ui';
import { CreateAction, type CreateRegistration } from '../src/components/design';
import { useTheme } from '../src/theme';
import { Budgets } from '../src/features/planning/budgets';
import { Goals } from '../src/features/planning/goals';
import { Recurring } from '../src/features/planning/recurring';

export default function Planning() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const theme = useTheme();
  const [mode, setMode] = useState(
    params.mode === 'goals' || params.mode === 'recurring' ? params.mode : 'budgets',
  );
  const [editing, setEditing] = useState(false);
  const [create, setCreate] = useState<CreateRegistration | null>(null);
  return (
    <Screen
      includeTopInset={false}
      floatingAction={
        !editing && create ? (
          <CreateAction
            label={create.label}
            onPress={create.run}
            disabled={create.disabled ?? false}
          />
        ) : undefined
      }
      title={
        editing
          ? undefined
          : mode === 'goals'
            ? 'Savings goals'
            : mode === 'recurring'
              ? 'Recurring payments'
              : 'Budgets'
      }
      subtitle={
        editing
          ? undefined
          : mode === 'goals'
            ? 'Small steps toward something you want.'
            : mode === 'recurring'
              ? 'Your regular payments, in one place.'
              : 'Give your spending a simple plan.'
      }
    >
      {!editing && (
        <View
          style={{
            flexDirection: 'row',
            gap: 4,
            padding: 4,
            borderRadius: 16,
            backgroundColor: `${theme.text}0F`,
          }}
        >
          {[
            { value: 'budgets', label: 'Budgets' },
            { value: 'goals', label: 'Goals' },
            { value: 'recurring', label: 'Recurring' },
          ].map((item) => (
            <Pressable
              key={item.value}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: mode === item.value }}
              onPress={() => setMode(item.value)}
              style={{
                flex: 1,
                minHeight: 46,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 13,
                backgroundColor: mode === item.value ? theme.text : 'transparent',
              }}
            >
              <AppText
                style={{
                  fontSize: 14,
                  fontFamily: mode === item.value ? 'DMSansBold' : 'DMSans',
                  color: mode === item.value ? theme.surface : theme.muted,
                }}
              >
                {item.label}
              </AppText>
            </Pressable>
          ))}
        </View>
      )}
      {mode === 'budgets' ? (
        <Budgets onEditing={setEditing} onCreate={setCreate} />
      ) : mode === 'goals' ? (
        <Goals onEditing={setEditing} onCreate={setCreate} />
      ) : (
        <Recurring onEditing={setEditing} onCreate={setCreate} />
      )}
    </Screen>
  );
}
