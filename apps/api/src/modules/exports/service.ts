import { createHash, randomUUID } from 'node:crypto';
import { Decimal128, type ClientSession, type Db } from 'mongodb';
import type { z } from 'zod';
import {
  accountSchema,
  categorySchema,
  transactionSchema,
  budgetSchema,
  goalSchema,
  contributionSchema,
  recurringRuleSchema,
  recurringOccurrenceSchema,
  backupSchema,
  type Backup,
  type TransactionFilters,
} from '@finora/contracts';
import { nextOccurrence } from '@finora/finance-core';
import { database } from '../../database/client';
import { userRecordSchema } from '../../database/models';
import { ApiError } from '../../utils/http';
import type { AuthContext } from '../auth/service';
import { mutate } from '../finance/mutation';

type Portable = { id: string; [key: string]: unknown };
type BackupKey = Exclude<keyof Backup, 'format' | 'version' | 'exportedAt' | 'currency'>;
function portable<T extends { userId: string; id: string }>(
  schema: z.ZodType<T>,
  value: unknown,
): Portable {
  const { userId: _owner, ...record } = schema.parse(value);
  void _owner;
  return record;
}
const tables: {
  key: BackupKey;
  collection: string;
  max: number;
  parse: (value: unknown) => Portable;
}[] = [
  { key: 'accounts', collection: 'accounts', max: 200, parse: (v) => portable(accountSchema, v) },
  {
    key: 'categories',
    collection: 'categories',
    max: 300,
    parse: (v) => portable(categorySchema, v),
  },
  {
    key: 'transactions',
    collection: 'transactions',
    max: 10000,
    parse: (v) => portable(transactionSchema, v),
  },
  { key: 'budgets', collection: 'budgets', max: 1200, parse: (v) => portable(budgetSchema, v) },
  { key: 'goals', collection: 'savings_goals', max: 200, parse: (v) => portable(goalSchema, v) },
  {
    key: 'contributions',
    collection: 'savings_contributions',
    max: 10000,
    parse: (v) => portable(contributionSchema, v),
  },
  {
    key: 'recurringRules',
    collection: 'recurring_rules',
    max: 200,
    parse: (v) => portable(recurringRuleSchema, v),
  },
  {
    key: 'recurringOccurrences',
    collection: 'recurring_occurrences',
    max: 10000,
    parse: (v) => portable(recurringOccurrenceSchema, v),
  },
];
type Snapshot = Record<BackupKey, Portable[]>;
export const backupBodyLimit = 2 * 1024 * 1024;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function hash(backup: Backup) {
  return createHash('sha256').update(canonical(backup)).digest('hex');
}

async function snapshot(db: Db, session: ClientSession, userId: string): Promise<Snapshot> {
  const result = {} as Snapshot;
  for (const table of tables) {
    const rows = await db
      .collection(table.collection)
      .find({ userId }, { session })
      .sort({ id: 1 })
      .limit(table.max + 1)
      .toArray();
    if (rows.length > table.max)
      throw new ApiError(
        422,
        'BACKUP_LIMIT',
        'This dataset exceeds the supported backup limit. Contact support.',
      );
    result[table.key] = rows.map(table.parse);
  }
  return result;
}

function validateSchedule(backup: Backup) {
  const rules = new Map(backup.recurringRules.map((rule) => [rule.id, rule]));
  for (const rule of backup.recurringRules) {
    try {
      const next = nextOccurrence(rule.startDate, rule.frequency, rule.nextIndex);
      if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(next)) throw new Error('Calendar limit');
    } catch {
      throw new ApiError(
        400,
        'INVALID_BACKUP',
        'The recurrence schedule exceeds the supported calendar.',
      );
    }
  }
  for (const occurrence of backup.recurringOccurrences) {
    const rule = rules.get(occurrence.ruleId);
    if (!rule) throw new ApiError(400, 'INVALID_BACKUP', 'A recurrence is missing its rule.');
    let due: string;
    try {
      due = nextOccurrence(rule.startDate, rule.frequency, occurrence.occurrenceIndex);
    } catch {
      throw new ApiError(
        400,
        'INVALID_BACKUP',
        'The recurrence schedule exceeds the supported calendar.',
      );
    }
    if (due !== occurrence.dueDate || (rule.endDate && due > rule.endDate))
      throw new ApiError(400, 'INVALID_BACKUP', 'A recurrence does not match its schedule.');
  }
}

