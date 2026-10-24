import { z } from 'zod';
import { adminOverviewSchema } from '@finora/contracts';
import { authenticate } from '../auth/service';
import { database } from '../../database/client';
import { ApiError, success } from '../../utils/http';
import { isAssistantAdmin, usageDay, dailyMessageLimit } from './usage';
export async function adminRoute(request: Request, requestId: string) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/v1/admin/')) return null;
  const context = await authenticate(request);
  if (!isAssistantAdmin(context))
    throw new ApiError(403, 'FORBIDDEN', 'Administrator access is required.');
  if (url.pathname !== '/api/v1/admin/users')
    throw new ApiError(404, 'NOT_FOUND', 'This endpoint does not exist.');
  if (request.method !== 'GET') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use GET.');
  const { page } = z
    .object({ page: z.coerce.number().int().min(1).max(10000).default(1) })
    .strict()
    .parse(Object.fromEntries(url.searchParams));
  const { db } = await database();
  const { day, resetsAt } = usageDay();
  const now = new Date();
  const validSessions = { revokedAt: { $exists: false }, expiresAt: { $gt: now } };
  const [totalUsers, signedIn, users] = await Promise.all([
    db.collection('users').countDocuments(),
    db
      .collection('sessions')
      .aggregate([{ $match: validSessions }, { $group: { _id: '$userId' } }, { $count: 'count' }])
      .toArray(),
    db
      .collection('users')
      .find({}, { projection: { _id: 0, id: 1, name: 1, email: 1, createdAt: 1 } })
      .sort({ createdAt: -1, id: 1 })
      .skip((page - 1) * 50)
      .limit(50)
      .toArray(),
  ]);
  const ids = users.map((u) => u.id);
  const [usage, sessions] = await Promise.all([
    db
      .collection('assistant_usage')
      .find({ userId: { $in: ids }, day }, { projection: { userId: 1, count: 1 } })
      .toArray(),
    db
      .collection('sessions')
      .aggregate([
        { $match: { ...validSessions, userId: { $in: ids } } },
        { $group: { _id: '$userId', count: { $sum: 1 }, lastSessionAt: { $max: '$updatedAt' } } },
      ])
      .toArray(),
  ]);
  const result = adminOverviewSchema.parse({
    totalUsers,
    signedInUsers: signedIn[0]?.count ?? 0,
    day,
    resetsAt,
    page,
    pageSize: 50,
    users: users.map((u) => {
      const session = sessions.find((s) => s._id === u.id);
      return {
        ...u,
        createdAt: new Date(u.createdAt).toISOString(),
        used: Number(usage.find((r) => r.userId === u.id)?.count ?? 0),
        limit: u.email === 'aadarsh0022@gmail.com' ? null : dailyMessageLimit,
        activeSessions: Number(session?.count ?? 0),
        lastSessionAt: session?.lastSessionAt
          ? new Date(session.lastSessionAt).toISOString()
          : null,
      };
    }),
  });
  return success(result, requestId);
}
