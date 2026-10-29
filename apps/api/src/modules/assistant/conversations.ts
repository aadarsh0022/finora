import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  assistantPolicyVersion,
  type conversationSendSchema,
  conversationMessageSchema,
  type assistantChatResponseSchema,
} from '@finora/contracts';
import { database } from '../../database/client';
import { ApiError, success } from '../../utils/http';
import type { AuthContext } from '../auth/service';
const messagesSchema = z.array(conversationMessageSchema).max(40);
export async function openConversation(
  context: AuthContext,
  body: z.infer<typeof conversationSendSchema>,
) {
  const { db } = await database();
  const threads = db.collection('assistant_threads');
  const filter = { id: body.chatId, userId: context.user.id };
  const existing = await threads.findOne(filter);
  if (!existing) {
    try {
      await threads.insertOne({
        ...filter,
        title: body.question.slice(0, 100),
        messages: [],
        updatedAt: new Date(),
        leaseUntil: new Date(0),
      });
    } catch (failure) {
      if (!(failure instanceof Error && 'code' in failure && failure.code === 11000)) throw failure;
    }
  }
  const lease = randomUUID();
  const thread = await threads.findOneAndUpdate(
    { ...filter, leaseUntil: { $lte: new Date() } },
    { $set: { lease, leaseUntil: new Date(Date.now() + 180000) } },
    { returnDocument: 'after' },
  );
  if (!thread) throw new ApiError(409, 'CHAT_BUSY', 'Wait for the current reply, then try again.');
  let messages = messagesSchema.parse(thread.messages);
  const release = () =>
    threads.updateOne(
      { ...filter, lease },
      { $set: { leaseUntil: new Date(0) }, $unset: { lease: '' } },
    );
  try {
    const repeated = messages.find((message) => message.id === body.messageId);
    if (repeated && repeated.question !== body.question)
      throw new ApiError(409, 'MESSAGE_CONFLICT', 'Start a new message for these changes.');
    if (repeated?.answer) {
      await release();
      return { cached: repeated.answer };
    }
    if (body.editOf) {
      const index = messages.findIndex((message) => message.answer?.answerId === body.editOf);
      if (index < 0)
        throw new ApiError(409, 'MESSAGE_MISSING', 'Open the latest chat and try again.');
      messages = messages.slice(0, index);
    }
    const previous = messages.filter((message) => message.answer).slice(-4);
    const input = {
      question: body.question,
      previousQuestions: previous.map((message) => message.question),
      previousReplies: previous.map((message) => message.answer!.message.slice(0, 4000)),
      acceptedPolicyVersion: assistantPolicyVersion,
    };
    const pending = { id: body.messageId, question: body.question, answer: null };
    messages = [...messages.filter((message) => message.id !== body.messageId), pending].slice(-40);
    await threads.updateOne({ ...filter, lease }, { $set: { messages, updatedAt: new Date() } });
    return {
      input,
      release,
      finish: async (answer: z.infer<typeof assistantChatResponseSchema>) => {
        const safeAnswer = { ...answer, draft: null, change: null, prepared: [] };
        await threads.updateOne(
          { ...filter, lease },
          {
            $set: {
              messages: messages.map((message) =>
                message.id === body.messageId ? { ...message, answer: safeAnswer } : message,
              ),
              updatedAt: new Date(),
              leaseUntil: new Date(0),
            },
            $unset: { lease: '' },
          },
        );
      },
    };
  } catch (failure) {
    await release();
    throw failure;
  }
}

export async function conversationRoute(request: Request, context: AuthContext, requestId: string) {
  const path = new URL(request.url).pathname;
  const match = /^\/api\/v1\/assistant\/v4\/chats(?:\/([a-f0-9-]+))?$/.exec(path);
  if (!match) return null;
  const { db } = await database();
  const collection = db.collection('assistant_threads');
  const id = match[1] ? z.uuid().parse(match[1]) : undefined;
  if (request.method === 'GET') {
    if (id) {
      const thread = await collection.findOne({ id, userId: context.user.id });
      if (!thread) throw new ApiError(404, 'NOT_FOUND', 'This chat could not be found.');
      return success(
        { id, title: thread.title, messages: messagesSchema.parse(thread.messages) },
        requestId,
      );
    }
    const threads = await collection
      .find({ userId: context.user.id }, { projection: { id: 1, title: 1, updatedAt: 1 } })
      .sort({ updatedAt: -1 })
      .limit(50)
      .toArray();
    return success(
      threads.map((thread) => ({
        id: thread.id,
        title: thread.title,
        updatedAt: new Date(thread.updatedAt).toISOString(),
      })),
      requestId,
    );
  }
  if (request.method === 'DELETE' && id) {
    const result = await collection.deleteOne({
      id,
      userId: context.user.id,
      leaseUntil: { $lte: new Date() },
    });
    if (!result.deletedCount && (await collection.findOne({ id, userId: context.user.id })))
      throw new ApiError(409, 'CHAT_BUSY', 'Wait for the reply before deleting this chat.');
    return success({ message: 'Chat deleted.' }, requestId);
  }
  throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Choose a supported chat action.');
}
