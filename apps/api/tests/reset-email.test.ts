import { describe, expect, it } from 'vitest';
import { passwordResetEmail } from '../src/services/reset-email';

describe('password recovery email', () => {
  it('uses a button without displaying the reset URL in HTML', () => {
    const link = 'https://example.test/reset-password#token=preview-only';
    const message = passwordResetEmail(link);
    expect(message.html).toContain(`href="${link}"`);
    expect(message.html).toContain('Reset password</a>');
    expect(message.html.replace(/<[^>]*>/g, '')).not.toContain(link);
    expect(message.text).toContain(link);
    expect(message.html).toContain('30 minutes');
  });

  it('escapes link attributes and rejects non-web schemes', () => {
    expect(passwordResetEmail('https://example.test/reset?a=1&b=2').html).toContain('a=1&amp;b=2');
    expect(() => passwordResetEmail('file:///reset')).toThrow('Invalid reset URL');
  });
});