function plan(backup: Backup, current: Snapshot) {
  const counts: Record<string, { added: number; unchanged: number; conflicts: number }> = {};
  let conflicts = 0;
  for (const table of tables) {
    const existing = new Map(current[table.key].map((row) => [row.id, row]));
    const count = { added: 0, unchanged: 0, conflicts: 0 };
    for (const incoming of backup[table.key]) {
      const record = existing.get(incoming.id);
      if (!record) count.added++;
      else if (canonical(record) === canonical(incoming)) count.unchanged++;
      else count.conflicts++;
    }
    if (current[table.key].length + count.added > table.max)
      throw new ApiError(409, 'RECORD_LIMIT', 'The merged backup would exceed a record limit.');
    counts[table.key] = count;
    conflicts += count.conflicts;
  }
  // IDs alone do not capture unique financial keys such as monthly category budgets.
  const natural = <T extends { id: string }>(
    incoming: T[],
    existing: Portable[],
    key: (record: T) => string,
  ) => {
    const byKey = new Map(existing.map((row) => [key(row as T), row.id]));
    return incoming.some((row) => byKey.has(key(row)) && byKey.get(key(row)) !== row.id);
  };
  if (
    natural(backup.budgets, current.budgets, (row) => `${row.month}:${row.categoryId}`) ||
    natural(
      backup.recurringOccurrences,
      current.recurringOccurrences,
      (row) => `${row.ruleId}:${row.dueDate}`,
    )
  )
    conflicts++;
  const perGoal = new Map<string, Set<string>>();
  for (const row of [...current.contributions, ...backup.contributions]) {
    const goalId = String(row.goalId);
    const ids = perGoal.get(goalId) ?? new Set<string>();
    ids.add(row.id);
    perGoal.set(goalId, ids);
    if (ids.size > 1000)
      throw new ApiError(409, 'RECORD_LIMIT', 'A goal would exceed 1000 contributions.');
  }
  return { counts, conflicts, canImport: conflicts === 0 };
}

function requireCurrency(context: AuthContext, backup: Backup) {
  if (backup.currency !== context.user.preferences.baseCurrency)
    throw new ApiError(409, 'CURRENCY_MISMATCH', 'The backup must use your current base currency.');
  validateSchedule(backup);
}

async function currentCurrency(db: Db, session: ClientSession, context: AuthContext) {
  const user = await db
    .collection('users')
    .findOne({ id: context.user.id, authVersion: context.user.authVersion }, { session });
  if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Please sign in again.');
  return userRecordSchema.parse(user).preferences.baseCurrency;
}

async function verifyCurrentCurrency(
  db: Db,
  session: ClientSession,
  context: AuthContext,
  backup: Backup,
) {
  if ((await currentCurrency(db, session, context)) !== backup.currency)
    throw new ApiError(409, 'CURRENCY_MISMATCH', 'The backup must use your current base currency.');
}

export async function exportBackup(context: AuthContext): Promise<Backup> {
  const { db, client } = await database();
  const session = client.startSession();
  try {
    const backup = await session.withTransaction(
      async () =>
        backupSchema.parse({
          format: 'finora-backup',
          version: 1,
          exportedAt: new Date().toISOString(),
          currency: await currentCurrency(db, session, context),
          ...(await snapshot(db, session, context.user.id)),
        }),
      { readConcern: { level: 'snapshot' } },
    );
    if (Buffer.byteLength(JSON.stringify(backup)) > backupBodyLimit - 2048)
      throw new ApiError(
        422,
        'BACKUP_LIMIT',
        'The backup exceeds the current 2 MiB restore limit. Contact support.',
      );
    return backup;
  } finally {
    await session.endSession();
  }
}

export async function previewImport(context: AuthContext, request: Request, backup: Backup) {
  requireCurrency(context, backup);
  return mutate(context, request, { backup }, async (db, session) => {
    await verifyCurrentCurrency(db, session, context, backup);
    const result = plan(backup, await snapshot(db, session, context.user.id));
    const active = await db
      .collection('import_previews')
      .countDocuments(
        { userId: context.user.id, consumed: false, expiresAt: { $gt: new Date() } },
        { session, limit: 20 },
      );
    if (active >= 20)
      throw new ApiError(429, 'IMPORT_PREVIEW_LIMIT', 'Wait for an earlier preview to expire.');
    const previewId = randomUUID();
    const contentHash = hash(backup);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await db
      .collection('import_previews')
      .insertOne(
        { id: previewId, userId: context.user.id, contentHash, expiresAt, consumed: false },
        { session },
      );
    return {
      ...result,
      previewId,
      contentHash,
      expiresAt: expiresAt.toISOString(),
      mode: 'merge' as const,
    };
  });
}

