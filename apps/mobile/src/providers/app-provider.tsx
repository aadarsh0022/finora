import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { userSchema, type SessionTokens, type User } from '@finora/contracts';
import { ApiClient, ClientError, storedTokensSchema, type TokenStore } from '../api/client';
import { useUi } from '../stores/ui';

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
  const [api] = useState(
    () =>
      new ApiClient(
        process.env.EXPO_PUBLIC_API_URL ?? '',
        secureStore,
        () => {
          queryClient.clear();
          useUi.getState().reset();
          setUser(null);
          setPhase('ready');
        },
        fetch,
        __DEV__,
      ),
  );
  async function restore() {
    setPhase('loading');
    setError('');
    try {
      const tokens = await secureStore.get();
      if (tokens) setUser(await api.request('auth/me', userSchema));
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
    }
  }
  useEffect(() => {
    void restore();
  }, []);
  async function acceptSession(tokens: SessionTokens) {
    await api.setSession(tokens);
    queryClient.clear();
    useUi.getState().reset();
    setUser(tokens.user);
    setPhase('ready');
  }
  async function refreshUser() {
    setUser(await api.request('auth/me', userSchema));
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
          clearSession: () => api.clearSession(),
          refreshUser,
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
