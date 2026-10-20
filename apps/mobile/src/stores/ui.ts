import { create } from 'zustand';

export const useUi = create<{
  balancesHidden: boolean;
  toggleBalances: () => void;
  reset: () => void;
}>((set) => ({
  balancesHidden: false,
  toggleBalances: () => set((state) => ({ balancesHidden: !state.balancesHidden })),
  reset: () => set({ balancesHidden: false }),
}));
