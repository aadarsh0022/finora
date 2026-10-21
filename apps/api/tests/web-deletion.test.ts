import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteWebAccount } from '../app/delete-account/request';
import { database } from '../src/database/client';
import { dispatch } from '../src/router';
import { clearDatabase, createUser, password, setupDatabase, teardownDatabase } from './setup';

beforeAll(setupDatabase);
beforeEach(clearDatabase);
afterAll(teardownDatabase);

const transport = (path: string, options: RequestInit) =>
  dispatch(new Request(`http://localhost:3000${path}`, options));

describe('website account deletion with disposable MongoDB', () => {
  it('deletes only the authenticated account and invalidates all of its sessions', async () => {
    const user = await createUser();
    const other = await createUser('other@example.com');
    const { users, sessions, db } = await database();
    await db.collection('accounts').insertMany([
      { id: 'first', userId: user.user.id },
      { id: 'second', userId: other.user.id },
    ]);
    await deleteWebAccount({ email: user.user.email, password, confirmation: 'DELETE' }, transport);
    expect(await users.countDocuments({ id: user.user.id })).toBe(0);
    expect(await sessions.countDocuments({ userId: user.user.id })).toBe(0);
    expect(await db.collection('accounts').countDocuments({ userId: user.user.id })).toBe(0);
    expect(await users.countDocuments({ id: other.user.id })).toBe(1);
    expect(await db.collection('accounts').countDocuments({ userId: other.user.id })).toBe(1);
  });

  it('rejects missing confirmation before login and revokes the temporary session on deletion failure', async () => {
    const user = await createUser();
    const { sessions, users } = await database();
    await expect(
      deleteWebAccount({ email: user.user.email, password, confirmation: '' }, transport),
    ).rejects.toThrow();
    expect(await sessions.countDocuments()).toBe(1);
    await expect(
      deleteWebAccount(
        { email: user.user.email, password, confirmation: 'DELETE' },
        (path, options) =>
          path === '/api/v1/auth/account'
            ? Promise.resolve(Response.json({ success: false }, { status: 503 }))
            : transport(path, options),
      ),
    ).rejects.toThrow('Deletion could not be completed');
    expect(await users.countDocuments({ id: user.user.id })).toBe(1);
    const temporary = await sessions.findOne({
      userId: user.user.id,
      deviceName: 'Account deletion website',
    });
    expect(temporary?.revokedAt).toBeInstanceOf(Date);
    expect(
      await sessions.countDocuments({ userId: user.user.id, revokedAt: { $exists: false } }),
    ).toBe(1);
  });
});
