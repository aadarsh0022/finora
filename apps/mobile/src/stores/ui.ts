import { create } from 'zustand';
import { useTransactionDrafts } from './transaction-drafts';

export const useUi = create<{
  balancesHidden: boolean;
  toggleBalances: () => void;
  onboardingDismissedOwner: string | null;
  dismissOnboarding: (ownerId: string) => void;
  reset: () => void;
}>((set) => ({
  balancesHidden: false,
  onboardingDismissedOwner: null,
  dismissOnboarding: (ownerId) => set({ onboardingDismissedOwner: ownerId }),
  toggleBalances: () => set((state) => ({ balancesHidden: !state.balancesHidden })),
  reset: () => {
    useTransactionDrafts.getState().reset();
    set({ balancesHidden: false, onboardingDismissedOwner: null });
  },
}));
