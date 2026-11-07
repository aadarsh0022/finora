import { useWindowDimensions, View, type DimensionValue, type ViewStyle } from 'react-native';
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
  | 'recurring'
  | 'categories'
  | 'detail'
  | 'bars'
  | 'activity';

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
  const { width, fontScale } = useWindowDimensions();
  return (
    <View style={{ flexDirection: width < 360 || fontScale > 1.2 ? 'column' : 'row', gap: 24 }}>
      {[0, 1].map((index) => (
        <View key={index} style={{ flex: 1, gap: 10 }}>
          <Block width="70%" height={12} />
          <Block width="85%" height={24} />
        </View>
      ))}
    </View>
  );
}
function Rows({ count = 3 }: { count?: number }) {
  const theme = useTheme();
  return (
    <View>
      {Array.from({ length: count }, (_, index) => index).map((index) => (
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
      <Panel style={{ minHeight: 168, backgroundColor: theme.accentSoft, borderWidth: 0, gap: 16 }}>
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
function Spaced({ children }: { children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      {children}
    </View>
  );
}
function Cards({ variant }: { variant: Variant }) {
  const theme = useTheme();
  if (variant === 'accounts')
    return (
      <>
        <Panel style={{ gap: 10, padding: 20, borderRadius: 20 }}>
          <Block width="40%" height={12} />
          <Block width="58%" height={32} />
          <Block width="24%" height={12} />
        </Panel>
        <Block height={44} radius={14} />
        <Panel style={{ padding: 0, gap: 0, borderRadius: 18, overflow: 'hidden' }}>
          {[0, 1, 2].map((index) => (
            <View
              key={index}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 16,
                minHeight: 88,
                borderTopWidth: index ? 1 : 0,
                borderTopColor: theme.border,
              }}
            >
              <Block width={42} height={42} radius={13} />
              <View style={{ flex: 1, gap: 8 }}>
                <Block width="50%" height={16} />
                <Block width="30%" height={12} />
              </View>
              <Block width="24%" height={18} />
            </View>
          ))}
        </Panel>
      </>
    );
  return (
    <>
      {[0, 1].map((index) => (
        <Panel key={index} style={{ gap: variant === 'budgets' ? 12 : 14 }}>
          {variant === 'categories' ? (
            <>
              <Block width="44%" height={18} />
              <Block width="22%" height={13} />
              <Block height={48} radius={14} />
            </>
          ) : variant === 'goals' ? (
            <>
              <Spaced>
                <Block width="50%" height={20} />
                <Block width={14} height={20} />
              </Spaced>
              <Block width="36%" height={26} />
              <Block height={8} radius={4} />
              <Spaced>
                <Block width="28%" height={12} />
                <Block width="22%" height={12} />
              </Spaced>
            </>
          ) : variant === 'budgets' ? (
            <>
              <Block width="48%" height={22} />
              <Block width="66%" height={14} />
              <Block height={8} radius={4} />
              <Block width="40%" height={14} />
              <Block width="70%" height={12} />
              <Block height={44} radius={12} />
            </>
          ) : variant === 'debts' ? (
            <>
              <Spaced>
                <Block width="46%" height={18} />
                <Block width="20%" height={14} />
              </Spaced>
              <Block width="50%" height={28} />
              <Block height={5} radius={3} />
              <Block width="44%" height={12} />
            </>
          ) : (
            <>
              <Spaced>
                <Block width="50%" height={18} />
                <Block width="22%" height={18} />
              </Spaced>
              <Block width="58%" height={12} />
              <Block width="48%" height={12} />
              <Block height={44} radius={12} />
            </>
          )}
        </Panel>
      ))}
    </>
  );
}
function Detail() {
  const theme = useTheme();
  return (
    <>
      <Panel style={{ gap: 14 }}>
        <Block width="40%" height={12} />
        <Block width="60%" height={34} />
        <Block height={8} radius={4} />
        <Metrics />
      </Panel>
      <Block width="40%" height={18} />
      <Panel style={{ paddingVertical: 0 }}>
        <Rows count={3} />
      </Panel>
      <Block height={50} radius={14} />
      <View style={{ height: 1, backgroundColor: theme.border }} />
    </>
  );
}
function Bars() {
  return (
    <View style={{ gap: 14 }}>
      {[0, 1, 2].map((index) => (
        <View key={index} style={{ gap: 8 }}>
          <Spaced>
            <Block width="34%" height={12} />
            <Block width="24%" height={12} />
          </Spaced>
          <Block height={8} radius={4} />
        </View>
      ))}
    </View>
  );
}
function Activity({ count }: { count: number }) {
  return (
    <>
      <Block width="30%" height={14} />
      <Panel style={{ paddingVertical: 0 }}>
        <Rows count={Math.min(4, count)} />
      </Panel>
      <Block width="26%" height={14} />
      <Panel style={{ paddingVertical: 0 }}>
        <Rows count={Math.max(2, count - 4)} />
      </Panel>
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
  const { height } = useWindowDimensions();
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
        ) : variant === 'detail' ? (
          <Detail />
        ) : variant === 'bars' ? (
          <Bars />
        ) : variant === 'activity' ? (
          <Activity count={Math.max(4, Math.min(8, Math.ceil((height - 320) / 66)))} />
        ) : variant === 'list' ? (
          <Rows count={Math.max(3, Math.min(10, Math.ceil((height - 240) / 66)))} />
        ) : (
          <Cards variant={variant} />
        )}
      </View>
    </View>
  );
}
