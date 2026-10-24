'use client';
import { useRef, useState, type FormEvent } from 'react';
import { adminOverviewSchema, sessionTokensSchema, loginSchema } from '@finora/contracts';
import type { z } from 'zod';
type Overview = z.infer<typeof adminOverviewSchema>;
export default function AdminPage() {
  const token = useRef('');
  const [overview, setOverview] = useState<Overview>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function load(accessToken: string, page = 1) {
    const response = await fetch(`/api/v1/admin/users?page=${page}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      credentials: 'omit',
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
      throw new Error(
        response.status === 403
          ? 'Administrator access is required.'
          : 'Unable to load users. Sign in again if your session expired.',
      );
    const body = await response.json();
    setOverview(adminOverviewSchema.parse(body.data));
  }
  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    let accessToken = '';
    try {
      const credentials = loginSchema.parse({ email, password, deviceName: 'Finora Admin' });
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
        cache: 'no-store',
        credentials: 'omit',
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok)
        throw new Error('Unable to sign in. Check your credentials or try again later.');
      const body = await response.json();
      const session = sessionTokensSchema.parse(body.data);
      accessToken = session.accessToken;
      await load(accessToken);
      token.current = accessToken;
      setPassword('');
    } catch (failure) {
      if (accessToken)
        void fetch('/api/v1/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: '{}',
        }).catch(() => undefined);
      setError(failure instanceof Error ? failure.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  }
  async function refresh(page: number) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await load(token.current, page);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to load users.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h1>Finora administration</h1>
      <p>User access and AI message usage.</p>
      {error && <p role="alert">{error}</p>}
      {!overview ? (
        <form onSubmit={signIn} className="account-form" aria-busy={busy}>
          <label htmlFor="admin-email">Email</label>
          <input
            id="admin-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <label htmlFor="admin-password">Password</label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button disabled={busy}>Sign in</button>
        </form>
      ) : (
        <>
          <p>
            {overview.totalUsers} users · {overview.signedInUsers} with a valid signed-in session
          </p>
          <p>
            Usage for {overview.day}. Daily allowances reset at 00:00 UTC. Valid sessions do not
            mean a person is online right now.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>AI messages</th>
                  <th>Valid sessions</th>
                  <th>Last session activity</th>
                </tr>
              </thead>
              <tbody>
                {overview.users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      {user.name}
                      <br />
                      {user.email}
                    </td>
                    <td>
                      {user.used} / {user.limit ?? 'Unlimited'}
                    </td>
                    <td>{user.activeSessions}</td>
                    <td>
                      {user.lastSessionAt ? new Date(user.lastSessionAt).toLocaleString() : 'None'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
            <button
              disabled={busy || overview.page === 1}
              onClick={() => void refresh(overview.page - 1)}
            >
              Previous
            </button>
            <button disabled={busy} onClick={() => void refresh(overview.page)}>
              Refresh
            </button>
            <button
              disabled={busy || overview.page * 50 >= overview.totalUsers}
              onClick={() => void refresh(overview.page + 1)}
            >
              Next
            </button>
            <button
              onClick={() => {
                const accessToken = token.current;
                token.current = '';
                setOverview(undefined);
                setPassword('');
                void fetch('/api/v1/auth/logout', {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: '{}',
                }).catch(() => undefined);
              }}
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </section>
  );
}
