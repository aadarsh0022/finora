import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { Startup } from '../src/components/startup';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { DMSans_400Regular } from '@expo-google-fonts/dm-sans/400Regular';
import { DMSans_700Bold } from '@expo-google-fonts/dm-sans/700Bold';
import { AppProvider, useApp } from '../src/providers/app-provider';
import { AppLockProvider } from '../src/providers/app-lock-provider';
import { AppButton, AppText, Feedback, Screen } from '../src/components/ui';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../src/theme';

// Keep the native logo visible until React can paint the branded startup or navigation.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);
const hideSplash = () => {
  void SplashScreen.hideAsync().catch(() => undefined);
};

function Navigation() {
  const { user, phase, error, restore, clearSession } = useApp();
  const theme = useTheme();
  const [fontsLoaded, fontError] = useFonts({
    DMSans: DMSans_400Regular,
    DMSansBold: DMSans_700Bold,
  });
  const starting = phase === 'loading' || (!fontsLoaded && !fontError);
  useEffect(() => {
    if (!starting) hideSplash();
  }, [starting]);
  if (starting) return <Startup onReady={hideSplash} />;
  if (phase === 'error')
    return (
      <Screen title="Let’s reconnect">
        <Feedback
          error={new Error(error)}
          retry={() => {
            void restore();
          }}
        />
        <AppButton
          title="Sign out on this device"
          variant="secondary"
          onPress={() => {
            void clearSession();
          }}
        />
        <AppText tone="muted">
          Local sign-out removes saved credentials. The server session expires automatically.
        </AppText>
      </Screen>
    );
  return (
    <>
      <StatusBar style={theme.onAccent === '#FFFFFF' ? 'dark' : 'light'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.text,
          contentStyle: { backgroundColor: theme.background },
          headerShadowVisible: false,
          headerTitle: '',
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Protected guard={!user} redirectTo="/(tabs)">
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!!user} redirectTo="/(auth)/register">
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="account" options={{ title: 'Account' }} />
          <Stack.Screen name="accounts" options={{ title: 'Accounts' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
          <Stack.Screen name="assistant" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen
            name="transaction"
            options={{ title: 'Transaction', presentation: 'modal' }}
          />
          <Stack.Screen name="categories" options={{ title: 'Categories' }} />
          <Stack.Screen name="security" options={{ title: 'Security' }} />
          <Stack.Screen name="planning" options={{ title: 'Plan ahead' }} />
          <Stack.Screen name="debts" options={{ title: 'Debts' }} />
          <Stack.Screen name="loans" options={{ title: 'Loans & EMIs' }} />
          <Stack.Screen name="income" options={{ title: 'Income' }} />
          <Stack.Screen name="sync" options={{ title: 'Review entries' }} />
          <Stack.Screen name="favourites" options={{ title: 'Quick entry' }} />
          <Stack.Screen name="reminders" options={{ title: 'Reminders' }} />
          <Stack.Screen name="receivables" options={{ title: 'Money coming back' }} />
          <Stack.Screen name="debt" options={{ title: 'Debt' }} />
          <Stack.Screen name="backup" options={{ title: 'Export & backup' }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}
export default function Root() {
  return (
    <AppProvider>
      <AppLockProvider>
        <Navigation />
      </AppLockProvider>
    </AppProvider>
  );
}
