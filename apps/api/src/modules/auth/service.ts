import { randomUUID } from 'node:crypto';
import type { LoginInput, RegisterInput } from '@finora/contracts';
import { database } from '../../database/client';
import {
  publicUser,
  sessionRecordSchema,
  userRecordSchema,
  type UserRecord,
} from '../../database/models';
import {
  hashPassword,
  randomToken,
  tokenHash,
  verifyMissingUser,
  verifyPassword,
} from '../../security/tokens';
import { sendPasswordReset } from '../../services/email';
import { ApiError } from '../../utils/http';

const unauthorized = () =>
  new ApiError(401, 'UNAUTHORIZED', 'Your session has expired. Please sign in again.');
const invalidCredentials = () =>
  new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');

function newSession(user: UserRecord, deviceName: string) {
  const accessToken = randomToken();
  const refreshToken = randomToken();
  const now = new Date();
  const record = sessionRecordSchema.parse({
    id: randomUUID(),
    userId: user.id,
    deviceName,
    authVersion: user.authVersion,
    accessHash: tokenHash(accessToken),
    refreshHash: tokenHash(refreshToken),
    accessExpiresAt: new Date(now.getTime() + 900000),
    expiresAt: new Date(now.getTime() + 30 * 86400000),
    usedRefreshHashes: [],
    rotations: 0,
    createdAt: now,
    updatedAt: now,
  });
  return {
    record,
    tokens: { accessToken, refreshToken, expiresIn: 900 as const, user: publicUser(user) },
  };
}

export async function register(input: RegisterInput) {
  const { client, users, sessions } = await database();
  const now = new Date();
  const user = userRecordSchema.parse({
    id: randomUUID(),
    email: input.email,
    name: input.name,
    preferences: input.preferences,
    passwordHash: await hashPassword(input.password),
    authVersion: 0,
    createdAt: now,
    updatedAt: now,
  });
  const { record, tokens } = newSession(user, input.deviceName);
  const transaction = client.startSession();
  try {
    await transaction.withTransaction(async () => {
      await users.insertOne(user, { session: transaction });
      await sessions.insertOne(record, { session: transaction });
    });
  } finally {
    await transaction.endSession();
  }
  return tokens;
}

export async function login(input: LoginInput) {
  const { client, users, sessions } = await database();
  const found = await users.findOne({ email: input.email });
  if (!found) {
    await verifyMissingUser(input.password);
    throw invalidCredentials();
  }
  const user = userRecordSchema.parse(found);
  if (!(await verifyPassword(user.passwordHash, input.password))) throw invalidCredentials();
  const { record, tokens } = newSession(user, input.deviceName);
  const transaction = client.startSession();
  try {
    await transaction.withTransaction(async () => {
      // Serialize against password changes and deletion after password verification.
      const lock = await users.updateOne(
        { id: user.id, authVersion: user.authVersion },
        { $set: { updatedAt: new Date() } },
        { session: transaction },
      );
      if (!lock.matchedCount) throw invalidCredentials();
      await sessions.insertOne(record, { session: transaction });
    });
  } finally {
    await transaction.endSession();
  }
  return tokens;
}

export async function authenticate(request: Request) {
  const header = request.headers.get('authorization');
  if (!header || !/^Bearer [A-Za-z0-9_-]{43}$/.test(header)) throw unauthorized();
  const { sessions, users } = await database();
  const now = new Date();
  const found = await sessions.findOne({
    accessHash: tokenHash(header.slice(7)),
    accessExpiresAt: { $gt: now },
    expiresAt: { $gt: now },
    revokedAt: { $exists: false },
  });
  if (!found) throw unauthorized();
  const session = sessionRecordSchema.parse(found);
  const foundUser = await users.findOne({ id: session.userId, authVersion: session.authVersion });
  if (!foundUser) throw unauthorized();
  return { user: userRecordSchema.parse(foundUser), session };
}
export type AuthContext = Awaited<ReturnType<typeof authenticate>>;

