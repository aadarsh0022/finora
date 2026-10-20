import { createHmac } from 'node:crypto';
import { MongoServerError } from 'mongodb';
import { getEnv } from '../config/env';
import { database } from '../database/client';
import { ApiError } from '../utils/http';

export async function rateLimit(request: Request, scope: string, identity?: string) {
  const env = getEnv();
  // Only enable TRUST_PROXY behind a proxy that replaces client-supplied forwarded headers.
  const address =
    env.TRUST_PROXY === 'true'
      ? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
      : 'direct';
  const bucket = Math.floor(Date.now() / 600000);
  const digest = createHmac('sha256', env.RATE_LIMIT_SECRET)
    .update(`${scope}|${identity ?? address}|${bucket}`)
    .digest('hex');
  const { rateLimits } = await database();
  let record;
  try {
    record = await rateLimits.findOneAndUpdate(
      { key: digest },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((bucket + 2) * 600000) } },
      { upsert: true, returnDocument: 'after' },
    );
  } catch (error) {
    if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
    record = await rateLimits.findOneAndUpdate(
      { key: digest },
      { $inc: { count: 1 } },
      { returnDocument: 'after' },
    );
  }
  const limit = identity ? 10 : 60;
  if (!record || record.count > limit)
    throw new ApiError(429, 'RATE_LIMITED', 'Too many attempts. Please try again in ten minutes.');
}
