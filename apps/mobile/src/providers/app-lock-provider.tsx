import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { AppState, Modal, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { AppLockController } from '../security/app-lock';
import { useApp } from './app-provider';
import { AppButton, AppText, Card, Feedback, Loading, Screen } from '../components/ui';
import { useTheme } from '../theme';

const key = (userId: string) => `finora.app-lock.v1.${userId}`;
const LockContext = createContext<AppLockController | null>(null);
export function AppLockProvider({ children }: { children: ReactNode }) {
  const { user, clearSession } = useApp();
  const theme = useTheme();
  const [controller] = useState(
    () =>
      new AppLockController({
        async read(userId) {
          const value = await SecureStore.getItemAsync(key(userId));
          if (value !== null && value !== 'enabled' && value !== 'disabled')
            throw new Error('App-lock settings cannot be validated.');
          return value === 'enabled';
        },
        async write(userId, enabled) {
          await SecureStore.setItemAsync(key(userId), enabled ? 'enabled' : 'disabled', {
            keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
          });
        },
        async available() {
          return (
            (await LocalAuthentication.hasHardwareAsync()) &&
            (await LocalAuthentication.isEnrolledAsync()) &&
            (await LocalAuthentication.getEnrolledLevelAsync()) ===
              LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG
          );
        },
        async authenticate() {
          return (
            await LocalAuthentication.authenticateAsync({
              promptMessage: 'Unlock Finora',
              cancelLabel: 'Cancel',
              disableDeviceFallback: true,
              biometricsSecurityLevel: 'strong',
              requireConfirmation: true,
            })
          ).success;
        },
      }),
  );
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    void controller.select(user?.id ?? null);
  }, [controller, user?.id]);
  useEffect(() => {
    const apply = (value: string | null | undefined) =>
      controller.lifecycle(
        value === 'active' ? 'active' : value === 'background' ? 'background' : 'inactive',
      );
    apply(AppState.currentState);
    const subscription = AppState.addEventListener('change', apply);
    return () => subscription.remove();
  }, [controller]);
  const hidden =
    !!user &&
    (state.owner !== user.id ||
      !state.ready ||
      !state.active ||
      (state.enabled && !state.unlocked));
  async function signOutAndReset() {
    if (!user) return;
    const owner = user.id;
    setSigningOut(true);
    setError('');
    try {
      // Delete session credentials before removing the local lock policy.
      await clearSession();
      await controller.resetAfterSignOut(owner);
    } catch {
      setError('Could not clear saved credentials or app-lock settings. Please retry.');
    } finally {
      setSigningOut(false);
    }
  }
  return (
    <LockContext.Provider value={controller}>
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <View
          style={{ flex: 1, opacity: hidden ? 0 : 1 }}
          pointerEvents={hidden ? 'none' : 'auto'}
          accessibilityElementsHidden={hidden}
          importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
        >
          {children}
        </View>
        <Modal
          visible={hidden}
          animationType="none"
          presentationStyle="fullScreen"
          onRequestClose={() => undefined}
        >
          <View style={{ flex: 1, backgroundColor: theme.background }}>
            <Screen title="Finora is locked" subtitle="Your financial details are hidden.">
              {!state.ready && !state.error ? <Loading /> : null}
              {state.error ? (
                <Feedback
                  error={new Error(state.error)}
                  retry={() => {
                    if (!state.ready) void controller.select(user?.id ?? null);
                    else void controller.unlock();
                  }}
                />
              ) : null}
              {state.ready && state.enabled && (
                <AppButton
                  title="Unlock with biometrics"
                  loading={state.busy}
                  onPress={() => {
                    void controller.unlock();
                  }}
                />
              )}
              {error ? <Feedback error={new Error(error)} /> : null}
              <AppButton
                title="Sign out and reset app lock"
                variant="secondary"
                loading={signingOut}
                disabled={state.busy}
                onPress={() => {
                  void signOutAndReset();
                }}
              />
              <AppText tone="muted">
                If biometrics are unavailable, sign out here and use your email and password to sign
                in again.
              </AppText>
            </Screen>
          </View>
        </Modal>
      </View>
    </LockContext.Provider>
  );
}
export function AppLockSettings() {
  const controller = useContext(LockContext);
  if (!controller) throw new Error('AppLockProvider is required');
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  return (
    <Card>
      <AppText accessibilityRole="header" style={{ fontFamily: 'DMSansBold', fontSize: 22 }}>
        App lock
      </AppText>
      <AppText tone="muted">
        Optional device protection. Require a strong biometric when reopening Finora after it enters
        the background. This setting applies to this account on this device.
      </AppText>
      <AppText>{state.enabled ? 'Biometric lock is on.' : 'Biometric lock is off.'}</AppText>
      {state.error ? <Feedback error={new Error(state.error)} /> : null}
      <AppButton
        title={state.enabled ? 'Turn off biometric lock' : 'Enable biometric lock'}
        variant="secondary"
        loading={state.busy}
        disabled={!state.ready}
        onPress={() => {
          void (state.enabled ? controller.disable() : controller.enable());
        }}
      />
      {state.enabled && (
        <AppButton title="Lock now" variant="secondary" onPress={() => controller.lock()} />
      )}
    </Card>
  );
}
