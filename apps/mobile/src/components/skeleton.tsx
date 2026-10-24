import { View, type DimensionValue, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';
import type { ReactNode } from 'react';

type Variant =
  | 'list'
  | 'dashboard'
  | 'form'
  | 'reports'
  | 'accounts'
  | 'goals'
  | 'debts'
  | 'budgets'
  | 'recurring';

function Block({
  width = '100%',
  height = 14,
  radius = 5,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
}) {
  const theme = useTheme();
  return <View style={{ width, height, borderRadius: radius, backgroundColor: theme.border }} />;
}
function Panel({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          padding: 16,
          gap: 14,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.surface,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
function Metrics() {
  return (
    <View style={{ flexDirection: 'row', gap: 24 }}>
      {[0, 1].map((index) => (
        <View key={index} style={{ flex: 1, gap: 10 }}>
          <Block width="70%" height={12} />
          <Block width="85%" height={24} />
        </View>
      ))}
    </View>
  );
}
function Rows() {
  const theme = useTheme();
  return (
    <View>
      {[0, 1, 2].map((index) => (
        <View
          key={index}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            minHeight: 66,
            paddingVertical: 12,
            paddingHorizontal: 2,
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
          }}
        >
          <Block width={38} height={38} radius={19} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <Block width="44%" height={16} />
              <Block width="30%" height={18} />
            </View>
            <Block width="48%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}
function Dashboard() {
  const theme = useTheme();
  return (
    <>
      <Panel style={{ minHeight: 140, backgroundColor: theme.accentSoft, borderWidth: 0, gap: 16 }}>
        <Block width="48%" height={14} />
        <Block width="65%" height={40} />
        <Block width="45%" height={12} />
      </Panel>
      <Panel style={{ gap: 16, borderWidth: 0 }}>
        <Metrics />
        <View style={{ height: 1, backgroundColor: theme.border }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Block width="34%" height={12} />
          <Block width="26%" height={14} />
        </View>
      </Panel>
      <Panel style={{ backgroundColor: theme.accentSoft, borderWidth: 0, gap: 14 }}>
        <Block width="36%" />
        <Block width="65%" height={30} />
        <Block width="80%" height={12} />
        <Block width="42%" height={12} />
      </Panel>
      <Block width="45%" height={18} />
      <Panel style={{ paddingVertical: 0 }}>
        <Rows />
      </Panel>
    </>
  );
}
function Form() {
  return (
    <View style={{ gap: 24 }}>
      {[0, 1, 2, 3].map((index) => (
        <View key={index} style={{ gap: 10 }}>
          <Block width={index === 0 ? '30%' : '42%'} height={14} />
          <Panel style={{ minHeight: 52, justifyContent: 'center' }}>
            <Block width="48%" />
          </Panel>
        </View>
      ))}
      <Block height={52} radius={14} />
    </View>
  );
}
function Cards({ variant }: { variant: Variant }) {
  return (
    <>
      {[0, 1].map((index) => (
        <Panel key={index} style={{ gap: 16 }}>
          <Block width="48%" height={22} />
          <Block width="66%" height={13} />
          {variant === 'accounts' || variant === 'debts' ? (
            <Block width="64%" height={32} />
          ) : (
            <Block height={8} radius={4} />
          )}
          <Block width="44%" height={12} />
          {(variant === 'accounts' || variant === 'budgets') && <Block height={44} radius={12} />}
        </Panel>
      ))}
    </>
  );
}
function Reports() {
  const theme = useTheme();
  return (
    <>
      <Panel style={{ backgroundColor: theme.accentSoft, borderWidth: 0 }}>
        <Block width="64%" height={20} />
        <Block width="48%" height={12} />
        <Metrics />
        <Block height={44} radius={12} />
      </Panel>
      <Panel>
        <Block width="64%" height={20} />
        <Block width="48%" height={12} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 12 }}>
          <View
            style={{
              width: 132,
              height: 132,
              borderRadius: 66,
              borderWidth: 22,
              borderColor: theme.border,
            }}
          />
          <View style={{ flex: 1, gap: 16 }}>
            {[0, 1, 2, 3, 4].map((index) => (
              <Block key={index} height={12} />
            ))}
          </View>
        </View>
      </Panel>
      <Panel>
        <Block width="55%" height={20} />
        <Block width="78%" height={10} />
        <Block height={10} />
      </Panel>
    </>
  );
}
export function Loading({ variant = 'list' }: { variant?: Variant }) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading your records"
      accessibilityState={{ busy: true }}
      testID={`skeleton-${variant}`}
      style={{ width: '100%' }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ gap: 20 }}
      >
        {variant === 'dashboard' ? (
          <Dashboard />
        ) : variant === 'reports' ? (
          <Reports />
        ) : variant === 'form' ? (
          <Form />
        ) : variant === 'list' ? (
          <Rows />
        ) : (
          <Cards variant={variant} />
        )}
      </View>
    </View>
  );
}
