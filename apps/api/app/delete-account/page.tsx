'use client';

import { useRef, useState, type FormEvent } from 'react';
import { deleteWebAccount } from './request';

export default function DeleteAccount() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || confirmation !== 'DELETE') return;
    pending.current = true;
    setBusy(true);
    setMessage('');
    try {
      await deleteWebAccount({ email, password, confirmation });
      setDone(true);
      setEmail('');
      setMessage('Your Finora account and associated application data have been deleted.');
    } catch (failure) {
      setMessage(
        failure instanceof Error && failure.name === 'Error'
          ? failure.message
          : 'The request could not be completed. Check your connection and try again. If you already submitted deletion, try signing in to check its status.',
      );
    } finally {
      setPassword('');
      setConfirmation('');
      setBusy(false);
      pending.current = false;
    }
  }

  return (
    <>
      <p className="eyebrow">Your account, your choice</p>
      <h1>Delete your Finora account</h1>
      <p>You can delete your account here without installing or opening the Android app.</p>
      {!done && (
        <>
          <div className="notice">
            <h2>Permanent deletion</h2>
            <p>
              This removes your profile, accounts, transactions, categories, budgets, goals,
              contributions, debts, repayments, recurring items, AI chat history and sessions from
              Finora’s application database. Deletion cannot be undone. Files you previously
              exported or shared remain under your control; export anything you want to keep before
              continuing.
            </p>
          </div>
          <form onSubmit={submit} className="account-form" aria-busy={busy}>
            <label htmlFor="email">Account email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy}
            />
            <label htmlFor="password">Current password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={busy}
            />
            <p>
              <a href="/recover-account">Forgot your password?</a>
            </p>
            <label htmlFor="confirmation">Type DELETE to confirm permanent deletion</label>
            <input
              id="confirmation"
              autoComplete="off"
              required
              pattern="DELETE"
              maxLength={6}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={busy}
              aria-describedby="deletion-detail"
            />
            <p id="deletion-detail">Only the account matching these credentials will be deleted.</p>
            <button className="danger" type="submit" disabled={busy || confirmation !== 'DELETE'}>
              {busy ? 'Deleting…' : 'Permanently delete my account'}
            </button>
          </form>
        </>
      )}
      <p role="status" aria-live="polite">
        {message}
      </p>
      <p>
        <a href="/privacy">Read the privacy policy</a> · <a href="/support">Get help</a>
      </p>
    </>
  );
}
