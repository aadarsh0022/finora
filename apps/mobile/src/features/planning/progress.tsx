import { View } from 'react-native';
import { chartRatio } from '../reports/values';
import { useTheme } from '../../theme';

export function PlanningProgress({
  amount,
  target,
  label,
  danger = false,
}: {
  amount: string;
  target: string;
  label: string;
  danger?: boolean;
}) {
  const theme = useTheme();
  const percent = chartRatio(amount, target) * 100;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={{ height: 7, borderRadius: 4, backgroundColor: theme.border, overflow: 'hidden' }}
    >
      <View
        style={{
          height: '100%',
          width: `${percent}%`,
          borderRadius: 4,
          backgroundColor: danger ? theme.danger : theme.accent,
        }}
      />
    </View>
  );
}
