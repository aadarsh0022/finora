import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { welcomeEmail } from '../src/services/welcome-email';
import * as email from '../src/services/email';
import { dispatch } from '../src/router';
import { call, clearDatabase, password, setupDatabase, teardownDatabase } from './setup';

beforeAll(setupDatabase);
beforeEach(clearDatabase);
afterAll(teardownDatabase);

describe('welcome email', () => {
  it('schedules delivery after the signup response', async () => {
    const tasks: Array<() => Promise<void>> = [];
    const send = vi.spyOn(email, 'sendWelcomeEmail').mockResolvedValue();
    try {
      const response = await dispatch(
        new Request('http://localhost:3000/api/v1/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Sam', email: 'deferred@example.test', password }),
        }),
        (task) => {
          tasks.push(task);
        },
      );
      expect(response.status).toBe(201);
      expect(send).not.toHaveBeenCalled();
      expect(tasks).toHaveLength(1);
      await tasks[0]!();
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      send.mockRestore();
    }
  });
  it('personalizes the first name and safely escapes HTML', () => {
    const message = welcomeEmail('<Sam> Example', 'https://example.test');
    expect(message.html).toContain('Hi &lt;Sam&gt;,');
    expect(message.html).not.toContain('Hi <Sam>');
    expect(message.html).not.toContain('Example');
    expect(message.html).toContain('https://example.test/support');
    expect(message.text).toContain('Hi <Sam>,');
    expect(welcomeEmail(' ', 'https://example.test').html).toContain('Hi there,');
  });

  it('sends only after first successful registration, not duplicates or logins', async () => {
    const send = vi.spyOn(email, 'sendWelcomeEmail').mockResolvedValue();
    try {
      const input = { name: 'Sam Example', email: 'welcome@example.test', password };
      expect((await call('POST', 'auth/register', input)).status).toBe(201);
      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith(input.email, input.name, expect.any(String));
      expect((await call('POST', 'auth/register', input)).status).toBe(409);
      expect((await call('POST', 'auth/login', { email: input.email, password })).status).toBe(200);
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      send.mockRestore();
    }
  });

  it('does not fail signup or log personal data when delivery fails', async () => {
    const send = vi
      .spyOn(email, 'sendWelcomeEmail')
      .mockRejectedValue(new Error('provider failed'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(
        (
          await call('POST', 'auth/register', {
            name: 'Sam',
            email: 'failure@example.test',
            password,
          })
        ).status,
      ).toBe(201);
      expect(log).toHaveBeenCalledTimes(1);
      const metadata = JSON.parse(String(log.mock.calls[0]?.[0])) as Record<string, unknown>;
      expect(Object.keys(metadata).sort()).toEqual(['code', 'level', 'requestId']);
      expect(metadata.code).toBe('WELCOME_DELIVERY_FAILED');
    } finally {
      send.mockRestore();
      log.mockRestore();
    }
  });
});
