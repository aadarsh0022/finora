import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sessionTokensSchema } from '@finora/contracts';
import { database } from '../src/database/client';
import { tokenHash } from '../src/security/tokens';
import { GET as health } from '../app/api/health/route';
import {
  call,
  clearDatabase,
  createUser,
  password,
  setupDatabase,
  teardownDatabase,
} from './setup';

beforeAll(setupDatabase);
beforeEach(clearDatabase);
afterAll(teardownDatabase);

describe('authentication persistence and validation', () => {
  it('registers, normalizes email and returns only public fields; hashes credentials', async () => {
    const tokens = await createUser('ONE@EXAMPLE.COM');
    expect(tokens.user.email).toBe('one@example.com');
    const { users, sessions } = await database();
    const user = await users.findOne({ id: tokens.user.id });
    expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user?.passwordHash).not.toContain(password);
    const session = await sessions.findOne({ userId: tokens.user.id });
    expect(session?.accessHash).toBe(tokenHash(tokens.accessToken));
    expect(session?.refreshHash).toBe(tokenHash(tokens.refreshToken));
    expect(JSON.stringify(tokens)).not.toContain('passwordHash');
    const me = await call('GET', 'auth/me', undefined, tokens.accessToken);
    expect(me.status).toBe(200);
    expect(me.json.success && me.json.data).toEqual(tokens.user);
    expect(me.headers.get('Cache-Control')).toBe('no-store');
    expect(me.headers.get('X-Request-Id')).toMatch(/^[\da-f-]{36}$/);
  });
  it('rejects weak passwords, invalid timezones, mass assignment and duplicate normalized email', async () => {
    expect(
      (await call('POST', 'auth/register', { email: 'a@b.com', password: 'short', name: 'A' }))
        .status,
    ).toBe(400);
    expect(
      (
        await call('POST', 'auth/register', {
          email: 'a@b.com',
          password,
          name: 'A',
          userId: 'victim',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call('POST', 'auth/register', {
          email: 'a@b.com',
          password,
          name: 'A',
          preferences: { timezone: 'Invalid/Zone' },
        })
      ).status,
    ).toBe(400);
    await createUser();
    expect(
      (await call('POST', 'auth/register', { email: 'ONE@example.com', password, name: 'B' }))
        .status,
    ).toBe(409);
    expect(await (await database()).users.countDocuments()).toBe(1);
  });
  it('gives the same login error for unknown email and incorrect password', async () => {
    await createUser();
    const wrong = await call('POST', 'auth/login', {
      email: 'one@example.com',
      password: 'incorrect',
    });
    const missing = await call('POST', 'auth/login', {
      email: 'missing@example.com',
      password: 'incorrect',
    });
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(!wrong.json.success && wrong.json.error).toEqual(
      !missing.json.success && missing.json.error,
    );
  });
  it('persists login, rejects forged/expired tokens and revokes on logout', async () => {
    const first = await createUser();
    const response = await call('POST', 'auth/login', { email: first.user.email, password });
    expect(response.status).toBe(200);
    const tokens = sessionTokensSchema.parse(response.json.success ? response.json.data : null);
    expect((await call('GET', 'auth/me', undefined, 'x'.repeat(43))).status).toBe(401);
    expect((await call('GET', 'auth/me')).status).toBe(401);
    await (
      await database()
    ).sessions.updateOne(
      { accessHash: tokenHash(tokens.accessToken) },
      { $set: { accessExpiresAt: new Date(0) } },
    );
    expect((await call('GET', 'auth/me', undefined, tokens.accessToken)).status).toBe(401);
    expect((await call('POST', 'auth/logout', undefined, first.accessToken)).status).toBe(200);
    expect((await call('GET', 'auth/me', undefined, first.accessToken)).status).toBe(401);
    expect((await call('POST', 'auth/refresh', { refreshToken: first.refreshToken })).status).toBe(
      401,
    );
  });
});

describe('refresh families and session boundaries', () => {
  it('rotates both tokens; replay revokes that family and preserves other devices', async () => {
    const first = await createUser();
    const login = await call('POST', 'auth/login', {
      email: first.user.email,
      password,
      deviceName: 'Second device',
    });
    const second = sessionTokensSchema.parse(login.json.success ? login.json.data : null);
    const refresh = await call('POST', 'auth/refresh', { refreshToken: first.refreshToken });
    expect(refresh.status).toBe(200);
    const rotated = sessionTokensSchema.parse(refresh.json.success ? refresh.json.data : null);
    expect(rotated.refreshToken).not.toBe(first.refreshToken);
    expect((await call('GET', 'auth/me', undefined, first.accessToken)).status).toBe(401);
    expect((await call('GET', 'auth/me', undefined, rotated.accessToken)).status).toBe(200);
    expect((await call('POST', 'auth/refresh', { refreshToken: first.refreshToken })).status).toBe(
      401,
    );
    expect((await call('GET', 'auth/me', undefined, rotated.accessToken)).status).toBe(401);
    expect((await call('GET', 'auth/me', undefined, second.accessToken)).status).toBe(200);
  });
  it('concurrent refresh cannot issue two usable replacements', async () => {
    const first = await createUser();
    const responses = await Promise.all([
      call('POST', 'auth/refresh', { refreshToken: first.refreshToken }),
      call('POST', 'auth/refresh', { refreshToken: first.refreshToken }),
    ]);
    expect(responses.map((result) => result.status).sort()).toEqual([200, 401]);
    const winner = responses.find((result) => result.json.success);
    const tokens = sessionTokensSchema.parse(winner?.json.success ? winner.json.data : null);
    expect((await call('GET', 'auth/me', undefined, tokens.accessToken)).status).toBe(401);
  });
  it('logs out other devices while keeping this session and other users', async () => {
    const first = await createUser();
    const other = await createUser('other@example.com');
    const login = await call('POST', 'auth/login', { email: first.user.email, password });
    const second = sessionTokensSchema.parse(login.json.success ? login.json.data : null);
    expect(
      (await call('POST', 'auth/logout-other-sessions', undefined, first.accessToken)).status,
    ).toBe(200);
    expect((await call('GET', 'auth/me', undefined, first.accessToken)).status).toBe(200);
    expect((await call('GET', 'auth/me', undefined, second.accessToken)).status).toBe(401);
    expect((await call('GET', 'auth/me', undefined, other.accessToken)).status).toBe(200);
  });
});

describe('password recovery and account lifecycle', () => {
  async function recoveryToken() {
    const directory = path.resolve('.local/outbox');
    const before = new Set(await readdir(directory).catch(() => []));
    const response = await call('POST', 'auth/forgot-password', { email: 'one@example.com' });
    expect(response.status).toBe(200);
    const filename = (await readdir(directory)).find((file) => !before.has(file));
    const message = JSON.parse(await readFile(path.join(directory, filename!), 'utf8')) as {
      text: string;
    };
    const url = message.text.match(/http:\/\/\S+/)?.[0];
    return new URL(url!).searchParams.get('token')!;
  }
  it('delivers a local recovery link, stores only its hash, consumes once and invalidates sessions', async () => {
    const first = await createUser();
    const token = await recoveryToken();
    const { users } = await database();
    expect((await users.findOne({ id: first.user.id }))?.resetHash).toBe(tokenHash(token));
    const missing = await call('POST', 'auth/forgot-password', { email: 'missing@example.com' });
    expect(missing.json.success && missing.json.data).toEqual({
      message: 'If an account exists, a recovery email has been sent.',
    });
    const newPassword = 'a newly chosen strong password';
    expect(
      (await call('POST', 'auth/reset-password', { token, password: newPassword })).status,
    ).toBe(200);
    expect(
      (await call('POST', 'auth/reset-password', { token, password: newPassword })).status,
    ).toBe(400);
    expect((await call('GET', 'auth/me', undefined, first.accessToken)).status).toBe(401);
    expect((await call('POST', 'auth/login', { email: first.user.email, password })).status).toBe(
      401,
    );
    expect(
      (await call('POST', 'auth/login', { email: first.user.email, password: newPassword })).status,
    ).toBe(200);
  });
  it('rejects expired recovery tokens', async () => {
    const first = await createUser();
    const token = await recoveryToken();
    await (
      await database()
    ).users.updateOne({ id: first.user.id }, { $set: { resetExpiresAt: new Date(0) } });
    expect((await call('POST', 'auth/reset-password', { token, password })).status).toBe(400);
  });
  it('changes password only with current credentials and invalidates every session', async () => {
    const first = await createUser();
    expect(
      (
        await call(
          'POST',
          'auth/change-password',
          { currentPassword: 'wrong', newPassword: password },
          first.accessToken,
        )
      ).status,
    ).toBe(401);
    const next = 'a different strong passphrase';
    expect(
      (
        await call(
          'POST',
          'auth/change-password',
          { currentPassword: password, newPassword: next },
          first.accessToken,
        )
      ).status,
    ).toBe(200);
    expect((await call('GET', 'auth/me', undefined, first.accessToken)).status).toBe(401);
    expect((await call('POST', 'auth/refresh', { refreshToken: first.refreshToken })).status).toBe(
      401,
    );
    expect(
      (await call('POST', 'auth/login', { email: first.user.email, password: next })).status,
    ).toBe(200);
  });
  it('requires deletion confirmation/password, atomically removes owned records and isolates other users', async () => {
    const first = await createUser();
    const other = await createUser('other@example.com');
    const { db } = await database();
    for (const collection of ['accounts', 'transactions', 'savings_goals', 'idempotency_records']) {
      await db.collection(collection).insertMany([
        { userId: first.user.id, id: 'first' },
        { userId: other.user.id, id: 'other' },
      ]);
    }
    expect(
      (await call('DELETE', 'auth/account', { password, confirmation: 'no' }, first.accessToken))
        .status,
    ).toBe(400);
    expect(
      (
        await call(
          'DELETE',
          'auth/account',
          { password: 'wrong', confirmation: 'DELETE' },
          first.accessToken,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await call(
          'DELETE',
          'auth/account',
          { password, confirmation: 'DELETE' },
          first.accessToken,
        )
      ).status,
    ).toBe(200);
    for (const collection of [
      'users',
      'sessions',
      'accounts',
      'transactions',
      'savings_goals',
      'idempotency_records',
    ]) {
      expect(
        await db
          .collection(collection)
          .countDocuments(
            collection === 'users' ? { id: first.user.id } : { userId: first.user.id },
          ),
      ).toBe(0);
    }
    expect(await db.collection('accounts').countDocuments({ userId: other.user.id })).toBe(1);
    expect((await call('GET', 'auth/me', undefined, other.accessToken)).status).toBe(200);
  });
});

describe('API hardening', () => {
  it('enforces distributed per-identity throttling', async () => {
    for (let i = 0; i < 10; i++)
      expect(
        (await call('POST', 'auth/forgot-password', { email: 'missing@example.com' })).status,
      ).toBe(200);
    const limited = await call('POST', 'auth/forgot-password', { email: 'missing@example.com' });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('600');
  });
  it('rejects oversized bodies and never leaks internal errors in health', async () => {
    expect((await call('POST', 'auth/login', { email: 'x'.repeat(17000), password })).status).toBe(
      413,
    );
    expect((await call('GET', 'auth/register')).status).toBe(405);
    expect((await call('GET', 'unknown')).status).toBe(404);
    const response = await health();
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ status: 'ok' });
  });
});
