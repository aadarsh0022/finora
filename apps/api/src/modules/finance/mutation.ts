import { createHash } from 'node:crypto';
import { type ClientSession, type Db } from 'mongodb';
import { z } from 'zod';
import { database } from '../../database/client';
import type { AuthContext } from '../auth/service';
import { ApiError } from '../../utils/http';
import { rateLimit } from '../../security/rate-limit';

export async function mutate<T>(
  context: AuthContext,
  request: Request,
  input: unknown,
  action: (db: Db, session: ClientSession) => Promise<T>,
): Promise<T> {
  await rateLimit(request, 'financial-mutations', context.user.id, 120);
  const id = z.uuid().parse(request.headers.get('Idempotency-Key'));
  const fingerprint = createHash('sha256')
    .update(`${request.method}|${new URL(request.url).pathname}|${JSON.stringify(input)}`)
    .digest('hex');
  const { client, db, users } = await database();
  const session = client.startSession();
  try {
    const work = session.withTransaction(async () => {
      // Serializes financial mutations against account deletion, password revocation,
      // archived references, duplicate default seeding and conflicting writes.
      const lock = await users.updateOne(
        {
          id: context.user.id,
          authVersion: context.user.authVersion,
          settingsVersion: context.user.settingsVersion,
        },
        { $inc: { financeVersion: 1 } },
        { session },
      );
      if (!lock.matchedCount) {
        const current = await users.findOne(
          { id: context.user.id, authVersion: context.user.authVersion },
          { session },
        );
        if (!current) throw new ApiError(401, 'UNAUTHORIZED', 'Please sign in again.');
        throw new ApiError(
          409,
          'SETTINGS_CONFLICT',
          'Your preferences changed. Refresh and retry.',
        );
      }
      const records = db.collection<{
        userId: string;
        id: string;
        fingerprint: string;
        result: T;
        createdAt: string;
      }>('idempotency_records');
      const existing = await records.findOne({ userId: context.user.id, id }, { session });
      if (existing) {
        if (existing.fingerprint !== fingerprint)
          throw new ApiError(
            409,
            'IDEMPOTENCY_CONFLICT',
            'This operation key was already used for different data.',
          );
        return existing.result;
      }
      const result = await action(db, session);
      await records.insertOne(
        { userId: context.user.id, id, fingerprint, result, createdAt: new Date().toISOString() },
        { session },
      );
      return result;
    });
    // The driver retries write conflicts for up to two minutes; the app gives up long before that.
    // Past 8 seconds, answer "busy, retry" and let endSession abort the transaction. The write is
    // idempotent, so retrying is safe.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new ApiError(503, 'SERVER_BUSY', 'The server is busy. Please retry.')),
        8000,
      );
    });
    work.catch(() => undefined);
    try {
      return await Promise.race([work, deadline]);
    } finally {
      clearTimeout(timer);
    }
  } finally {
    await session.endSession();
  }
}

export function requireVersion(actual: number, expected: number) {
  if (actual !== expected)
    throw new ApiError(
      409,
      'VERSION_CONFLICT',
      'This record changed on another device. Refresh before editing.',
    );
}
export const notFound = () => new ApiError(404, 'NOT_FOUND', 'This record was not found.');

export async function enforceLimit(
  db: Db,
  session: ClientSession,
  collection: string,
  userId: string,
  maximum: number,
) {
  const count = await db
    .collection(collection)
    .countDocuments({ userId }, { session, limit: maximum });
  if (count >= maximum)
    throw new ApiError(
      409,
      'RECORD_LIMIT',
      `This version supports up to ${maximum} ${collection.replaceAll('_', ' ')}. Export or archive records as appropriate.`,
    );
}
