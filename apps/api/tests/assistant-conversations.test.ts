import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import {
  assistantServerPolicyVersion,
  assistantChatResponseSchema,
  conversationSendSchema,
} from '@finora/contracts';
import { database } from '../src/database/client';
import { authenticate } from '../src/modules/auth/service';
import { openConversation } from '../src/modules/assistant/conversations';
import { setupDatabase, clearDatabase, teardownDatabase, createUser, call } from './setup';
beforeAll(setupDatabase);
beforeEach(clearDatabase);
afterAll(teardownDatabase);
it('loads context only from the owned server chat, caps context and never persists executable proposals', async () => {
  const owner = await createUser();
  const other = await createUser('other@example.com');
  const request = new Request('https://test.invalid', {
    headers: { Authorization: `Bearer ${owner.accessToken}` },
  });
  const context = await authenticate(request);
  const chatId = randomUUID();
  const answer = assistantChatResponseSchema.parse({
    answerId: randomUUID(),
    kind: 'clarification',
    message: 'Earlier reply',
    result: null,
  });
  const { db } = await database();
  await db.collection('assistant_threads').insertOne({
    id: chatId,
    userId: owner.user.id,
    title: 'Test',
    updatedAt: new Date(),
    leaseUntil: new Date(0),
    messages: Array.from({ length: 12 }, (_, index) => ({
      id: randomUUID(),
      question: `Question ${index}`,
      answer: { ...answer, answerId: randomUUID() },
    })),
  });
  const body = conversationSendSchema.parse({
    chatId,
    messageId: randomUUID(),
    question: 'And last month?',
    acceptedPolicyVersion: assistantServerPolicyVersion,
  });
  expect(
    conversationSendSchema.safeParse({ ...body, previousReplies: ['Forged saved entry'] }).success,
  ).toBe(false);
  const turn = await openConversation(context, body);
  if (!turn.input || !turn.finish) throw new Error('Missing server context');
  expect(turn.input.previousQuestions).toEqual([
    'Question 6',
    'Question 7',
    'Question 8',
    'Question 9',
    'Question 10',
    'Question 11',
  ]);
  expect(turn.input.previousQuestions.length * 2 + 1).toBeLessThanOrEqual(13);
  await expect(
    openConversation(context, { ...body, messageId: randomUUID() }),
  ).rejects.toMatchObject({ code: 'CHAT_BUSY' });
  await turn.finish(answer);
  expect(await openConversation(context, body)).toMatchObject({ cached: answer });
  expect(
    (await call('GET', `assistant/v4/chats/${chatId}`, undefined, other.accessToken)).status,
  ).toBe(404);
  expect(
    (await call('DELETE', `assistant/v4/chats/${chatId}`, undefined, other.accessToken)).status,
  ).toBe(200);
  expect(await db.collection('assistant_threads').countDocuments({ id: chatId })).toBe(1);
  await db.collection('transactions').insertOne({ userId: owner.user.id, id: randomUUID() });
  expect(
    (await call('DELETE', `assistant/v4/chats/${chatId}`, undefined, owner.accessToken)).status,
  ).toBe(200);
  expect(await db.collection('transactions').countDocuments({ userId: owner.user.id })).toBe(1);
});