export async function commitImport(
  context: AuthContext,
  request: Request,
  input: {
    backup: Backup;
    previewId: string;
    contentHash: string;
    mode: 'merge';
    confirmation: 'IMPORT';
  },
) {
  requireCurrency(context, input.backup);
  return mutate(context, request, input, async (db, session) => {
    await verifyCurrentCurrency(db, session, context, input.backup);
    const preview = await db.collection('import_previews').findOne(
      {
        userId: context.user.id,
        id: input.previewId,
        consumed: false,
        expiresAt: { $gt: new Date() },
      },
      { session },
    );
    if (
      !preview ||
      preview.contentHash !== input.contentHash ||
      hash(input.backup) !== input.contentHash
    )
      throw new ApiError(
        409,
        'PREVIEW_INVALID',
        'Preview this exact backup again before importing.',
      );
    const current = await snapshot(db, session, context.user.id);
    const result = plan(input.backup, current);
    if (!result.canImport)
      throw new ApiError(
        409,
        'IMPORT_CONFLICT',
        'Existing records differ. No records were imported.',
      );
    for (const table of tables) {
      const existing = new Set(current[table.key].map((row) => row.id));
      const rows = input.backup[table.key]
        .filter((row) => !existing.has(row.id))
        .map((row) => ({
          ...row,
          userId: context.user.id,
          ...(table.key === 'transactions' &&
          'amountMinor' in row &&
          typeof row.amountMinor === 'string'
            ? { amountSort: Decimal128.fromString(row.amountMinor) }
            : {}),
        }));
      if (rows.length) await db.collection(table.collection).insertMany(rows, { session });
    }
    await db
      .collection('import_previews')
      .updateOne(
        { userId: context.user.id, id: input.previewId },
        { $set: { consumed: true } },
        { session },
      );
    return { imported: true, counts: result.counts };
  });
}

export function csvCell(value: string): string {
  const first = Array.from(value).find(
    (character) => character.charCodeAt(0) > 31 && !/\s/u.test(character),
  );
  const formula = first !== undefined && '=+-@'.includes(first);
  const safe = formula || [9, 10, 13].includes(value.charCodeAt(0)) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export async function exportTransactions(
  context: AuthContext,
  filters: TransactionFilters,
): Promise<string> {
  const { db } = await database();
  const documents = await db
    .collection('transactions')
    .find({ userId: context.user.id })
    .limit(10001)
    .toArray();
  if (documents.length > 10000)
    throw new ApiError(422, 'EXPORT_LIMIT', 'This dataset exceeds the CSV export limit.');
  const query = filters.q?.toLocaleLowerCase('en');
  const rows = documents
    .map((row) => transactionSchema.parse(row))
    .filter(
      (row) =>
        (!filters.type || row.type === filters.type) &&
        (!filters.accountId ||
          row.accountId === filters.accountId ||
          row.destinationAccountId === filters.accountId) &&
        (!filters.categoryId || row.categoryId === filters.categoryId) &&
        (!filters.from || row.date >= new Date(filters.from).toISOString()) &&
        (!filters.to || row.date <= new Date(filters.to).toISOString()) &&
        (!filters.minAmount || BigInt(row.amountMinor) >= BigInt(filters.minAmount)) &&
        (!filters.maxAmount || BigInt(row.amountMinor) <= BigInt(filters.maxAmount)) &&
        (!query ||
          row.merchant.toLocaleLowerCase('en').includes(query) ||
          row.note.toLocaleLowerCase('en').includes(query)),
    );
  rows.sort((a, b) => {
    if (filters.sort === 'highest' || filters.sort === 'lowest') {
      const difference = BigInt(a.amountMinor) - BigInt(b.amountMinor);
      return (
        (difference < 0n ? -1 : difference > 0n ? 1 : 0) * (filters.sort === 'highest' ? -1 : 1) ||
        a.id.localeCompare(b.id)
      );
    }
    return (
      a.date.localeCompare(b.date) * (filters.sort === 'oldest' ? 1 : -1) ||
      a.id.localeCompare(b.id)
    );
  });
  return (
    [
      [
        'id',
        'type',
        'date',
        'accountId',
        'destinationAccountId',
        'categoryId',
        'amountMinor',
        'currency',
        'merchant',
        'note',
        'tags',
      ],
      ...rows.map((row) => [
        row.id,
        row.type,
        row.date,
        row.accountId,
        row.destinationAccountId ?? '',
        row.categoryId ?? '',
        row.amountMinor,
        row.currency,
        row.merchant,
        row.note,
        JSON.stringify(row.tags),
      ]),
    ]
      .map((row) => row.map(csvCell).join(','))
      .join('\r\n') + '\r\n'
  );
}
