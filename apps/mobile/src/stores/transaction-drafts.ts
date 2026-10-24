import { create } from 'zustand';
import { assistantTransactionDraftSchema, type AssistantTransactionDraft } from '@finora/contracts';

export const useTransactionDrafts = create<{
  active: { ownerId: string; answerId: string; value: AssistantTransactionDraft } | null;
  submitted: string[];
  open: (ownerId: string, answerId: string, value: AssistantTransactionDraft) => boolean;
  complete: (ownerId: string, answerId: string) => void;
  close: (ownerId: string, answerId: string) => void;
  reset: () => void;
}>((set, get) => ({
  active: null,
  submitted: [],
  open: (ownerId, answerId, value) => {
    if (get().submitted.includes(`${ownerId}:${answerId}`)) return false;
    set({ active: { ownerId, answerId, value: assistantTransactionDraftSchema.parse(value) } });
    return true;
  },
  complete: (ownerId, answerId) =>
    set((state) => ({ submitted: [...state.submitted.slice(-49), `${ownerId}:${answerId}`] })),
  close: (ownerId, answerId) => {
    if (get().active?.ownerId === ownerId && get().active?.answerId === answerId)
      set({ active: null });
  },
  reset: () => set({ active: null, submitted: [] }),
}));
