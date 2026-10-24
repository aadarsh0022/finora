'use client';
import { useRef, useState, type FormEvent } from 'react';
import { adminOverviewSchema, sessionTokensSchema, loginSchema } from '@finora/contracts';
import type { z } from 'zod';
import './admin.css';
type Overview = z.infer<typeof adminOverviewSchema>;
export default function AdminPage() {
  const token = useRef('');
  const [overview, setOverview] = useState<Overview>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const visibleUsers =
    overview?.users.filter((user) =>
      `${user.name} ${user.email}`.toLowerCase().includes(search.toLowerCase().trim()),
    ) ?? [];
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
    <section className="admin-shell">
      <header className="admin-header">
        <div>
          <span className="admin-kicker">FINORA / ADMINISTRATION</span>
          <h1>User overview</h1>
          <p>Manage visibility into user access and daily AI usage.</p>
        </div>
        <span className="admin-private">Private workspace</span>
      </header>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {!overview ? (
        <form onSubmit={signIn} className="account-form" aria-busy={busy}>
          <h2>Welcome back</h2>
          <p>Sign in with your administrator account.</p>
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
          <div className="admin-stats">
            <article>
              <span>Total users</span>
              <strong>{overview.totalUsers}</strong>
              <small>Registered accounts</small>
            </article>
            <article>
              <span>Signed-in users</span>
              <strong>{overview.signedInUsers}</strong>
              <small>With a valid session</small>
            </article>
            <article>
              <span>Daily allowance</span>
              <strong>
                20 <em>/ user</em>
              </strong>
              <small>Administrator has unlimited messages</small>
            </article>
          </div>
          <div className="admin-table-card">
            <div className="admin-toolbar">
              <div>
                <h2>Users</h2>
                <p>Daily message usage · {overview.day}</p>
              </div>
              <label className="admin-search">
                <span className="admin-sr-only">Search users on this page</span>
                <input
                  type="search"
                  placeholder="Search this page by name or email"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
            </div>
            <div
              className="admin-table-scroll"
              tabIndex={0}
              role="region"
              aria-label="User access and usage table"
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">User</th>
                    <th scope="col">AI usage today</th>
                    <th scope="col">Access</th>
                    <th scope="col">Valid sessions</th>
                    <th scope="col">Last session activity</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleUsers.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <div className="admin-person">
                          <span className="admin-avatar" aria-hidden="true">
                            {(user.name || user.email).slice(0, 1).toUpperCase()}
                          </span>
                          <div>
                            <strong>{user.name || 'Unnamed user'}</strong>
                            <span>{user.email}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="admin-usage">
                          <span>
                            <strong>{user.used}</strong> / {user.limit ?? 'Unlimited'}
                          </span>
                          {user.limit !== null && (
                            <progress
                              aria-label={`${user.name || 'User'} daily messages used`}
                              value={Math.min(user.used, user.limit)}
                              max={user.limit}
                            />
                          )}
                        </div>
                      </td>
                      <td>
                        <span
                          className={`admin-badge ${user.limit === null ? 'admin-badge-dark' : ''}`}
                        >
                          {user.limit === null ? 'Administrator' : 'Standard'}
                        </span>
                      </td>
                      <td>
                        <span className="admin-session-dot" />
                        {user.activeSessions}
                      </td>
                      <td className="admin-date">
                        {user.lastSessionAt
                          ? new Date(user.lastSessionAt).toLocaleString(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })
                          : 'No session activity'}
                      </td>
                    </tr>
                  ))}
                  {visibleUsers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="admin-empty">
                        No users match your search on this page.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="admin-table-note">
              Allowances reset at 00:00 UTC. A valid session does not indicate that someone is
              online.
            </div>
          </div>
          <div className="admin-pagination">
            <span>
              Page {overview.page} of{' '}
              {Math.max(1, Math.ceil(overview.totalUsers / overview.pageSize))}
            </span>
            <button
              disabled={busy || overview.page === 1}
              onClick={() => void refresh(overview.page - 1)}
            >
              Previous
            </button>
            <button disabled={busy} onClick={() => void refresh(overview.page)}>
              {busy ? 'Refreshing…' : 'Refresh'}
            </button>
            <button
              disabled={busy || overview.page * overview.pageSize >= overview.totalUsers}
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
