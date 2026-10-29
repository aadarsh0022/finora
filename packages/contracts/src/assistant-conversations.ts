import { z } from 'zod';
import { assistantCapabilitiesSchema, assistantChatResponseSchema } from './assistant';
export const assistantServerPolicyVersion = '2026-10-29-v4' as const;
export const assistantServerCapabilitiesSchema = assistantCapabilitiesSchema.extend({
  policyVersion: z.literal(assistantServerPolicyVersion),
});
export const conversationMessageSchema = z.object({
  id: z.uuid(),
  question: z.string().max(4000),
  answer: assistantChatResponseSchema.nullable(),
  outcome: z.string().max(4000).optional(),
});
export const conversationSchema = z.object({
  id: z.uuid(),
  title: z.string().max(100),
  messages: z.array(conversationMessageSchema).max(40),
});
export const conversationListSchema = z
  .array(z.object({ id: z.uuid(), title: z.string().max(100), updatedAt: z.iso.datetime() }))
  .max(50);
export const conversationSendSchema = z
  .object({
    chatId: z.uuid(),
    messageId: z.uuid(),
    question: z.string().trim().min(1).max(4000),
    editOf: z.uuid().nullable().default(null),
    acceptedPolicyVersion: z.literal(assistantServerPolicyVersion),
  })
  .strict();
