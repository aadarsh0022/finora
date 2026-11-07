import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { accentColorSchema, type AccentColor } from '@finora/contracts';
import { z } from 'zod';

const storageKey = 'finora.accent.v1';
const savedSchema = z.object({ accent: accentColorSchema.nullable(), dirty: z.boolean() });

interface Appearance {
  /** This device's choice while it is newer than the saved account value; null follows the account. */
  accent: AccentColor | null;
  /** True while the choice has not yet reached the server. */
  dirty: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  choose: (accent: AccentColor) => void;
  markSynced: (accent: AccentColor) => void;
  followAccount: () => void;
  reset: () => void;
}

function persist(state: Pick<Appearance, 'accent' | 'dirty'>) {
  void SecureStore.setItemAsync(
    storageKey,
    JSON.stringify({ accent: state.accent, dirty: state.dirty }),
  ).catch(() => undefined);
}

/** Theme colour is a device-level look that is also saved to the account so it follows the user. */
export const useAppearance = create<Appearance>((set, get) => ({
  accent: null,
  dirty: false,
  hydrated: false,
  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(storageKey);
      const parsed = raw ? savedSchema.safeParse(JSON.parse(raw)) : undefined;
      if (parsed?.success && !get().dirty) set({ ...parsed.data, hydrated: true });
      else set({ hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
  choose: (accent) => {
    set({ accent, dirty: true });
    persist({ accent, dirty: true });
  },
  markSynced: (accent) => {
    // A newer choice made while saving stays pending.
    if (get().accent !== accent) return;
    set({ dirty: false });
    persist({ accent, dirty: false });
  },
  reset: () => {
    set({ accent: null, dirty: false });
    persist({ accent: null, dirty: false });
  },
  followAccount: () => {
    const { dirty, accent } = get();
    if (dirty || accent === null) return;
    set({ accent: null });
    persist({ accent: null, dirty: false });
  },
}));