export async function refresh(refreshToken: string) {
  const { sessions, users } = await database();
  const digest = tokenHash(refreshToken);
  const now = new Date();
  const accessToken = randomToken();
  const nextRefresh = randomToken();
  const rotated = await sessions.findOneAndUpdate(
    {
      refreshHash: digest,
      revokedAt: { $exists: false },
      expiresAt: { $gt: now },
      rotations: { $lt: 10000 },
    },
    {
      $set: {
        accessHash: tokenHash(accessToken),
        accessExpiresAt: new Date(now.getTime() + 900000),
        refreshHash: tokenHash(nextRefresh),
        updatedAt: now,
      },
      $push: { usedRefreshHashes: digest },
      $inc: { rotations: 1 },
    },
    { returnDocument: 'after' },
  );
  if (!rotated) {
    await sessions.updateOne(
      { usedRefreshHashes: digest },
      { $set: { revokedAt: now, updatedAt: now } },
    );
    throw unauthorized();
  }
  const session = sessionRecordSchema.parse(rotated);
  const found = await users.findOne({ id: session.userId, authVersion: session.authVersion });
  if (!found) {
    await sessions.updateOne(
      { userId: session.userId, id: session.id },
      { $set: { revokedAt: now } },
    );
    throw unauthorized();
  }
  return {
    accessToken,
    refreshToken: nextRefresh,
    expiresIn: 900 as const,
    user: publicUser(userRecordSchema.parse(found)),
  };
}

export async function logout(context: AuthContext) {
  const { sessions } = await database();
  await sessions.updateOne(
    { userId: context.user.id, id: context.session.id },
    { $set: { revokedAt: new Date() } },
  );
}

export async function logoutOthers(context: AuthContext) {
  const { sessions } = await database();
  await sessions.updateMany(
    { userId: context.user.id, id: { $ne: context.session.id } },
    { $set: { revokedAt: new Date() } },
  );
}

export async function forgotPassword(email: string) {
  const { users } = await database();
  const token = randomToken();
  const digest = tokenHash(token);
  const user = await users.findOneAndUpdate(
    { email },
    {
      $set: {
        resetHash: digest,
        resetExpiresAt: new Date(Date.now() + 1800000),
        updatedAt: new Date(),
      },
    },
    { returnDocument: 'after' },
  );
  if (!user) return;
  try {
    await sendPasswordReset(email, token);
  } catch (error) {
    await users.updateOne(
      { id: user.id, resetHash: digest },
      { $unset: { resetHash: '', resetExpiresAt: '' } },
    );
    throw error;
  }
}

export async function resetPassword(token: string, password: string) {
  const { client, users, sessions } = await database();
  const passwordHash = await hashPassword(password);
  const transaction = client.startSession();
  try {
    await transaction.withTransaction(async () => {
      const user = await users.findOneAndUpdate(
        { resetHash: tokenHash(token), resetExpiresAt: { $gt: new Date() } },
        {
          $set: { passwordHash, updatedAt: new Date() },
          $inc: { authVersion: 1 },
          $unset: { resetHash: '', resetExpiresAt: '' },
        },
        { returnDocument: 'after', session: transaction },
      );
      if (!user)
        throw new ApiError(
          400,
          'INVALID_RESET_TOKEN',
          'This recovery link is invalid or expired. Request a new one.',
        );
      await sessions.deleteMany({ userId: user.id }, { session: transaction });
    });
  } finally {
    await transaction.endSession();
  }
}

export async function changePassword(
  context: AuthContext,
  currentPassword: string,
  newPassword: string,
) {
  if (!(await verifyPassword(context.user.passwordHash, currentPassword)))
    throw invalidCredentials();
  const { client, users, sessions } = await database();
  const passwordHash = await hashPassword(newPassword);
  const transaction = client.startSession();
  try {
    await transaction.withTransaction(async () => {
      const updated = await users.updateOne(
        { id: context.user.id, authVersion: context.user.authVersion },
        {
          $set: { passwordHash, updatedAt: new Date() },
          $inc: { authVersion: 1 },
          $unset: { resetHash: '', resetExpiresAt: '' },
        },
        { session: transaction },
      );
      if (!updated.matchedCount) throw unauthorized();
      await sessions.deleteMany({ userId: context.user.id }, { session: transaction });
    });
  } finally {
    await transaction.endSession();
  }
}

export async function deleteAccount(context: AuthContext, password: string) {
  if (!(await verifyPassword(context.user.passwordHash, password))) throw invalidCredentials();
  const { client, db, users } = await database();
  const transaction = client.startSession();
  const owned = [
    'sessions',
    'accounts',
    'categories',
    'transactions',
    'budgets',
    'savings_goals',
    'recurring_rules',
    'recurring_occurrences',
    'preferences',
    'entitlements',
    'audit_events',
    'idempotency_records',
  ];
  try {
    await transaction.withTransaction(async () => {
      const deleted = await users.deleteOne(
        { id: context.user.id, authVersion: context.user.authVersion },
        { session: transaction },
      );
      if (!deleted.deletedCount) throw unauthorized();
      for (const name of owned)
        await db.collection(name).deleteMany({ userId: context.user.id }, { session: transaction });
    });
  } finally {
    await transaction.endSession();
  }
}
