import { randomUUID } from 'node:crypto';
import {
  goalSchema,
  contributionSchema,
  type goalInputSchema,
  type goalUpdateSchema,
  type contributionInputSchema,
} from '@finora/contracts';
import { calendarDate } from '@finora/finance-core';
import { owned, metadata } from './common';
import type { z } from 'zod';
import { database } from '../../database/client';
import { ApiError } from '../../utils/http';
import type { AuthContext } from '../auth/service';
import { enforceLimit, mutate, notFound, requireVersion } from '../finance/mutation';

export async function listGoals(context: AuthContext, id?: string) {
  const { client, db } = await database();
  const session = client.startSession();
  try {
    return await session.withTransaction(
      async () => {
        const goals = await db
          .collection('savings_goals')
          .find(owned(context, id), { session })
          .limit(200)
          .toArray();
        if (id && !goals.length) throw notFound();
        const results = [];
        for (const document of goals) {
          const goal = goalSchema.parse(document);
          const contributions = (
            await db
              .collection('savings_contributions')
              .find({ ...owned(context), goalId: goal.id }, { session })
              .limit(1000)
              .toArray()
          ).map((entry) => contributionSchema.parse(entry));
          const saved = contributions.reduce((sum, item) => sum + BigInt(item.amountMinor), 0n);
          results.push({
            ...goal,
            savedMinor: saved.toString(),
            remainingMinor: (BigInt(goal.targetMinor) - saved).toString(),
            complete: saved >= BigInt(goal.targetMinor),
            ...(id ? { contributions } : {}),
          });
        }
        return results;
      },
      { readConcern: { level: 'snapshot' } },
    );
  } finally {
    await session.endSession();
  }
}
export async function saveGoal(
  context: AuthContext,
  request: Request,
  input: z.infer<typeof goalInputSchema> | z.infer<typeof goalUpdateSchema>,
  id?: string,
) {
  return mutate(context, request, { id, ...input }, async (db, session) => {
    const collection = db.collection('savings_goals');
    const previous = id ? await collection.findOne(owned(context, id), { session }) : null;
    if (id && !previous) throw notFound();
    if (previous && 'version' in input)
      requireVersion(goalSchema.parse(previous).version, input.version);
    if (!id) await enforceLimit(db, session, 'savings_goals', context.user.id, 200);
    const record = goalSchema.parse({
      ...metadata(context),
      ...input,
      ...(previous
        ? {
            id: previous.id,
            createdAt: previous.createdAt,
            currency: previous.currency,
          }
        : {}),
      version: previous ? Number(previous.version) + 1 : 1,
    });
    if (previous) await collection.replaceOne(owned(context, id), record, { session });
    else await collection.insertOne(record, { session });
    return record;
  });
}
export async function addContribution(
  context: AuthContext,
  request: Request,
  id: string,
  input: z.infer<typeof contributionInputSchema>,
) {
  return mutate(context, request, { id, ...input }, async (db, session) => {
    const goal = await db.collection('savings_goals').findOne(owned(context, id), { session });
    if (!goal) throw notFound();
    requireVersion(goalSchema.parse(goal).version, input.version);
    if (goal.archived)
      throw new ApiError(409, 'ARCHIVED_GOAL', 'Restore this goal before adding contributions.');
    if (input.date > calendarDate(new Date(), context.user.preferences.timezone))
      throw new ApiError(
        400,
        'FUTURE_CONTRIBUTION',
        'Contributions must represent savings already recorded.',
      );
    await enforceLimit(db, session, 'savings_contributions', context.user.id, 10000);
    const count = await db
      .collection('savings_contributions')
      .countDocuments({ ...owned(context), goalId: id }, { session, limit: 1000 });
    if (count >= 1000)
      throw new ApiError(409, 'RECORD_LIMIT', 'A goal supports 1000 contributions.');
    const record = contributionSchema.parse({
      ...input,
      ...owned(context),
      id: randomUUID(),
      goalId: id,
      createdAt: new Date().toISOString(),
    });
    await db.collection('savings_contributions').insertOne(record, { session });
    await db
      .collection('savings_goals')
      .updateOne(
        { ...owned(context, id), version: input.version },
        { $inc: { version: 1 }, $set: { updatedAt: new Date().toISOString() } },
        { session },
      );
    return { contribution: record, goalVersion: input.version + 1 };
  });
}
export async function removeContribution(
  context: AuthContext,
  request: Request,
  id: string,
  contributionId: string,
  version: number,
) {
  return mutate(context, request, { id, contributionId, version }, async (db, session) => {
    const goal = await db.collection('savings_goals').findOne(owned(context, id), { session });
    if (!goal) throw notFound();
    requireVersion(goalSchema.parse(goal).version, version);
    const result = await db
      .collection('savings_contributions')
      .deleteOne({ ...owned(context, contributionId), goalId: id }, { session });
    if (!result.deletedCount) throw notFound();
    await db
      .collection('savings_goals')
      .updateOne(
        { ...owned(context, id), version },
        { $inc: { version: 1 }, $set: { updatedAt: new Date().toISOString() } },
        { session },
      );
    return { id: contributionId, deleted: true, goalVersion: version + 1 };
  });
}
