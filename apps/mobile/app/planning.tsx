import { useState } from 'react';
import { Choice, Screen } from '../src/components/ui';
import { Budgets } from '../src/features/planning/budgets';
import { Goals } from '../src/features/planning/goals';
import { Recurring } from '../src/features/planning/recurring';

export default function Planning() {
  const [mode, setMode] = useState('budgets');
  const [editing, setEditing] = useState(false);
  return (
    <Screen title="Plan ahead" subtitle="Small steps toward more financial breathing room.">
      {!editing && (
        <Choice
          label="Explore"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'budgets', label: 'Budgets' },
            { value: 'goals', label: 'Goals' },
            { value: 'recurring', label: 'Recurring' },
          ]}
        />
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
