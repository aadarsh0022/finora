import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';
import { AppText, Screen } from '../src/components/ui';
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
  return (
    <Screen
      includeTopInset={false}
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
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
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
                borderRadius: 12,
                backgroundColor: mode === item.value ? theme.accentSoft : theme.surface,
              }}
            >
              <AppText
                tone={mode === item.value ? 'accent' : 'muted'}
                style={{ fontSize: 14, fontFamily: mode === item.value ? 'DMSansBold' : 'DMSans' }}
              >
                {item.label}
              </AppText>
            </Pressable>
          ))}
        </View>
      )}
      {mode === 'budgets' ? (
        <Budgets onEditing={setEditing} />
      ) : mode === 'goals' ? (
        <Goals onEditing={setEditing} />
      ) : (
        <Recurring onEditing={setEditing} />
      )}
    </Screen>
  );
}
