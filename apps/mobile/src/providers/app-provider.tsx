import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { userSchema, type SessionTokens, type User } from '@finora/contracts';
import { ApiClient, ClientError, storedTokensSchema, type TokenStore } from '../api/client';
import { useUi } from '../stores/ui';
import { AppState } from 'react-native';
import { useNetworkState } from 'expo-network';
import { z } from 'zod';
import { cachedOwner, openVault, rememberOwner, type DeviceVault } from '../storage/vault';
import { canUseOffline, drainOutbox } from '../storage/outbox';
import { cancelLocalReminders, refreshLocalReminders } from '../notifications/reminders';

const tokenKey = 'finora.session.v1';
const secureStore: TokenStore = {
  async get() {
    const raw = await SecureStore.getItemAsync(tokenKey);
    if (!raw) return null;
    const parsed = storedTokensSchema.safeParse(JSON.parse(raw));
    if (!parsed.success)
      throw new ClientError(
        'SECURE_STORAGE',
        'Saved credentials cannot be read. Sign out locally and sign in again.',
      );
    return parsed.data;
  },
  set: (tokens) =>
    SecureStore.setItemAsync(tokenKey, JSON.stringify(tokens), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  clear: () => SecureStore.deleteItemAsync(tokenKey),
};
interface AppContextValue {
  api: ApiClient;
  user: User | null;
  phase: 'loading' | 'ready' | 'error';
  error: string;
  acceptSession(tokens: SessionTokens): Promise<void>;
  restore(): Promise<void>;
  clearSession(): Promise<void>;
  refreshUser(): Promise<void>;
  vault?: DeviceVault;
  storageError: string;
  syncPending(): Promise<void>;
  syncing: boolean;
}
const AppContext = createContext<AppContextValue | null>(null);
export function AppProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: 30000 },
          mutations: { retry: false },
        },
      }),
  );
  const [user, setUser] = useState<User | null>(null);
  const [phase, setPhase] = useState<AppContextValue['phase']>('loading');
  const [error, setError] = useState('');
  const [vault, setVault] = useState<DeviceVault>();
  const vaultRef = useRef<DeviceVault | undefined>(undefined);
  const verified = useRef(false);
  const [verifiedOnline, setVerifiedOnline] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const syncFlight = useRef<Promise<void> | null>(null);
  const restoring = useRef(false);
  const network = useNetworkState();
  const origin = process.env.EXPO_PUBLIC_API_URL ?? '';
  const [api] = useState(
    () =>
      new ApiClient(
        process.env.EXPO_PUBLIC_API_URL ?? '',
        secureStore,
        () => {
          void cancelLocalReminders().catch(() => undefined);
          queryClient.clear();
          useUi.getState().reset();
          setUser(null);
          setPhase('ready');
          verified.current = false;
          setVerifiedOnline(false);
          const previous = vaultRef.current;
          vaultRef.current = undefined;
          setVault(undefined);
          void previous?.close().catch(() => undefined);
        },
        fetch,
        __DEV__,
      ),
  );
  async function activate(nextUser: User) {
    let current = vaultRef.current;
    if (current?.ownerId !== nextUser.id) {
      vaultRef.current = undefined;
      setVault(undefined);
      await current?.close();
      current = await openVault(origin, nextUser.id);
      vaultRef.current = current;
      setVault(current);
    }
    await current.write('profile', { schemaVersion: 1, user: nextUser });
    await rememberOwner(origin, nextUser.id);
    return current;
  }
  async function syncPending() {
    if (syncFlight.current) return syncFlight.current;
    const current = vaultRef.current;
    if (!current) return;
    setSyncing(true);
    const flight = (async () => {
      try {
        if (!verified.current) await refreshUser();
        if (vaultRef.current !== current) return;
        const count = await drainOutbox(
          current,
          api,
          () => vaultRef.current === current && verified.current,
        );
        if (count && vaultRef.current === current)
          await queryClient.invalidateQueries({ queryKey: [current.ownerId] });
        if (count && user && vaultRef.current === current)
          void refreshLocalReminders(current, api, user).catch(() => undefined);
      } finally {
        if (vaultRef.current === current)
          await queryClient.invalidateQueries({ queryKey: [current.ownerId, 'local'] });
        setSyncing(false);
      }
    })();
    syncFlight.current = flight;
    try {
      await flight;
    } finally {
      if (syncFlight.current === flight) syncFlight.current = null;
    }
  }
  async function restore() {
    if (restoring.current) return;
    restoring.current = true;
    if (!vaultRef.current) setPhase('loading');
    setError('');
    try {
      const tokens = await secureStore.get();
      if (tokens) {
        let savedUser: User | undefined;
        try {
          const owner = await cachedOwner(origin);
          if (owner) {
            const current =
              vaultRef.current?.ownerId === owner
                ? vaultRef.current
                : await openVault(origin, owner);
            const profile = await current.read(
              'profile',
              z.object({ schemaVersion: z.literal(1), user: userSchema }),
              7 * 86400000,
            );
            if (profile?.value.user.id === owner) {
              savedUser = profile.value.user;
              vaultRef.current = current;
              setVault(current);
              setUser(savedUser);
              setPhase('ready');
            } else {
              if (vaultRef.current === current) {
                vaultRef.current = undefined;
                setVault(undefined);
              }
              await current.close();
            }
          }
        } catch {
          setStorageError(
            'Encrypted local storage is unavailable in this build. Online features remain available.',
          );
        }
        try {
          const fresh = await api.request('auth/me', userSchema);
          if (savedUser && fresh.id !== savedUser.id) {
            queryClient.clear();
            setUser(null);
          }
          setUser(fresh);
          try {
            await activate(fresh);
            setStorageError('');
          } catch {
            setStorageError(
              'Encrypted local storage is unavailable. Pending entries remain on this device.',
            );
          }
          verified.current = true;
          setVerifiedOnline(true);
        } catch (failure) {
          if (
            !savedUser ||
            !(
              canUseOffline(failure) ||
              (failure instanceof ClientError && (failure.status >= 500 || failure.status === 429))
            )
          )
            throw failure;
        }
      }
      setPhase('ready');
    } catch (failure) {
      if (failure instanceof ClientError && failure.status === 401) {
        setUser(null);
        setPhase('ready');
      } else {
        setError(
          failure instanceof Error ? failure.message : 'Cannot restore the session. Please retry.',
        );
        setPhase('error');
      }
    } finally {
      restoring.current = false;
    }
  }
  useEffect(() => {
    void restore();
  }, []);
  useEffect(() => {
    if (user && vault && verifiedOnline)
      void refreshLocalReminders(vault, api, user).catch(() => undefined);
    else if (!user && phase === 'ready') void cancelLocalReminders().catch(() => undefined);
  }, [user, vault, verifiedOnline, phase, api]);
  useEffect(() => {
    if (network.isConnected && vault && !restoring.current)
      void syncPending().catch(() =>
        setStorageError('Pending entries could not be synchronized. Open Sync status to retry.'),
      );
  }, [network.isConnected, verifiedOnline, vault]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (verified.current) void syncPending().catch(() => undefined);
        else if (vaultRef.current) void restore();
        if (verified.current && user && vaultRef.current)
          void refreshLocalReminders(vaultRef.current, api, user).catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, [api, user]);
  async function acceptSession(tokens: SessionTokens) {
    await cancelLocalReminders().catch(() => undefined);
    verified.current = false;
    setVerifiedOnline(false);
    await rememberOwner(origin, null);
    await api.setSession(tokens);
    queryClient.clear();
    useUi.getState().reset();
    setUser(tokens.user);
    try {
      await activate(tokens.user);
      setStorageError('');
    } catch {
      setStorageError(
        'Encrypted local storage is unavailable in this build. Online features remain available.',
      );
    }
    verified.current = true;
    setVerifiedOnline(true);
    setPhase('ready');
  }
  async function refreshUser() {
    const fresh = await api.request('auth/me', userSchema);
    setUser(fresh);
    try {
      await activate(fresh);
    } catch {
      setStorageError('Encrypted local storage is unavailable. Online features remain available.');
    }
    verified.current = true;
    setVerifiedOnline(true);
  }
  return (
    <QueryClientProvider client={queryClient}>
      <AppContext.Provider
        value={{
          api,
          user,
          phase,
          error,
          restore,
          acceptSession,
          clearSession: async () => {
            await cancelLocalReminders().catch(() => undefined);
            const previous = vaultRef.current;
            vaultRef.current = undefined;
            setVault(undefined);
            await api.clearSession();
            await rememberOwner(origin, null);
            await previous?.close(true);
          },
          refreshUser,
          vault,
          storageError,
          syncing,
          syncPending,
        }}
      >
        {children}
      </AppContext.Provider>
    </QueryClientProvider>
  );
}
export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('AppProvider is required');
  return context;
}
