import { z } from 'zod';
import { assistantChatResponseSchema, assistantProgressSchema } from '@finora/contracts';
export const chatTurnSchema = z.object({
  question: z.string().max(4000),
  answer: assistantChatResponseSchema,
  steps: z.array(assistantProgressSchema).optional(),
  outcome: z.string().max(1000).optional(),
  restored: z.boolean().optional(),
});
export const savedChatSchema = z.object({
  id: z.uuid(),
  title: z.string().max(100),
  turns: z.array(chatTurnSchema).max(40),
});
export type SavedChat = z.infer<typeof savedChatSchema>;
export type ChatTurn = z.infer<typeof chatTurnSchema>;
export function chatSnapshot(id: string, turns: ChatTurn[]): SavedChat {
  return savedChatSchema.parse({
    id,
    title: turns[0]?.question.slice(0, 100) ?? 'New chat',
    turns: turns.slice(-40).map((turn) => {
      const pending =
        !!turn.answer.draft || !!turn.answer.change || turn.answer.prepared.length > 0;
      return {
        ...turn,
        restored: true,
        answer: {
          ...turn.answer,
          ...(pending
            ? {
                message: turn.outcome ?? 'Draft not saved. Ask again if you want to continue.',
                kind: 'clarification',
              }
            : {}),
          draft: null,
          change: null,
          prepared: [],
        },
      };
    }),
  });
}
