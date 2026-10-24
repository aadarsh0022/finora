import { MongoServerError } from 'mongodb';
import { database } from '../../database/client';
import { ApiError } from '../../utils/http';
import type { AuthContext } from '../auth/service';

export const dailyMessageLimit = 20;
// Server-owned identity only. This is never taken from a tool argument or browser role flag.
export const isAssistantAdmin = (context: AuthContext) =>
  context.user.email.toLowerCase() === 'aadarsh0022@gmail.com';
export function usageDay(now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const resetsAt = new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString();
  return { day, resetsAt };
}
export async function getAssistantUsage(context: AuthContext) {
  const { db } = await database();
  const { day, resetsAt } = usageDay();
  const record = await db.collection('assistant_usage').findOne({ userId: context.user.id, day });
  return {
    day,
    resetsAt,
    used: Number(record?.count ?? 0),
    limit: isAssistantAdmin(context) ? null : dailyMessageLimit,
  };
}
export async function reserveAssistantMessage(context: AuthContext) {
  const { db } = await database();
  const { day } = usageDay();
  const admin = isAssistantAdmin(context);
  try {
    const record = await db.collection('assistant_usage').findOneAndUpdate(
      { userId: context.user.id, day, ...(admin ? {} : { count: { $lt: dailyMessageLimit } }) },
      {
        $inc: { count: 1 },
        $set: { lastMessageAt: new Date() },
        $setOnInsert: {
          userId: context.user.id,
          day,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 90 * 86400000),
        },
      },
      { upsert: true, returnDocument: 'after' },
    );
    if (record) return;
  } catch (error) {
    if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
  }
  throw new ApiError(
    429,
    'ASSISTANT_DAILY_LIMIT',
    'You have used your 20 AI messages for today. Your allowance resets at 00:00 UTC.',
  );
}
