import { isDeepStrictEqual } from 'node:util';
import type { ClientSession, Document, MongoClient } from 'mongodb';
import {
  accountSchema,
  backupSchema,
  budgetSchema,
  categorySchema,
  contributionSchema,
  emailSchema,
  goalSchema,
  recurringOccurrenceSchema,
  recurringRuleSchema,
  transactionSchema,
} from '@finora/contracts';
import { userRecordSchema } from '../database/models';

const tables = [
  ['accounts', 'accounts', accountSchema, 200],
  ['categories', 'categories', categorySchema, 300],
  ['transactions', 'transactions', transactionSchema, 10000],
  ['budgets', 'budgets', budgetSchema, 1200],
  ['goals', 'savings_goals', goalSchema, 200],
  ['contributions', 'savings_contributions', contributionSchema, 10000],
  ['recurringRules', 'recurring_rules', recurringRuleSchema, 200],
  ['recurringOccurrences', 'recurring_occurrences', recurringOccurrenceSchema, 10000],
] as const;
const profileSchema = userRecordSchema.omit({ resetHash: true, resetExpiresAt: true });

/** Administrative, insert-only copy. No HTTP route exposes this operation. */
export async function copyProfile(
  client: MongoClient,
  sourceName: string,
  targetName: string,
  inputEmail: string,
  apply = false,
) {
  if (
    sourceName === targetName ||
    ![sourceName, targetName].every((name) => /^[a-zA-Z0-9_]{1,60}$/.test(name))
  )
    throw new Error('Choose separate valid source and destination databases.');
  const email = emailSchema.parse(inputEmail);
  const source = client.db(sourceName);
  const target = client.db(targetName);
  const session = client.startSession();
  try {
    return await session.withTransaction(
      async () => {
        const sourceUser = await source.collection('users').findOne({ email }, { session });
        if (!sourceUser) throw new Error('Source profile not found.');
        const user = profileSchema.parse(sourceUser);
        if (
          await target
            .collection('users')
            .findOne({ $or: [{ email }, { id: user.id }] }, { session, projection: { _id: 1 } })
        )
          throw new Error('Destination profile already exists; nothing will be overwritten.');

        const records = new Map<string, Document[]>();
        const portable: Record<string, unknown> = {};
        const counts: Record<string, number> = {};
        for (const [key, collection, schema, maximum] of tables) {
          const rows = await source
            .collection(collection)
            .find({ userId: user.id }, { session, projection: { _id: 0 } })
            .sort({ id: 1 })
            .limit(maximum + 1)
            .toArray();
          if (rows.length > maximum) throw new Error('Source exceeds the supported copy limit.');
          if (await target.collection(collection).countDocuments({ userId: user.id }, { session }))
            throw new Error('Destination already has owned records; copy refused.');
          portable[key] = rows.map((row) => {
            const parsed = schema.parse(row);
            const { userId, ...value } = parsed;
            if (userId !== user.id) throw new Error('Source ownership mismatch.');
            return value;
          });
          records.set(collection, rows);
          counts[collection] = rows.length;
        }
        // Reuse the restore graph validation for ownership references, currencies,
        // exact amounts, duplicate identifiers, budgets and recurring relationships.
        backupSchema.parse({
          format: 'finora-backup',
          version: 1,
          exportedAt: new Date().toISOString(),
          currency: user.preferences.baseCurrency,
          ...portable,
        });
        if (!apply) return { copied: false, verified: true, counts };

        await target.collection('users').insertOne({ ...user }, { session });
        for (const [collection, rows] of records)
          if (rows.length)
            await target.collection(collection).insertMany(
              rows.map((row) => ({ ...row })),
              { session },
            );
        const copied = await target.collection('users').findOne({ id: user.id }, { session });
        if (
          !copied ||
          'resetHash' in copied ||
          'resetExpiresAt' in copied ||
          !isDeepStrictEqual(profileSchema.parse(copied), user)
        )
          throw new Error('Copied profile verification failed.');
        for (const [collection, rows] of records) {
          const persisted = await readCopied(client, targetName, collection, user.id, session);
          if (!isDeepStrictEqual(persisted, rows))
            throw new Error('Copied financial records differ; transaction aborted.');
        }
        return { copied: true, verified: true, counts };
      },
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
    );
  } finally {
    await session.endSession();
  }
}

function readCopied(
  client: MongoClient,
  database: string,
  collection: string,
  userId: string,
  session: ClientSession,
) {
  return client
    .db(database)
    .collection(collection)
    .find({ userId }, { session, projection: { _id: 0 } })
    .sort({ id: 1 })
    .toArray();
}
