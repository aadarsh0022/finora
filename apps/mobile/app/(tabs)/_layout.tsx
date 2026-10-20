import { Tabs } from 'expo-router/js-tabs';
import Svg, { Path } from 'react-native-svg';
import type { ColorValue } from 'react-native';
import { useTheme } from '../../src/theme';

export default function TabsLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.muted,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
        tabBarLabelStyle: { fontFamily: 'DMSans', fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <NavigationIcon name="home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Transactions',
          tabBarIcon: ({ color }) => <NavigationIcon name="transactions" color={color} />,
        }}
      />
      <Tabs.Screen
        name="budgets"
        options={{
          title: 'Budgets',
          tabBarIcon: ({ color }) => <NavigationIcon name="budgets" color={color} />,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reports',
          tabBarIcon: ({ color }) => <NavigationIcon name="reports" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <NavigationIcon name="settings" color={color} />,
        }}
      />
    </Tabs>
  );
}

function NavigationIcon({
  name,
  color,
}: {
  name: 'home' | 'transactions' | 'budgets' | 'reports' | 'settings';
  color: ColorValue;
}) {
  const paths = {
    home: 'M3 10.5 12 3l9 7.5M5 9v12h5v-7h4v7h5V9',
    transactions: 'M7 3v17m-4-4 4 4 4-4M17 21V4m-4 4 4-4 4 4',
    budgets: 'M4 7h16v14H4zM4 7V4h12v3m-2 5h6v5h-6z',
    reports: 'M4 3v18h17M8 16v-5m5 5V6m5 10v-8',
    settings: 'M3 6h7m4 0h7M3 12h11m4 0h3M3 18h3m4 0h11M10 3v6m4 0v6M6 15v6',
  };
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" accessible={false}>
      <Path
        d={paths[name]}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
