import { useState } from 'react';
import { router } from 'expo-router';
import { AppButton, Screen } from '../../src/components/ui';
import { Budgets } from '../../src/features/planning/budgets';

export default function BudgetsTab() {
  const [editing, setEditing] = useState(false);
  return (
    <Screen title="Budgets" subtitle="A plan for the things you value.">
      <Budgets onEditing={setEditing} />
      {!editing && (
        <>
          <AppButton
            title="Savings goals"
            variant="secondary"
            onPress={() => router.push({ pathname: '/planning', params: { mode: 'goals' } })}
          />
          <AppButton
            title="Recurring transactions"
            variant="secondary"
            onPress={() => router.push({ pathname: '/planning', params: { mode: 'recurring' } })}
          />
        </>
      )}
    </Screen>
  );
}
