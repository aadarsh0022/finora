'use client';

import { forgotPasswordSchema } from '@finora/contracts';
import { useRef, useState, type FormEvent } from 'react';

export default function RecoverAccount() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const input = forgotPasswordSchema.safeParse({ email });
    if (!input.success) {
      setMessage('Enter a valid email address.');
      return;
    }
    pending.current = true;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input.data),
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error();
      setMessage(
        'If an account exists, a recovery email has been sent. Check your inbox and spam folder. The link expires in 30 minutes.',
      );
      setEmail('');
    } catch {
      setMessage(
        'Recovery is temporarily unavailable or too many requests were made. Please try again later.',
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <h1>Recover your Walleto account</h1>
      <p>
        Request a password reset to access or delete your account. We never ask you to email your
        password.
      </p>
      <form onSubmit={submit} className="account-form" aria-busy={busy}>
        <label htmlFor="email">Account email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={busy}
        />
        <button type="submit" disabled={busy}>
          {busy ? 'Requesting…' : 'Send recovery link'}
        </button>
      </form>
      <p role="status">{message}</p>
      <p>
        <a href="/delete-account">Back to account deletion</a>
      </p>
    </>
  );
}
